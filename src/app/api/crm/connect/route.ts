import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedWallet } from "@/lib/auth";
import { getContainer } from "@/lib/cosmos";

/**
 * POST /api/crm/connect
 * Scaffold for VoiceHub ↔ Ledger1CRM OAuth (Authorization Code + PKCE)
 *
 * Expected body:
 * {
 *   crmBaseUrl: string,             // e.g., https://crm.example.com
 *   code?: string,                  // authorization code (on callback completion)
 *   codeVerifier?: string,          // PKCE verifier (on callback completion)
 *   redirectUri?: string,           // VoiceHub registered redirect URI
 *   state?: string                  // state to correlate connect flow
 * }
 *
 * Notes:
 * - This scaffold only validates auth and inputs and returns a placeholder.
 * - Final implementation will:
 *   1) Initiate OAuth by generating PKCE challenge and opening /oauth/authorize at CRM
 *   2) Exchange code for tokens at CRM /oauth/token using code_verifier
 *   3) Store tokens per-wallet in Cosmos: { access_token, refresh_token, expires_at, crmBaseUrl }
 *   4) Return connected status
 */

export async function POST(req: NextRequest) {
  try {
    // Identify the wallet (VoiceHub account)
    // Support both JSON and x-www-form-urlencoded bodies
    const contentType = req.headers.get("content-type") || "";
    let body: any = {};
    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => ({}));
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await req.text();
      body = Object.fromEntries(new URLSearchParams(text) as any);
    } else {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    // Identify the wallet (VoiceHub account) from auth cookie, header, or body
    const authed = await getAuthenticatedWallet(req);
    const headerWallet = String(req.headers.get("x-wallet") || "").toLowerCase();
    const bodyWallet = String(body?.wallet || "").toLowerCase();
    // Fallback to plain wallet cookie if present (e.g., cb_wallet) for dev/manual calls
    const cookieWallet = String(req.cookies.get("cb_wallet")?.value || "").toLowerCase();
    // Additional fallback: parse raw Cookie header (for curl/manual invocations where NextRequest.cookies is empty)
    let headerCookieWallet = "";
    const rawCookie = req.headers.get("cookie") || "";
    if (rawCookie) {
      const match = rawCookie.match(/(?:^|;\s*)cb_wallet=([^;]+)/i);
      if (match?.[1]) {
        try {
          headerCookieWallet = decodeURIComponent(match[1]).toLowerCase();
        } catch {
          headerCookieWallet = match[1].toLowerCase();
        }
      }
    }
    const wallet = String(authed || headerWallet || bodyWallet || cookieWallet || headerCookieWallet).toLowerCase();
    if (!wallet) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", hint: "Provide x-wallet header or body.wallet or set cb_wallet cookie." },
        { status: 401 }
      );
    }
    const crmBaseUrl = String(body?.crmBaseUrl || "").trim().replace(/\/+$/, "");
    const code = typeof body?.code === "string" ? body.code : undefined;
    const codeVerifier = typeof body?.codeVerifier === "string" ? body.codeVerifier : undefined;
    const redirectUri = typeof body?.redirectUri === "string" ? body.redirectUri : undefined;
    const state = typeof body?.state === "string" ? body.state : undefined;

    if (!crmBaseUrl || !/^https?:\/\//i.test(crmBaseUrl)) {
      return NextResponse.json({ ok: false, error: "invalid_crm_base_url" }, { status: 400 });
    }

    // If we have an auth code + verifier, perform token exchange with CRM and persist tokens
    if (code && codeVerifier && redirectUri) {
      const clientId =
        process.env.NEXT_PUBLIC_VOICEHUB_CLIENT_ID ||
        process.env.VOICEHUB_CLIENT_ID ||
        "VOICEHUB_CLIENT";

      // Prefer x-www-form-urlencoded per OAuth spec
      const params = new URLSearchParams();
      params.set("grant_type", "authorization_code");
      params.set("code", code);
      params.set("redirect_uri", redirectUri);
      params.set("client_id", clientId);
      params.set("code_verifier", codeVerifier);

      const tokenRes = await fetch(`${crmBaseUrl}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const tokenJson: any = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok) {
        return NextResponse.json(
          { ok: false, status: tokenRes.status, error: tokenJson?.error || "token_exchange_failed" },
          { status: 502 }
        );
      }

      const access_token = String(tokenJson?.access_token || "");
      const refresh_token = String(tokenJson?.refresh_token || "");
      const token_type = String(tokenJson?.token_type || "Bearer");
      const expires_in = Number(tokenJson?.expires_in || 3600);
      const issued_at = Number(tokenJson?.issued_at || Math.floor(Date.now() / 1000));
      const scope = String(tokenJson?.scope || "");

      const expires_at_sec = issued_at + expires_in;
      // Build a Cosmos-safe document id (Cosmos disallows "/" "\" "?" "#")
      // Use hostname[-port] to avoid illegal characters from full origin (e.g., "http://localhost:3000")
      const url = new URL(crmBaseUrl);
      const origin = url.origin;
      const originKey = `${url.hostname}${url.port ? `-${url.port}` : ""}`.toLowerCase();
      const id = `${wallet}__crm__${originKey}`;

      // Persist in Cosmos
      const container = await getContainer();
      const doc = {
        id,
        type: "crm_conn",
        wallet,
        crmBaseUrl: origin,
        token_type,
        access_token,
        refresh_token,
        scope,
        issued_at,
        expires_in,
        expires_at: expires_at_sec,
        state: state || undefined,
        updatedAt: Date.now(),
      };

      // Some voice endpoints pattern use upsert
      await container.items.upsert(doc);

      // Register VoiceHub wallet with CRM for status indicator
      try {
        // Derive VoiceHub base (optional) from env
        const rawBase =
          (process.env.NEXT_PUBLIC_VOICEHUB_BASE_URL || process.env.VOICEHUB_BASE_URL || "").trim();
        const serviceUrl =
          rawBase && /^https?:\/\//i.test(rawBase)
            ? new URL(rawBase).origin.replace(/\/+$/, "")
            : undefined;

        // Include userId from token response to properly map wallet to CRM user
        const userId = String(tokenJson?.user_id || "");
        await fetch(`${origin}/api/integration/voicehub/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet": wallet,
            ...(userId ? { "x-user-id": userId } : {})
          },
          body: JSON.stringify({
            ...(serviceUrl ? { serviceUrl } : {}),
            ...(userId ? { userId } : {})
          }),
        });
      } catch { }

      return NextResponse.json(
        {
          ok: true,
          connected: true,
          wallet,
          crmBaseUrl: origin,
          expires_at: expires_at_sec,
        },
        { status: 200 }
      );
    }

    // No code provided: inform caller this endpoint expects a code + verifier (panel already initiates auth)
    return NextResponse.json(
      {
        ok: true,
        message: "awaiting_code",
        hint: "Call this endpoint with { crmBaseUrl, code, codeVerifier, redirectUri } to complete connect.",
        inputs: { state },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}
