import { NextRequest, NextResponse } from "next/server";

/**
 * VoiceHub proxy for CRM calendar preferences.
 *
 * GET /api/calendar/preferences
 *  - Forwards to ${CRM_BASE_URL}/api/calendar/preferences
 *  - Returns CRM JSON response transparently on success
 *  - Propagates session cookies/Authorization header
 *
 * POST /api/calendar/preferences
 *  - Forwards body to ${CRM_BASE_URL}/api/calendar/preferences
 *  - Returns CRM JSON response transparently on success
 *
 * Config:
 *  CRM base URL is sourced from env: NEXT_PUBLIC_CRM_BASE_URL or CRM_BASE_URL
 */
function getCrmBase(): string {
  const base = (process.env.NEXT_PUBLIC_CRM_BASE_URL || process.env.CRM_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  return base;
}

function invalidBaseResponse() {
  return NextResponse.json({ ok: false, error: "crm_base_url_not_configured" }, { status: 500 });
}

function buildForwardHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = req.headers.get("cookie");
  if (cookie) headers["cookie"] = cookie;
  const auth = req.headers.get("authorization");
  if (auth) headers["authorization"] = auth;
  const wallet = req.headers.get("x-wallet");
  if (wallet) headers["x-wallet"] = wallet.toLowerCase();
  return headers;
}

export async function GET(req: NextRequest) {
  try {
    const crmBase = getCrmBase();
    if (!crmBase || !/^https?:\/\//i.test(crmBase)) {
      return invalidBaseResponse();
    }

    const headers = buildForwardHeaders(req);
    const res = await fetch(`${crmBase}/api/calendar/preferences`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
      // leave json as {}, pass through text if needed
    }

    if (!res.ok) {
      // Pass through CRM error details if available
      const err = typeof json === "object" && json !== null ? json : { error: text || "crm_preferences_failed" };
      return NextResponse.json({ ok: false, status: res.status, ...err }, { status: 502 });
    }

    // Success: return CRM response as-is, but ensure ok=true
    if (typeof json === "object" && json !== null) {
      return NextResponse.json({ ok: true, ...json }, { status: 200 });
    }
    return NextResponse.json({ ok: true, data: text }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "proxy_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const crmBase = getCrmBase();
    if (!crmBase || !/^https?:\/\//i.test(crmBase)) {
      return invalidBaseResponse();
    }

    const headers = {
      ...buildForwardHeaders(req),
      "Content-Type": "application/json",
    };

    const body = await req.text(); // forward raw JSON body

    const res = await fetch(`${crmBase}/api/calendar/preferences`, {
      method: "POST",
      headers,
      body,
    });

    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {}

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, status: res.status, error: json?.error || text || "crm_preferences_save_failed" },
        { status: 502 }
      );
    }

    return NextResponse.json(
      typeof json === "object" && json !== null ? { ok: true, ...json } : { ok: true, data: text },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "proxy_failed" }, { status: 500 });
  }
}
