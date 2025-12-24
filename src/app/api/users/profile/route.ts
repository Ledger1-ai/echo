import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { getAuthenticatedWallet } from "@/lib/auth";

type Profile = {
  id: string;
  type: 'user';
  wallet: string;
  pfpUrl?: string;
  displayName?: string;
  bio?: string;
  links?: { label: string; url: string }[];
  xp?: number;
  purchasedSeconds?: number;
  usedSeconds?: number;
  firstSeen?: number;
  lastSeen?: number;
  profileConfig?: {
    themeColor?: string;
    backgroundUrl?: string;
    songUrl?: string;
    widgets?: {
      showStats?: boolean;
      showSessions?: boolean;
      showDomains?: boolean;
      showLanguages?: boolean;
      showLinks?: boolean;
      showAbout?: boolean;
      showSong?: boolean;
    };
    htmlBox?: string;
  };
};

export async function GET(req: NextRequest) {
  try {
    const w = String((req.nextUrl.searchParams.get('wallet') || req.headers.get('x-wallet') || '')).toLowerCase();
    if (!/^0x[a-f0-9]{40}$/i.test(w)) return NextResponse.json({ error: 'invalid wallet' }, { status: 400 });
    try {
      const container = await getContainer();
      const id = `${w}:user`;
      const { resource } = await container.item(id, w).read<Profile>();
      if (!resource) return NextResponse.json({ profile: { wallet: w } });
      if (resource.pfpUrl && /\/api\/users\/pfp\?wallet=/.test(resource.pfpUrl)) {
        // Bust client cache on each GET so the latest upload shows up immediately
        const stamp = Date.now();
        return NextResponse.json({ profile: { ...resource, pfpUrl: `${resource.pfpUrl}&_=${stamp}` } });
      }
      return NextResponse.json({ profile: resource });
    } catch (e: any) {
      return NextResponse.json({ profile: { wallet: w }, degraded: true, reason: e?.message || 'cosmos_unavailable' });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(()=>({}));
    const authed = await getAuthenticatedWallet(req);
    const headerWallet = String((body.wallet || req.headers.get('x-wallet') || '')).toLowerCase();
    const wallet = (authed || headerWallet).toLowerCase();
    if (authed) {
      if (wallet !== (authed || '').toLowerCase()) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    } else {
      if (!/^0x[a-f0-9]{40}$/i.test(wallet)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!/^0x[a-f0-9]{40}$/i.test(wallet)) return NextResponse.json({ error: 'invalid wallet' }, { status: 400 });
    const updates: Partial<Profile> = {};
    if (typeof body.pfpUrl === 'string') updates.pfpUrl = body.pfpUrl;
    if (typeof body.displayName === 'string') updates.displayName = body.displayName.slice(0, 64);
    if (typeof body.bio === 'string') updates.bio = body.bio.slice(0, 1000);
    if (Array.isArray(body.links)) {
      updates.links = (body.links as any[])
        .slice(0, 5)
        .map(x => ({ label: String(x.label || '').slice(0,32), url: String(x.url || '').slice(0,256) }))
        .filter(x => x.url);
    }
    if (typeof body.profileConfig === 'object' && body.profileConfig) {
      const cfg = body.profileConfig as any;
      const widgets = cfg.widgets || {};
      updates.profileConfig = {
        themeColor: typeof cfg.themeColor === 'string' ? String(cfg.themeColor).slice(0, 32) : undefined,
        backgroundUrl: typeof cfg.backgroundUrl === 'string' ? String(cfg.backgroundUrl).slice(0, 512) : undefined,
        songUrl: typeof cfg.songUrl === 'string' ? String(cfg.songUrl).slice(0, 512) : undefined,
        widgets: {
          showStats: !!widgets.showStats,
          showSessions: !!widgets.showSessions,
          showDomains: !!widgets.showDomains,
          showLanguages: !!widgets.showLanguages,
          showLinks: !!widgets.showLinks,
          showAbout: !!widgets.showAbout,
          showSong: !!widgets.showSong,
        },
        htmlBox: typeof cfg.htmlBox === 'string' ? String(cfg.htmlBox).slice(0, 2000) : undefined,
      } as any;
    }
    try {
      const container = await getContainer();
      const id = `${wallet}:user`;
      let doc: any;
      try {
        const { resource } = await container.item(id, wallet).read<any>();
        doc = resource || { id, type: 'user', wallet };
      } catch {
        doc = { id, type: 'user', wallet, firstSeen: Date.now() };
      }
      const next = { ...doc, ...updates, lastSeen: Date.now() };
      await container.items.upsert(next);
      return NextResponse.json({ ok: true, profile: next });
    } catch (e: any) {
      return NextResponse.json({ ok: true, degraded: true, reason: e?.message || 'cosmos_unavailable' });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}


