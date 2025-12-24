import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedWallet, isOwnerWallet } from "@/lib/auth";
import { getContainer } from "@/lib/cosmos";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({} as any));
        const authed = await getAuthenticatedWallet(req);
        const headerWallet = String(req.headers.get('x-wallet') || '').toLowerCase();
        const bodyWallet = String(body.wallet || '').toLowerCase();
        const wallet = String(authed || headerWallet || bodyWallet || '').toLowerCase();
        if (!wallet) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
        const {
            AZURE_OPENAI_ENDPOINT,
            AZURE_OPENAI_API_KEY,
            AZURE_OPENAI_REALTIME_DEPLOYMENT,
            AZURE_OPENAI_REALTIME_API_VERSION,
        } = process.env as Record<string, string | undefined>;

        if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY || !AZURE_OPENAI_REALTIME_DEPLOYMENT || !AZURE_OPENAI_REALTIME_API_VERSION) {
            return NextResponse.json({ error: "Azure OpenAI environment variables are not set." }, { status: 500 });
        }

        const voice = String(body?.voice || "coral");

		// Enforce paid access before issuing ephemeral key
		try {
			if (!isOwnerWallet(wallet)) {
				const container = await getContainer();
				const query = {
					query: "SELECT c.type, c.seconds FROM c WHERE c.wallet = @w",
					parameters: [{ name: "@w", value: wallet }],
				} as { query: string; parameters: { name: string; value: string }[] };
				const { resources } = await container.items.query(query).fetchAll();
				let purchased = 0;
				let used = 0;
				for (const r of resources as any[]) {
					if (r.type === "purchase") purchased += Number(r.seconds || 0);
					else if (r.type === "usage") used += Number(r.seconds || 0);
				}
				let allow = Math.max(0, purchased - used) > 0;
				// Consider subscription plan on user doc
				try {
					const userId = `${wallet}:user`;
					const { resource } = await container.item(userId, wallet).read<any>();
					const plan = resource?.plan;
					const planExpiry = Number(resource?.planExpiry || 0);
					const now = Date.now();
					if ((plan === 'unlimited' || plan === 'basic') && planExpiry && planExpiry > now) allow = true;
				} catch {}
				if (!allow) {
					return NextResponse.json({ error: "payment_required" }, { status: 402 });
				}
			}
		} catch (e: any) {
			return NextResponse.json({ error: "gating_failed", reason: e?.message || "unavailable" }, { status: 503 });
		}
		const sessionsUrl = `${AZURE_OPENAI_ENDPOINT}openai/realtimeapi/sessions?api-version=${AZURE_OPENAI_REALTIME_API_VERSION}`;

		const response = await fetch(sessionsUrl, {
			method: "POST",
			headers: {
				"api-key": AZURE_OPENAI_API_KEY,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ model: AZURE_OPENAI_REALTIME_DEPLOYMENT, voice: voice || "coral" }),
		});

		if (!response.ok) {
			const text = await response.text();
			return NextResponse.json({ error: `Azure session failed: ${text}` }, { status: response.status });
		}

		const data = await response.json();
		return NextResponse.json(data);
	} catch (e: any) {
		return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
	}
}
