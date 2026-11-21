import { ethers } from "ethers";

export const ARC_RPC_CHAIN_ID = 5042;
export const DEFAULT_ARC_RPC_URL = "https://rpc.mainnet.arc.io";
export const DEFAULT_RPC_TIMEOUT_MS = 12_000;
export const RPC_QUARANTINE_MS = 30_000;

export class RpcTransportError extends Error {
  readonly code: string;
  readonly endpoint?: string;
  readonly attempts: number;
  readonly causeError?: unknown;

  constructor(
    message: string,
    options?: {
      code?: string;
      endpoint?: string;
      attempts?: number;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "RpcTransportError";
    this.code = options?.code ?? "RPC_UNAVAILABLE";
    this.endpoint = options?.endpoint;
    this.attempts = options?.attempts ?? 1;
    this.causeError = options?.cause;
  }
}

export function isRpcTransportError(error: unknown): error is RpcTransportError {
  return error instanceof RpcTransportError || (error instanceof Error && error.name === "RpcTransportError");
}

type EndpointState = {
  url: string;
  provider: ethers.JsonRpcProvider;
  quarantinedUntil: number;
  consecutiveFailures: number;
  lastLatencyMs: number | null;
  lastHealthyAt: number;
};

export type RpcHealthEntry = {
  url: string;
  healthy: boolean;
  quarantinedUntil: number;
  lastLatencyMs: number | null;
  consecutiveFailures: number;
};

const endpointPool = new Map<string, EndpointState>();
let latestLatencyMs: number | null = null;

function parseConfiguredUrls(): string[] {
  const rawList = [
    typeof process !== "undefined" ? process.env.ARC_RPC_URLS : undefined,
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ARC_RPC_URLS : undefined,
  ]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join(",");

  const seen = new Set<string>();
  const urls: string[] = [];

  for (const part of rawList.split(",")) {
    const cleaned = part.trim().replace(/\/+$/, "");
    if (!cleaned || !/^https?:\/\//i.test(cleaned)) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(cleaned);
  }

  if (urls.length === 0) {
    urls.push(DEFAULT_ARC_RPC_URL);
  }
  return urls;
}

export function getArcRpcUrls(): string[] {
  return parseConfiguredUrls();
}

function getOrCreateEndpoint(url: string): EndpointState {
  const existing = endpointPool.get(url);
  if (existing) return existing;

  const network = new ethers.Network("arc-mainnet", ARC_RPC_CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(url, network, {
    staticNetwork: network,
    batchMaxCount: 1,
  });

  const created: EndpointState = {
    url,
    provider,
    quarantinedUntil: 0,
    consecutiveFailures: 0,
    lastLatencyMs: null,
    lastHealthyAt: 0,
  };
  endpointPool.set(url, created);
  return created;
}

function orderedEndpoints(now = Date.now()): EndpointState[] {
  const states = parseConfiguredUrls().map((url) => getOrCreateEndpoint(url));
  const healthy: EndpointState[] = [];
  const quarantined: EndpointState[] = [];

  for (const state of states) {
    if (state.quarantinedUntil <= now) {
      healthy.push(state);
    } else {
      quarantined.push(state);
    }
  }

  healthy.sort((a, b) => {
    if (a.consecutiveFailures !== b.consecutiveFailures) {
      return a.consecutiveFailures - b.consecutiveFailures;
    }
    const latA = a.lastLatencyMs ?? 250;
    const latB = b.lastLatencyMs ?? 250;
    return latA - latB;
  });

  quarantined.sort((a, b) => a.quarantinedUntil - b.quarantinedUntil);

  return [...healthy, ...quarantined];
}

export function getArcReadProvider(): ethers.JsonRpcProvider {
  const candidates = orderedEndpoints();
  return candidates[0].provider;
}

export function getLatestRpcLatencyMs(): number | null {
  return latestLatencyMs;
}

export function getRpcHealthSnapshot(): RpcHealthEntry[] {
  const now = Date.now();
  return parseConfiguredUrls().map((url) => {
    const state = getOrCreateEndpoint(url);
    return {
      url: state.url,
      healthy: state.quarantinedUntil <= now,
      quarantinedUntil: state.quarantinedUntil,
      lastLatencyMs: state.lastLatencyMs,
      consecutiveFailures: state.consecutiveFailures,
    };
  });
}

function isAbortLike(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isDeterministicContractRevert(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    code?: string | number;
    data?: unknown;
    revert?: unknown;
    reason?: unknown;
    shortMessage?: string;
    message?: string;
  };

  if (err.code === "CALL_EXCEPTION") {
    if (typeof err.data === "string" && err.data.startsWith("0x") && err.data.length >= 10) {
      return true;
    }
    if (err.revert || (typeof err.reason === "string" && err.reason.length > 0)) {
      return true;
    }
    const text = `${err.shortMessage ?? ""} ${err.message ?? ""}`;
    if (/execution reverted/i.test(text) && !/timeout|429|rate.?limit|502|503|504|fetch failed|network/i.test(text)) {
      return true;
    }
  }
  return false;
}

export function isRpcBlockRangeLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    code?: string | number;
    shortMessage?: string;
    message?: string;
    info?: { error?: { code?: number; message?: string } };
  };
  const rpcCode = err.info?.error?.code;
  if (rpcCode === -32005 || rpcCode === -32602) return true;
  const text = `${err.shortMessage ?? ""} ${err.message ?? ""} ${err.info?.error?.message ?? ""}`;
  return /block\s*range|max.*blocks|exceed.*block|exceed.*range|exceed.*limit|limit.*exceed|query returned more than|too many results|log response size|range is too large/i.test(
    text
  );
}

export function isLikelyRpcTransportFailure(error: unknown): boolean {
  if (isRpcTransportError(error)) return true;
  if (isAbortLike(error)) return false;
  if (isDeterministicContractRevert(error)) return false;
  if (isRpcBlockRangeLimitError(error)) return false;

  if (!error || typeof error !== "object") return false;
  const err = error as {
    code?: string | number;
    status?: number;
    shortMessage?: string;
    message?: string;
    info?: { responseStatus?: string; error?: { code?: number; message?: string } };
  };

  const code = String(err.code ?? "");
  if (
    code === "NETWORK_ERROR" ||
    code === "SERVER_ERROR" ||
    code === "TIMEOUT" ||
    code === "UNKNOWN_ERROR" ||
    code === "BAD_DATA"
  ) {
    return true;
  }

  const statusText = `${err.status ?? ""} ${err.info?.responseStatus ?? ""} ${err.shortMessage ?? ""} ${err.message ?? ""} ${err.info?.error?.message ?? ""}`;
  return /429|500|502|503|504|rate.?limit|too many requests|timed?\s*out|fetch failed|econnreset|econnrefused|etimedout|enotfound|socket hang up|could not coalesce|missing revert data|failed to fetch/i.test(
    statusText
  );
}

function markHealthy(state: EndpointState, latencyMs: number) {
  state.quarantinedUntil = 0;
  state.consecutiveFailures = 0;
  state.lastLatencyMs = latencyMs;
  state.lastHealthyAt = Date.now();
  latestLatencyMs = latencyMs;
}

function markQuarantined(state: EndpointState) {
  state.consecutiveFailures += 1;
  state.quarantinedUntil = Date.now() + RPC_QUARANTINE_MS;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const abortErr = new Error("Aborted");
      abortErr.name = "AbortError";
      reject(abortErr);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      const abortErr = new Error("Aborted");
      abortErr.name = "AbortError";
      reject(abortErr);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function runWithTimeout<T>(
  work: () => Promise<T>,
  timeoutMs: number,
  endpoint: string,
  signal?: AbortSignal
): Promise<T> {
  if (signal?.aborted) {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    throw abortErr;
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let onAbort: (() => void) | null = null;

  const raceGuard = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new RpcTransportError(`Arc RPC timed out after ${timeoutMs}ms (${endpoint}).`, {
          code: "RPC_TIMEOUT",
          endpoint,
        })
      );
    }, timeoutMs);

