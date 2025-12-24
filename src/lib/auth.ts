import { cookies } from "next/headers";
import { createAuth } from "thirdweb/auth";
import { privateKeyToAccount } from "thirdweb/wallets";
import type { NextRequest } from "next/server";
import { serverClient as client, chain } from "@/lib/thirdweb/server";

const AUTH_COOKIE = "cb_auth_token";

function getDomainFromRequest(req?: NextRequest): string {
    // Prefer request host (works behind proxies), then fall back to configured URL, otherwise localhost
    const forwarded = req?.headers?.get("x-forwarded-host");
    const host = forwarded || req?.headers?.get("host") || "";
    if (host && !/localhost|127\.0\.0\.1/.test(host)) return host;
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    if (envUrl) {
        try {
            const u = new URL(envUrl);
            return u.host || host || "localhost:3000";
        } catch {}
    }
    return host || "localhost:3000";
}

function getAdminAccount() {
	const pk = process.env.THIRDWEB_ADMIN_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY || "";
	if (!pk) throw new Error("THIRDWEB_ADMIN_PRIVATE_KEY not set");
	const normalized = pk.startsWith("0x") ? pk : ("0x" + pk);
    return privateKeyToAccount({ client, privateKey: normalized as `0x${string}` });
}

export function getAuth(req?: NextRequest) {
	const auth = createAuth({
		domain: getDomainFromRequest(req),
        client,
		adminAccount: getAdminAccount(),
		login: {
			statement: "Authenticate with VoiceHub by Ledger1.ai",
			payloadExpirationTimeSeconds: 5 * 60,
		},
		jwt: {
			expirationTimeSeconds: 60 * 60 * 24, // 24h
		},
	});
	return auth;
}

export async function getAuthenticatedWallet(req?: NextRequest): Promise<string | null> {
	try {
		const cookieStore = await cookies();
		const token = cookieStore.get(AUTH_COOKIE)?.value;
		if (!token) return null;
        const auth = getAuth(req);
        const res = await auth.verifyJWT({ jwt: token });
        if (!res.valid) return null;
        // Expect address in payload.address per our login route. Fall back to sub/address.
        let candidate: string | undefined = undefined;
        const p: any = (res as any).parsedJWT || {};
        candidate = p?.payload?.address || p?.sub || p?.address || p?.payload?.sub;
        if (!candidate && typeof token === "string") {
            try {
                const parts = token.split(".");
                if (parts.length >= 2) {
                    const decoded = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
                    candidate = decoded?.sub || decoded?.address || decoded?.payload?.address;
                }
            } catch {}
        }
        if (!candidate || !/^0x[a-fA-F0-9]{40}$/.test(candidate)) return null;
        return candidate.toLowerCase();
	} catch {
		return null;
	}
}

export async function requireAuthenticatedWallet(): Promise<string> {
	const w = await getAuthenticatedWallet();
	if (!w) throw new Error("unauthorized");
	return w;
}

export function isOwnerWallet(addr: string | null | undefined): boolean {
	const owner = (process.env.NEXT_PUBLIC_OWNER_WALLET || "").toLowerCase();
	const a = String(addr || "").toLowerCase();
	return !!owner && owner === a;
}

export function setAuthCookie(resp: Response, jwt: string) {
	try {
		// Prefer NextResponse cookies in route handlers, but fall back if not available
		// This helper is kept minimal: callers should use NextResponse.cookies.set where possible
		// Left as placeholder for future shared logic.
	} catch {}
}

export const AUTH = {
	COOKIE: AUTH_COOKIE,
};
