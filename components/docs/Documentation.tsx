"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import nexioLogo from "@/public/nexio-logo.jpg";
import {
  CONTRACT_SPECS,
  DOCS_MOTION_SVGS,
  GM_TIER_SPECS,
  LP_MAX_SKEW_BPS,
  MODULE_FLOW_SPECS,
  MULTICALL3_CANONICAL_ADDRESS,
  NETWORK_SPEC,
  ROUTING_API_SPEC,
  SECURITY_GUARDRAILS,
  SWAP_MAX_PRICE_IMPACT_BPS,
  SWAP_MAX_VALUE_LOSS_BPS,
  TROUBLESHOOTING_MATRIX,
  UNRANKED_GM_SPEC,
} from "@/lib/protocol-spec";

export type DocsTheme = "dark" | "light";

export type DocumentationProps = {
  theme?: DocsTheme;
};

const CHAPTERS = [
  { id: "overview", num: "01", label: "Overview & Architecture", short: "Overview" },
  { id: "quickstart", num: "02", label: "5-Minute Quickstart", short: "Quickstart" },
  { id: "modules", num: "03", label: "8-Module Protocol Flows", short: "8 Modules" },
  { id: "achswap", num: "04", label: "Swap Routing Proxy & API", short: "Routing API" },
  { id: "identity", num: "05", label: ".nex Domains & Recovery", short: ".nex Identity" },
  { id: "vaults", num: "06", label: "Vaults, NLP & LP Guard", short: "Vaults & LP" },
  { id: "gm", num: "07", label: "Daily GM & Batch Send", short: "GM & Batch" },
  { id: "contracts", num: "08", label: "Contracts & Verified ABIs", short: "Contracts & ABIs" },
  { id: "guardrails", num: "09", label: "Security Guardrails", short: "Guardrails" },
  { id: "troubleshooting", num: "10", label: "Troubleshooting & Specs", short: "Troubleshooting" },
] as const;

type ChapterId = (typeof CHAPTERS)[number]["id"];
type ArchMode = "dual-usdc" | "routing-proxy" | "multicall-reads";

const HASH_ALIASES: Record<string, ChapterId> = {
  start: "overview",
  overview: "overview",
  architecture: "overview",
  quickstart: "quickstart",
  setup: "quickstart",
  concepts: "modules",
  modules: "modules",
  achswap: "achswap",
  routing: "achswap",
  api: "achswap",
  swap: "achswap",
  identity: "identity",
  domains: "identity",
  pass: "identity",
  vaults: "vaults",
  nlp: "vaults",
  lp: "vaults",
  liquidity: "vaults",
  gm: "gm",
  dailygm: "gm",
  batch: "gm",
  contracts: "contracts",
  abis: "contracts",
  guardrails: "guardrails",
  security: "guardrails",
  specs: "troubleshooting",
  history: "troubleshooting",
  troubleshooting: "troubleshooting",
};

