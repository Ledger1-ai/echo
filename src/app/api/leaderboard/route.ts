import { NextRequest, NextResponse } from "next/server";
import { TokenDatabase } from "@/lib/token-db";
import { getContainer } from "@/lib/cosmos";

function toHMS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return { h, m, s: sec, text: `${h}h ${m}m ${sec}s` };
}

export async function GET(_req: NextRequest) {
  try {
    // Gather XP from SpawnCamp user stats
    const db = await TokenDatabase.getInstance();
    const spawncampUsers = await db.getTopUsers(100);

    // Gather XP from billing/events 'user' docs (voice agent etc.)
    let eventsXpMap = new Map<string, number>();
    try {
      const container = await getContainer(); // defaults: cb_billing / events
      const query = {
        query: "SELECT c.wallet, c.xp FROM c WHERE c.type='user' AND IS_DEFINED(c.wallet) AND IS_DEFINED(c.xp)",
        parameters: [],
      } as { query: string; parameters: { name: string; value: string }[] };
      const { resources } = await container.items.query(query).fetchAll();
      for (const r of (resources as any[]) || []) {
        const w = String(r.wallet || "").toLowerCase();
        if (!/^0x[a-f0-9]{40}$/.test(w)) continue;
        eventsXpMap.set(w, Number(r.xp || 0));
      }
    } catch (e) {
      // If billing/events is unavailable, just proceed with SpawnCamp stats
      try { console.warn("/api/leaderboard: events xp unavailable", (e as any)?.message || e); } catch {}
    }

    // Merge sources by wallet, deduplicate
    const merged = new Map<string, {
      wallet: string;
      xp: number;
      displayName?: string;
      pfpUrl?: string;
      lastSeen?: number;
    }>();

    for (const u of (spawncampUsers || [])) {
      const w = String(u.wallet || "").toLowerCase();
      if (!/^0x[a-f0-9]{40}$/.test(w)) continue;
      const baseXp = Number(u.totalXP || 0);
      const extraXp = eventsXpMap.get(w) || 0;
      const total = baseXp + extraXp;
      merged.set(w, {
        wallet: w,
        xp: total,
        displayName: (u as any).displayName,
        pfpUrl: (u as any).pfpUrl,
        lastSeen: (u as any).lastSeen,
      });
    }

    // Include wallets that exist only in events
    for (const [w, xp] of eventsXpMap.entries()) {
      if (!merged.has(w)) {
        merged.set(w, { wallet: w, xp });
      }
    }

    const list = Array.from(merged.values());
    list.sort((a, b) => b.xp - a.xp);

    // Build response rows (deduplicated wallets)
    const top = list.slice(0, 100).map((r) => ({
      wallet: r.wallet,
      xp: r.xp,
      purchasedSeconds: 0,
      usedSeconds: 0,
      purchasedHMS: toHMS(0),
      usedHMS: toHMS(0),
      balanceSeconds: 0,
      balanceHMS: toHMS(0),
      displayName: r.displayName,
      pfpUrl: r.pfpUrl,
      lastSeen: r.lastSeen,
    }));

    return NextResponse.json({ top });
  } catch (e: any) {
    return NextResponse.json({ top: [], degraded: true, reason: e?.message || 'leaderboard_unavailable' });
  }
}
