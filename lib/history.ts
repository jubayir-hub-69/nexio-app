import { ethers } from "ethers";
import {
  ADDRESS_BOOK_ABI,
  ADDRESS_BOOK_ADDRESS,
  ANS_ABI,
  ANS_CONTRACT_ADDRESS,
  ARC_EXPLORER,
  DAILY_GM_ABI,
  DAILY_GM_ADDRESS,
  ERC20_ABI,
  EURC_ADDRESS,
  EURC_DECIMALS,
  EURC_VAULT_ADDRESS,
  LEGACY_DAILY_GM_ADDRESS,
  LEGACY_EURC_VAULT_ADDRESS,
  LEGACY_USDC_VAULT_ADDRESS,
  NEXIO_SWAP_ADDRESS,
  NLP_DECIMALS,
  ROUTER_ADDRESS,
  USDC_ERC20_ADDRESS,
  USDC_VAULT_ABI,
  USDC_VAULT_ADDRESS,
  WUSDC_DECIMALS,
  fetchPairState,
  formatPretty,
  isRpcTransportError,
  resolveAddressToDomain,
  withArcRpc,
} from "@/lib/contracts";

export const DEFAULT_HISTORY_WINDOW_BLOCKS = 5_000;
export const ANALYTICS_MAX_CHUNK_BLOCKS = 5_000;
const MIN_SPLIT_RANGE_BLOCKS = 64;
const MAX_ADAPTIVE_SPLIT_DEPTH = 4;
const BLOCK_TS_CACHE_MAX = 2_500;
const MAX_CHUNKS_PER_SCAN = 10;
const CHUNK_RATE_LIMIT_DELAY_MS = 35;
const TIMEFRAME_CACHE_MS = 60_000;
const BLOCK_BOUNDARY_CACHE_MS = 300_000;

let learnedSafeChunkBlocks = ANALYTICS_MAX_CHUNK_BLOCKS;

type TrackedTokenMeta = {
  address: string;
  symbol: string;
  decimals: number;
};

// Canonical verified Arc Mainnet (5042) tokens indexed in eth_getLogs history
const TRACKED_HISTORY_TOKENS: readonly TrackedTokenMeta[] = [
  { address: USDC_ERC20_ADDRESS, symbol: "USDC", decimals: WUSDC_DECIMALS },
  { address: EURC_ADDRESS, symbol: "EURC", decimals: EURC_DECIMALS },
  { address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0", symbol: "cirBTC", decimals: 8 },
  { address: "0x128cC466B61f542da60c70e3aA11c10e19B84EDB", symbol: "WETH", decimals: 18 },
  { address: "0x178b01f61CBeA1D2a5581Fe1621Be607835EC349", symbol: "XAUM", decimals: 18 },
] as const;

const TRACKED_TOKEN_BY_LOWER = new Map<string, TrackedTokenMeta>(
  TRACKED_HISTORY_TOKENS.map((t) => [t.address.toLowerCase(), t])
);

export type OnChainHistoryKind =
  | "send"
  | "receive"
  | "swap"
  | "vault_stake"
  | "vault_withdraw"
  | "nlp_claim"
  | "lp_add"
  | "lp_remove"
  | "gm_checkin"
  | "domain_register"
  | "contact_saved"
  | "contact_removed";

export type OnChainHistoryEntry = {
  id: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  timestamp: number | null;
  kind: OnChainHistoryKind;
  label: string;
  direction: "in" | "out" | "protocol";
  tokenSymbol: string | null;
  amountRaw: bigint | null;
  amountExact: string | null;
  amountFormatted: string | null;
  decimals: number | null;
  counterparty: string | null;
  streak?: number;
  domain?: string | null;
  explorerUrl: string;
};

export type OnChainHistoryResult = {
  entries: OnChainHistoryEntry[];
  nextCursorBlock: number | null;
  latestBlock: number;
  scannedFromBlock: number;
  scannedToBlock: number;
};

export type FetchOnChainHistoryOptions = {
  toBlock?: number;
  windowBlocks?: number;
  signal?: AbortSignal;
};

export type StablecoinFlowKind =
  | "send"
  | "receive"
  | "swap"
  | "vault_stake"
  | "vault_withdraw"
  | "lp_add"
  | "lp_remove";

export type StablecoinFlowEvent = {
  id: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  tokenSymbol: "USDC" | "EURC";
  kind: StablecoinFlowKind;
  direction: "in" | "out";
  amount6: bigint;
};

export type StablecoinFlowHistoryResult = {
  flows: StablecoinFlowEvent[];
  latestBlock: number;
  latestTimestamp: number;
  fromBlock: number;
  toBlock: number;
  partial: boolean;
};

const erc20Iface = new ethers.Interface(ERC20_ABI);
const gmIface = new ethers.Interface(DAILY_GM_ABI);
const ansIface = new ethers.Interface(ANS_ABI);
const vaultIface = new ethers.Interface(USDC_VAULT_ABI);
const addressBookIface = new ethers.Interface(ADDRESS_BOOK_ABI);

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const CHECKED_IN_TOPIC = ethers.id("CheckedIn(address,uint256,uint256)");
const DOMAIN_REGISTERED_TOPIC = ethers.id("DomainRegistered(string,address)");
const NLP_CLAIMED_TOPIC = ethers.id("NLPClaimed(address,uint256,uint256,uint256)");
const CONTACT_SAVED_TOPIC = ethers.id("ContactSaved(address,address,string,string,uint64)");
const CONTACT_REMOVED_TOPIC = ethers.id("ContactRemoved(address,address,uint64)");

const blockTimestampCache = new Map<number, number>();
const boundaryBlockCache = new Map<
  number,
  { at: number; fromBlock: number; latestBlock: number; latestTs: number; secPerBlock: number }
>();
const stableFlowCache = new Map<string, { at: number; result: StablecoinFlowHistoryResult }>();
const stableFlowInflight = new Map<string, Promise<StablecoinFlowHistoryResult>>();

function uniqueAddresses(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const addr of list) {
    if (!addr || !ethers.isAddress(addr)) continue;
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ethers.getAddress(addr));
  }
  return out;
}