function resolveHashChapter(hash: string): ChapterId | null {
  const clean = hash.replace(/^#/, "").trim().toLowerCase();
  if (!clean) return null;
  return HASH_ALIASES[clean] ?? null;
}

function specAddressById(id: string): string {
  return CONTRACT_SPECS.find((c) => c.id === id)?.address ?? "";
}

function CopyTextButton({
  value,
  label = "Copy",
  compact = false,
  forceDarkSurface = false,
}: {
  value: string;
  label?: string;
  compact?: boolean;
  forceDarkSurface?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const colorClasses = copied
    ? forceDarkSurface
      ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
      : "border-emerald-700 bg-emerald-50 text-emerald-900 dark:border-emerald-400/50 dark:bg-emerald-500/15 dark:text-emerald-300"
    : forceDarkSurface
      ? "border-white/20 bg-white/10 text-slate-100 hover:border-cyan-300/60 hover:bg-white/15 hover:text-white"
      : "border-slate-300 bg-white text-slate-800 hover:border-sky-700 hover:bg-slate-100 hover:text-slate-950 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:border-cyan-400/40 dark:hover:bg-white/10 dark:hover:text-white";

  return (
    <button
      type="button"
      onClick={() => {
        void handleCopy();
      }}
      aria-label={`Copy ${label}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border font-mono font-bold transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
        compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs"
      } ${colorClasses}`}
    >
      {copied ? (
        <>
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 8.5l3.2 3.2L13 4.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Copied ✓</span>
        </>
      ) : (
        <>
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M3.5 10.5h-1A1.5 1.5 0 0 1 1 9V2.5A1.5 1.5 0 0 1 2.5 1H9a1.5 1.5 0 0 1 1.5 1.5v1" strokeLinecap="round" />
          </svg>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.82em] font-semibold text-slate-900 dark:border-cyan-400/25 dark:bg-cyan-950/50 dark:text-cyan-200">
      {children}
    </code>
  );
}

function CodeSnippet({
  title,
  language,
  code,
}: {
  title: string;
  language: string;
  code: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-300 bg-[#0b1220] shadow-sm dark:border-white/10 dark:bg-[#040a14]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-bold text-slate-100">{title}</span>
          <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-sky-200">
            {language}
          </span>
        </div>
        <CopyTextButton value={code} label="Copy" compact forceDarkSurface />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MotionGraphicFrame({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-slate-300 bg-[#060d1a] shadow-sm dark:border-cyan-500/25">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={920}
        height={300}
        className="block h-auto w-full select-none"
      />
      <figcaption className="border-t border-slate-300 bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-800 dark:border-white/10 dark:bg-[#07111f] dark:text-slate-300">
        {caption}
      </figcaption>
    </figure>
  );
}

/* ============================================================================
 * 3-MODE INTERACTIVE SYSTEM ARCHITECTURE EXPLORER (CSS-VAR HYDRATION SAFE)
 * ========================================================================== */

function ArchDualUsdcSvg() {
  return (
    <svg
      viewBox="0 0 780 216"
      className="w-full"
      role="img"
      aria-label="Arc Mainnet shared 18-decimal native USDC and 6-decimal ERC-20 precompile architecture with two-sided spot valuation"
    >
      <rect x="4" y="4" width="772" height="208" rx="18" fill="var(--nx-doc-canvas)" />
      <rect x="20" y="54" width="170" height="108" rx="14" fill="var(--nx-doc-node)" stroke="var(--nx-doc-cyan)" strokeWidth="1.5" />
      <text x="105" y="82" textAnchor="middle" fill="var(--nx-doc-fg)" fontSize="13" fontWeight="700">1 Arc Account State</text>
      <text x="105" y="102" textAnchor="middle" fill="var(--nx-doc-cyan-fg)" fontSize="11" fontFamily="monospace">Chain 5042 (0x13b2)</text>
      <text x="105" y="122" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="10">Single underlying USD</text>
      <text x="105" y="138" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="10">reserve at L1 state layer</text>

      <rect x="252" y="20" width="232" height="76" rx="13" fill="var(--nx-doc-node)" stroke="var(--nx-doc-cyan)" strokeWidth="1.5" />
      <text x="368" y="44" textAnchor="middle" fill="var(--nx-doc-fg)" fontSize="12" fontWeight="700">Native Gas View (18 Decimals)</text>
      <text x="368" y="62" textAnchor="middle" fill="var(--nx-doc-cyan-fg)" fontSize="10.5" fontFamily="monospace">eth_getBalance · 1 USDC = 10^18</text>
      <text x="368" y="80" textAnchor="middle" fill="var(--nx-doc-amber-fg)" fontSize="10" fontWeight="700">Max reserves 0.005 USDC for L1 gas</text>

      <rect x="252" y="120" width="232" height="76" rx="13" fill="var(--nx-doc-node)" stroke="var(--nx-doc-emerald)" strokeWidth="1.5" />
      <text x="368" y="144" textAnchor="middle" fill="var(--nx-doc-fg)" fontSize="12" fontWeight="700">ERC-20 Precompile (6 Decimals)</text>
      <text x="368" y="162" textAnchor="middle" fill="var(--nx-doc-emerald-fg)" fontSize="10.5" fontFamily="monospace">0x3600…0000 · 1 USDC = 10^6</text>
      <text x="368" y="180" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="10">poolUsdcFromNative = raw18 / 10^12</text>

      <rect x="546" y="34" width="214" height="148" rx="14" fill="var(--nx-doc-node-alt)" stroke="var(--nx-doc-emerald)" strokeWidth="1.5" />
      <text x="653" y="60" textAnchor="middle" fill="var(--nx-doc-fg)" fontSize="12.5" fontWeight="700">Unified Net Worth &amp; NLP</text>
      <text x="653" y="82" textAnchor="middle" fill="var(--nx-doc-cyan-fg)" fontSize="10.5" fontFamily="monospace">+ Wallet USDC (counted ONCE)</text>
      <text x="653" y="100" textAnchor="middle" fill="var(--nx-doc-cyan-fg)" fontSize="10.5" fontFamily="monospace">+ Vault USDC + LP USDC</text>
      <text x="653" y="118" textAnchor="middle" fill="var(--nx-doc-emerald-fg)" fontSize="10.5" fontFamily="monospace">+ EURC × Pure 2-Sided Spot</text>
      <text x="653" y="138" textAnchor="middle" fill="var(--nx-doc-amber-fg)" fontSize="10" fontWeight="700">10.00 NLP / $100 / 24h</text>
      <text x="653" y="158" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="9.5">Settled via on-chain claimNLP()</text>

      <path d="M 190 88 C 218 88, 220 58, 252 58" fill="none" stroke="var(--nx-doc-cyan)" strokeWidth="1.75" className="nx-doc-dash" />
      <path d="M 190 128 C 218 128, 220 158, 252 158" fill="none" stroke="var(--nx-doc-emerald)" strokeWidth="1.75" className="nx-doc-dash" />
      <path d="M 484 58 C 514 58, 516 90, 546 90" fill="none" stroke="var(--nx-doc-cyan)" strokeWidth="1.75" className="nx-doc-dash" />
      <path d="M 484 158 C 514 158, 516 126, 546 126" fill="none" stroke="var(--nx-doc-emerald)" strokeWidth="1.75" className="nx-doc-dash" />

      <circle r="4" fill="var(--nx-doc-cyan)" className="nx-doc-beam" style={{ offsetPath: "path('M 190 88 C 218 88, 220 58, 252 58')" }} />
      <circle r="4" fill="var(--nx-doc-emerald)" className="nx-doc-beam" style={{ offsetPath: "path('M 190 128 C 218 128, 220 158, 252 158')", animationDelay: "0.7s" }} />
      <circle r="4" fill="var(--nx-doc-emerald)" className="nx-doc-beam" style={{ offsetPath: "path('M 484 158 C 514 158, 516 126, 546 126')", animationDelay: "1.4s" }} />
    </svg>
  );
}

function ArchRoutingProxySvg() {
  return (
    <svg
      viewBox="0 0 780 216"
      className="w-full"
      role="img"
      aria-label="Nexio Server Routing Proxy isolating credentials, computing two-sided pure spot, and enforcing consecutive 48h streak fees"
    >
      <rect x="4" y="4" width="772" height="208" rx="18" fill="var(--nx-doc-canvas)" />

      <rect x="18" y="42" width="150" height="128" rx="14" fill="var(--nx-doc-node)" stroke="var(--nx-doc-cyan)" strokeWidth="1.5" />
      <text x="93" y="68" textAnchor="middle" fill="var(--nx-doc-fg)" fontSize="12" fontWeight="700">Browser Client</text>
      <text x="93" y="88" textAnchor="middle" fill="var(--nx-doc-cyan-fg)" fontSize="10" fontFamily="monospace">spotOnly: true</text>
      <text x="93" y="106" textAnchor="middle" fill="var(--nx-doc-emerald-fg)" fontSize="9.5">(bid + ask) / 2 Mid-Spot</text>
      <text x="93" y="124" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="9.5">No API key in browser</text>
      <text x="93" y="142" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="9.5">Impact &lt;=5% · Loss &lt;=20%</text>

      <rect x="210" y="24" width="204" height="164" rx="14" fill="var(--nx-doc-node-alt)" stroke="var(--nx-doc-amber)" strokeWidth="1.5" />
      <text x="312" y="48" textAnchor="middle" fill="var(--nx-doc-fg)" fontSize="12" fontWeight="700">Nexio Routing Proxy</text>
      <text x="312" y="68" textAnchor="middle" fill="var(--nx-doc-amber-fg)" fontSize="10" fontFamily="monospace">Server Key Isolation</text>
      <text x="312" y="87" textAnchor="middle" fill="var(--nx-doc-cyan-fg)" fontSize="10">getEffectiveStreak (&lt;=48h)</text>
      <text x="312" y="105" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="10">20 / 10 / 5 / 0 bps Tiers</text>
      <text x="312" y="123" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="10">3s dedup · 429 [0,400,900ms]</text>
      <text x="312" y="141" textAnchor="middle" fill="var(--nx-doc-emerald-fg)" fontSize="10">Fee 400/422 → retry 0 bps</text>
      <text x="312" y="161" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="9.5" fontFamily="monospace">120 req/60s IP · 5s quotes</text>

      <rect x="454" y="48" width="144" height="116" rx="14" fill="var(--nx-doc-node)" stroke="var(--nx-doc-emerald)" strokeWidth="1.5" />
      <text x="526" y="74" textAnchor="middle" fill="var(--nx-doc-fg)" fontSize="12" fontWeight="700">Routing Engine</text>
      <text x="526" y="94" textAnchor="middle" fill="var(--nx-doc-emerald-fg)" fontSize="10" fontFamily="monospace">amountOut</text>
      <text x="526" y="112" textAnchor="middle" fill="var(--nx-doc-emerald-fg)" fontSize="10" fontFamily="monospace">minAmountOut</text>
      <text x="526" y="130" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="10">approval + swap.tx</text>

      <rect x="634" y="48" width="128" height="116" rx="14" fill="var(--nx-doc-node)" stroke="var(--nx-doc-cyan)" strokeWidth="1.5" />
      <text x="698" y="74" textAnchor="middle" fill="var(--nx-doc-fg)" fontSize="12" fontWeight="700">Arc L1 Signer</text>
      <text x="698" y="94" textAnchor="middle" fill="var(--nx-doc-amber-fg)" fontSize="10">approve → wait(1)</text>
      <text x="698" y="112" textAnchor="middle" fill="var(--nx-doc-cyan-fg)" fontSize="10">eth_call + gas +15%</text>
      <text x="698" y="130" textAnchor="middle" fill="var(--nx-doc-emerald-fg)" fontSize="10">Finality &lt; 1s</text>

      <line x1="168" y1="106" x2="210" y2="106" stroke="var(--nx-doc-cyan)" strokeWidth="1.75" className="nx-doc-dash" />
      <line x1="414" y1="106" x2="454" y2="106" stroke="var(--nx-doc-amber)" strokeWidth="1.75" className="nx-doc-dash" />
      <line x1="598" y1="106" x2="634" y2="106" stroke="var(--nx-doc-emerald)" strokeWidth="1.75" className="nx-doc-dash" />

      <circle r="4" fill="var(--nx-doc-cyan)" className="nx-doc-beam" style={{ offsetPath: "path('M 168 106 H 210')" }} />
      <circle r="4" fill="var(--nx-doc-amber)" className="nx-doc-beam" style={{ offsetPath: "path('M 414 106 H 454')", animationDelay: "0.6s" }} />
      <circle r="4" fill="var(--nx-doc-emerald)" className="nx-doc-beam" style={{ offsetPath: "path('M 598 106 H 634')", animationDelay: "1.2s" }} />
    </svg>
  );
}

function ArchMulticallReadsSvg() {
  return (
    <svg
      viewBox="0 0 780 216"
      className="w-full"
      role="img"
      aria-label="Multicall3 single-roundtrip read snapshot and multi-generation eth_getLogs history indexer"
    >
      <rect x="4" y="4" width="772" height="208" rx="18" fill="var(--nx-doc-canvas)" />

      <rect x="20" y="38" width="174" height="140" rx="14" fill="var(--nx-doc-node)" stroke="var(--nx-doc-cyan)" strokeWidth="1.5" />
      <text x="107" y="66" textAnchor="middle" fill="var(--nx-doc-fg)" fontSize="12" fontWeight="700">Multi-RPC Transport</text>
      <text x="107" y="86" textAnchor="middle" fill="var(--nx-doc-cyan-fg)" fontSize="10" fontFamily="monospace">rpc.mainnet.arc.io</text>
      <text x="107" y="105" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="10">12,000ms call timeout</text>
      <text x="107" y="123" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="10">30s 429/5xx quarantine</text>
      <text x="107" y="141" textAnchor="middle" fill="var(--nx-doc-emerald-fg)" fontSize="10">batchMaxCount: 1</text>
      <text x="107" y="159" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="9.5">Live latency telemetry</text>

      <rect x="248" y="26" width="234" height="164" rx="14" fill="var(--nx-doc-node-alt)" stroke="var(--nx-doc-emerald)" strokeWidth="1.5" />
      <text x="365" y="52" textAnchor="middle" fill="var(--nx-doc-fg)" fontSize="12.5" fontWeight="700">Multicall3.aggregate3</text>
      <text x="365" y="71" textAnchor="middle" fill="var(--nx-doc-emerald-fg)" fontSize="10.5" fontFamily="monospace">0xcA11bde0…76CA11</text>
      <text x="365" y="92" textAnchor="middle" fill="var(--nx-doc-amber-fg)" fontSize="10" fontWeight="700">STRICTLY READ-ONLY (eth_call)</text>
      <text x="365" y="112" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="10">1 atomic snapshot: Balances, Vaults,</text>
      <text x="365" y="128" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="10">1e18 NLP, 48h GM, ANS &amp; V2 Pool</text>
      <text x="365" y="148" textAnchor="middle" fill="var(--nx-doc-rose-fg)" fontSize="9.5" fontWeight="700">Never used for ERC-20 transfer writes</text>
      <text x="365" y="166" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="9.5">Batch writes: EIP-5792 / Sequential</text>

      <rect x="536" y="28" width="222" height="72" rx="12" fill="var(--nx-doc-node)" stroke="var(--nx-doc-cyan)" strokeWidth="1.5" />
      <text x="647" y="52" textAnchor="middle" fill="var(--nx-doc-fg)" fontSize="11.5" fontWeight="700">Deterministic 30s Snapshot</text>
      <text x="647" y="70" textAnchor="middle" fill="var(--nx-doc-cyan-fg)" fontSize="10">Single-flight dedup + L1 clock</text>
      <text x="647" y="86" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="9.5">Zero stale cross-wallet BigInt leak</text>

      <rect x="536" y="116" width="222" height="72" rx="12" fill="var(--nx-doc-node)" stroke="var(--nx-doc-amber)" strokeWidth="1.5" />
      <text x="647" y="140" textAnchor="middle" fill="var(--nx-doc-fg)" fontSize="11.5" fontWeight="700">eth_getLogs · 7D/30D · CSV</text>
      <text x="647" y="158" textAnchor="middle" fill="var(--nx-doc-amber-fg)" fontSize="10">Adaptive chunks + UTC analytics</text>
      <text x="647" y="174" textAnchor="middle" fill="var(--nx-doc-muted)" fontSize="9.5">Transfers · NLP · GM · ANS · Book</text>

      <line x1="194" y1="108" x2="248" y2="108" stroke="var(--nx-doc-cyan)" strokeWidth="1.75" className="nx-doc-dash" />
      <path d="M 482 84 C 508 84, 510 64, 536 64" fill="none" stroke="var(--nx-doc-cyan)" strokeWidth="1.75" className="nx-doc-dash" />
      <path d="M 194 148 C 340 202, 470 176, 536 152" fill="none" stroke="var(--nx-doc-amber)" strokeWidth="1.5" className="nx-doc-dash" />

      <circle r="4" fill="var(--nx-doc-cyan)" className="nx-doc-beam" style={{ offsetPath: "path('M 194 108 H 248')" }} />
      <circle r="4" fill="var(--nx-doc-emerald)" className="nx-doc-beam" style={{ offsetPath: "path('M 482 84 C 508 84, 510 64, 536 64')", animationDelay: "0.7s" }} />
    </svg>
  );
}

/* ============================================================================
 * MAIN DOCUMENTATION PORTAL COMPONENT (HYDRATION-SAFE LIGHT & DARK AAA)
 * ========================================================================== */

export default function Documentation({ theme }: DocumentationProps = {}) {
  const [chapter, setChapter] = useState<ChapterId>("overview");
  const [archMode, setArchMode] = useState<ArchMode>("dual-usdc");
  const [activeModuleIdx, setActiveModuleIdx] = useState<number>(0);
  const [expandedContractId, setExpandedContractId] = useState<string>("daily-gm");

  useEffect(() => {
    const syncFromHash = () => {
      const resolved = resolveHashChapter(window.location.hash);
      if (resolved) {
        setChapter(resolved);
      }
    };
    window.addEventListener("hashchange", syncFromHash);
    const frame = window.requestAnimationFrame(syncFromHash);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const selectChapter = useCallback((next: ChapterId) => {
    setChapter(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${next}`);
    }
  }, []);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let nextIdx: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIdx = (idx + 1) % CHAPTERS.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIdx = (idx - 1 + CHAPTERS.length) % CHAPTERS.length;
    } else if (event.key === "Home") {
      nextIdx = 0;
    } else if (event.key === "End") {
      nextIdx = CHAPTERS.length - 1;
    }
    if (nextIdx !== null) {
      event.preventDefault();
      const target = CHAPTERS[nextIdx];
      selectChapter(target.id);
      const btn = document.getElementById(`nx-doc-tab-${target.id}`);
      btn?.focus();
    }
  };

  const activeModule = MODULE_FLOW_SPECS[activeModuleIdx] ?? MODULE_FLOW_SPECS[0];

  const cardClass =
    "rounded-3xl border border-slate-300 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#07111f]/90 dark:shadow-xl";
  const subCardClass =
    "rounded-2xl border border-slate-300 bg-[#f8fafc] p-4 dark:border-white/10 dark:bg-white/[0.03]";
  const mutedTextClass = "text-slate-700 dark:text-slate-300";
  const subtleTextClass = "text-slate-600 dark:text-slate-400";
  const tabActiveClass =
    "border-sky-900 bg-sky-800 text-white shadow-sm dark:border-cyan-300 dark:bg-cyan-400 dark:text-slate-950";
  const tabInactiveClass =
    "border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-white/25 dark:hover:bg-white/[0.07] dark:hover:text-white";
  const tableWrapClass =
    "overflow-x-auto rounded-2xl border border-slate-300 bg-white dark:border-white/10 dark:bg-[#050c17]";
  const tableHeadClass =
    "border-b border-slate-300 bg-slate-100 text-slate-800 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200";
  const tableRowClass =
    "border-t border-slate-200 text-slate-900 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/[0.02]";
  const linkClass =
    "font-semibold text-sky-800 underline decoration-sky-700/40 underline-offset-4 hover:text-sky-950 dark:text-cyan-300 dark:decoration-cyan-400/40 dark:hover:text-cyan-200";
  const pillSecondaryClass =
    "border-slate-300 bg-white text-slate-800 hover:border-sky-700 hover:bg-slate-100 hover:text-slate-950 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10";

  const usdcAddr = specAddressById("usdc");
  const eurcAddr = specAddressById("eurc");
  const ansAddr = specAddressById("ans");
  const dailyGmAddr = specAddressById("daily-gm");
  const usdcVaultAddr = specAddressById("usdc-vault");
  const eurcVaultAddr = specAddressById("eurc-vault");
  const nexioSwapAddr = specAddressById("nexio-swap");
  const addressBookAddr = specAddressById("address-book");
  const v2RouterAddr = specAddressById("v2-router");

  const envSnippet = `# .env.local (Next.js server credentials & public address overrides — gitignored)
ACHSWAP_API_KEY=your_server_routing_api_key
ACHSWAP_FEE_RECIPIENT=${NETWORK_SPEC.defaultFeeRecipient}

NEXT_PUBLIC_ANS_ADDRESS=${ansAddr}
NEXT_PUBLIC_DAILY_GM_ADDRESS=${dailyGmAddr}
NEXT_PUBLIC_USDC_VAULT_ADDRESS=${usdcVaultAddr}
NEXT_PUBLIC_EURC_VAULT_ADDRESS=${eurcVaultAddr}
NEXT_PUBLIC_NEXIO_SWAP_ADDRESS=${nexioSwapAddr}
NEXT_PUBLIC_ADDRESS_BOOK_ADDRESS=${addressBookAddr}

# .env.hardhat (Hardhat CLI deployments ONLY — never loaded into Next.js server memory)
PRIVATE_KEY=0xYOUR_64_HEX_DEPLOYER_PRIVATE_KEY`;

  const quickstartBashSnippet = `# macOS / Linux / WSL
npm install
cp .env.example .env.local
npm run typecheck
npm run dev`;

  const quickstartPwshSnippet = `# Windows PowerShell
npm install
Copy-Item .env.example .env.local
npm run typecheck
npm run dev`;

  const curlTokensSnippet = `curl -X GET "http://localhost:3000/api/achswap/tokens?chainId=5042&q=USDC" \\
  -H "Accept: application/json"`;

  const curlQuoteSnippet = `curl -X POST http://localhost:3000/api/achswap/quote \\
  -H "Content-Type: application/json" \\
  -d '{
    "chainId": 5042,
    "tokenIn": "${eurcAddr}",
    "tokenOut": "${usdcAddr}",
    "amountIn": "1000000",
    "slippageBps": 50,
    "spotOnly": true
  }'`;

  const curlSwapSnippet = `curl -X POST http://localhost:3000/api/achswap/swap \\
  -H "Content-Type: application/json" \\
  -d '{
    "chainId": 5042,
    "tokenIn": "${usdcAddr}",
    "tokenOut": "${eurcAddr}",
    "amountIn": "25000000",
    "slippageBps": 100,
    "sender": "0xYourConnectedArcWalletAddress",
    "recipient": "0xYourConnectedArcWalletAddress"
  }'`;

  return (
    <div
      {...(theme ? { "data-theme": theme } : {})}
      className="nx-docs-root w-full space-y-6 text-slate-900 dark:text-slate-100"
    >
      <style>{`
        .nx-docs-root {
          --nx-doc-canvas: #f8fafc;
          --nx-doc-node: #ffffff;
          --nx-doc-node-alt: #eef2f6;
          --nx-doc-fg: #0f172a;
          --nx-doc-muted: #334155;
          --nx-doc-cyan: #0369a1;
          --nx-doc-cyan-fg: #0c4a6e;
          --nx-doc-emerald: #047857;
          --nx-doc-emerald-fg: #064e3b;
          --nx-doc-amber: #b45309;
          --nx-doc-amber-fg: #78350f;
          --nx-doc-rose-fg: #881337;
        }
        :where([data-theme="dark"], [data-theme="dark"] *) .nx-docs-root,
        .nx-docs-root[data-theme="dark"] {
          --nx-doc-canvas: #040b16;
          --nx-doc-node: #081c30;
          --nx-doc-node-alt: #0b2239;
          --nx-doc-fg: #f8fafc;
          --nx-doc-muted: #cbd5e1;
          --nx-doc-cyan: #22d3ee;
          --nx-doc-cyan-fg: #67e8f9;
          --nx-doc-emerald: #34d399;
          --nx-doc-emerald-fg: #6ee7b7;
          --nx-doc-amber: #fbbf24;
          --nx-doc-amber-fg: #fde68a;
          --nx-doc-rose-fg: #fda4af;
        }
        @keyframes nx-doc-dash-kf {
          to { stroke-dashoffset: -48; }
        }
        @keyframes nx-doc-beam-kf {
          0% { offset-distance: 0%; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        .nx-doc-dash {
          stroke-dasharray: 6 8;
          animation: nx-doc-dash-kf 1.6s linear infinite;
        }
        .nx-doc-beam {
          offset-rotate: 0deg;
          animation: nx-doc-beam-kf 2.6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .nx-doc-dash,
          .nx-doc-beam {
            animation: none !important;
          }
        }
      `}</style>

      {/* Top Flagship Hero */}
      <section className="rounded-3xl border border-slate-300 bg-gradient-to-br from-sky-50/90 via-white to-slate-50 p-6 shadow-sm md:p-8 dark:border-cyan-400/20 dark:from-[#071426] dark:via-[#07111f] dark:to-[#040a14] dark:shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image
              src={nexioLogo}
              width={40}
              height={40}
              sizes="40px"
              alt="Nexio Protocol"
              style={{ width: 40, height: 40 }}
              className="h-10 w-10 rounded-xl object-cover border border-slate-300 dark:border-white/15 bg-black shrink-0"
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-sky-100 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-sky-900 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-200">
              <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
              {NETWORK_SPEC.protocolName} · {NETWORK_SPEC.name} · {NETWORK_SPEC.chainId} ({NETWORK_SPEC.chainIdHex})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/docs.txt"
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-full border px-3.5 py-1.5 font-mono text-xs font-bold transition ${pillSecondaryClass}`}
            >
              /docs.txt ↗
            </a>
            <a
              href="/llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-full border px-3.5 py-1.5 font-mono text-xs font-bold transition ${pillSecondaryClass}`}
            >
              /llms.txt ↗
            </a>
            <a
              href={NETWORK_SPEC.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${pillSecondaryClass}`}
            >
              Arc Explorer ↗
            </a>
          </div>
        </div>

        <h2 className="mt-4 max-w-3xl text-2xl font-black tracking-tight text-slate-950 sm:text-3xl md:text-4xl dark:text-white">
          {NETWORK_SPEC.protocolName} — Developer &amp; Architecture Portal
        </h2>
        <p className={`mt-3 max-w-3xl text-sm leading-relaxed ${mutedTextClass}`}>
          {NETWORK_SPEC.tagline}. Canonical specification covering shared 18-decimal native and 6-decimal ERC-20{" "}
          <InlineCode>USDC</InlineCode> accounting, universal multi-token swaps with 5-second live quotes, wallet-scoped{" "}
          <InlineCode>NexioAddressBook</InlineCode> whitelisting, 7D/30D on-chain Net Worth analytics, client-side CSV accounting exports, exact{" "}
          <InlineCode>10.00 NLP / $100 / 24h</InlineCode> vaults with <InlineCode>claimNLP()</InlineCode>, consecutive 48-hour{" "}
          <InlineCode>DailyGM</InlineCode> tiers (<InlineCode>30D</InlineCode> / <InlineCode>90D</InlineCode> /{" "}
          <InlineCode>180D VIP</InlineCode>), and permanent <InlineCode>.nex</InlineCode> identity recovery.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <a
            href="#quickstart"
            onClick={(e) => {
              e.preventDefault();
              selectChapter("quickstart");
            }}
            className="rounded-full bg-sky-800 px-4 py-2 text-xs font-black tracking-wide text-white shadow-sm transition hover:bg-sky-900 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300"
          >
            Open 5-Minute Quickstart →
          </a>
          <a
            href="#contracts"
            onClick={(e) => {
              e.preventDefault();
              selectChapter("contracts");
            }}
            className={`rounded-full border px-4 py-2 text-xs font-bold transition ${pillSecondaryClass}`}
          >
            Verified Contracts &amp; ABIs
          </a>
          <a
            href="#achswap"
            onClick={(e) => {
              e.preventDefault();
              selectChapter("achswap");
            }}
            className={`rounded-full border px-4 py-2 text-xs font-bold transition ${pillSecondaryClass}`}
          >
            Routing Proxy Schemas
          </a>
        </div>
      </section>

      {/* Mobile / Tablet Horizontal ARIA Tablist */}
      <div
        role="tablist"
        aria-label="Documentation chapters"
        className="flex gap-2 overflow-x-auto pb-1 lg:hidden"
      >
        {CHAPTERS.map((item, idx) => {
          const selected = chapter === item.id;
          return (
            <button
              key={item.id}
              id={`nx-doc-mobile-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`nx-doc-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectChapter(item.id)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition ${
                selected ? tabActiveClass : tabInactiveClass
              }`}
            >
              <span className="mr-1.5 font-mono opacity-80">{item.num}</span>
              {item.short}
            </button>
          );
        })}
      </div>

      {/* Desktop Sticky 2-Column Portal Layout */}
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        {/* Sticky 240px Sidebar */}
        <aside className="hidden lg:sticky lg:top-24 lg:block">
          <div className="rounded-2xl border border-slate-300 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#07111f]/90 dark:shadow-xl">
            <div className={`px-2.5 pb-2 text-[10px] font-black uppercase tracking-[0.18em] ${subtleTextClass}`}>
              Protocol Reference
            </div>
            <div role="tablist" aria-orientation="vertical" aria-label="Documentation chapters" className="space-y-1">
              {CHAPTERS.map((item, idx) => {
                const selected = chapter === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nx-doc-tab-${item.id}`}
                    role="tab"
                    type="button"
                    aria-selected={selected}
                    aria-controls={`nx-doc-panel-${item.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => selectChapter(item.id)}
                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                      selected ? tabActiveClass : tabInactiveClass
                    }`}
                  >
                    <span className="font-mono text-[10px] opacity-80">{item.num}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-2 border-t border-slate-200 pt-3 text-xs dark:border-white/10">
              <div className={`px-2 text-[10px] font-black uppercase tracking-widest ${subtleTextClass}`}>
                Live Parameters
              </div>
              <div className="flex items-center justify-between px-2 font-mono text-[11px]">
                <span className={subtleTextClass}>Chain ID</span>
                <span className="font-bold">{NETWORK_SPEC.chainId} ({NETWORK_SPEC.chainIdHex})</span>
              </div>
              <div className="flex items-center justify-between px-2 font-mono text-[11px]">
                <span className={subtleTextClass}>Vault NLP</span>
                <span className="font-bold">10 / $100 / 24h</span>
              </div>
              <div className="flex items-center justify-between px-2 font-mono text-[11px]">
                <span className={subtleTextClass}>GM Tiers</span>
                <span className="font-bold">30D · 90D · 180D</span>
              </div>
              <div className="flex items-center justify-between px-2 font-mono text-[11px]">
                <span className={subtleTextClass}>LP Skew Cap</span>
                <span className="font-bold">±{(LP_MAX_SKEW_BPS / 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Active Chapter Tabpanel */}
        <div
          id={`nx-doc-panel-${chapter}`}
          role="tabpanel"
          aria-labelledby={`nx-doc-tab-${chapter}`}
          className="min-w-0 space-y-6"
        >
          {/* CHAPTER 01: OVERVIEW & ARCHITECTURE */}
          {chapter === "overview" && (
            <div id="overview" className="space-y-6">
              <MotionGraphicFrame
                src={DOCS_MOTION_SVGS.architecture}
                alt="Nexio Protocol System Architecture on Arc Mainnet 5042"
                caption="End-to-end Nexio Protocol topology: shared 18/6-decimal USDC state, single-roundtrip Multicall3 read batching, server-isolated routing proxy, and Arc Mainnet 5042 contracts."
              />

              <section className={cardClass}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className={`text-[10px] font-black uppercase tracking-widest ${subtleTextClass}`}>
                      Interactive System Architecture Explorer
                    </div>
                    <h3 className="mt-1 text-xl font-black tracking-tight">
                      Inspect Dual-Decimal USDC, Pure Market Spot &amp; Multicall3 Subsystems
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["dual-usdc", "1. Dual-Decimal USDC"],
                        ["routing-proxy", "2. Pure Spot & Proxy"],
                        ["multicall-reads", "3. Multicall3 Reads"],
                      ] as const
                    ).map(([modeId, label]) => (
                      <button
                        key={modeId}
                        type="button"
                        onClick={() => setArchMode(modeId)}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                          archMode === modeId ? tabActiveClass : tabInactiveClass
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-300 dark:border-cyan-500/20">
                  {archMode === "dual-usdc" && <ArchDualUsdcSvg />}
                  {archMode === "routing-proxy" && <ArchRoutingProxySvg />}
                  {archMode === "multicall-reads" && <ArchMulticallReadsSvg />}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    {
                      label: "RPC Endpoint",
                      value: NETWORK_SPEC.rpcUrl,
                      sub: "Supports NEXT_PUBLIC_ARC_RPC_URLS failover",
                    },
                    {
                      label: "Block Explorer",
                      value: NETWORK_SPEC.explorerUrl,
                      sub: `Chain ID ${NETWORK_SPEC.chainId} (${NETWORK_SPEC.chainIdHex})`,
                    },
                    {
                      label: "Protocol Fee Treasury",
                      value: NETWORK_SPEC.feeRecipient,
                      sub: "Server env ACHSWAP_FEE_RECIPIENT",
                    },
                  ].map((item) => (
                    <div key={item.label} className={subCardClass}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[11px] font-black uppercase tracking-wider ${subtleTextClass}`}>
                          {item.label}
                        </span>
                        <CopyTextButton value={item.value} label="Copy" compact />
                      </div>
                      <div className="mt-2 truncate font-mono text-xs font-bold">{item.value}</div>
                      <div className={`mt-1 text-[11px] ${subtleTextClass}`}>{item.sub}</div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="rounded-2xl border border-sky-300 bg-sky-50 p-5 text-sm leading-relaxed text-slate-900 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-50">
                <div className="font-black">Shared USDC Precompile &amp; Pure Two-Sided Market Spot</div>
                <p className="mt-1.5">
                  On Arc Mainnet, native gas <InlineCode>USDC</InlineCode> (<InlineCode>18</InlineCode> decimals via{" "}
                  <InlineCode>eth_getBalance</InlineCode>) and ERC-20 <InlineCode>{usdcAddr}</InlineCode> (
                  <InlineCode>6</InlineCode> decimals) expose <strong>one shared account balance</strong> scaled by{" "}
                  <InlineCode>10^12</InlineCode>. Meanwhile, <InlineCode>EURC</InlineCode> valuations query parallel{" "}
                  <InlineCode>1 EURC -&gt; USDC</InlineCode> and <InlineCode>1 USDC -&gt; EURC</InlineCode> quotes with{" "}
                  <InlineCode>spotOnly: true, feeBps: 0</InlineCode>, computing{" "}
                  <InlineCode>(bidOut + impliedAskOut + 1n) / 2n</InlineCode> to cancel symmetric AMM pool swap spread to within{" "}
                  <InlineCode>&lt; 0.05 bps</InlineCode> of true mid-market spot.
                </p>
              </div>
            </div>
          )}

          {/* CHAPTER 02: 5-MINUTE QUICKSTART */}
          {chapter === "quickstart" && (
            <div id="quickstart" className="space-y-6">
              <section className={`${cardClass} space-y-5`}>
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-widest ${subtleTextClass}`}>
                    Local &amp; Production Environment
                  </div>
                  <h3 className="mt-1 text-xl font-black tracking-tight">5-Minute Developer Quickstart</h3>
                  <p className={`mt-2 text-sm leading-relaxed ${mutedTextClass}`}>
                    Requires Node.js <InlineCode>20.9+</InlineCode>, npm, and an EVM wallet (Rabby or MetaMask) configured for Arc Mainnet (<InlineCode>5042</InlineCode> / <InlineCode>{NETWORK_SPEC.chainIdHex}</InlineCode>).
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <CodeSnippet title="1a. Bootstrap (macOS / Linux / WSL)" language="bash" code={quickstartBashSnippet} />
                  <CodeSnippet title="1b. Bootstrap (Windows PowerShell)" language="powershell" code={quickstartPwshSnippet} />
                </div>

                <CodeSnippet
                  title="2. Environment Isolation (.env.local vs .env.hardhat)"
                  language="dotenv"
                  code={envSnippet}
                />

                <div className="rounded-2xl border border-amber-400 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-50">
                  <strong>Credential Boundary:</strong> Never prefix <InlineCode>ACHSWAP_API_KEY</InlineCode> with{" "}
                  <InlineCode>NEXT_PUBLIC_</InlineCode>, and store Hardhat deployer keys exclusively in{" "}
                  <InlineCode>.env.hardhat</InlineCode> so Next.js never loads <InlineCode>PRIVATE_KEY</InlineCode> into web server memory.
                </div>

                <div className={tableWrapClass}>
                  <table className="w-full min-w-[540px] text-left text-xs">
                    <thead className={`text-[11px] font-black uppercase tracking-wider ${tableHeadClass}`}>
                      <tr>
                        <th className="px-4 py-3">Command</th>
                        <th className="px-4 py-3">Purpose</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["npm run dev", "Start Next.js development server on http://localhost:3000"],
                        ["npm run typecheck", "Run strict TypeScript compiler verification (tsc --noEmit)"],
                        ["npm run lint", "Run ESLint static analysis across app/, components/, and lib/"],
                        ["npm run build", "Compile optimized Next.js production bundle & static spec routes"],
                        ["npm start", "Serve production Next.js build"],
                        ["npm run compile", "Compile Solidity contracts with Hardhat (0.8.24, optimizer 200 runs)"],
                        ["npm run deploy:mainnet", "Execute verified Arc Mainnet deployment script (scripts/deploy_mainnet.ts)"],
                      ].map(([cmd, desc]) => (
                        <tr key={cmd} className={tableRowClass}>
                          <td className="px-4 py-3 font-mono font-bold">
                            <div className="flex items-center justify-between gap-2">
                              <span>{cmd}</span>
                              <CopyTextButton value={cmd} label="Copy" compact />
                            </div>
                          </td>
                          <td className={`px-4 py-3 ${mutedTextClass}`}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* CHAPTER 03: 8-MODULE ANIMATED PROTOCOL FLOWS */}
          {chapter === "modules" && (
            <div id="modules" className="space-y-6">
              <section className={`${cardClass} space-y-5`}>
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-widest ${subtleTextClass}`}>
                    End-to-End Execution Blueprints
                  </div>
                  <h3 className="mt-1 text-xl font-black tracking-tight">8 Animated Protocol Module Flows</h3>
                  <p className={`mt-1.5 text-sm ${mutedTextClass}`}>
                    Select any module below to inspect its live SVG motion architecture and deterministic safety invariants.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {MODULE_FLOW_SPECS.map((m, idx) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setActiveModuleIdx(idx)}
                      className={`rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition ${
                        activeModuleIdx === idx ? tabActiveClass : tabInactiveClass
                      }`}
                    >
                      <div className="font-mono text-[10px] opacity-80">MODULE {m.num}</div>
                      <div className="mt-0.5 truncate">{m.title.split("(")[0].trim()}</div>
                    </button>
                  ))}
                </div>

                <MotionGraphicFrame
                  src={activeModule.svgPath}
                  alt={activeModule.svgAlt}
                  caption={`Module ${activeModule.num}: ${activeModule.subtitle}`}
                />

                <div className={`${subCardClass} space-y-3`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-base font-black">
                      Module {activeModule.num} — {activeModule.title}
                    </h4>
                    <span className={`font-mono text-[11px] font-semibold ${subtleTextClass}`}>
                      {activeModule.contractsAndRoutes}
                    </span>
                  </div>
                  <p className={`text-sm leading-relaxed ${mutedTextClass}`}>{activeModule.summary}</p>
                  <ul className="space-y-1.5 pt-1 text-xs">
                    {activeModule.invariants.map((inv) => (
                      <li key={inv} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                        <span className={mutedTextClass}>{inv}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>
          )}

          {/* CHAPTER 04: SWAP ROUTING PROXY & API SCHEMAS */}
          {chapter === "achswap" && (
            <div id="achswap" className="space-y-6">
              <section className={`${cardClass} space-y-5`}>
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-widest ${subtleTextClass}`}>
                    Server-Isolated Execution Pipeline
                  </div>
                  <h3 className="mt-1 text-xl font-black tracking-tight">
                    Swap Routing Proxy Schemas (<InlineCode>/api/achswap/tokens</InlineCode>,{" "}
                    <InlineCode>/quote</InlineCode> &amp; <InlineCode>/swap</InlineCode>)
                  </h3>
                </div>

                <MotionGraphicFrame
                  src={DOCS_MOTION_SVGS.swap}
                  alt="Nexio Swap Execution Pipeline animated flow"
                  caption="Protected universal swap execution: dynamic Arc Mainnet token discovery, strict 5s AbortController quote auto-refresh, pure 0-fee spot, streak discounts, and pre-simulated settlement."
                />

                <div className="grid gap-3 md:grid-cols-3 text-xs leading-relaxed">
                  <div className={subCardClass}>
                    <div className="font-black">Dynamic Token Discovery &amp; Anti-Spoof</div>
                    <p className={`mt-1.5 ${mutedTextClass}`}>{ROUTING_API_SPEC.tokenDiscoveryPolicy}</p>
                  </div>
                  <div className={subCardClass}>
                    <div className="font-black">Pure Spot, 5s Refresh &amp; 3s Dedupe</div>
                    <p className={`mt-1.5 ${mutedTextClass}`}>{ROUTING_API_SPEC.pureSpotPolicy}</p>
                    <p className={`mt-2 ${mutedTextClass}`}>{ROUTING_API_SPEC.quoteCachePolicy}</p>
                  </div>
                  <div className={subCardClass}>
                    <div className="font-black">Consecutive 48h Streak Fee &amp; 0-bps Fallback</div>
                    <p className={`mt-1.5 ${mutedTextClass}`}>{ROUTING_API_SPEC.streakLookupPolicy}</p>
                    <p className={`mt-2 ${mutedTextClass}`}>{ROUTING_API_SPEC.feeFallbackPolicy}</p>
                  </div>
                </div>

                <CodeSnippet title="GET /api/achswap/tokens (Verified & On-Chain Token Discovery)" language="bash" code={curlTokensSnippet} />

                <div className="grid gap-4 lg:grid-cols-2">
                  <CodeSnippet title="POST /api/achswap/quote (Pure Spot Reference)" language="bash" code={curlQuoteSnippet} />
                  <CodeSnippet title="POST /api/achswap/swap (Executable Calldata)" language="bash" code={curlSwapSnippet} />
                </div>

                <div className={tableWrapClass}>
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className={`text-[11px] font-black uppercase tracking-wider ${tableHeadClass}`}>
                      <tr>
                        <th className="px-4 py-3">Endpoint / Direction</th>
                        <th className="px-4 py-3">Field</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Validation &amp; Server/Client Behavior</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ROUTING_API_SPEC.quoteRequestFields.map((f) => (
                        <tr key={`q-${f.field}`} className={tableRowClass}>
                          <td className="px-4 py-2.5 font-mono text-[11px] font-bold">Request (/quote &amp; /swap)</td>
                          <td className="px-4 py-2.5 font-mono font-bold">{f.field}{f.required ? " *" : ""}</td>
                          <td className="px-4 py-2.5 font-mono text-[11px]">{f.type}</td>
                          <td className={`px-4 py-2.5 ${mutedTextClass}`}>{f.validationAndBehavior}</td>
                        </tr>
                      ))}
                      {ROUTING_API_SPEC.swapAdditionalRequestFields.map((f) => (
                        <tr key={`s-${f.field}`} className={tableRowClass}>
                          <td className="px-4 py-2.5 font-mono text-[11px] font-bold">Request (/swap only)</td>
                          <td className="px-4 py-2.5 font-mono font-bold">{f.field}{f.required ? " *" : ""}</td>
                          <td className="px-4 py-2.5 font-mono text-[11px]">{f.type}</td>
                          <td className={`px-4 py-2.5 ${mutedTextClass}`}>{f.validationAndBehavior}</td>
                        </tr>
                      ))}
                      {ROUTING_API_SPEC.normalizedResponseFields.map((f) => (
                        <tr key={`r-${f.field}`} className={tableRowClass}>
                          <td className="px-4 py-2.5 font-mono text-[11px] font-bold">Normalized Response</td>
                          <td className="px-4 py-2.5 font-mono font-bold">{f.field}</td>
                          <td className="px-4 py-2.5 font-mono text-[11px]">{f.type}</td>
                          <td className={`px-4 py-2.5 ${mutedTextClass}`}>{f.validationAndBehavior}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h4 className="mb-2.5 text-sm font-black">
                    Complete Proxy &amp; Client Error Envelope Matrix (<InlineCode>{`{ error: { code, message, reason? } }`}</InlineCode>)
                  </h4>
                  <div className={tableWrapClass}>
                    <table className="w-full min-w-[680px] text-left text-xs">
                      <thead className={`text-[11px] font-black uppercase tracking-wider ${tableHeadClass}`}>
                        <tr>
                          <th className="px-4 py-3">HTTP</th>
                          <th className="px-4 py-3">Error Code</th>
                          <th className="px-4 py-3">Layer</th>
                          <th className="px-4 py-3">Retry Policy</th>
                          <th className="px-4 py-3">Meaning &amp; Deterministic Handling</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ROUTING_API_SPEC.errorMatrix.map((err) => (
                          <tr key={`${err.httpStatus}-${err.code}`} className={tableRowClass}>
                            <td className="px-4 py-2.5 font-mono font-bold">{err.httpStatus}</td>
                            <td className="px-4 py-2.5 font-mono font-bold">{err.code}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{err.layer}</td>
                            <td className="px-4 py-2.5">{err.retryPolicy}</td>
                            <td className={`px-4 py-2.5 ${mutedTextClass}`}>{err.meaningAndHandling}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* CHAPTER 05: .NEX DOMAINS, NEXIO PASS & SOVEREIGN RECOVERY */}
          {chapter === "identity" && (
            <div id="identity" className="space-y-6">
              <section className={`${cardClass} space-y-5`}>
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-widest ${subtleTextClass}`}>
                    Arc Name Service (NexNameService)
                  </div>
                  <h3 className="mt-1 text-xl font-black tracking-tight">
                    Permanent 1-Wallet-1-<InlineCode>.nex</InlineCode> Registry &amp; Sovereign Pass Recovery
                  </h3>
                </div>

                <MotionGraphicFrame
                  src={DOCS_MOTION_SVGS.identity}
                  alt="Permanent .nex Identity and Sovereign Nexio Pass Recovery animated diagram"
                  caption="1 Wallet = 1 Permanent .nex Domain: revert-safe isAvailable/hasDomain pre-checks, bidirectional ownership handshake, and local 3x DPI 1.586:1 fintech Pass card export."
                />

                <div className="rounded-2xl border border-amber-400 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-50">
                  <strong>Revert-on-Unregistered Contract Truth:</strong>{" "}
                  <InlineCode>NexNameService.resolve(_name)</InlineCode>,{" "}
                  <InlineCode>resolveByAddress(_owner)</InlineCode>, and{" "}
                  <InlineCode>getFullDomain(_owner)</InlineCode> execute <InlineCode>require(...)</InlineCode> and{" "}
                  <strong>revert</strong> when unbound instead of returning <InlineCode>address(0)</InlineCode> or{" "}
                  <InlineCode>&quot;&quot;</InlineCode>. Always invoke <InlineCode>isAvailable(label)</InlineCode> before{" "}
                  <InlineCode>resolve(label)</InlineCode> and <InlineCode>hasDomain(wallet)</InlineCode> before{" "}
                  <InlineCode>resolveByAddress(wallet)</InlineCode>, and rethrow RPC transport errors rather than mistaking outages for taken names.
                </div>

                <CodeSnippet
                  title="Revert-Safe Bidirectional Identity Verification Pattern"
                  language="typescript"
                  code={`const ans = new ethers.Contract("${ansAddr}", ANS_ABI, provider);

// 1. Safe Reverse Recovery (survives cleared browser localStorage)
const owns = await ans.hasDomain(wallet);
if (owns) {
  const label = (await ans.resolveByAddress(wallet)).trim().toLowerCase();
  // 2. Forward Cross-Check before granting Verified Nexio Pass badge
  if (!(await ans.isAvailable(label))) {
    const forwardOwner = await ans.resolve(label);
    const verified = forwardOwner.toLowerCase() === wallet.toLowerCase();
  }
}`}
                />
              </section>
            </div>
          )}

          {/* CHAPTER 06: AUTOMATED VAULTS, EXACT NLP & LP SKEW GUARD */}
          {chapter === "vaults" && (
            <div id="vaults" className="space-y-6">
              <section className={`${cardClass} space-y-5`}>
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-widest ${subtleTextClass}`}>
                    Automated Yield Vaults &amp; Protected Liquidity
                  </div>
                  <h3 className="mt-1 text-xl font-black tracking-tight">
                    Exact <InlineCode>10.00 NLP / $100 / 24h</InlineCode> Engine, On-Chain{" "}
                    <InlineCode>claimNLP()</InlineCode> &amp; ±5% LP Skew Guard
                  </h3>
                </div>

                <MotionGraphicFrame
                  src={DOCS_MOTION_SVGS.vaults}
                  alt="Automated Yield Vaults and Exact 1e18 NLP Accrual Engine"
                  caption="NexioUSDCVault (0x77e4…e599) & NexioVault EURC (0xfE12…4CB7): 1:1 instant principal custody + continuous 1e18 NLP accrual settled on-chain via claimNLP()."
                />

                <MotionGraphicFrame
                  src={DOCS_MOTION_SVGS.liquidity}
                  alt="USDC/EURC Liquidity Pool and 5 percent Reserve-Skew Guard"
                  caption="V2 Liquidity Guard: compares pool reserve ratio against pure two-sided live market spot, locking addLiquidity above ±5.00% (500 bps) while keeping removeLiquidity open."
                />

                <div className="grid gap-4 md:grid-cols-3 text-xs leading-relaxed">
                  <div className={`${subCardClass} space-y-2`}>
                    <div className="text-sm font-black">Exact 1e18 NLP Point Math &amp; On-Chain Settlement</div>
                    <p className={mutedTextClass}>
                      <InlineCode>NexioUSDCVault</InlineCode> (<InlineCode>{usdcVaultAddr}</InlineCode>) and{" "}
                      <InlineCode>NexioVault [EURC]</InlineCode> (<InlineCode>{eurcVaultAddr}</InlineCode>) custody 6-decimal principal with{" "}
                      <InlineCode>nonReentrant</InlineCode> protection and return exact <strong>1:1 principal</strong> on{" "}
                      <InlineCode>withdraw(amount)</InlineCode>.
                    </p>
                    <p className={mutedTextClass}>
                      Points accrue continuously in 18-decimal precision:{" "}
                      <InlineCode>deltaPoints18 = (stakedBalance * 1e12 * elapsed) / 864000</InlineCode> (
                      <strong>$100 USD staked = exact 10.00 NLP per 86,400s</strong>, normalized for EURC via{" "}
                      <InlineCode>computeUsdScaledVaultNlp18</InlineCode>). Calling <InlineCode>claimNLP()</InlineCode> settles{" "}
                      <InlineCode>accruedPoints</InlineCode> into <InlineCode>claimedPoints</InlineCode> on-chain and emits{" "}
                      <InlineCode>NLPClaimed</InlineCode>.
                    </p>
                  </div>

                  <div className={`${subCardClass} space-y-2`}>
                    <div className="text-sm font-black">7D / 30D On-Chain Net Worth Analytics</div>
                    <p className={mutedTextClass}>
                      <InlineCode>lib/portfolio-analytics.ts</InlineCode> reconstructs daily UTC end-of-day snapshots backward from verified Wallet, Vault, and LP balances using{" "}
                      <InlineCode>eth_getLogs</InlineCode> (<InlineCode>Previous = Current - NetTransfers(day)</InlineCode>).
                    </p>
                    <p className={mutedTextClass}>
                      Internal Vault stakes/withdrawals and LP moves shift funds between buckets while keeping Total Net Worth strictly invariant; EURC balances are valued against exact live spot with zero synthetic or random points.
                    </p>
                  </div>

                  <div className={`${subCardClass} space-y-2`}>
                    <div className="text-sm font-black">±5.00% (500 bps) Liquidity Skew &amp; Spot Freshness Guard</div>
                    <p className={mutedTextClass}>
                      Before <InlineCode>addLiquidity</InlineCode> on <InlineCode>{v2RouterAddr}</InlineCode>, Nexio compares the V2{" "}
                      <InlineCode>reserveUsdc / reserveEurc</InlineCode> ratio symmetrically against a fresh (
                      <InlineCode>&lt;= 45s</InlineCode>) two-sided 1-EURC live market spot quote.
                    </p>
                    <p className={mutedTextClass}>
                      Deposits are hard-locked whenever divergence exceeds <InlineCode>{LP_MAX_SKEW_BPS} bps</InlineCode> (5.00%) or when live market spot is unavailable/stale.{" "}
                      <InlineCode>removeLiquidity</InlineCode> remains unconditionally open at all times.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* CHAPTER 07: CONSECUTIVE DAILY GM (3 TIERS) & BATCH TRANSFERS */}
          {chapter === "gm" && (
            <div id="gm" className="space-y-6">
              <section className={`${cardClass} space-y-5`}>
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-widest ${subtleTextClass}`}>
                    Consecutive Streak Protocol &amp; Multi-Recipient Settlement
                  </div>
                  <h3 className="mt-1 text-xl font-black tracking-tight">
                    3 Consecutive Daily GM Tiers (<InlineCode>30D</InlineCode> · <InlineCode>90D</InlineCode> ·{" "}
                    <InlineCode>180D VIP</InlineCode>) &amp; Batch Settlement
                  </h3>
                </div>

                <MotionGraphicFrame
                  src={DOCS_MOTION_SVGS.dailyGm}
                  alt="Consecutive Daily GM Protocol and 3 Unlockable Tiers"
                  caption="DailyGM (0x1A85…4c54): 24-hour check-in cooldown + strict 48-hour consecutive window progressing from 0–29D Unranked into 30D Tier 1, 90D Tier 2, and 180D Tier 3 VIP."
                />

                <MotionGraphicFrame
                  src={DOCS_MOTION_SVGS.batch}
                  alt="Dashboard Send and Multi-Recipient Batch Settlement"
                  caption="Multi-recipient Batch Send: 0.005 USDC gas buffer, Multicall3 read-only .nex resolution, and EIP-5792 wallet_sendCalls with sequential prepareAndSendTx fallback."
                />

                <div className={tableWrapClass}>
                  <table className="w-full min-w-[660px] text-left text-xs">
                    <thead className={`text-[11px] font-black uppercase tracking-wider ${tableHeadClass}`}>
                      <tr>
                        <th className="px-4 py-3">Profile / Tier</th>
                        <th className="px-4 py-3">Consecutive Window</th>
                        <th className="px-4 py-3">Protocol Swap Fee</th>
                        <th className="px-4 py-3">Batch Cap</th>
                        <th className="px-4 py-3">Unlocked Status &amp; Benefits</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className={tableRowClass}>
                        <td className="px-4 py-3 font-bold">{UNRANKED_GM_SPEC.label}</td>
                        <td className="px-4 py-3 font-mono font-bold">{UNRANKED_GM_SPEC.rangeLabel}</td>
                        <td className="px-4 py-3 font-mono">{UNRANKED_GM_SPEC.feeBps} bps — Standard baseline</td>
                        <td className="px-4 py-3 font-mono font-bold">{UNRANKED_GM_SPEC.batchLimit} recipients</td>
                        <td className={`px-4 py-3 ${mutedTextClass}`}>{UNRANKED_GM_SPEC.perk}</td>
                      </tr>
                      {GM_TIER_SPECS.map((tier) => (
                        <tr key={tier.id} className={tableRowClass}>
                          <td className="px-4 py-3 font-black">{tier.name} — {tier.label}</td>
                          <td className="px-4 py-3 font-mono font-bold">{tier.rangeLabel}</td>
                          <td className="px-4 py-3 font-mono">{tier.discountLabel}</td>
                          <td className="px-4 py-3 font-mono font-bold">
                            {tier.batchLimit === null ? "Unlimited" : `${tier.batchLimit} recipients`}
                          </td>
                          <td className={`px-4 py-3 ${mutedTextClass}`}>{tier.perk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-2xl border border-sky-300 bg-sky-50 p-4 text-xs leading-relaxed text-slate-900 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-50">
                  <strong>48-Hour Consecutive Reset &amp; Batch Execution Rule:</strong>{" "}
                  <InlineCode>DailyGM.sol</InlineCode> (<InlineCode>{dailyGmAddr}</InlineCode>) requires{" "}
                  <InlineCode>block.timestamp &gt;= lastCheckIn + 24 hours</InlineCode> and enforces a{" "}
                  <strong>48-hour consecutive window</strong>: if <InlineCode>block.timestamp &gt; lastCheckIn + 48 hours</InlineCode>,{" "}
                  <InlineCode>streak</InlineCode> resets to <InlineCode>1</InlineCode> on next check-in and{" "}
                  <InlineCode>getEffectiveStreak(wallet)</InlineCode> returns <InlineCode>0</InlineCode> immediately.{" "}
                  <InlineCode>Multicall3</InlineCode> (<InlineCode>{MULTICALL3_CANONICAL_ADDRESS}</InlineCode>) is used{" "}
                  <strong>strictly for batched reads</strong>; multi-recipient transfer <strong>writes</strong> execute via EIP-5792{" "}
                  <InlineCode>wallet_sendCalls</InlineCode> with sequential <InlineCode>prepareAndSendTx</InlineCode> fallback.
                </div>
              </section>
            </div>
          )}

          {/* CHAPTER 08: COMPLETE SMART CONTRACT & VERIFIED ABI REGISTRY */}
          {chapter === "contracts" && (
            <div id="contracts" className="space-y-6">
              <section className={`${cardClass} space-y-5`}>
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-widest ${subtleTextClass}`}>
                    Arc Mainnet (5042) Canonical Registry
                  </div>
                  <h3 className="mt-1 text-xl font-black tracking-tight">
                    {CONTRACT_SPECS.length} Deployed Contracts, Tokens &amp; Verified ABIs
                  </h3>
                  <p className={`mt-1.5 text-xs ${mutedTextClass}`}>
                    Compiled with {NETWORK_SPEC.solidityCompiler}. Protocol fee treasury:{" "}
                    <InlineCode>{NETWORK_SPEC.feeRecipient}</InlineCode>. Click any row&apos;s{" "}
                    <strong>Inspect ABI</strong> button to view and copy verified signatures, events, and revert strings.
                  </p>
                </div>

                <div className={tableWrapClass}>
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className={`text-[11px] font-black uppercase tracking-wider ${tableHeadClass}`}>
                      <tr>
                        <th className="px-4 py-3">Entity &amp; Solidity Name</th>
                        <th className="px-4 py-3">Decimals</th>
                        <th className="px-4 py-3">Arc Mainnet Address</th>
                        <th className="px-4 py-3">Deploy Tx</th>
                        <th className="px-4 py-3 text-right">ABI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CONTRACT_SPECS.map((c) => {
                        const isOpen = expandedContractId === c.id;
                        return (
                          <tr key={c.id} className={tableRowClass}>
                            <td className="px-4 py-3">
                              <div className="font-black">{c.name}</div>
                              <div className={`font-mono text-[11px] ${subtleTextClass}`}>
                                {c.solidityName}{c.sourceFile ? ` · ${c.sourceFile}` : ""}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px]">{c.decimals}</td>
                            <td className="px-4 py-3 font-mono text-[11px]">
                              <div className="flex items-center gap-2">
                                <a
                                  href={`${NETWORK_SPEC.explorerUrl}/address/${c.address}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={linkClass}
                                >
                                  {c.address}
                                </a>
                                <CopyTextButton value={c.address} label="Copy" compact />
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-[11px]">
                              {c.deploymentTx ? (
                                <a
                                  href={`${NETWORK_SPEC.explorerUrl}/tx/${c.deploymentTx}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={linkClass}
                                >
                                  {c.deploymentTx.slice(0, 10)}…{c.deploymentTx.slice(-6)} ↗
                                </a>
                              ) : (
                                <span className={subtleTextClass}>System / External</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => setExpandedContractId(isOpen ? "" : c.id)}
                                className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                                  isOpen ? tabActiveClass : tabInactiveClass
                                }`}
                              >
                                {isOpen ? "Hide ABI" : "Inspect ABI"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {CONTRACT_SPECS.filter((c) => c.id === expandedContractId).map((c) => {
                  const fullAbiBlock = JSON.stringify(
                    [...c.readFunctions, ...c.writeFunctions, ...c.events],
                    null,
                    2
                  );
                  return (
                    <div key={`abi-${c.id}`} className={`${subCardClass} space-y-4 p-5`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-black">{c.name} — Verified Interface &amp; Notes</div>
                          <p className={`mt-1 text-xs leading-relaxed ${mutedTextClass}`}>{c.integrationNote}</p>
                        </div>
                        {c.envOverrideVar && (
                          <span className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-mono text-[11px] font-bold text-slate-800 dark:border-cyan-500/30 dark:bg-cyan-950/40 dark:text-cyan-200">
                            Env: {c.envOverrideVar}
                          </span>
                        )}
                      </div>

                      <CodeSnippet
                        title={`${c.solidityName} Human-Readable ABI (ethers v6)`}
                        language="json"
                        code={fullAbiBlock}
                      />

                      {c.reverts.length > 0 && (
                        <div className="text-xs">
                          <span className="font-black">Documented Revert Reasons: </span>
                          <span className={`font-mono ${mutedTextClass}`}>{c.reverts.join("  |  ")}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            </div>
          )}

          {/* CHAPTER 09: EXPLICIT SECURITY GUARDRAILS */}
          {chapter === "guardrails" && (
            <div id="guardrails" className="space-y-6">
              <section className={`${cardClass} space-y-5`}>
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-widest ${subtleTextClass}`}>
                    Defense-in-Depth Invariants
                  </div>
                  <h3 className="mt-1 text-xl font-black tracking-tight">
                    {SECURITY_GUARDRAILS.length} Protocol Security Guardrails
                  </h3>
                  <p className={`mt-1.5 text-sm ${mutedTextClass}`}>
                    Enforced across browser transaction preparation, Next.js server proxy routes, and deployed Arc Mainnet contracts: max swap impact{" "}
                    <InlineCode>{SWAP_MAX_PRICE_IMPACT_BPS} bps</InlineCode> (5%), max spot value-loss{" "}
                    <InlineCode>{SWAP_MAX_VALUE_LOSS_BPS} bps</InlineCode> (20%), max LP skew{" "}
                    <InlineCode>{LP_MAX_SKEW_BPS} bps</InlineCode> (5%), and{" "}
                    <InlineCode>{NETWORK_SPEC.gasBufferUsdc} USDC</InlineCode> native gas reserve.
                  </p>
                </div>

                <div className={tableWrapClass}>
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className={`text-[11px] font-black uppercase tracking-wider ${tableHeadClass}`}>
                      <tr>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">Guardrail</th>
                        <th className="px-4 py-3">Threshold / Invariant</th>
                        <th className="px-4 py-3">Enforcement Layer</th>
                        <th className="px-4 py-3">Specification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SECURITY_GUARDRAILS.map((g) => (
                        <tr key={g.id} className={tableRowClass}>
                          <td className="px-4 py-3 font-mono font-black">{g.id}</td>
                          <td className="px-4 py-3 font-bold">{g.title}</td>
                          <td className="px-4 py-3 font-mono text-[11px]">{g.thresholdOrRule}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{g.enforcementLayer}</td>
                          <td className={`px-4 py-3 ${mutedTextClass}`}>{g.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* CHAPTER 10: TROUBLESHOOTING MATRIX & MACHINE-READABLE SPECS */}
          {chapter === "troubleshooting" && (
            <div id="troubleshooting" className="space-y-6">
              <section className={`${cardClass} space-y-5`}>
                <div>
                  <div className={`text-[10px] font-black uppercase tracking-widest ${subtleTextClass}`}>
                    Diagnostics &amp; Single-Source Synchronization
                  </div>
                  <h3 className="mt-1 text-xl font-black tracking-tight">
                    Developer &amp; User Troubleshooting Matrix + Machine Specs
                  </h3>
                </div>

                <MotionGraphicFrame
                  src={DOCS_MOTION_SVGS.history}
                  alt="Adaptive eth_getLogs History Indexer and SSOT Spec Pipeline"
                  caption="Adaptive multi-token eth_getLogs scanner (USDC, EURC, cirBTC, WETH, XAUM, NLPClaimed, CheckedIn, ANS, NexioAddressBook) with client-side full-precision CSV export and SSOT spec sync."
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className={subCardClass}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-black">GET /docs.txt</span>
                      <a
                        href="/docs.txt"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-xs ${linkClass}`}
                      >
                        Open Raw Text ↗
                      </a>
                    </div>
                    <p className={`mt-1.5 text-xs leading-relaxed ${mutedTextClass}`}>
                      Generated deterministically via <InlineCode>buildDocsTxt()</InlineCode> in{" "}
                      <InlineCode>lib/protocol-spec.ts</InlineCode> (<InlineCode>text/plain; charset=utf-8</InlineCode>) for terminal inspection, CI assertions, and auditor diffs.
                    </p>
                  </div>
                  <div className={subCardClass}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-black">GET /llms.txt</span>
                      <a
                        href="/llms.txt"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-xs ${linkClass}`}
                      >
                        Open LLM Index ↗
                      </a>
                    </div>
                    <p className={`mt-1.5 text-xs leading-relaxed ${mutedTextClass}`}>
                      Standards-compliant <InlineCode>llms.txt</InlineCode> structured markdown via{" "}
                      <InlineCode>buildLlmsTxt()</InlineCode> containing H1 title, summary blockquote, verified ABIs, routing proxy schemas, and guardrails.
                    </p>
                  </div>
                </div>

                <div className={tableWrapClass}>
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className={`text-[11px] font-black uppercase tracking-wider ${tableHeadClass}`}>
                      <tr>
                        <th className="px-4 py-3">Symptom / Error Code</th>
                        <th className="px-4 py-3">Module</th>
                        <th className="px-4 py-3">Root Cause</th>
                        <th className="px-4 py-3">Deterministic Resolution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TROUBLESHOOTING_MATRIX.map((row) => (
                        <tr key={row.symptomOrCode} className={tableRowClass}>
                          <td className="px-4 py-3 font-mono font-bold">{row.symptomOrCode}</td>
                          <td className="px-4 py-3 whitespace-nowrap font-semibold">{row.module}</td>
                          <td className={`px-4 py-3 ${mutedTextClass}`}>{row.rootCause}</td>
                          <td className={`px-4 py-3 ${mutedTextClass}`}>{row.resolution}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * STANDALONE /docs PAGE SHELL (ZERO-HYDRATION-MISMATCH TAILWIND dark: SHELL)
 * ========================================================================== */

export function DocsPortalStandalone() {
  const toggleStandaloneTheme = () => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    const next: DocsTheme = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("nexio_theme", next);
    window.dispatchEvent(new Event("nexio-theme"));
  };

  return (
    <main className="min-h-screen bg-[#f1f5f9] text-slate-900 transition-colors duration-300 dark:bg-[#020617] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(14,165,233,0.14),rgba(2,6,23,1))] dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-300 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/85">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-10">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-900 shadow-xs transition hover:border-sky-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              <Image
                src={nexioLogo}
                width={22}
                height={22}
                sizes="22px"
                alt="Nexio"
                style={{ width: 22, height: 22 }}
                className="h-[22px] w-[22px] rounded-md object-cover bg-black"
              />
              <span aria-hidden="true">←</span>
              <span>Back to Nexio Protocol</span>
            </Link>
            <span className="hidden font-mono text-xs font-bold text-sky-800 sm:inline dark:text-cyan-300">
              /docs · Arc Mainnet ({NETWORK_SPEC.chainId})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/docs.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-full border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-800 hover:border-sky-700 hover:bg-slate-100 sm:inline-flex dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              docs.txt
            </a>
            <a
              href="/llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-full border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-800 hover:border-sky-700 hover:bg-slate-100 sm:inline-flex dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
            >
              llms.txt
            </a>
            <button
              type="button"
              onClick={toggleStandaloneTheme}
              aria-label="Toggle light and dark theme"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-black text-slate-900 shadow-xs transition hover:border-sky-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-amber-300 dark:hover:bg-white/10"
            >
              <svg viewBox="0 0 20 20" className="hidden h-3.5 w-3.5 dark:inline-block" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <circle cx="10" cy="10" r="3.5" />
                <path d="M10 2v2m0 12v2M2 10h2m12 0h2m-2.3-5.7-1.4 1.4M5.7 14.3l-1.4 1.4m0-11.4 1.4 1.4m8.6 8.6 1.4 1.4" strokeLinecap="round" />
              </svg>
              <svg viewBox="0 0 20 20" className="inline-block h-3.5 w-3.5 dark:hidden" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M15.5 12.8A6.5 6.5 0 0 1 7.2 4.5a6.5 6.5 0 1 0 8.3 8.3Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden dark:inline">Light Mode</span>
              <span className="inline dark:hidden">Dark Mode</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-10 md:py-10">
        <Documentation />
      </div>
    </main>
  );
}
