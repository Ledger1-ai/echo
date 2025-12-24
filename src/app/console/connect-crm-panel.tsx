"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Lightweight utilities to generate PKCE (S256) in-browser
async function sha256(input: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  return await crypto.subtle.digest("SHA-256", enc.encode(input));
}
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  const b64 = typeof window !== "undefined" ? btoa(str) : Buffer.from(str, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomString(len = 64): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => ("0" + b.toString(16)).slice(-2)).join("");
}

/**
 * VoiceHub "Connect CRM" panel
 * - Generates PKCE state and code_verifier, constructs an authorize URL against Ledger1CRM (/api/oauth/authorize)
 * - User retrieves the 'code' (scaffold returns JSON with suggested_redirect) and pastes it to complete token exchange
 * - Calls VoiceHub /api/crm/connect to store tokens (scaffold) and /api/crm/status (optional)
 */
type ConnectCrmPanelProps = { walletLower?: string };
export default function ConnectCrmPanel({ walletLower: walletLowerProp }: ConnectCrmPanelProps) {
  const [crmBaseUrl, setCrmBaseUrl] = useState<string>("");
  const [clientId, setClientId] = useState<string>(process.env.NEXT_PUBLIC_VOICEHUB_CLIENT_ID || "VOICEHUB_CLIENT");
  const [scope, setScope] = useState<string>("softphone:control outreach:write leads:read");
  const [authorizeUrl, setAuthorizeUrl] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [statusText, setStatusText] = useState<string>("");
  const [connected, setConnected] = useState<boolean>(false);
  const codeVerifierRef = useRef<string>("");
  const stateRef = useRef<string>("");
  const popupRef = useRef<Window | null>(null);
  // Wallet resolution: prefer provided prop, else API/me, else localStorage
  const [walletLower, setWalletLower] = useState<string>((walletLowerProp || "").toLowerCase());
  useEffect(() => {
    if (walletLower) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store" });
        const me: any = r.ok ? await r.json() : {};
        const w = String((me?.wallet || "") as string).toLowerCase();
        if (!cancelled && w) {
          setWalletLower(w);
          return;
        }
      } catch {}
      try {
        const ls =
          typeof window !== "undefined"
            ? window.localStorage.getItem("voicehub:wallet") || ""
            : "";
        if (!cancelled && ls) setWalletLower(ls.toLowerCase());
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [walletLower]);

  const redirectUri = useMemo(() => {
    // Use origin; CRM popup will postMessage back to this origin and close
    return typeof window !== "undefined" ? window.location.origin : "http://localhost";
  }, []);

  const buildAuthorizeUrl = useCallback(async () => {
    try {
      const base = (crmBaseUrl || "").trim().replace(/\/+$/, "");
      if (!/^https?:\/\//i.test(base)) {
        setStatusText("Enter a valid CRM Base URL (https://...)");
        return;
      }
      // PKCE
      const codeVerifier = randomString(64);
      const digest = await sha256(codeVerifier);
      const challenge = base64UrlEncode(digest);
      const state = randomString(24);
      codeVerifierRef.current = codeVerifier;
      stateRef.current = state;
      // Build authorize URL to CRM scaffold endpoint (/api/oauth/authorize)
      const u = new URL(`${base}/api/oauth/authorize`);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", clientId);
      u.searchParams.set("redirect_uri", redirectUri);
      u.searchParams.set("scope", scope);
      u.searchParams.set("state", state);
      u.searchParams.set("code_challenge", challenge);
      u.searchParams.set("code_challenge_method", "S256");
      setAuthorizeUrl(u.toString());
      setStatusText("Authorize URL generated. Click 'Open Authorize' to proceed.");
    } catch (e: any) {
      setStatusText(e?.message || "Failed to build authorize URL");
    }
  }, [crmBaseUrl, clientId, scope, redirectUri]);

  const openAuthorize = useCallback(() => {
    try {
      if (!authorizeUrl) {
        setStatusText("Generate the authorize URL first.");
        return;
      }
      const width = 520, height = 700;
      const left = Math.max(0, Math.floor((window.screen.width - width) / 2));
      const top = Math.max(0, Math.floor((window.screen.height - height) / 2));
      const features = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`;
      // Use a named popup and DO NOT set noopener/noreferrer so window.opener is available to the CRM page
      const w = window.open(authorizeUrl, "ledger1crm_oauth", features);
      if (!w) {
        setStatusText("Popup blocked. Allow popups for this site or copy the URL manually.");
      } else {
        popupRef.current = w;
        setStatusText("Authorize popup opened. Waiting for approval…");
      }
    } catch (e: any) {
      setStatusText(e?.message || "Failed to open authorize URL");
    }
  }, [authorizeUrl]);

  const completeConnect = useCallback(async () => {
    try {
      const base = (crmBaseUrl || "").trim().replace(/\/+$/, "");
      if (!/^https?:\/\//i.test(base)) {
        setStatusText("Enter a valid CRM Base URL (https://...)");
        return;
      }
      const cv = codeVerifierRef.current;
      if (!cv) {
        setStatusText("Missing code_verifier. Generate the authorize URL first.");
        return;
      }
      const c = (code || "").trim();
      if (!c) {
        setStatusText("Paste the received authorization code.");
        return;
      }
        const res = await fetch("/api/crm/connect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet": walletLower
          },
          body: JSON.stringify({ crmBaseUrl: base, code: c, codeVerifier: cv, redirectUri, state: stateRef.current, wallet: walletLower }),
        });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusText(typeof j?.error === "string" ? j.error : "Connect failed");
        return;
      }
      setConnected(true);
      setStatusText("Connect scaffold completed. Tokens would be stored by backend in a full implementation.");
    } catch (e: any) {
      setStatusText(e?.message || "Failed to complete connect");
    }
  }, [crmBaseUrl, code, redirectUri]);

  const checkCrmStatus = useCallback(async () => {
    try {
      const opts: any = { cache: "no-store" };
      if (walletLower) {
        opts.headers = { "x-wallet": walletLower };
      }
      const res = await fetch("/api/crm/status", opts);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusText(typeof j?.error === "string" ? j.error : "Status fetch error");
        return;
      }
      const isLinked = !!j?.connected;
      const origin = j?.iframeOrigin || "";
      const src = j?.iframeSrc || "";
      const extra = isLinked ? `Connected. Origin: ${origin}` : `Not connected. CCP src: ${src || "-"}`;
      setConnected(isLinked);
      setStatusText(`CRM status: ${isLinked ? "connected" : "disconnected"}. ${extra}`);
    } catch (e: any) {
      setStatusText(e?.message || "Failed to fetch CRM status");
    }
  }, [walletLower]);

  useEffect(() => {
    // Autofill CRM base URL from env if present
    const defaultCrm = process.env.NEXT_PUBLIC_CRM_BASE_URL || "";
    if (defaultCrm && !crmBaseUrl) {
      setCrmBaseUrl(defaultCrm);
    }
  }, [crmBaseUrl]);

  // Auto-detect existing CRM linkage once wallet is known
  useEffect(() => {
    if (!connected && walletLower) {
      checkCrmStatus();
    }
  }, [walletLower, connected, checkCrmStatus]);

  // Listen for OAuth code posted from CRM popup and complete connect automatically
  useEffect(() => {
    const onMessage = async (ev: MessageEvent) => {
      try {
        const data: any = ev.data;
        if (!data || data.type !== "ledger1crm_oauth_code") return;

        const base = (crmBaseUrl || "").trim().replace(/\/+$/, "");
        const crmOrigin = /^https?:\/\//i.test(base) ? new URL(base).origin : "";
        if (crmOrigin && ev.origin !== crmOrigin) {
          setStatusText("Received code from unexpected origin");
          return;
        }

        // Close popup if we have the handle
        try { popupRef.current?.close(); } catch {}

        const cv = codeVerifierRef.current;
        if (!cv) {
          setStatusText("Missing code_verifier. Generate the authorize URL first.");
          return;
        }

        const codeValue = String(data.code || "");
        const stateValue = String(data.state || "") || stateRef.current;

        const res = await fetch("/api/crm/connect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet": walletLower
          },
          body: JSON.stringify({
            crmBaseUrl: base,
            code: codeValue,
            codeVerifier: cv,
            redirectUri,
            state: stateValue,
            wallet: walletLower
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatusText(typeof j?.error === "string" ? j.error : "Connect failed");
          return;
        }
        setCode(codeValue);
        setConnected(true);
        setStatusText("Connected to CRM via popup. Tokens stored by backend.");
      } catch (e: any) {
        setStatusText(e?.message || "Failed to process popup response");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [crmBaseUrl, redirectUri]);

  return (
    <div className="glass-pane rounded-xl border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold">Connect Ledger1 CRM</div>
        {connected && (
          <span className="px-2 py-0.5 text-xs rounded-md bg-emerald-600/20 text-emerald-300 border border-emerald-600/30">
            Connected ✓
          </span>
        )}
      </div>
      {!connected && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="md:col-span-2">
          <label className="text-xs opacity-80">CRM Base URL</label>
          <input
            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
            placeholder="https://ledger1crm.example.com"
            value={crmBaseUrl}
            onChange={(e) => setCrmBaseUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs opacity-80">Client ID</label>
          <input
            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>
        <div className="md:col-span-3">
          <label className="text-xs opacity-80">Scopes</label>
          <input
            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          />
        </div>
      </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button className="px-3 py-1.5 rounded-md border" onClick={buildAuthorizeUrl} disabled={connected}>
          {connected ? "Connected ✓" : "Generate Authorize URL (PKCE)"}
        </button>
        <button className="px-3 py-1.5 rounded-md border" onClick={openAuthorize} disabled={!authorizeUrl || connected}>
          {connected ? "Authorize Complete" : "Open Authorize"}
        </button>
        <a
          href={authorizeUrl || "#"}
          target="_blank"
          rel="noreferrer"
          className={`px-3 py-1.5 rounded-md border ${authorizeUrl && !connected ? "" : "pointer-events-none opacity-60"}`}
        >
          Copy/Inspect URL
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="px-3 py-1.5 rounded-md border" onClick={checkCrmStatus}>
          Check CRM Status
        </button>
        <span className="microtext text-muted-foreground">{statusText}</span>
      </div>
    </div>
  );
}
