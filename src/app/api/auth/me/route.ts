import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedWallet } from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    // Pass the request through so domain detection matches login
    let wallet = await getAuthenticatedWallet(req);
    if (!wallet) {
      // Fallback to wallet cookie if verifyJWT fails for any reason
      try {
        const c = await cookies();
        const w = c.get("cb_wallet")?.value;
        if (w && /^0x[a-fA-F0-9]{40}$/.test(w)) wallet = w.toLowerCase();
      } catch {}
    }
    if (!wallet) return NextResponse.json({ authed: false }, { status: 401 });
    return NextResponse.json({ authed: true, wallet });
  } catch (e: any) {
    return NextResponse.json({ authed: false, error: e?.message || "failed" }, { status: 500 });
  }
}


