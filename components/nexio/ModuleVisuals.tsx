"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import nexioLogo from "@/public/nexio-logo.png";
import {
  AlertTriangleIcon,
  ExternalLinkIcon,
  LockIcon,
  NexioMarkIcon,
  RadarSpinner,
  RefreshCwIcon,
  ShieldCheckIcon,
  SwapFlipIcon,
} from "./Icons";

const ZERO = BigInt(0);
const BPS_SCALE = BigInt(10000);
const UNIT_6 = BigInt(1000000);

function prefersReducedMotionNow(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function inferDecimals(raw: string | number | null | undefined, fallback = 2): number {
  if (typeof raw === "string") {
    const trimmed = raw.trim().replace(/,/g, "");
    const dotIdx = trimmed.indexOf(".");
    if (dotIdx >= 0) {
      return Math.min(8, Math.max(0, trimmed.length - dotIdx - 1));
    }
  }
  return fallback;
}

function formatDurationHm(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/* ============================================================================
 * 1. AnimatedNumber — Interpolated tabular-nums counter + zero-CLS shimmer
 * ========================================================================== */

export type AnimatedNumberProps = {
  value: number | string | null | undefined;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  loading?: boolean;
  ready?: boolean;
  durationMs?: number;
  skeletonWidthClass?: string;
  highlightPositiveDelta?: boolean;
  fallbackText?: string;
  className?: string;
};

export function AnimatedNumber({
  value,
  decimals,
  prefix = "",
  suffix = "",
  loading = false,
  ready = true,
  durationMs = 520,
  skeletonWidthClass = "w-28",
  highlightPositiveDelta = true,
  fallbackText = "—",
  className = "",
}: AnimatedNumberProps) {
  const parsedTarget = useMemo(() => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!cleaned || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }, [value]);

  const resolvedDecimals = decimals ?? inferDecimals(value, 2);
  const currentRef = useRef<number | null>(null);
  const spanRef = useRef<HTMLSpanElement | null>(null);

  const canonicalFinal = useMemo(() => {
    if (parsedTarget === null) return fallbackText;
    if (typeof value === "string" && decimals === undefined) return value;
    return parsedTarget.toLocaleString("en-US", {
      minimumFractionDigits: resolvedDecimals,
      maximumFractionDigits: resolvedDecimals,
    });
  }, [parsedTarget, value, decimals, resolvedDecimals, fallbackText]);

  useEffect(() => {
    const el = spanRef.current;
    if (parsedTarget === null) {
      currentRef.current = null;
      if (el) el.textContent = fallbackText;
      return;
    }

    const formatFull = (str: string) => `${prefix}${str}${suffix}`;

    if (currentRef.current === null || prefersReducedMotionNow() || durationMs <= 0 || !el) {
      currentRef.current = parsedTarget;
      if (el) el.textContent = formatFull(canonicalFinal);
      return;
    }

    const from = currentRef.current;
    const diff = parsedTarget - from;
    if (Math.abs(diff) < 1e-9) {
      currentRef.current = parsedTarget;
      el.textContent = formatFull(canonicalFinal);
      return;
    }

    let glowTimer: number | null = null;
    if (highlightPositiveDelta && diff > 0) {
      el.classList.remove("nx-delta-up");
      void el.offsetWidth;
      el.classList.add("nx-delta-up");
      glowTimer = window.setTimeout(() => {
        el.classList.remove("nx-delta-up");
      }, 640);
    }

    let rafId = 0;
    const start = performance.now();
    const usePlainFixed = typeof value === "string" && !value.includes(",");

    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 4);
      const nextVal = from + diff * eased;
      currentRef.current = nextVal;

      if (t >= 1) {
        currentRef.current = parsedTarget;
        el.textContent = formatFull(canonicalFinal);
        return;
      }

      const formatted = usePlainFixed
        ? nextVal.toFixed(resolvedDecimals)
        : nextVal.toLocaleString("en-US", {
            minimumFractionDigits: resolvedDecimals,
            maximumFractionDigits: resolvedDecimals,
          });
      el.textContent = formatFull(formatted);
      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(rafId);
      if (glowTimer !== null) window.clearTimeout(glowTimer);
    };
  }, [
    parsedTarget,
    canonicalFinal,
    value,
    resolvedDecimals,
    durationMs,
    prefix,
    suffix,
    fallbackText,
    highlightPositiveDelta,
  ]);

  if ((!ready && loading) || (loading && parsedTarget === null)) {
    return (
      <span
        aria-busy="true"
        aria-label="Loading balance"
        className={`nx-shimmer inline-block rounded-lg align-middle select-none text-transparent ${skeletonWidthClass} ${className}`.trim()}
      >
        0.00
      </span>
    );
  }

  return (
    <span ref={spanRef} className={`nx-num ${className}`.trim()}>
      {parsedTarget !== null ? `${prefix}${canonicalFinal}${suffix}` : fallbackText}
    </span>
  );
}

/* ============================================================================
 * 2. Dashboard — DomainResolutionBadge & BatchCapacityRail
 * ========================================================================== */

export type DomainResolutionBadgeProps = {
  resolving: boolean;
  resolvedDomain?: string | null;
  resolvedAddress?: string | null;
  error?: string | null;
  theme?: "dark" | "light";
  className?: string;
};

