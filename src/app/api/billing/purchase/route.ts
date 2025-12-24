import { NextRequest, NextResponse } from "next/server";
import { getContainer, type BillingEvent } from "@/lib/cosmos";
import { getAuthenticatedWallet, isOwnerWallet } from "@/lib/auth";
import { getRpcClient, eth_getTransactionReceipt } from "thirdweb/rpc";
import { chain, client } from "@/lib/thirdweb/client";

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const body = await req.json().catch(() => ({}));
    const authed = await getAuthenticatedWallet(req);
    const bodyWallet = String(body.wallet || "").toLowerCase();
    const headerWallet = String(req.headers.get('x-wallet') || '').toLowerCase();
    const wallet = (authed || bodyWallet || headerWallet).toLowerCase();
    if (!wallet) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "x-correlation-id": correlationId } });
    }
    const seconds = Number(body.seconds || 0);
    const usd = typeof body.usd === "number" ? body.usd : undefined;
    const eth = typeof body.eth === "number" ? body.eth : undefined;
    const txHash = body.txHash ? String(body.txHash) : undefined;
    const idem = body.idempotencyKey ? String(body.idempotencyKey) : undefined;

    if (!/^0x[a-f0-9]{40}$/i.test(wallet)) {
      return NextResponse.json({ error: "invalid wallet" }, { status: 400, headers: { "x-correlation-id": correlationId } });
    }
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 24 * 3600) {
      return NextResponse.json({ error: "invalid seconds" }, { status: 400, headers: { "x-correlation-id": correlationId } });
    }

    const evt: BillingEvent = {
      id: idem || `${wallet}:purchase:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      type: "purchase",
      wallet,
      seconds,
      usd,
      eth,
      txHash,
      ts: Date.now(),
    };

    // Optional on-chain receipt sanity check: ensure tx "to" equals recipient
    try {
      if (txHash) {
        const rpc = getRpcClient({ client, chain });
        const r = await eth_getTransactionReceipt(rpc, { hash: txHash as `0x${string}` });
        const toAddr = (r?.to || "").toLowerCase();
        const recipient = (process.env.NEXT_PUBLIC_RECIPIENT_ADDRESS || "").toLowerCase();
        if (recipient && toAddr && toAddr !== recipient) {
          return NextResponse.json({ error: "tx_mismatch" }, { status: 400, headers: { "x-correlation-id": correlationId } });
        }
      }
    } catch {}

    try {
      const container = await getContainer();
      await container.items.upsert(evt);
      // Update or upsert user aggregate for purchased seconds
      const userId = `${wallet}:user`;
      try {
        const { resource } = await container.item(userId, wallet).read<any>();
        const purchased = Number(resource?.purchasedSeconds || 0) + seconds;
        const used = Number(resource?.usedSeconds || 0);
        const xp = Math.floor(used / (10 * 60));
        await container.items.upsert({ ...resource, id: userId, type: 'user', wallet, purchasedSeconds: purchased, usedSeconds: used, xp, lastSeen: Date.now() });
      } catch {
        await container.items.upsert({ id: userId, type: 'user', wallet, purchasedSeconds: seconds, usedSeconds: 0, xp: 0, firstSeen: Date.now(), lastSeen: Date.now() });
      }
      return NextResponse.json({ ok: true, event: evt }, { headers: { "x-correlation-id": correlationId } });
    } catch (e: any) {
      // Graceful degrade when Cosmos isn't configured/available
      return NextResponse.json({ ok: true, degraded: true, reason: e?.message || "cosmos_unavailable", event: evt }, { status: 200, headers: { "x-correlation-id": correlationId } });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500, headers: { "x-correlation-id": correlationId } });
  }
}