function rememberBlockTimestamp(blockNumber: number, timestamp: number) {
  if (!Number.isFinite(blockNumber) || !Number.isFinite(timestamp) || timestamp <= 0) return;
  if (blockTimestampCache.size >= BLOCK_TS_CACHE_MAX && !blockTimestampCache.has(blockNumber)) {
    const oldest = blockTimestampCache.keys().next().value;
    if (oldest !== undefined) blockTimestampCache.delete(oldest);
  }
  blockTimestampCache.set(blockNumber, timestamp);
}

function isBlockRangeLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    code?: string | number;
    shortMessage?: string;
    message?: string;
    info?: { error?: { code?: number; message?: string } };
  };
  const rpcCode = err.info?.error?.code;
  if (rpcCode === -32005 || rpcCode === -32602 || rpcCode === -32000) return true;
  const text = `${err.shortMessage ?? ""} ${err.message ?? ""} ${err.info?.error?.message ?? ""}`;
  return /block\s*range|max.*blocks|exceed.*limit|limit.*exceed|query returned more than|too many results|log response size|range is too large/i.test(
    text
  );
}

function isRateLimitLikeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as {
    status?: number;
    shortMessage?: string;
    message?: string;
    info?: { responseStatus?: string; error?: { code?: number; message?: string } };
  };
  if (err.status === 429) return true;
  const text = `${err.info?.responseStatus ?? ""} ${err.shortMessage ?? ""} ${err.message ?? ""} ${err.info?.error?.message ?? ""}`;
  return /429|rate.?limit|too many requests|throttle/i.test(text);
}

function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
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

