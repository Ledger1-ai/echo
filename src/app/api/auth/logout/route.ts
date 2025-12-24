import { NextRequest, NextResponse } from "next/server";
import { AUTH } from "@/lib/auth";

export async function POST(_req: NextRequest) {
	const res = NextResponse.json({ ok: true });
	res.cookies.set(AUTH.COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
	return res;
}


