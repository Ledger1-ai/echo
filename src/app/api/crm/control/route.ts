import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedWallet } from "@/lib/auth";
import { getContainer } from "@/lib/cosmos";

/**
 * VoiceHub CRM Control Queue
 *
 * POST /api/crm/control
 *   - Enqueue a control event for the given wallet (x-wallet header required)
 *   Body:
 *     {
 *       command: "apply" | "start" | "stop",
 *       payload?: any,            // e.g. { prompt, settings: { voice, vadThreshold, ... } }
 *       correlationId?: string
 *     }
 *
 * GET /api/crm/control
 *   - Pop the next pending event for the given wallet (FIFO)
 *   Response:
 *     { ok: true, event: { id, command, payload, t, correlationId } | null }
 */

type ControlEvent = {
  id: string;
  command: "apply" | "start" | "stop";
  payload?: any;
  correlationId?: string;
  t: number; // epoch millis
};

type ControlDoc = {
  id: string;
  type: "crm_control_queue";
  wallet: string;
  queue: ControlEvent[];
  updatedAt: number;
};

function walletFrom(req: NextRequest): string {
  const headerWallet = String(req.headers.get("x-wallet") || "").toLowerCase().trim();
  return headerWallet;
}

export async function POST(req: NextRequest) {
  try {
    // Identify wallet via auth or explicit header (header required for CRM automation)
    const authed = await getAuthenticatedWallet(req).catch(() => null);
    const headerWallet = walletFrom(req);
    const wallet = String(headerWallet || authed || "").toLowerCase();
    if (!wallet) {
      return NextResponse.json({ ok: false, error: "missing_wallet" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({} as any));
    const rawCmd = String(body?.command || "").toLowerCase().trim();
    if (!rawCmd || !["apply", "start", "stop"].includes(rawCmd)) {
      return NextResponse.json({ ok: false, error: "invalid_command" }, { status: 400 });
    }

    const evt: ControlEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      command: rawCmd as ControlEvent["command"],
      payload: body?.payload,
      correlationId: typeof body?.correlationId === "string" ? body.correlationId : undefined,
      t: Date.now(),
    };

    const container = await getContainer();
    const docId = `${wallet}__crm_control`;
    const partitionKey = wallet;

    // Attempt to read existing queue
    let doc: ControlDoc | null = null;
    try {
      const { resource } = await container.item(docId, partitionKey).read<ControlDoc>();
      doc = resource || null;
    } catch {
      doc = null;
    }

    if (!doc) {
      doc = {
        id: docId,
        type: "crm_control_queue",
        wallet,
        queue: [],
        updatedAt: Date.now(),
      };
    }

    // Push event (FIFO semantics: push to end)
    doc.queue.push(evt);
    // Optional: bound queue length to avoid unbounded growth
    if (doc.queue.length > 100) {
      doc.queue = doc.queue.slice(-100);
    }
    doc.updatedAt = Date.now();

    await container.items.upsert(doc);
    return NextResponse.json({ ok: true, enqueued: { id: evt.id, command: evt.command } }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authed = await getAuthenticatedWallet(req).catch(() => null);
    const headerWallet = walletFrom(req);
    const wallet = String(headerWallet || authed || "").toLowerCase();
    if (!wallet) {
      return NextResponse.json({ ok: true, event: null }, { status: 200 });
    }

    const container = await getContainer();
    const docId = `${wallet}__crm_control`;
    const partitionKey = wallet;

    // Read and pop one event
    let doc: ControlDoc | null = null;
    try {
      const { resource } = await container.item(docId, partitionKey).read<ControlDoc>();
      doc = resource || null;
    } catch {
      doc = null;
    }

    if (!doc || !Array.isArray(doc.queue) || doc.queue.length === 0) {
      return NextResponse.json({ ok: true, event: null }, { status: 200 });
    }

    // FIFO: shift the first event
    const event = doc.queue.shift() || null;
    doc.updatedAt = Date.now();
    await container.items.upsert(doc);

    return NextResponse.json({ ok: true, event }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "failed" }, { status: 500 });
  }
}