async function queryLogsAdaptive(
  baseFilter: { address: string | string[]; topics: Array<string | string[] | null> },
  fromBlock: number,
  toBlock: number,
  signal?: AbortSignal,
  depth = 0
): Promise<ethers.Log[]> {
  if (signal?.aborted) {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    throw abortErr;
  }
  if (fromBlock > toBlock) return [];

  // Enforce learned safe chunk cap (<= 5,000 blocks per RPC call) via sequential pagination
  const maxStep = Math.max(500, Math.min(ANALYTICS_MAX_CHUNK_BLOCKS, learnedSafeChunkBlocks));
  if (depth === 0 && toBlock - fromBlock + 1 > maxStep) {
    const collected: ethers.Log[] = [];
    for (let cursor = fromBlock; cursor <= toBlock; ) {
      const subTo = Math.min(toBlock, cursor + maxStep - 1);
      const part = await queryLogsAdaptive(baseFilter, cursor, subTo, signal, 0);
      collected.push(...part);
      cursor = subTo + 1;
      if (cursor <= toBlock) {
        await sleepAbortable(CHUNK_RATE_LIMIT_DELAY_MS, signal);
      }
    }
    return collected;
  }

  try {
    return await withArcRpc(
      (provider) =>
        provider.getLogs({
          address: baseFilter.address,
          topics: baseFilter.topics,
          fromBlock,
          toBlock,
        }),
      { signal, timeoutMs: 12_000 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;

    const span = toBlock - fromBlock;
    if (
      depth < MAX_ADAPTIVE_SPLIT_DEPTH &&
      span >= MIN_SPLIT_RANGE_BLOCKS &&
      (isBlockRangeLimitError(error) || isRpcTransportError(error) || isRateLimitLikeError(error))
    ) {
      const mid = Math.floor((fromBlock + toBlock) / 2);
      if (isBlockRangeLimitError(error)) {
        learnedSafeChunkBlocks = Math.max(
          500,
          Math.min(learnedSafeChunkBlocks, mid - fromBlock + 1)
        );
      }
      if (isRateLimitLikeError(error) || isRpcTransportError(error)) {
        await sleepAbortable(180 * (depth + 1), signal);
      }
      // Sequential split prevents exponential parallel RPC storms under rate limits
      const left = await queryLogsAdaptive(baseFilter, fromBlock, mid, signal, depth + 1);
      await sleepAbortable(CHUNK_RATE_LIMIT_DELAY_MS, signal);
      const right = await queryLogsAdaptive(baseFilter, mid + 1, toBlock, signal, depth + 1);
      return [...left, ...right];
    }
    throw error;
  }
}

async function hydrateBlockTimestamps(
  blockNumbers: number[],
  signal?: AbortSignal
): Promise<void> {
  const missing = Array.from(new Set(blockNumbers)).filter((bn) => !blockTimestampCache.has(bn));
  if (missing.length === 0) return;

  const chunkSize = 4;
  for (let i = 0; i < missing.length; i += chunkSize) {
    if (signal?.aborted) {
      const abortErr = new Error("Aborted");
      abortErr.name = "AbortError";
      throw abortErr;
    }
    const slice = missing.slice(i, i + chunkSize);
    await withArcRpc(
      async (provider) => {
        const blocks = await Promise.all(
          slice.map((bn) => provider.getBlock(bn).catch(() => null))
        );
        for (const blk of blocks) {
          if (blk && typeof blk.number === "number" && typeof blk.timestamp === "number") {
            rememberBlockTimestamp(blk.number, blk.timestamp);
          }
        }
      },
      { signal }
    ).catch(() => undefined);
    if (i + chunkSize < missing.length) {
      await sleepAbortable(25, signal);
    }
  }
}

type DecodedTransferRecord = {
  id: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  tokenAddress: string;
  tokenSymbol: string;
  decimals: number;
  from: string;
  to: string;
  value: bigint;
};

/**
 * Fetches live Arc Mainnet activity for `wallet` across both active and legacy protocol
 * contracts using chunked `eth_getLogs` with automatic binary range-halving.
 */
export async function fetchOnChainHistory(
  wallet: string,
  opts?: FetchOnChainHistoryOptions
): Promise<OnChainHistoryResult> {
  const trimmed = (wallet || "").trim();
  if (!trimmed || !ethers.isAddress(trimmed)) {
    return {
      entries: [],
      nextCursorBlock: null,
      latestBlock: 0,
      scannedFromBlock: 0,
      scannedToBlock: 0,
    };
  }

  const checksummedWallet = ethers.getAddress(trimmed);
  const walletLower = checksummedWallet.toLowerCase();
  const paddedWallet = ethers.zeroPadValue(checksummedWallet, 32);
  const windowBlocks = Math.max(100, Math.min(25_000, opts?.windowBlocks ?? DEFAULT_HISTORY_WINDOW_BLOCKS));

  const [latestBlock, pairState] = await Promise.all([
    withArcRpc((provider) => provider.getBlockNumber(), { signal: opts?.signal }),
    fetchPairState(undefined, EURC_ADDRESS).catch(() => null),
  ]);

  if (latestBlock <= 0) {
    return {
      entries: [],
      nextCursorBlock: null,
      latestBlock: 0,
      scannedFromBlock: 0,
      scannedToBlock: 0,
    };
  }

  const scannedToBlock =
    opts?.toBlock !== undefined && Number.isFinite(opts.toBlock)
      ? Math.max(0, Math.min(latestBlock, Math.floor(opts.toBlock)))
      : latestBlock;
  const scannedFromBlock = Math.max(0, scannedToBlock - windowBlocks + 1);
  const nextCursorBlock = scannedFromBlock > 0 ? scannedFromBlock - 1 : null;

  const tokenAddresses = TRACKED_HISTORY_TOKENS.map((t) => t.address);
  const gmAddresses = uniqueAddresses([DAILY_GM_ADDRESS, LEGACY_DAILY_GM_ADDRESS]);
  const nlpVaultAddresses = uniqueAddresses([USDC_VAULT_ADDRESS, EURC_VAULT_ADDRESS]);

  const [
    outgoingTokenLogs,
    incomingTokenLogs,
    gmLogs,
    ansLogs,
    nlpLogs,
    contactSavedLogs,
    contactRemovedLogs,
  ] = await Promise.all([
    queryLogsAdaptive(
      { address: tokenAddresses, topics: [TRANSFER_TOPIC, paddedWallet] },
      scannedFromBlock,
      scannedToBlock,
      opts?.signal
    ),
    queryLogsAdaptive(
      { address: tokenAddresses, topics: [TRANSFER_TOPIC, null, paddedWallet] },
      scannedFromBlock,
      scannedToBlock,
      opts?.signal
    ),
    queryLogsAdaptive(
      { address: gmAddresses, topics: [CHECKED_IN_TOPIC, paddedWallet] },
      scannedFromBlock,
      scannedToBlock,
      opts?.signal
    ),
    queryLogsAdaptive(
      { address: ANS_CONTRACT_ADDRESS, topics: [DOMAIN_REGISTERED_TOPIC, null, paddedWallet] },
      scannedFromBlock,
      scannedToBlock,
      opts?.signal
    ),
    queryLogsAdaptive(
      { address: nlpVaultAddresses, topics: [NLP_CLAIMED_TOPIC, paddedWallet] },
      scannedFromBlock,
      scannedToBlock,
      opts?.signal
    ),
    queryLogsAdaptive(
      { address: ADDRESS_BOOK_ADDRESS, topics: [CONTACT_SAVED_TOPIC, paddedWallet] },
      scannedFromBlock,
      scannedToBlock,
      opts?.signal
    ).catch(() => [] as ethers.Log[]),
    queryLogsAdaptive(
      { address: ADDRESS_BOOK_ADDRESS, topics: [CONTACT_REMOVED_TOPIC, paddedWallet] },
      scannedFromBlock,
      scannedToBlock,
      opts?.signal
    ).catch(() => [] as ethers.Log[]),
  ]);

  const seenIds = new Set<string>();
  const transferRecords: DecodedTransferRecord[] = [];
  const protocolEntries: OnChainHistoryEntry[] = [];

  for (const log of [...outgoingTokenLogs, ...incomingTokenLogs]) {
    if (!log.transactionHash) continue;
    const id = `${log.transactionHash.toLowerCase()}:${log.index}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const tokenMeta = TRACKED_TOKEN_BY_LOWER.get(log.address.toLowerCase());
    if (!tokenMeta) continue;

    try {
      const parsed = erc20Iface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed || parsed.name !== "Transfer") continue;
      const from = ethers.getAddress(String(parsed.args[0]));
      const to = ethers.getAddress(String(parsed.args[1]));
      const value = BigInt(parsed.args[2]);
      transferRecords.push({
        id,
        txHash: log.transactionHash,
        logIndex: log.index,
        blockNumber: log.blockNumber,
        tokenAddress: ethers.getAddress(log.address),
        tokenSymbol: tokenMeta.symbol,
        decimals: tokenMeta.decimals,
        from,
        to,
        value,
      });
    } catch {
      continue;
    }
  }

  for (const log of gmLogs) {
    if (!log.transactionHash) continue;
    const id = `${log.transactionHash.toLowerCase()}:${log.index}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    try {
      const parsed = gmIface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed || parsed.name !== "CheckedIn") continue;
      const streak = Number(BigInt(parsed.args[1]));
      const ts = Number(BigInt(parsed.args[2]));
      rememberBlockTimestamp(log.blockNumber, ts);
      protocolEntries.push({
        id,
        txHash: log.transactionHash,
        logIndex: log.index,
        blockNumber: log.blockNumber,
        timestamp: ts > 0 ? ts : null,
        kind: "gm_checkin",
        label: `Daily GM Check-In (Day ${streak})`,
        direction: "protocol",
        tokenSymbol: null,
        amountRaw: null,
        amountExact: null,
        amountFormatted: null,
        decimals: null,
        counterparty: ethers.getAddress(log.address),
        streak,
        explorerUrl: `${ARC_EXPLORER}/tx/${log.transactionHash}`,
      });
    } catch {
      continue;
    }
  }

  for (const log of nlpLogs) {
    if (!log.transactionHash) continue;
    const id = `${log.transactionHash.toLowerCase()}:${log.index}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    try {
      const parsed = vaultIface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed || parsed.name !== "NLPClaimed") continue;
      const claimed18 = BigInt(parsed.args[1]);
      const ts = Number(BigInt(parsed.args[3]));
      rememberBlockTimestamp(log.blockNumber, ts);
      const isEurcVault = log.address.toLowerCase() === EURC_VAULT_ADDRESS.toLowerCase();
      protocolEntries.push({
        id,
        txHash: log.transactionHash,
        logIndex: log.index,
        blockNumber: log.blockNumber,
        timestamp: ts > 0 ? ts : null,
        kind: "nlp_claim",
        label: isEurcVault ? "Claimed EURC Vault NLP" : "Claimed USDC Vault NLP",
        direction: "in",
        tokenSymbol: "NLP",
        amountRaw: claimed18,
        amountExact: ethers.formatUnits(claimed18, NLP_DECIMALS),
        amountFormatted: formatPretty(claimed18, NLP_DECIMALS, 4),
        decimals: NLP_DECIMALS,
        counterparty: ethers.getAddress(log.address),
        explorerUrl: `${ARC_EXPLORER}/tx/${log.transactionHash}`,
      });
    } catch {
      continue;
    }
  }

  let resolvedOwnerDomain: string | null = null;
  if (ansLogs.length > 0) {
    resolvedOwnerDomain = await resolveAddressToDomain(checksummedWallet).catch(() => null);
  }

  for (const log of ansLogs) {
    if (!log.transactionHash) continue;
    const id = `${log.transactionHash.toLowerCase()}:${log.index}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    try {
      const parsed = ansIface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed || parsed.name !== "DomainRegistered") continue;
      const fullDomain = resolvedOwnerDomain ? `${resolvedOwnerDomain}.nex` : null;
      protocolEntries.push({
        id,
        txHash: log.transactionHash,
        logIndex: log.index,
        blockNumber: log.blockNumber,
        timestamp: blockTimestampCache.get(log.blockNumber) ?? null,
        kind: "domain_register",
        label: fullDomain ? `Registered ${fullDomain}` : "Registered .nex Domain",
        direction: "protocol",
        tokenSymbol: null,
        amountRaw: null,
        amountExact: null,
        amountFormatted: null,
        decimals: null,
        counterparty: ANS_CONTRACT_ADDRESS,
        domain: fullDomain,
        explorerUrl: `${ARC_EXPLORER}/tx/${log.transactionHash}`,
      });
    } catch {
      continue;
    }
  }

  for (const log of contactSavedLogs) {
    if (!log.transactionHash) continue;
    const id = `${log.transactionHash.toLowerCase()}:${log.index}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    try {
      const parsed = addressBookIface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed || parsed.name !== "ContactSaved") continue;
      const recipient = ethers.getAddress(String(parsed.args[1]));
      const contactLabel = String(parsed.args[2] ?? "").trim();
      const contactDomain = String(parsed.args[3] ?? "").trim();
      const ts = Number(BigInt(parsed.args[4]));
      rememberBlockTimestamp(log.blockNumber, ts);
      protocolEntries.push({
        id,
        txHash: log.transactionHash,
        logIndex: log.index,
        blockNumber: log.blockNumber,
        timestamp: ts > 0 ? ts : null,
        kind: "contact_saved",
        label: contactLabel ? `Whitelisted Contact: ${contactLabel}` : "Whitelisted Address Book Contact",
        direction: "protocol",
        tokenSymbol: null,
        amountRaw: null,
        amountExact: null,
        amountFormatted: null,
        decimals: null,
        counterparty: recipient,
        domain: contactDomain || null,
        explorerUrl: `${ARC_EXPLORER}/tx/${log.transactionHash}`,
      });
    } catch {
      continue;
    }
  }

  for (const log of contactRemovedLogs) {
    if (!log.transactionHash) continue;
    const id = `${log.transactionHash.toLowerCase()}:${log.index}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    try {
      const parsed = addressBookIface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed || parsed.name !== "ContactRemoved") continue;
      const recipient = ethers.getAddress(String(parsed.args[1]));
      const ts = Number(BigInt(parsed.args[2]));
      rememberBlockTimestamp(log.blockNumber, ts);
      protocolEntries.push({
        id,
        txHash: log.transactionHash,
        logIndex: log.index,
        blockNumber: log.blockNumber,
        timestamp: ts > 0 ? ts : null,
        kind: "contact_removed",
        label: "Removed Address Book Contact",
        direction: "protocol",
        tokenSymbol: null,
        amountRaw: null,
        amountExact: null,
        amountFormatted: null,
        decimals: null,
        counterparty: recipient,
        explorerUrl: `${ARC_EXPLORER}/tx/${log.transactionHash}`,
      });
    } catch {
      continue;
    }
  }

  const txGroups = new Map<string, DecodedTransferRecord[]>();
  for (const rec of transferRecords) {
    const txKey = rec.txHash.toLowerCase();
    const bucket = txGroups.get(txKey);
    if (bucket) {
      bucket.push(rec);
    } else {
      txGroups.set(txKey, [rec]);
    }
  }

  const vaultLowerSet = new Set(
    [
      USDC_VAULT_ADDRESS,
      EURC_VAULT_ADDRESS,
      LEGACY_USDC_VAULT_ADDRESS,
      LEGACY_EURC_VAULT_ADDRESS,
    ].map((a) => a.toLowerCase())
  );
  const pairLower = pairState?.pairAddress?.toLowerCase() ?? "";
  const routerLower = ROUTER_ADDRESS.toLowerCase();
  const nexioSwapLower = NEXIO_SWAP_ADDRESS.toLowerCase();

  const isLpEndpoint = (addrLower: string) =>
    (pairLower !== "" && addrLower === pairLower) ||
    addrLower === routerLower ||
    addrLower === nexioSwapLower;

  const classifiedTransfers: OnChainHistoryEntry[] = [];

  for (const rec of transferRecords) {
    const siblings = txGroups.get(rec.txHash.toLowerCase()) ?? [rec];
    const fromLower = rec.from.toLowerCase();
    const isOutgoing = fromLower === walletLower;
    const counterparty = isOutgoing ? rec.to : rec.from;
    const counterpartyLower = counterparty.toLowerCase();

    const outTokens = new Set(
      siblings
        .filter((s) => s.from.toLowerCase() === walletLower)
        .map((s) => s.tokenAddress.toLowerCase())
    );
    const inTokens = new Set(
      siblings
        .filter((s) => s.to.toLowerCase() === walletLower)
        .map((s) => s.tokenAddress.toLowerCase())
    );
    let isCrossAssetSwap = false;
    for (const outAddr of outTokens) {
      for (const inAddr of inTokens) {
        if (outAddr !== inAddr) {
          isCrossAssetSwap = true;
          break;
        }
      }
      if (isCrossAssetSwap) break;
    }

    let kind: OnChainHistoryKind;
    let label: string;

    if (vaultLowerSet.has(counterpartyLower)) {
      if (isOutgoing) {
        kind = "vault_stake";
        label = `Stake ${rec.tokenSymbol} in Vault`;
      } else {
        kind = "vault_withdraw";
        label = `Withdraw ${rec.tokenSymbol} from Vault`;
      }
    } else if (isCrossAssetSwap) {
      kind = "swap";
      label = isOutgoing ? `Swap ${rec.tokenSymbol} Sold` : `Swap ${rec.tokenSymbol} Received`;
    } else if (isLpEndpoint(counterpartyLower)) {
      if (isOutgoing) {
        kind = "lp_add";
        label = `Add ${rec.tokenSymbol} Liquidity`;
      } else {
        kind = "lp_remove";
        label = `Remove ${rec.tokenSymbol} Liquidity`;
      }
    } else if (isOutgoing) {
      kind = "send";
      label = `Sent ${rec.tokenSymbol}`;
    } else {
      kind = "receive";
      label = `Received ${rec.tokenSymbol}`;
    }

    classifiedTransfers.push({
      id: rec.id,
      txHash: rec.txHash,
      logIndex: rec.logIndex,
      blockNumber: rec.blockNumber,
      timestamp: blockTimestampCache.get(rec.blockNumber) ?? null,
      kind,
      label,
      direction: isOutgoing ? "out" : "in",
      tokenSymbol: rec.tokenSymbol,
      amountRaw: rec.value,
      amountExact: ethers.formatUnits(rec.value, rec.decimals),
      amountFormatted: formatPretty(rec.value, rec.decimals, 4),
      decimals: rec.decimals,
      counterparty,
      explorerUrl: `${ARC_EXPLORER}/tx/${rec.txHash}`,
    });
  }

  const combined = [...classifiedTransfers, ...protocolEntries];
  await hydrateBlockTimestamps(
    combined.map((item) => item.blockNumber),
    opts?.signal
  );

  for (const item of combined) {
    if (item.timestamp === null) {
      item.timestamp = blockTimestampCache.get(item.blockNumber) ?? null;
    }
  }

  combined.sort((a, b) => {
    if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
    return b.logIndex - a.logIndex;
  });

  return {
    entries: combined,
    nextCursorBlock,
    latestBlock,
    scannedFromBlock,
    scannedToBlock,
  };
}

