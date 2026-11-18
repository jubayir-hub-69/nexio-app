import { ethers } from "ethers";
import {
  ARC_CHAIN_ID,
  MAX_SWAP_PRICE_IMPACT_BPS,
  MAX_SWAP_VALUE_LOSS_BPS,
  valueLossVersusSpotBps,
} from "@/lib/contracts";

export const ACHSWAP_API_BASE = "https://trade.achswap.app/api/v1";
export const ACHSWAP_FEE_BPS = 0;
export const ACHSWAP_MAX_SLIPPAGE_BPS = 2000;
export const SPOT_CACHE_MS = 30_000;
export const SPOT_MAX_STALENESS_MS = 45_000;
const MAX_TWO_SIDED_SPREAD_BPS = 400;

const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export class AchswapApiError extends Error {
  status: number;
  code: string;
  reason: string;

  constructor(status: number, code: string, message: string, reason = "") {
    super(message);
    this.name = "AchswapApiError";
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

export type AchswapQuoteRequest = {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  feeBps: number;
  slippageBps: number;
  trader?: string;
  spotOnly?: boolean;
};

export type AchswapApproval = {
  token: string;
  spender: string;
  amount: bigint;
};

export type AchswapTransaction = {
  to: string;
  data: string;
  value: bigint;
  gas: bigint;
};

export type AchswapQuote = {
  amountOut: bigint;
  minAmountOut: bigint;
  priceImpactBps: number | null;
  partnerBps: number | null;
  executor: string;
  requestId: string;
};

export type AchswapSwap = AchswapQuote & {
  tx: AchswapTransaction;
  approval: AchswapApproval | null;
};

export type StableSwapAssessment = {
  valueLossBps: number | null;
  blocked: boolean;
  reason: string;
};

export type SpotQuoteSnapshot = {
  amountOut: bigint;
  bidAmountOut: bigint;
  askAmountOut: bigint | null;
  spreadBps: number | null;
  fetchedAt: number;
  ageMs: number;
  expired: boolean;
};

export function clampSlippageBps(bps: number): number {
  if (!Number.isFinite(bps)) return 100;
  return Math.max(0, Math.min(ACHSWAP_MAX_SLIPPAGE_BPS, Math.round(bps)));
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function isNativeAchswapToken(token: string): boolean {
  const normalized = token.trim().toLowerCase();
  return normalized === ZERO_ADDRESS || normalized === NATIVE_TOKEN;
}

function normalizeValidAddressOrEmpty(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed) || isNativeAchswapToken(lower)) {
    return "";
  }
  return ethers.isAddress(trimmed)
    ? ethers.getAddress(trimmed)
    : ethers.getAddress(lower);
}

function sanitizeUpstreamBrandText(text: string): string {
  return text.replace(/\bachswap\b/gi, "Nexio routing engine");
}

export function describeAchswapError(error: unknown): string | null {
  if (!(error instanceof AchswapApiError)) return null;
  if (error.code === "NO_ROUTE" || /no route/i.test(error.message)) return "No liquidity route found.";
  if (error.code === "MISSING_API_KEY") {
    return "Swaps are temporarily unavailable. Server routing credentials are not configured.";
  }
  if (error.code === "UNAUTHORIZED") return "Routing service rejected the server credentials.";
  if (error.code === "RATE_LIMITED" || error.code === "CONCURRENCY_LIMITED") {
    return "Routing engine is busy. Wait a moment and try again.";
  }
  if (error.code === "SIMULATION_FAILED") {
    const cleanReason = sanitizeUpstreamBrandText(error.reason);
    return cleanReason
      ? `Swap simulation failed (${cleanReason}). Request a new quote.`
      : "Swap simulation failed. Request a new quote.";
  }
  return sanitizeUpstreamBrandText(error.message).slice(0, 180) || "Swap routing request failed.";
}

type CachedSpotEntry = {
  amountOut: bigint;
  bidAmountOut: bigint;
  askAmountOut: bigint | null;
  spreadBps: number | null;
  at: number;
};

const spotCache = new Map<string, CachedSpotEntry>();
const spotInflight = new Map<string, Promise<bigint | null>>();

function spotCacheKey(tokenIn: string, tokenOut: string, chainId = ARC_CHAIN_ID): string {
  return `${chainId}:${tokenIn.trim().toLowerCase()}:${tokenOut.trim().toLowerCase()}`;
}

export function isSpotRateFresh(
  fetchedAt: number | null | undefined,
  maxAgeMs: number = SPOT_MAX_STALENESS_MS
): boolean {
  if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt) || fetchedAt <= 0) return false;
  const age = Date.now() - fetchedAt;
  return age >= 0 && age <= maxAgeMs;
}

