import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";

// Lightweight register: upsert the user document for the connected wallet.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(()=>({}));
    const w = String(body.wallet || req.headers.get('x-wallet') || '').toLowerCase();
    if (!/^0x[a-f0-9]{40}$/i.test(w)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    const now = Date.now();
    const id = `${w}:user`;
    try {
      const c = await getContainer();
      let doc: any;
      try { const { resource } = await c.item(id, w).read<any>(); doc = resource; } catch {}
      const next = { ...(doc||{ id, type: 'user', wallet: w, firstSeen: now }), lastSeen: now } as any;
      await c.items.upsert(next);
      return NextResponse.json({ ok: true });
    } catch (e: any) {
      return NextResponse.json({ ok: true, degraded: true, reason: e?.message || 'cosmos_unavailable' }, { status: 200 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}