// ============================================================================
// Historical Stablecoin Flow Scanner (7D / 30D Portfolio Net Worth Analytics)
// ============================================================================

export function invalidateStablecoinFlowCache(wallet?: string) {
  if (wallet && ethers.isAddress(wallet)) {
    const prefix = `${wallet.toLowerCase()}:`;
    for (const key of stableFlowCache.keys()) {
      if (key.startsWith(prefix)) stableFlowCache.delete(key);
    }
  } else {
    stableFlowCache.clear();
  }
}

async function resolveTimeframeStartBlock(
  days: number,
  signal?: AbortSignal
): Promise<{ fromBlock: number; latestBlock: number; latestTs: number; secPerBlock: number }> {
  const cached = boundaryBlockCache.get(days);
  if (cached && Date.now() - cached.at < BLOCK_BOUNDARY_CACHE_MS) {
    return {
      fromBlock: cached.fromBlock,
      latestBlock: cached.latestBlock,
      latestTs: cached.latestTs,
      secPerBlock: cached.secPerBlock,
    };
  }

  const nowWallSec = Math.floor(Date.now() / 1000);
  const latestBlk = await withArcRpc((p) => p.getBlock("latest"), {
    signal,
    timeoutMs: 10_000,
  }).catch(() => null);

  let latestBlock = latestBlk && typeof latestBlk.number === "number" ? latestBlk.number : 0;
  if (latestBlock <= 0) {
    latestBlock = await withArcRpc((p) => p.getBlockNumber(), {
      signal,
      timeoutMs: 10_000,
    }).catch(() => 0);
  }
  if (latestBlock <= 0) {
    return { fromBlock: 0, latestBlock: 0, latestTs: nowWallSec, secPerBlock: 2.0 };
  }

  const latestTs =
    latestBlk && typeof latestBlk.timestamp === "number" && latestBlk.timestamp > 0
      ? latestBlk.timestamp
      : nowWallSec;
  rememberBlockTimestamp(latestBlock, latestTs);

  // Align cutoff to the start of the earliest UTC calendar day in the window
  const todayUtcStart = Math.floor(latestTs / 86_400) * 86_400;
  const targetTs = Math.max(0, todayUtcStart - (days - 1) * 86_400);

  // Single empirical block-time probe (max 5,000 blocks back) avoids 12+ sequential getBlock calls
  let secPerBlock = 2.0;
  if (latestBlock > 100) {
    const probeDelta = Math.min(ANALYTICS_MAX_CHUNK_BLOCKS, Math.max(100, Math.floor(latestBlock / 2)));
    const probeNum = Math.max(1, latestBlock - probeDelta);
    const probeBlk = await withArcRpc((p) => p.getBlock(probeNum), {
      signal,
      timeoutMs: 8_000,
    }).catch(() => null);

    if (probeBlk && typeof probeBlk.timestamp === "number" && probeBlk.timestamp < latestTs) {
      rememberBlockTimestamp(probeNum, probeBlk.timestamp);
      secPerBlock = Math.max(
        0.2,
        (latestTs - probeBlk.timestamp) / Math.max(1, latestBlock - probeNum)
      );
    }
  }

  const estBlocksBack = Math.ceil(Math.max(0, latestTs - targetTs) / secPerBlock);
  const fromBlock = Math.max(0, latestBlock - estBlocksBack);

  boundaryBlockCache.set(days, {
    at: Date.now(),
    fromBlock,
    latestBlock,
    latestTs,
    secPerBlock,
  });
  return { fromBlock, latestBlock, latestTs, secPerBlock };
}

