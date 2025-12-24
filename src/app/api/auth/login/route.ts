import { NextRequest, NextResponse } from "next/server";
import { getAuth, AUTH } from "@/lib/auth";

export async function POST(req: NextRequest) {
	try {
		const body = await req.json().catch(() => ({}));
		const payload = body?.payload;
		const signature = body?.signature;
		if (!payload || !signature) {
			return NextResponse.json({ error: "invalid" }, { status: 400 });
		}
		const auth = getAuth(req);
    const verified = await auth.verifyPayload({ payload, signature });
    const addr = (verified as any)?.address || (verified as any)?.payload?.address;
    // Always generate a JWT with a simple payload carrying the address
    const jwt = await auth.generateJWT({ payload: { address: addr } });
		const res = NextResponse.json({ ok: true });
		res.cookies.set(AUTH.COOKIE, jwt, {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24,
		});
		// Secondary cookie with wallet address for robust server reads
		if (addr) {
			res.cookies.set("cb_wallet", addr, {
				httpOnly: true,
				secure: process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				path: '/',
				maxAge: 60 * 60 * 24,
			});
		}
		return res;
	} catch (e: any) {
		return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
	}
}


