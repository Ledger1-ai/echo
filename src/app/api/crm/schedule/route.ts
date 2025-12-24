import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/crm/schedule
 * VoiceHub-side bridge to request CRM to schedule a meeting for a lead.
 *
 * Body:
 * {
 *   leadId: string,
 *   datetime?: string,   // ISO timestamp
 *   timezone?: string    // IANA TZ e.g. "America/Denver"
 * }
 *
 * Notes:
 * - This scaffold forwards a tool_call event to the CRM webhook:
 *   POST {CRM_BASE_URL}/api/voice/engage/webhook
 *   {
 *     type: "tool_call",
 *     name: "schedule_meeting",
 *     leadId,
 *     args: { datetime, timezone },
 *     eventId,
 *     ts
 *   }
 * - CRM-side webhook performs meeting creation and pipeline stage update.
 * - For now, CRM base URL is sourced from env:
 *   NEXT_PUBLIC_CRM_BASE_URL or CRM_BASE_URL
 * - If VOICEHUB_WEBHOOK_SECRET is set on the CRM side, you may optionally
 *   compute HMAC signing here and set 'x-voicehub-signature' header. This
 *   scaffold omits the signature; CRM webhook allows unsigned payloads when
 *   secret is not configured.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Required
    const leadId = typeof body?.leadId === "string" ? body.leadId : "";
    if (!leadId) {
      return NextResponse.json({ ok: false, error: "missing_leadId" }, { status: 400 });
    }

    // Optional/extended event details from agent tool call
    const title = typeof body?.title === "string" ? body.title : "Meeting";
    const description = typeof body?.description === "string" ? body.description : "";
    // Accept multiple aliases for start/end/timeZone to be agent-friendly
    const startISO =
      (typeof body?.startISO === "string" ? body.startISO : undefined) ||
      (typeof body?.start === "string" ? body.start : undefined) ||
      (typeof body?.datetime === "string" ? body.datetime : undefined) ||
      undefined;

    const endISO =
      (typeof body?.endISO === "string" ? body.endISO : undefined) ||
      (typeof body?.end === "string" ? body.end : undefined) ||
      undefined;

    const timeZone =
      (typeof body?.timeZone === "string" ? body.timeZone : undefined) ||
      (typeof body?.timezone === "string" ? body.timezone : undefined) ||
      "UTC";

    const location = typeof body?.location === "string" ? body.location : undefined;
    const attendees =
      Array.isArray(body?.attendees) ? body.attendees :
      Array.isArray(body?.guests) ? body.guests :
      [];

    let calendarId = typeof body?.calendarId === "string" ? body.calendarId : undefined;

    // Fallback: if only start provided, default duration to 30 minutes
    let start = startISO;
    let end = endISO;
    if (start && !end) {
      const s = new Date(start);
      if (!isNaN(s.getTime())) {
        const e = new Date(s.getTime() + 30 * 60 * 1000);
        end = e.toISOString();
      }
    }

    if (!start || !end) {
      return NextResponse.json({ ok: false, error: "missing_start_end" }, { status: 400 });
    }

    const crmBase =
      (process.env.NEXT_PUBLIC_CRM_BASE_URL || process.env.CRM_BASE_URL || "").trim().replace(/\/+$/, "");
    if (!crmBase || !/^https?:\/\//i.test(crmBase)) {
      return NextResponse.json({ ok: false, error: "crm_base_url_not_configured" }, { status: 500 });
    }

    // Resolve default calendar if none provided, and include extended options
    try {
      if (!calendarId) {
        const headersPref: Record<string, string> = {};
        const cookiePref = req.headers.get("cookie");
        if (cookiePref) headersPref["cookie"] = cookiePref;
        const authPref = req.headers.get("authorization");
        if (authPref) headersPref["authorization"] = authPref;
        const walletPref = req.headers.get("x-wallet");
        if (walletPref) headersPref["x-wallet"] = walletPref.toLowerCase();

        const prefRes = await fetch(`${crmBase}/api/calendar/preferences`, {
          method: "GET",
          headers: headersPref,
          cache: "no-store",
        });
        const prefText = await prefRes.text();
        let prefJson: any = {};
        try { prefJson = JSON.parse(prefText); } catch {}
        const selected = Array.isArray(prefJson?.selectedIds) ? prefJson.selectedIds : [];
        const defaultId = typeof prefJson?.defaultId === "string" ? prefJson.defaultId : "";
        if (defaultId) calendarId = defaultId;
        else if (selected.length) calendarId = selected[0];
      }
    } catch {}

    const conferenceType = typeof body?.conferenceType === "string" ? body.conferenceType : undefined;
    const reminders = Array.isArray(body?.reminders) ? body.reminders : undefined;
    const organizerEmail = typeof body?.organizerEmail === "string" ? body.organizerEmail : undefined;

    // Forward directly to CRM Calendar scheduling endpoint with full details
    const crmPayload = {
      title,
      description,
      start,
      end,
      timeZone,
      attendees,
      location,
      leadId,
      ...(calendarId ? { calendarId } : {}),
      ...(conferenceType ? { conferenceType } : {}),
      ...(Array.isArray(reminders) ? { reminders } : {}),
      ...(organizerEmail ? { organizerEmail } : {}),
    };

    // Forward session/auth bridging headers so CRM can resolve the user (cookie/authorization/x-wallet)
    const fwdHeaders: Record<string, string> = { "Content-Type": "application/json" };
    const cookie = req.headers.get("cookie");
    if (cookie) fwdHeaders["cookie"] = cookie;
    const auth = req.headers.get("authorization");
    if (auth) fwdHeaders["authorization"] = auth;
    const wallet = req.headers.get("x-wallet");
    if (wallet) fwdHeaders["x-wallet"] = wallet;

    const res = await fetch(`${crmBase}/api/calendar/schedule`, {
      method: "POST",
      headers: fwdHeaders,
      body: JSON.stringify(crmPayload),
    });

    const text = await res.text();
    let j: any = {};
    try { j = JSON.parse(text); } catch {}

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, status: res.status, error: j?.error || text || "crm_schedule_failed" },
        { status: 502 }
      );
    }

    // Pass through CRM event info for agent feedback
    return NextResponse.json(
      { ok: true, forwarded: true, eventId: j?.eventId, htmlLink: j?.htmlLink, hangoutLink: j?.hangoutLink, crm: j },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}
