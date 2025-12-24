import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/calendar/availability
 * VoiceHub proxy for CRM calendar availability.
 *
 * Query params:
 *   - start: ISO string (e.g. 2025-11-23T12:00:00.000Z) or alias startISO
 *   - end: ISO string or alias endISO
 *   - timeZone: IANA TZ (e.g. "America/Denver")
 *
 * Behavior:
 *   - Validates required params
 *   - Forwards to ${CRM_BASE_URL}/api/calendar/availability with same query string
 *   - Returns CRM JSON response transparently on success
 *   - Returns appropriate error codes on failure
 *
 * Config:
 *   CRM base URL is sourced from env: NEXT_PUBLIC_CRM_BASE_URL or CRM_BASE_URL
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const start = url.searchParams.get("start") || url.searchParams.get("startISO") || "";
    const end = url.searchParams.get("end") || url.searchParams.get("endISO") || "";
    const timeZone = url.searchParams.get("timeZone") || "UTC";
    const calendarIds = url.searchParams.get("calendarIds") || "";

    if (!start || !end) {
      return NextResponse.json(
        { ok: false, error: "missing_params", details: "start and end are required (ISO-8601)" },
        { status: 400 }
      );
    }

    const crmBase = (process.env.NEXT_PUBLIC_CRM_BASE_URL || process.env.CRM_BASE_URL || "")
      .trim()
      .replace(/\/+$/, "");
    if (!crmBase || !/^https?:\/\//i.test(crmBase)) {
      return NextResponse.json({ ok: false, error: "crm_base_url_not_configured" }, { status: 500 });
    }

    let crmUrl: string;

    // Forward session/auth headers so CRM can resolve the user session
    const headers: Record<string, string> = {};
    const cookie = req.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;
    const auth = req.headers.get("authorization");
    if (auth) headers["authorization"] = auth;
    const wallet = req.headers.get("x-wallet");
    if (wallet) headers["x-wallet"] = wallet;

    // Derive effective calendar IDs: if none provided, use user's selectedIds or defaultId from CRM preferences
    let effectiveCalendarIds = calendarIds;
    if (!effectiveCalendarIds) {
      try {
        const prefRes = await fetch(`${crmBase}/api/calendar/preferences`, {
          method: "GET",
          headers,
          cache: "no-store",
        });
        const prefText = await prefRes.text();
        let prefJson: any = {};
        try { prefJson = JSON.parse(prefText); } catch {}
        const selected = Array.isArray(prefJson?.selectedIds) ? prefJson.selectedIds : [];
        const defaultId = typeof prefJson?.defaultId === "string" ? prefJson.defaultId : "";
        if (selected.length) effectiveCalendarIds = selected.join(",");
        else if (defaultId) effectiveCalendarIds = defaultId;
      } catch {}
    }

    crmUrl =
      `${crmBase}/api/calendar/availability` +
      `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timeZone=${encodeURIComponent(timeZone)}` +
      (effectiveCalendarIds ? `&calendarIds=${encodeURIComponent(effectiveCalendarIds)}` : "");

    const res = await fetch(crmUrl, { method: "GET", headers });
    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
      // leave json as {}, pass through text if needed
    }

    if (!res.ok) {
      // Pass through CRM error details if available
      const err = typeof json === "object" && json !== null ? json : { error: text || "crm_availability_failed" };
      return NextResponse.json({ ok: false, status: res.status, ...err }, { status: 502 });
    }

    // Success: return CRM response as-is, but ensure ok=true
    if (typeof json === "object" && json !== null) {
      return NextResponse.json({ ok: true, ...json }, { status: 200 });
    }
    // Non-JSON success (unlikely): wrap text
    return NextResponse.json({ ok: true, data: text }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "proxy_failed" }, { status: 500 });
  }
}
