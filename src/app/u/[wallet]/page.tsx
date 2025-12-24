import React from "react";
import { DefaultAvatar } from "@/components/default-avatar";
import { WalletActions } from "./wallet-actions";

async function fetchProfile(wallet: string) {
  const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/users/profile?wallet=${encodeURIComponent(wallet)}`, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  return j?.profile || { wallet };
}

async function fetchTopics(wallet: string) {
  const r = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/users/topics?wallet=${encodeURIComponent(wallet)}`, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  return Array.isArray(j?.topics) ? j.topics as string[] : [];
}

export default async function UserPublicPage({ params }: { params: { wallet: string } }) {
  const wallet = (params.wallet || '').toLowerCase();
  const [profile, topics] = await Promise.all([fetchProfile(wallet), fetchTopics(wallet)]);
  // Ensure embeds render on the public page by allowing iframes in SSR output
  const name = profile.displayName || `${wallet.slice(0,6)}…${wallet.slice(-4)}`;
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
      {profile && profile.wallet ? (
        <UserHeader wallet={wallet} profile={profile} />
      ) : (
        <div className="glass-pane rounded-xl border p-6 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-foreground/10" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-40 bg-foreground/10 rounded" />
              <div className="h-3 w-64 bg-foreground/10 rounded" />
            </div>
          </div>
        </div>
      )}
      {/* About row (full width) */}
      <div className="glass-pane rounded-xl border p-6">
        <h2 className="text-lg font-semibold mb-2">About</h2>
        <p className="text-sm whitespace-pre-wrap">{profile.bio || 'No bio yet.'}</p>
        {profile?.profileConfig?.htmlBox ? (
          <div className="mt-4 text-sm p-3 rounded-md border bg-background/60 overflow-hidden" dangerouslySetInnerHTML={{ __html: String(profile?.profileConfig?.htmlBox || '') }} />
        ) : null}
      </div>

      {/* Links + Top domains row */}
      <div className="grid sm:grid-cols-1 md:grid-cols-3 gap-6 max-w-full">
        <div className="md:col-span-2">
          {Array.isArray(profile.links) && profile.links.length > 0 ? (
            <div className="glass-pane rounded-xl border p-6">
              <h2 className="text-lg font-semibold mb-2">Links</h2>
              <div className="flex flex-col gap-2">
                {profile.links.map((l: any, i: number) => (
                  <a key={i} className="inline-flex items-center gap-2 px-2 py-1 rounded-md border hover:bg-foreground/5 text-sm truncate" href={l.url} target="_blank" rel="noopener noreferrer">
                    <span className="w-2 h-2 rounded-full" style={{ background: linkDotColor(l.url, l.label) }} />
                    <span className="font-medium truncate max-w-[50vw] md:max-w-[200px]">{l.label || l.url}</span>
                    <span className="microtext text-muted-foreground truncate hidden sm:inline">{l.url}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <div className="glass-pane rounded-xl border p-6">
              <h2 className="text-lg font-semibold mb-2">Links</h2>
              <div className="space-y-2 animate-pulse">
                <div className="h-4 w-2/3 bg-foreground/10 rounded" />
                <div className="h-4 w-1/2 bg-foreground/10 rounded" />
                <div className="h-4 w-3/4 bg-foreground/10 rounded" />
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="glass-pane rounded-xl border p-6">
            <h2 className="text-lg font-semibold mb-2">Top domains</h2>
            {topics.length ? (
              <div className="flex flex-wrap gap-2">
                {topics.map((t, i) => (
                  <span key={i} className="px-2 py-1 rounded-md border text-xs">{t}</span>
                ))}
              </div>
            ) : (
              <div className="space-y-2 animate-pulse">
                <div className="h-4 w-24 bg-foreground/10 rounded" />
                <div className="h-4 w-32 bg-foreground/10 rounded" />
                <div className="h-4 w-16 bg-foreground/10 rounded" />
              </div>
            )}
          </div>
        </div>
      </div>
      {profile?.profileConfig?.songUrl ? (
        <div className="glass-pane rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-2">Music</h2>
          <p className="microtext text-muted-foreground mb-2">Supports direct MP3 links (CDN) or embeds from Suno and YouTube.</p>
          <SongEmbed url={String(profile.profileConfig.songUrl)} />
        </div>
      ) : null}
    </div>
  );
}

function UserHeader({ wallet, profile }: { wallet: string; profile: any }) {
  const name = profile.displayName || `${wallet.slice(0,6)}…${wallet.slice(-4)}`;
  const live = !!profile.live && !!profile.spacePublic && (!!profile.lastHeartbeat && profile.lastHeartbeat > Date.now() - 120000);
  const link = live && typeof profile.spaceUrl === 'string' ? profile.spaceUrl : '';
  return (
    <div className="glass-pane rounded-xl border p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-16 h-16 rounded-full bg-foreground/10 overflow-hidden flex-shrink-0">
          {profile.pfpUrl ? <img src={profile.pfpUrl} alt={name} className="w-full h-full object-cover" /> : <DefaultAvatar seed={wallet} size={64} className="w-16 h-16 rounded-full" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold truncate">{name}</div>
            {live && <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-0.5 rounded-full border bg-red-500/10 border-red-500/40 text-red-300 whitespace-nowrap">Live Now</a>}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="font-mono text-xs text-muted-foreground truncate max-w-[55vw] md:max-w-none">{wallet.slice(0,10)}…{wallet.slice(-6)}</div>
            <WalletActions wallet={wallet} className="hidden sm:flex" />
          </div>
          <div className="mt-1 text-sm">XP: <span className="font-semibold">{profile.xp || 0}</span></div>
          <div className="sm:hidden mt-2"><WalletActions wallet={wallet} /></div>
          <FollowControls wallet={wallet} />
        </div>
      </div>
      {live && link && (
        <div>
          <a href={link} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] text-sm text-center block">Join</a>
        </div>
      )}
    </div>
  );
}

function SongEmbed({ url }: { url: string }) {
  const raw = String(url || '').trim();
  const ytId = parseYouTubeId(raw);
  if (ytId) {
    return (
      <div className="aspect-video w-full rounded-md overflow-hidden border">
        <iframe src={`https://www.youtube.com/embed/${ytId}`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  const mSuno = /suno\.(?:ai|com)\/(?:song|songs|listen)\/([a-z0-9_-]+)/i.exec(raw);
  if (mSuno && mSuno[1]) {
    const id = mSuno[1]; const host = /suno\.ai/i.test(raw) ? 'suno.ai' : 'suno.com';
    return (
      <div className="w-full rounded-md overflow-hidden border">
        <iframe src={`https://${host}/embed/${id}`} className="w-full" style={{ height: 160 }} allow="autoplay; clipboard-write; encrypted-media" />
      </div>
    );
  }
  return <audio src={raw} controls className="w-full" />;
}

function parseYouTubeId(u: string): string | null {
  try {
    const url = new URL(u);
    if (/youtu\.be$/i.test(url.hostname)) return url.pathname.split('/').filter(Boolean)[0] || null;
    if (/youtube\.com$/i.test(url.hostname) || /music\.youtube\.com$/i.test(url.hostname)) {
      if (url.searchParams.get('v')) return url.searchParams.get('v');
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts') return parts[1] || null;
    }
  } catch {}
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/.exec(u);
  return m && m[1] ? m[1] : null;
}

function linkDotColor(url: string, label: string): string {
  const u = String(url||'').toLowerCase();
  const l = String(label||'').toLowerCase();
  if (u.includes('x.com') || /twitter|x\b/.test(l)) return '#111827';
  if (u.includes('youtube.com') || u.includes('youtu.be') || /youtube/.test(l)) return '#ef4444';
  if (u.includes('twitch.tv') || /twitch/.test(l)) return '#9146ff';
  if (u.includes('discord.gg') || u.includes('discord.com') || /discord/.test(l)) return '#5865f2';
  if (u.includes('github.com') || /github/.test(l)) return '#24292f';
  if (u.includes('linkedin.com') || /linkedin/.test(l)) return '#0a66c2';
  if (u.includes('instagram.com') || /instagram/.test(l)) return '#d6249f';
  if (u.includes('t.me') || u.includes('telegram.me') || /telegram/.test(l)) return '#26a4e3';
  if (u.includes('suno.') || /suno/.test(l)) return '#111827';
  if (u.includes('soundcloud.com') || /soundcloud/.test(l)) return '#ff5500';
  if (u.includes('mailto:') || /email|mail/.test(l)) return '#475569';
  return '#64748b';
}

function FollowControls({ wallet }: { wallet: string }) {
  // client island
  // @ts-ignore
  const Comp = require("./follow-client").FollowClient as any;
  return <Comp wallet={wallet} />;
}



