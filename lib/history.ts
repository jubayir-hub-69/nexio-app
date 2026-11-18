import { ethers } from "ethers";
import {
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
const MIN_SPLIT_RANGE_BLOCKS = 32;
const BLOCK_TS_CACHE_MAX = 2_500;

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
  | "domain_register";

export type OnChainHistoryEntry = {
  id: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  timestamp: number | null;
  kind: OnChainHistoryKind;
  label: string;
  direction: "in" | "out" | "protocol";
  tokenSymbol: "USDC" | "EURC" | "NLP" | null;
  amountRaw: bigint | null;
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

const erc20Iface = new ethers.Interface(ERC20_ABI);
const gmIface = new ethers.Interface(DAILY_GM_ABI);
const ansIface = new ethers.Interface(ANS_ABI);
const vaultIface = new ethers.Interface(USDC_VAULT_ABI);

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const CHECKED_IN_TOPIC = ethers.id("CheckedIn(address,uint256,uint256)");
const DOMAIN_REGISTERED_TOPIC = ethers.id("DomainRegistered(string,address)");
const NLP_CLAIMED_TOPIC = ethers.id("NLPClaimed(address,uint256,uint256,uint256)");

const blockTimestampCache = new Map<number, number>();

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

async function queryLogsAdaptive(
  baseFilter: { address: string | string[]; topics: Array<string | string[] | null> },
  fromBlock: number,
  toBlock: number,
  signal?: AbortSignal
): Promise<ethers.Log[]> {
  if (signal?.aborted) {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    throw abortErr;
  }
  if (fromBlock > toBlock) return [];

  try {
    return await withArcRpc(
      (provider) =>
        provider.getLogs({
          address: baseFilter.address,
          topics: baseFilter.topics,
          fromBlock,
          toBlock,
        }),
      { signal }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;

    const span = toBlock - fromBlock;
    if (span >= MIN_SPLIT_RANGE_BLOCKS && (isBlockRangeLimitError(error) || isRpcTransportError(error))) {
      const mid = Math.floor((fromBlock + toBlock) / 2);
      const [left, right] = await Promise.all([
        queryLogsAdaptive(baseFilter, fromBlock, mid, signal),
        queryLogsAdaptive(baseFilter, mid + 1, toBlock, signal),
      ]);
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

  const chunkSize = 12;
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
  }
}

type DecodedTransferRecord = {
  id: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  tokenAddress: string;
  tokenSymbol: "USDC" | "EURC";
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

  const tokenAddresses = [USDC_ERC20_ADDRESS, EURC_ADDRESS];
  const gmAddresses = uniqueAddresses([DAILY_GM_ADDRESS, LEGACY_DAILY_GM_ADDRESS]);
  const nlpVaultAddresses = uniqueAddresses([USDC_VAULT_ADDRESS, EURC_VAULT_ADDRESS]);

  const [outgoingTokenLogs, incomingTokenLogs, gmLogs, ansLogs, nlpLogs] = await Promise.all([
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
  ]);

  const seenIds = new Set<string>();
  const transferRecords: DecodedTransferRecord[] = [];
  const protocolEntries: OnChainHistoryEntry[] = [];

  for (const log of [...outgoingTokenLogs, ...incomingTokenLogs]) {
    if (!log.transactionHash) continue;
    const id = `${log.transactionHash.toLowerCase()}:${log.index}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    try {
      const parsed = erc20Iface.parseLog({ topics: [...log.topics], data: log.data });
      if (!parsed || parsed.name !== "Transfer") continue;
      const from = ethers.getAddress(String(parsed.args[0]));
      const to = ethers.getAddress(String(parsed.args[1]));
      const value = BigInt(parsed.args[2]);
      const isEurc = log.address.toLowerCase() === EURC_ADDRESS.toLowerCase();
      transferRecords.push({
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

    const hasOutUsdc = siblings.some((s) => s.from.toLowerCase() === walletLower && s.tokenSymbol === "USDC");
    const hasOutEurc = siblings.some((s) => s.from.toLowerCase() === walletLower && s.tokenSymbol === "EURC");
    const hasInUsdc = siblings.some((s) => s.to.toLowerCase() === walletLower && s.tokenSymbol === "USDC");
    const hasInEurc = siblings.some((s) => s.to.toLowerCase() === walletLower && s.tokenSymbol === "EURC");
    const isCrossAssetSwap = (hasOutUsdc && hasInEurc) || (hasOutEurc && hasInUsdc);

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
