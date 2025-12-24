"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
const TransactionButtonDynamic = dynamic(() => import("thirdweb/react").then(m => m.TransactionButton), { ssr: false });
import { prepareTransaction } from "thirdweb";
import { client, chain, getRecipientAddress } from "@/lib/thirdweb/client";

export function WalletActions({ wallet, className = "" }: { wallet: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const [amountEth, setAmountEth] = useState<string>("0.01");

  function copy() {
    try { navigator.clipboard.writeText(wallet).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false), 1200); }); } catch {}
  }

  function preset(v: string) { setAmountEth(v); setTipOpen(true); }

  function parseEthToWei(v: string): bigint {
    const n = Math.max(0, Number(v || 0));
    const s = n.toFixed(18);
    const [w, f = ""] = s.split(".");
    const frac = (f + "000000000000000000").slice(0, 18);
    return BigInt(w) * BigInt("1000000000000000000") + BigInt(frac);
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <button onClick={copy} className="px-2 py-1 rounded-md border text-xs">
        {copied ? "Copied" : "Copy"}
      </button>
      <button onClick={()=>setTipOpen(true)} className="px-2 py-1 rounded-md border text-xs">Tip</button>

      {tipOpen && (
        <div className="fixed inset-0 z-40 flex items-start justify-center pt-16">
          <div className="absolute inset-0 glass-backdrop" onClick={()=>setTipOpen(false)} />
          <div className="relative w-[min(480px,calc(100vw-24px))] glass-float rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Send a tip</div>
              <button className="px-2 py-1 rounded-md border text-xs" onClick={()=>setTipOpen(false)}>Close</button>
            </div>
            <div className="microtext text-muted-foreground">Funds go to the project wallet. Add a note in the transaction memo if you want.</div>
            <div className="flex items-center gap-2 flex-wrap">
              {["0.005","0.01","0.025","0.05"].map(v => (
                <button key={v} onClick={()=>preset(v)} className={`px-3 py-1.5 rounded-md border ${amountEth===v? 'bg-foreground/10':''}`}>{v} ETH</button>
              ))}
              <div className="flex items-center gap-2">
                <input className="h-9 px-3 py-1 border rounded-md bg-background w-28" value={amountEth} onChange={e=>setAmountEth(e.target.value)} />
                <span className="microtext">ETH</span>
              </div>
            </div>
            <TransactionButtonDynamic
              transaction={() => prepareTransaction({ client, chain, to: getRecipientAddress(), value: parseEthToWei(amountEth) })}
              className="buy-button w-full text-center"
              onTransactionConfirmed={() => setTipOpen(false)}
            >
              Send tip
            </TransactionButtonDynamic>
          </div>
        </div>
      )}
    </div>
  );
}
