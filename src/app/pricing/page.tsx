"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { client, chain, getRecipientAddress, wallets } from "@/lib/thirdweb/client";
import { fetchEthRates, fetchBtcUsd, fetchXrpUsd, type EthRates } from "@/lib/eth";

// Lazy-load heavy thirdweb UI to minimize dev-time deep package crawling
const ConnectButtonDynamic = dynamic(
  () => import("thirdweb/react").then((m) => m.ConnectButton),
  { ssr: false }
);
const CheckoutWidgetDynamic = dynamic(
  () => import("thirdweb/react").then((m) => m.CheckoutWidget),
  { ssr: false }
);

type DiscountRule = { minMinutes: number; discountPct: number };
type PricingConfig = { ethPer2Min: number; minMinutes: number; discountRules: DiscountRule[] };

const DEFAULT_CONFIG: PricingConfig = {
  ethPer2Min: 0.001,
  minMinutes: 2,
  discountRules: [
    { minMinutes: 30, discountPct: 0.1 },
    { minMinutes: 60, discountPct: 0.2 },
  ],
} as const;

const CURRENCIES = [
  { code: "USD", flag: "🇺🇸", symbol: "$", label: "US Dollar" },
  { code: "EUR", flag: "🇪🇺", symbol: "€", label: "Euro" },
  { code: "GBP", flag: "🇬🇧", symbol: "£", label: "British Pound" },
  { code: "JPY", flag: "🇯🇵", symbol: "¥", label: "Japanese Yen" },
  { code: "CAD", flag: "🇨🇦", symbol: "$", label: "Canadian Dollar" },
  { code: "AUD", flag: "🇦🇺", symbol: "$", label: "Australian Dollar" },
  { code: "INR", flag: "🇮🇳", symbol: "₹", label: "Indian Rupee" },
  { code: "NGN", flag: "🇳🇬", symbol: "₦", label: "Nigerian Naira" },
] as const;

function formatFiat(amount: number, code: string): string {
  try {
    const locale = code === "NGN" ? "en-NG" : undefined;
    const formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "symbol",
      maximumFractionDigits: 2,
    }).format(amount);
    if (code === "NGN" && formatted.includes("NGN")) {
      return formatted.replace("NGN", "₦");
    }
    return formatted;
  } catch {
    const sym = (CURRENCIES as readonly any[]).find((c) => c.code === code)?.symbol || "";
    return `${sym}${amount.toFixed(2)}`;
  }
}

type TokenDef = {
  symbol: "ETH" | "USDC" | "USDT" | "cbBTC" | "cbXRP";
  type: "native" | "erc20";
  address?: string;
  decimals?: number;
};

function getAvailableTokens(): TokenDef[] {
  const tokens: TokenDef[] = [];
  tokens.push({ symbol: "ETH", type: "native" });

  const usdc = (process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS || "").trim();
  const usdt = (process.env.NEXT_PUBLIC_BASE_USDT_ADDRESS || "").trim();
  const cbbtc = (process.env.NEXT_PUBLIC_BASE_CBBTC_ADDRESS || "").trim();
  const cbxrp = (process.env.NEXT_PUBLIC_BASE_CBXRP_ADDRESS || "").trim();

  if (usdc)
    tokens.push({
      symbol: "USDC",
      type: "erc20",
      address: usdc,
      decimals: Number(process.env.NEXT_PUBLIC_BASE_USDC_DECIMALS || 6),
    });
  if (usdt)
    tokens.push({
      symbol: "USDT",
      type: "erc20",
      address: usdt,
      decimals: Number(process.env.NEXT_PUBLIC_BASE_USDT_DECIMALS || 6),
    });
  if (cbbtc)
    tokens.push({
      symbol: "cbBTC",
      type: "erc20",
      address: cbbtc,
      decimals: Number(process.env.NEXT_PUBLIC_BASE_CBBTC_DECIMALS || 8),
    });
  if (cbxrp)
    tokens.push({
      symbol: "cbXRP",
      type: "erc20",
      address: cbxrp,
      decimals: Number(process.env.NEXT_PUBLIC_BASE_CBXRP_DECIMALS || 6),
    });

  return tokens;
}

function flagUrl(code: string): string {
  const map: Record<string, string> = {
    USD: "us",
    EUR: "eu",
    GBP: "gb",
    JPY: "jp",
    CAD: "ca",
    AUD: "au",
    INR: "in",
    NGN: "ng",
  };
  const cc = map[code] || code.toLowerCase();
  return `https://flagcdn.com/48x36/${cc}.png`;
}