/**
 * Queries strictly on-chain USDC & EURC Transfer logs for `wallet` covering the `7D` or `30D`
 * UTC window on Arc Mainnet using safe <= 5,000-block chunk pagination and iterative rate-limit
 * protection.
 */
export async function fetchStablecoinFlowsForDays(
  wallet: string,
  days: 7 | 30,
  opts?: { force?: boolean; signal?: AbortSignal }
): Promise<StablecoinFlowHistoryResult> {
  const trimmed = (wallet || "").trim();
  const nowFallback = Math.floor(Date.now() / 1000);
  if (!trimmed || !ethers.isAddress(trimmed)) {
    return {
      flows: [],
      latestBlock: 0,
      latestTimestamp: nowFallback,
      fromBlock: 0,
      toBlock: 0,
      partial: false,
    };
  }

  const checksummedWallet = ethers.getAddress(trimmed);
  const walletLower = checksummedWallet.toLowerCase();
  const cacheKey = `${walletLower}:${days}`;
  const cacheKey30 = `${walletLower}:30`;

  if (!opts?.force) {
    const hit = stableFlowCache.get(cacheKey);
    if (hit && Date.now() - hit.at < TIMEFRAME_CACHE_MS) {
      return hit.result;
    }
    // If 30D flows are already cached, slice 7D directly from the cached 30D logs with zero RPC calls
    if (days === 7) {
      const hit30 = stableFlowCache.get(cacheKey30);
      if (hit30 && Date.now() - hit30.at < TIMEFRAME_CACHE_MS) {
        const todayUtcStart = Math.floor(hit30.result.latestTimestamp / 86_400) * 86_400;
        const cutoff7D = Math.max(0, todayUtcStart - 6 * 86_400);
        const slicedResult: StablecoinFlowHistoryResult = {
          ...hit30.result,
          flows: hit30.result.flows.filter((f) => f.timestamp >= cutoff7D),
        };
        stableFlowCache.set(cacheKey, { at: hit30.at, result: slicedResult });
        return slicedResult;
      }
    }
    const pending = stableFlowInflight.get(cacheKey);
    if (pending) return pending;
  }

  const job = (async (): Promise<StablecoinFlowHistoryResult> => {
    const [{ fromBlock: targetFromBlock, latestBlock, latestTs, secPerBlock }, pairState] =
      await Promise.all([
        resolveTimeframeStartBlock(days, opts?.signal),
        fetchPairState(undefined, EURC_ADDRESS).catch(() => null),
      ]);

    if (latestBlock <= 0) {
      return {
        flows: [],
        latestBlock: 0,
        latestTimestamp: latestTs,
        fromBlock: 0,
        toBlock: 0,
        partial: false,
      };
    }

    const paddedWallet = ethers.zeroPadValue(checksummedWallet, 32);
    const stableTokens = [USDC_ERC20_ADDRESS, EURC_ADDRESS];

    // Divide target block range into safe chunks of at most 5,000 blocks per RPC call
    const chunkSize = Math.max(500, Math.min(ANALYTICS_MAX_CHUNK_BLOCKS, learnedSafeChunkBlocks));
    const maxCoveredSpan = chunkSize * MAX_CHUNKS_PER_SCAN;
    const totalSpan = Math.max(1, latestBlock - targetFromBlock + 1);
    const effectiveFromBlock =
      totalSpan > maxCoveredSpan
        ? Math.max(0, latestBlock - maxCoveredSpan + 1)
        : targetFromBlock;
    let partial = effectiveFromBlock > targetFromBlock;

    const ranges: Array<{ from: number; to: number }> = [];
    for (let cursor = latestBlock; cursor >= effectiveFromBlock; ) {
      const start = Math.max(effectiveFromBlock, cursor - chunkSize + 1);
      ranges.push({ from: start, to: cursor });
      cursor = start - 1;
    }

    // Rate-limit protection: fetch chunked requests iteratively (at most 1 chunk's in/out pair at a time)
    const allLogs: ethers.Log[] = [];
    let verifiedChunks = 0;
    let lowestVerifiedFromBlock = latestBlock;

    for (let i = 0; i < ranges.length; i++) {
      if (opts?.signal?.aborted) {
        const abortErr = new Error("Aborted");
        abortErr.name = "AbortError";
        throw abortErr;
      }

      const r = ranges[i];
      try {
        const [outLogs, inLogs] = await Promise.all([
          queryLogsAdaptive(
            { address: stableTokens, topics: [TRANSFER_TOPIC, paddedWallet] },
            r.from,
            r.to,
            opts?.signal
          ),
          queryLogsAdaptive(
            { address: stableTokens, topics: [TRANSFER_TOPIC, null, paddedWallet] },
            r.from,
            r.to,
            opts?.signal
          ),
        ]);
        allLogs.push(...outLogs, ...inLogs);
        verifiedChunks += 1;
        lowestVerifiedFromBlock = r.from;
      } catch (chunkErr) {
        if (chunkErr instanceof Error && chunkErr.name === "AbortError") {
          throw chunkErr;
        }
        // Fallback: retry outgoing and incoming sequentially after cooldown if parallel pair hit rate limit
        await sleepAbortable(250, opts?.signal);
        try {
          const outLogs = await queryLogsAdaptive(
            { address: stableTokens, topics: [TRANSFER_TOPIC, paddedWallet] },
            r.from,
            r.to,
            opts?.signal
          );
          await sleepAbortable(CHUNK_RATE_LIMIT_DELAY_MS, opts?.signal);
          const inLogs = await queryLogsAdaptive(
            { address: stableTokens, topics: [TRANSFER_TOPIC, null, paddedWallet] },
            r.from,
            r.to,
            opts?.signal
          );
          allLogs.push(...outLogs, ...inLogs);
          verifiedChunks += 1;
          lowestVerifiedFromBlock = r.from;
        } catch (seqErr) {
          if (seqErr instanceof Error && seqErr.name === "AbortError") {
            throw seqErr;
          }
          // Preserve already-verified recent chunks or degrade gracefully to flatline fallback
          partial = true;
          break;
        }
      }

      if (i + 1 < ranges.length) {
        await sleepAbortable(CHUNK_RATE_LIMIT_DELAY_MS, opts?.signal);
      }
    }

    const actualFromBlock = verifiedChunks > 0 ? lowestVerifiedFromBlock : effectiveFromBlock;

    const seenIds = new Set<string>();
    const decoded: DecodedTransferRecord[] = [];
    for (const log of allLogs) {
      if (!log.transactionHash) continue;
      const id = `${log.transactionHash.toLowerCase()}:${log.index}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const isEurc = log.address.toLowerCase() === EURC_ADDRESS.toLowerCase();
      const isUsdc = log.address.toLowerCase() === USDC_ERC20_ADDRESS.toLowerCase();
      if (!isEurc && !isUsdc) continue;

      try {
        const parsed = erc20Iface.parseLog({ topics: [...log.topics], data: log.data });
        if (!parsed || parsed.name !== "Transfer") continue;
        const from = ethers.getAddress(String(parsed.args[0]));
        const to = ethers.getAddress(String(parsed.args[1]));
        const value = BigInt(parsed.args[2]);
        decoded.push({
          id,
          txHash: log.transactionHash,
          logIndex: log.index,
          blockNumber: log.blockNumber,
          tokenAddress: ethers.getAddress(log.address),
          tokenSymbol: isEurc ? "EURC" : "USDC",
          decimals: isEurc ? EURC_DECIMALS : WUSDC_DECIMALS,
          from,
          to,
          value,
        });
      } catch {
        continue;
      }
    }

    if (decoded.length > 0) {
      await hydrateBlockTimestamps(
        decoded.map((d) => d.blockNumber),
        opts?.signal
      );
    }

    const txGroups = new Map<string, DecodedTransferRecord[]>();
    for (const rec of decoded) {
      const k = rec.txHash.toLowerCase();
      const bucket = txGroups.get(k);
      if (bucket) bucket.push(rec);
      else txGroups.set(k, [rec]);
    }

    const vaultLowerSet = new Set(
      [
        USDC_VAULT_ADDRESS,
        EURC_VAULT_ADDRESS,
        LEGACY_USDC_VAULT_ADDRESS,
        LEGACY_EURC_VAULT_ADDRESS,
      ].map((a) => a.toLowerCase())
    );
    const pairLower = pairState?.pairAddress?.toLowerCase() ?? "";
    const routerLower = ROUTER_ADDRESS.toLowerCase();
    const nexioSwapLower = NEXIO_SWAP_ADDRESS.toLowerCase();
    const isLpEndpoint = (addrLower: string) =>
      (pairLower !== "" && addrLower === pairLower) ||
      addrLower === routerLower ||
      addrLower === nexioSwapLower;

    const flows: StablecoinFlowEvent[] = [];
    for (const rec of decoded) {
      const cachedTs = blockTimestampCache.get(rec.blockNumber);
      const ts =
        cachedTs !== undefined && cachedTs > 0
          ? cachedTs
          : Math.max(
              1,
              Math.round(latestTs - Math.max(0, latestBlock - rec.blockNumber) * secPerBlock)
            );

      const siblings = txGroups.get(rec.txHash.toLowerCase()) ?? [rec];
      const isOutgoing = rec.from.toLowerCase() === walletLower;
      const counterpartyLower = (isOutgoing ? rec.to : rec.from).toLowerCase();

      const hasOutUsdc = siblings.some((s) => s.from.toLowerCase() === walletLower && s.tokenSymbol === "USDC");
      const hasOutEurc = siblings.some((s) => s.from.toLowerCase() === walletLower && s.tokenSymbol === "EURC");
      const hasInUsdc = siblings.some((s) => s.to.toLowerCase() === walletLower && s.tokenSymbol === "USDC");
      const hasInEurc = siblings.some((s) => s.to.toLowerCase() === walletLower && s.tokenSymbol === "EURC");
      const isCrossAssetSwap = (hasOutUsdc && hasInEurc) || (hasOutEurc && hasInUsdc);

      let kind: StablecoinFlowKind;
      if (vaultLowerSet.has(counterpartyLower)) {
        kind = isOutgoing ? "vault_stake" : "vault_withdraw";
      } else if (isCrossAssetSwap) {
        kind = "swap";
      } else if (isLpEndpoint(counterpartyLower)) {
        kind = isOutgoing ? "lp_add" : "lp_remove";
      } else {
        kind = isOutgoing ? "send" : "receive";
      }

      flows.push({
        id: rec.id,
        txHash: rec.txHash,
        blockNumber: rec.blockNumber,
        timestamp: ts,
        tokenSymbol: rec.tokenSymbol === "EURC" ? "EURC" : "USDC",
        kind,
        direction: isOutgoing ? "out" : "in",
        amount6: rec.value,
      });
    }

    const result: StablecoinFlowHistoryResult = {
      flows,
      latestBlock,
      latestTimestamp: latestTs,
      fromBlock: actualFromBlock,
      toBlock: latestBlock,
      partial,
    };

    const nowMs = Date.now();
    stableFlowCache.set(cacheKey, { at: nowMs, result });
    if (days === 30) {
      const todayUtcStart = Math.floor(latestTs / 86_400) * 86_400;
      const cutoff7D = Math.max(0, todayUtcStart - 6 * 86_400);
      stableFlowCache.set(`${walletLower}:7`, {
        at: nowMs,
        result: {
          ...result,
          flows: flows.filter((f) => f.timestamp >= cutoff7D),
        },
      });
    }
    return result;
  })().finally(() => {
    if (stableFlowInflight.get(cacheKey) === job) {
      stableFlowInflight.delete(cacheKey);
    }
  });

  stableFlowInflight.set(cacheKey, job);
  return job;
}
