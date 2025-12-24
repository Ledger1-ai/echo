"use client";

import React, { useEffect, useState } from "react";
import { DefaultAvatar } from "@/components/default-avatar";
import { useActiveAccount } from "thirdweb/react";

type LinkItem = { label: string; url: string };

export default function EditProfilePage() {
  const account = useActiveAccount();
  const wallet = (account?.address || "").toLowerCase();
  const [loading, setLoading] = useState(false);
  const [pfpUrl, setPfpUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [msg, setMsg] = useState("");
  const [xp, setXp] = useState(0);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<{ pfpUrl: string; displayName: string; bio: string; links: LinkItem[] }>({ pfpUrl: "", displayName: "", bio: "", links: [] });
  const [profileConfig, setProfileConfig] = useState<any>({ themeColor: "#8b5cf6", backgroundUrl: "", songUrl: "", widgets: { showStats: true, showSessions: true, showDomains: true, showLanguages: true, showLinks: true, showAbout: true, showSong: false }, htmlBox: "" });
  const [showHtmlHelp, setShowHtmlHelp] = useState(false);

  function sanitizeHtmlLimited(html: string): string {
    try {
      let out = String(html || "");
      // Remove scripts/styles/iframes/objects
      out = out.replace(/<\/(?:script|style|iframe|object|embed)>/gi, "");
      out = out.replace(/<(?:script|style|iframe|object|embed)[\s\S]*?>[\s\S]*?<\/(?:script|style|iframe|object|embed)>/gi, "");
      // Strip on* handlers and javascript: URLs
      out = out.replace(/ on[a-z]+="[^"]*"/gi, "");
      out = out.replace(/ on[a-z]+='[^']*'/gi, "");
      out = out.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
      out = out.replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'");
      return out;
    } catch { return ""; }
  }

  function renderSong(url?: string) {
    const u = String(url || "").trim();
    if (!u) return null;
    try {
      const low = u.toLowerCase();
      // YouTube
      const mYt = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-z0-9_-]{6,})/i.exec(u);
      if (mYt && mYt[1]) {
        const id = mYt[1];
        return (
          <div className="aspect-video w-full rounded-md overflow-hidden border">
            <iframe
              src={`https://www.youtube.com/embed/${id}`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      }
      // Suno (best-effort)
      const mSuno = /suno\.(?:ai|com)\/(?:song|songs|listen)\/([a-z0-9_-]+)/i.exec(low);
      if (mSuno && mSuno[1]) {
        const id = mSuno[1];
        const host = /suno\.ai/i.test(low) ? 'suno.ai' : 'suno.com';
        return (
          <div className="w-full rounded-md overflow-hidden border">
            <iframe
              src={`https://${host}/embed/${id}`}
              className="w-full" style={{ height: 120 }}
              allow="autoplay; clipboard-write; encrypted-media"
            />
          </div>
        );
      }
      // Fallback audio player
      return <audio src={u} controls className="w-full" />;
    } catch { return null; }
  }

  function Icon({ name }: { name: string }) {
    const props = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as any;
    switch (name) {
      case 'x': return (<svg {...props}><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>);
      case 'youtube': return (<svg {...props}><path d="M22 12s0-3-0.4-4.4a3 3 0 0 0-2.2-2.2C17 5 12 5 12 5s-5 0-7.4.4A3 3 0 0 0 2.4 7.6C2 9 2 12 2 12s0 3 .4 4.4a3 3 0 0 0 2.2 2.2C5 19 12 19 12 19s5 0 7.4-.4a3 3 0 0 0 2.2-2.2C22 15 22 12 22 12z" stroke="none" fill="currentColor"/><polygon points="10 15 15 12 10 9 10 15" stroke="none" fill="#fff"/></svg>);
      case 'twitch': return (<svg {...props}><path d="M4 3h16v10l-4 4h-4l-2 2H8v-2H4V3z"/><path d="M14 8v4M10 8v4"/></svg>);
      case 'discord': return (<svg {...props}><path d="M6 18c2 1 4 1 6 1s4 0 6-1c1-3 2-6 2-9-2-2-4-3-6-3l-1 2c-2-1-4-1-6 0L6 6C4 6 2 7 0 9c0 3 1 6 2 9z" stroke="none" fill="currentColor"/></svg>);
      case 'github': return (<svg {...props}><path d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.9 9.6.5.1.7-.2.7-.5v-2c-2.8.6-3.4-1.2-3.4-1.2-.4-1.1-1-1.4-1-1.4-.8-.6.1-.6.1-.6.9.1 1.3 1 1.3 1 .8 1.3 2.1.9 2.6.7.1-.6.3-1 .5-1.2-2.2-.2-4.5-1.1-4.5-5 0-1.1.4-2 1-2.7-.1-.2-.5-1.3.1-2.6 0 0 .9-.3 2.8 1 .8-.2 1.6-.3 2.4-.3s1.6.1 2.4.3c2-1.3 2.8-1 2.8-1 .6 1.3.2 2.4.1 2.6.7.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.5 5 .3.3.6.9.6 1.9v2.8c0 .3.2.6.7.5 4-1.3 6.9-5.1 6.9-9.6C22 6.6 17.5 2 12 2z" stroke="none" fill="currentColor"/></svg>);
      case 'linkedin': return (<svg {...props}><path d="M4 4h4v4H4z"/><path d="M6 8v12"/><path d="M10 12c0-2 1.5-3 3-3s3 1 3 3v8"/><path d="M10 20v-8"/></svg>);
      case 'instagram': return (<svg {...props}><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="3.5"/><circle cx="17.5" cy="6.5" r="1"/></svg>);
      case 'telegram': return (<svg {...props}><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>);
      case 'music': return (<svg {...props}><path d="M9 18a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM15 2v14"/><path d="M15 2l6 2v6l-6-2"/></svg>);
      case 'soundcloud': return (<svg {...props}><path d="M3 16a4 4 0 0 1 4-4 6 6 0 0 1 9-5 5 5 0 0 1 5 5 3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" stroke="none" fill="currentColor"/></svg>);
      case 'mail': return (<svg {...props}><path d="M4 4h16v16H4z"/><path d="M22 6l-10 7L2 6"/></svg>);
      default: return (<svg {...props}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/></svg>);
    }
  }

  function linkIcon(url: string, label: string): React.ReactElement {
    const u = String(url||"").toLowerCase();
    const l = String(label||"").toLowerCase();
    const kind = (
      u.includes('x.com') || /twitter|x\b/.test(l) ? 'x' :
      (u.includes('youtube.com') || u.includes('youtu.be') || /youtube/.test(l)) ? 'youtube' :
      (u.includes('twitch.tv') || /twitch/.test(l)) ? 'twitch' :
      (u.includes('discord.gg') || u.includes('discord.com') || /discord/.test(l)) ? 'discord' :
      (u.includes('github.com') || /github/.test(l)) ? 'github' :
      (u.includes('linkedin.com') || /linkedin/.test(l)) ? 'linkedin' :
      (u.includes('instagram.com') || /instagram/.test(l)) ? 'instagram' :
      (u.includes('t.me') || u.includes('telegram.me') || /telegram/.test(l)) ? 'telegram' :
      (u.includes('suno.') || /suno/.test(l)) ? 'music' :
      (u.includes('soundcloud.com') || /soundcloud/.test(l)) ? 'soundcloud' :
      (u.includes('mailto:') || /email|mail/.test(l)) ? 'mail' :
      'globe'
    );
    return (
      <span className="w-6 h-6 rounded-full grid place-items-center border bg-foreground/5">
        <Icon name={kind} />
      </span>
    );
  }

  useEffect(() => {
    if (!wallet) return;
    setLoading(true);
    fetch(`/api/users/profile?wallet=${encodeURIComponent(wallet)}`)
      .then(r => r.json())
      .then(j => {
        const p = j?.profile || {};
        setPfpUrl(p.pfpUrl || "");
        setDisplayName(p.displayName || "");
        setBio(p.bio || "");
        setLinks(Array.isArray(p.links) ? p.links : []);
        setXp(Number(p.xp || 0));
        setSnapshot({ pfpUrl: p.pfpUrl || "", displayName: p.displayName || "", bio: p.bio || "", links: Array.isArray(p.links) ? p.links : [] });
        try { if (p.profileConfig) setProfileConfig(p.profileConfig); } catch {}
      })
      .finally(() => setLoading(false));
  }, [wallet]);

  async function save() {
    if (!wallet) return;
    setSaving(true);
    setMsg("Saving…");
    try {
      const r = await fetch('/api/users/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-wallet': wallet }, body: JSON.stringify({ pfpUrl, displayName, bio, links, profileConfig }) });
      const j = await r.json().catch(() => ({}));
      setMsg(j?.ok ? 'Saved!' : 'Failed to save');
      if (j?.ok) { setSnapshot({ pfpUrl, displayName, bio, links }); setEditMode(false); }
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 1200);
    }
  }

  function cancelEdits() {
    setPfpUrl(snapshot.pfpUrl || "");
    setDisplayName(snapshot.displayName || "");
    setBio(snapshot.bio || "");
    setLinks(Array.isArray(snapshot.links) ? snapshot.links : []);
    setEditMode(false);
  }

  function setLink(i: number, key: keyof LinkItem, value: string) {
    setLinks(prev => prev.map((x, idx) => idx === i ? { ...x, [key]: value } : x));
  }

  function addLink() { setLinks(prev => prev.concat([{ label: '', url: '' }])); }
  function removeLink(i: number) { setLinks(prev => prev.filter((_, idx) => idx !== i)); }

  if (!wallet) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="glass-pane rounded-xl border p-6">
          <div className="text-lg font-semibold">Connect your wallet to edit your profile.</div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your Profile</h1>
        <div className="flex items-center gap-2">
          <span className="microtext badge-soft">{loading ? 'Loading…' : msg || ''}</span>
          {!editMode ? (
            <button onClick={()=>setEditMode(true)} className="px-3 py-1.5 rounded-md border">Edit</button>
          ) : (
            <>
              <button onClick={cancelEdits} className="px-3 py-1.5 rounded-md border">Cancel</button>
              <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)]">Save</button>
            </>
          )}
        </div>
      </div>

      {/* Public preview */}
      <div className="glass-pane rounded-xl border p-6 space-y-4">
        {loading ? (
          <div className="animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-foreground/10" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-40 bg-foreground/10 rounded" />
                <div className="h-3 w-64 bg-foreground/10 rounded" />
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-6 mt-4">
              <div className="md:col-span-2 space-y-2">
                <div className="h-4 w-2/3 bg-foreground/10 rounded" />
                <div className="h-4 w-1/2 bg-foreground/10 rounded" />
                <div className="h-4 w-3/4 bg-foreground/10 rounded" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-24 bg-foreground/10 rounded" />
                <div className="h-4 w-16 bg-foreground/10 rounded" />
              </div>
            </div>
          </div>
        ) : (
          <>
          <div className="flex items-start justify-between gap-4" style={{ backgroundImage: profileConfig.backgroundUrl ? `url(${profileConfig.backgroundUrl})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 12 }}>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-foreground/10 overflow-hidden">
                {pfpUrl ? <img src={pfpUrl} alt={displayName || wallet} className="w-full h-full object-cover" /> : <DefaultAvatar seed={wallet} size={64} className="w-16 h-16 rounded-full" />}
              </div>
              <div>
                <div className="text-2xl font-bold" style={{ color: profileConfig.themeColor || undefined }}>{displayName || `${wallet.slice(0,6)}…${wallet.slice(-4)}`}</div>
                <div className="font-mono text-xs text-muted-foreground">{wallet}</div>
                <div className="mt-1 text-sm">XP: <span className="font-semibold">{xp || 0}</span></div>
              </div>
            </div>
            <a href={`/u/${wallet}`} className="px-3 py-1.5 rounded-md border text-sm">View public page</a>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <h2 className="text-lg font-semibold mb-2">About</h2>
              <p className="text-sm whitespace-pre-wrap">{bio || 'No bio yet.'}</p>
                {profileConfig?.htmlBox && (
                <div className="mt-4 text-sm p-3 rounded-md border bg-background/60 overflow-hidden" dangerouslySetInnerHTML={{ __html: sanitizeHtmlLimited(profileConfig.htmlBox) }} />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2">Top domains</h2>
              <TopDomainsPreview wallet={wallet} />
            </div>
          </div>
          {profileConfig?.songUrl && (
            <div className="pt-2">
              {renderSong(profileConfig.songUrl)}
            </div>
          )}
          </>
        )}
      </div>

      {/* Editor */}
      {editMode && (
        <div className="glass-pane rounded-xl border p-6 space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Theme color</label>
              <input type="color" className="w-full h-9 px-1 border rounded-md bg-background" value={profileConfig.themeColor||'#8b5cf6'} onChange={e=>setProfileConfig({ ...profileConfig, themeColor: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Background image URL</label>
              <input className="w-full h-9 px-3 py-1 border rounded-md bg-background" value={profileConfig.backgroundUrl||''} onChange={e=>setProfileConfig({ ...profileConfig, backgroundUrl: e.target.value })} placeholder="https://…" />
            </div>
            <div className="md:col-span-3">
              <label className="text-sm font-medium">Profile song URL (mp3)</label>
              <input className="w-full h-9 px-3 py-1 border rounded-md bg-background" value={profileConfig.songUrl||''} onChange={e=>setProfileConfig({ ...profileConfig, songUrl: e.target.value })} placeholder="https://…" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Custom HTML box (limited)</label>
              <button type="button" className="text-xs underline" onClick={()=>setShowHtmlHelp(true)}>?</button>
            </div>
            <textarea className="w-full min-h-[120px] px-3 py-2 border rounded-md bg-background" value={profileConfig.htmlBox||''} onChange={e=>setProfileConfig({ ...profileConfig, htmlBox: e.target.value })} placeholder="e.g., <marquee>Welcome!</marquee>" />
            <p className="text-[10px] text-muted-foreground">Basic HTML only. No scripts.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!!profileConfig?.widgets?.showStats} onChange={e=>setProfileConfig({ ...profileConfig, widgets: { ...(profileConfig.widgets||{}), showStats: e.target.checked } })} /> Show stats</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!!profileConfig?.widgets?.showSessions} onChange={e=>setProfileConfig({ ...profileConfig, widgets: { ...(profileConfig.widgets||{}), showSessions: e.target.checked } })} /> Show sessions</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!!profileConfig?.widgets?.showDomains} onChange={e=>setProfileConfig({ ...profileConfig, widgets: { ...(profileConfig.widgets||{}), showDomains: e.target.checked } })} /> Show domains</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!!profileConfig?.widgets?.showLanguages} onChange={e=>setProfileConfig({ ...profileConfig, widgets: { ...(profileConfig.widgets||{}), showLanguages: e.target.checked } })} /> Show languages</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!!profileConfig?.widgets?.showLinks} onChange={e=>setProfileConfig({ ...profileConfig, widgets: { ...(profileConfig.widgets||{}), showLinks: e.target.checked } })} /> Show links</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!!profileConfig?.widgets?.showAbout} onChange={e=>setProfileConfig({ ...profileConfig, widgets: { ...(profileConfig.widgets||{}), showAbout: e.target.checked } })} /> Show about</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={!!profileConfig?.widgets?.showSong} onChange={e=>setProfileConfig({ ...profileConfig, widgets: { ...(profileConfig.widgets||{}), showSong: e.target.checked } })} /> Show song player</label>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="text-sm font-medium">Profile picture URL</label>
              <input className="w-full h-9 px-3 py-1 border rounded-md bg-background" value={pfpUrl} onChange={e=>setPfpUrl(e.target.value)} placeholder="https://…" />
              <div className="mt-2">
                <label className="text-sm font-medium">Or upload</label>
                <input type="file" accept="image/*" className="block mt-1 text-sm" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  (async () => {
                    try {
                      setUploadBusy(true);
                      // Downscale to <=512px and compress to WebP to fit Cosmos item size
                      async function compressToWebP(file: File, maxSide = 512, targetKB = 300): Promise<Blob> {
                        const url = URL.createObjectURL(file);
                        const img = document.createElement('img');
                        const loaded: Promise<void> = new Promise((res, rej) => { img.onload = () => res(); img.onerror = (e) => rej(e); });
                        img.src = url; await loaded; URL.revokeObjectURL(url);
                        const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height;
                        const scale = Math.min(1, maxSide / Math.max(w, h));
                        const ow = Math.max(1, Math.round(w * scale)); const oh = Math.max(1, Math.round(h * scale));
                        const canvas = document.createElement('canvas'); canvas.width = ow; canvas.height = oh;
                        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('no_canvas');
                        ctx.drawImage(img, 0, 0, ow, oh);
                        let q = 0.9; let blob: Blob | null = null;
                        for (let i = 0; i < 6; i++) {
                          blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/webp', q));
                          if (blob && blob.size <= targetKB * 1024) break;
                          q = Math.max(0.5, q - 0.1);
                        }
                        if (!blob) throw new Error('compress_failed');
                        return blob;
                      }
                      const blob = await compressToWebP(f);
                      const fd = new FormData();
                      fd.append('wallet', wallet);
                      fd.append('file', new File([blob], 'pfp.webp', { type: 'image/webp' }));
                      const r = await fetch('/api/users/pfp', { method: 'POST', body: fd });
                      const j = await r.json().catch(()=>({}));
                      if (j?.url) setPfpUrl(j.url);
                      if (!j?.ok && (r.status === 413)) setMsg('Image too large. Try a smaller image.');
                    } catch {}
                    setUploadBusy(false);
                  })();
                }} />
              {pfpUrl ? <div className="mt-2 w-16 h-16 rounded-full overflow-hidden bg-foreground/10"><img src={pfpUrl} alt="preview" className="w-full h-full object-cover" /></div> : null}
                {uploadBusy && <div className="text-[10px] text-muted-foreground mt-1">Uploading…</div>}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Display name</label>
              <input className="w-full h-9 px-3 py-1 border rounded-md bg-background" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Your name or handle" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Bio</label>
            <textarea className="w-full min-h-[120px] px-3 py-2 border rounded-md bg-background" value={bio} onChange={e=>setBio(e.target.value)} placeholder="Tell us about yourself" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Links</label>
              <button type="button" onClick={addLink} className="px-2 py-1 rounded-md border text-xs">Add</button>
            </div>
            <div className="space-y-2 mt-2">
              {links.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <select className="col-span-3 h-9 px-2 border rounded-md bg-background" value={l.label} onChange={e=>setLink(i,'label',e.target.value)}>
                    {(() => {
                      const options = [
                        'Website','X (Twitter)','YouTube','Twitch','Discord','GitHub','LinkedIn','Instagram','Telegram','Email','Suno','SoundCloud'] as const;
                      return options.map(v => <option key={v} value={v}>{v}</option>);
                    })()}
                  </select>
                  <input className="col-span-8 h-9 px-3 py-1 border rounded-md bg-background" placeholder="https://…" value={l.url} onChange={e=>setLink(i,'url',e.target.value)} />
                  <button type="button" onClick={()=>removeLink(i)} className="col-span-1 px-2 rounded-md border">×</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
    {showHtmlHelp && (
      <div className="fixed inset-0 z-40 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={()=>setShowHtmlHelp(false)} />
        <div className="glass-pane relative z-50 w-full max-w-2xl rounded-xl border p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Custom HTML Box – Allowed Elements</h3>
            <button onClick={()=>setShowHtmlHelp(false)} className="px-2 py-1 rounded-md border">Close</button>
          </div>
          <p className="text-sm text-muted-foreground">Basic tags only: p, b, i, u, a, img, br, hr, h1–h3, ul/ol/li, blockquote, marquee. Scripts, iframes, object/embed and inline event handlers are removed for safety.</p>
          <div className="grid md:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="font-medium mb-1">Example 1: Styled welcome</div>
              <pre className="p-2 rounded-md border bg-background/70 whitespace-pre-wrap">{`<h2>Welcome to my page!</h2>
<p>I'm exploring <b>multilingual hosting</b> and long sessions.</p>
<marquee behavior="scroll" direction="left">Have fun!</marquee>`}</pre>
            </div>
            <div>
              <div className="font-medium mb-1">Example 2: Links and image</div>
              <pre className="p-2 rounded-md border bg-background/70 whitespace-pre-wrap">{`<p>Find me on <a href="https://x.com/yourhandle">X</a> and
<a href="https://twitch.tv/yourchannel">Twitch</a>.</p>
<img src="https://picsum.photos/480/160" alt="banner" />`}</pre>
            </div>
          </div>
          <p className="microtext text-muted-foreground">Tip: Use the Song field for Suno/YouTube music embeds. The HTML box does not allow iframes.</p>
        </div>
      </div>
    )}
    </>
  );
}

function TopDomainsPreview({ wallet }: { wallet: string }) {
  const [topics, setTopics] = React.useState<string[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/users/topics?wallet=${encodeURIComponent(wallet)}`);
        const j = await r.json().catch(()=>({}));
        if (!cancelled) setTopics(Array.isArray(j?.topics) ? j.topics : []);
      } catch { if (!cancelled) setTopics([]); }
    })();
    return () => { cancelled = true; };
  }, [wallet]);
  if (!topics || topics.length === 0) return <div className="text-sm text-muted-foreground">Still waiting on first activity</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {topics.map((t, i) => <span key={i} className="px-2 py-1 rounded-md border text-xs">{t}</span>)}
    </div>
  );
}


