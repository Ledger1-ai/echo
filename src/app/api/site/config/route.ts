import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { getAuthenticatedWallet } from "@/lib/auth";

const DOC_ID = "site:config";

function normalizeSiteConfig(raw?: any) {
  const config: any = {
    id: DOC_ID,
    wallet: DOC_ID,
    type: "site_config",
    story: "",
    storyHtml: "",
    defiEnabled: true,
  };
  if (raw && typeof raw === "object") {
    Object.assign(config, raw);
  }
  config.story = typeof config.story === "string" ? config.story : "";
  config.storyHtml = typeof config.storyHtml === "string" ? config.storyHtml : "";
  config.defiEnabled = config.defiEnabled !== false;
  return config;
}

export async function GET(_req: NextRequest) {
  try {
    const c = await getContainer();
    try {
      const { resource } = await c.item(DOC_ID, DOC_ID).read<any>();
      return NextResponse.json({ config: normalizeSiteConfig(resource) });
    } catch {
      return NextResponse.json({ config: normalizeSiteConfig() });
    }
  } catch (e: any) {
    return NextResponse.json({ config: normalizeSiteConfig(), degraded: true, reason: e?.message || "cosmos_unavailable" });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const authed = await getAuthenticatedWallet(req);
    const headerWallet = String(req.headers.get('x-wallet') || '').toLowerCase();
    const wallet = (authed || headerWallet).toLowerCase();
    const owner = (process.env.NEXT_PUBLIC_OWNER_WALLET || '').toLowerCase();
    if (!wallet || wallet !== owner) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const story = typeof body.story === 'string' ? String(body.story).slice(0, 4000) : '';
    const rawHtml = typeof body.storyHtml === 'string' ? String(body.storyHtml) : '';
    const storyHtml = sanitizeStoryHtml(rawHtml).slice(0, 20000);
    let prev: any;
    try {
      const c = await getContainer();
      const { resource } = await c.item(DOC_ID, DOC_ID).read<any>();
      prev = resource;
    } catch {
      prev = undefined;
    }
    const prevConfig = normalizeSiteConfig(prev);
    const defiEnabled = typeof body.defiEnabled === 'boolean' ? body.defiEnabled : prevConfig.defiEnabled;
    const doc = {
      ...prevConfig,
      id: DOC_ID,
      wallet: DOC_ID,
      type: 'site_config',
      story,
      storyHtml,
      defiEnabled,
      updatedAt: Date.now(),
    } as any;
    try {
      const c = await getContainer();
      await c.items.upsert(doc);
      return NextResponse.json({ ok: true, config: doc });
    } catch (e: any) {
      return NextResponse.json({ ok: true, degraded: true, reason: e?.message || 'cosmos_unavailable', config: doc });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}

function sanitizeStoryHtml(html: string): string {
  try {
    let out = String(html || "");
    out = out.replace(/<\/(?:script|style|iframe|object|embed)>/gi, "");
    out = out.replace(/<(?:script|style|iframe|object|embed)[\s\S]*?>[\s\S]*?<\/(?:script|style|iframe|object|embed)>/gi, "");
    out = out.replace(/ on[a-z]+="[^"]*"/gi, "");
    out = out.replace(/ on[a-z]+='[^']*'/gi, "");
    out = out.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
    out = out.replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'");
    out = out.replace(/<img([^>]*?)src=("|')([^"'>]+)(\2)([^>]*)>/gi, (_m, pre, q, src, _q2, post) => {
      try {
        const s = String(src || "");
        if (/^\/(?!\/)/.test(s) || /^https?:\/\//i.test(s)) return `<img${pre}src=${q}${s}${q}${post}>`;
        return '';
      } catch { return ''; }
    });
    return out;
  } catch { return ""; }
}