export default function PricingPage() {
  // State management
  const [config, setConfig] = useState<PricingConfig>(DEFAULT_CONFIG);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [minutes, setMinutes] = useState(30);
  const [authedWallet, setAuthedWallet] = useState<string | null>(null);
  const loggedIn = !!authedWallet;
  const [success, setSuccess] = useState<{
    seconds: number;
    before: number;
    after: number;
    txHash: string;
  } | null>(null);

  // Rate and currency state
  const [rates, setRates] = useState<EthRates>({});
  const [currency, setCurrency] = useState("USD");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const currencyRef = useRef<HTMLDivElement | null>(null);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState<Date | null>(null);

  // Token and crypto rates state
  const [token, setToken] = useState<"ETH" | "USDC" | "USDT" | "cbBTC" | "cbXRP">("ETH");
  const availableTokens = useMemo(() => getAvailableTokens(), []);
  const [btcUsd, setBtcUsd] = useState(0);
  const [xrpUsd, setXrpUsd] = useState(0);
  const [balanceSeconds, setBalanceSeconds] = useState<number | null>(null);
  const [tokenIcons, setTokenIcons] = useState<Record<string, string>>({});
  // Resolve authenticated wallet from cookie on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch("/api/auth/me", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : { authed: false }))
          .catch(() => ({ authed: false }));
        if (!cancelled && me?.authed && me?.wallet) {
          setAuthedWallet(String(me.wallet).toLowerCase());
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // UI mode state
  const [advanced, setAdvanced] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [showCheckout, setShowCheckout] = useState(false);

  // Constants
  const presets = [2, 5, 10, 15, 30, 60, 90, 120] as const;
  const steps = [
    { id: 1, title: "Currency" },
    { id: 2, title: "Duration" },
    { id: 3, title: "Payment Token" },
    { id: 4, title: "Checkout" },
  ] as const;

  // CoinGecko icon helpers
  const COINGECKO_ID_OVERRIDES: Record<string, string> = useMemo(
    () => ({
      ETH: "ethereum",
      USDC: "usd-coin",
      USDT: "tether",
      cbBTC: "coinbase-wrapped-btc",
      cbXRP: "coinbase-wrapped-xrp",
    }),
    []
  );

  async function fetchCoingeckoIcon(symbol: string): Promise<string | null> {
    try {
      const override = COINGECKO_ID_OVERRIDES[symbol];
      if (override) {
        const r = await fetch(`https://api.coingecko.com/api/v3/coins/${override}`);
        if (r.ok) {
          const j = await r.json();
          return j?.image?.small || j?.image?.thumb || j?.image?.large || null;
        }
      }
      const sr = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`);
      if (sr.ok) {
        const j = await sr.json();
        const coins: any[] = Array.isArray(j?.coins) ? j.coins : [];
        const exact = coins.find((c) => String(c?.symbol || "").toLowerCase() === symbol.toLowerCase());
        const chosen = exact || coins[0];
        return chosen?.thumb || chosen?.large || null;
      }
    } catch {}
    const fallbacks: Record<string, string> = {
      ETH: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
      USDC: "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png",
      USDT: "https://assets.coingecko.com/coins/images/325/small/Tether-logo.png",
      cbBTC: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
      cbXRP: "https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png",
    };
    return fallbacks[symbol] || null;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const symbols = Array.from(new Set(availableTokens.map((t) => t.symbol)));
        const entries: [string, string][] = [];
        await Promise.all(
          symbols.map(async (sym) => {
            try {
              const url = await fetchCoingeckoIcon(sym);
              if (!cancelled && url) entries.push([sym, url]);
            } catch {}
          })
        );
        if (!cancelled && entries.length) {
          setTokenIcons((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [availableTokens]);

  // Computed values
  const clampedMinutes = Math.max(config.minMinutes, minutes || 0);

  const discountPct = useMemo(() => {
    const rules = (config.discountRules || []).slice().sort((a, b) => a.minMinutes - b.minMinutes);
    let pct = 0;
    for (const rule of rules) {
      if (clampedMinutes >= rule.minMinutes) pct = rule.discountPct;
    }
    return pct;
  }, [clampedMinutes, config.discountRules]);

  const baseEth = useMemo(() => +(clampedMinutes * (config.ethPer2Min / 2)).toFixed(9), [clampedMinutes, config.ethPer2Min]);

  const payEth = useMemo(() => +(baseEth * (1 - discountPct)).toFixed(9), [baseEth, discountPct]);

  const fiat = useMemo(() => {
    const rate = rates[currency.toUpperCase()] || 0;
    return rate ? payEth * rate : 0;
  }, [rates, currency, payEth]);

  const valueWei = useMemo(() => {
    if (!payEth || payEth <= 0) return BigInt(0);
    const ethStr = payEth.toFixed(18);
    const [whole, fraction = ""] = ethStr.split(".");
    const paddedFraction = (fraction + "000000000000000000").slice(0, 18);
    return BigInt(whole) * BigInt("1000000000000000000") + BigInt(paddedFraction);
  }, [payEth]);

  const usdRate = Number(rates["USD"] || 0);
  const priceUsd = useMemo(() => (usdRate > 0 ? payEth * usdRate : 0), [payEth, usdRate]);

  const tokenDef = useMemo(() => availableTokens.find((t) => t.symbol === token), [availableTokens, token]);

  const tokenAmountAtomic = useMemo(() => {
    if (!tokenDef || tokenDef.type === "native") return BigInt(0);
    const decimals = Number(tokenDef.decimals || (tokenDef.symbol === "cbBTC" ? 8 : 6));
    let units = 0;

    if (tokenDef.symbol === "USDC" || tokenDef.symbol === "USDT") {
      units = priceUsd;
    } else if (tokenDef.symbol === "cbBTC") {
      if (!btcUsd || btcUsd <= 0) return BigInt(0);
      units = priceUsd / btcUsd;
    } else if (tokenDef.symbol === "cbXRP") {
      if (!xrpUsd || xrpUsd <= 0) return BigInt(0);
      units = priceUsd / xrpUsd;
    }

    const scaled = Math.max(0, Number.isFinite(units) ? units : 0);
    const asStr = scaled.toFixed(decimals);
    const [whole, fraction = ""] = asStr.split(".");
    const paddedFraction = (fraction + "0".repeat(decimals)).slice(0, decimals);
    return BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(paddedFraction);
  }, [tokenDef, priceUsd, btcUsd, xrpUsd]);

  const widgetAmount = useMemo(() => {
    if (token === "ETH") {
      return payEth > 0 ? payEth.toFixed(6) : "0";
    }
    const decimals = Number(tokenDef?.decimals || (tokenDef?.symbol === "cbBTC" ? 8 : 6));
    if (tokenDef?.symbol === "USDC" || tokenDef?.symbol === "USDT") {
      return priceUsd > 0 ? priceUsd.toFixed(decimals) : "0";
    }
    if (tokenDef?.symbol === "cbBTC") {
      if (!btcUsd || btcUsd <= 0) return "0";
      const units = priceUsd / btcUsd;
      return units > 0 ? units.toFixed(decimals) : "0";
    }
    if (tokenDef?.symbol === "cbXRP") {
      if (!xrpUsd || xrpUsd <= 0) return "0";
      const units = priceUsd / xrpUsd;
      return units > 0 ? units.toFixed(decimals) : "0";
    }
    return "0";
  }, [token, tokenDef?.decimals, tokenDef?.symbol, payEth, priceUsd, btcUsd, xrpUsd]);

  // Effects
  useEffect(() => {
    fetch("/api/pricing/config")
      .then((r) => r.json())
      .then((j) => {
        const cfg = j?.config || DEFAULT_CONFIG;
        setConfig({
          ethPer2Min: Number(cfg.ethPer2Min || DEFAULT_CONFIG.ethPer2Min),
          minMinutes: Math.max(1, Number(cfg.minMinutes || DEFAULT_CONFIG.minMinutes)),
          discountRules: Array.isArray(cfg.discountRules) ? cfg.discountRules : DEFAULT_CONFIG.discountRules,
        });
      })
      .catch(() => {})
      .finally(() => setLoadingCfg(false));

    fetchEthRates()
      .then((r) => {
        setRates(r);
        setRatesUpdatedAt(new Date());
      })
      .catch(() => setRates({}));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (token === "cbBTC") {
        try {
          const r = await fetchBtcUsd();
          if (!cancelled) setBtcUsd(r);
        } catch {}
      }
      if (token === "cbXRP") {
        try {
          const r = await fetchXrpUsd();
          if (!cancelled) setXrpUsd(r);
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Fetch current balance for preview (and refresh after success)
  useEffect(() => {
    const wallet = String(authedWallet || "").toLowerCase();
    if (!wallet) {
      setBalanceSeconds(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/billing/balance", { headers: { "x-wallet": wallet } });
        const j = await r.json();
        if (!cancelled) setBalanceSeconds(Number(j?.balanceSeconds || 0));
      } catch {
        if (!cancelled) setBalanceSeconds(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedWallet, success, step]);

  function formatDuration(totalSeconds: number): string {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${r}s`;
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!currencyRef.current) return;
      if (!currencyRef.current.contains(e.target as Node)) setCurrencyOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function canProceed(fromStep: 1 | 2 | 3): boolean {
    if (fromStep === 1) {
      return !!currency && !!(rates[currency] || rates[currency.toUpperCase()]);
    }
    if (fromStep === 2) {
      return clampedMinutes >= config.minMinutes;
    }
    if (fromStep === 3) {
      if (token === "ETH") return true;
      return !!tokenDef?.address;
    }
    return false;
  }

  function goNext() {
    if (step === 1 && canProceed(1)) setStep(2);
    else if (step === 2 && canProceed(2)) setStep(3);
    else if (step === 3 && canProceed(3)) setStep(4);
  }

  function goPrev() {
    if (step > 1) setStep((s) => (Math.max(1, (s as number) - 1) as 1 | 2 | 3 | 4));
  }

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Pricing</h1>
          <p className="text-muted-foreground microtext">
            Pricing model:{" "}
            {loadingCfg ? (
              <span className="inline-block w-48 h-4 rounded bg-foreground/10 align-middle" />
            ) : (
              <span className="font-medium">{config.ethPer2Min} ETH per 2 minutes</span>
            )}
            . Billed by the second,{" "}
            {loadingCfg ? (
              <span className="inline-block w-24 h-4 rounded bg-foreground/10 align-middle" />
            ) : (
              <>{config.minMinutes}-minute minimum</>
            )}
            . No subscriptions.
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center justify-end gap-2">
          <span className="microtext text-muted-foreground">Mode:</span>
          <button
            onClick={() => setAdvanced(false)}
            className={`px-3 py-1.5 rounded-md border microtext transition-colors ${
              !advanced ? "bg-[#4dd9cf] text-white border-transparent" : "hover:bg-foreground/5"
            }`}
          >
            Step-by-step
          </button>
          <button
            onClick={() => setAdvanced(true)}
            className={`px-3 py-1.5 rounded-md border microtext transition-colors ${
              advanced ? "bg-[#4dd9cf] text-white border-transparent" : "hover:bg-foreground/5"
            }`}
          >
            Advanced
          </button>
        </div>

        {/* Step-by-step wizard */}
        {!advanced && (
          <div className="space-y-6">
            {/* Step indicator */}
            <div className="glass-pane rounded-xl border p-3">
              <ol className="flex items-center justify-between gap-2 text-xs md:text-sm">
                {steps.map((s, idx) => {
                  const active = step === s.id;
                  const done = (step as number) > s.id;
                  return (
                    <li key={s.id} className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (s.id < step) setStep(s.id as any);
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md border transition-colors ${
                          active
                            ? "bg-[color:color-mix(in_srgb,_#4dd9cf_18%,_transparent)] text-foreground border-transparent"
                            : done
                            ? "opacity-80"
                            : "hover:bg-foreground/5"
                        }`}
                      >
                        <span
                          className={`w-6 h-6 grid place-items-center rounded-full text-[11px] font-bold ${
                            done
                              ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                              : active
                              ? "bg-[#4dd9cf] text-white"
                              : "bg-foreground/10"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="truncate">{s.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Wizard content */}
            <div className="glass-pane rounded-xl p-6 border space-y-6">
              {/* Step 1: Currency */}
              <div className="space-y-3" ref={currencyRef}>
                <div className="flex items-center justify-between">
                  <h2 className="text-base md:text-lg font-semibold">1. Choose your currency</h2>
                  <div className="flex items-center gap-2">
                    {step > 1 ? (
                      <button
                        className="px-2 py-1 rounded-md border microtext hover:bg-foreground/5 transition-colors"
                        onClick={() => setStep(1 as any)}
                      >
                        Edit
                      </button>
                    ) : (
                      <button
                        className="px-3 py-1.5 rounded-md border microtext hover:bg-foreground/5 transition-colors"
                        onClick={goNext}
                        disabled={!canProceed(1)}
                      >
                        Next
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCurrencyOpen((v) => !v)}
                    className="w-full h-10 pl-11 pr-8 text-left border rounded-md bg-background hover:bg-foreground/5 transition-colors flex items-center gap-2"
                  >
                    <span className="flag-ring absolute left-2 top-1/2 -translate-y-1/2">
                      <img alt={currency} src={flagUrl(currency)} />
                    </span>
                    <span className="truncate">
                      {currency} — {(CURRENCIES as readonly any[]).find((x) => x.code === currency)?.label || ""}
                    </span>
                    <span className="ml-auto opacity-70">▾</span>
                  </button>

                  {currencyOpen && (
                    <div className="absolute z-40 mt-1 w-full md:w-full w-[92vw] max-w-[92vw] rounded-md border bg-background shadow-md p-1 max-h-64 overflow-auto">
                      {CURRENCIES.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => {
                            setCurrency(c.code);
                            setCurrencyOpen(false);
                          }}
                          className="w-full px-2 py-2 rounded-md hover:bg-foreground/5 flex items-center gap-2 text-sm transition-colors"
                        >
                          <span className="flag-ring" style={{ width: 18, height: 18 }}>
                            <img alt={c.code} src={flagUrl(c.code)} />
                          </span>
                          <span className="font-medium">{c.code}</span>
                          <span className="text-muted-foreground">— {c.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between microtext text-muted-foreground">
                  <span>{ratesUpdatedAt ? `Updated ${ratesUpdatedAt.toLocaleTimeString()}` : "Loading rates…"}</span>
                  <span>Rate: {config.ethPer2Min} ETH / 2 min • Min {config.minMinutes}m</span>
                </div>
              </div>

              {/* Step 2: Duration */}
              {step >= 2 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base md:text-lg font-semibold">2. Choose duration</h2>
                    <div className="flex items-center gap-2">
                      {step === 2 ? (
                        <>
                          <button
                            className="px-2 py-1 rounded-md border microtext hover:bg-foreground/5 transition-colors"
                            onClick={goPrev}
                          >
                            Back
                          </button>
                          <button
                            className="px-3 py-1.5 rounded-md border microtext hover:bg-foreground/5 transition-colors"
                            onClick={goNext}
                            disabled={!canProceed(2)}
                          >
                            Next
                          </button>
                        </>
                      ) : (
                        <button
                          className="px-2 py-1 rounded-md border microtext hover:bg-foreground/5 transition-colors"
                          onClick={() => setStep(2 as any)}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 space-y-3">
                      <label className="text-sm font-medium">Minutes</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="w-32 h-9 px-3 py-1 border rounded-md bg-background focus:ring-2 focus:ring-[#4dd9cf]/20 transition-all"
                          min={config.minMinutes}
                          step={1}
                          value={minutes}
                          onChange={(e) => setMinutes(parseInt(e.target.value || "0"))}
                        />
                        <span className="text-xs text-muted-foreground">min {config.minMinutes} minutes</span>
                      </div>

                      <input
                        type="range"
                        min={config.minMinutes}
                        max={240}
                        step={1}
                        value={clampedMinutes}
                        onChange={(e) => setMinutes(parseInt(e.target.value || "0"))}
                        className="glass-range w-full mt-1"
                      />

                      <div>
                        <label className="text-sm font-medium">Quick select</label>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {presets.map((m) => (
                            <button
                              key={m}
                              onClick={() => setMinutes(m)}
                              className={`px-3 py-1.5 rounded-md border transition-colors ${
                                minutes === m ? "bg-[#4dd9cf] text-white border-transparent" : "hover:bg-foreground/5"
                              }`}
                            >
                              {m}m
                            </button>
                          ))}
                        </div>
                        <div className="microtext mt-2 text-muted-foreground">
                          Tip: Use quick selects for common durations. ETH total updates instantly.
                        </div>
                      </div>
                    </div>

                    {/* Live fiat estimate */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Estimated total</label>
                      <div className="mt-2 h-16 grid items-center">
                        {fiat ? (
                          <span className="inline-flex items-center gap-4">
                            <span
                              className="flag-ring"
                              style={{ width: 28, height: 28, boxShadow: "0 0 0 3px rgba(245,64,41,0.25)" }}
                            >
                              <img alt={currency} src={flagUrl(currency)} />
                            </span>
                            <span className="text-2xl md:text-3xl font-extrabold tracking-tight">
                              {formatFiat(fiat, currency)}
                              <span className="text-sm text-muted-foreground align-middle">({currency})</span>
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        <div className="microtext text-muted-foreground">
                          Estimates use real-time rates per 1 ETH. Your wallet handles final settlement.
                        </div>
                        {(() => {
                          const r = rates[currency];
                          if (!r) return null;
                          return (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="conversion-chip microtext">
                                <strong>1 ETH</strong> ≈ {formatFiat(1 * r, currency)}
                              </span>
                              <span className="conversion-chip microtext">
                                <strong>0.001 ETH</strong> ≈ {formatFiat(0.001 * r, currency)}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Payment Token */}
              {step >= 3 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base md:text-lg font-semibold">3. Choose payment token</h2>
                    <div className="flex items-center gap-2">
                      {step === 3 ? (
                        <>
                          <button
                            className="px-2 py-1 rounded-md border microtext hover:bg-foreground/5 transition-colors"
                            onClick={goPrev}
                          >
                            Back
                          </button>
                          <button
                            className="px-3 py-1.5 rounded-md border microtext hover:bg-foreground/5 transition-colors"
                            onClick={goNext}
                            disabled={!canProceed(3)}
                          >
                            Next
                          </button>
                        </>
                      ) : (
                        <button
                          className="px-2 py-1 rounded-md border microtext hover:bg-foreground/5 transition-colors"
                          onClick={() => setStep(3 as any)}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Pay with</label>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {availableTokens.map((tk) => (
                        <button
                          key={tk.symbol}
                          type="button"
                          onClick={() => setToken(tk.symbol as any)}
                          className={`${
                            token === tk.symbol ? "bg-[#4dd9cf] text-white border-transparent" : "hover:bg-foreground/5"
                          } w-full min-w-0 px-2 md:px-3 py-2 rounded-md border text-xs md:text-sm transition-colors`}
                        >
                          <span className="inline-flex items-center justify-center gap-1.5 md:gap-2 min-w-0">
                            <span className="w-4 h-4 md:w-5 md:h-5 rounded-full overflow-hidden bg-foreground/10 grid place-items-center shrink-0">
                              {tokenIcons[tk.symbol] ? (
                                <img src={tokenIcons[tk.symbol]} alt={tk.symbol} className="w-4 h-4 md:w-5 md:h-5 object-contain" />
                              ) : (
                                <span className="text-[10px] font-bold">{tk.symbol[0]}</span>
                              )}
                            </span>
                            <span className="truncate">{tk.symbol}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    {token !== "ETH" && !tokenDef?.address && (
                      <div className="microtext text-red-500 mt-1">
                        Set NEXT_PUBLIC_BASE_{token}_ADDRESS to enable {token} payments.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 4: Checkout */}
              {step >= 4 && (
                <div className="space-y-3">
                  <h2 className="text-base md:text-lg font-semibold">4. Review & Checkout</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Minutes</span>
                        <span className="font-semibold">{clampedMinutes}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Token</span>
                        <span className="font-semibold">{token}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Currency</span>
                        <span className="font-semibold">{currency}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">ETH total</span>
                        <span className="font-semibold">{Number(payEth.toFixed(6))} ETH</span>
                      </div>
                      {priceUsd > 0 ? (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Estimated total</span>
                          <span className="font-semibold">{formatFiat(priceUsd, currency)}</span>
                        </div>
                      ) : null}
                      <div className="pt-2 border-t space-y-2">
                        <div className="flex items-center justify-between microtext">
                          <span className="text-muted-foreground">1 ETH</span>
                          <span className="font-medium">{rates[currency] ? formatFiat(1 * Number(rates[currency]), currency) : "—"}</span>
                        </div>
                        <div className="flex items-center justify-between microtext">
                          <span className="text-muted-foreground">{Number(payEth.toFixed(6))} ETH</span>
                          <span className="font-medium">{priceUsd > 0 ? formatFiat(priceUsd, currency) : "—"}</span>
                        </div>
                        {token !== "ETH" && (
                          <div className="flex items-center justify-between microtext">
                            <span className="text-muted-foreground">Converted to {token}</span>
                            <span className="font-medium">
                              {tokenDef?.symbol === "USDC" || tokenDef?.symbol === "USDT"
                                ? priceUsd.toFixed(Number(tokenDef?.decimals || 6))
                                : tokenDef?.symbol === "cbBTC"
                                ? btcUsd > 0
                                  ? (priceUsd / btcUsd).toFixed(Number(tokenDef?.decimals || 8))
                                  : "—"
                                : tokenDef?.symbol === "cbXRP"
                                ? xrpUsd > 0
                                  ? (priceUsd / xrpUsd).toFixed(Number(tokenDef?.decimals || 6))
                                  : "—"
                                : "—"}
                              {tokenDef ? ` ${tokenDef.symbol}` : ""}
                            </span>
                          </div>
                        )}
                      </div>
                      {discountPct > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Discount</span>
                          <span className="px-2 py-0.5 rounded-md text-[#4dd9cf] bg-[color:color-mix(in_srgb,_#4dd9cf_15%,_transparent)] font-semibold">
                            {Math.round(discountPct * 100)}% off
                          </span>
                        </div>
                      )}
                      <div className="pt-2 border-t space-y-1 microtext">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Balance before</span>
                          <span className="font-medium">{balanceSeconds === null ? "—" : formatDuration(balanceSeconds)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Purchased time</span>
                          <span className="font-medium">{formatDuration(clampedMinutes * 60)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Balance after</span>
                          <span className="font-medium">
                            {balanceSeconds === null ? "—" : formatDuration(balanceSeconds + clampedMinutes * 60)}
                          </span>
                        </div>
                        <div className="text-muted-foreground">ETH total excludes network fees. Final amount is computed on-chain at send.</div>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3">
                      {fiat > 0 && loggedIn ? (
                        showCheckout ? (
                          <CheckoutWidgetDynamic
                            className="w-full"
                            client={client}
                            chain={chain}
                            currency={currency as any}
                            amount={widgetAmount}
                            seller={getRecipientAddress()}
                            tokenAddress={token === "ETH" ? undefined : (tokenDef?.address as any)}
                            showThirdwebBranding={false}
                            style={{ width: "100%", maxWidth: "100%", background: "transparent", border: "none", borderRadius: 0 }}
                            connectOptions={{ accountAbstraction: { chain, sponsorGas: true } }}
                            purchaseData={{
                              productId: `minutes:${clampedMinutes}`,
                              meta: { token, currency, minutes: clampedMinutes },
                            }}
                            onSuccess={async () => {
                              try {
                                const seconds = clampedMinutes * 60;
                              const wallet = String(authedWallet || "").toLowerCase();
                                await fetch("/api/billing/purchase", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    "x-wallet": wallet,
                                  },
                                  body: JSON.stringify({
                                    seconds,
                                    usd: Number(priceUsd.toFixed(2)),
                                    token,
                                    wallet,
                                    idempotencyKey: `buy:${wallet}:${seconds}:${Date.now()}`,
                                  }),
                                });
                                let after = 0;
                                try {
                                  const br = await fetch("/api/billing/balance", {
                                    headers: { "x-wallet": wallet },
                                  }).then((r) => r.json());
                                  after = Number(br?.balanceSeconds || 0);
                                } catch {}
                                setSuccess({
                                  seconds,
                                  before: Math.max(0, after - seconds),
                                  after,
                                  txHash: "",
                                });
                                try {
                                  window.postMessage({ type: "billing:refresh" }, "*");
                                } catch {}
                              } catch {}
                            }}
                          />
                        ) : (
                          <div className="w-full flex flex-col items-center justify-center gap-4 py-8 text-center min-h-[240px]">
                            <img src="/vhsymbol.png" alt="VoiceHub by Ledger1.ai" className="w-16 h-16 rounded-lg object-contain" />
                            <div className="text-sm text-muted-foreground">Review the summary, then continue to checkout</div>
                            <button
                              onClick={() => setShowCheckout(true)}
                              className="px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#4dd9cf]"
                              style={{
                                backgroundColor: "transparent",
                                border: "1px solid #4dd9cf",
                                color: "#e5e7eb",
                                padding: "6px 10px",
                                lineHeight: "1",
                                height: "28px",
                              }}
                              aria-label="Continue to Checkout"
                            >
                              <span className="microtext">Continue to Checkout</span>
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="w-full flex flex-col items-center justify-center gap-4 py-8 text-center">
                          <img src="/vhsymbol.png" alt="VoiceHub by Ledger1.ai" className="w-16 h-16 rounded-lg object-contain" />
                          <div className="text-sm text-muted-foreground">
                            {fiat <= 0 ? "Enter minutes to proceed" : "Login to continue checkout"}
                          </div>
                          <ConnectButtonDynamic
                            client={client}
                            chain={chain}
                            wallets={wallets}
                            connectButton={{
                              label: <span className="microtext">Login</span>,
                              className: "px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#4dd9cf]",
                              style: {
                                backgroundColor: "transparent",
                                border: "1px solid #4dd9cf",
                                color: "#e5e7eb",
                                padding: "6px 10px",
                                lineHeight: "1",
                                height: "28px",
                              },
                            }}
                            signInButton={{
                              label: "Authenticate",
                              className: "px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#4dd9cf]",
                              style: {
                                backgroundColor: "transparent",
                                border: "1px solid #4dd9cf",
                                color: "#e5e7eb",
                                padding: "6px 10px",
                                lineHeight: "1",
                                height: "28px",
                              },
                            }}
                            connectModal={{ title: "Login", titleIcon: "/vhsymbol.png", size: "compact" }}
                          />
                        </div>
                      )}
                      <div className="microtext text-muted-foreground text-center mt-3">All purchases are final. No refunds.</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Advanced view */}
        {advanced && (
          <div className="glass-pane rounded-xl p-6 border space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-3">
                <label className="text-sm font-medium">Minutes</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="w-32 h-9 px-3 py-1 border rounded-md bg-background focus:ring-2 focus:ring-[#4dd9cf]/20 transition-all"
                    min={config.minMinutes}
                    step={1}
                    value={minutes}
                    onChange={(e) => setMinutes(parseInt(e.target.value || "0"))}
                  />
                  <span className="text-xs text-muted-foreground">min {config.minMinutes} minutes</span>
                </div>

                <input
                  type="range"
                  min={config.minMinutes}
                  max={240}
                  step={1}
                  value={clampedMinutes}
                  onChange={(e) => setMinutes(parseInt(e.target.value || "0"))}
                  className="glass-range w-full mt-1"
                />

                <div>
                  <label className="text-sm font-medium">Quick select</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {presets.map((m) => (
                      <button
                        key={m}
                        onClick={() => setMinutes(m)}
                        className={`px-3 py-1.5 rounded-md border transition-colors ${
                          minutes === m ? "bg-[#4dd9cf] text-white border-transparent" : "hover:bg-foreground/5"
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                  <div className="microtext mt-2 text-muted-foreground">
                    Tip: Use quick selects for common durations. ETH total updates instantly.
                  </div>
                </div>
              </div>

              <div className="space-y-4" ref={currencyRef}>
                <div>
                  <label className="text-sm font-medium">Pay with</label>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {availableTokens.map((tk) => (
                      <button
                        key={tk.symbol}
                        type="button"
                        onClick={() => setToken(tk.symbol as any)}
                        className={`w-full min-w-0 h-10 md:h-auto px-2 md:px-3 rounded-md border text-xs md:text-sm transition-colors flex items-center md:flex-col justify-center overflow-hidden ${
                          token === tk.symbol ? "bg-[#4dd9cf] text-white border-transparent" : "hover:bg-foreground/5"
                        }`}
                      >
                        <span className="inline-flex items-center justify-center gap-1.5 md:gap-1 min-w-0 md:flex-col">
                          <span className="w-4 h-4 md:w-5 md:h-5 rounded-full overflow-hidden bg-foreground/10 grid place-items-center shrink-0">
                            {tokenIcons[tk.symbol] ? (
                              <img src={tokenIcons[tk.symbol]} alt={tk.symbol} className="w-4 h-4 md:w-5 md:h-5 object-contain" />
                            ) : (
                              <span className="text-[10px] font-bold">{tk.symbol[0]}</span>
                            )}
                          </span>
                          <span className="microtext text-center leading-tight truncate md:whitespace-normal md:break-words md:truncate-none">
                            {tk.symbol}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {token !== "ETH" && !tokenDef?.address && (
                    <div className="microtext text-red-500 mt-1">
                      Set NEXT_PUBLIC_BASE_{token}_ADDRESS to enable {token} payments.
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium">Currency</label>
                  <div className="relative mt-1">
                    <button
                      type="button"
                      onClick={() => setCurrencyOpen((v) => !v)}
                      className="w-full h-10 pl-11 pr-8 text-left border rounded-md bg-background hover:bg-foreground/5 transition-colors flex items-center gap-2"
                    >
                      <span className="flag-ring absolute left-2 top-1/2 -translate-y-1/2">
                        <img alt={currency} src={flagUrl(currency)} />
                      </span>
                      <span className="truncate">
                        {currency} — {(CURRENCIES as readonly any[]).find((x) => x.code === currency)?.label || ""}
                      </span>
                      <span className="ml-auto opacity-70">▾</span>
                    </button>

                    {currencyOpen && (
                      <div className="absolute z-40 mt-1 w-full md:w-full w-[92vw] max-w-[92vw] rounded-md border bg-background shadow-md p-1 max-h-64 overflow-auto">
                        {CURRENCIES.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              setCurrency(c.code);
                              setCurrencyOpen(false);
                            }}
                            className="w-full px-2 py-2 rounded-md hover:bg-foreground/5 flex items-center gap-2 text-sm transition-colors"
                          >
                            <span className="flag-ring" style={{ width: 18, height: 18 }}>
                              <img alt={c.code} src={flagUrl(c.code)} />
                            </span>
                            <span className="font-medium">{c.code}</span>
                            <span className="text-muted-foreground">— {c.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-2 h-16 grid items-center">
                    {fiat ? (
                      <span className="inline-flex items-center gap-4">
                        <span
                          className="flag-ring"
                          style={{ width: 28, height: 28, boxShadow: "0 0 0 3px rgba(245,64,41,0.25)" }}
                        >
                          <img alt={currency} src={flagUrl(currency)} />
                        </span>
                        <span className="text-2xl md:text-3xl font-extrabold tracking-tight">
                          {formatFiat(fiat, currency)}
                          <span className="text-sm text-muted-foreground align-middle">({currency})</span>
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    <div className="microtext text-muted-foreground">Estimates use real-time rates per 1 ETH. Your wallet handles final settlement.</div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-3 space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      Rate: {config.ethPer2Min} ETH / 2 min • Billed by the second • {config.minMinutes}-minute minimum
                    </div>
                    <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                      <span>{loadingCfg ? <span className="inline-block w-24 h-6 rounded bg-foreground/10 align-middle" /> : Number(payEth.toFixed(6))} ETH</span>
                      {discountPct > 0 && (
                        <>
                          <span className="text-sm line-through text-muted-foreground">{Number(baseEth.toFixed(6))} ETH</span>
                          <span className="px-2 py-0.5 rounded-md text-[var(--primary)] bg-[color:color-mix(in_srgb,_var(--primary)_15%,_transparent)] text-xs font-semibold">
                            {Math.round(discountPct * 100)}% off
                          </span>
                        </>
                      )}
                      <span className="text-base font-normal text-muted-foreground">
                        (for {loadingCfg ? <span className="inline-block w-10 h-4 rounded bg-foreground/10 align-middle" /> : clampedMinutes}m)
                      </span>
                    </div>
                    <div className="microtext text-muted-foreground mt-1">ETH total shown excludes network fees. Final amount is computed on-chain at send.</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Minutes</span>
                      <span className="font-semibold">{clampedMinutes}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Token</span>
                      <span className="font-semibold">{token}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Currency</span>
                      <span className="font-semibold">{currency}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">ETH total</span>
                      <span className="font-semibold">{Number(payEth.toFixed(6))} ETH</span>
                    </div>
                    {priceUsd > 0 ? (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Estimated total</span>
                        <span className="font-semibold">{formatFiat(priceUsd, currency)}</span>
                      </div>
                    ) : null}
                    <div className="pt-2 border-t space-y-2">
                      <div className="flex items-center justify-between microtext">
                        <span className="text-muted-foreground">1 ETH</span>
                        <span className="font-medium">{rates[currency] ? formatFiat(1 * Number(rates[currency]), currency) : "—"}</span>
                      </div>
                      <div className="flex items-center justify-between microtext">
                        <span className="text-muted-foreground">{Number(payEth.toFixed(6))} ETH</span>
                        <span className="font-medium">{priceUsd > 0 ? formatFiat(priceUsd, currency) : "—"}</span>
                      </div>
                      {token !== "ETH" && (
                        <div className="flex items-center justify-between microtext">
                          <span className="text-muted-foreground">Converted to {token}</span>
                          <span className="font-medium">
                            {tokenDef?.symbol === "USDC" || tokenDef?.symbol === "USDT"
                              ? priceUsd.toFixed(Number(tokenDef?.decimals || 6))
                              : tokenDef?.symbol === "cbBTC"
                              ? btcUsd > 0
                                ? (priceUsd / btcUsd).toFixed(Number(tokenDef?.decimals || 8))
                                : "—"
                              : tokenDef?.symbol === "cbXRP"
                              ? xrpUsd > 0
                                ? (priceUsd / xrpUsd).toFixed(Number(tokenDef?.decimals || 6))
                                : "—"
                              : "—"}
                            {tokenDef ? ` ${tokenDef.symbol}` : ""}
                          </span>
                        </div>
                      )}
                    </div>
                    {discountPct > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Discount</span>
                        <span className="px-2 py-0.5 rounded-md text-[#4dd9cf] bg-[color:color-mix(in_srgb,_#4dd9cf_15%,_transparent)] font-semibold">
                          {Math.round(discountPct * 100)}% off
                        </span>
                      </div>
                    )}
                    <div className="pt-2 border-t space-y-1 microtext">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Balance before</span>
                        <span className="font-medium">{balanceSeconds === null ? "—" : formatDuration(balanceSeconds)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Purchased time</span>
                        <span className="font-medium">{formatDuration(clampedMinutes * 60)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Balance after</span>
                        <span className="font-medium">
                          {balanceSeconds === null ? "—" : formatDuration(balanceSeconds + clampedMinutes * 60)}
                        </span>
                      </div>
                      <div className="text-muted-foreground">ETH total excludes network fees. Final amount is computed on-chain at send.</div>
                    </div>
                  </div>

                  <div className="rounded-lg border p-3">
                    {fiat > 0 && loggedIn ? (
                      showCheckout ? (
                        <CheckoutWidgetDynamic
                          className="w-full"
                          client={client}
                          chain={chain}
                          currency={currency as any}
                          amount={widgetAmount}
                          seller={getRecipientAddress()}
                          tokenAddress={token === "ETH" ? undefined : (tokenDef?.address as any)}
                          showThirdwebBranding={false}
                          style={{ width: "100%", maxWidth: "100%", background: "transparent", border: "none", borderRadius: 0 }}
                          connectOptions={{ accountAbstraction: { chain, sponsorGas: true } }}
                          purchaseData={{
                            productId: `minutes:${clampedMinutes}`,
                            meta: { token, currency, minutes: clampedMinutes },
                          }}
                          onSuccess={async () => {
                            try {
                              const seconds = clampedMinutes * 60;
                              const wallet = String(authedWallet || "").toLowerCase();
                              await fetch("/api/billing/purchase", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  "x-wallet": wallet,
                                },
                                body: JSON.stringify({
                                  seconds,
                                  usd: Number(priceUsd.toFixed(2)),
                                  token,
                                  wallet,
                                  idempotencyKey: `buy:${wallet}:${seconds}:${Date.now()}`,
                                }),
                              });
                              let after = 0;
                              try {
                                const br = await fetch("/api/billing/balance", {
                                  headers: { "x-wallet": wallet },
                                }).then((r) => r.json());
                                after = Number(br?.balanceSeconds || 0);
                              } catch {}
                              setSuccess({
                                seconds,
                                before: Math.max(0, after - seconds),
                                after,
                                txHash: "",
                              });
                              try {
                                window.postMessage({ type: "billing:refresh" }, "*");
                              } catch {}
                            } catch {}
                          }}
                        />
                      ) : (
                        <div className="w-full flex flex-col items-center justify-center gap-4 py-8 text-center">
                          <img src="/vhsymbol.png" alt="VoiceHub by Ledger1.ai" className="w-16 h-16 rounded-lg object-contain" />
                          <div className="text-sm text-muted-foreground">Review the summary, then continue to checkout</div>
                          <button
                            onClick={() => setShowCheckout(true)}
                            className="px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#4dd9cf]"
                            style={{
                              backgroundColor: "transparent",
                              border: "1px solid #4dd9cf",
                              color: "#e5e7eb",
                              padding: "6px 10px",
                              lineHeight: "1",
                              height: "28px",
                            }}
                            aria-label="Continue to Checkout"
                          >
                            <span className="microtext">Continue to Checkout</span>
                          </button>
                        </div>
                      )
                    ) : (
                      <div className="w-full flex flex-col items-center justify-center gap-4 py-8 text-center">
                        <img src="/vhsymbol.png" alt="VoiceHub by Ledger1.ai" className="w-16 h-16 rounded-lg object-contain" />
                        <div className="text-sm text-muted-foreground">
                          {fiat <= 0 ? "Enter minutes to proceed" : "Login to continue checkout"}
                        </div>
                        <ConnectButtonDynamic
                          client={client}
                          chain={chain}
                          wallets={wallets}
                          connectButton={{
                            label: <span className="microtext">Login</span>,
                            className: "px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#4dd9cf]",
                            style: {
                              backgroundColor: "transparent",
                              border: "1px solid #4dd9cf",
                              color: "#e5e7eb",
                              padding: "6px 10px",
                              lineHeight: "1",
                              height: "28px",
                            },
                          }}
                          signInButton={{
                            label: "Authenticate",
                            className: "px-3 py-1.5 rounded-md border text-[11px] hover:bg-foreground/5 border-[#4dd9cf]",
                            style: {
                              backgroundColor: "transparent",
                              border: "1px solid #4dd9cf",
                              color: "#e5e7eb",
                              padding: "6px 10px",
                              lineHeight: "1",
                              height: "28px",
                            },
                          }}
                          connectModal={{ title: "Login", titleIcon: "/vhsymbol.png", size: "compact" }}
                        />
                      </div>
                    )}
                    <div className="microtext text-muted-foreground text-center mt-3">All purchases are final. No refunds.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Success modal */}
      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 glass-backdrop" onClick={() => setSuccess(null)} />
          <div className="glass-pane relative z-50 w-full max-w-md rounded-xl border p-6">
            <h3 className="text-lg font-semibold mb-2">Transaction Successful</h3>
            <div className="space-y-1 text-sm">
              <div>
                <span className="microtext text-muted-foreground">Purchased</span>{" "}
                <span className="font-semibold">
                  {Math.floor((success.seconds || 0) / 60)}m {(success.seconds || 0) % 60}s
                </span>
              </div>
              <div>
                <span className="microtext text-muted-foreground">Balance before</span>{" "}
                <span className="font-semibold">
                  {Math.floor((success.before || 0) / 60)}m {(success.before || 0) % 60}s
                </span>
              </div>
              <div>
                <span className="microtext text-muted-foreground">Balance after</span>{" "}
                <span className="font-semibold">
                  {Math.floor((success.after || 0) / 60)}m {(success.after || 0) % 60}s
                </span>
              </div>
              {success.txHash && (
                <div className="microtext text-muted-foreground break-all">
                  Tx: {success.txHash.slice(0, 10)}…{success.txHash.slice(-8)}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-1.5 rounded-md border hover:bg-foreground/5 transition-colors" onClick={() => setSuccess(null)}>
                Close
              </button>
            </div>
            </div>
        </div>
      )}
    </>
  );
}
