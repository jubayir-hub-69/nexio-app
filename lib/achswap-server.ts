import { ethers } from "ethers";
import { ACHSWAP_API_BASE, ACHSWAP_MAX_SLIPPAGE_BPS } from "@/lib/achswap";
import { ARC_CHAIN_ID, DAILY_GM_ABI, DAILY_GM_ADDRESS, withArcRpc } from "@/lib/contracts";
import { DEFAULT_FEE_RECIPIENT, feeBpsForStreak } from "@/lib/gm-tiers";

export const ACHSWAP_UPSTREAM_TIMEOUT_MS = 8_000;
export const QUOTE_CACHE_MS = 6_000;
export const TOKEN_CACHE_TTL_MS = 60_000;
export const TOKEN_TOP_CACHE_MS = TOKEN_CACHE_TTL_MS;
export const TOKEN_SEARCH_CACHE_MS = TOKEN_CACHE_TTL_MS;
export const STREAK_CACHE_MS = 120_000;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 120;

const ACHSWAP_ORIGIN = "https://trade.achswap.app";
const ACHSWAP_TOKEN_DISCOVERY_URL = `${ACHSWAP_ORIGIN}/api/token-discovery`;

export type NormalizedAchswapToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI: string | null;
  verified: boolean;
  chainId: number;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volumeUsd24h: number | null;
  priceChangePct24h: number | null;
};

export type AchswapProxyResult = {
  status: number;
  body: unknown;
  retryAfterMs?: number;
};

export type QuoteFields = {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  feeBps: number;
  slippageBps: number;
  feeRecipient?: string;
  trader?: string;
  spotOnly?: boolean;
};

export type SwapFields = QuoteFields & {
  sender: string;
  recipient: string;
};

export function readAchswapApiKey(): string {
  return (process.env.ACHSWAP_API_KEY || "").trim();
}