export function getCachedSpotSnapshot(
  tokenIn: string,
  tokenOut: string,
  chainId = ARC_CHAIN_ID,
  maxAgeMs: number = SPOT_MAX_STALENESS_MS
): SpotQuoteSnapshot | null {
  const key = spotCacheKey(tokenIn, tokenOut, chainId);
  const hit = spotCache.get(key);
  if (!hit) return null;
  const ageMs = Math.max(0, Date.now() - hit.at);
  if (ageMs > maxAgeMs) {
    spotCache.delete(key);
    return null;
  }
  return {
    amountOut: hit.amountOut,
    bidAmountOut: hit.bidAmountOut,
    askAmountOut: hit.askAmountOut,
    spreadBps: hit.spreadBps,
    fetchedAt: hit.at,
    ageMs,
    expired: ageMs > maxAgeMs,
  };
}

export function invalidateSpotCache(tokenIn?: string, tokenOut?: string, chainId = ARC_CHAIN_ID) {
  if (tokenIn && tokenOut) {
    spotCache.delete(spotCacheKey(tokenIn, tokenOut, chainId));
  } else {
    spotCache.clear();
  }
}

export function assessStableSwap(
  amountIn: bigint,
  amountOut: bigint,
  spotAmountIn: bigint | null,
  spotAmountOut: bigint | null,
  priceImpactBps: number | null
): StableSwapAssessment {
  const hasSpot =
    spotAmountIn !== null &&
    spotAmountOut !== null &&
    spotAmountIn > 0n &&
    spotAmountOut > 0n;

  if (!hasSpot && priceImpactBps === null) {
    return {
      valueLossBps: null,
      blocked: true,
      reason: "Live market reference quote unavailable; swap temporarily paused for price protection",
    };
  }

  const valueLossBps = hasSpot
    ? valueLossVersusSpotBps(amountIn, amountOut, spotAmountIn, spotAmountOut)
    : priceImpactBps === null
      ? null
      : Math.max(0, priceImpactBps);

  const impactBlocked = priceImpactBps !== null && priceImpactBps > MAX_SWAP_PRICE_IMPACT_BPS;
  const lossBlocked = valueLossBps !== null && valueLossBps > MAX_SWAP_VALUE_LOSS_BPS;
  let reason = "";
  if (lossBlocked && valueLossBps !== null) {
    reason = `Swap disabled. This quote is ${(valueLossBps / 100).toFixed(2)}% worse than the live 1-unit spot rate, above the ${(MAX_SWAP_VALUE_LOSS_BPS / 100).toFixed(2)}% limit.`;
  } else if (impactBlocked && priceImpactBps !== null) {
    reason = `Swap disabled. Price impact is ${(priceImpactBps / 100).toFixed(2)}%, above the ${(MAX_SWAP_PRICE_IMPACT_BPS / 100).toFixed(2)}% limit.`;
  }
  return { valueLossBps, blocked: impactBlocked || lossBlocked, reason };
}

