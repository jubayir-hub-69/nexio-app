import { ethers } from "ethers";
import { ACHSWAP_API_BASE, ACHSWAP_MAX_SLIPPAGE_BPS } from "@/lib/achswap";
import { ARC_CHAIN_ID, DAILY_GM_ABI, DAILY_GM_ADDRESS, getArcReadProvider } from "@/lib/contracts";
import { DEFAULT_FEE_RECIPIENT, feeBpsForStreak } from "@/lib/gm-tiers";

export type AchswapProxyResult = {
  status: number;
  body: unknown;
  retryAfterMs?: number;
};

type QuoteFields = {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  feeBps: number;
  slippageBps: number;
  feeRecipient?: string;
  trader?: string;
};

type SwapFields = QuoteFields & {
  sender: string;
  recipient: string;
};

export function readAchswapApiKey(): string {
  return (process.env.ACHSWAP_API_KEY || "").trim();
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
          message: "Set ACHSWAP_API_KEY on the server before swapping.",
        },
      },
    };
  }

  const response = await fetch(`${ACHSWAP_API_BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = {
        error: {
          code: "INTERNAL",
          message: "Achswap returned an unreadable response.",
        },
      };
    }
  }

  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
  const retryAfterMs = Number.isFinite(retryAfterSeconds) ? Math.min(5_000, Math.max(0, retryAfterSeconds * 1000)) : 0;

  return {
    status: response.status,
    body: parsed ?? { error: { code: "INTERNAL", message: "Empty Achswap response." } },
    retryAfterMs,
  };
}

const QUOTE_CACHE_MS = 3_000;
const QUOTE_CACHE_MAX = 200;
const quoteCache = new Map<string, { at: number; result: AchswapProxyResult }>();
const quoteInflight = new Map<string, Promise<AchswapProxyResult>>();

function quoteCacheKey(body: QuoteFields): string {
  return [
    body.chainId,
    body.tokenIn.toLowerCase(),
    body.tokenOut.toLowerCase(),
    body.amountIn,
    body.feeBps,
    (body.feeRecipient || "").toLowerCase(),
    body.slippageBps,
  ].join(":");
}

export function readFeeRecipient(): string {
  const configured = (process.env.ACHSWAP_FEE_RECIPIENT || DEFAULT_FEE_RECIPIENT).trim();
  return ethers.isAddress(configured) ? ethers.getAddress(configured) : ethers.getAddress(DEFAULT_FEE_RECIPIENT);
}

export async function readGmStreak(trader: string): Promise<number> {
  try {
    const gm = new ethers.Contract(DAILY_GM_ADDRESS, DAILY_GM_ABI, getArcReadProvider());
    const streak = (await gm.streak(trader)) as bigint;
    const days = Number(streak);
    return Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
  } catch (error) {
    console.error("Daily GM streak read failed:", error);
    return 0;
  }
}

/** Server sets the partner fee from the on-chain streak. Client-supplied feeBps is ignored. */
export async function withProtocolFee(body: QuoteFields & { sender?: string }): Promise<QuoteFields> {
  const recipient = readFeeRecipient();
  const rawTrader = body.trader || body.sender;
  const trader = rawTrader && ethers.isAddress(rawTrader) ? ethers.getAddress(rawTrader) : "";
  const base = {
    chainId: ARC_CHAIN_ID,
    tokenIn: body.tokenIn,
    tokenOut: body.tokenOut,
    amountIn: body.amountIn,
    slippageBps: body.slippageBps,
  };
  if (!trader || !recipient) {
    return { ...base, feeBps: 0 };
  }
  const feeBps = feeBpsForStreak(await readGmStreak(trader));
  if (feeBps === 0) return { ...base, feeBps: 0 };
  return { ...base, feeBps, feeRecipient: recipient };
}

function rememberQuote(key: string, result: AchswapProxyResult) {
  if (result.status < 200 || result.status >= 300) return;
  if (quoteCache.size >= QUOTE_CACHE_MAX) {
    const oldest = quoteCache.keys().next().value;
    if (oldest) quoteCache.delete(oldest);
  }
  quoteCache.set(key, { at: Date.now(), result });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchQuoteWithRetry(body: QuoteFields): Promise<AchswapProxyResult> {
  const backoff = [0, 400, 900];
  let last: AchswapProxyResult = {
    status: 429,
    body: { error: { code: "RATE_LIMITED", message: "Achswap is busy. Try again." } },
  };
  for (let attempt = 0; attempt < backoff.length; attempt++) {
    const waitMs = Math.max(backoff[attempt], attempt > 0 ? last.retryAfterMs ?? 0 : 0);
    if (waitMs > 0) await sleep(waitMs);
    last = await postAchswap("quote", body);
    if (last.status !== 429) return last;
  }
  return last;
}

/** Identical quotes share one upstream call and a 3-second result. Swap requests are never cached. */
export async function postAchswapQuote(body: QuoteFields, signal?: AbortSignal): Promise<AchswapProxyResult> {
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
    pending = fetchQuoteWithRetry(body)
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

export function parseQuoteBody(input: unknown): { ok: true; value: QuoteFields } | { ok: false; message: string } {
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

  if (body.feeBps !== undefined && (typeof body.feeBps !== "number" || !Number.isInteger(body.feeBps) || body.feeBps < 0 || body.feeBps > 100)) {
    return { ok: false, message: "feeBps must be an integer from 0 to 100. The server sets the applied fee." };
  }

  const slippageBps = readSlippage(body.slippageBps);
  if (!slippageBps.ok) return slippageBps;

  let trader: string | undefined;
  if (body.trader !== undefined) {
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
      ...(trader ? { trader } : {}),
    },
  };
}

export function parseSwapBody(input: unknown): { ok: true; value: SwapFields } | { ok: false; message: string } {
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
      sender: sender.value,
      recipient: recipient.value,
    },
  };
}

export function isRequestAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function readAddress(value: unknown, field: string): { ok: true; value: string } | { ok: false; message: string } {
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
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > ACHSWAP_MAX_SLIPPAGE_BPS) {
    return { ok: false, message: `slippageBps must be an integer from 0 to ${ACHSWAP_MAX_SLIPPAGE_BPS}.` };
  }
  return { ok: true, value };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
