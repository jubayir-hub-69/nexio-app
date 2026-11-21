import type { StablecoinFlowEvent } from "@/lib/history";

const ZERO = 0n;
const UNIT_6 = 1_000_000n;
const DAY_SEC = 86_400;

export type AnalyticsTimeframeDays = 7 | 30;

export type CurrentTreasuryBuckets = {
  walletUsdc6: bigint;
  vaultUsdc6: bigint;
  lpUsdc6: bigint;
  walletEurc6: bigint;
  vaultEurc6: bigint;
  lpEurc6: bigint;
};

export type DailyNetWorthPoint = {
  dateKey: string;
  shortLabel: string;
  fullDateLabel: string;
  totalUsd6: bigint;
  totalUsdNumber: number;
  totalUsdFormatted: string;
  walletUsd6: bigint;
  vaultUsd6: bigint;
  lpUsd6: bigint;
  walletUsdc6: bigint;
  vaultUsdc6: bigint;
  lpUsdc6: bigint;
  walletEurc6: bigint;
  vaultEurc6: bigint;
  lpEurc6: bigint;
  txCount: number;
  netFlowUsd6: bigint;
};

export type PortfolioNetWorthSeries = {
  days: AnalyticsTimeframeDays;
  points: DailyNetWorthPoint[];
  startUsd6: bigint;
  endUsd6: bigint;
  deltaUsd6: bigint;
  deltaPct: number | null;
  minUsd6: bigint;
  maxUsd6: bigint;
  totalTxCount: number;
  hasMovement: boolean;
  coverageFromBlock: number;
  coverageToBlock: number;
  coveragePartial: boolean;
};