function attachAbortSignal<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) {
    const err = new Error("Aborted");
    err.name = "AbortError";
    return Promise.reject(err);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const err = new Error("Aborted");
      err.name = "AbortError";
      reject(err);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(
      (val) => {
        signal.removeEventListener("abort", onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

/**
 * Computes pure unskewed live market spot for 1 whole `tokenIn` in `tokenOut` units (`feeBps: 0`).
 * Queries both `1 tokenIn -> tokenOut` (bid) and `1 tokenOut -> tokenIn` (implied ask) in parallel
 * so symmetric AMM pool swap fees (e.g. ~30 bps each direction) cancel out to true mid-market spot.
 */
export async function requestOneUnitSpotOut(input: {
  tokenIn: string;
  tokenOut: string;
  decimals: number;
  decimalsOut?: number;
  chainId?: number;
  force?: boolean;
  signal?: AbortSignal;
}): Promise<bigint | null> {
  if (input.signal?.aborted) {
    const err = new Error("Aborted");
    err.name = "AbortError";
    throw err;
  }

  const chainId = input.chainId ?? ARC_CHAIN_ID;
  const decimalsIn = input.decimals;
  const decimalsOut = input.decimalsOut ?? input.decimals;
  const key = spotCacheKey(input.tokenIn, input.tokenOut, chainId);
  const hit = spotCache.get(key);
  const now = Date.now();

  if (hit && now - hit.at > SPOT_MAX_STALENESS_MS) {
    spotCache.delete(key);
  } else if (!input.force && hit && now - hit.at < SPOT_CACHE_MS) {
    return hit.amountOut;
  }

  let shared = !input.force ? spotInflight.get(key) : undefined;
  if (!shared) {
    shared = (async (): Promise<bigint | null> => {
      try {
        const [forwardSettled, reverseSettled] = await Promise.allSettled([
          requestAchswapQuote({
            tokenIn: input.tokenIn,
            tokenOut: input.tokenOut,
            amountIn: 10n ** BigInt(decimalsIn),
            slippageBps: 50,
            chainId,
            spotOnly: true,
          }),
          requestAchswapQuote({
            tokenIn: input.tokenOut,
            tokenOut: input.tokenIn,
            amountIn: 10n ** BigInt(decimalsOut),
            slippageBps: 50,
            chainId,
            spotOnly: true,
          }),
        ]);

        const bidOut =
          forwardSettled.status === "fulfilled" && forwardSettled.value.amountOut > 0n
            ? forwardSettled.value.amountOut
            : 0n;

        const reverseOut =
          reverseSettled.status === "fulfilled" && reverseSettled.value.amountOut > 0n
            ? reverseSettled.value.amountOut
            : 0n;

        const impliedAskOut =
          reverseOut > 0n ? 10n ** BigInt(decimalsIn + decimalsOut) / reverseOut : 0n;

        if (bidOut <= 0n && impliedAskOut <= 0n) {
          return null;
        }

        let midOut = bidOut > 0n ? bidOut : impliedAskOut;
        let spreadBps: number | null = null;

        if (bidOut > 0n && impliedAskOut > 0n) {
          const high = bidOut > impliedAskOut ? bidOut : impliedAskOut;
          const low = bidOut > impliedAskOut ? impliedAskOut : bidOut;
          const rawSpreadBps = Number(((high - low) * 10_000n) / high);
          spreadBps = Number.isFinite(rawSpreadBps) ? rawSpreadBps : null;

          if (spreadBps !== null && spreadBps <= MAX_TWO_SIDED_SPREAD_BPS) {
            // Round half-up on two-sided midpoint so symmetric pool fees cancel cleanly
            midOut = (bidOut + impliedAskOut + 1n) / 2n;
          } else {
            midOut = bidOut;
          }
        }

        const fetchedAt = Date.now();
        spotCache.set(key, {
          amountOut: midOut,
          bidAmountOut: bidOut > 0n ? bidOut : midOut,
          askAmountOut: impliedAskOut > 0n ? impliedAskOut : null,
          spreadBps,
          at: fetchedAt,
        });
        return midOut;
      } catch (error) {
        if (isAbortError(error)) throw error;
        return null;
      }
    })().finally(() => {
      if (spotInflight.get(key) === shared) {
        spotInflight.delete(key);
      }
    });

    spotInflight.set(key, shared);
  }

  return attachAbortSignal(shared, input.signal);
}

export async function requestOneUnitSpotSnapshot(input: {
  tokenIn: string;
  tokenOut: string;
  decimals: number;
  decimalsOut?: number;
  chainId?: number;
  force?: boolean;
  maxAgeMs?: number;
  signal?: AbortSignal;
}): Promise<SpotQuoteSnapshot | null> {
  const chainId = input.chainId ?? ARC_CHAIN_ID;
  const maxAgeMs = input.maxAgeMs ?? SPOT_MAX_STALENESS_MS;
  const amountOut = await requestOneUnitSpotOut(input);
  if (amountOut === null) return null;
  return getCachedSpotSnapshot(input.tokenIn, input.tokenOut, chainId, maxAgeMs);
}

export function buildQuoteRequest(input: {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  slippageBps: number;
  chainId: number;
  trader?: string;
  spotOnly?: boolean;
}): AchswapQuoteRequest {
  return {
    chainId: input.chainId,
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    amountIn: input.amountIn.toString(),
    feeBps: ACHSWAP_FEE_BPS,
    slippageBps: clampSlippageBps(input.slippageBps),
    ...(input.spotOnly ? { spotOnly: true } : input.trader ? { trader: input.trader } : {}),
  };
}

export async function requestAchswapQuote(input: {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  slippageBps: number;
  chainId: number;
  trader?: string;
  spotOnly?: boolean;
  signal?: AbortSignal;
}): Promise<AchswapQuote> {
  const payload = await postLocal("/api/achswap/quote", buildQuoteRequest(input), input.signal);
  return normalizeQuote(payload);
}

export async function requestAchswapSwap(input: {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  slippageBps: number;
  chainId: number;
  sender: string;
  recipient: string;
  trader?: string;
  signal?: AbortSignal;
}): Promise<AchswapSwap> {
  const payload = await postLocal(
    "/api/achswap/swap",
    {
      ...buildQuoteRequest({
        ...input,
        trader: input.trader ?? input.sender,
      }),
      sender: input.sender,
      recipient: input.recipient,
    },
    input.signal
  );
  return normalizeSwap(payload, input.tokenIn);
}

async function postLocal(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new AchswapApiError(0, "NETWORK", "Could not reach swap routing service. Try again.");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const record = asRecord(payload);
    const err = asRecord(record?.error);
    const code = typeof err?.code === "string" ? err.code : "REQUEST_FAILED";
    const message =
      typeof err?.message === "string"
        ? sanitizeUpstreamBrandText(err.message)
        : "Swap routing request failed.";
    const reason = typeof err?.reason === "string" ? sanitizeUpstreamBrandText(err.reason) : "";
    throw new AchswapApiError(response.status, code, message, reason);
  }
  return payload;
}

export function normalizeQuote(payload: unknown): AchswapQuote {
  const body = asRecord(payload);
  if (!body) {
    throw new AchswapApiError(502, "INVALID_RESPONSE", "Routing engine returned an unreadable quote.");
  }
  const amountOut = readAmount(body.amountOut, "amountOut");
  const minAmountOut = readAmount(body.minAmountOut ?? body.amountOutMin, "minAmountOut");
  const fees = asRecord(body.fees);
  const partnerBps = fees ? readImpact(fees.partnerBps) : readImpact(body.partnerBps);
  return {
    amountOut,
    minAmountOut,
    priceImpactBps: readImpact(body.priceImpactBps),
    partnerBps,
    executor: readExecutor(body),
    requestId: typeof body.requestId === "string" ? body.requestId : "",
  };
}

export function normalizeSwap(payload: unknown, expectedTokenIn?: string): AchswapSwap {
  const quote = normalizeQuote(payload);
  const body = asRecord(payload);
  if (!body) {
    throw new AchswapApiError(502, "INVALID_RESPONSE", "Routing engine returned an unreadable swap.");
  }
  const approval = readApproval(body, expectedTokenIn);
  return {
    ...quote,
    executor: readExecutor(body) || approval?.spender || quote.executor,
    tx: readTransaction(body),
    approval,
  };
}

function readExecutor(body: Record<string, unknown>): string {
  const approval = asRecord(body.approval);
  const candidate = body.executor ?? body.spender ?? body.approvalTarget ?? approval?.spender;
  return normalizeValidAddressOrEmpty(candidate);
}

function readApproval(body: Record<string, unknown>, expectedTokenIn?: string): AchswapApproval | null {
  if (body.approval == null) return null;
  const approval = asRecord(body.approval);
  if (!approval) return null;
  const token = normalizeValidAddressOrEmpty(approval.token);
  const spender = normalizeValidAddressOrEmpty(approval.spender);
  if (!token || !spender) return null;

  if (expectedTokenIn) {
    const normalizedExpected = normalizeValidAddressOrEmpty(expectedTokenIn);
    if (normalizedExpected && token.toLowerCase() !== normalizedExpected.toLowerCase()) {
      throw new AchswapApiError(
        502,
        "INVALID_RESPONSE",
        "Approval token returned by routing engine did not match the swap input token."
      );
    }
  }

  return {
    token,
    spender,
    amount: readAmount(approval.amount, "approval.amount"),
  };
}

function readTransaction(body: Record<string, unknown>): AchswapTransaction {
  const nested = asRecord(body.tx) ?? asRecord(body.transaction);
  const source = nested && typeof nested.to === "string" ? nested : body;
  const normalizedTo = normalizeValidAddressOrEmpty(source.to);
  if (!normalizedTo) {
    throw new AchswapApiError(
      502,
      "INVALID_RESPONSE",
      "Routing engine did not return a valid settlement target."
    );
  }
  return {
    to: normalizedTo,
    data: readHexData(source.data),
    value: source.value === undefined ? 0n : readAmount(source.value, "value"),
    gas: source.gas === undefined || source.gas === null || source.gas === "" ? 0n : readAmount(source.gas, "gas"),
  };
}

function readHexData(value: unknown): string {
  if (typeof value !== "string") {
    throw new AchswapApiError(502, "INVALID_RESPONSE", "Routing engine did not return swap calldata.");
  }
  const hex = value.trim().startsWith("0x") ? value.trim() : `0x${value.trim()}`;
  if (!/^0x([0-9a-fA-F]{2})+$/.test(hex) || hex.length < 10) {
    throw new AchswapApiError(502, "INVALID_RESPONSE", "Routing engine did not return valid swap calldata.");
  }
  return hex;
}

function readAmount(value: unknown, field: string): bigint {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return BigInt(trimmed);
    if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
  }
  throw new AchswapApiError(502, "INVALID_RESPONSE", `Swap response did not include ${field}.`);
}

function readImpact(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return null;
  return parsed >= 0 ? Math.ceil(parsed) : Math.floor(parsed);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
