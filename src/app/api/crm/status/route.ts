import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedWallet } from "@/lib/auth";
import { getContainer } from "@/lib/cosmos";

/**
 * GET /api/crm/status
 * VoiceHub-side status for CRM connection.
 *
 * Behavior:
 * - Reads per-wallet CRM token doc from Cosmos (id: `${wallet}:crm:${origin}`)
 * - If connected, optionally fetches CRM /api/integration/status to return iframe config
 *
 * Response:
 * {
 *   connected: boolean,
 *   crmBaseUrl?: string,
 *   iframeSrc?: string | null,
 *   iframeOrigin?: string | null
 * }
 */
export async function GET(req: NextRequest) {
  try {
    // Identify the wallet (VoiceHub account)
    const authed = await getAuthenticatedWallet(req);
    const headerWallet = String(req.headers.get("x-wallet") || "").toLowerCase();
    const wallet = String(authed || headerWallet || "").toLowerCase();
    if (!wallet) {
      return NextResponse.json({ connected: false }, { status: 200 });
    }

    // Resolve CRM base from env as a fallback; prefer stored connection
    const defaultCrm = (process.env.NEXT_PUBLIC_CRM_BASE_URL || process.env.CRM_BASE_URL || "").trim();
    const defaultOrigin = defaultCrm ? new URL(defaultCrm).origin : "";

    const container = await getContainer();
    // Query for any crm_conn doc for this wallet
    const q = {
      query: "SELECT c.id, c.crmBaseUrl, c.access_token, c.expires_at FROM c WHERE c.type='crm_conn' AND c.wallet=@w ORDER BY c.updatedAt DESC",
      parameters: [{ name: "@w", value: wallet }],
    } as any;
    const { resources } = await container.items.query(q).fetchAll();
    const doc = Array.isArray(resources) && resources.length > 0 ? resources[0] : null;

    if (!doc || !doc.crmBaseUrl) {
      // Not connected
      return NextResponse.json(
        {
          connected: false,
          crmBaseUrl: defaultOrigin || null,
          iframeSrc: null,
          iframeOrigin: null,
        },
        { status: 200 }
      );
    }

    const origin = String(doc.crmBaseUrl || defaultOrigin || "");
    let iframeSrc: string | null = null;
    let iframeOrigin: string | null = null;

    // Attempt to fetch CRM integration status for iframe hints
    try {
      const res = await fetch(`${origin}/api/integration/status`, { method: "GET" });
      const j: any = await res.json().catch(() => ({}));
      if (res.ok) {
        iframeSrc = String(j?.iframeSrc || null);
        iframeOrigin = String(j?.iframeOrigin || origin || null);
      } else {
        iframeSrc = null;
        iframeOrigin = origin || null;
      }
    } catch {
      iframeSrc = null;
      iframeOrigin = origin || null;
    }

    return NextResponse.json(
      {
        connected: true,
        crmBaseUrl: origin,
        iframeSrc,
        iframeOrigin,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}