export function DomainResolutionBadge({
  resolving,
  resolvedDomain,
  resolvedAddress,
  error,
  theme,
  className = "",
}: DomainResolutionBadgeProps) {
  const isOpen = Boolean(resolving || resolvedDomain || resolvedAddress || error);

  return (
    <div
      data-theme={theme}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isOpen ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0 mt-0"
      } ${className}`.trim()}
    >
      <div className="overflow-hidden">
        {resolving ? (
          <div className="flex items-center gap-2 rounded-xl border border-sky-600/35 dark:border-cyan-500/30 bg-sky-50 dark:bg-cyan-500/10 px-3 py-1.5 text-xs font-bold text-sky-900 dark:text-cyan-300">
            <RadarSpinner size={14} />
            <span>Resolving on-chain ANS identity...</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-900 dark:text-rose-300">
            <AlertTriangleIcon size={14} />
            <span>{error}</span>
          </div>
        ) : resolvedDomain || resolvedAddress ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-600/40 dark:border-emerald-500/35 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-950 dark:text-emerald-200">
            <span className="flex items-center gap-1.5 min-w-0">
              <ShieldCheckIcon size={15} className="shrink-0 text-emerald-700 dark:text-emerald-400" />
              <span className="truncate">
                {resolvedDomain ? (
                  <>
                    Verified ANS: <strong className="font-black text-slate-900 dark:text-white">{resolvedDomain}</strong>
                  </>
                ) : (
                  <>
                    Resolves to:{" "}
                    <strong className="font-mono font-black text-slate-900 dark:text-white">
                      {resolvedAddress?.slice(0, 8)}...{resolvedAddress?.slice(-6)}
                    </strong>
                  </>
                )}
              </span>
            </span>
            <span className="shrink-0 rounded-md bg-emerald-200/80 dark:bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
              ANS Verified
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type BatchRecipientStatus = {
  target: string;
  resolved?: string;
  status: "pending" | "signing" | "confirming" | "confirmed" | "failed";
};

export type BatchCapacityRailProps = {
  recipientCount: number;
  batchLimit: number | null;
  tierName?: string;
  recipientStatuses?: BatchRecipientStatus[];
  executionMode?: "idle" | "wallet_batch" | "sequential";
  theme?: "dark" | "light";
  className?: string;
};

export function BatchCapacityRail({
  recipientCount,
  batchLimit,
  tierName = "Unranked",
  recipientStatuses,
  executionMode = "idle",
  theme,
  className = "",
}: BatchCapacityRailProps) {
  const overCap = batchLimit !== null && recipientCount > batchLimit;
  const fillRatio =
    batchLimit === null
      ? recipientCount > 0
        ? 1
        : 0
      : batchLimit > 0
        ? Math.min(1, recipientCount / batchLimit)
        : 0;

  const counts = useMemo(() => {
    if (!recipientStatuses?.length) return null;
    let pending = 0;
    let confirmed = 0;
    let failed = 0;
    for (const item of recipientStatuses) {
      if (item.status === "confirmed") confirmed++;
      else if (item.status === "failed") failed++;
      else pending++;
    }
    return { pending, confirmed, failed };
  }, [recipientStatuses]);

  const barColor = overCap
    ? "bg-rose-600 dark:bg-rose-500"
    : batchLimit !== null && fillRatio > 0.8
      ? "bg-amber-600 dark:bg-amber-500"
      : "bg-sky-600 dark:bg-cyan-500";

  return (
    <div
      data-theme={theme}
      className={`rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-slate-100 dark:bg-black/30 p-3 space-y-2 ${className}`.trim()}
    >
      <div className="nx-num flex items-center justify-between gap-2 text-[11px] font-bold">
        <span className="text-slate-700 dark:text-slate-300">
          Batch Capacity · <span className="text-sky-800 dark:text-cyan-300 font-black">{tierName}</span>
        </span>
        <span
          className={
            overCap
              ? "text-rose-700 dark:text-rose-400 font-black"
              : "text-slate-900 dark:text-slate-200 font-black"
          }
        >
          {batchLimit === null ? `${recipientCount} / ∞ VIP` : `${recipientCount} / ${batchLimit} recipients`}
        </span>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-300 dark:bg-white/[0.08]">
        <div
          className={`h-full w-full origin-left rounded-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${barColor}`}
          style={{ transform: `scaleX(${fillRatio})` }}
        />
      </div>

      {overCap && batchLimit !== null && (
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-800 dark:text-rose-300">
          <AlertTriangleIcon size={13} />
          <span>Exceeds {tierName} cap ({batchLimit}). Unlock higher Daily GM tiers (30D / 90D / 180D) for larger batches.</span>
        </div>
      )}

      {counts && (
        <div className="nx-num flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-300/80 dark:border-white/[0.06] text-[11px] font-bold">
          <span className="text-slate-600 dark:text-slate-400">
            {executionMode === "wallet_batch"
              ? "EIP-5792 Wallet Batch"
              : executionMode === "sequential"
                ? "Sequential Transfers"
                : "Recipient Status"}
          </span>
          <div className="flex items-center gap-2.5">
            <span className="text-sky-800 dark:text-cyan-300">Pending: {counts.pending}</span>
            <span className="text-emerald-800 dark:text-emerald-400">Confirmed: {counts.confirmed}</span>
            {counts.failed > 0 && <span className="text-rose-700 dark:text-rose-400">Failed: {counts.failed}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 3. Nexio Swap — Flip Button, Route Conduit, Quote Ring & Price Impact Meter
 * ========================================================================== */

export function SwapFlipButton({
  direction,
  onClick,
  disabled = false,
  theme,
}: {
  direction: "USDCtoEURC" | "EURCtoUSDC";
  onClick: () => void;
  disabled?: boolean;
  theme?: "dark" | "light";
}) {
  const flipped = direction === "EURCtoUSDC";
  return (
    <button
      type="button"
      data-theme={theme}
      disabled={disabled}
      onClick={onClick}
      aria-label="Switch input and output tokens"
      className="group relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B192E] text-slate-800 dark:text-cyan-300 shadow-md hover:border-sky-600 dark:hover:border-cyan-500/50 hover:text-sky-700 dark:hover:text-cyan-200 active:scale-90 transition-all duration-200 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-45 disabled:pointer-events-none"
    >
      <SwapFlipIcon
        size={17}
        className={`transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
          flipped ? "rotate-180" : "rotate-0"
        }`}
      />
    </button>
  );
}

export type QuoteFreshnessRingProps = {
  quoting: boolean;
  hasQuote: boolean;
  quoteKey?: string | number;
  ttlMs?: number;
  onRefresh?: () => void;
  disabled?: boolean;
  theme?: "dark" | "light";
};

export function QuoteFreshnessRing({
  quoting,
  hasQuote,
  quoteKey = "",
  ttlMs = 15000,
  onRefresh,
  disabled = false,
  theme,
}: QuoteFreshnessRingProps) {
  const arcRef = useRef<SVGCircleElement | null>(null);
  const circumference = 56.55; // 2 * pi * 9

  useEffect(() => {
    const arc = arcRef.current;
    if (!arc) return;
    arc.style.strokeDashoffset = "0";
    if (quoting || !hasQuote || prefersReducedMotionNow() || ttlMs <= 0) {
      return;
    }
    let rafId = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ttlMs);
      arc.style.strokeDashoffset = `${(circumference * p).toFixed(2)}`;
      if (p < 1) rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [quoting, hasQuote, quoteKey, ttlMs]);

  return (
    <button
      type="button"
      data-theme={theme}
      disabled={disabled || quoting || !onRefresh}
      onClick={onRefresh}
      title={quoting ? "Fetching live market quote..." : "Click to refresh live market quote"}
      aria-label={quoting ? "Fetching live market quote" : "Refresh live market quote"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/[0.05] text-sky-800 dark:text-cyan-300 hover:bg-slate-200 dark:hover:bg-white/10 active:scale-95 transition disabled:opacity-60"
    >
      {quoting ? (
        <RadarSpinner size={15} />
      ) : hasQuote ? (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2" className="opacity-25" />
          <circle
            ref={arcRef}
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={0}
            transform="rotate(-90 12 12)"
          />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" />
        </svg>
      ) : (
        <RefreshCwIcon size={14} className="opacity-75" />
      )}
    </button>
  );
}

export type SwapRouteConduitProps = {
  tokenInSymbol: string;
  tokenOutSymbol: string;
  quoting?: boolean;
  swapping?: boolean;
  hasQuote?: boolean;
  executorAddress?: string;
  partnerFeeBps?: number | null;
  explorerUrl?: string;
  theme?: "dark" | "light";
  className?: string;
};

export function SwapRouteConduit({
  tokenInSymbol,
  tokenOutSymbol,
  quoting = false,
  swapping = false,
  hasQuote = false,
  executorAddress,
  partnerFeeBps,
  explorerUrl = "https://explorer.arc.io",
  theme,
  className = "",
}: SwapRouteConduitProps) {
  const beamActive = quoting || swapping || hasQuote;

  return (
    <div
      data-theme={theme}
      className={`rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-slate-100 dark:bg-black/30 px-3.5 py-2.5 ${className}`.trim()}
    >
      <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
        <span>Nexio Routing Engine</span>
        <span className="nx-num flex items-center gap-1.5">
          {partnerFeeBps !== null && partnerFeeBps !== undefined && (
            <span className="rounded border border-sky-600/30 dark:border-cyan-500/25 bg-sky-100 dark:bg-cyan-500/12 px-1.5 py-0.5 text-sky-900 dark:text-cyan-300">
              {partnerFeeBps === 0 ? "0 bps VIP" : `${partnerFeeBps} bps`}
            </span>
          )}
          {executorAddress ? (
            <a
              href={`${explorerUrl.replace(/\/$/, "")}/address/${executorAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Settlement Executor"
              className="inline-flex items-center gap-1 font-mono text-slate-800 dark:text-slate-300 hover:text-sky-700 dark:hover:text-cyan-300"
            >
              <span>{executorAddress.slice(0, 6)}...{executorAddress.slice(-4)}</span>
              <ExternalLinkIcon size={10} />
            </a>
          ) : (
            <span className="text-slate-700 dark:text-slate-300">Live Market Spot</span>
          )}
        </span>
      </div>

      <svg
        viewBox="0 0 320 34"
        className="w-full h-8"
        role="img"
        aria-label={`Swap route from ${tokenInSymbol} through Nexio Routing Engine to ${tokenOutSymbol}`}
      >
        <defs>
          <linearGradient id="nx-swap-beam-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0284c7" />
            <stop offset="50%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>

        {/* Static rail */}
        <line
          x1="58"
          y1="17"
          x2="262"
          y2="17"
          stroke="currentColor"
          strokeOpacity="0.32"
          strokeWidth="2"
          strokeDasharray="4 4"
          className="text-slate-600 dark:text-slate-400"
        />

        {/* Animated liquidity beam */}
        {beamActive && (
          <line
            x1="58"
            y1="17"
            x2="262"
            y2="17"
            stroke="url(#nx-swap-beam-grad)"
            strokeWidth="2.6"
            strokeLinecap="round"
            className="nx-route-active"
          />
        )}

        {/* Token In Pill */}
        <rect x="2" y="5" width="56" height="24" rx="8" fill="#082033" stroke="#0284c7" strokeWidth="1.2" />
        <text x="30" y="20.5" textAnchor="middle" fill="#f0f9ff" fontSize="10" fontWeight="800">
          {tokenInSymbol}
        </text>

        {/* Center Router Pill */}
        <rect x="108" y="5" width="104" height="24" rx="12" fill="#071526" stroke="#38bdf8" strokeWidth="1.2" />
        <text x="160" y="20.5" textAnchor="middle" fill="#e0f2fe" fontSize="9" fontWeight="800" letterSpacing="0.5">
          NEXIO ENGINE
        </text>

        {/* Token Out Pill */}
        <rect x="262" y="5" width="56" height="24" rx="8" fill="#06231e" stroke="#059669" strokeWidth="1.2" />
        <text x="290" y="20.5" textAnchor="middle" fill="#ecfdf5" fontSize="10" fontWeight="800">
          {tokenOutSymbol}
        </text>
      </svg>
    </div>
  );
}

