import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

export async function GET(_req: NextRequest) {
  try {
    const c = await getContainer();
    const now = Date.now();
    const since24h = now - 24 * 60 * 60 * 1000;
    const since7d = now - 7 * 24 * 60 * 60 * 1000;
    // Total users
    let totalUsers = 0;
    try {
      const qU = { query: "SELECT VALUE COUNT(1) FROM c WHERE c.type='user'", parameters: [] } as any;
      const { resources } = await c.items.query(qU).fetchAll();
      totalUsers = Number((resources && resources[0]) || 0);
    } catch {}

    // Session summaries → count and sum (all-time)
    let sessionsCount = 0;
    let sessionsTotalSeconds = 0;
    try {
      const qCnt = { query: "SELECT VALUE COUNT(1) FROM c WHERE c.type='session_summary'", parameters: [] } as any;
      const qSum = { query: "SELECT VALUE SUM(c.durationSeconds) FROM c WHERE c.type='session_summary'", parameters: [] } as any;
      const [{ resources: rc }, { resources: rs }] = await Promise.all([
        c.items.query(qCnt).fetchAll(),
        c.items.query(qSum).fetchAll(),
      ]);
      sessionsCount = Number((rc && rc[0]) || 0);
      sessionsTotalSeconds = Number((rs && rs[0]) || 0);
    } catch {}

    // Total session time from usage events (all-time) — simple aggregation of all usage seconds
    let totalSecondsAllTimeUsageEvents = 0;
    try {
      const qUsage = { query: "SELECT VALUE SUM(c.seconds) FROM c WHERE c.type='usage'", parameters: [] } as any;
      const { resources } = await c.items.query(qUsage).fetchAll();
      totalSecondsAllTimeUsageEvents = Number((resources && resources[0]) || 0);
    } catch {}

    // Historical total session time from user aggregates (all-time)
    let totalSecondsAllTime = 0;
    try {
      const qUserUsed = { query: "SELECT VALUE SUM(c.usedSeconds) FROM c WHERE c.type='user' AND IS_DEFINED(c.usedSeconds)", parameters: [] } as any;
      const { resources } = await c.items.query(qUserUsed).fetchAll();
      totalSecondsAllTime = Number((resources && resources[0]) || 0);
    } catch {}

    // Live now: active users and total live seconds across currently live sessions
    let activeNowCount = 0;
    let totalLiveSecondsNow = 0;
    try {
      const cutoff = now - 120_000; // last heartbeat within 2 minutes counts as live
      const qLive = { query: "SELECT c.liveSince, c.lastHeartbeat FROM c WHERE c.type='user' AND c.live = true AND c.spacePublic = true AND c.lastHeartbeat > @cutoff", parameters: [{ name: "@cutoff", value: cutoff }] } as any;
      const { resources } = await c.items.query(qLive).fetchAll();
      activeNowCount = (resources || []).length;
      for (const u of (resources || [])) {
        const ls = Number(u?.liveSince || 0);
        if (Number.isFinite(ls) && ls > 0 && ls <= now) totalLiveSecondsNow += Math.max(0, Math.floor((now - ls) / 1000));
      }
    } catch {}

    // Top domain / language / platform / topic: prefer session summaries; fallback to user.metrics
    let topDomain = '';
    let topLanguage = '';
    let topPlatform = '';
    let topTopic = '';
    try {
      const qSummaries = { query: "SELECT c.domain, c.languages, c.platform, c.topics FROM c WHERE c.type='session_summary'", parameters: [] } as any;
      const { resources } = await c.items.query(qSummaries).fetchAll();
      const domainCounts: Record<string, number> = {};
      const langCounts: Record<string, number> = {};
      const platformCounts: Record<string, number> = {};
      const topicCounts: Record<string, number> = {};
      for (const r of (resources || [])) {
        const dom = typeof (r?.domain) === 'string' ? String(r.domain).trim() : '';
        if (dom && !/^(auto)$/i.test(dom)) domainCounts[dom] = (domainCounts[dom] || 0) + 1;
        const langs: string[] = Array.isArray(r?.languages) ? (r.languages as string[]) : [];
        for (const l of langs) {
          const lv = String(l || '').trim();
          if (lv) langCounts[lv] = (langCounts[lv] || 0) + 1;
        }
        const plat = typeof (r?.platform) === 'string' ? String(r.platform).trim() : '';
        if (plat) platformCounts[plat] = (platformCounts[plat] || 0) + 1;
        const topicsArr: string[] = Array.isArray(r?.topics) ? (r.topics as string[]) : [];
        for (const t of topicsArr) {
          const tv = String(t || '').trim();
          if (tv && tv.length >= 2) topicCounts[tv] = (topicCounts[tv] || 0) + 1;
        }
      }
      topDomain = Object.entries(domainCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
      topLanguage = Object.entries(langCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
      topPlatform = Object.entries(platformCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
      topTopic = Object.entries(topicCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
      // Fallback if no session summaries yet
      if (!topDomain || !topLanguage) {
        try {
          const qM = { query: "SELECT c.metrics FROM c WHERE c.type='user' AND IS_DEFINED(c.metrics)", parameters: [] } as any;
          const { resources: res2 } = await c.items.query(qM).fetchAll();
          const domainCounts2: Record<string, number> = {};
          const langCounts2: Record<string, number> = {};
          for (const r2 of (res2||[])) {
            const m = (r2?.metrics||{}) as any;
            for (const [k,v] of Object.entries(m.domains||{})) domainCounts2[k] = (domainCounts2[k]||0) + Number(v||0);
            for (const [k,v] of Object.entries(m.languages||{})) langCounts2[k] = (langCounts2[k]||0) + Number(v||0);
          }
          if (!topDomain) topDomain = Object.entries(domainCounts2).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
          if (!topLanguage) topLanguage = Object.entries(langCounts2).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
        } catch {}
      }
    } catch {}

    // 24h sessions
    let sessionsCount24h = 0;
    let sessionsSeconds24h = 0;
    try {
      const qCnt24 = { query: "SELECT VALUE COUNT(1) FROM c WHERE c.type='session_summary' AND c.ts > @since", parameters: [{ name: "@since", value: since24h }] } as any;
      const qSum24 = { query: "SELECT VALUE SUM(c.durationSeconds) FROM c WHERE c.type='session_summary' AND c.ts > @since", parameters: [{ name: "@since", value: since24h }] } as any;
      const [{ resources: rc24 }, { resources: rs24 }] = await Promise.all([
        c.items.query(qCnt24).fetchAll(),
        c.items.query(qSum24).fetchAll(),
      ]);
      sessionsCount24h = Number((rc24 && rc24[0]) || 0);
      sessionsSeconds24h = Number((rs24 && rs24[0]) || 0);
    } catch {}

    // XP and Purchased totals (all-time)
    let xpTotal = 0;
    let purchasedSecondsTotal = 0;
    try {
      const qXp = { query: "SELECT VALUE SUM(c.xp) FROM c WHERE c.type='user' AND IS_DEFINED(c.xp)", parameters: [] } as any;
      const qPurch = { query: "SELECT VALUE SUM(c.purchasedSeconds) FROM c WHERE c.type='user' AND IS_DEFINED(c.purchasedSeconds)", parameters: [] } as any;
      const [{ resources: rx }, { resources: rp }] = await Promise.all([
        c.items.query(qXp).fetchAll(),
        c.items.query(qPurch).fetchAll(),
      ]);
      xpTotal = Number((rx && rx[0]) || 0);
      purchasedSecondsTotal = Number((rp && rp[0]) || 0);
    } catch {}

    // Percentiles (last 7 days)
    let p50Seconds7d = 0;
    let p95Seconds7d = 0;
    try {
      const qDur7 = { query: "SELECT VALUE c.durationSeconds FROM c WHERE c.type='session_summary' AND c.ts > @since", parameters: [{ name: "@since", value: since7d }] } as any;
      const { resources: ds } = await c.items.query(qDur7).fetchAll();
      const arr = Array.isArray(ds) ? (ds as number[]).map(n => Number(n || 0)).filter(n => Number.isFinite(n) && n > 0) : [];
      if (arr.length > 0) {
        arr.sort((a,b)=>a-b);
        const q50 = 0.5 * (arr.length - 1);
        const q95 = 0.95 * (arr.length - 1);
        const interp = (q: number) => {
          const lo = Math.floor(q), hi = Math.ceil(q);
          if (lo === hi) return arr[lo];
          const f = q - lo; return arr[lo] * (1 - f) + arr[hi] * f;
        };
        p50Seconds7d = Math.round(interp(q50));
        p95Seconds7d = Math.round(interp(q95));
      }
    } catch {}

    const averageSeconds = sessionsCount > 0 ? Math.floor(sessionsTotalSeconds / sessionsCount) : 0;
    const averageSeconds24h = sessionsCount24h > 0 ? Math.floor(sessionsSeconds24h / sessionsCount24h) : 0;
    // Canonical total session time: sum of usage events representing actual session increments
    const totalSeconds = totalSecondsAllTimeUsageEvents;
    return NextResponse.json({ metrics: { totalUsers, totalSeconds, totalSecondsAllTime, totalSummarizedSecondsAllTime: sessionsTotalSeconds, activeNowCount, totalLiveSecondsNow, topDomain, topLanguage, topPlatform, topTopic, sessionsCount, averageSeconds, sessionsCount24h, averageSeconds24h, xpTotal, purchasedSecondsTotal, p50Seconds7d, p95Seconds7d } });
  } catch (e: any) {
    return NextResponse.json({ metrics: { totalUsers: 0, totalSeconds: 0, topDomain: '', topLanguage: '', sessionsCount: 0, averageSeconds: 0 }, degraded: true, reason: e?.message || 'cosmos_unavailable' });
  }
}