    if (signal) {
      onAbort = () => {
        const abortErr = new Error("Aborted");
        abortErr.name = "AbortError";
        reject(abortErr);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });

  try {
    return await Promise.race([work(), raceGuard]);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export type WithArcRpcOptions = {
  timeoutMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
};

export async function withArcRpcTimed<T>(
  fn: (provider: ethers.JsonRpcProvider, endpoint: string) => Promise<T>,
  opts?: WithArcRpcOptions
): Promise<{ result: T; latencyMs: number; endpoint: string }> {
  const timeoutMs = Math.max(500, opts?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS);
  const candidates = orderedEndpoints();
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? Math.max(2, candidates.length));
  const backoffs = [0, 160, 420];

  let lastError: unknown = null;
  let lastEndpoint = candidates[0]?.url ?? DEFAULT_ARC_RPC_URL;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (opts?.signal?.aborted) {
      const abortErr = new Error("Aborted");
      abortErr.name = "AbortError";
      throw abortErr;
    }

    if (attempt > 0 && candidates.length === 1) {
      const delay = backoffs[Math.min(attempt, backoffs.length - 1)] + Math.floor(Math.random() * 50);
      await sleepWithAbort(delay, opts?.signal);
    }

    const state = candidates[attempt % candidates.length];
    lastEndpoint = state.url;
    const started = nowMs();

    try {
      const result = await runWithTimeout(
        () => fn(state.provider, state.url),
        timeoutMs,
        state.url,
        opts?.signal
      );
      const latencyMs = Math.max(1, Math.round(nowMs() - started));
      markHealthy(state, latencyMs);
      return { result, latencyMs, endpoint: state.url };
    } catch (error) {
      if (isAbortLike(error)) throw error;

      if (isDeterministicContractRevert(error)) {
        const latencyMs = Math.max(1, Math.round(nowMs() - started));
        markHealthy(state, latencyMs);
        throw error;
      }

      lastError = error;
      if (isLikelyRpcTransportFailure(error)) {
        markQuarantined(state);
        continue;
      }

      throw error;
    }
  }

  if (isRpcTransportError(lastError)) {
    throw new RpcTransportError(lastError.message, {
      code: lastError.code,
      endpoint: lastEndpoint,
      attempts: maxAttempts,
      cause: lastError.causeError ?? lastError,
    });
  }

  const rawMsg = lastError instanceof Error ? lastError.message : "Arc Mainnet RPC unavailable.";
  throw new RpcTransportError(`Arc Mainnet RPC unavailable after ${maxAttempts} attempts: ${rawMsg}`, {
    code: "RPC_UNAVAILABLE",
    endpoint: lastEndpoint,
    attempts: maxAttempts,
    cause: lastError,
  });
}

export async function withArcRpc<T>(
  fn: (provider: ethers.JsonRpcProvider, endpoint: string) => Promise<T>,
  opts?: WithArcRpcOptions
): Promise<T> {
  const { result } = await withArcRpcTimed(fn, opts);
  return result;
}
