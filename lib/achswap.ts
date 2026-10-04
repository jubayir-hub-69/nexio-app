import { MAX_SWAP_PRICE_IMPACT_BPS, MAX_SWAP_VALUE_LOSS_BPS, stableValueLossBps } from "@/lib/contracts";

export const ACHSWAP_API_BASE = "https://trade.achswap.app/api/v1";
export const ACHSWAP_FEE_BPS = 0;
export const ACHSWAP_MAX_SLIPPAGE_BPS = 2000;

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
  feeBps: 0;
  slippageBps: number;
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
  executor: string;
  requestId: string;
};

export type AchswapSwap = AchswapQuote & {
  tx: AchswapTransaction;
  approval: AchswapApproval | null;
};

export type StableSwapAssessment = {
  valueLossBps: number;
  blocked: boolean;
  reason: string;
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

export function describeAchswapError(error: unknown): string | null {
  if (!(error instanceof AchswapApiError)) return null;
  if (error.code === "NO_ROUTE" || /no route/i.test(error.message)) return "No route found.";
  if (error.code === "MISSING_API_KEY") return "Set NEXT_PUBLIC_ACHSWAP_API_KEY before swapping.";
  if (error.code === "UNAUTHORIZED") return "Achswap rejected the API key. Check NEXT_PUBLIC_ACHSWAP_API_KEY.";
  if (error.code === "RATE_LIMITED" || error.code === "CONCURRENCY_LIMITED") {
    return "Achswap is busy. Wait a moment and try again.";
  }
  if (error.code === "SIMULATION_FAILED") {
    return error.reason
      ? `Swap would fail (${error.reason}). Request a new quote.`
      : "Swap would fail. Request a new quote.";
  }
  return error.message.slice(0, 180) || "Achswap request failed.";
}

export function assessStableSwap(
  amountIn: bigint,
  inDecimals: number,
  amountOut: bigint,
  outDecimals: number,
  priceImpactBps: number | null
): StableSwapAssessment {
  const valueLossBps = stableValueLossBps(amountIn, inDecimals, amountOut, outDecimals);
  const impactBlocked = priceImpactBps !== null && priceImpactBps > MAX_SWAP_PRICE_IMPACT_BPS;
  const lossBlocked = valueLossBps > MAX_SWAP_VALUE_LOSS_BPS;
  let reason = "";
  if (lossBlocked) {
    reason = `Swap disabled. You would lose about ${(valueLossBps / 100).toFixed(2)}% versus the amount you pay. The pool is too thin.`;
  } else if (impactBlocked && priceImpactBps !== null) {
    reason = `Swap disabled. Price impact is ${(priceImpactBps / 100).toFixed(2)}%, above the ${(MAX_SWAP_PRICE_IMPACT_BPS / 100).toFixed(2)}% limit.`;
  }
  return { valueLossBps, blocked: impactBlocked || lossBlocked, reason };
}

export function buildQuoteRequest(input: {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  slippageBps: number;
  chainId: number;
}): AchswapQuoteRequest {
  return {
    chainId: input.chainId,
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    amountIn: input.amountIn.toString(),
    feeBps: ACHSWAP_FEE_BPS,
    slippageBps: clampSlippageBps(input.slippageBps),
  };
}

export async function requestAchswapQuote(
  input: {
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    slippageBps: number;
    chainId: number;
    signal?: AbortSignal;
  }
): Promise<AchswapQuote> {
  const payload = await postLocal("/api/achswap/quote", buildQuoteRequest(input), input.signal);
  return normalizeQuote(payload);
}

export async function requestAchswapSwap(
  input: {
    tokenIn: string;
    tokenOut: string;
    amountIn: bigint;
    slippageBps: number;
    chainId: number;
    sender: string;
    recipient: string;
    signal?: AbortSignal;
  }
): Promise<AchswapSwap> {
  const payload = await postLocal(
    "/api/achswap/swap",
    {
      ...buildQuoteRequest(input),
      sender: input.sender,
      recipient: input.recipient,
    },
    input.signal
  );
  return normalizeSwap(payload);
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
    throw new AchswapApiError(0, "NETWORK", "Could not reach Achswap. Try again.");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const record = asRecord(payload);
    const err = asRecord(record?.error);
    const code = typeof err?.code === "string" ? err.code : "REQUEST_FAILED";
    const message = typeof err?.message === "string" ? err.message : "Achswap request failed.";
    const reason = typeof err?.reason === "string" ? err.reason : "";
    throw new AchswapApiError(response.status, code, message, reason);
  }
  return payload;
}

