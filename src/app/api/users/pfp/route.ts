import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { getAuthenticatedWallet } from "@/lib/auth";

function toBase64(u8: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(u8).toString("base64");
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  // @ts-ignore
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  // @ts-ignore
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const wallet = String(req.nextUrl.searchParams.get("wallet") || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/i.test(wallet)) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const container = await getContainer();
    const id = `${wallet}:pfp`;
    const { resource } = await container.item(id, wallet).read<any>();
    if (!resource || !resource.data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const binary = fromBase64(String(resource.data));
    const type = String(resource.contentType || "image/png");
    return new NextResponse(binary, { headers: { "Content-Type": type, "Cache-Control": "no-store, max-age=0, must-revalidate" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Accept either multipart/form-data (preferred) or JSON with { dataUrl }
    const contentType = req.headers.get("content-type") || "";
    const authed = await getAuthenticatedWallet(req);
    let wallet = String(req.headers.get("x-wallet") || "").toLowerCase();
    let fileBytes: Uint8Array | null = null;
    let mime = "image/png";
    if (/multipart\/form-data/i.test(contentType)) {
      const fd = await req.formData();
      wallet = String((fd.get("wallet") || wallet || "")).toLowerCase();
      const f = fd.get("file");
      if (f && typeof f === "object" && "arrayBuffer" in f) {
        const blob = f as File;
        mime = blob.type || mime;
        const ab = await blob.arrayBuffer();
        fileBytes = new Uint8Array(ab);
      }
    } else {
      const j = await req.json().catch(() => ({}));
      wallet = String((j.wallet || wallet || "")).toLowerCase();
      const dataUrl = String(j.dataUrl || "");
      const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || "");
      if (m) {
        mime = m[1] || mime;
        fileBytes = fromBase64(m[2] || "");
      }
    }
    // Allow x-wallet fallback when auth cookie isn't present
    if (authed) {
      if (wallet !== (authed || '').toLowerCase()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    } else {
      if (!/^0x[a-f0-9]{40}$/i.test(wallet)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!/^0x[a-f0-9]{40}$/i.test(wallet) || !fileBytes) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    // Enforce size limit ~1.5MB (post-compression we target ~300KB)
    if (fileBytes.byteLength > 1_500_000) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }

    try {
      const container = await getContainer();
      const id = `${wallet}:pfp`;
      const doc = { id, type: "pfp", wallet, contentType: mime, size: fileBytes.byteLength, data: toBase64(fileBytes), updatedAt: Date.now() } as any;
      await container.items.upsert(doc);
      // Also set the user's profile pfpUrl to this endpoint
      try {
        const userId = `${wallet}:user`;
        const { resource } = await container.item(userId, wallet).read<any>();
        const next = { ...(resource || { id: userId, type: "user", wallet, firstSeen: Date.now() }), pfpUrl: `/api/users/pfp?wallet=${wallet}`, lastSeen: Date.now() };
        await container.items.upsert(next as any);
      } catch {}
      return NextResponse.json({ ok: true, url: `/api/users/pfp?wallet=${wallet}` });
    } catch (e: any) {
      return NextResponse.json({ ok: true, degraded: true, reason: e?.message || "cosmos_unavailable" });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}


