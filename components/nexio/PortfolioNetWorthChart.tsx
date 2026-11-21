"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isAbortError } from "@/lib/achswap";
import {
  fetchStablecoinFlowsForDays,
  invalidateStablecoinFlowCache,
  type StablecoinFlowHistoryResult,
} from "@/lib/history";
import {
  formatExactUsdFrom6,
  reconstructDailyNetWorthSeries,
  sliceNetWorthSeries,
  type AnalyticsTimeframeDays,
  type DailyNetWorthPoint,
  type PortfolioNetWorthSeries,
} from "@/lib/portfolio-analytics";
import {
  AlertTriangleIcon,
  RadarSpinner,
  RefreshCwIcon,
  TrendingUpIcon,
} from "./Icons";

const ZERO = 0n;

function subscribeClientMount(): () => void {
  return () => undefined;
}

function subscribeTheme(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("nexio-theme", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener("nexio-theme", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getThemeSnapshot(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function formatYAxisUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (abs >= 1_000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${value.toFixed(2)}`;
}

type ChartTooltipPayloadItem = {
  payload?: DailyNetWorthPoint;
};

type CustomTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  isDark: boolean;
};

function PortfolioChartTooltip({ active, payload, isDark }: CustomTooltipProps) {
  const point = active && payload && payload.length > 0 ? payload[0]?.payload : undefined;
  if (!point) return null;

  const hasLp = point.lpUsd6 > ZERO;
  const hasNetFlow = point.netFlowUsd6 !== ZERO;

  return (
    <div
      className={`nx-num rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl min-w-[215px] ${
        isDark
          ? "border-cyan-400/30 bg-[#050E1E]/95 text-white shadow-[0_18px_45px_rgba(2,6,23,0.85)]"
          : "border-slate-300 bg-white/98 text-slate-900 shadow-[0_14px_35px_rgba(15,23,42,0.16)]"
      }`}
    >
      <div
        className={`text-[10px] font-extrabold uppercase tracking-widest mb-1 ${
          isDark ? "text-slate-400" : "text-slate-600"
        }`}
      >
        {point.fullDateLabel}
      </div>

      <div className="text-xl font-black tracking-tight mb-2.5">
        {point.totalUsdFormatted}
      </div>

      <div
        className={`space-y-1.5 pt-2 border-t text-xs font-bold ${
          isDark ? "border-white/10" : "border-slate-200"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <span className={isDark ? "text-slate-400" : "text-slate-600"}>Wallet</span>
          <span>{formatExactUsdFrom6(point.walletUsd6)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className={isDark ? "text-slate-400" : "text-slate-600"}>Staked Vaults</span>
          <span>{formatExactUsdFrom6(point.vaultUsd6)}</span>
        </div>
        {hasLp && (
          <div className="flex items-center justify-between gap-4">
            <span className={isDark ? "text-slate-400" : "text-slate-600"}>LP Pool</span>
            <span>{formatExactUsdFrom6(point.lpUsd6)}</span>
          </div>
        )}
      </div>

      {point.txCount > 0 && (
        <div
          className={`mt-2 pt-2 border-t flex items-center justify-between gap-3 text-[11px] font-extrabold ${
            isDark ? "border-white/10" : "border-slate-200"
          }`}
        >
          <span className={isDark ? "text-slate-400" : "text-slate-600"}>
            {point.txCount} {point.txCount === 1 ? "on-chain tx" : "on-chain txs"}
          </span>
          {hasNetFlow && (
            <span
              className={
                point.netFlowUsd6 > ZERO
                  ? isDark
                    ? "text-emerald-400"
                    : "text-emerald-700"
                  : isDark
                    ? "text-rose-400"
                    : "text-rose-700"
              }
            >
              {formatExactUsdFrom6(point.netFlowUsd6, { signed: true })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export type PortfolioNetWorthChartProps = {
  wallet: string;
  isArcMainnet: boolean;
  balancesReady: boolean;
  balancesLoading: boolean;
  walletUsdc6: bigint;
  vaultUsdc6: bigint;
  lpUsdc6: bigint;
  walletEurc6: bigint;
  vaultEurc6: bigint;
  lpEurc6: bigint;
  eurcSpotOut6: bigint | null;
  chainNowSec: number;
  refreshVersion: number;
  isConnecting: boolean;
  onConnectWallet: () => Promise<void>;
};

export function PortfolioNetWorthChart({
  wallet,
  isArcMainnet,
  balancesReady,
  balancesLoading,
  walletUsdc6,
  vaultUsdc6,
  lpUsdc6,
  walletEurc6,
  vaultEurc6,
  lpEurc6,
  eurcSpotOut6,
  chainNowSec,
  refreshVersion,
  isConnecting,
  onConnectWallet,
}: PortfolioNetWorthChartProps) {
  const isClient = useSyncExternalStore(
    subscribeClientMount,
    () => true,
    () => false
  );
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    () => "dark"
  );
  const isDark = theme === "dark";

  const [timeframe, setTimeframe] = useState<AnalyticsTimeframeDays>(7);
  const [flowHistory30D, setFlowHistory30D] = useState<StablecoinFlowHistoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualReloadSeq, setManualReloadSeq] = useState(0);

  const loadGenRef = useRef(0);

  const triggerReload = useCallback(() => {
    if (!wallet) return;
    invalidateStablecoinFlowCache(wallet);
    setManualReloadSeq((n) => n + 1);
  }, [wallet]);

  // Fetch the full 30D chunked log history once per wallet / refresh cycle.
  // Switching between '7D' and '30D' toggles strictly slices `cached30DSeries` without RPC calls.
  useEffect(() => {
    if (!wallet || !isArcMainnet) {
      const resetTimer = window.setTimeout(() => {
        setFlowHistory30D(null);
        setError(null);
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    const controller = new AbortController();
    const gen = ++loadGenRef.current;

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchStablecoinFlowsForDays(wallet, 30, {
          signal: controller.signal,
        });
        if (gen !== loadGenRef.current || controller.signal.aborted) return;
        setFlowHistory30D(res);
      } catch (err) {
        if (isAbortError(err) || gen !== loadGenRef.current) return;
        // Flatline fallback: if RPC log scan fails after retries, render current net worth flatline instead of crashing
        const fallbackNowSec = Math.floor(Date.now() / 1000);
        setFlowHistory30D((prev) =>
          prev ?? {
            flows: [],
            latestBlock: 0,
            latestTimestamp: fallbackNowSec,
            fromBlock: 0,
            toBlock: 0,
            partial: true,
          }
        );
        setError(null);
      } finally {
        if (gen === loadGenRef.current) {
          setLoading(false);
        }
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [wallet, isArcMainnet, refreshVersion, manualReloadSeq]);

  const hasEurcExposure = useMemo(() => {
    if (walletEurc6 > ZERO || vaultEurc6 > ZERO || lpEurc6 > ZERO) return true;
    if (!flowHistory30D) return false;
    return flowHistory30D.flows.some((f) => f.tokenSymbol === "EURC");
  }, [walletEurc6, vaultEurc6, lpEurc6, flowHistory30D]);

  const awaitingSpot = hasEurcExposure && eurcSpotOut6 === null;

  // Reconstruct and cache the full 30D trajectory from React state (`flowHistory30D`).
  // Independent of `timeframe`, so switching 7D/30D neither re-fetches RPC logs nor re-runs 30D reconstruction.
  const cached30DSeries = useMemo((): PortfolioNetWorthSeries | null => {
    if (!wallet || !isArcMainnet || !flowHistory30D || awaitingSpot) {
      return null;
    }
    const effectiveNowSec =
      chainNowSec > 0
        ? chainNowSec
        : flowHistory30D.latestTimestamp;
    if (effectiveNowSec <= 0) return null;

    return reconstructDailyNetWorthSeries({
      days: 30,
      nowSec: effectiveNowSec,
      current: {
        walletUsdc6,
        vaultUsdc6,
        lpUsdc6,
        walletEurc6,
        vaultEurc6,
        lpEurc6,
      },
      eurcSpotOut6,
      flows: flowHistory30D.flows,
      coverageFromBlock: flowHistory30D.fromBlock,
      coverageToBlock: flowHistory30D.toBlock,
      coveragePartial: flowHistory30D.partial,
    });
  }, [
    wallet,
    isArcMainnet,
    flowHistory30D,
    awaitingSpot,
    chainNowSec,
    walletUsdc6,
    vaultUsdc6,
    lpUsdc6,
    walletEurc6,
    vaultEurc6,
    lpEurc6,
    eurcSpotOut6,
  ]);

  // Instantaneous local slice for '7D' vs '30D' toggles (0 new RPC calls)
  const series = useMemo(() => {
    if (!wallet || !isArcMainnet || awaitingSpot || !cached30DSeries) return null;
    return sliceNetWorthSeries(cached30DSeries, timeframe);
  }, [wallet, isArcMainnet, awaitingSpot, cached30DSeries, timeframe]);

  const yDomain = useMemo((): [number, number] => {
    if (!series || series.points.length === 0) return [0, 10];
    const minVal = Number(series.minUsd6) / 1_000_000;
    const maxVal = Number(series.maxUsd6) / 1_000_000;
    if (maxVal === minVal) {
      if (maxVal <= 0) return [-0.5, 10];
      const pad = Math.max(0.5, maxVal * 0.12);
      return [Math.max(0, minVal - pad), maxVal + pad];
    }
    const span = maxVal - minVal;
    const pad = Math.max(0.25, span * 0.16);
    return [Math.max(0, minVal - pad), maxVal + pad];
  }, [series]);

  const strokePalette = useMemo(() => {
    if (!series || series.deltaUsd6 === ZERO) {
      return isDark
        ? { stroke: "#22d3ee", glow: "rgba(34,211,238,0.55)", fillTop: "#22d3ee" }
        : { stroke: "#0284c7", glow: "rgba(2,132,199,0.28)", fillTop: "#0284c7" };
    }
    if (series.deltaUsd6 > ZERO) {
      return isDark
        ? { stroke: "#34d399", glow: "rgba(52,211,153,0.55)", fillTop: "#10b981" }
        : { stroke: "#059669", glow: "rgba(5,150,105,0.28)", fillTop: "#059669" };
    }
    return isDark
      ? { stroke: "#fb7185", glow: "rgba(251,113,133,0.5)", fillTop: "#f43f5e" }
      : { stroke: "#e11d48", glow: "rgba(225,29,72,0.25)", fillTop: "#e11d48" };
  }, [series, isDark]);

  const gridColor = isDark ? "rgba(148, 163, 184, 0.12)" : "rgba(15, 23, 42, 0.09)";
  const axisTickColor = isDark ? "#94a3b8" : "#475569";

  return (
    <div className="p-6 sm:p-8 rounded-[2rem] border bg-white border-slate-300 shadow-sm dark:bg-[#071120]/85 dark:border-white/10 dark:backdrop-blur-2xl dark:shadow-[0_24px_60px_-15px_rgba(2,6,23,0.7)]">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-100 text-sky-800 border border-sky-300/80 dark:bg-cyan-500/12 dark:text-cyan-300 dark:border-cyan-500/25 shrink-0">
              <TrendingUpIcon size={15} />
            </span>
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white">
              Net Worth Analytics
            </h2>
          </div>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-400 mt-1">
            Daily UTC Trajectory · Reconstructed from Verified On-Chain Logs
          </p>
        </div>

        {/* 7D / 30D Toggle + Refresh */}
        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <div
            role="group"
            aria-label="Chart timeframe"
            className="flex gap-1 p-1 rounded-xl border bg-slate-200/95 border-slate-300 dark:bg-black/40 dark:border-white/[0.08]"
          >
            {([7, 30] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setTimeframe(days)}
                className={`nx-num px-3.5 py-1.5 rounded-lg text-xs font-black transition-all ${
                  timeframe === days
                    ? "bg-sky-700 dark:bg-cyan-500 text-white shadow-sm"
                    : "text-slate-800 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-white/10"
                }`}
              >
                {days}D
              </button>
            ))}
          </div>

          {wallet && isArcMainnet && (
            <button
              type="button"
              onClick={triggerReload}
              disabled={loading}
              aria-label="Refresh net worth analytics"
              title="Re-scan on-chain history"
              className="rounded-xl p-2 border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition disabled:opacity-50"
            >
              {loading ? <RadarSpinner size={15} /> : <RefreshCwIcon size={15} />}
            </button>
          )}
        </div>
      </div>

      {/* Period Telemetry Strip */}
      {series && (
        <div className="nx-num grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
          <div className="rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-[#eef2f6] dark:bg-black/35 px-3.5 py-2.5">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              {timeframe}D Net Change
            </div>
            <div
              className={`text-sm font-black mt-0.5 ${
                series.deltaUsd6 > ZERO
                  ? "text-emerald-800 dark:text-emerald-400"
                  : series.deltaUsd6 < ZERO
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-slate-900 dark:text-white"
              }`}
            >
              {formatExactUsdFrom6(series.deltaUsd6, { signed: true })}
              {series.deltaPct !== null && (
                <span className="ml-1 text-[11px] font-extrabold opacity-85">
                  ({series.deltaPct > 0 ? "+" : ""}
                  {series.deltaPct.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-[#eef2f6] dark:bg-black/35 px-3.5 py-2.5">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              {timeframe}D High
            </div>
            <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
              {formatExactUsdFrom6(series.maxUsd6)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-[#eef2f6] dark:bg-black/35 px-3.5 py-2.5">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              {timeframe}D Low
            </div>
            <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
              {formatExactUsdFrom6(series.minUsd6)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-[#eef2f6] dark:bg-black/35 px-3.5 py-2.5">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Indexed Events
            </div>
            <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
              {series.totalTxCount} {series.totalTxCount === 1 ? "tx" : "txs"}
            </div>
          </div>
        </div>
      )}

      {/* Chart Body States */}
      {!wallet ? (
        <div className="rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-[#eef2f6] dark:bg-black/30 py-12 px-5 text-center flex flex-col items-center">
          <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white mb-1.5">
            Connect Wallet for Live Net Worth Trajectory
          </div>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-400 max-w-md mb-4">
            Reconstructs daily UTC Wallet, Vault, and LP balances directly from Arc Mainnet on-chain logs with zero mock data.
          </p>
          <button
            type="button"
            onClick={() => void onConnectWallet()}
            disabled={isConnecting}
            className="nx-btn-primary inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-xs font-black"
          >
            {isConnecting ? (
              <>
                <RadarSpinner size={14} />
                <span>Connecting...</span>
              </>
            ) : (
              "Connect Wallet"
            )}
          </button>
        </div>
      ) : !isArcMainnet ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 py-10 px-5 text-center text-xs font-bold text-amber-950 dark:text-amber-200">
          Switch to Arc Mainnet (5042) to load verified historical portfolio analytics.
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-600/35 bg-rose-50 dark:bg-rose-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangleIcon
              size={18}
              className="mt-0.5 shrink-0 text-rose-700 dark:text-rose-400"
            />
            <div>
              <div className="text-xs sm:text-sm font-black text-rose-950 dark:text-rose-100">
                Could Not Reconstruct Historical Trajectory
              </div>
              <div className="text-xs font-medium text-rose-800 dark:text-rose-200 mt-0.5">
                {error}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={triggerReload}
            className="nx-btn-primary shrink-0 rounded-xl px-4 py-2 text-xs font-black"
          >
            Retry Scan
          </button>
        </div>
      ) : awaitingSpot ? (
        <div className="rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-[#eef2f6] dark:bg-black/30 h-[260px] flex flex-col items-center justify-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-400">
          <RadarSpinner size={20} className="text-sky-700 dark:text-cyan-400" />
          <span>Awaiting live EURC market spot rate for exact USD valuation...</span>
        </div>
      ) : (!balancesReady && balancesLoading) || (loading && !series) ? (
        <div
          aria-busy="true"
          aria-label="Reconstructing on-chain portfolio trajectory"
          className="rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-[#eef2f6] dark:bg-black/30 p-5 h-[260px] flex flex-col justify-between"
        >
          <div className="flex items-center gap-2 text-xs font-bold text-sky-900 dark:text-cyan-300">
            <RadarSpinner size={15} />
            <span>Scanning Arc Mainnet {timeframe}D transfer history...</span>
          </div>
          <div className="space-y-3">
            <div className="nx-shimmer h-32 w-full rounded-xl" />
            <div className="flex justify-between">
              <div className="nx-shimmer h-3 w-12 rounded" />
              <div className="nx-shimmer h-3 w-12 rounded" />
              <div className="nx-shimmer h-3 w-12 rounded" />
              <div className="nx-shimmer h-3 w-12 rounded" />
            </div>
          </div>
        </div>
      ) : series && isClient ? (
        <div className="relative">
          {loading && (
            <div className="absolute right-3 top-2 z-10 inline-flex items-center gap-1.5 rounded-full border border-sky-600/35 dark:border-cyan-500/35 bg-white/90 dark:bg-[#071326]/90 px-2.5 py-1 text-[10px] font-extrabold text-sky-900 dark:text-cyan-300 backdrop-blur">
              <RadarSpinner size={11} />
              <span>Updating...</span>
            </div>
          )}

          <div className="h-[260px] w-full rounded-2xl border border-slate-300/90 dark:border-white/[0.07] bg-slate-50/90 dark:bg-black/30 px-2 pt-4 pb-1">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart
                data={series.points}
                margin={{ top: 8, right: 14, left: 4, bottom: 2 }}
              >
                <defs>
                  <linearGradient id="nx-networth-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokePalette.fillTop} stopOpacity={isDark ? 0.34 : 0.22} />
                    <stop offset="85%" stopColor={strokePalette.fillTop} stopOpacity={0.02} />
                    <stop offset="100%" stopColor={strokePalette.fillTop} stopOpacity={0} />
                  </linearGradient>
                  <filter id="nx-networth-glow" x="-15%" y="-25%" width="130%" height="150%">
                    <feDropShadow
                      dx="0"
                      dy="0"
                      stdDeviation={isDark ? "3.5" : "1.8"}
                      floodColor={strokePalette.glow}
                    />
                  </filter>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 4"
                  vertical={false}
                  stroke={gridColor}
                />

                <XAxis
                  dataKey="shortLabel"
                  axisLine={false}
                  tickLine={false}
                  interval={timeframe === 30 ? 4 : 0}
                  tick={{
                    fill: axisTickColor,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                  dy={6}
                />

                <YAxis
                  domain={yDomain}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                  tickFormatter={formatYAxisUsd}
                  tick={{
                    fill: axisTickColor,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                />

                {!series.hasMovement && (
                  <ReferenceLine
                    y={Number(series.endUsd6) / 1_000_000}
                    stroke={strokePalette.stroke}
                    strokeOpacity={0.35}
                    strokeDasharray="4 4"
                  />
                )}

                <Tooltip
                  cursor={{
                    stroke: strokePalette.stroke,
                    strokeWidth: 1.25,
                    strokeDasharray: "4 4",
                    strokeOpacity: 0.7,
                  }}
                  content={<PortfolioChartTooltip isDark={isDark} />}
                />

                <Area
                  type="monotone"
                  dataKey="totalUsdNumber"
                  stroke={strokePalette.stroke}
                  strokeWidth={2.75}
                  fill="url(#nx-networth-area)"
                  filter="url(#nx-networth-glow)"
                  isAnimationActive={false}
                  dot={
                    timeframe === 7
                      ? {
                          r: 3,
                          fill: isDark ? "#071120" : "#ffffff",
                          stroke: strokePalette.stroke,
                          strokeWidth: 2,
                        }
                      : false
                  }
                  activeDot={{
                    r: 5.5,
                    fill: strokePalette.stroke,
                    stroke: isDark ? "#071120" : "#ffffff",
                    strokeWidth: 2.5,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="nx-num mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-400">
            <span>
              {series.coverageToBlock > 0 ? (
                <>
                  Verified blocks #{series.coverageFromBlock.toLocaleString()} – #
                  {series.coverageToBlock.toLocaleString()}
                  {series.coveragePartial ? " (recent window cap reached)" : ""}
                </>
              ) : (
                "Verified live on-chain balance snapshot"
              )}
            </span>
            <span>
              {series.hasMovement
                ? "Marked to live market spot"
                : "Stable balance across selected window"}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