export type PriceImpactMeterProps = {
  priceImpactBps: number | null;
  valueLossBps?: number | null;
  blocked?: boolean;
  blockReason?: string;
  warnThresholdBps?: number;
  blockThresholdBps?: number;
  theme?: "dark" | "light";
  className?: string;
};

export function PriceImpactMeter({
  priceImpactBps,
  valueLossBps = null,
  blocked = false,
  blockReason,
  warnThresholdBps = 50,
  blockThresholdBps = 500,
  theme,
  className = "",
}: PriceImpactMeterProps) {
  const effectiveBps = Math.max(priceImpactBps ?? 0, valueLossBps ?? 0);
  if (priceImpactBps === null && valueLossBps === null && !blocked) return null;

  const isWarn = !blocked && effectiveBps > warnThresholdBps;
  const ratio = Math.min(1, Math.max(0, effectiveBps / blockThresholdBps));

  const formatBpsPct = (bps: number | null) =>
    bps === null ? "n/a" : `${(bps / 100).toFixed(2)}%`;

  return (
    <div
      data-theme={theme}
      className={`mt-2.5 rounded-xl border px-3 py-2 text-[11px] ${
        blocked
          ? "border-rose-500/45 bg-rose-50 dark:bg-rose-500/10 text-rose-950 dark:text-rose-200"
          : isWarn
            ? "border-amber-500/45 bg-amber-50 dark:bg-amber-500/10 text-amber-950 dark:text-amber-200"
            : "border-slate-300 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.03] text-slate-800 dark:text-slate-300"
      } ${className}`.trim()}
    >
      <div className="nx-num flex flex-wrap items-center justify-between gap-2 font-bold">
        <span>Impact: {formatBpsPct(priceImpactBps)}</span>
        {valueLossBps !== null && <span>Spot delta: {formatBpsPct(valueLossBps)}</span>}
      </div>

      {/* 3-zone threshold bar */}
      <div className="relative mt-2 grid grid-cols-3 gap-1 h-1.5">
        <div className={`rounded-full ${!blocked && !isWarn ? "bg-emerald-600 dark:bg-emerald-500" : "bg-emerald-600/30 dark:bg-emerald-500/30"}`} />
        <div className={`rounded-full ${isWarn ? "bg-amber-600 dark:bg-amber-500" : "bg-amber-600/30 dark:bg-amber-500/25"}`} />
        <div className={`rounded-full ${blocked ? "bg-rose-600 dark:bg-rose-500" : "bg-rose-600/30 dark:bg-rose-500/25"}`} />
        <div
          className="pointer-events-none absolute -top-0.5 left-0 h-2.5 w-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateX(${(ratio * 97).toFixed(1)}%)` }}
        >
          <span
            className={`block h-2.5 w-1.5 rounded-full shadow ${
              blocked
                ? "bg-rose-700 dark:bg-rose-500"
                : isWarn
                  ? "bg-amber-700 dark:bg-amber-500"
                  : "bg-emerald-700 dark:bg-emerald-500"
            }`}
          />
        </div>
      </div>

      {blocked && blockReason && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] font-bold text-rose-900 dark:text-rose-200 leading-snug">
          <LockIcon size={13} className="mt-0.5 shrink-0" />
          <span>{blockReason}</span>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 4. Liquidity (LP) — Reserve Ratio Bar & 5% Skew Comparator Gauge
 * ========================================================================== */

export type LiquidityTelemetryBarProps = {
  reserveUsdcRaw: bigint;
  reserveEurcRaw: bigint;
  eurcSpotOut?: bigint | null;
  reserveUsdcLabel: string;
  reserveEurcLabel: string;
  userSharePctLabel?: string;
  theme?: "dark" | "light";
  className?: string;
};

export function LiquidityTelemetryBar({
  reserveUsdcRaw,
  reserveEurcRaw,
  eurcSpotOut = null,
  reserveUsdcLabel,
  reserveEurcLabel,
  userSharePctLabel,
  theme,
  className = "",
}: LiquidityTelemetryBarProps) {
  const usdcBps = useMemo(() => {
    const eurcInUsdc =
      eurcSpotOut !== null && eurcSpotOut > ZERO
        ? (reserveEurcRaw * eurcSpotOut) / UNIT_6
        : reserveEurcRaw;
    const total = reserveUsdcRaw + eurcInUsdc;
    if (total <= ZERO) return 5000;
    return Number((reserveUsdcRaw * BPS_SCALE) / total);
  }, [reserveUsdcRaw, reserveEurcRaw, eurcSpotOut]);

  const usdcRatio = Math.min(1, Math.max(0, usdcBps / 10000));
  const eurcPct = ((10000 - usdcBps) / 100).toFixed(1);
  const usdcPct = (usdcBps / 100).toFixed(1);

  return (
    <div
      data-theme={theme}
      className={`rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-slate-100 dark:bg-black/35 p-3.5 space-y-2.5 ${className}`.trim()}
    >
      <div className="nx-num flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
        <span>Pool Reserve Balance</span>
        {userSharePctLabel !== undefined && (
          <span className="text-sky-800 dark:text-cyan-300">Your Share: {userSharePctLabel}%</span>
        )}
      </div>

      <div className="relative flex h-2.5 w-full overflow-hidden rounded-full bg-emerald-600 dark:bg-emerald-500/85">
        <div
          className="h-full w-full origin-left bg-sky-600 dark:bg-cyan-500 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `scaleX(${usdcRatio})` }}
        />
      </div>

      <div className="nx-num flex items-center justify-between gap-2 text-xs font-bold">
        <span className="flex items-center gap-1.5 text-slate-900 dark:text-slate-200">
          <span className="h-2 w-2 rounded-full bg-sky-600 dark:bg-cyan-500" />
          <span>{reserveUsdcLabel} USDC</span>
          <span className="text-slate-600 dark:text-slate-400">({usdcPct}%)</span>
        </span>
        <span className="flex items-center gap-1.5 text-slate-900 dark:text-slate-200">
          <span className="text-slate-600 dark:text-slate-400">({eurcPct}%)</span>
          <span>{reserveEurcLabel} EURC</span>
          <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-500" />
        </span>
      </div>
    </div>
  );
}

export type ReserveSkewGaugeProps = {
  poolEurcUsd: number | null;
  liveEurcUsd: number | null;
  skewBps: number | null;
  skewLimitBps?: number;
  ready?: boolean;
  theme?: "dark" | "light";
  className?: string;
};

export function ReserveSkewGauge({
  poolEurcUsd,
  liveEurcUsd,
  skewBps,
  skewLimitBps = 500,
  ready = true,
  theme,
  className = "",
}: ReserveSkewGaugeProps) {
  const poolEmpty = ready && poolEurcUsd === null;
  const quoteMissing = ready && poolEurcUsd !== null && liveEurcUsd === null;
  const isSkewed = skewBps !== null && skewBps > skewLimitBps;
  const blocked = quoteMissing || isSkewed;

  const signedNorm = useMemo(() => {
    if (poolEurcUsd === null || liveEurcUsd === null || liveEurcUsd <= 0) return 0;
    const signedBps = ((poolEurcUsd - liveEurcUsd) / liveEurcUsd) * 10000;
    const maxScale = skewLimitBps * 1.5;
    return Math.max(-0.96, Math.min(0.96, signedBps / maxScale));
  }, [poolEurcUsd, liveEurcUsd, skewLimitBps]);

  const pipX = 120 + signedNorm * 120;

  return (
    <div
      data-theme={theme}
      className={`rounded-2xl border p-3.5 ${
        !ready || poolEmpty
          ? "border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/[0.03] text-slate-800 dark:text-slate-300"
          : blocked
            ? "border-amber-500/45 bg-amber-50 dark:bg-amber-500/10 text-amber-950 dark:text-amber-100"
            : "border-emerald-600/35 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/[0.08] text-emerald-950 dark:text-emerald-100"
      } ${className}`.trim()}
    >
      <div className="nx-num flex items-center justify-between gap-2 text-[11px] font-extrabold">
        <span className="flex items-center gap-1.5 uppercase tracking-wider">
          {blocked ? <LockIcon size={13} /> : <ShieldCheckIcon size={14} />}
          <span>{blocked ? "5% Skew Guard Active" : "5% Skew Guard · Parity Safe"}</span>
        </span>
        <span>
          {!ready
            ? "Syncing..."
            : poolEmpty
              ? "Empty Pool"
              : quoteMissing
                ? "Spot Pending"
                : `${((skewBps ?? 0) / 100).toFixed(2)}% delta`}
        </span>
      </div>

      {ready && !poolEmpty && (
        <svg
          viewBox="0 0 240 28"
          className="mt-2 w-full h-7"
          role="img"
          aria-label="Pool reserve price skew comparator against live market spot"
        >
          {/* Outer blocked zones (0..40 and 200..240) */}
          <rect x="4" y="9" width="36" height="8" rx="4" fill="rgba(225, 29, 72, 0.3)" />
          <rect x="200" y="9" width="36" height="8" rx="4" fill="rgba(225, 29, 72, 0.3)" />
          {/* Safe ±5% parity zone (40..200) */}
          <rect x="40" y="9" width="160" height="8" rx="2" fill="rgba(5, 150, 105, 0.28)" />
          {/* Threshold ticks (-5%, 0%, +5%) */}
          <line x1="40" y1="6" x2="40" y2="20" stroke="#d97706" strokeWidth="1.6" />
          <line x1="120" y1="5" x2="120" y2="21" stroke="currentColor" strokeOpacity="0.65" strokeWidth="1.6" />
          <line x1="200" y1="6" x2="200" y2="20" stroke="#d97706" strokeWidth="1.6" />

          {!quoteMissing && (
            <g
              style={{
                transform: `translateX(${(pipX - 120).toFixed(1)}px)`,
                transition: "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <circle
                cx="120"
                cy="13"
                r="5.5"
                fill={blocked ? "#d97706" : "#059669"}
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>
      )}

      <p className="nx-num mt-1.5 text-[11px] font-semibold leading-relaxed">
        {!ready
          ? "Reading on-chain USDC/EURC reserves and live market spot."
          : poolEurcUsd === null
            ? "Pool has zero reserves. Initial deposit must sit within 5.00% of live market spot; withdrawals remain available."
            : liveEurcUsd === null
              ? `Pool prices 1 EURC at ${poolEurcUsd.toFixed(4)} USDC. Live market spot is unavailable, so new deposits are paused while withdrawals stay open.`
              : blocked
                ? `Pool (${poolEurcUsd.toFixed(4)}) diverges ${((skewBps ?? 0) / 100).toFixed(2)}% from live market spot (${liveEurcUsd.toFixed(4)}). Deposits lock above 5.00%; withdrawals stay open.`
                : `Pool (${poolEurcUsd.toFixed(4)} USDC) tracks within 5.00% of live market spot (${liveEurcUsd.toFixed(4)} USDC).`}
      </p>
    </div>
  );
}

/* ============================================================================
 * 5. Portfolio & Vaults — VaultPositionMeter & Exact BigInt Allocation Bar
 * ========================================================================== */

export type VaultPositionMeterProps = {
  asset: "USDC" | "EURC";
  stakedRaw: bigint;
  walletSpendableRaw: bigint;
  stakedLabel: string;
  walletLabel: string;
  pendingYieldLabel?: string;
  theme?: "dark" | "light";
  className?: string;
};

export function VaultPositionMeter({
  asset,
  stakedRaw,
  walletSpendableRaw,
  stakedLabel,
  walletLabel,
  pendingYieldLabel,
  theme,
  className = "",
}: VaultPositionMeterProps) {
  const stakedRatio = useMemo(() => {
    const total = stakedRaw + walletSpendableRaw;
    if (total <= ZERO) return 0;
    return Number((stakedRaw * BPS_SCALE) / total) / 10000;
  }, [stakedRaw, walletSpendableRaw]);

  const accentBar = asset === "USDC" ? "bg-sky-600 dark:bg-cyan-500" : "bg-emerald-600 dark:bg-emerald-500";

  return (
    <div
      data-theme={theme}
      className={`rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-slate-100 dark:bg-black/25 p-3.5 space-y-2 ${className}`.trim()}
    >
      <div className="nx-num flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-300">
        <span>
          Staked Ratio:{" "}
          <strong className="text-slate-900 dark:text-white">{(stakedRatio * 100).toFixed(1)}%</strong>
        </span>
        {pendingYieldLabel !== undefined && (
          <span className="text-emerald-800 dark:text-emerald-300">
            Claimable NLP: <strong>{pendingYieldLabel}</strong>
          </span>
        )}
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-300 dark:bg-white/[0.08]">
        <div
          className={`h-full w-full origin-left rounded-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${accentBar}`}
          style={{ transform: `scaleX(${stakedRatio})` }}
        />
      </div>

      <div className="nx-num flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        <span>Vault: {stakedLabel} {asset}</span>
        <span>Spendable: {walletLabel} {asset}</span>
      </div>
    </div>
  );
}

export type PortfolioAllocationBarProps = {
  usdcTotal6: bigint;
  eurcTotal6: bigint;
  lpUsdc6?: bigint;
  lpEurc6?: bigint;
  eurcSpotOut: bigint | null;
  theme?: "dark" | "light";
  className?: string;
};

export function PortfolioAllocationBar({
  usdcTotal6,
  eurcTotal6,
  lpUsdc6 = ZERO,
  lpEurc6 = ZERO,
  eurcSpotOut,
  theme,
  className = "",
}: PortfolioAllocationBarProps) {
  const { usdcBps, eurcBps, lpBps, awaitingRate } = useMemo(() => {
    const hasEurc = eurcTotal6 > ZERO || lpEurc6 > ZERO;
    if (hasEurc && (eurcSpotOut === null || eurcSpotOut <= ZERO)) {
      return { usdcBps: 0, eurcBps: 0, lpBps: 0, awaitingRate: true };
    }
    const spot = eurcSpotOut ?? ZERO;
    const usdcUsd = usdcTotal6;
    const eurcUsd = (eurcTotal6 * spot) / UNIT_6;
    const lpUsd = lpUsdc6 + (lpEurc6 * spot) / UNIT_6;
    const total = usdcUsd + eurcUsd + lpUsd;
    if (total <= ZERO) {
      return { usdcBps: 0, eurcBps: 0, lpBps: 0, awaitingRate: false };
    }
    const u = Number((usdcUsd * BPS_SCALE) / total);
    const e = Number((eurcUsd * BPS_SCALE) / total);
    const l = Math.max(0, 10000 - u - e);
    return { usdcBps: u, eurcBps: e, lpBps: lpUsd > ZERO ? l : 0, awaitingRate: false };
  }, [usdcTotal6, eurcTotal6, lpUsdc6, lpEurc6, eurcSpotOut]);

  return (
    <div data-theme={theme} className={`w-full space-y-4 ${className}`.trim()}>
      <div className="flex h-4 w-full overflow-hidden rounded-full border border-slate-300 dark:border-white/[0.08] bg-slate-200 dark:bg-black/50 p-0.5 gap-0.5">
        {awaitingRate ? (
          <div className="nx-shimmer h-full w-full rounded-full" />
        ) : (
          <>
            {usdcBps > 0 && (
              <div
                className="h-full rounded-full bg-sky-600 dark:bg-cyan-500 transition-[flex-grow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ flexGrow: usdcBps }}
              />
            )}
            {eurcBps > 0 && (
              <div
                className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500 transition-[flex-grow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ flexGrow: eurcBps }}
              />
            )}
            {lpBps > 0 && (
              <div
                className="h-full rounded-full bg-indigo-600 dark:bg-sky-400 transition-[flex-grow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ flexGrow: lpBps }}
              />
            )}
          </>
        )}
      </div>

      <div className="nx-num flex flex-wrap items-center justify-between gap-3 text-xs font-extrabold">
        <span className="inline-flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-600 dark:bg-cyan-500" />
          <span>USDC</span>
          <span className="text-slate-600 dark:text-slate-400">
            ({awaitingRate ? "…" : `${(usdcBps / 100).toFixed(1)}%`})
          </span>
        </span>
        <span className="inline-flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 dark:bg-emerald-500" />
          <span>EURC</span>
          <span className="text-slate-600 dark:text-slate-400">
            ({awaitingRate ? "…" : `${(eurcBps / 100).toFixed(1)}%`})
          </span>
        </span>
        {(lpUsdc6 > ZERO || lpEurc6 > ZERO) && (
          <span className="inline-flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 dark:bg-sky-400" />
            <span>LP Pool</span>
            <span className="text-slate-600 dark:text-slate-400">
              ({awaitingRate ? "…" : `${(lpBps / 100).toFixed(1)}%`})
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * 6. Daily GM — Strictly 3 Consecutive Unlockable Tiers + 24h/48h Clock Gauge
 * ========================================================================== */

const GM_THREE_TIER_SEGMENTS = [
  { tier: 1, label: "30D · Tier 1", minStreak: 30, nextStreak: 90, feeLabel: "10 bps", batchLabel: "20 batch" },
  { tier: 2, label: "90D · Tier 2", minStreak: 90, nextStreak: 180, feeLabel: "5 bps", batchLabel: "50 batch" },
  { tier: 3, label: "180D · VIP", minStreak: 180, nextStreak: 180, feeLabel: "0 bps", batchLabel: "∞ batch" },
] as const;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export type DailyGmGaugeProps = {
  streak: number;
  hasCheckedInToday: boolean;
  cooldownRemainingSec?: number;
  streakExpiresInSec?: number | null;
  timeLeftLabel?: string;
  tierName?: string;
  theme?: "dark" | "light";
  className?: string;
};

export function DailyGmGauge({
  streak,
  hasCheckedInToday,
  cooldownRemainingSec = 0,
  streakExpiresInSec = null,
  timeLeftLabel,
  tierName,
  theme,
  className = "",
}: DailyGmGaugeProps) {
  const safeStreak = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
  const innerR = 50;
  const innerC = 2 * Math.PI * innerR;
  const cooldownProgress = hasCheckedInToday
    ? Math.min(1, Math.max(0, 1 - cooldownRemainingSec / 86400))
    : 1;

  const activeTierLabel =
    safeStreak >= 180
      ? "TIER 3 · VIP"
      : safeStreak >= 90
        ? "TIER 2 · 90D"
        : safeStreak >= 30
          ? "TIER 1 · 30D"
          : tierName && !tierName.toLowerCase().includes("tier 0")
            ? tierName.toUpperCase()
            : "UNRANKED";

  const progressCaption =
    safeStreak < 30
      ? `${safeStreak}/30D to Tier 1 · Unranked · Building Streak`
      : safeStreak < 90
        ? `${safeStreak}/90D to Tier 2 · Tier 1 Active (10 bps · 20 batch)`
        : safeStreak < 180
          ? `${safeStreak}/180D to Tier 3 VIP · Tier 2 Active (5 bps · 50 batch)`
          : "Tier 3 Highest VIP Unlocked · 0 bps Fee Waiver · Unlimited Batch";

  const showResetUrgency =
    safeStreak > 0 &&
    !hasCheckedInToday &&
    streakExpiresInSec !== null &&
    streakExpiresInSec > 0 &&
    streakExpiresInSec <= 43200; // <= 12h left before 48h consecutive reset

  return (
    <div data-theme={theme} className={`flex flex-col items-center ${className}`.trim()}>
      <svg
        width={176}
        height={176}
        viewBox="0 0 160 160"
        role="img"
        aria-label={`${safeStreak} consecutive day GM streak, ${activeTierLabel}`}
        className="overflow-visible"
      >
        <defs>
          <linearGradient id="nx-gm-tier-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0284c7" />
            <stop offset="55%" stopColor="#059669" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>

        {/* Strictly 3 Consecutive Unlockable Tier Segments (120deg each, 8deg separation gap) */}
        {GM_THREE_TIER_SEGMENTS.map((seg, idx) => {
          const a0 = idx * 120 + 4;
          const a1 = (idx + 1) * 120 - 4;
          const path = describeArc(80, 80, 66, a0, a1);

          let fillFraction = 0;
          let isUnlocked = false;
          if (seg.tier === 1) {
            if (safeStreak >= 30) {
              fillFraction = 1;
              isUnlocked = true;
            } else if (safeStreak > 0) {
              fillFraction = safeStreak / 30;
            }
          } else if (seg.tier === 2) {
            if (safeStreak >= 90) {
              fillFraction = 1;
              isUnlocked = true;
            } else if (safeStreak > 30) {
              fillFraction = (safeStreak - 30) / 60;
            }
          } else {
            if (safeStreak >= 180) {
              fillFraction = 1;
              isUnlocked = true;
            } else if (safeStreak > 90) {
              fillFraction = (safeStreak - 90) / 90;
            }
          }

          return (
            <g key={seg.tier}>
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.28"
                strokeWidth="7.5"
                strokeLinecap="round"
                className="text-slate-400 dark:text-slate-600"
              />
              {fillFraction > 0 && (
                <path
                  d={path}
                  fill="none"
                  stroke={isUnlocked ? "url(#nx-gm-tier-grad)" : "#0284c7"}
                  strokeWidth="7.5"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={100}
                  strokeDashoffset={100 - Math.min(100, fillFraction * 100)}
                  style={{ transition: "stroke-dashoffset 650ms cubic-bezier(0.22, 1, 0.36, 1)" }}
                />
              )}
            </g>
          );
        })}

        {/* Inner Concentric 24h Cooldown Ring */}
        <circle
          cx="80"
          cy="80"
          r={innerR}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.24"
          strokeWidth="3.5"
          className="text-slate-400 dark:text-slate-600"
        />
        <circle
          cx="80"
          cy="80"
          r={innerR}
          fill="none"
          stroke={hasCheckedInToday ? "#059669" : "#0284c7"}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={innerC}
          strokeDashoffset={innerC * (1 - cooldownProgress)}
          transform="rotate(-90 80 80)"
          style={{ transition: "stroke-dashoffset 450ms linear" }}
        />

        {/* Center Readout */}
        <text
          x="80"
          y="72"
          textAnchor="middle"
          fill="currentColor"
          fontSize="32"
          fontWeight="900"
          className="nx-num text-slate-900 dark:text-white"
        >
          {safeStreak}
        </text>
        <text
          x="80"
          y="90"
          textAnchor="middle"
          fill="currentColor"
          fontSize="8.8"
          fontWeight="800"
          letterSpacing="1.2"
          className="text-sky-800 dark:text-cyan-300"
        >
          {activeTierLabel}
        </text>
        <text
          x="80"
          y="105"
          textAnchor="middle"
          fill="currentColor"
          fontSize="8.5"
          fontWeight="700"
          className="nx-num text-slate-600 dark:text-slate-400"
        >
          {hasCheckedInToday && timeLeftLabel
            ? timeLeftLabel
            : safeStreak < 30
              ? `${safeStreak}/30D`
              : "READY"}
        </text>
      </svg>

      {/* Progress & 3-Tier Segment Legend */}
      <div className="nx-num mt-2 text-xs font-extrabold text-slate-700 dark:text-slate-300">
        {progressCaption}
      </div>

      <div className="nx-num mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
        {GM_THREE_TIER_SEGMENTS.map((seg) => {
          const unlocked = safeStreak >= seg.minStreak;
          return (
            <span
              key={seg.tier}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                unlocked
                  ? "border-emerald-600/40 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-300"
                  : "border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-400"
              }`}
            >
              <span>{seg.label}</span>
              <span className="opacity-75">· {seg.feeLabel}</span>
            </span>
          );
        })}
      </div>

      {showResetUrgency && streakExpiresInSec !== null && (
        <div className="nx-num mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-amber-500/45 bg-amber-100 dark:bg-amber-500/12 px-3 py-1.5 text-[11px] font-extrabold text-amber-950 dark:text-amber-200">
          <AlertTriangleIcon size={13} />
          <span>48h window closes in {formatDurationHm(streakExpiresInSec)} — check in now to keep {safeStreak}D streak</span>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * 7. Nexio Domains & Pass — OnChainSeal & 3D Pointer-Tracked HoloPassCard
 * ========================================================================== */

export function OnChainSeal({
  status = "verified",
  size = 56,
  className = "",
}: {
  status?: "querying" | "verified" | "unverified";
  size?: number;
  className?: string;
}) {
  const tone =
    status === "verified"
      ? "text-emerald-700 dark:text-emerald-400"
      : status === "querying"
        ? "text-sky-700 dark:text-cyan-400"
        : "text-slate-600 dark:text-slate-400";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={`${tone} ${className}`.trim()}
    >
      <circle
        cx="32"
        cy="32"
        r="27"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        className={status === "querying" ? "animate-spin origin-center" : ""}
        style={status === "querying" ? { animationDuration: "8s" } : undefined}
      />
      <circle
        cx="32"
        cy="32"
        r="21"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      {status === "verified" ? (
        <path
          d="M23.5 32.5 29.2 38.2 41 26.2"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="nx-check-path"
        />
      ) : status === "querying" ? (
        <circle cx="32" cy="32" r="5" fill="currentColor" className="nx-pulse" />
      ) : (
        <path
          d="M26 30v-3a6 6 0 0 1 12 0v3M24 30h16v11a2 2 0 0 1-2 2H26a2 2 0 0 1-2-2V30Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export type HoloPassCardProps = {
  domain: string;
  wallet: string;
  streak: number;
  tierName?: string;
  chainId?: number;
  networkLabel?: string;
  contractAddress?: string;
  className?: string;
};

export function HoloPassCard({
  domain,
  wallet,
  streak,
  tierName,
  chainId = 5042,
  networkLabel = "ARC MAINNET",
  contractAddress,
  className = "",
}: HoloPassCardProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [pointerActive, setPointerActive] = useState(false);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotionNow()) return;
    const el = cardRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = Math.max(-0.5, Math.min(0.5, x / rect.width - 0.5));
    const py = Math.max(-0.5, Math.min(0.5, y / rect.height - 0.5));

    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(() => {
      el.style.setProperty("--rx", `${(-py * 10).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(px * 12).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${((x / rect.width) * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${((y / rect.height) * 100).toFixed(1)}%`);
    });
  }, []);

  const handlePointerLeave = useCallback(() => {
    setPointerActive(false);
    const el = cardRef.current;
    if (!el) return;
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }, []);

  const normalizedDomain = domain.trim().toLowerCase().endsWith(".nex")
    ? domain.trim().toLowerCase()
    : `${domain.trim().toLowerCase()}.nex`;

  const safeStreak = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;

  return (
    <div className={`w-full max-w-[460px] [perspective:1100px] ${className}`.trim()}>
      <div
        ref={cardRef}
        id="nexio-pass-card"
        onPointerEnter={() => setPointerActive(true)}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{
          transform: "rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateZ(0)",
          transition: pointerActive
            ? "transform 130ms ease-out"
            : "transform 480ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
        className="nx-pass-tilt relative aspect-[1.58/1] w-full overflow-hidden rounded-2xl sm:rounded-[1.75rem] border border-slate-900/20 dark:border-white/20 bg-gradient-to-br from-[#050B16] via-[#0A1933] to-[#062538] p-5 sm:p-7 text-white shadow-[0_24px_60px_-15px_rgba(15,23,42,0.45),inset_0_1px_0_0_rgba(255,255,255,0.16)] dark:shadow-[0_24px_60px_-15px_rgba(2,6,23,0.75),inset_0_1px_0_0_rgba(255,255,255,0.16)] flex flex-col justify-between select-none"
      >
        {/* Iridescent Security Foil */}
        <div className="nx-holo-foil" data-active={pointerActive ? "true" : "false"} />

        {/* Subtle Top-Right Ambient Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-cyan-500/20 blur-2xl"
        />

        {/* Top Header */}
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-cyan-400/35 bg-[#040913] p-1 shadow-[0_0_16px_rgba(6,182,212,0.28)]">
              {!logoError ? (
                <Image
                  src={nexioLogo}
                  alt="Nexio"
                  width={32}
                  height={32}
                  sizes="32px"
                  onError={() => setLogoError(true)}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  className="rounded-lg"
                />
              ) : (
                <NexioMarkIcon size={26} />
              )}
            </div>
            <span className="text-sm sm:text-lg font-black uppercase tracking-[0.16em] text-white">
              NEXIO PASS
            </span>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
            <ShieldCheckIcon size={13} className="text-emerald-400" />
            <span>ANS Verified</span>
          </div>
        </div>

        {/* Center Identity */}
        <div className="relative z-10 my-auto py-2 text-left">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-cyan-200/80">
            On-Chain Web3 Identity
          </div>
          <div className="mt-0.5 truncate text-2xl sm:text-3xl font-black tracking-tight text-white drop-shadow-sm">
            {normalizedDomain}
          </div>
          <div className="mt-2 inline-flex items-center rounded-lg border border-white/15 bg-black/45 px-2.5 py-1 font-mono text-xs font-bold text-slate-200">
            {wallet.length >= 12 ? `${wallet.slice(0, 8)}...${wallet.slice(-6)}` : wallet}
          </div>
        </div>

        {/* Bottom Telemetry Row — Strictly ARC MAINNET · 5042 */}
        <div className="relative z-10 flex items-end justify-between gap-4 border-t border-white/12 pt-3 text-left">
          <div className="flex items-center gap-5 sm:gap-7">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                Network
              </div>
              <div className="nx-num mt-0.5 text-xs sm:text-sm font-black text-cyan-300">
                {networkLabel.toUpperCase()} · {chainId}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                Daily GM Streak
              </div>
              <div className="nx-num mt-0.5 text-xs sm:text-sm font-black text-amber-300">
                {safeStreak} DAYS{tierName ? ` · ${tierName.toUpperCase()}` : ""}
              </div>
            </div>
          </div>

          {contractAddress && contractAddress.length >= 10 && (
            <div className="hidden sm:block text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300">
                ANS Registry
              </div>
              <div className="mt-0.5 font-mono text-xs font-bold text-slate-200">
                {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
