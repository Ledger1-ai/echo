import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { getAuthenticatedWallet } from "@/lib/auth";

async function isOwner(req: NextRequest) {
  const owner = (process.env.NEXT_PUBLIC_OWNER_WALLET || "").toLowerCase();
  const authed = await getAuthenticatedWallet(req);
  const header = String(req.headers.get('x-wallet') || '').toLowerCase();
  const w = (authed || header || '').toLowerCase();
  return !!owner && w === owner;
}

function toHMS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return { h, m, s: sec, text: `${h}h ${m}m ${sec}s` };
}

export async function GET(req: NextRequest) {
  if (!(await isOwner(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const container = await getContainer();
    // Aggregate balances per wallet - only real usage/purchase events with defined wallet
    const eventsQuery = {
      query: "SELECT c.wallet, c.type, c.seconds FROM c WHERE IS_DEFINED(c.wallet) AND (c.type = 'purchase' OR c.type = 'usage')",
      parameters: [],
    } as { query: string; parameters: { name: string; value: string }[] };
    const { resources: evts } = await container.items.query(eventsQuery).fetchAll();
    const map = new Map<string, { purchased: number; used: number }>();
    for (const r of evts as any[]) {
      const w = String(r.wallet || '').toLowerCase();
      // Keep only valid EVM wallets to avoid pulling in config/system docs
      if (!/^0x[a-f0-9]{40}$/.test(w)) continue;
      const m = map.get(w) || { purchased: 0, used: 0 };
      if (r.type === 'purchase') m.purchased += Number(r.seconds || 0);
      if (r.type === 'usage') m.used += Number(r.seconds || 0);
      map.set(w, m);
    }
    // Fetch user docs for xp and plan + metadata used for display
    const usersQuery = { query: "SELECT c.wallet, c.xp, c.usedSeconds, c.purchasedSeconds, c.metrics, c.plan, c.planExpiry, c.displayName, c.pfpUrl, c.lastSeen FROM c WHERE c.type = 'user' AND IS_DEFINED(c.wallet)", parameters: [] } as { query: string; parameters: { name: string; value: string }[] };
    const { resources: uds } = await container.items.query(usersQuery).fetchAll();
    const udMap = new Map<string, any>();
    for (const u of uds as any[]) {
      const w = String(u.wallet||'').toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(w)) continue;
      udMap.set(w, u);
    }
    // Union of wallets from events (purchase/usage) and all user docs
    const walletSet = new Set<string>();
    for (const w of map.keys()) walletSet.add(w);
    for (const w of udMap.keys()) walletSet.add(w);
    const users = Array.from(walletSet.values()).map((wallet) => {
      const agg = map.get(wallet) || { purchased: 0, used: 0 };
      const ud = udMap.get(wallet) || {};
      // Purchased seconds are a credit ledger — prefer user doc if present (reflects immediate grants), else fall back to aggregated events
      const purchased = typeof ud?.purchasedSeconds === 'number' ? Number(ud.purchasedSeconds || 0) : Number(agg.purchased || 0);
      // For usedSeconds (a stat), prefer the user doc value if present to reflect migrations/recomputes
      const used = typeof ud?.usedSeconds === 'number' ? Number(ud.usedSeconds || 0) : Number(agg.used || 0);

      const balance = Math.max(0, purchased - used);
      return {
        wallet,
        purchasedSeconds: purchased,
        usedSeconds: used,
        balanceSeconds: balance,
        purchasedHMS: toHMS(purchased),
        usedHMS: toHMS(used),
        balanceHMS: toHMS(balance),
        xp: Number(ud?.xp || 0),
        plan: ud?.plan || null,
        planExpiry: ud?.planExpiry || null,
        displayName: typeof ud?.displayName === 'string' ? ud.displayName : undefined,
        pfpUrl: typeof ud?.pfpUrl === 'string' ? ud.pfpUrl : undefined,
        lastSeen: typeof ud?.lastSeen === 'number' ? ud.lastSeen : undefined,
      };
    });
    return NextResponse.json({ users });
  } catch (e: any) {
    return NextResponse.json({ users: [], degraded: true, reason: e?.message || 'cosmos_unavailable' });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isOwner(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const body = await req.json().catch(()=>({}));
    const wallet = String(body.wallet || '').toLowerCase();
    const action = String(body.action || 'grant');
    const container = await getContainer();
    // Validate wallet only for actions that directly target a single wallet payload
    const needsWallet = action === 'grant' || action === 'deduct' || action === 'plan' || action === 'recompute_user' || action === 'set_xp' || action === 'set_user';
    if (needsWallet && !/^0x[a-f0-9]{40}$/i.test(wallet)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    if (action === 'grant') {
      const seconds = Number(body.seconds || 0);
      if (seconds <= 0) return NextResponse.json({ error: 'invalid' }, { status: 400 });
      const evt = { id: `${wallet}:grant:${Date.now()}`, type: 'purchase', wallet, seconds, ts: Date.now() };
      await container.items.upsert(evt as any);
      // Update or upsert user aggregate for purchased seconds
      const id = `${wallet}:user`;
      let doc: any;
      try { const { resource } = await container.item(id, wallet).read<any>(); doc = resource || { id, type: 'user', wallet, firstSeen: Date.now() }; } catch { doc = { id, type: 'user', wallet, firstSeen: Date.now() }; }
      const used = Number(doc?.usedSeconds || 0);
      const purchased = Number(doc?.purchasedSeconds || 0) + seconds;
      const xp = Number(doc?.xp || 0);
      await container.items.upsert({ ...doc, purchasedSeconds: purchased, usedSeconds: used, xp, lastSeen: Date.now() });
      return NextResponse.json({ ok: true });
    }
    if (action === 'deduct') {
      const secondsReq = Number(body.seconds || 0);
      if (secondsReq <= 0) return NextResponse.json({ error: 'invalid' }, { status: 400 });

      // Determine current balance from events to cap deduction so balance never goes negative
      let purchasedEv = 0, usedEv = 0;
      try {
        const qPurch = { query: "SELECT VALUE SUM(c.seconds) FROM c WHERE LOWER(c.wallet)=@wLower AND c.type='purchase'", parameters: [{ name: "@wLower", value: wallet }] } as any;
        const qUsed = { query: "SELECT VALUE SUM(c.seconds) FROM c WHERE LOWER(c.wallet)=@wLower AND c.type='usage'", parameters: [{ name: "@wLower", value: wallet }] } as any;
        const [{ resources: rp }, { resources: ru }] = await Promise.all([
          container.items.query(qPurch, { partitionKey: wallet }).fetchAll(),
          container.items.query(qUsed, { partitionKey: wallet }).fetchAll(),
        ]);
        purchasedEv = Number((rp && rp[0]) || 0);
        usedEv = Number((ru && ru[0]) || 0);
      } catch {}
      const balanceEv = Math.max(0, purchasedEv - usedEv);
      const allowed = Math.min(secondsReq, balanceEv);
      if (allowed <= 0) {
        // No available balance to deduct; keep state consistent and return ok
        const id = `${wallet}:user`;
        let doc: any;
        try { const { resource } = await container.item(id, wallet).read<any>(); doc = resource || { id, type: 'user', wallet, firstSeen: Date.now() }; } catch { doc = { id, type: 'user', wallet, firstSeen: Date.now() }; }
        await container.items.upsert({ ...doc, lastSeen: Date.now() });
        return NextResponse.json({ ok: true, deductedSeconds: 0 });
      }

      // Record a negative purchase to reflect credit removal without affecting usedSeconds
      const evt = { id: `${wallet}:deduct:${Date.now()}`, type: 'purchase', wallet, seconds: -allowed, ts: Date.now() };
      await container.items.upsert(evt as any);

      // Update or upsert user aggregate for purchased seconds only (usedSeconds unchanged)
      const id = `${wallet}:user`;
      let doc: any;
      try { const { resource } = await container.item(id, wallet).read<any>(); doc = resource || { id, type: 'user', wallet, firstSeen: Date.now() }; } catch { doc = { id, type: 'user', wallet, firstSeen: Date.now() }; }

      // Recompute purchased from events (after recording negative purchase) to keep doc in sync
      let purchAfter = 0;
      try {
        const { resources: rpa } = await container.items.query({
          query: "SELECT VALUE SUM(c.seconds) FROM c WHERE LOWER(c.wallet)=@wLower AND c.type='purchase'",
          parameters: [{ name: "@wLower", value: wallet }]
        } as any).fetchAll();
        purchAfter = Number((rpa && rpa[0]) || 0);
      } catch {}

      const used = Number(doc?.usedSeconds || 0);
      const xp = Number(doc?.xp || 0);
      await container.items.upsert({ ...doc, purchasedSeconds: Math.max(0, purchAfter), usedSeconds: used, xp, lastSeen: Date.now() });
      return NextResponse.json({ ok: true, deductedSeconds: allowed });
    }
    if (action === 'migrate') {
      const fromWallet = String(body.fromWallet || '').toLowerCase();
      const toWallet = String(body.toWallet || '').toLowerCase();
      const seconds = Number(body.seconds || 0);
      if (!/^0x[a-f0-9]{40}$/i.test(fromWallet) || !/^0x[a-f0-9]{40}$/i.test(toWallet)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
      if (fromWallet === toWallet) return NextResponse.json({ error: 'same_wallet' }, { status: 400 });
      if (seconds <= 0) return NextResponse.json({ error: 'invalid' }, { status: 400 });
      const ts = Date.now();
      const usageEvt = { id: `${fromWallet}:migrate_out:${ts}`, type: 'usage', wallet: fromWallet, seconds, ts };
      const purchaseEvt = { id: `${toWallet}:migrate_in:${ts}`, type: 'purchase', wallet: toWallet, seconds, ts };
      await container.items.upsert(usageEvt as any);
      await container.items.upsert(purchaseEvt as any);

      // Update aggregates for both users to keep metrics consistent
      const fromId = `${fromWallet}:user`;
      let fromDoc: any;
      try { const { resource } = await container.item(fromId, fromWallet).read<any>(); fromDoc = resource || { id: fromId, type: 'user', wallet: fromWallet, firstSeen: Date.now() }; } catch { fromDoc = { id: fromId, type: 'user', wallet: fromWallet, firstSeen: Date.now() }; }
      const fromUsed = Number(fromDoc?.usedSeconds || 0) + seconds;
      const fromPurchased = Number(fromDoc?.purchasedSeconds || 0);
      const fromXp = Number(fromDoc?.xp || 0);
      await container.items.upsert({ ...fromDoc, usedSeconds: fromUsed, purchasedSeconds: fromPurchased, xp: fromXp, lastSeen: Date.now() });

      const toId = `${toWallet}:user`;
      let toDoc: any;
      try { const { resource } = await container.item(toId, toWallet).read<any>(); toDoc = resource || { id: toId, type: 'user', wallet: toWallet, firstSeen: Date.now() }; } catch { toDoc = { id: toId, type: 'user', wallet: toWallet, firstSeen: Date.now() }; }
      const toUsed = Number(toDoc?.usedSeconds || 0);
      const toPurchased = Number(toDoc?.purchasedSeconds || 0) + seconds;
      const toXp = Number(toDoc?.xp || 0);
      await container.items.upsert({ ...toDoc, usedSeconds: toUsed, purchasedSeconds: toPurchased, xp: toXp, lastSeen: Date.now() });

      return NextResponse.json({ ok: true });
    }
    if (action === 'migrate_stats') {
      const fromWallet = String(body.fromWallet || "").toLowerCase();
      const toWallet = String(body.toWallet || "").toLowerCase();
      if (!/^0x[a-f0-9]{40}$/i.test(fromWallet) || !/^0x[a-f0-9]{40}$/i.test(toWallet)) return NextResponse.json({ error: "invalid" }, { status: 400 });
      if (fromWallet === toWallet) return NextResponse.json({ error: "same_wallet" }, { status: 400 });
      const now = Date.now();

      // Options: which stats to migrate and whether to wipe them from source
      const opt = {
        xp: body?.migrateOptions?.xp !== false,
        usedSeconds: body?.migrateOptions?.usedSeconds !== false,
        domains: body?.migrateOptions?.domains !== false,
        languages: body?.migrateOptions?.languages !== false,
        platforms: body?.migrateOptions?.platforms !== false,
        topics: body?.migrateOptions?.topics !== false,
        displayName: body?.migrateOptions?.displayName !== false,
        pfpUrl: body?.migrateOptions?.pfpUrl !== false,
        wipeSourceSelected: body?.migrateOptions?.wipeSourceSelected !== false,
      };

      // Read source and target user docs
      let fromDoc: any;
      let toDoc: any;
      try {
        const { resource } = await container.item(`${fromWallet}:user`, fromWallet).read<any>();
        fromDoc = resource || { id: `${fromWallet}:user`, type: "user", wallet: fromWallet, firstSeen: now };
      } catch {
        fromDoc = { id: `${fromWallet}:user`, type: "user", wallet: fromWallet, firstSeen: now };
      }
      try {
        const { resource } = await container.item(`${toWallet}:user`, toWallet).read<any>();
        toDoc = resource || { id: `${toWallet}:user`, type: "user", wallet: toWallet, firstSeen: now };
      } catch {
        toDoc = { id: `${toWallet}:user`, type: "user", wallet: toWallet, firstSeen: now };
      }

      // Merge core tracked stats: XP and usedSeconds (do not move purchasedSeconds here to avoid double-counting credits)
      const fromXp = Number(fromDoc?.xp || 0);
      const toXp = Number(toDoc?.xp || 0);
      // Compute current usedSeconds using doc value when present, otherwise aggregate usage events
      const qFromUsage = { query: "SELECT VALUE SUM(c.seconds) FROM c WHERE LOWER(c.wallet)=@wLower AND c.type='usage'", parameters: [{ name: "@wLower", value: fromWallet }] } as any;
      const qToUsage = { query: "SELECT VALUE SUM(c.seconds) FROM c WHERE LOWER(c.wallet)=@wLower AND c.type='usage'", parameters: [{ name: "@wLower", value: toWallet }] } as any;
      let usedFromEv = 0, usedToEv = 0;
      try {
        const [{ resources: rf }, { resources: rt }] = await Promise.all([
          container.items.query(qFromUsage, { partitionKey: fromWallet }).fetchAll(),
          container.items.query(qToUsage, { partitionKey: toWallet }).fetchAll()
        ]);
        usedFromEv = Number((rf && rf[0]) || 0);
        usedToEv = Number((rt && rt[0]) || 0);
      } catch {}
      const fromUsed = typeof fromDoc?.usedSeconds === "number" ? Number(fromDoc.usedSeconds || 0) : usedFromEv;
      const toUsed = typeof toDoc?.usedSeconds === "number" ? Number(toDoc.usedSeconds || 0) : usedToEv;

      // Merge metrics maps (domains/languages/platforms/topics) by summing counts
      const fm = (fromDoc?.metrics || {}) as any;
      const tm = (toDoc?.metrics || {}) as any;
      const sumObj = (a?: Record<string, number>, b?: Record<string, number>) => {
        const out: Record<string, number> = { ...(a || {}) };
        for (const [k, v] of Object.entries(b || {})) out[k] = Number(out[k] || 0) + Number(v || 0);
        return out;
      };
      const mergedMetrics: any = { ...(tm || {}) };
      if (opt.domains) mergedMetrics.domains = sumObj(tm?.domains, fm?.domains);
      if (!opt.domains && typeof tm?.domains !== "undefined") mergedMetrics.domains = tm.domains;
      if (opt.languages) mergedMetrics.languages = sumObj(tm?.languages, fm?.languages);
      if (!opt.languages && typeof tm?.languages !== "undefined") mergedMetrics.languages = tm.languages;
      if (opt.platforms) mergedMetrics.platforms = sumObj(tm?.platforms, fm?.platforms);
      if (!opt.platforms && typeof tm?.platforms !== "undefined") mergedMetrics.platforms = tm.platforms;
      if (opt.topics) mergedMetrics.topics = sumObj(tm?.topics, fm?.topics);
      if (!opt.topics && typeof tm?.topics !== "undefined") mergedMetrics.topics = tm.topics;

      const merged: any = {
        ...toDoc,
        id: `${toWallet}:user`,
        type: "user",
        wallet: toWallet,
        xp: opt.xp ? (toXp + fromXp) : toXp,
        usedSeconds: opt.usedSeconds ? (toUsed + fromUsed) : toUsed,
        // keep purchasedSeconds as-is to avoid interfering with credits; migrate credits via 'migrate' action
        displayName: opt.displayName
          ? (typeof toDoc?.displayName === "string" ? toDoc.displayName : (typeof fromDoc?.displayName === "string" ? fromDoc.displayName : undefined))
          : (typeof toDoc?.displayName === "string" ? toDoc.displayName : undefined),
        pfpUrl: opt.pfpUrl
          ? (typeof toDoc?.pfpUrl === "string" ? toDoc.pfpUrl : (typeof fromDoc?.pfpUrl === "string" ? fromDoc.pfpUrl : undefined))
          : (typeof toDoc?.pfpUrl === "string" ? toDoc.pfpUrl : undefined),
        metrics: mergedMetrics,
        firstSeen: Math.min(Number(toDoc?.firstSeen || now), Number(fromDoc?.firstSeen || now)),
        lastSeen: Math.max(Number(toDoc?.lastSeen || 0), Number(fromDoc?.lastSeen || 0), now),
      };

      // Prefer the most favorable plan/expiry from either user
      const fromPlan = fromDoc?.plan || undefined;
      const toPlan = toDoc?.plan || undefined;
      const fromExp = Number(fromDoc?.planExpiry || 0);
      const toExp = Number(toDoc?.planExpiry || 0);
      if (fromPlan && (!toPlan || fromExp > toExp)) {
        merged.plan = fromPlan;
        merged.planExpiry = fromExp > 0 ? fromExp : undefined;
      }

      await container.items.upsert(merged);

      // Archive/reset source profile: wipe selected stats to prevent double-counting
      const archivedMetrics: any = { ...(fromDoc?.metrics || {}) };
      if (opt.domains && opt.wipeSourceSelected) archivedMetrics.domains = {};
      if (opt.languages && opt.wipeSourceSelected) archivedMetrics.languages = {};
      if (opt.platforms && opt.wipeSourceSelected) archivedMetrics.platforms = {};
      if (opt.topics && opt.wipeSourceSelected) archivedMetrics.topics = {};

      const archived: any = {
        ...fromDoc,
        xp: opt.wipeSourceSelected && opt.xp ? 0 : Number(fromDoc?.xp || 0),
        usedSeconds: opt.wipeSourceSelected && opt.usedSeconds ? 0 : fromUsed,
        metrics: opt.wipeSourceSelected ? archivedMetrics : (fromDoc?.metrics || {}),
        displayName: opt.wipeSourceSelected && opt.displayName ? undefined : (typeof fromDoc?.displayName === "string" ? fromDoc.displayName : undefined),
        pfpUrl: opt.wipeSourceSelected && opt.pfpUrl ? undefined : (typeof fromDoc?.pfpUrl === "string" ? fromDoc.pfpUrl : undefined),
        // Wipe plan if requested wipe to keep entitlements clean after migration
        plan: opt.wipeSourceSelected ? undefined : fromDoc?.plan,
        planExpiry: opt.wipeSourceSelected ? undefined : fromDoc?.planExpiry,
        lastSeen: now,
      };
      await container.items.upsert(archived);

      return NextResponse.json({ ok: true, migrateOptions: opt });
    }
    if (action === 'recompute_user') {
      const target = String(body.wallet || '').toLowerCase();
      if (!/^0x[a-f0-9]{40}$/i.test(target)) return NextResponse.json({ error: 'invalid' }, { status: 400 });

      // Aggregate purchase/usage events
      const qEv = { query: "SELECT c.type, c.seconds FROM c WHERE LOWER(c.wallet) = @wLower AND (c.type='purchase' OR c.type='usage')", parameters: [{ name: "@wLower", value: target }] } as any;
      const { resources: evs } = await container.items.query(qEv, { partitionKey: target }).fetchAll();
      let purchased = 0, used = 0;
      for (const r of (evs || []) as any[]) {
        if (r.type === 'purchase') purchased += Number(r.seconds || 0);
        else if (r.type === 'usage') used += Number(r.seconds || 0);
      }

      // Aggregate session summaries: xpBonus and durationSeconds
      let xpBonusSum = 0;
      let summarizedSeconds = 0;
      try {
        const qXp = { query: "SELECT VALUE SUM(c.xpBonus) FROM c WHERE c.type='session_summary' AND LOWER(c.wallet)=@wLower", parameters: [{ name: "@wLower", value: target }] } as any;
        const qDur = { query: "SELECT VALUE SUM(c.durationSeconds) FROM c WHERE c.type='session_summary' AND LOWER(c.wallet)=@wLower", parameters: [{ name: "@wLower", value: target }] } as any;
        const [{ resources: rx }, { resources: rd }] = await Promise.all([
          container.items.query(qXp).fetchAll(),
          container.items.query(qDur).fetchAll(),
        ]);
        xpBonusSum = Number((rx && rx[0]) || 0);
        summarizedSeconds = Number((rd && rd[0]) || 0);
      } catch {}

      // If usage exceeds summarized duration, grant baseline XP for the gap (2 XP per 5 minutes)
      const gap = Math.max(0, used - summarizedSeconds);
      const xpFromGap = Math.floor(Math.max(0, gap) / 300) * 2;

      const id = `${target}:user`;
      let doc: any;
      try { const { resource } = await container.item(id, target).read<any>(); doc = resource || { id, type: 'user', wallet: target, firstSeen: Date.now() }; } catch { doc = { id, type: 'user', wallet: target, firstSeen: Date.now() }; }

      const forceXp = body.forceXp === true;
      const recomputedXp = xpBonusSum + xpFromGap;
      const nextXp = forceXp ? recomputedXp : (typeof doc?.xp === 'number' ? doc.xp : recomputedXp);

      const next = { ...doc, purchasedSeconds: purchased, usedSeconds: used, xp: nextXp, lastSeen: Date.now(), metrics: doc?.metrics || {} };
      await container.items.upsert(next);
      return NextResponse.json({ ok: true, wallet: target, purchasedSeconds: purchased, usedSeconds: used, xp: nextXp, xpBonusSum, summarizedSeconds, xpFromGap });
    }
    if (action === 'recompute_all') {
      // Aggregate purchase/usage events for all wallets
      const q = { query: "SELECT c.wallet, c.type, c.seconds FROM c WHERE IS_DEFINED(c.wallet) AND (c.type='purchase' OR c.type='usage')", parameters: [] } as any;
      const { resources } = await container.items.query(q).fetchAll();
      const map = new Map<string, { purchased: number; used: number }>();
      for (const r of (resources || []) as any[]) {
        const w = String(r.wallet || '').toLowerCase();
        if (!/^0x[a-f0-9]{40}$/i.test(w)) continue;
        const m = map.get(w) || { purchased: 0, used: 0 };
        if (r.type === 'purchase') m.purchased += Number(r.seconds || 0);
        else if (r.type === 'usage') m.used += Number(r.seconds || 0);
        map.set(w, m);
      }
      const forceXp = body.forceXp === true;
      let updated = 0;

      for (const [w, m] of map.entries()) {
        // Aggregate session summaries for this wallet
        let xpBonusSum = 0;
        let summarizedSeconds = 0;
        try {
          const qXp = { query: "SELECT VALUE SUM(c.xpBonus) FROM c WHERE c.type='session_summary' AND LOWER(c.wallet)=@wLower", parameters: [{ name: "@wLower", value: w }] } as any;
          const qDur = { query: "SELECT VALUE SUM(c.durationSeconds) FROM c WHERE c.type='session_summary' AND LOWER(c.wallet)=@wLower", parameters: [{ name: "@wLower", value: w }] } as any;
          const [{ resources: rx }, { resources: rd }] = await Promise.all([
            container.items.query(qXp).fetchAll(),
            container.items.query(qDur).fetchAll(),
          ]);
          xpBonusSum = Number((rx && rx[0]) || 0);
          summarizedSeconds = Number((rd && rd[0]) || 0);
        } catch {}

        const used = Number(m.used || 0);
        const gap = Math.max(0, used - summarizedSeconds);
        const xpFromGap = Math.floor(Math.max(0, gap) / 300) * 2;
        const recomputedXp = xpBonusSum + xpFromGap;

        const id = `${w}:user`;
        let doc: any;
        try { const { resource } = await container.item(id, w).read<any>(); doc = resource || { id, type: 'user', wallet: w, firstSeen: Date.now() }; } catch { doc = { id, type: 'user', wallet: w, firstSeen: Date.now() }; }

        const nextXp = forceXp ? recomputedXp : (typeof doc?.xp === 'number' ? doc.xp : recomputedXp);
        const next = { ...doc, purchasedSeconds: Number(m.purchased || 0), usedSeconds: used, xp: nextXp, lastSeen: Date.now(), metrics: doc?.metrics || {} };
        await container.items.upsert(next);
        updated++;
      }
      return NextResponse.json({ ok: true, updated });
    }
    if (action === 'set_user') {
      // Direct user mutation: give full control to edit user aggregates and metadata
      // Input (optional fields): purchasedSeconds, usedSeconds, xp, displayName, pfpUrl, metrics (object),
      // plan ('none'|'basic'|'unlimited'), planExpiry (epoch ms)
      const id = `${wallet}:user`;
      let doc: any;
      try {
        const { resource } = await container.item(id, wallet).read<any>();
        doc = resource || { id, type: 'user', wallet, firstSeen: Date.now() };
      } catch {
        doc = { id, type: 'user', wallet, firstSeen: Date.now() };
      }

      const purchasedSeconds = Object.prototype.hasOwnProperty.call(body, "purchasedSeconds")
        ? Math.max(0, Number(body.purchasedSeconds || 0))
        : Math.max(0, Number(doc?.purchasedSeconds || 0));

      const usedSeconds = Object.prototype.hasOwnProperty.call(body, "usedSeconds")
        ? Math.max(0, Number(body.usedSeconds || 0))
        : Math.max(0, Number(doc?.usedSeconds || 0));

      const xp = Object.prototype.hasOwnProperty.call(body, "xp")
        ? Math.max(0, Math.floor(Number(body.xp || 0)))
        : Math.max(0, Math.floor(Number(doc?.xp || 0)));

      const displayName = typeof body.displayName === "string"
        ? body.displayName
        : (typeof doc?.displayName === "string" ? doc.displayName : undefined);

      const pfpUrl = typeof body.pfpUrl === "string"
        ? body.pfpUrl
        : (typeof doc?.pfpUrl === "string" ? doc.pfpUrl : undefined);

      const metrics = (body.metrics && typeof body.metrics === "object")
        ? body.metrics
        : (doc?.metrics || {});

      // Plan editing: 'none' clears plan/expiry; otherwise keep/override
      let plan: "basic" | "unlimited" | undefined = doc?.plan;
      let planExpiry: number | undefined = doc?.planExpiry;
      if (body.plan === "none") {
        plan = undefined;
        planExpiry = undefined;
      } else if (body.plan === "basic" || body.plan === "unlimited") {
        plan = body.plan;
        if (typeof body.planExpiry === "number" && body.planExpiry > 0) {
          planExpiry = body.planExpiry;
        }
      } else if (typeof body.planExpiry === "number" && body.planExpiry > 0) {
        // If only planExpiry provided, keep existing plan and override expiry
        planExpiry = body.planExpiry;
      }

      const next = {
        ...doc,
        id,
        type: "user",
        wallet,
        purchasedSeconds,
        usedSeconds,
        xp,
        displayName,
        pfpUrl,
        metrics,
        plan,
        planExpiry,
        lastSeen: Date.now(),
      };
      await container.items.upsert(next);
      return NextResponse.json({
        ok: true,
        wallet,
        purchasedSeconds,
        usedSeconds,
        xp,
        displayName,
        pfpUrl,
        plan: plan || "none",
        planExpiry,
      });
    }

    if (action === 'set_xp') {
      const xp = Math.max(0, Math.floor(Number(body.xp || 0)));
      const id = `${wallet}:user`;
      let doc: any;
      try { const { resource } = await container.item(id, wallet).read<any>(); doc = resource || { id, type: 'user', wallet, firstSeen: Date.now() }; } catch { doc = { id, type: 'user', wallet, firstSeen: Date.now() }; }
      const next = { ...doc, xp, lastSeen: Date.now() };
      await container.items.upsert(next);
      return NextResponse.json({ ok: true, wallet, xp });
    }
    if (action === 'plan') {
      const plan = body.plan === 'basic' || body.plan === 'unlimited' ? body.plan : (body.plan === 'none' ? 'none' : null);
      if (!plan) return NextResponse.json({ error: 'invalid plan' }, { status: 400 });
      const months = Number(body.months || 1);
      const id = `${wallet}:user`;
      let doc: any;
      try { const { resource } = await container.item(id, wallet).read<any>(); doc = resource || { id, type: 'user', wallet }; } catch { doc = { id, type: 'user', wallet, firstSeen: Date.now() }; }
      const now = Date.now();
      let planExpiry = 0;
      if (plan !== 'none') planExpiry = now + months * 30 * 24 * 60 * 60 * 1000;
      const next = { ...doc, plan: plan === 'none' ? undefined : plan, planExpiry: plan === 'none' ? undefined : planExpiry, lastSeen: now };
      await container.items.upsert(next);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: true, degraded: true, reason: e?.message || 'cosmos_unavailable' });
  }
}
