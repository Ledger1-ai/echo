"use client";

import { useEffect, useMemo, useState } from "react";
import { DefaultAvatar } from "@/components/default-avatar";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";
import { useActiveAccount } from "thirdweb/react";

type UserRow = {
  wallet: string;
  purchasedSeconds: number;
  usedSeconds: number;
  balanceSeconds: number;
  purchasedHMS?: { h: number; m: number; s: number; text: string };
  usedHMS?: { h: number; m: number; s: number; text: string };
  balanceHMS?: { h: number; m: number; s: number; text: string };
  xp?: number;
  displayName?: string;
  pfpUrl?: string;
  lastSeen?: number;
  plan?: "basic" | "unlimited" | null;
  planExpiry?: number | null;
};

export default function AdminPage() {
  const account = useActiveAccount();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState("");
	const [pageSize, setPageSize] = useState(10);
	const [page, setPage] = useState(1);
	const [sortKey, setSortKey] = useState<"name"|"xp"|"purchased"|"used"|"balance"|"last">("last");
	const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [siteStory, setSiteStory] = useState("");
  const [savingStory, setSavingStory] = useState(false);
  const [storyHtml, setStoryHtml] = useState("");
  const [defiEnabled, setDefiEnabled] = useState(true);
  const [defiLocalOverride, setDefiLocalOverride] = useState(false);
  const [savingDefi, setSavingDefi] = useState(false);
  const [pricing, setPricing] = useState<{ ethPer2Min: number; minMinutes: number; discountRules: { minMinutes: number; discountPct: number }[] }>({ ethPer2Min: 0.001, minMinutes: 2, discountRules: [] });
  const [savingCfg, setSavingCfg] = useState(false);
  // Credit adjustment modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [opType, setOpType] = useState<"grant"|"deduct"|"migrate"|"migrate_stats"|"edit">("grant");
  const [targetWallet, setTargetWallet] = useState("");
  const [fromWallet, setFromWallet] = useState("");
  const [toWallet, setToWallet] = useState("");
  const [minutes, setMinutes] = useState<number>(15);
  const [savingAdjust, setSavingAdjust] = useState(false);
  const [adjustError, setAdjustError] = useState<string>("");
  const [sliderMinutes, setSliderMinutes] = useState<number>(15);
  // Edit user fields
  const [editPurchasedSeconds, setEditPurchasedSeconds] = useState<number>(0);
  const [editUsedSeconds, setEditUsedSeconds] = useState<number>(0);
  const [editXp, setEditXp] = useState<number>(0);
  const [editDisplayName, setEditDisplayName] = useState<string>("");
  const [editPfpUrl, setEditPfpUrl] = useState<string>("");
  const [editPlan, setEditPlan] = useState<"none"|"basic"|"unlimited">("none");
  const [editPlanExpiry, setEditPlanExpiry] = useState<number>(0);
  const [editMetricsText, setEditMetricsText] = useState<string>("{}");
  // Edit user time inputs (H:M:S)
  const [editPurchasedH, setEditPurchasedH] = useState<number>(0);
  const [editPurchasedM, setEditPurchasedM] = useState<number>(0);
  const [editPurchasedS, setEditPurchasedS] = useState<number>(0);
  const [editUsedH, setEditUsedH] = useState<number>(0);
  const [editUsedM, setEditUsedM] = useState<number>(0);
  const [editUsedS, setEditUsedS] = useState<number>(0);
  // Data maintenance state
  const [repairingAll, setRepairingAll] = useState(false);
  const [repairingOne, setRepairingOne] = useState(false);
  const [repairWallet, setRepairWallet] = useState("");
  const [forceRecomputeXp, setForceRecomputeXp] = useState(true);
  const [xpAdjusting, setXpAdjusting] = useState(false);
  const [xpAdjustWallet, setXpAdjustWallet] = useState("");
  const [xpAdjustValue, setXpAdjustValue] = useState<number>(0);
  // Migrate stats options (default: all selected; wipe source for selected stats)
  const [msXp, setMsXp] = useState(true);
  const [msUsedSeconds, setMsUsedSeconds] = useState(true);
  const [msDomains, setMsDomains] = useState(true);
  const [msLanguages, setMsLanguages] = useState(true);
  const [msPlatforms, setMsPlatforms] = useState(true);
  const [msTopics, setMsTopics] = useState(true);
  const [msDisplayName, setMsDisplayName] = useState(true);
  const [msPfpUrl, setMsPfpUrl] = useState(true);
  const [msWipe, setMsWipe] = useState(true);
  const owner = (process.env.NEXT_PUBLIC_OWNER_WALLET || "").toLowerCase();
  const isOwner = (account?.address || "").toLowerCase() === owner && !!owner;

  // SpawnCamp admin deployment controls
  const [netMode, setNetMode] = useState<"Mainnet"|"Testnet">("Testnet");
  const [ethAgg, setEthAgg] = useState<string>("");
  const [deploySynthetic, setDeploySynthetic] = useState<boolean>(true);
  const [adminMsg, setAdminMsg] = useState<string>("");
  const [deploying, setDeploying] = useState<boolean>(false);
  // Optional addresses captured from deployment; persisted to .env.local by API
  const [factoryAddr, setFactoryAddr] = useState<string>("");
  const [synthEthAgg, setSynthEthAgg] = useState<string>("");
  const [synthUsdcAgg, setSynthUsdcAgg] = useState<string>("");
  const [synthUsdtAgg, setSynthUsdtAgg] = useState<string>("");
  const [synthCbbtcAgg, setSynthCbbtcAgg] = useState<string>("");
  const [synthCbxrpAgg, setSynthCbxrpAgg] = useState<string>("");

  async function adminAction(action: "set_network_mode" | "configure_mainnet_feeds" | "configure_testnet_feeds" | "deploy_synthetic_feeds" | "deploy_factory") {
    try {
      setDeploying(true);
      setAdminMsg("");
      const res = await fetch("/api/defi/spawncamp/admin/deploy", {
        method: "POST",
        headers: { "Content-Type":"application/json", "x-wallet": (account?.address || "") },
        body: JSON.stringify({
          action,
          mode: netMode,
          ethAggregator: ethAgg || undefined,
          deploySynthetic,
          // When wired to real deployments, these will be filled by returned tx results.
          // For now, you can paste known addresses to persist them to .env.local.
          addresses: {
            factory: factoryAddr || undefined,
            synthETH: synthEthAgg || undefined,
            synthUSDC: synthUsdcAgg || undefined,
            synthUSDT: synthUsdtAgg || undefined,
            synthCBBTC: synthCbbtcAgg || undefined,
            synthCBXRP: synthCbxrpAgg || undefined,
          },
        }),
      });
      const j = await res.json().catch(()=>({}));
      if (!res.ok) {
        setAdminMsg(j?.error || "error");
        return;
      }
      setAdminMsg(j?.message || "OK");
    } catch (e: any) {
      setAdminMsg(e?.message || "failed");
    } finally {
      setDeploying(false);
    }
  }

  useEffect(() => {
    if (!isOwner) return;
    setLoading(true);
    fetch('/api/admin/users', { headers: { 'x-wallet': (account?.address || '') } })
      .then(r => r.json())
      .then(j => setRows(j.users || []))
      .finally(() => setLoading(false));
    // Load pricing config
    fetch('/api/pricing/config')
      .then(r => r.json())
      .then(j => {
        const cfg = j?.config || {};
        setPricing({
          ethPer2Min: Number(cfg.ethPer2Min || 0.001),
          minMinutes: Math.max(1, Number(cfg.minMinutes || 2)),
          discountRules: Array.isArray(cfg.discountRules) ? cfg.discountRules : [],
        });
      })
      .catch(()=>{});
    // Load site story / modules
    fetch('/api/site/config')
      .then(r => r.json())
      .then(j => {
        const cfg = j?.config || {};
        setSiteStory(String(cfg?.story || ""));
        setStoryHtml(String(cfg?.storyHtml || ""));
        setDefiEnabled(cfg?.defiEnabled !== false);
      })
      .catch(() => {});
    try {
      const has = typeof document !== "undefined" && document.cookie.split(";").some(c => c.trim().startsWith("cb_defi_local_override="));
      setDefiLocalOverride(!!has);
    } catch {}
  }, [isOwner, account?.address]);

	// helpers for table interactions
	const getName = (r: UserRow) => r.displayName || `${r.wallet.slice(0,6)}…${r.wallet.slice(-4)}`;
	const getXp = (r: UserRow) => (Number.isFinite(r.xp as number) ? Number(r.xp || 0) : Math.floor((r.usedSeconds||0) / 600));
	const isSystemEntry = (r: UserRow) => {
		const nm = (r.displayName || "").toLowerCase();
		return nm.includes('config') || nm.startsWith('site:') || nm.startsWith('site ');
	};

	const filteredSorted = useMemo(() => {
		let arr = rows.slice();
		// Always filter system/config rows client-side as a final guard
		arr = arr.filter(r => !isSystemEntry(r));
		if (search.trim()) {
			const q = search.trim().toLowerCase();
			arr = arr.filter(r => (r.displayName || "").toLowerCase().includes(q) || (r.wallet || "").toLowerCase().includes(q));
		}
		arr.sort((a,b) => {
			let av: any; let bv: any;
			switch (sortKey) {
				case 'name': av = getName(a).toLowerCase(); bv = getName(b).toLowerCase(); break;
				case 'xp': av = getXp(a); bv = getXp(b); break;
				case 'purchased': av = a.purchasedSeconds||0; bv = b.purchasedSeconds||0; break;
				case 'used': av = a.usedSeconds||0; bv = b.usedSeconds||0; break;
				case 'balance': av = a.balanceSeconds||0; bv = b.balanceSeconds||0; break;
				case 'last': default: av = a.lastSeen||0; bv = b.lastSeen||0; break;
			}
			const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av - bv);
			return sortDir === 'asc' ? cmp : -cmp;
		});
		return arr;
	}, [rows, search, sortKey, sortDir]);

	const totalUsers = rows.length;
	const totalFiltered = filteredSorted.length;
	const totalPages = Math.max(1, Math.ceil(totalFiltered / Math.max(1, pageSize)));
	const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * Math.max(1, pageSize);
    return filteredSorted.slice(start, start + Math.max(1, pageSize));
  }, [filteredSorted, currentPage, pageSize]);

  // Selected users for modal details
  const targetUser = useMemo(() => filteredSorted.find(u => u.wallet === targetWallet), [filteredSorted, targetWallet]);
  const fromUser = useMemo(() => filteredSorted.find(u => u.wallet === fromWallet), [filteredSorted, fromWallet]);
  const toUser = useMemo(() => filteredSorted.find(u => u.wallet === toWallet), [filteredSorted, toWallet]);
  const maxTransferMinutes = useMemo(() => Math.max(0, Math.floor(((fromUser?.balanceSeconds || 0)) / 60)), [fromUser]);

  // Prefill edit fields when selecting a user
  useEffect(() => {
    if (opType === "edit" && targetUser) {
      const p = targetUser.purchasedHMS || {
        h: Math.floor((Number(targetUser.purchasedSeconds || 0)) / 3600),
        m: Math.floor(((Number(targetUser.purchasedSeconds || 0)) % 3600) / 60),
        s: Math.floor((Number(targetUser.purchasedSeconds || 0)) % 60),
      };
      setEditPurchasedH(p.h); setEditPurchasedM(p.m); setEditPurchasedS(p.s);

      const u = targetUser.usedHMS || {
        h: Math.floor((Number(targetUser.usedSeconds || 0)) / 3600),
        m: Math.floor(((Number(targetUser.usedSeconds || 0)) % 3600) / 60),
        s: Math.floor((Number(targetUser.usedSeconds || 0)) % 60),
      };
      setEditUsedH(u.h); setEditUsedM(u.m); setEditUsedS(u.s);
      setEditXp(Number(targetUser.xp || 0));
      setEditDisplayName(String(targetUser.displayName || ""));
      setEditPfpUrl(String(targetUser.pfpUrl || ""));
      setEditPlan(targetUser.plan ? (targetUser.plan === "basic" || targetUser.plan === "unlimited" ? targetUser.plan : "none") : "none");
      setEditPlanExpiry(Number(targetUser.planExpiry || 0));
      setEditMetricsText((prev) => prev || "{}");
    }
  }, [opType, targetUser]);

	function toggleSort(col: typeof sortKey) {
		if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
		else { setSortKey(col); setSortDir(col === 'name' ? 'asc' : 'desc'); }
	}

	function Arrow({ forKey }: { forKey: typeof sortKey }) {
		if (sortKey !== forKey) return null as any;
		return (sortDir === 'asc'
      ? <ChevronUp className="ml-1 inline h-3 w-3 opacity-70" />
      : <ChevronDown className="ml-1 inline h-3 w-3 opacity-70" />
    ) as any;
	}

  async function grant(wallet: string, seconds: number) {
    await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wallet': (account?.address || '') }, body: JSON.stringify({ wallet, seconds }) });
    // refresh
    const j = await fetch('/api/admin/users', { headers: { 'x-wallet': (account?.address || '') } }).then(r=>r.json());
    setRows(j.users || []);
  }

  async function adjustCredits() {
    try {
      setSavingAdjust(true);
      setAdjustError("");
      const seconds = opType === 'migrate'
        ? Math.max(1, Math.floor(Number(sliderMinutes || 0) * 60))
        : Math.max(1, Math.floor(Number(minutes || 0) * 60));
      if (opType === 'edit') {
        const w = (targetWallet || '').toLowerCase();
        if (!w) { setAdjustError("Select a target user"); return; }
        let metricsObj: any = undefined;
        const mt = (editMetricsText || "").trim();
        if (mt.length > 0) {
          try { metricsObj = JSON.parse(mt); }
          catch { setAdjustError("Metrics must be valid JSON"); return; }
        }
        const body: any = {
          wallet: w,
          action: "set_user",
          purchasedSeconds: Math.max(0, (Number(editPurchasedH || 0) * 3600 + Number(editPurchasedM || 0) * 60 + Number(editPurchasedS || 0))),
          usedSeconds: Math.max(0, (Number(editUsedH || 0) * 3600 + Number(editUsedM || 0) * 60 + Number(editUsedS || 0))),
          xp: Math.max(0, Math.floor(Number(editXp || 0))),
          displayName: editDisplayName || undefined,
          pfpUrl: editPfpUrl || undefined,
          metrics: metricsObj,
        };
        if (editPlan === "none") {
          body.plan = "none";
          body.planExpiry = undefined;
        } else if (editPlan === "basic" || editPlan === "unlimited") {
          body.plan = editPlan;
          if (Number(editPlanExpiry || 0) > 0) body.planExpiry = Number(editPlanExpiry || 0);
        }
        const r = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-wallet': (account?.address || '') },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(()=>({}));
        if (!r.ok) { setAdjustError(j?.error || "error"); return; }
      } else if (opType === 'grant' || opType === 'deduct') {
        const w = (targetWallet || '').toLowerCase();
        if (!w) { setAdjustError("Select a target user"); return; }
        const r = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-wallet': (account?.address || '') },
          body: JSON.stringify({ wallet: w, action: opType, seconds }),
        });
        const j = await r.json().catch(()=>({}));
        if (!r.ok) { setAdjustError(j?.error || "error"); return; }
      } else {
        const f = (fromWallet || '').toLowerCase();
        const t = (toWallet || '').toLowerCase();
        if (!f || !t) { setAdjustError("Select both users"); return; }
        const body = opType === "migrate"
          ? { wallet: t, action: "migrate", fromWallet: f, toWallet: t, seconds }
          : {
              wallet: t,
              action: "migrate_stats",
              fromWallet: f,
              toWallet: t,
              migrateOptions: {
                xp: msXp,
                usedSeconds: msUsedSeconds,
                domains: msDomains,
                languages: msLanguages,
                platforms: msPlatforms,
                topics: msTopics,
                displayName: msDisplayName,
                pfpUrl: msPfpUrl,
                wipeSourceSelected: msWipe,
              },
            };
        const r = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-wallet': (account?.address || '') },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(()=>({}));
        if (!r.ok) { setAdjustError(j?.error || "error"); return; }
      }
      // refresh users after change
      const k = await fetch('/api/admin/users', { headers: { 'x-wallet': (account?.address || '') } }).then(r=>r.json());
      setRows(k.users || []);
      setSettingsOpen(false);
      setTargetWallet(""); setFromWallet(""); setToWallet("");
    } finally {
      setSavingAdjust(false);
    }
  }

  // Admin repair: recompute aggregates for all users from events
  async function recomputeAll(forceXp: boolean) {
    try {
      setRepairingAll(true);
      setAdjustError("");
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-wallet': (account?.address || '') },
        body: JSON.stringify({ action: 'recompute_all', forceXp }),
      });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) { setAdjustError(j?.error || "error"); return; }
      // refresh users
      const k = await fetch('/api/admin/users', { headers: { 'x-wallet': (account?.address || '') } }).then(r=>r.json());
      setRows(k.users || []);
    } finally {
      setRepairingAll(false);
    }
  }

  // Admin repair: recompute a single user's aggregates from events
  async function recomputeUser(forceXp: boolean) {
    try {
      setRepairingOne(true);
      setAdjustError("");
      const w = (repairWallet || '').toLowerCase();
      if (!/^0x[a-f0-9]{40}$/i.test(w)) { setAdjustError("Enter a valid 0x wallet"); return; }
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-wallet': (account?.address || '') },
        body: JSON.stringify({ action: 'recompute_user', wallet: w, forceXp }),
      });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) { setAdjustError(j?.error || "error"); return; }
      // refresh users
      const k = await fetch('/api/admin/users', { headers: { 'x-wallet': (account?.address || '') } }).then(r=>r.json());
      setRows(k.users || []);
    } finally {
      setRepairingOne(false);
    }
  }

  // Admin: manually set a user's XP
  async function setUserXp() {
    try {
      setXpAdjusting(true);
      setAdjustError("");
      const w = (xpAdjustWallet || '').toLowerCase();
      if (!/^0x[a-f0-9]{40}$/i.test(w)) { setAdjustError("Select a valid wallet"); return; }
      const xp = Math.max(0, Math.floor(Number(xpAdjustValue || 0)));
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-wallet': (account?.address || '') },
        body: JSON.stringify({ action: 'set_xp', wallet: w, xp }),
      });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) { setAdjustError(j?.error || "error"); return; }
      // refresh users
      const k = await fetch('/api/admin/users', { headers: { 'x-wallet': (account?.address || '') } }).then(r=>r.json());
      setRows(k.users || []);
    } finally {
      setXpAdjusting(false);
    }
  }

	// reset page when filters change
	useEffect(() => { setPage(1); }, [search, pageSize]);

  if (!isOwner) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="glass-pane rounded-xl border p-6">
          <h1 className="text-2xl font-semibold mb-2">Admin</h1>
          <p className="microtext text-muted-foreground">Connect with the owner wallet to access this page.</p>
          <div className="mt-3 p-3 rounded-md border microtext">
            <div className="text-muted-foreground">Owner access required</div>
            <div>Expected owner: <code className="text-xs">{owner || "(unset)"}</code></div>
            <div>Connected wallet: <code className="text-xs">{(account?.address || "").toLowerCase() || "(not connected)"}</code></div>
            <div className="mt-2 text-muted-foreground">
              Tip: If you recently changed .env.local (NEXT_PUBLIC_OWNER_WALLET), restart the dev server to apply environment changes.
            </div>
          </div>

      </div>
    </div>
  );
}

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin</h1>
        <div className="flex items-center gap-2">
          <span className="microtext badge-soft">{loading ? 'Loading…' : `${totalUsers} users`}</span>
          <button className="px-3 py-1.5 rounded-md border" onClick={()=>setSettingsOpen(true)}>Adjustments</button>
        </div>
      </div>

      {/* SpawnCamp Launchpad Deployment */}
      <div className="glass-pane rounded-xl border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">SpawnCamp Launchpad Deployment</h2>
          <span className="microtext text-muted-foreground">Admin-only</span>
        </div>
        <p className="microtext text-muted-foreground">Configure network mode and deploy/configure contracts needed for the launchpad.</p>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">Network Mode</label>
            <select className="w-full h-9 px-2 border rounded-md bg-background" value={netMode} onChange={e=>setNetMode(e.target.value as any)}>
              <option value="Mainnet">Mainnet</option>
              <option value="Testnet">Testnet</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">ETH Aggregator (Mainnet)</label>
            <input type="text" className="w-full h-9 px-3 py-1 border rounded-md bg-background" placeholder="0x..." value={ethAgg} onChange={e=>setEthAgg(e.target.value)} />
            <div className="microtext text-muted-foreground mt-1">Optional. Base mainnet Chainlink ETH/WETH aggregator address.</div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Deploy Synthetic Feeds (Testnet)</label>
            <input type="checkbox" className="accent-[var(--primary)]" checked={deploySynthetic} onChange={e=>setDeploySynthetic(e.target.checked)} />
          </div>
        </div>
        <div className="mt-2 grid md:grid-cols-2 gap-3">
          <div className="p-3 rounded-md border">
            <div className="microtext text-muted-foreground mb-2">Advanced: Persist addresses to .env.local</div>
            <label className="text-sm font-medium">Factory Address</label>
            <input type="text" className="w-full h-9 px-3 py-1 border rounded-md bg-background mb-2" placeholder="0x..." value={factoryAddr} onChange={e=>setFactoryAddr(e.target.value)} />
            <div className="grid md:grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium">Synth ETH Agg</label>
                <input type="text" className="w-full h-9 px-3 py-1 border rounded-md bg-background" placeholder="0x..." value={synthEthAgg} onChange={e=>setSynthEthAgg(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Synth USDC Agg</label>
                <input type="text" className="w-full h-9 px-3 py-1 border rounded-md bg-background" placeholder="0x..." value={synthUsdcAgg} onChange={e=>setSynthUsdcAgg(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Synth USDT Agg</label>
                <input type="text" className="w-full h-9 px-3 py-1 border rounded-md bg-background" placeholder="0x..." value={synthUsdtAgg} onChange={e=>setSynthUsdtAgg(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Synth cbBTC Agg</label>
                <input type="text" className="w-full h-9 px-3 py-1 border rounded-md bg-background" placeholder="0x..." value={synthCbbtcAgg} onChange={e=>setSynthCbbtcAgg(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Synth cbXRP Agg</label>
                <input type="text" className="w-full h-9 px-3 py-1 border rounded-md bg-background" placeholder="0x..." value={synthCbxrpAgg} onChange={e=>setSynthCbxrpAgg(e.target.value)} />
              </div>
            </div>
            <div className="microtext text-muted-foreground mt-2">After updates, restart your dev server to reload environment variables.</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button className="px-3 py-1.5 rounded-md border" disabled={deploying} onClick={()=>adminAction("set_network_mode")}>{deploying ? "Working…" : "Set Network Mode"}</button>
          <button className="px-3 py-1.5 rounded-md border" disabled={deploying} onClick={()=>adminAction("configure_mainnet_feeds")}>{deploying ? "Working…" : "Configure Mainnet Feeds"}</button>
          <button className="px-3 py-1.5 rounded-md border" disabled={deploying} onClick={()=>adminAction("configure_testnet_feeds")}>{deploying ? "Working…" : "Configure Testnet Feeds"}</button>
          <button className="px-3 py-1.5 rounded-md border" disabled={deploying} onClick={()=>adminAction("deploy_synthetic_feeds")}>{deploying ? "Working…" : "Deploy Synthetic Feeds"}</button>
          <button className="px-3 py-1.5 rounded-md border col-span-full" disabled={deploying} onClick={()=>adminAction("deploy_factory")}>{deploying ? "Working…" : "Deploy SpawnCamp Factory"}</button>
        </div>
        {adminMsg && <div className="microtext text-muted-foreground">{adminMsg}</div>}
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 glass-backdrop" onClick={()=>setSettingsOpen(false)} />
          <div className="glass-float rounded-xl border p-5 w-[92vw] max-w-xl relative">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-lg font-semibold">Adjustments</div>
                <div className="microtext text-muted-foreground">Owner-only tools to grant, deduct, migrate minutes, or edit user</div>
              </div>
              <button className="px-2 py-1 rounded-md border text-xs" onClick={()=>setSettingsOpen(false)}>Close</button>
            </div>

            <div className="space-y-4">
              <label className="text-sm font-medium">
                Operation
                <select className="w-full h-9 px-2 border rounded-md bg-background" value={opType} onChange={e=>setOpType(e.target.value as any)}>
                  <option value="grant">Add credits</option>
                  <option value="deduct">Delete credits</option>
                  <option value="edit">Edit user</option>
                  <option value="migrate">Migrate credits</option>
                  <option value="migrate_stats">Migrate stats</option>
                </select>
              </label>

              {opType !== 'migrate' && opType !== 'migrate_stats' ? (
                <>
                  <label className="text-sm font-medium">Target user</label>
                  <select className="w-full h-9 px-2 border rounded-md bg-background" value={targetWallet} onChange={e=>setTargetWallet(e.target.value)}>
                    <option value="">Select wallet…</option>
                    {filteredSorted.map(u => (
                      <option key={u.wallet} value={u.wallet}>
                        {getName(u)} ({u.wallet.slice(0,10)}…) • Bal {Math.floor(u.balanceSeconds/60)}m {u.balanceSeconds%60}s • Purch {Math.floor(u.purchasedSeconds/60)}m • Used {Math.floor(u.usedSeconds/60)}m
                      </option>
                    ))}
                  </select>

                  {targetUser && (
                    <div className="flex items-center gap-3 p-3 border rounded-md glass-pane">
                      <span className="w-8 h-8 rounded-full overflow-hidden bg-foreground/10">
                        {targetUser.pfpUrl ? (
                          <img src={targetUser.pfpUrl} alt={getName(targetUser)} className="w-full h-full object-cover" />
                        ) : (
                          <DefaultAvatar seed={targetUser.wallet} size={32} className="w-8 h-8" />
                        )}
                      </span>
                      <div className="flex flex-col">
                        <div className="font-medium leading-tight">{getName(targetUser)}</div>
                        <div className="microtext text-muted-foreground">{targetUser.wallet.slice(0,10)}…</div>
                        <div className="microtext flex items-center gap-2 mt-1">
                          <span className="badge-soft">XP {getXp(targetUser)}</span>
                          <span className="badge-soft">Bal {targetUser.balanceHMS?.text || `${Math.floor(targetUser.balanceSeconds/60)}m ${targetUser.balanceSeconds%60}s`}</span>
                          <span className="badge-soft">Purch {targetUser.purchasedHMS?.text || `${Math.floor(targetUser.purchasedSeconds/60)}m ${targetUser.purchasedSeconds%60||0}s`}</span>
                          <span className="badge-soft">Used {targetUser.usedHMS?.text || `${Math.floor(targetUser.usedSeconds/60)}m ${targetUser.usedSeconds%60||0}s`}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {opType !== 'edit' ? (
                    <>
                      <label className="text-sm font-medium">Amount (minutes)</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                        value={minutes}
                        onChange={e=>setMinutes(Math.max(1, parseInt(e.target.value||'1')))}
                      />
                    </>
                  ) : (
                    <div className="space-y-3">
                      <label className="text-sm font-medium">Purchased time</label>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                            value={editPurchasedH}
                            onChange={e=>setEditPurchasedH(Math.max(0, parseInt(e.target.value||'0')))}
                          />
                          <div className="microtext text-muted-foreground">Hours</div>
                        </div>
                        <div>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                            value={editPurchasedM}
                            onChange={e=>setEditPurchasedM(Math.max(0, parseInt(e.target.value||'0')))}
                          />
                          <div className="microtext text-muted-foreground">Minutes</div>
                        </div>
                        <div>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                            value={editPurchasedS}
                            onChange={e=>setEditPurchasedS(Math.max(0, parseInt(e.target.value||'0')))}
                          />
                          <div className="microtext text-muted-foreground">Seconds</div>
                        </div>
                      </div>
                      <div className="microtext text-muted-foreground">Current: {targetUser?.purchasedHMS?.text || (<Minus className="inline h-3 w-3" />)}</div>
                      <label className="text-sm font-medium">Used time</label>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                            value={editUsedH}
                            onChange={e=>setEditUsedH(Math.max(0, parseInt(e.target.value||'0')))}
                          />
                          <div className="microtext text-muted-foreground">Hours</div>
                        </div>
                        <div>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                            value={editUsedM}
                            onChange={e=>setEditUsedM(Math.max(0, parseInt(e.target.value||'0')))}
                          />
                          <div className="microtext text-muted-foreground">Minutes</div>
                        </div>
                        <div>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                            value={editUsedS}
                            onChange={e=>setEditUsedS(Math.max(0, parseInt(e.target.value||'0')))}
                          />
                          <div className="microtext text-muted-foreground">Seconds</div>
                        </div>
                      </div>
                      <div className="microtext text-muted-foreground">Current: {targetUser?.usedHMS?.text || (<Minus className="inline h-3 w-3" />)}</div>
                      <div className="microtext text-muted-foreground">Balance (current): {targetUser?.balanceHMS?.text || (<Minus className="inline h-3 w-3" />)}</div>
                      <label className="text-sm font-medium">XP</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                        value={editXp}
                        onChange={e=>setEditXp(Math.max(0, parseInt(e.target.value||'0')))}
                      />
                      <label className="text-sm font-medium">Display name</label>
                      <input
                        type="text"
                        className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                        value={editDisplayName}
                        onChange={e=>setEditDisplayName(e.target.value)}
                      />
                      <label className="text-sm font-medium">Avatar URL</label>
                      <input
                        type="text"
                        className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                        value={editPfpUrl}
                        onChange={e=>setEditPfpUrl(e.target.value)}
                      />
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium">Plan</label>
                          <select className="w-full h-9 px-2 border rounded-md bg-background" value={editPlan} onChange={e=>setEditPlan(e.target.value as any)}>
                            <option value="none">None</option>
                            <option value="basic">Basic</option>
                            <option value="unlimited">Unlimited</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Plan expiry (epoch ms)</label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="w-full h-9 px-3 py-1 border rounded-md bg-background"
                            value={editPlanExpiry}
                            onChange={e=>setEditPlanExpiry(Math.max(0, parseInt(e.target.value||'0')))}
                          />
                        </div>
                      </div>
                      <label className="text-sm font-medium">Metrics (JSON)</label>
                      <textarea
                        className="w-full min-h-[120px] px-3 py-2 border rounded-md bg-background"
                        value={editMetricsText}
                        onChange={e=>setEditMetricsText(e.target.value)}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium">From user</label>
                      <select className="w-full h-9 px-2 border rounded-md bg-background" value={fromWallet} onChange={e=>setFromWallet(e.target.value)}>
                        <option value="">Select wallet…</option>
                        {filteredSorted.map(u => (
                          <option key={"from:"+u.wallet} value={u.wallet}>
                            {getName(u)} ({u.wallet.slice(0,10)}…) • Bal {Math.floor(u.balanceSeconds/60)}m {u.balanceSeconds%60}s • Purch {Math.floor(u.purchasedSeconds/60)}m • Used {Math.floor(u.usedSeconds/60)}m
                          </option>
                        ))}
                      </select>

                      {fromUser && (
                        <div className="mt-2 flex items-center gap-3 p-3 border rounded-md glass-pane">
                          <span className="w-8 h-8 rounded-full overflow-hidden bg-foreground/10">
                            {fromUser.pfpUrl ? (
                              <img src={fromUser.pfpUrl} alt={getName(fromUser)} className="w-full h-full object-cover" />
                            ) : (
                              <DefaultAvatar seed={fromUser.wallet} size={32} className="w-8 h-8" />
                            )}
                          </span>
                          <div className="flex flex-col">
                            <div className="font-medium leading-tight">{getName(fromUser)}</div>
                            <div className="microtext text-muted-foreground">{fromUser.wallet.slice(0,10)}…</div>
                            <div className="microtext flex items-center gap-2 mt-1">
                              <span className="badge-soft">XP {getXp(fromUser)}</span>
                              <span className="badge-soft">Bal {Math.floor(fromUser.balanceSeconds/60)}m {fromUser.balanceSeconds%60}s</span>
                              <span className="badge-soft">Purch {Math.floor(fromUser.purchasedSeconds/60)}m</span>
                              <span className="badge-soft">Used {Math.floor(fromUser.usedSeconds/60)}m</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium">To user</label>
                      <select className="w-full h-9 px-2 border rounded-md bg-background" value={toWallet} onChange={e=>setToWallet(e.target.value)}>
                        <option value="">Select wallet…</option>
                        {filteredSorted.map(u => (
                          <option key={"to:"+u.wallet} value={u.wallet}>
                            {getName(u)} ({u.wallet.slice(0,10)}…) • Bal {Math.floor(u.balanceSeconds/60)}m {u.balanceSeconds%60}s • Purch {Math.floor(u.purchasedSeconds/60)}m • Used {Math.floor(u.usedSeconds/60)}m
                          </option>
                        ))}
                      </select>

                      {toUser && (
                        <div className="mt-2 flex items-center gap-3 p-3 border rounded-md glass-pane">
                          <span className="w-8 h-8 rounded-full overflow-hidden bg-foreground/10">
                            {toUser.pfpUrl ? (
                              <img src={toUser.pfpUrl} alt={getName(toUser)} className="w-full h-full object-cover" />
                            ) : (
                              <DefaultAvatar seed={toUser.wallet} size={32} className="w-8 h-8" />
                            )}
                          </span>
                          <div className="flex flex-col">
                            <div className="font-medium leading-tight">{getName(toUser)}</div>
                            <div className="microtext text-muted-foreground">{toUser.wallet.slice(0,10)}…</div>
                            <div className="microtext flex items-center gap-2 mt-1">
                              <span className="badge-soft">XP {getXp(toUser)}</span>
                              <span className="badge-soft">Bal {Math.floor(toUser.balanceSeconds/60)}m {toUser.balanceSeconds%60}s</span>
                              <span className="badge-soft">Purch {Math.floor(toUser.purchasedSeconds/60)}m</span>
                              <span className="badge-soft">Used {Math.floor(toUser.usedSeconds/60)}m</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {opType === 'migrate_stats' && (
                    <div className="mt-3 p-3 border rounded-md glass-pane space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">Stats to migrate</div>
                        <div className="flex items-center gap-2">
                          <button className="px-2 py-1 rounded-md border text-xs" onClick={()=>{
                            setMsXp(true); setMsUsedSeconds(true); setMsDomains(true); setMsLanguages(true);
                            setMsPlatforms(true); setMsTopics(true); setMsDisplayName(true); setMsPfpUrl(true);
                          }}>Select all</button>
                          <button className="px-2 py-1 rounded-md border text-xs" onClick={()=>{
                            setMsXp(false); setMsUsedSeconds(false); setMsDomains(false); setMsLanguages(false);
                            setMsPlatforms(false); setMsTopics(false); setMsDisplayName(false); setMsPfpUrl(false);
                          }}>Deselect all</button>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <label className="text-sm flex items-center gap-2">
                          <input type="checkbox" className="accent-[var(--primary)]" checked={msXp} onChange={e=>setMsXp(e.target.checked)} />
                          <span>XP</span>
                        </label>
                        <label className="text-sm flex items-center gap-2">
                          <input type="checkbox" className="accent-[var(--primary)]" checked={msUsedSeconds} onChange={e=>setMsUsedSeconds(e.target.checked)} />
                          <span>Used seconds</span>
                        </label>
                        <label className="text-sm flex items-center gap-2">
                          <input type="checkbox" className="accent-[var(--primary)]" checked={msDomains} onChange={e=>setMsDomains(e.target.checked)} />
                          <span>Domains</span>
                        </label>
                        <label className="text-sm flex items-center gap-2">
                          <input type="checkbox" className="accent-[var(--primary)]" checked={msLanguages} onChange={e=>setMsLanguages(e.target.checked)} />
                          <span>Languages</span>
                        </label>
                        <label className="text-sm flex items-center gap-2">
                          <input type="checkbox" className="accent-[var(--primary)]" checked={msPlatforms} onChange={e=>setMsPlatforms(e.target.checked)} />
                          <span>Platforms</span>
                        </label>
                        <label className="text-sm flex items-center gap-2">
                          <input type="checkbox" className="accent-[var(--primary)]" checked={msTopics} onChange={e=>setMsTopics(e.target.checked)} />
                          <span>Topics</span>
                        </label>
                        <label className="text-sm flex items-center gap-2">
                          <input type="checkbox" className="accent-[var(--primary)]" checked={msDisplayName} onChange={e=>setMsDisplayName(e.target.checked)} />
                          <span>Display name</span>
                        </label>
                        <label className="text-sm flex items-center gap-2">
                          <input type="checkbox" className="accent-[var(--primary)]" checked={msPfpUrl} onChange={e=>setMsPfpUrl(e.target.checked)} />
                          <span>Avatar</span>
                        </label>
                      </div>
                      <label className="text-sm flex items-center gap-2">
                        <input type="checkbox" className="accent-[var(--primary)]" checked={msWipe} onChange={e=>setMsWipe(e.target.checked)} />
                        <span>Wipe source account fields for selected stats</span>
                      </label>
                      <p className="microtext text-muted-foreground">Ensures original account is wiped for migrated components to prevent double-counting.</p>
                    </div>
                  )}

                  <div className={"mt-3 " + (opType==="migrate_stats" ? "hidden" : "")}>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Amount to transfer (minutes)</label>
                      <div className="microtext text-muted-foreground">
                        Available: {Math.floor((fromUser?.balanceSeconds||0)/60)}m {(fromUser?.balanceSeconds||0)%60}s
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <input
                        type="range"
                        className="glass-range w-full"
                        min={0}
                        max={maxTransferMinutes}
                        step={1}
                        value={Math.min(sliderMinutes, maxTransferMinutes)}
                        onChange={e=>setSliderMinutes(Math.max(0, Math.min(maxTransferMinutes, parseInt(e.target.value||'0'))))}
                      />
                      <button className="px-2 py-1 rounded-md border text-xs" onClick={()=>setSliderMinutes(maxTransferMinutes)}>Max</button>
                    </div>
                    <div className="microtext mt-1">Transfer: {Math.min(sliderMinutes, maxTransferMinutes)}m</div>
                  </div>
                </>
              )}

              {adjustError ? <div className="microtext text-red-500">{adjustError}</div> : null}
              <div className="flex items-center justify-end gap-2">
                <button disabled={savingAdjust || (opType==="migrate" && Math.min(sliderMinutes, maxTransferMinutes) <= 0) || ((opType==="migrate" || opType==="migrate_stats") && (!fromWallet || !toWallet)) || (opType==="edit" && !targetWallet)} className="px-3 py-1.5 rounded-md border" onClick={adjustCredits}>{savingAdjust ? 'Saving…' : 'Apply'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

		{/* Controls */}
		<div className="glass-pane rounded-xl border p-6">
			<div className="flex flex-col gap-3 mb-3">
				<div className="flex flex-wrap items-center gap-3 justify-between">
					<input
						type="text"
						className="w-full md:w-80 h-9 px-3 py-1 border rounded-md bg-background"
						placeholder="Search user or wallet…"
						value={search}
						onChange={e=>setSearch(e.target.value)}
					/>
					<div className="flex items-center gap-3">
						<label className="text-sm flex items-center gap-2">
							<span>Per page</span>
							<select className="h-9 px-2 border rounded-md bg-background" value={pageSize} onChange={e=>setPageSize(Math.max(1, parseInt(e.target.value||'10')))}>
								<option value={10}>10</option>
								<option value={25}>25</option>
								<option value={50}>50</option>
								<option value={100}>100</option>
							</select>
						</label>
					</div>
				</div>
			</div>

			<div className="overflow-auto max-h-[520px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left microtext text-muted-foreground">
							<th className="py-2 pr-3"><button onClick={()=>toggleSort('name')} className="hover:underline">User<Arrow forKey="name" /></button></th>
							<th className="py-2 pr-3"><button onClick={()=>toggleSort('xp')} className="hover:underline">XP<Arrow forKey="xp" /></button></th>
							<th className="py-2 pr-3"><button onClick={()=>toggleSort('purchased')} className="hover:underline">Purchased<Arrow forKey="purchased" /></button></th>
							<th className="py-2 pr-3"><button onClick={()=>toggleSort('used')} className="hover:underline">Used<Arrow forKey="used" /></button></th>
							<th className="py-2 pr-3"><button onClick={()=>toggleSort('balance')} className="hover:underline">Balance<Arrow forKey="balance" /></button></th>
							<th className="py-2 pr-3"><button onClick={()=>toggleSort('last')} className="hover:underline">Last seen<Arrow forKey="last" /></button></th>
              </tr>
            </thead>
            <tbody>
						{pageRows.map(r => {
							const name = getName(r);
							const last = r.lastSeen ? new Date(r.lastSeen).toLocaleDateString() : '—';
							const xp = getXp(r);
                return (
                <tr key={r.wallet} className="border-t">
                  <td className="py-2 pr-3">
                    <a href={`/u/${r.wallet}`} className="flex items-center gap-3">
									<span className="w-8 h-8 rounded-full overflow-hidden bg-foreground/10">
										{r.pfpUrl ? (
											<img src={r.pfpUrl} alt={name} className="w-full h-full object-cover" />
										) : (
											<DefaultAvatar seed={r.wallet} size={32} className="w-8 h-8" />
										)}
									</span>
                      <span className="flex flex-col">
                        <span className="font-medium leading-tight">{name}</span>
                        <span className="microtext text-muted-foreground">{r.wallet.slice(0,10)}… • Last: {last}</span>
                      </span>
                    </a>
                  </td>
                  <td className="py-2 pr-3 font-semibold whitespace-nowrap">{xp} XP</td>
                  <td className="py-2 pr-3">{Math.floor(r.purchasedSeconds/60)}m {r.purchasedSeconds%60}s</td>
                  <td className="py-2 pr-3">{Math.floor(r.usedSeconds/60)}m {r.usedSeconds%60}s</td>
                  <td className="py-2 pr-3 font-semibold">{Math.floor(r.balanceSeconds/60)}m {r.balanceSeconds%60}s</td>
								<td className="py-2 pr-3 whitespace-nowrap">{last}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
			<div className="flex items-center justify-between mt-3">
				<div className="microtext text-muted-foreground">Showing {(currentPage-1)*pageSize + 1}-{Math.min(currentPage*pageSize, totalFiltered)} of {totalFiltered}</div>
				<div className="flex items-center gap-2">
					<button className="px-2 py-1 rounded-md border text-xs" disabled={currentPage<=1} onClick={()=>setPage(p=>Math.max(1, p-1))}>Prev</button>
					<span className="microtext">Page {currentPage} / {totalPages}</span>
					<button className="px-2 py-1 rounded-md border text-xs" disabled={currentPage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages, p+1))}>Next</button>
				</div>
				<div className="hidden md:flex items-center gap-2">
					<label className="text-sm">Per page</label>
					<select className="h-9 px-2 border rounded-md bg-background" value={pageSize} onChange={e=>setPageSize(Math.max(1, parseInt(e.target.value||'10')))}>
						<option value={10}>10</option>
						<option value={25}>25</option>
						<option value={50}>50</option>
						<option value={100}>100</option>
					</select>
				</div>
			</div>
        <p className="microtext text-muted-foreground mt-3">Owner wallet has unlimited access.</p>
      </div>

      {/* Feature Toggles */}
      <div className="glass-pane rounded-xl border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Early Access Modules</h2>
          <span className={"microtext " + (defiEnabled ? 'text-emerald-500' : 'text-amber-500')}>{defiEnabled ? 'DeFi enabled' : 'DeFi disabled'}</span>
        </div>
        <p className="microtext text-muted-foreground">Gate unfinished experiences before they are ready for users.</p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-[var(--primary)]" checked={defiEnabled} onChange={e => setDefiEnabled(e.target.checked)} />
            <span>Enable DeFi panel in navigation</span>
          </label>
          <button
            disabled={savingDefi}
            onClick={async () => {
              setSavingDefi(true);
              try {
                await fetch('/api/site/config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-wallet': (account?.address || '') },
                  body: JSON.stringify({ story: siteStory, storyHtml, defiEnabled }),
                });
              } finally {
                setSavingDefi(false);
              }
            }}
            className="px-3 py-1.5 rounded-md border w-fit"
          >
            {savingDefi ? 'Saving...' : 'Save module settings'}
          </button>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-[var(--primary)]"
              checked={defiLocalOverride}
              onChange={(e) => {
                const on = e.target.checked;
                setDefiLocalOverride(on);
                try {
                  if (on) {
                    document.cookie = "cb_defi_local_override=1; path=/";
                    sessionStorage.setItem("cb:defiLocalOverride", "1");
                  } else {
                    document.cookie = "cb_defi_local_override=; Max-Age=0; path=/";
                    sessionStorage.removeItem("cb:defiLocalOverride");
                  }
                  window.dispatchEvent(new Event("cb:defiLocalOverride"));
                } catch {}
              }}
            />
            <span>Local Dev: show DeFi on this device (owner, session)</span>
          </label>
          <span className="microtext text-muted-foreground">No backend change. Clears on browser restart.</span>
        </div>
      </div>

      {/* Data Maintenance */}
      <div className="glass-pane rounded-xl border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Data Maintenance</h2>
          <span className="microtext text-muted-foreground">Repair aggregates from events</span>
        </div>
        <p className="microtext text-muted-foreground">
          If totals or XP look off, recompute user aggregates (purchasedSeconds, usedSeconds) from events.
          Optionally force XP recompute from session summaries (multi-parameter bonuses).
        </p>
        <div className="text-sm">
          <button type="button" className={"pixel-toggle " + (forceRecomputeXp ? "active" : "")} onClick={()=>setForceRecomputeXp(v=>!v)}>
            <span className="pixel-led"></span>
            <span>Force XP recompute from session summaries</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={repairingAll}
            onClick={() => recomputeAll(forceRecomputeXp)}
            className="px-3 py-1.5 rounded-md border"
          >
            {repairingAll ? 'Recomputing…' : 'Recompute all aggregates'}
          </button>
          <select
            className="w-full sm:w-64 h-9 px-2 border rounded-md bg-background"
            value={repairWallet}
            onChange={e=>setRepairWallet(e.target.value)}
          >
            <option value="">Select wallet…</option>
            {filteredSorted.map(u => (
              <option key={"repair:"+u.wallet} value={u.wallet}>
                {getName(u)} ({u.wallet.slice(0,10)}…)
              </option>
            ))}
          </select>
          <button
            disabled={repairingOne || !repairWallet}
            onClick={() => recomputeUser(forceRecomputeXp)}
            className="px-3 py-1.5 rounded-md border"
          >
            {repairingOne ? 'Recomputing…' : 'Recompute single user'}
          </button>
        </div>
        {adjustError ? <div className="microtext text-red-500">{adjustError}</div> : null}
        <p className="microtext text-muted-foreground">
          Note: Credits are unaffected. To move credits, use Adjust credits → Migrate credits.
        </p>
      </div>

      {/* Manual XP Adjustment */}
      <div className="glass-pane rounded-xl border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Manual XP Adjustment</h2>
          <span className="microtext text-muted-foreground">Set user XP directly</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">User</label>
            <select className="w-full h-9 px-2 border rounded-md bg-background" value={xpAdjustWallet} onChange={e=>setXpAdjustWallet(e.target.value)}>
              <option value="">Select wallet…</option>
              {filteredSorted.map(u => (
                <option key={"xp:"+u.wallet} value={u.wallet}>
                  {getName(u)} ({u.wallet.slice(0,10)}…)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">XP value</label>
            <input type="number" min={0} step={1} className="w-full h-9 px-3 py-1 border rounded-md bg-background" value={xpAdjustValue} onChange={e=>setXpAdjustValue(Math.max(0, parseInt(e.target.value||'0')))} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button disabled={xpAdjusting || !xpAdjustWallet} onClick={setUserXp} className="px-3 py-1.5 rounded-md border">{xpAdjusting ? 'Updating…' : 'Set XP'}</button>
        </div>
        {adjustError ? <div className="microtext text-red-500">{adjustError}</div> : null}
        <p className="microtext text-muted-foreground">Advanced: Use after recompute to fine-tune complex migrations.</p>
      </div>

      {/* Pricing Config Panel */}
      <div className="glass-pane rounded-xl border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Pricing Configuration</h2>
          <span className="microtext text-muted-foreground">Affects Pricing page immediately</span>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">ETH per 2 minutes</label>
            <input type="number" step="0.000001" min={0}
              className="w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={pricing.ethPer2Min}
              onChange={e=>setPricing(p=>({ ...p, ethPer2Min: Number(e.target.value||0) }))} />
          </div>
          <div>
            <label className="text-sm font-medium">Minimum minutes</label>
            <input type="number" step={1} min={1}
              className="w-full h-9 px-3 py-1 border rounded-md bg-background"
              value={pricing.minMinutes}
              onChange={e=>setPricing(p=>({ ...p, minMinutes: Math.max(1, parseInt(e.target.value||'1')) }))} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Discount rules</label>
            <button className="px-2 py-1 rounded-md border text-xs" onClick={()=>setPricing(p=>({ ...p, discountRules: [...(p.discountRules||[]), { minMinutes: 30, discountPct: 0.10 }] }))}>Add rule</button>
          </div>
          <div className="space-y-2 mt-2">
            {(pricing.discountRules||[]).map((r, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-2 microtext text-muted-foreground">Rule {idx+1}</span>
                <input type="number" min={1} step={1} value={r.minMinutes}
                  onChange={e=>setPricing(p=>({ ...p, discountRules: p.discountRules.map((x,i)=> i===idx ? { ...x, minMinutes: Math.max(1, parseInt(e.target.value||'1')) } : x) }))} 
                  className="col-span-4 h-9 px-3 py-1 border rounded-md bg-background"
                  placeholder="Min minutes" />
                <div className="col-span-4 flex items-center gap-2">
                  <input type="number" min={0} max={0.95} step={0.01} value={r.discountPct}
                    onChange={e=>setPricing(p=>({ ...p, discountRules: p.discountRules.map((x,i)=> i===idx ? { ...x, discountPct: Math.max(0, Math.min(0.95, Number(e.target.value||0))) } : x) }))} 
                    className="h-9 px-3 py-1 border rounded-md bg-background w-full"
                    placeholder="Discount (0-0.95)" />
                  <span className="microtext text-muted-foreground">fraction</span>
                </div>
                <button className="col-span-2 px-2 py-1 rounded-md border text-xs" onClick={()=>setPricing(p=>({ ...p, discountRules: p.discountRules.filter((_,i)=>i!==idx) }))}>Remove</button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button disabled={savingCfg} onClick={async ()=>{
            setSavingCfg(true);
            try {
              await fetch('/api/pricing/config', { method: 'POST', headers: { 'Content-Type':'application/json', 'x-wallet': (account?.address||'') }, body: JSON.stringify(pricing) });
            } finally { setSavingCfg(false); }
          }} className="px-3 py-1.5 rounded-md border">{savingCfg ? 'Saving…' : 'Save pricing'}</button>
        </div>
      </div>

      {/* Site Story Editor */}
      <div className="glass-pane rounded-xl border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Landing Page Story</h2>
          <span className="microtext text-muted-foreground">Shown on /</span>
        </div>
        <div>
          <label className="text-sm font-medium">Story content</label>
          <textarea className="w-full min-h-[140px] px-3 py-2 border rounded-md bg-background" value={siteStory} onChange={e=>setSiteStory(e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium">Story HTML (images allowed)</label>
          <textarea className="w-full min-h-[200px] px-3 py-2 border rounded-md bg-background" placeholder="<p>Write your story… <img src='/public/path.png' /></p>" value={storyHtml} onChange={e=>setStoryHtml(e.target.value)} />
          <div className="microtext text-muted-foreground mt-1">Allowed: http(s) or site-relative image src, links without javascript:, no scripts/iframes.</div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button disabled={savingStory} className="px-3 py-1.5 rounded-md border" onClick={async ()=>{
            setSavingStory(true);
            try {
              await fetch('/api/site/config', { method: 'POST', headers: { 'Content-Type':'application/json', 'x-wallet': (account?.address||'') }, body: JSON.stringify({ story: siteStory, storyHtml, defiEnabled }) });
            } finally { setSavingStory(false); }
          }}>{savingStory ? 'Saving…' : 'Save story'}</button>
        </div>
      </div>
    </div>
  );
}
