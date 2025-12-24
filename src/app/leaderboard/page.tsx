"use client";

import { useEffect, useState } from "react";
import { DefaultAvatar } from "@/components/default-avatar";
import { Ellipsis, Dot, Minus } from "lucide-react";

type Row = {
  wallet: string;
  xp: number;
  purchasedSeconds?: number;
  usedSeconds?: number;
  purchasedHMS?: { h: number; m: number; s: number; text: string };
  usedHMS?: { h: number; m: number; s: number; text: string };
  balanceSeconds?: number;
  balanceHMS?: { h: number; m: number; s: number; text: string };
  displayName?: string;
  pfpUrl?: string;
  lastSeen?: number;
};


export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(async (j) => {
        const base: Row[] = j.top || [];
        // Enrich with profile data (best effort in parallel)
        const enriched = await Promise.all(base.map(async (r: Row) => {
          try {
            const pr = await fetch(`/api/users/profile?wallet=${encodeURIComponent(r.wallet)}`).then(x=>x.json()).catch(()=>({}));
            const p = pr?.profile || {};
            return { ...r, displayName: p.displayName || '', pfpUrl: p.pfpUrl || '', lastSeen: p.lastSeen || 0 } as Row;
          } catch { return r; }
        }));
        setRows(enriched);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Leaderboard</h1>
        <span className="microtext badge-soft">
          {loading ? (<><span className="mr-1">Loading</span><Ellipsis className="inline h-3 w-3 align-[-2px]" /></>) : `${rows.length} players`}
        </span>
      </div>
      <div className="glass-pane rounded-xl border p-6 max-w-full">
        <ol className="divide-y">
          {rows.map((r, i) => {
            const name = r.displayName || `${r.wallet.slice(0,6)}...${r.wallet.slice(-4)}`;
            return (
              <li key={`${r.wallet}-${i}`} className="flex items-center justify-between gap-3 py-2">
                <a href={`/u/${r.wallet}`} className="inline-flex items-center gap-3 min-w-0">
                  <span className="w-6 text-right font-semibold hidden xs:inline-block sm:inline-block">{i+1}</span>
                  <span className="w-8 h-8 rounded-full overflow-hidden bg-foreground/10 flex-shrink-0">
                    {r.pfpUrl ? (
                      <img src={r.pfpUrl} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <DefaultAvatar seed={r.wallet} size={32} className="w-8 h-8" />
                    )}
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium leading-tight truncate">{name}</span>
                    <span className="microtext text-muted-foreground truncate">
                      {r.wallet.slice(0,10)}... <Dot className="inline h-3 w-3 mx-1" /> {r.lastSeen ? new Date(r.lastSeen).toLocaleDateString() : (<Minus className="inline h-3 w-3" />)}
                    </span>
                  </div>
                </a>
                <div className="text-right flex-shrink-0">
                  <div className="font-semibold whitespace-nowrap">{r.xp} XP</div>
                  <div className="microtext text-muted-foreground whitespace-nowrap">
                    Purch {r.purchasedHMS?.text || (<Minus className="inline h-3 w-3" />)} <Dot className="inline h-3 w-3 mx-1" /> Used {r.usedHMS?.text || (<Minus className="inline h-3 w-3" />)} <Dot className="inline h-3 w-3 mx-1" /> Bal {r.balanceHMS?.text || (<Minus className="inline h-3 w-3" />)}
                  </div>
                  <div className="microtext text-muted-foreground whitespace-nowrap">rank #{i+1}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="microtext text-muted-foreground mt-3">Top users by XP. XP grows with active session time and bonuses for diverse usage.</p>
      </div>
    </div>
  );
}