export function normalizeQuote(payload: unknown): AchswapQuote {
  const body = asRecord(payload);
  if (!body) throw new AchswapApiError(502, "INVALID_RESPONSE", "Achswap returned an unreadable quote.");
  const amountOut = readAmount(body.amountOut, "amountOut");
  const minAmountOut = readAmount(body.minAmountOut ?? body.amountOutMin, "minAmountOut");
  return {
    amountOut,
    minAmountOut,
    priceImpactBps: readImpact(body.priceImpactBps),
    executor: readExecutor(body),
    requestId: typeof body.requestId === "string" ? body.requestId : "",
  };
}

export function normalizeSwap(payload: unknown): AchswapSwap {
  const quote = normalizeQuote(payload);
  const body = asRecord(payload);
  if (!body) throw new AchswapApiError(502, "INVALID_RESPONSE", "Achswap returned an unreadable swap.");
  return {
    ...quote,
    executor: readExecutor(body) || quote.executor,
    tx: readTransaction(body),
    approval: readApproval(body),
  };
}

function readExecutor(body: Record<string, unknown>): string {
  const approval = asRecord(body.approval);
  const candidate = body.executor ?? body.spender ?? body.approvalTarget ?? approval?.spender;
  if (typeof candidate !== "string") return "";
  const trimmed = candidate.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed) || isNativeAchswapToken(trimmed)) return "";
  return trimmed;
}

function readApproval(body: Record<string, unknown>): AchswapApproval | null {
  if (body.approval == null) return null;
  const approval = asRecord(body.approval);
  if (!approval) return null;
  if (typeof approval.token !== "string" || typeof approval.spender !== "string") return null;
  if (isNativeAchswapToken(approval.token) || isNativeAchswapToken(approval.spender)) return null;
  if (!/^0x[a-fA-F0-9]{40}$/.test(approval.token) || !/^0x[a-fA-F0-9]{40}$/.test(approval.spender)) return null;
  return {
    token: approval.token,
    spender: approval.spender,
    amount: readAmount(approval.amount, "approval.amount"),
  };
}

function readTransaction(body: Record<string, unknown>): AchswapTransaction {
  const nested = asRecord(body.tx) ?? asRecord(body.transaction);
  const source = nested && typeof nested.to === "string" ? nested : body;
  if (typeof source.to !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(source.to)) {
    throw new AchswapApiError(502, "INVALID_RESPONSE", "Achswap did not return a transaction target.");
  }
  return {
    to: source.to,
    data: readHexData(source.data),
    value: source.value === undefined ? BigInt(0) : readAmount(source.value, "value"),
    gas: source.gas === undefined || source.gas === null || source.gas === "" ? BigInt(0) : readAmount(source.gas, "gas"),
  };
}

function readHexData(value: unknown): string {
  if (typeof value !== "string") {
    throw new AchswapApiError(502, "INVALID_RESPONSE", "Achswap did not return swap calldata.");
  }
  const hex = value.trim().startsWith("0x") ? value.trim() : `0x${value.trim()}`;
  if (!/^0x[0-9a-fA-F]+$/.test(hex) || hex.length < 10) {
    throw new AchswapApiError(502, "INVALID_RESPONSE", "Achswap did not return swap calldata.");
  }
  return hex;
}

function readAmount(value: unknown, field: string): bigint {
  if (typeof value === "bigint" && value >= BigInt(0)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return BigInt(trimmed);
    if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
  }
  throw new AchswapApiError(502, "INVALID_RESPONSE", `Achswap response did not include ${field}.`);
}

function readImpact(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