function createMergedAbortSignal(
  timeoutMs: number,
  callerSignal?: AbortSignal
): {
  signal: AbortSignal;
  didTimeout: () => boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;

  if (callerSignal?.aborted) {
    controller.abort(callerSignal.reason);
    return {
      signal: controller.signal,
      didTimeout: () => false,
      cleanup: () => undefined,
    };
  }

  const onCallerAbort = () => {
    controller.abort(callerSignal?.reason);
  };

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("UpstreamTimeout"));
  }, timeoutMs);

  callerSignal?.addEventListener("abort", onCallerAbort, { once: true });

  return {
    signal: controller.signal,
    didTimeout: () => timedOut && !callerSignal?.aborted,
    cleanup: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

function sanitizeUpstreamPayload<T extends QuoteFields | SwapFields>(body: T): Omit<T, "spotOnly"> {
  const clone = { ...body };
  delete clone.spotOnly;
  return clone;
}

export async function postAchswap(
  path: "quote" | "swap",
  body: QuoteFields | SwapFields,
  signal?: AbortSignal
): Promise<AchswapProxyResult> {
  const apiKey = readAchswapApiKey();
  if (!apiKey) {
    return {
      status: 401,
      body: {
        error: {
          code: "MISSING_API_KEY",
          message: "Server routing credentials are not configured.",
        },
      },
    };
  }

  const merged = createMergedAbortSignal(ACHSWAP_UPSTREAM_TIMEOUT_MS, signal);
  const wireBody = sanitizeUpstreamPayload(body);
  let response: Response;

  try {
    response = await fetch(`${ACHSWAP_API_BASE}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
      body: JSON.stringify(wireBody),
      cache: "no-store",
      signal: merged.signal,
    });
  } catch (error) {
    const timedOut = merged.didTimeout();
    merged.cleanup();
    if (signal?.aborted) {
      const abortErr = new Error("Aborted");
      abortErr.name = "AbortError";
      throw abortErr;
    }
    if (timedOut) {
      return {
        status: 504,
        body: {
          error: {
            code: "UNAVAILABLE",
            message: "Swap routing upstream timed out. Try again.",
          },
        },
      };
    }
    throw error;
  }

  let text = "";
  try {
    text = await response.text();
  } catch (error) {
    const timedOut = merged.didTimeout();
    merged.cleanup();
    if (signal?.aborted) {
      const abortErr = new Error("Aborted");
      abortErr.name = "AbortError";
      throw abortErr;
    }
    if (timedOut) {
      return {
        status: 504,
        body: {
          error: {
            code: "UNAVAILABLE",
            message: "Swap routing upstream timed out while reading response.",
          },
        },
      };
    }
    throw error;
  } finally {
    merged.cleanup();
  }

  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = {
        error: {
          code: "INTERNAL",
          message: "Routing engine returned an unreadable response.",
        },
      };
    }
  }

  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
  const retryAfterMs = Number.isFinite(retryAfterSeconds)
    ? Math.min(5_000, Math.max(0, retryAfterSeconds * 1000))
    : 0;

  return {
    status: response.status,
    body: parsed ?? { error: { code: "INTERNAL", message: "Empty routing response." } },
    retryAfterMs,
  };
}

// ============================================================================
// Persistent Global In-Memory Cache Store (Survives Next.js HMR & Warm Invocations)
// ============================================================================

type GlobalAchswapCacheStore = {
  quoteCache: Map<string, { at: number; result: AchswapProxyResult }>;
  quoteInflight: Map<string, Promise<AchswapProxyResult>>;
  tokenCache: Map<string, { at: number; ttlMs: number; tokens: NormalizedAchswapToken[] }>;
  tokenInflight: Map<string, Promise<NormalizedAchswapToken[]>>;
  streakCache: Map<string, { streak: number; at: number }>;
  streakInflight: Map<string, Promise<number>>;
  ipBuckets: Map<string, number[]>;
};

const globalForAchswap = globalThis as typeof globalThis & {
  __nexioAchswapGlobalCache?: GlobalAchswapCacheStore;
};

const globalCacheStore: GlobalAchswapCacheStore =
  globalForAchswap.__nexioAchswapGlobalCache ??
  (globalForAchswap.__nexioAchswapGlobalCache = {
    quoteCache: new Map(),
    quoteInflight: new Map(),
    tokenCache: new Map(),
    tokenInflight: new Map(),
    streakCache: new Map(),
    streakInflight: new Map(),
    ipBuckets: new Map(),
  });

// ============================================================================
// Server-Side Consecutive Streak Cache (120s Global TTL + stale-if-error + single-flight)
// ============================================================================

const STREAK_CACHE_MAX = 500;
const streakCache = globalCacheStore.streakCache;
const streakInflight = globalCacheStore.streakInflight;

export function invalidateGmStreakCache(trader?: string) {
  if (trader && ethers.isAddress(trader)) {
    streakCache.delete(trader.toLowerCase());
  } else {
    streakCache.clear();
  }
}

function rememberStreak(key: string, streak: number) {
  const now = Date.now();
  if (streakCache.size >= STREAK_CACHE_MAX && !streakCache.has(key)) {
    for (const [k, entry] of streakCache) {
      if (now - entry.at >= STREAK_CACHE_MS) {
        streakCache.delete(k);
      }
    }
    if (streakCache.size >= STREAK_CACHE_MAX) {
      const oldest = streakCache.keys().next().value;
      if (oldest) streakCache.delete(oldest);
    }
  }
  streakCache.set(key, { streak, at: now });
}

export function readFeeRecipient(): string {
  const configured = (process.env.ACHSWAP_FEE_RECIPIENT || DEFAULT_FEE_RECIPIENT).trim();
  return ethers.isAddress(configured)
    ? ethers.getAddress(configured)
    : ethers.getAddress(DEFAULT_FEE_RECIPIENT);
}

/**
 * Reads `DailyGM.getEffectiveStreak(trader)` on Arc Mainnet (5042) so streaks older than
 * the 48-hour consecutive window evaluate to 0 (20 bps), while active 30D/90D/180D streaks
 * receive 10/5/0 bps.
 */
export async function readGmStreak(trader: string): Promise<number> {
  if (!trader || !ethers.isAddress(trader)) return 0;
  const checksummed = ethers.getAddress(trader);
  const key = checksummed.toLowerCase();
  const now = Date.now();

  const cached = streakCache.get(key);
  if (cached && now - cached.at < STREAK_CACHE_MS) {
    return cached.streak;
  }

  const existing = streakInflight.get(key);
  if (existing) return existing;

  const pending = (async (): Promise<number> => {
    try {
      const streak = await withArcRpc(
        async (provider) => {
          const gm = new ethers.Contract(DAILY_GM_ADDRESS, DAILY_GM_ABI, provider);
          const raw = (await gm.getEffectiveStreak(checksummed)) as bigint;
          const days = Number(raw);
          return Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
        },
        { timeoutMs: 3_500, maxAttempts: 2 }
      );
      rememberStreak(key, streak);
      return streak;
    } catch (error) {
      console.error("Daily GM effective streak read failed:", error);
      if (cached) {
        return cached.streak;
      }
      return 0;
    }
  })().finally(() => {
    if (streakInflight.get(key) === pending) {
      streakInflight.delete(key);
    }
  });

  streakInflight.set(key, pending);
  return pending;
}

/**
 * Server sets the partner fee from the on-chain consecutive streak.
 * Never attaches `feeBps > 0` when `spotOnly` is true or `trader` is omitted.
 */
export async function withProtocolFee(body: QuoteFields & { sender?: string }): Promise<QuoteFields> {
  const base = {
    chainId: ARC_CHAIN_ID,
    tokenIn: body.tokenIn,
    tokenOut: body.tokenOut,
    amountIn: body.amountIn,
    slippageBps: body.slippageBps,
  };

  if (body.spotOnly === true) {
    return { ...base, feeBps: 0 };
  }

  const recipient = readFeeRecipient();
  const rawTrader = body.trader || body.sender;
  const trader = rawTrader && ethers.isAddress(rawTrader) ? ethers.getAddress(rawTrader) : "";
  if (!trader || !recipient) {
    return { ...base, feeBps: 0 };
  }

  const feeBps = feeBpsForStreak(await readGmStreak(trader));
  if (feeBps === 0) return { ...base, feeBps: 0 };
  return { ...base, feeBps, feeRecipient: recipient };
}

// ============================================================================
// Global Quote Cache (6s TTL), Single-Flight Dedupe & Shared 429 Backoff Retry
// ============================================================================

const QUOTE_CACHE_MAX = 300;
const quoteCache = globalCacheStore.quoteCache;
const quoteInflight = globalCacheStore.quoteInflight;

export function quoteCacheKey(
  body: Pick<QuoteFields, "tokenIn" | "tokenOut" | "amountIn">
): string {
  return [
    body.tokenIn.trim().toLowerCase(),
    body.tokenOut.trim().toLowerCase(),
    body.amountIn.trim(),
  ].join(":");
}

export function getCachedAchswapQuote(
  body: Pick<QuoteFields, "tokenIn" | "tokenOut" | "amountIn">
): AchswapProxyResult | null {
  const key = quoteCacheKey(body);
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.at < QUOTE_CACHE_MS) {
    return cached.result;
  }
  return null;
}

function rememberQuote(key: string, result: AchswapProxyResult) {
  if (result.status < 200 || result.status >= 300) return;
  const now = Date.now();
  if (quoteCache.size >= QUOTE_CACHE_MAX && !quoteCache.has(key)) {
    for (const [k, v] of quoteCache) {
      if (now - v.at >= QUOTE_CACHE_MS) {
        quoteCache.delete(k);
      }
    }
    if (quoteCache.size >= QUOTE_CACHE_MAX) {
      const oldest = quoteCache.keys().next().value;
      if (oldest) quoteCache.delete(oldest);
    }
  }
  quoteCache.set(key, { at: now, result });
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error("Aborted");
      err.name = "AbortError";
      reject(err);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      const err = new Error("Aborted");
      err.name = "AbortError";
      reject(err);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchAchswapWithRetry(
  path: "quote" | "swap",
  body: QuoteFields | SwapFields,
  signal?: AbortSignal
): Promise<AchswapProxyResult> {
  const backoff = [0, 400, 900];
  let last: AchswapProxyResult = {
    status: 429,
    body: { error: { code: "RATE_LIMITED", message: "Routing engine is busy. Try again." } },
  };
  for (let attempt = 0; attempt < backoff.length; attempt++) {
    const waitMs = Math.max(backoff[attempt], attempt > 0 ? last.retryAfterMs ?? 0 : 0);
    if (waitMs > 0) await sleepWithAbort(waitMs, signal);
    last = await postAchswap(path, body, signal);
    if (last.status !== 429) return last;
  }
  return last;
}

export async function postAchswapQuote(
  body: QuoteFields,
  signal?: AbortSignal
): Promise<AchswapProxyResult> {
  if (signal?.aborted) {
    const error = new Error("Aborted");
    error.name = "AbortError";
    throw error;
  }

  const key = quoteCacheKey(body);
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.at < QUOTE_CACHE_MS) return cached.result;

  let pending = quoteInflight.get(key);
  if (!pending) {
    pending = fetchAchswapWithRetry("quote", body)
      .then((result) => {
        rememberQuote(key, result);
        return result;
      })
      .finally(() => {
        if (quoteInflight.get(key) === pending) quoteInflight.delete(key);
      });
    quoteInflight.set(key, pending);
  }

  if (!signal) return pending;

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      reject(error);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    pending!.then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

export async function postAchswapSwap(
  body: SwapFields,
  signal?: AbortSignal
): Promise<AchswapProxyResult> {
  return fetchAchswapWithRetry("swap", body, signal);
}

export function isPartnerFeeRejection(result: AchswapProxyResult): boolean {
  if (result.status !== 400 && result.status !== 422) return false;
  const record = asRecord(result.body);
  const err = asRecord(record?.error);
  const code = typeof err?.code === "string" ? err.code : typeof record?.code === "string" ? record.code : "";
  if (/^(NO_ROUTE|SIMULATION_FAILED|INSUFFICIENT_LIQUIDITY)$/i.test(code.trim())) {
    return false;
  }

  const parts = [
    code,
    typeof err?.message === "string" ? err.message : "",
    typeof err?.reason === "string" ? err.reason : "",
    typeof err?.field === "string" ? err.field : "",
    typeof record?.message === "string" ? record.message : "",
    Array.isArray(err?.details) ? JSON.stringify(err.details) : "",
    Array.isArray(record?.issues) ? JSON.stringify(record.issues) : "",
  ].join(" ");

  if (/\b(no[_\s-]?route|simulation[_\s-]?failed)\b/i.test(parts)) {
    return false;
  }

  return /\b(fee|feebps|fee_bps|feerecipient|fee_recipient|partner|partnerbps|partner_bps)\b/i.test(parts);
}

// ============================================================================
// Per-IP Sliding-Window Rate Limiter (120 req / 60s)
// ============================================================================

const ipBuckets = globalCacheStore.ipBuckets;
const MAX_TRACKED_IPS = 2_000;

function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "local";
}

export function checkAchswapRateLimit(
  request: Request
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const ip = extractClientIp(request);
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  if (ipBuckets.size >= MAX_TRACKED_IPS && !ipBuckets.has(ip)) {
    for (const [key, timestamps] of ipBuckets) {
      const filtered = timestamps.filter((t) => t > windowStart);
      if (filtered.length === 0) {
        ipBuckets.delete(key);
      } else {
        ipBuckets.set(key, filtered);
      }
    }
    if (ipBuckets.size >= MAX_TRACKED_IPS) {
      const oldestIp = ipBuckets.keys().next().value;
      if (oldestIp) ipBuckets.delete(oldestIp);
    }
  }

  const recent = (ipBuckets.get(ip) ?? []).filter((t) => t > windowStart);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldestInWindow = recent[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + RATE_LIMIT_WINDOW_MS - now) / 1000));
    ipBuckets.set(ip, recent);
    return { ok: false, retryAfterSeconds };
  }

  recent.push(now);
  ipBuckets.set(ip, recent);
  return { ok: true };
}

// ============================================================================
// Request Payload Validation
// ============================================================================

export function parseQuoteBody(
  input: unknown
): { ok: true; value: QuoteFields } | { ok: false; message: string } {
  const body = asRecord(input);
  if (!body) return { ok: false, message: "Expected a JSON object." };

  const chainId = body.chainId === undefined ? 5042 : body.chainId;
  if (chainId !== 5042) return { ok: false, message: "chainId must be 5042." };

  const tokenIn = readAddress(body.tokenIn, "tokenIn");
  if (!tokenIn.ok) return tokenIn;
  const tokenOut = readAddress(body.tokenOut, "tokenOut");
  if (!tokenOut.ok) return tokenOut;
  if (tokenIn.value.toLowerCase() === tokenOut.value.toLowerCase()) {
    return { ok: false, message: "tokenIn and tokenOut must be different." };
  }

  const amountIn = readAmount(body.amountIn);
  if (!amountIn.ok) return amountIn;

  if (
    body.feeBps !== undefined &&
    (typeof body.feeBps !== "number" ||
      !Number.isInteger(body.feeBps) ||
      body.feeBps < 0 ||
      body.feeBps > 100)
  ) {
    return {
      ok: false,
      message: "feeBps must be an integer from 0 to 100. The server sets the applied fee.",
    };
  }

  const slippageBps = readSlippage(body.slippageBps);
  if (!slippageBps.ok) return slippageBps;

  if (body.spotOnly !== undefined && typeof body.spotOnly !== "boolean") {
    return { ok: false, message: "spotOnly must be a boolean when provided." };
  }
  const spotOnly = body.spotOnly === true;

  let trader: string | undefined;
  if (!spotOnly && body.trader !== undefined) {
    const parsedTrader = readAddress(body.trader, "trader");
    if (!parsedTrader.ok) return parsedTrader;
    trader = parsedTrader.value;
  }

  return {
    ok: true,
    value: {
      chainId: 5042,
      tokenIn: tokenIn.value,
      tokenOut: tokenOut.value,
      amountIn: amountIn.value,
      feeBps: 0,
      slippageBps: slippageBps.value,
      ...(spotOnly ? { spotOnly: true } : {}),
      ...(trader ? { trader } : {}),
    },
  };
}

export function parseSwapBody(
  input: unknown
): { ok: true; value: SwapFields } | { ok: false; message: string } {
  const quote = parseQuoteBody(input);
  if (!quote.ok) return quote;
  const body = asRecord(input);
  if (!body) return { ok: false, message: "Expected a JSON object." };
  const sender = readAddress(body.sender, "sender");
  if (!sender.ok) return sender;
  const recipient = body.recipient === undefined ? sender : readAddress(body.recipient, "recipient");
  if (!recipient.ok) return recipient;
  return {
    ok: true,
    value: {
      ...quote.value,
      spotOnly: false,
      sender: sender.value,
      recipient: recipient.value,
    },
  };
}

export function isRequestAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

// ============================================================================
// Live Achswap Token Discovery Proxy (Top + Search + On-Chain 0x Lookup)
// ============================================================================

const tokenCache = globalCacheStore.tokenCache;
const tokenInflight = globalCacheStore.tokenInflight;
const TOKEN_CACHE_MAX = 120;

const CANONICAL_PRIORITY: Record<string, number> = {
  "0x3600000000000000000000000000000000000000": 0, // USDC
  "0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1": 1, // EURC
  "0x171a4217b86a807a64eb94757db6849fb4bdbaa0": 2, // cirBTC
  "0x128cc466b61f542da60c70e3aa11c10e19b84edb": 3, // WETH
  "0x178b01f61cbea1d2a5581fe1621be607835ec349": 4, // XAUM
};

function normalizeTokenLogo(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || /unknown-token/i.test(trimmed)) return null;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  if (trimmed.startsWith("/")) return `${ACHSWAP_ORIGIN}${trimmed}`;
  return null;
}

function readOptionalFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDiscoveryToken(item: unknown): NormalizedAchswapToken | null {
  const rec = asRecord(item);
  if (!rec || typeof rec.address !== "string" || !ethers.isAddress(rec.address)) return null;
  const address = ethers.getAddress(rec.address);
  if (address === ethers.ZeroAddress) return null;

  const chainId =
    typeof rec.chainId === "number" && Number.isInteger(rec.chainId) ? rec.chainId : ARC_CHAIN_ID;
  if (chainId !== ARC_CHAIN_ID) return null;

  const symbol = typeof rec.symbol === "string" ? rec.symbol.trim().slice(0, 24) : "";
  const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 64) : symbol;
  const decimals =
    typeof rec.decimals === "number" &&
    Number.isInteger(rec.decimals) &&
    rec.decimals >= 0 &&
    rec.decimals <= 36
      ? rec.decimals
      : 18;
  if (!symbol) return null;

  return {
    address,
    symbol,
    name: name || symbol,
    decimals,
    logoURI: normalizeTokenLogo(rec.logoURI ?? rec.logoUrl ?? rec.icon),
    verified: rec.verified === true,
    chainId: ARC_CHAIN_ID,
    priceUsd: readOptionalFiniteNumber(rec.priceUsd),
    liquidityUsd: readOptionalFiniteNumber(rec.liquidityUsd),
    volumeUsd24h: readOptionalFiniteNumber(rec.volumeUsd24h),
    priceChangePct24h: readOptionalFiniteNumber(rec.priceChangePct24h),
  };
}

function sortAndDedupeTokens(tokens: NormalizedAchswapToken[]): NormalizedAchswapToken[] {
  const byAddr = new Map<string, NormalizedAchswapToken>();
  for (const tok of tokens) {
    const key = tok.address.toLowerCase();
    const existing = byAddr.get(key);
    if (!existing || (!existing.verified && tok.verified) || (!existing.logoURI && tok.logoURI)) {
      byAddr.set(key, tok);
    }
  }

  return Array.from(byAddr.values()).sort((a, b) => {
    const pa = CANONICAL_PRIORITY[a.address.toLowerCase()];
    const pb = CANONICAL_PRIORITY[b.address.toLowerCase()];
    if (pa !== undefined || pb !== undefined) {
      return (pa ?? 999) - (pb ?? 999);
    }
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    const liqDiff = (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0);
    if (liqDiff !== 0) return liqDiff;
    return a.symbol.localeCompare(b.symbol);
  });
}

async function resolveOnChainErc20Metadata(address: string): Promise<NormalizedAchswapToken | null> {
  if (!ethers.isAddress(address)) return null;
  const checksummed = ethers.getAddress(address);
  if (checksummed === ethers.ZeroAddress) return null;

  try {
    return await withArcRpc(
      async (provider) => {
        const code = await provider.getCode(checksummed);
        if (!code || code === "0x") return null;
        const tok = new ethers.Contract(
          checksummed,
          [
            "function symbol() view returns (string)",
            "function name() view returns (string)",
            "function decimals() view returns (uint8)",
          ],
          provider
        );
        const [symbol, name, decimals] = await Promise.all([
          tok.symbol() as Promise<string>,
          tok.name().catch(() => "") as Promise<string>,
          tok.decimals() as Promise<bigint | number>,
        ]);
        const cleanSymbol = String(symbol || "").trim().slice(0, 24);
        const cleanDecimals = Number(decimals);
        if (!cleanSymbol || !Number.isInteger(cleanDecimals) || cleanDecimals < 0 || cleanDecimals > 36) {
          return null;
        }
        return {
          address: checksummed,
          symbol: cleanSymbol,
          name: String(name || cleanSymbol).trim().slice(0, 64) || cleanSymbol,
          decimals: cleanDecimals,
          logoURI: null,
          verified: false,
          chainId: ARC_CHAIN_ID,
          priceUsd: null,
          liquidityUsd: null,
          volumeUsd24h: null,
          priceChangePct24h: null,
        };
      },
      { timeoutMs: 4_000, maxAttempts: 2 }
    );
  } catch {
    return null;
  }
}

function rememberTokenList(key: string, tokens: NormalizedAchswapToken[], ttlMs: number) {
  const now = Date.now();
  if (tokenCache.size >= TOKEN_CACHE_MAX && !tokenCache.has(key)) {
    for (const [k, v] of tokenCache) {
      if (now - v.at >= v.ttlMs) tokenCache.delete(k);
    }
    if (tokenCache.size >= TOKEN_CACHE_MAX) {
      const oldest = tokenCache.keys().next().value;
      if (oldest) tokenCache.delete(oldest);
    }
  }
  tokenCache.set(key, { at: now, ttlMs, tokens });
}

export async function fetchAchswapTokenList(
  rawQuery = "",
  signal?: AbortSignal
): Promise<{ tokens: NormalizedAchswapToken[]; source: string }> {
  const cleanQuery = rawQuery.trim().slice(0, 64);
  const key = cleanQuery ? `search:${cleanQuery.toLowerCase()}` : "top";
  const ttlMs = cleanQuery ? TOKEN_SEARCH_CACHE_MS : TOKEN_TOP_CACHE_MS;
  const cached = tokenCache.get(key);
  if (cached && Date.now() - cached.at < cached.ttlMs) {
    return { tokens: cached.tokens, source: "cache" };
  }

  let pending = tokenInflight.get(key);
  if (!pending) {
    pending = (async (): Promise<NormalizedAchswapToken[]> => {
      const apiKey = readAchswapApiKey();
      const url = cleanQuery
        ? `${ACHSWAP_TOKEN_DISCOVERY_URL}?action=search&chainId=${ARC_CHAIN_ID}&q=${encodeURIComponent(cleanQuery)}`
        : `${ACHSWAP_TOKEN_DISCOVERY_URL}?action=top&chainId=${ARC_CHAIN_ID}`;

      const merged = createMergedAbortSignal(ACHSWAP_UPSTREAM_TIMEOUT_MS);
      let discovered: NormalizedAchswapToken[] = [];

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}`, "x-api-key": apiKey } : {}),
          },
          cache: "no-store",
          signal: merged.signal,
        });
        if (res.ok) {
          const payload = (await res.json().catch(() => null)) as unknown;
          const rec = asRecord(payload);
          const rawItems = Array.isArray(rec?.tokens)
            ? rec.tokens
            : Array.isArray(payload)
              ? payload
              : [];
          discovered = rawItems
            .map(normalizeDiscoveryToken)
            .filter((t): t is NormalizedAchswapToken => t !== null);
        }
      } catch {
        if (cached) return cached.tokens;
      } finally {
        merged.cleanup();
      }

      // If the user searched a valid Arc Mainnet ERC-20 address not present in discovery, read metadata live on-chain
      if (cleanQuery && ethers.isAddress(cleanQuery)) {
        const lowerQ = cleanQuery.toLowerCase();
        const exists = discovered.some((t) => t.address.toLowerCase() === lowerQ);
        if (!exists) {
          const onChainToken = await resolveOnChainErc20Metadata(cleanQuery);
          if (onChainToken) discovered.push(onChainToken);
        }
      }

      const sorted = sortAndDedupeTokens(discovered);
      if (sorted.length > 0 || cleanQuery) {
        rememberTokenList(key, sorted, ttlMs);
      }
      return sorted;
    })().finally(() => {
      if (tokenInflight.get(key) === pending) {
        tokenInflight.delete(key);
      }
    });
    tokenInflight.set(key, pending);
  }

  if (!signal) {
    return { tokens: await pending, source: "live" };
  }

  const tokens = await new Promise<NormalizedAchswapToken[]>((resolve, reject) => {
    if (signal.aborted) {
      const err = new Error("Aborted");
      err.name = "AbortError";
      reject(err);
      return;
    }
    const onAbort = () => {
      const err = new Error("Aborted");
      err.name = "AbortError";
      reject(err);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    pending!.then(
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

  return { tokens, source: "live" };
}

function readAddress(
  value: unknown,
  field: string
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== "string" || !ethers.isAddress(value)) {
    return { ok: false, message: `${field} must be an address.` };
  }
  return { ok: true, value: ethers.getAddress(value) };
}

function readAmount(value: unknown): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value) || value === "0") {
    return { ok: false, message: "amountIn must be a positive integer string." };
  }
  return { ok: true, value };
}

function readSlippage(value: unknown): { ok: true; value: number } | { ok: false; message: string } {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > ACHSWAP_MAX_SLIPPAGE_BPS
  ) {
    return {
      ok: false,
      message: `slippageBps must be an integer from 0 to ${ACHSWAP_MAX_SLIPPAGE_BPS}.`,
    };
  }
  return { ok: true, value };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
