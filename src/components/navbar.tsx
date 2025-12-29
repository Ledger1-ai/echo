"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { client, chain, wallets } from "@/lib/thirdweb/client";
import { ChevronDown, Dot, Ellipsis } from "lucide-react";
import { ThirdwebAppProvider } from "@/components/providers/thirdweb-app-provider";
const ConnectButtonDynamic = dynamic(() => import("thirdweb/react").then(m => m.ConnectButton), { ssr: false });

type NavItem = { href: string; label: string; ownerOnly?: boolean; authOnly?: boolean };

// Defer heavy thirdweb ConnectWallet UI until needed

export function Navbar() {
    const [authedWallet, setAuthedWallet] = useState<string | null>(null);
    const owner = (process.env.NEXT_PUBLIC_OWNER_WALLET || "").toLowerCase();
    const isOwner = (authedWallet || "").toLowerCase() === owner && !!owner;
    const pathname = usePathname();
    const signingRef = useRef<Record<string, boolean>>({});

    // Resolve authenticated wallet on mount and register user once cookie is present
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const me = await fetch('/api/auth/me', { cache: 'no-store' }).then(r=>r.ok ? r.json() : { authed: false }).catch(()=>({ authed: false }));
                if (!cancelled && me?.authed && me?.wallet) {
                    const w = String(me.wallet).toLowerCase();
                    setAuthedWallet(w);
                    try { fetch('/api/users/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: w }) }).catch(()=>{}); } catch {}
                }
            } catch {}
        })();
        return () => { cancelled = true; };
    }, []);

    // Post-connect check: give cookie time to persist and then verify once
    useEffect(() => {
        let cancelled = false;
        async function checkAuthed() {
            try {
                await fetch('/api/auth/me', { cache: 'no-store' }).catch(()=>{});
            } catch {}
        }
        const t = setTimeout(checkAuthed, 1200);
        return () => { cancelled = true; clearTimeout(t); };
    }, []);

    const items = useMemo<NavItem[]>(() => {
        const base: NavItem[] = [
            { href: "/console", label: "Console" },
            { href: "/pricing", label: "Pricing" },
            { href: "/audio-setup", label: "Audio Setup" },
        ];
        if (authedWallet) base.push({ href: "/profile", label: "Profile", authOnly: true });
        if (isOwner) base.push({ href: "/admin", label: "Admin", ownerOnly: true });
        return base;
    }, [authedWallet, isOwner]);

    // Animated active underline pointer
    const navRef = useRef<HTMLDivElement | null>(null);
    const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
    const [indicator, setIndicator] = useState<{ left: number; width: number; visible: boolean }>({ left: 0, width: 0, visible: false });

    useEffect(() => {
        function update() {
            const container = navRef.current;
            if (!container) { setIndicator(i => ({ ...i, visible: false })); return; }
            // Force SocialFi highlight for social routes
            const isSocialFiPath = pathname?.startsWith('/live') || pathname?.startsWith('/leaderboard');
            if (isSocialFiPath) {
                const socialEl = linkRefs.current['/socialfi'];
                if (socialEl) {
                    const cb = socialEl.getBoundingClientRect();
                    const nb = container.getBoundingClientRect();
                    setIndicator({ left: cb.left - nb.left, width: cb.width, visible: true });
                    return;
                }
            }
            // Find active item by pathname prefix
            let active: HTMLAnchorElement | null = null;
            let bestLen = -1;
            for (const k of Object.keys(linkRefs.current)) {
                const el = linkRefs.current[k];
                if (!el) continue;
                const href = el.getAttribute('href') || '';
                if (pathname?.startsWith(href) && href.length > bestLen) { active = el; bestLen = href.length; }
            }
            if (!active) { setIndicator(i => ({ ...i, visible: false })); return; }
            const cb = active.getBoundingClientRect();
            const nb = container.getBoundingClientRect();
            setIndicator({ left: cb.left - nb.left, width: cb.width, visible: true });
        }
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [pathname, items.length]);

    // Search UI state
    const [q, setQ] = useState("");
    const [domain, setDomain] = useState("");
    const [platform, setPlatform] = useState("");
    const [language, setLanguage] = useState("");
    const [minXp, setMinXp] = useState<string>("");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [showConnect, setShowConnect] = useState(false);
    const [showConnectMobile, setShowConnectMobile] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [mobileSocialOpen, setMobileSocialOpen] = useState(false);
    const [socialOpen, setSocialOpen] = useState(false);
    const socialHideRef = useRef<number | null>(null);
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        function onDocClick(e: MouseEvent) {
            const t = e.target as Node;
            if (!dropdownRef.current) return;
            if (!dropdownRef.current.contains(t)) setOpen(false);
        }
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    useEffect(() => {
        return () => { if (socialHideRef.current) { clearTimeout(socialHideRef.current); } };
    }, []);

    useEffect(() => {
        const ctrl = new AbortController();
        const term = q.trim();
        if (term.length < 2 && !domain && !platform && !language && !minXp) { setResults([]); setLoading(false); return; }
        setLoading(true);
        const u = new URL('/api/users/search', window.location.origin);
        if (term) u.searchParams.set('q', term);
        if (domain) u.searchParams.set('domains', domain);
        if (platform) u.searchParams.set('platforms', platform);
        if (language) u.searchParams.set('languages', language);
        if (minXp) u.searchParams.set('minXp', String(Math.max(0, parseInt(minXp)||0)));
        u.searchParams.set('limit', '12');
        fetch(u.toString(), { signal: ctrl.signal })
            .then(r => r.json())
            .then(j => { setResults(Array.isArray(j?.users) ? j.users : []); })
            .catch(() => {})
            .finally(() => setLoading(false));
        return () => ctrl.abort();
    }, [q, domain, platform, language, minXp]);

    const consoleItem = useMemo(() => items.find(i => i.href === '/console'), [items]);
    const otherItems = useMemo(() => items.filter(i => i.href !== '/console'), [items]);
    const socialActive = useMemo(() => pathname?.startsWith('/live') || pathname?.startsWith('/leaderboard'), [pathname]);

    return (
		<header className="w-full sticky top-0 z-20 backdrop-blur bg-background/70 border-b">
			<div className="max-w-5xl mx-auto px-4 h-20 flex items-center justify-between">
				<Link href="/" className="flex items-center gap-2 min-w-0">
					<img src="/BasaltEchoWideD.png" alt="BasaltEcho by BasaltHQ" className="w-auto h-14 rounded-md object-contain bg-transparent flex-shrink-0" />
					{/* <span className="hidden sm:inline text-sm md:text-xs font-semibold leading-none">BasaltEcho by BasaltHQ.com</span> */}
				</Link>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <nav ref={navRef} className="relative hidden md:flex items-center gap-0.5 md:gap-1">
						{consoleItem ? (
							<Link
								key={consoleItem.href}
								href={consoleItem.href}
								ref={el => { linkRefs.current[consoleItem.href] = el; }}
								className={"px-2 py-0.5 microtext text-[9px] md:text-[9px] lg:text-[10px] rounded-md hover:bg-foreground/5 transition-colors " + (pathname?.startsWith(consoleItem.href) ? "text-foreground" : "text-foreground/80")}
							>
								{consoleItem.label}
							</Link>
						) : null}
					<div
						className="relative -mt-1"
						onMouseEnter={() => {
							if (socialHideRef.current) clearTimeout(socialHideRef.current);
							setSocialOpen(true);
						}}
						onMouseLeave={() => {
							if (socialHideRef.current) clearTimeout(socialHideRef.current);
							socialHideRef.current = window.setTimeout(() => setSocialOpen(false), 180);
						}}
					>
							<Link
								href="/live"
								ref={el => { linkRefs.current['/socialfi'] = el; }}
								className={"px-2 py-0.5 microtext text-[9px] md:text-[9px] lg:text-[10px] rounded-md hover:bg-foreground/5 transition-colors inline-flex items-center leading-none " + (socialActive ? "text-foreground" : "text-foreground/80")}
							>
								SocialFi
								<ChevronDown className="inline-block ml-1 opacity-80 h-3 w-3" />
							</Link>
							{socialOpen ? (
								<div className="absolute left-0 top-full mt-0 z-10 glass-float rounded-md border p-1">
									<Link href="/live" className="block px-3 py-1.5 microtext text-[10px] rounded-md hover:bg-foreground/5">Live Now</Link>
									<Link href="/leaderboard" className="block px-3 py-1.5 microtext text-[10px] rounded-md hover:bg-foreground/5">Leaderboard</Link>
								</div>
							) : null}
						</div>
						{otherItems.map(it => (
							<Link
								key={it.href}
								href={it.href}
								ref={el => { linkRefs.current[it.href] = el; }}
								className={"px-2 py-0.5 microtext text-[9px] md:text-[9px] lg:text-[10px] rounded-md hover:bg-foreground/5 transition-colors " + (pathname?.startsWith(it.href) ? "text-foreground" : "text-foreground/80")}
							>
								{it.label}
							</Link>
						))}
						{/* Animated underline */}
						{indicator.visible ? (
							<span
								className="absolute bottom-0 h-[2px] rounded bg-[var(--primary)] transition-all duration-200"
								style={{ left: indicator.left, width: indicator.width }}
							/>
						) : null}
					</nav>
                    {/* Search */}
                    <div className="relative flex items-center gap-1" ref={dropdownRef}>
                        <div className="hidden sm:flex items-center gap-2">
							<input
								value={q}
								onChange={e=>{ setQ(e.target.value); setOpen(true); }}
								placeholder="Search users"
								className="w-48 h-9 px-3 py-1 rounded-md bg-foreground/5 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm"
							/>
							<button title="Filters" onClick={()=>setOpen(o=>!o)} className="w-9 h-9 grid place-items-center rounded-md hover:bg-foreground/5">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 3H2l8 9v7l4 2v-9l8-9z"/></svg>
							</button>
                        </div>
						{/* Mobile search trigger */}
						<button className="sm:hidden w-9 h-9 grid place-items-center rounded-md glass-pane border hover:bg-foreground/10" onClick={()=>setOpen(o=>!o)} aria-label="Search">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>
                        </button>
						{/* Mobile hamburger */}
						<button className="md:hidden w-9 h-9 grid place-items-center rounded-md glass-pane border hover:bg-foreground/10 ml-1" onClick={()=>setMobileOpen(o=>!o)} aria-label="Menu">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
                        </button>
                        {open && (
                            <div className="fixed inset-0 z-40 flex items-start justify-center pt-16">
                                <div className="absolute inset-0 glass-backdrop" onClick={()=>setOpen(false)} />
                                <div className="relative w-[min(520px,calc(100vw-24px))] max-h-[75vh] glass-float rounded-xl border p-3 text-sm">
                                <div className="mb-2">
                                    <label className="text-xs">Search</label>
                                    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search users"
                                        className="mt-1 h-9 w-full px-3 rounded-md bg-foreground/10 focus:outline-none" />
                                </div>
								<div className="grid grid-cols-2 gap-2">
									<label className="text-xs">Domain<input value={domain} onChange={e=>setDomain(e.target.value)} className="mt-1 h-8 w-full px-2 rounded-md bg-foreground/10 focus:outline-none" placeholder="e.g., podcasts" /></label>
									<label className="text-xs">Platform<input value={platform} onChange={e=>setPlatform(e.target.value)} className="mt-1 h-8 w-full px-2 rounded-md bg-foreground/10 focus:outline-none" placeholder="e.g., Twitch" /></label>
									<label className="text-xs">Language<input value={language} onChange={e=>setLanguage(e.target.value)} className="mt-1 h-8 w-full px-2 rounded-md bg-foreground/10 focus:outline-none" placeholder="e.g., English" /></label>
									<label className="text-xs">Min XP<input value={minXp} onChange={e=>setMinXp(e.target.value)} inputMode="numeric" className="mt-1 h-8 w-full px-2 rounded-md bg-foreground/10 focus:outline-none" placeholder="0" /></label>
								</div>
								<div className="mt-3 max-h-72 overflow-auto divide-y divide-foreground/10">
									{loading ? <div className="py-6 text-center opacity-75">Searching <Ellipsis className="inline h-3 w-3 align-[-2px]" /></div> : null}
									{!loading && results.length === 0 ? <div className="py-6 text-center opacity-75">No matches</div> : null}
									{results.map(u => {
										const name = u.displayName || (u.wallet ? `${u.wallet.slice(0,6)}...${u.wallet.slice(-4)}` : 'User');
										return (
											<a key={u.wallet} href={`/u/${u.wallet}`} className="flex items-center justify-between gap-3 py-2 hover:bg-foreground/5 px-2 rounded-md">
												<span className="flex items-center gap-3">
													<span className="w-8 h-8 rounded-full overflow-hidden bg-foreground/10">
														{u.pfpUrl ? <img src={u.pfpUrl} alt={name} className="w-full h-full object-cover" /> : <span className="w-8 h-8 block" />}
													</span>
													<span className="flex flex-col">
														<span className="font-medium leading-tight">{name}</span>
														<span className="microtext text-muted-foreground">{u.wallet.slice(0,10)}... <Dot className="inline h-3 w-3 mx-1" /> {u.xp||0} XP</span>
													</span>
												</span>
												<span className="hidden md:flex items-center gap-2">
													{(u.domains||[]).slice(0,1).map((d: string, i: number) => <span key={i} className="px-2 py-0.5 rounded-md border text-xs opacity-80">{d}</span>)}
													{(u.platforms||[]).slice(0,1).map((p: string, i: number) => <span key={i} className="px-2 py-0.5 rounded-md border text-xs opacity-80">{p}</span>)}
												</span>
											</a>
										);
									})}
								</div>
                                </div>
                            </div>
						)}
                    </div>
                    <div className="hidden md:block">
                      <ThirdwebAppProvider>
                        <ConnectButtonDynamic
                          client={client}
                          chain={chain}
                          wallets={wallets}
                          connectButton={{
                            label: <span className="microtext">Login</span>,
                            className: "px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#ffc029]",
                            style: {
                              backgroundColor: "transparent",
                                border: "1px solid #ffc029",
                              color: "#e5e7eb",
                              padding: "6px 10px",
                              lineHeight: "1",
                              height: "28px",
                            },
                          }}
                          signInButton={{
                            label: "Authenticate",
                              className: "px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#ffc029]",
                            style: {
                              backgroundColor: "transparent",
                              border: "1px solid #ffc029",
                              color: "#e5e7eb",
                              padding: "6px 10px",
                              lineHeight: "1",
                              height: "28px",
                            },
                          }}
                          connectModal={{ title: "Login", titleIcon: "/bssymbol.png", size: "compact" }}
                        />
                      </ThirdwebAppProvider>
                    </div>
				</div>
			</div>
            {/* Mobile menu overlay */}
            {mobileOpen && (
                <div className="fixed inset-0 z-30 md:hidden">
                    <div className="absolute inset-0 glass-backdrop" onClick={()=>setMobileOpen(false)} />
                    <div className="absolute top-14 left-0 right-0 glass-float rounded-b-xl border p-3 space-y-2">
                        <nav className="flex flex-col">
                            {consoleItem ? (
                                <Link key={consoleItem.href} href={consoleItem.href} onClick={()=>setMobileOpen(false)} className={"px-3 py-2 microtext text-[11px] rounded-md hover:bg-foreground/10 " + (pathname?.startsWith(consoleItem.href) ? "text-foreground" : "text-foreground/80")}>{consoleItem.label}</Link>
                            ) : null}
						<button onClick={()=>setMobileSocialOpen(o=>!o)} className="px-3 py-2 microtext text-[11px] rounded-md hover:bg-foreground/10 flex items-center justify-between">
                                <span className={socialActive ? "text-foreground" : "text-foreground/80"}>SocialFi</span>
                                <span className={"opacity-80 transition-transform " + (mobileSocialOpen ? "rotate-180" : "")}> 
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                                </span>
                            </button>
                            {mobileSocialOpen ? (
                                <div className="pl-3">
                                    <Link href="/live" onClick={()=>setMobileOpen(false)} className={"px-3 py-2 microtext text-[11px] rounded-md hover:bg-foreground/10 " + (pathname?.startsWith('/live') ? "text-foreground" : "text-foreground/80")}>Live Now</Link>
                                    <Link href="/leaderboard" onClick={()=>setMobileOpen(false)} className={"px-3 py-2 microtext text-[11px] rounded-md hover:bg-foreground/10 " + (pathname?.startsWith('/leaderboard') ? "text-foreground" : "text-foreground/80")}>Leaderboard</Link>
                                </div>
                            ) : null}
                            {otherItems.map(it => (
                                <Link key={it.href} href={it.href} onClick={()=>setMobileOpen(false)} className={"px-3 py-2 microtext text-[11px] rounded-md hover:bg-foreground/10 " + (pathname?.startsWith(it.href) ? "text-foreground" : "text-foreground/80")}>{it.label}</Link>
                            ))}
                        </nav>
                        <div className="pt-2">
                          <ThirdwebAppProvider>
                            <ConnectButtonDynamic
                              client={client}
                              chain={chain}
                              wallets={wallets}
                              connectButton={{
                                label: <span className="microtext">Login</span>,
                                  className: "w-full px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#ffc029]",
                                style: {
                                  backgroundColor: "transparent",
                                  border: "1px solid #ffc029",
                                  color: "#e5e7eb",
                                  padding: "6px 10px",
                                  lineHeight: "1",
                                  height: "28px",
                                },
                              }}
                              signInButton={{
                                label: "Authenticate",
                                  className: "w-full px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#ffc029]",
                                style: {
                                  backgroundColor: "transparent",
                                  border: "1px solid #ffc029",
                                  color: "#e5e7eb",
                                  padding: "6px 10px",
                                  lineHeight: "1",
                                  height: "28px",
                                },
                              }}
                              connectModal={{ title: "Login", titleIcon: "/bssymbol.png", size: "compact" }}
                            />
                          </ThirdwebAppProvider>
                        </div>
                    </div>
                </div>
            )}
		</header>
    );
}
