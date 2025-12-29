"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { client, chain, wallets } from "@/lib/thirdweb/client";

// Lazy-load just the Thirdweb ConnectButton for login flow
const ConnectButtonDynamic = dynamic(
  () => import("thirdweb/react").then((m) => m.ConnectButton),
  { ssr: false }
);

export default function LoginPage() {
  const router = useRouter();
  const [authedWallet, setAuthedWallet] = useState<string | null>(null);
  const loggedIn = !!authedWallet;

  // Resolve authenticated wallet via cookie and redirect to console when logged in
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const me = await fetch("/api/auth/me", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : { authed: false }))
          .catch(() => ({ authed: false }));
        if (!cancelled && me?.authed && me?.wallet) {
          setAuthedWallet(String(me.wallet).toLowerCase());
          // Redirect to console after successful sign-in
          try {
            router.replace("/console");
          } catch {}
        }
      } catch {}
    }
    check();
    // Poll once more shortly after mount to catch auth cookie set by Thirdweb
    const t = setTimeout(check, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [router]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Login</h1>
        <p className="text-muted-foreground microtext">
          Connect your wallet and authenticate to use BasaltEcho.
        </p>
      </div>

      <div className="glass-pane rounded-xl p-6 border flex items-center justify-center min-h-[240px]">
        {!loggedIn ? (
          <div className="w-full flex flex-col items-center justify-center gap-4 text-center">
            <img src="/bssymbol.png" alt="BasaltEcho by BasaltHQ.com" className="w-16 h-16 rounded-lg object-contain" />
            <div className="text-sm text-muted-foreground">Use the button below to connect and authenticate</div>
            <ConnectButtonDynamic
              client={client}
              chain={chain}
              wallets={wallets}
              connectButton={{
                label: <span className="microtext">Login</span>,
                className: "px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#ffc029]",
                style: {
                  backgroundColor: "transparent",
                  border: "1px solid #ffc029",
                  color: "#e5e7eb",
                  padding: "6px 10px",
                  lineHeight: "1",
                  height: "28px",
                },
              }}
              signInButton={{
                label: "Authenticate",
                className: "px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#ffc029]",
                style: {
                  backgroundColor: "transparent",
                  border: "1px solid #ffc029",
                  color: "#e5e7eb",
                  padding: "6px 10px",
                  lineHeight: "1",
                  height: "28px",
                },
              }}
              connectModal={{ title: "Login", titleIcon: "/bssymbol.png", size: "compact" }}
            />
          </div>
        ) : (
          <div className="w-full flex flex-col items-center justify-center gap-4 text-center">
            <div className="text-sm text-muted-foreground">You are logged in.</div>
            <button
              onClick={() => router.replace("/console")}
              className="px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#ffc029]"
              style={{
                backgroundColor: "transparent",
                border: "1px solid #ffc029",
                color: "#e5e7eb",
                padding: "6px 10px",
                lineHeight: "1",
                height: "28px",
              }}
              aria-label="Go to Console"
            >
              <span className="microtext">Go to Console</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