const UTC_MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function utcDateKeyFromDayIndex(dayIndex: number): string {
  const d = new Date(dayIndex * DAY_SEC * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function utcShortLabelFromDayIndex(dayIndex: number): string {
  const d = new Date(dayIndex * DAY_SEC * 1000);
  return `${UTC_MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function utcFullLabelFromDayIndex(dayIndex: number): string {
  const d = new Date(dayIndex * DAY_SEC * 1000);
  return `${UTC_MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} (UTC)`;
}

function clampNonNegative(v: bigint): bigint {
  return v < ZERO ? ZERO : v;
}

function eurcToUsd6(eurc6: bigint, eurcSpotOut6: bigint | null): bigint {
  if (eurc6 === ZERO) return ZERO;
  if (eurcSpotOut6 === null || eurcSpotOut6 <= ZERO) return ZERO;
  return (eurc6 * eurcSpotOut6) / UNIT_6;
}

/**
 * Formats a 6-decimal USD BigInt with exact half-up rounding to 2 decimal places
 * and comma separators (e.g. `$12,450.25`, `-$45.10`), avoiding IEEE-754 rounding drift.
 */
export function formatExactUsdFrom6(usd6: bigint, options?: { signed?: boolean }): string {
  const negative = usd6 < ZERO;
  const abs = negative ? -usd6 : usd6;
  // Round half-up from 6 decimals to 2 decimals (cents)
  const totalCents = (abs + 5_000n) / 10_000n;
  const dollars = totalCents / 100n;
  const cents = totalCents % 100n;

  const dollarsStr = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const centsStr = cents.toString().padStart(2, "0");
  const prefix = negative ? "-$" : options?.signed && totalCents > ZERO ? "+$" : "$";
  return `${prefix}${dollarsStr}.${centsStr}`;
}

function usd6ToNumber(usd6: bigint): number {
  return Number(usd6) / 1_000_000;
}

/**
 * Mathematically reconstructs true daily end-of-day UTC Net Worth snapshots across `days`
 * by stepping backward from the verified live Wallet + Vault + LP balances using strictly
 * on-chain `eth_getLogs` Transfer events:
 *
 *   PreviousBalance(day - 1) = CurrentBalance(day) - NetTransfers(day)
 *
 * Internal treasury movements (`vault_stake`, `vault_withdraw`, `lp_add`, `lp_remove`) shift
 * funds between Wallet and Vault/LP buckets without falsely inflating or deflating Total Net Worth.
 * ZERO synthetic noise or interpolated random points are ever inserted.
 */
export function reconstructDailyNetWorthSeries(input: {
  days: AnalyticsTimeframeDays;
  nowSec: number;
  current: CurrentTreasuryBuckets;
  eurcSpotOut6: bigint | null;
  flows: StablecoinFlowEvent[];
  coverageFromBlock: number;
  coverageToBlock: number;
  coveragePartial: boolean;
}): PortfolioNetWorthSeries {
  const { days, nowSec, current, eurcSpotOut6, flows } = input;
  const todayDayIndex = Math.floor(nowSec / DAY_SEC);
  const startDayIndex = todayDayIndex - (days - 1);

  // Bucket on-chain flows strictly by UTC calendar day index
  const flowsByDay = new Map<number, StablecoinFlowEvent[]>();
  const uniqueTxHashesByDay = new Map<number, Set<string>>();

  for (const flow of flows) {
    if (!Number.isFinite(flow.timestamp) || flow.timestamp <= 0) continue;
    const dayIdx = Math.floor(flow.timestamp / DAY_SEC);
    if (dayIdx < startDayIndex || dayIdx > todayDayIndex) continue;

    const bucket = flowsByDay.get(dayIdx);
    if (bucket) bucket.push(flow);
    else flowsByDay.set(dayIdx, [flow]);

    const txSet = uniqueTxHashesByDay.get(dayIdx);
    if (txSet) txSet.add(flow.txHash.toLowerCase());
    else uniqueTxHashesByDay.set(dayIdx, new Set([flow.txHash.toLowerCase()]));
  }

  // Mutable cursor starts at today's verified live balances
  let walletUsdc6 = current.walletUsdc6;
  let vaultUsdc6 = current.vaultUsdc6;
  let lpUsdc6 = current.lpUsdc6;
  let walletEurc6 = current.walletEurc6;
  let vaultEurc6 = current.vaultEurc6;
  let lpEurc6 = current.lpEurc6;

  const reversePoints: DailyNetWorthPoint[] = [];

  for (let dayIdx = todayDayIndex; dayIdx >= startDayIndex; dayIdx--) {
    const dayFlows = flowsByDay.get(dayIdx) ?? [];
    const dayTxCount = uniqueTxHashesByDay.get(dayIdx)?.size ?? 0;

    // Net external USD flow that happened on `dayIdx` (excluding internal wallet <-> vault/LP moves)
    let netExternalUsdc6 = ZERO;
    let netExternalEurc6 = ZERO;
    for (const f of dayFlows) {
      if (f.kind === "send" || f.kind === "receive" || f.kind === "swap") {
        const delta = f.direction === "in" ? f.amount6 : -f.amount6;
        if (f.tokenSymbol === "USDC") netExternalUsdc6 += delta;
        else netExternalEurc6 += delta;
      }
    }
    const netFlowUsd6 = netExternalUsdc6 + eurcToUsd6(netExternalEurc6, eurcSpotOut6);

    const walletUsd6 = walletUsdc6 + eurcToUsd6(walletEurc6, eurcSpotOut6);
    const vaultUsd6 = vaultUsdc6 + eurcToUsd6(vaultEurc6, eurcSpotOut6);
    const lpUsd6 = lpUsdc6 + eurcToUsd6(lpEurc6, eurcSpotOut6);
    const totalUsd6 = walletUsd6 + vaultUsd6 + lpUsd6;

    reversePoints.push({
      dateKey: utcDateKeyFromDayIndex(dayIdx),
      shortLabel: utcShortLabelFromDayIndex(dayIdx),
      fullDateLabel: utcFullLabelFromDayIndex(dayIdx),
      totalUsd6,
      totalUsdNumber: usd6ToNumber(totalUsd6),
      totalUsdFormatted: formatExactUsdFrom6(totalUsd6),
      walletUsd6,
      vaultUsd6,
      lpUsd6,
      walletUsdc6,
      vaultUsdc6,
      lpUsdc6,
      walletEurc6,
      vaultEurc6,
      lpEurc6,
      txCount: dayTxCount,
      netFlowUsd6,
    });

    // Step backward to end of (dayIdx - 1): Previous = Current - NetTransfers(dayIdx)
    if (dayIdx > startDayIndex && dayFlows.length > 0) {
      for (const f of dayFlows) {
        const isUsdc = f.tokenSymbol === "USDC";
        switch (f.kind) {
          case "receive":
            if (isUsdc) walletUsdc6 -= f.amount6;
            else walletEurc6 -= f.amount6;
            break;
          case "send":
            if (isUsdc) walletUsdc6 += f.amount6;
            else walletEurc6 += f.amount6;
            break;
          case "swap":
            if (f.direction === "in") {
              if (isUsdc) walletUsdc6 -= f.amount6;
              else walletEurc6 -= f.amount6;
            } else {
              if (isUsdc) walletUsdc6 += f.amount6;
              else walletEurc6 += f.amount6;
            }
            break;
          case "vault_stake":
            // Forward: wallet -= amt, vault += amt  ==>  Reverse: wallet += amt, vault -= amt
            if (isUsdc) {
              walletUsdc6 += f.amount6;
              vaultUsdc6 -= f.amount6;
            } else {
              walletEurc6 += f.amount6;
              vaultEurc6 -= f.amount6;
            }
            break;
          case "vault_withdraw":
            // Forward: wallet += amt, vault -= amt  ==>  Reverse: wallet -= amt, vault += amt
            if (isUsdc) {
              walletUsdc6 -= f.amount6;
              vaultUsdc6 += f.amount6;
            } else {
              walletEurc6 -= f.amount6;
              vaultEurc6 += f.amount6;
            }
            break;
          case "lp_add":
            if (isUsdc) {
              walletUsdc6 += f.amount6;
              lpUsdc6 -= f.amount6;
            } else {
              walletEurc6 += f.amount6;
              lpEurc6 -= f.amount6;
            }
            break;
          case "lp_remove":
            if (isUsdc) {
              walletUsdc6 -= f.amount6;
              lpUsdc6 += f.amount6;
            } else {
              walletEurc6 -= f.amount6;
              lpEurc6 += f.amount6;
            }
            break;
        }
      }

      // Clamp buckets strictly at >= 0 to protect against minor native gas rounding
      walletUsdc6 = clampNonNegative(walletUsdc6);
      vaultUsdc6 = clampNonNegative(vaultUsdc6);
      lpUsdc6 = clampNonNegative(lpUsdc6);
      walletEurc6 = clampNonNegative(walletEurc6);
      vaultEurc6 = clampNonNegative(vaultEurc6);
      lpEurc6 = clampNonNegative(lpEurc6);
    }
  }

  const points = reversePoints.reverse();
  const startUsd6 = points[0]?.totalUsd6 ?? ZERO;
  const endUsd6 = points[points.length - 1]?.totalUsd6 ?? ZERO;
  const deltaUsd6 = endUsd6 - startUsd6;

  let minUsd6 = points[0]?.totalUsd6 ?? ZERO;
  let maxUsd6 = points[0]?.totalUsd6 ?? ZERO;
  let totalTxCount = 0;

  for (const pt of points) {
    if (pt.totalUsd6 < minUsd6) minUsd6 = pt.totalUsd6;
    if (pt.totalUsd6 > maxUsd6) maxUsd6 = pt.totalUsd6;
    totalTxCount += pt.txCount;
  }

  const deltaPct =
    startUsd6 > ZERO
      ? (Number(deltaUsd6) / Number(startUsd6)) * 100
      : endUsd6 > ZERO
        ? null
        : 0;

  return {
    days,
    points,
    startUsd6,
    endUsd6,
    deltaUsd6,
    deltaPct,
    minUsd6,
    maxUsd6,
    totalTxCount,
    hasMovement: maxUsd6 !== minUsd6,
    coverageFromBlock: input.coverageFromBlock,
    coverageToBlock: input.coverageToBlock,
    coveragePartial: input.coveragePartial,
  };
}
