import { ethers } from "ethers";
import { ACHSWAP_MAX_SLIPPAGE_BPS } from "@/lib/achswap";
import {
  ANS_CONTRACT_ADDRESS,
  ARC_CHAIN_ID,
  ARC_CHAIN_ID_HEX,
  ARC_EXPLORER,
  ARC_NETWORK_LABEL,
  ARC_RPC_URL,
  BALANCE_CACHE_MS,
  DAILY_GM_ADDRESS,
  DEADLINE_SECONDS,
  DEFAULT_SLIPPAGE_BPS,
  EURC_ADDRESS,
  EURC_DECIMALS,
  EURC_VAULT_ADDRESS,
  FACTORY_ADDRESS,
  LEGACY_DAILY_GM_ADDRESS,
  LEGACY_EURC_VAULT_ADDRESS,
  LEGACY_USDC_VAULT_ADDRESS,
  LP_DECIMALS,
  MAX_SWAP_PRICE_IMPACT_BPS,
  MAX_SWAP_VALUE_LOSS_BPS,
  MULTICALL3_ADDRESS,
  NATIVE_GAS_BUFFER,
  NATIVE_USDC_DECIMALS,
  NEXIO_SWAP_ADDRESS,
  NLP_DECIMALS,
  POOL_SKEW_LIMIT_BPS,
  ROUTER_ADDRESS,
  USDC_ERC20_ADDRESS,
  USDC_VAULT_ADDRESS,
  WUSDC_DECIMALS,
} from "@/lib/contracts";
import {
  DEFAULT_FEE_RECIPIENT,
  GM_COOLDOWN_SECONDS,
  GM_EXPIRY_WINDOW_SECONDS,
  GM_TIERS,
  UNRANKED_GM_PROFILE,
  type GmTier,
  type UnrankedGmProfile,
} from "@/lib/gm-tiers";

export const MULTICALL3_CANONICAL_ADDRESS = MULTICALL3_ADDRESS;
export const LP_MAX_SKEW_BPS = POOL_SKEW_LIMIT_BPS;
export const SWAP_MAX_PRICE_IMPACT_BPS = MAX_SWAP_PRICE_IMPACT_BPS;
export const SWAP_MAX_VALUE_LOSS_BPS = MAX_SWAP_VALUE_LOSS_BPS;

function resolveConfiguredFeeRecipient(): string {
  const raw =
    typeof process !== "undefined" && process.env?.ACHSWAP_FEE_RECIPIENT
      ? process.env.ACHSWAP_FEE_RECIPIENT.trim()
      : "";
  if (raw && ethers.isAddress(raw)) {
    return ethers.getAddress(raw);
  }
  return ethers.getAddress(DEFAULT_FEE_RECIPIENT);
}

export const ACTIVE_FEE_RECIPIENT = resolveConfiguredFeeRecipient();

export const DEPLOYMENT_TX_HASHES = {
  NexNameService: "0x26029fb3b4b05c7a8fea159b451918edecef2b58b1cac1acc7a8e917d37f1d7e",
  DailyGM: "0x6eb85765b16abaff3884786361ab3aa6c0954e16731edf127c88ee9a79f6c925",
  NexioVault: "0x8328d47886ad4844ca1e62864f4ebbe7eb472b8955fb7687a749394b36214aed",
  NexioUSDCVault: "0x14a46165848c706191f0ab72640c4c421272894b1fa1786af15e84b8fc3f446c",
  NexioSwap: "0xd0257d930ac6c195b60f282a00ccded4bf9100497e8ebcb77bb44addf1bb358c",
} as const;

export const DOCS_MOTION_SVGS = {
  architecture: "/docs/architecture-flow.svg",
  batch: "/docs/batch-settlement.svg",
  vaults: "/docs/vault-nlp-engine.svg",
  swap: "/docs/swap-routing-motion.svg",
  liquidity: "/docs/lp-skew-guard.svg",
  dailyGm: "/docs/daily-gm-tiers.svg",
  identity: "/docs/ans-identity-recovery.svg",
  history: "/docs/history-indexer.svg",
} as const;

export type NetworkSpec = {
  protocolName: string;
  tagline: string;
  name: string;
  chainId: number;
  chainIdHex: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  erc20UsdcDecimals: number;
  eurcDecimals: number;
  lpDecimals: number;
  nlpDecimals: number;
  usdcPrecompileScale: string;
  gasBufferUsdc: string;
  gasBufferNativeWei: string;
  gasBufferErc20Units: string;
  nlpAccrualRateSummary: string;
  gmCooldownSeconds: number;
  gmExpiryWindowSeconds: number;
  solidityCompiler: string;
  defaultSlippageBps: number;
  maxSwapSlippageBps: number;
  deadlineSeconds: number;
  balanceCacheMs: number;
  feeRecipient: string;
  defaultFeeRecipient: string;
};

export const NETWORK_SPEC: NetworkSpec = {
  protocolName: "Nexio Protocol",
  tagline: "Enterprise Stablecoin Banking, Automated Yield Vaults & Permanent .nex Identity on Arc Mainnet",
  name: ARC_NETWORK_LABEL,
  chainId: ARC_CHAIN_ID,
  chainIdHex: ARC_CHAIN_ID_HEX,
  rpcUrl: ARC_RPC_URL,
  explorerUrl: ARC_EXPLORER,
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: NATIVE_USDC_DECIMALS,
  },
  erc20UsdcDecimals: WUSDC_DECIMALS,
  eurcDecimals: EURC_DECIMALS,
  lpDecimals: LP_DECIMALS,
  nlpDecimals: NLP_DECIMALS,
  usdcPrecompileScale: "10^12 (1 USDC = 10^18 native gas wei = 10^6 ERC-20 units)",
  gasBufferUsdc: ethers.formatUnits(NATIVE_GAS_BUFFER, NATIVE_USDC_DECIMALS),
  gasBufferNativeWei: NATIVE_GAS_BUFFER.toString(),
  gasBufferErc20Units: (
    NATIVE_GAS_BUFFER /
    BigInt(10) ** BigInt(NATIVE_USDC_DECIMALS - WUSDC_DECIMALS)
  ).toString(),
  nlpAccrualRateSummary: "$100 USD staked = exact 10.00 NLP per 24h (86,400s), settled on-chain via claimNLP()",
  gmCooldownSeconds: GM_COOLDOWN_SECONDS,
  gmExpiryWindowSeconds: GM_EXPIRY_WINDOW_SECONDS,
  solidityCompiler: "Solidity 0.8.24 (optimizer enabled, 200 runs; source pragma ^0.8.19)",
  defaultSlippageBps: DEFAULT_SLIPPAGE_BPS,
  maxSwapSlippageBps: ACHSWAP_MAX_SLIPPAGE_BPS,
  deadlineSeconds: DEADLINE_SECONDS,
  balanceCacheMs: BALANCE_CACHE_MS,
  feeRecipient: ACTIVE_FEE_RECIPIENT,
  defaultFeeRecipient: DEFAULT_FEE_RECIPIENT,
};

export type ContractCategory = "token" | "protocol" | "infrastructure";

export type ContractSpec = {
  id: string;
  name: string;
  solidityName: string;
  sourceFile: string | null;
  category: ContractCategory;
  address: string;
  legacyAddress?: string;
  decimals: string;
  deploymentTx: string | null;
  envOverrideVar: string | null;
  role: string;
  integrationNote: string;
  readFunctions: readonly string[];
  writeFunctions: readonly string[];
  events: readonly string[];
  reverts: readonly string[];
};

export const CONTRACT_SPECS: readonly ContractSpec[] = [
  {
    id: "usdc",
    name: "USDC (Native Precompile / ERC-20)",
    solidityName: "IERC20 (Arc Native USDC Precompile)",
    sourceFile: null,
    category: "token",
    address: USDC_ERC20_ADDRESS,
    decimals: "6 (ERC-20) / 18 (Native Gas)",
    deploymentTx: null,
    envOverrideVar: null,
    role: "Canonical Arc Mainnet USD stablecoin & native L1 gas asset.",
    integrationNote:
      "Native balance (eth_getBalance, 18 decimals) and ERC-20 balanceOf (6 decimals) expose the exact same underlying account balance scaled by 10^12. Never sum both in Net Worth, and never call WETH9 deposit()/withdraw() on 0x3600...0000.",
    readFunctions: [
      "function name() external view returns (string)",
      "function symbol() external view returns (string)",
      "function decimals() external view returns (uint8)",
      "function balanceOf(address owner) external view returns (uint256)",
      "function allowance(address owner, address spender) external view returns (uint256)",
    ],
    writeFunctions: [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function transfer(address to, uint256 amount) external returns (bool)",
      "function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)",
    ],
    events: [
      "event Transfer(address indexed from, address indexed to, uint256 value)",
      "event Approval(address indexed owner, address indexed spender, uint256 value)",
    ],
    reverts: ["ERC20InsufficientBalance / insufficient balance", "ERC20InsufficientAllowance / insufficient allowance"],
  },
  {
    id: "eurc",
    name: "EURC (Euro Coin)",
    solidityName: "IERC20",
    sourceFile: null,
    category: "token",
    address: EURC_ADDRESS,
    decimals: "6",
    deploymentTx: null,
    envOverrideVar: null,
    role: "Canonical Arc Mainnet Euro stablecoin (6 decimals).",
    integrationNote:
      "Marked in USD across Portfolio, Vault NLP normalization, and the LP Skew Guard via pure unskewed two-sided live market spot (`spotOnly: true, feeBps: 0`, canceling pool swap fees via `(bidOut + impliedAskOut + 1n) / 2n`). Never assumed 1:1 with USDC.",
    readFunctions: [
      "function name() external view returns (string)",
      "function symbol() external view returns (string)",
      "function decimals() external view returns (uint8)",
      "function balanceOf(address owner) external view returns (uint256)",
      "function allowance(address owner, address spender) external view returns (uint256)",
    ],
    writeFunctions: [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function transfer(address to, uint256 amount) external returns (bool)",
      "function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)",
    ],
    events: [
      "event Transfer(address indexed from, address indexed to, uint256 value)",
      "event Approval(address indexed owner, address indexed spender, uint256 value)",
    ],
    reverts: ["ERC20InsufficientBalance / insufficient balance", "ERC20InsufficientAllowance / insufficient allowance"],
  },
  {
    id: "ans",
    name: "ArcNameService (.nex Registry)",
    solidityName: "NexNameService",
    sourceFile: "contracts/ArcNameService.sol",
    category: "protocol",
    address: ANS_CONTRACT_ADDRESS,
    decimals: "N/A",
    deploymentTx: DEPLOYMENT_TX_HASHES.NexNameService,
    envOverrideVar: "NEXT_PUBLIC_ANS_ADDRESS",
    role: "Immutable 1-wallet-1-.nex domain registry & reverse identity resolver.",
    integrationNote:
      "register(_name) expects a normalized lowercase label [a-z0-9-]{1,63} WITHOUT '.nex' (foreign TLDs like .eth/.arc are rejected client-side). CRITICAL: resolve(), resolveByAddress(), and getFullDomain() REVERT when unregistered instead of returning address(0) or empty string—always call isAvailable(label) or hasDomain(owner) first.",
    readFunctions: [
      "function isAvailable(string _name) external view returns (bool)",
      "function hasDomain(address _owner) external view returns (bool)",
      "function resolve(string _name) external view returns (address)",
      "function resolveByAddress(address _owner) external view returns (string memory)",
      "function getFullDomain(address _owner) external view returns (string memory)",
    ],
    writeFunctions: ["function register(string _name) external"],
    events: ["event DomainRegistered(string indexed name, address indexed owner)"],
    reverts: [
      "NEX: Name cannot be empty",
      "NEX: Domain already taken",
      "NEX: Address already has a domain",
      "NEX: Domain not found",
      "NEX: No domain found for address",
    ],
  },
  {
    id: "daily-gm",
    name: "DailyGM (Consecutive Streak Protocol)",
    solidityName: "DailyGM",
    sourceFile: "contracts/DailyGM.sol",
    category: "protocol",
    address: DAILY_GM_ADDRESS,
    legacyAddress: LEGACY_DAILY_GM_ADDRESS,
    decimals: "N/A (uint256 consecutive days)",
    deploymentTx: DEPLOYMENT_TX_HASHES.DailyGM,
    envOverrideVar: "NEXT_PUBLIC_DAILY_GM_ADDRESS",
    role: "On-chain 24h cooldown & strict 48h consecutive streak engine governing protocol swap fees and batch transfer caps.",
    integrationNote:
      "Requires block.timestamp >= lastCheckIn + 24 hours. Enforces a strict 48-hour consecutive window: if block.timestamp > lastCheckIn + 48 hours, streak resets to 1 on check-in and getEffectiveStreak(user) returns 0 immediately upon expiry. Unlocks 3 consecutive tiers: 30D (10 bps / 20 batch), 90D (5 bps / 50 batch), and 180D VIP (0 bps / Unlimited batch).",
    readFunctions: [
      "function streak(address user) external view returns (uint256)",
      "function lastCheckIn(address user) external view returns (uint256)",
      "function getEffectiveStreak(address user) external view returns (uint256)",
      "function getStreakWindow(address user) external view returns (uint256 effectiveStreak, uint256 nextCheckInAt, uint256 expiresAt)",
    ],
    writeFunctions: ["function checkIn() external"],
    events: ["event CheckedIn(address indexed user, uint256 streak, uint256 timestamp)"],
    reverts: ["Wait 24 hours before next GM"],
  },
  {
    id: "usdc-vault",
    name: "NexioUSDCVault",
    solidityName: "NexioUSDCVault",
    sourceFile: "contracts/NexioUSDCVault.sol",
    category: "protocol",
    address: USDC_VAULT_ADDRESS,
    legacyAddress: LEGACY_USDC_VAULT_ADDRESS,
    decimals: "6 (Principal) / 18 (NLP Points)",
    deploymentTx: DEPLOYMENT_TX_HASHES.NexioUSDCVault,
    envOverrideVar: "NEXT_PUBLIC_USDC_VAULT_ADDRESS",
    role: "Non-custodial 1:1 ERC-20 USDC automated vault & on-chain 1e18 NLP point engine.",
    integrationNote:
      "Accepts 6-decimal ERC-20 USDC and returns exact 1:1 principal on withdraw(amount). Accrues 18-decimal NLP continuously via deltaPoints18 = (stakedBalance * 1e12 * elapsed) / 864000 ($100 USDC staked = exact 10.00 NLP per 86,400s). Settles pending points on-chain via claimNLP() emitting NLPClaimed.",
    readFunctions: [
      "function usdc() external view returns (address)",
      "function stakedBalance(address user) external view returns (uint256)",
      "function lastStakeTime(address user) external view returns (uint256)",
      "function accruedPoints(address user) external view returns (uint256)",
      "function claimedPoints(address user) external view returns (uint256)",
      "function getPendingNLP(address user) external view returns (uint256)",
      "function getLifetimeNLP(address user) external view returns (uint256)",
      "function getPendingYield(address user) external view returns (uint256)",
      "function earnedYield(address user) external view returns (uint256)",
    ],
    writeFunctions: [
      "function deposit(uint256 amount) external",
      "function withdraw(uint256 amount) external",
      "function claimNLP() external returns (uint256 claimed18)",
    ],
    events: [
      "event Deposited(address indexed user, uint256 amount, uint256 timestamp)",
      "event Withdrawn(address indexed user, uint256 amount, uint256 timestamp)",
      "event NLPClaimed(address indexed user, uint256 amount, uint256 totalClaimed, uint256 timestamp)",
    ],
    reverts: [
      "Reentrant",
      "Deposit amount must be > 0",
      "Transfer failed. Check allowance.",
      "Withdraw amount must be > 0",
      "Insufficient balance",
      "Transfer failed",
      "No NLP available to claim",
    ],
  },
  {
    id: "eurc-vault",
    name: "NexioEURCVault",
    solidityName: "NexioVault",
    sourceFile: "contracts/NexioVault.sol",
    category: "protocol",
    address: EURC_VAULT_ADDRESS,
    legacyAddress: LEGACY_EURC_VAULT_ADDRESS,
    decimals: "6 (Principal) / 18 (NLP Points)",
    deploymentTx: DEPLOYMENT_TX_HASHES.NexioVault,
    envOverrideVar: "NEXT_PUBLIC_EURC_VAULT_ADDRESS",
    role: "Non-custodial 1:1 EURC automated vault & on-chain 1e18 NLP point engine.",
    integrationNote:
      "Deployed from contracts/NexioVault.sol with constructor(_tokenAddress = EURC). Accrues 10.00 raw token NLP per 100 EURC per 86,400s on-chain via claimNLP(), normalized in USD via computeUsdScaledVaultNlp18 against live spot so $100 USD of EURC earns exact 10.00 NLP / 24h.",
    readFunctions: [
      "function stablecoin() external view returns (address)",
      "function stakedBalance(address user) external view returns (uint256)",
      "function lastStakeTime(address user) external view returns (uint256)",
      "function accruedPoints(address user) external view returns (uint256)",
      "function claimedPoints(address user) external view returns (uint256)",
      "function getPendingNLP(address user) external view returns (uint256)",
      "function getLifetimeNLP(address user) external view returns (uint256)",
      "function getPendingYield(address user) external view returns (uint256)",
      "function earnedYield(address user) external view returns (uint256)",
    ],
    writeFunctions: [
      "function deposit(uint256 amount) external",
      "function withdraw(uint256 amount) external",
      "function claimNLP() external returns (uint256 claimed18)",
    ],
    events: [
      "event Deposited(address indexed user, uint256 amount, uint256 timestamp)",
      "event Withdrawn(address indexed user, uint256 amount, uint256 timestamp)",
      "event NLPClaimed(address indexed user, uint256 amount, uint256 totalClaimed, uint256 timestamp)",
    ],
    reverts: [
      "Reentrant",
      "Deposit amount must be > 0",
      "Transfer failed. Check allowance.",
      "Withdraw amount must be > 0",
      "Insufficient balance",
      "Transfer failed",
      "No NLP available to claim",
    ],
  },
  {
    id: "nexio-swap",
    name: "NexioSwap (Standalone V2 Wrapper)",
    solidityName: "NexioSwap",
    sourceFile: "contracts/NexioSwap.sol",
    category: "protocol",
    address: NEXIO_SWAP_ADDRESS,
    decimals: "6 (USDC / EURC)",
    deploymentTx: DEPLOYMENT_TX_HASHES.NexioSwap,
    envOverrideVar: "NEXT_PUBLIC_NEXIO_SWAP_ADDRESS",
    role: "Standalone on-chain V2 swap & liquidity wrapper with automatic dust refund and allowance reset.",
    integrationNote:
      "STANDALONE WRAPPER NOTE: UI Swaps route via the Nexio Server Routing Proxy's dynamic `swap.tx.to` settlement executor, and UI Liquidity interacts directly with the V2 Liquidity Router (0x52FE...4AFD). NexioSwap remains deployed for direct smart-contract V2 integrations.",
    readFunctions: [
      "function usdc() external view returns (address)",
      "function eurc() external view returns (address)",
      "function router() external view returns (address)",
      "function factory() external view returns (address)",
    ],
    writeFunctions: [
      "function swapUSDCforEURC(uint256 amountIn, uint256 amountOutMin, uint256 deadline) external returns (uint256 amountOut)",
      "function swapEURCforUSDC(uint256 amountIn, uint256 amountOutMin, uint256 deadline) external returns (uint256 amountOut)",
      "function addLiquidity(uint256 amountUsdcDesired, uint256 amountEurcDesired, uint256 amountUsdcMin, uint256 amountEurcMin, uint256 deadline) external returns (uint256 amountUsdc, uint256 amountEurc, uint256 liquidity)",
      "function removeLiquidity(uint256 liquidity, uint256 amountUsdcMin, uint256 amountEurcMin, uint256 deadline) external returns (uint256 amountUsdc, uint256 amountEurc)",
    ],
    events: [],
    reverts: [
      "Reentrant",
      "Amount must be > 0",
      "Expired",
      "Pair not found",
      "Transfer failed",
      "Approve reset failed",
      "Approve failed",
      "Refund failed",
    ],
  },
  {
    id: "v2-router",
    name: "Nexio V2 Liquidity Router",
    solidityName: "IV2LiquidityRouter",
    sourceFile: null,
    category: "infrastructure",
    address: ROUTER_ADDRESS,
    decimals: "6 (Reserves) / 18 (LP Shares)",
    deploymentTx: null,
    envOverrideVar: null,
    role: "Canonical Arc Mainnet V2 router called directly by the Nexio Liquidity module.",
    integrationNote:
      "Used for quote(), addLiquidity(), and removeLiquidity() on the USDC/EURC V2 pair. addLiquidity is gated client-side by the ±5.00% (500 bps) reserve-skew & live market spot freshness guard.",
    readFunctions: [
      "function factory() external view returns (address)",
      "function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external pure returns (uint256 amountB)",
      "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
    ],
    writeFunctions: [
      "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
      "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)",
    ],
    events: [],
    reverts: ["EXPIRED", "INSUFFICIENT_A_AMOUNT", "INSUFFICIENT_B_AMOUNT", "INSUFFICIENT_LIQUIDITY"],
  },
  {
    id: "v2-factory",
    name: "Nexio V2 Pair Factory",
    solidityName: "IV2PairFactory",
    sourceFile: null,
    category: "infrastructure",
    address: FACTORY_ADDRESS,
    decimals: "N/A",
    deploymentTx: null,
    envOverrideVar: null,
    role: "Canonical V2 pair factory resolving the Arc Mainnet USDC/EURC liquidity pool.",
    integrationNote:
      "Resolves getPair(USDC, EURC); pair contract exposes getReserves(), token0(), totalSupply(), and 18-decimal LP ERC-20 functions.",
    readFunctions: [
      "function getPair(address tokenA, address tokenB) external view returns (address pair)",
      "function allPairsLength() external view returns (uint256)",
    ],
    writeFunctions: ["function createPair(address tokenA, address tokenB) external returns (address pair)"],
    events: [],
    reverts: [],
  },
  {
    id: "multicall3",
    name: "Multicall3 (Read-Only Batch Aggregator)",
    solidityName: "IMulticall3",
    sourceFile: null,
    category: "infrastructure",
    address: MULTICALL3_CANONICAL_ADDRESS,
    decimals: "N/A",
    deploymentTx: null,
    envOverrideVar: null,
    role: "Single-roundtrip batched RPC read aggregator for balances, vaults, NLP, DailyGM, ANS, and LP state.",
    integrationNote:
      "STRICT READ-ONLY INVARIANT: Probed via getCode and used ONLY for eth_call read snapshots (aggregate3 with allowFailure: true, falling back to ethers JsonRpcProvider batchMaxCount: 20). NEVER used for ERC-20 transfer writes. Multi-recipient batch writes execute via EIP-5792 wallet_sendCalls with sequential prepareAndSendTx per-recipient fallback.",
    readFunctions: [
      "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[] returnData)",
      "function getEthBalance(address addr) external view returns (uint256 balance)",
      "function getBlockNumber() external view returns (uint256 blockNumber)",
      "function getCurrentBlockTimestamp() external view returns (uint256 timestamp)",
    ],
    writeFunctions: [],
    events: [],
    reverts: ["Multicall3: call failed (only when allowFailure == false)"],
  },
] as const;

export const UNRANKED_GM_SPEC: UnrankedGmProfile = UNRANKED_GM_PROFILE;
export const GM_TIER_SPECS: readonly GmTier[] = GM_TIERS;

export type ApiFieldSpec = {
  field: string;
  type: string;
  required: boolean;
  validationAndBehavior: string;
};

export type ApiErrorSpec = {
  httpStatus: string;
  code: string;
  layer: "Proxy Route" | "Upstream / Proxy" | "Client Normalizer";
  retryPolicy: string;
  meaningAndHandling: string;
};

export const ROUTING_API_SPEC = {
  proxyQuotePath: "/api/achswap/quote",
  proxySwapPath: "/api/achswap/swap",
  runtime: "Next.js Node.js Route Handler (force-dynamic, Cache-Control: no-store)",
  authentication:
    "Server-only ACHSWAP_API_KEY injected as Authorization Bearer and x-api-key headers on the server; never exposed in NEXT_PUBLIC_* variables.",
  upstreamTimeoutMs: 8_000,
  ipRateLimit: "60 requests per 60-second sliding window per client IP (returns 429 RATE_LIMITED).",
  pureSpotPolicy:
    "Pure Unskewed Two-Sided Market Spot (`spotOnly: true, feeBps: 0`): queries both `1 EURC -> USDC` and `1 USDC -> EURC` in parallel without calling `readGmStreak`, computing exact mid-spot `(bidOut + impliedAskOut + 1n) / 2n` when spread <= 400 bps (canceling pool swap fees to < 0.05 bps). Cached 30,000 ms with 45,000 ms hard staleness eviction.",
  quoteCachePolicy:
    "3,000 ms server TTL (LRU max 200 keys) + single-flight quoteInflight deduplication keyed by chainId:tokenIn:tokenOut:amountIn:feeBps:feeRecipient:slippageBps.",
  swapCachePolicy:
    "Never cached (every /api/achswap/swap request fetches fresh executable calldata after verified allowance settlement).",
  streakLookupPolicy:
    "Server calls `DailyGM.getEffectiveStreak(trader || sender)` via health-scored Arc RPC failover (60,000 ms TTL + single-flight dedup + stale-if-error retention). Expired (>48h) or 0–29D streaks evaluate to 20 bps; active 30D / 90D / 180D consecutive streaks receive 10 / 5 / 0 bps.",
  rateLimitRetryPolicy:
    "Both /quote and /swap retry HTTP 429 up to 3 attempts with [0 ms, 400 ms, 900 ms] minimum backoff, honoring Retry-After up to 5,000 ms.",
  feeFallbackPolicy:
    "When server-computed feeBps > 0 and upstream returns HTTP 400 or 422 whose error code/message/reason specifically references `fee`, `feebps`, `feerecipient`, or `partner`, the proxy retries once with `feeBps: 0` and omits `feeRecipient`. Non-fee errors (NO_ROUTE, SIMULATION_FAILED) are never retried.",
  quoteRequestFields: [
    {
      field: "chainId",
      type: "number",
      required: false,
      validationAndBehavior: "Defaults to 5042. Any value !== 5042 is rejected with 400 INVALID_REQUEST.",
    },
    {
      field: "tokenIn",
      type: "string (0x address)",
      required: true,
      validationAndBehavior: "Checksummed via ethers.getAddress; must differ from tokenOut.",
    },
    {
      field: "tokenOut",
      type: "string (0x address)",
      required: true,
      validationAndBehavior: "Checksummed via ethers.getAddress; must differ from tokenIn.",
    },
    {
      field: "amountIn",
      type: "string (positive integer)",
      required: true,
      validationAndBehavior: "Base-unit integer string matching /^[1-9]\\d*$/ (6-decimal units for USDC & EURC).",
    },
    {
      field: "slippageBps",
      type: "number (integer)",
      required: true,
      validationAndBehavior: `Integer in [0, ${ACHSWAP_MAX_SLIPPAGE_BPS}] (0% to 20.00%). Default UI preset is ${DEFAULT_SLIPPAGE_BPS} bps (1.00%).`,
    },
    {
      field: "spotOnly",
      type: "boolean",
      required: false,
      validationAndBehavior: "When true, forces `feeBps: 0` with `feeRecipient` omitted and skips `DailyGM` RPC lookup (stripped before upstream forwarding).",
    },
    {
      field: "feeBps",
      type: "number (integer)",
      required: false,
      validationAndBehavior: "Validated in [0, 100] if present, then discarded—server computes authoritative feeBps from DailyGM.getEffectiveStreak.",
    },
    {
      field: "trader",
      type: "string (0x address)",
      required: false,
      validationAndBehavior: "Omitted on pure market spot marks (`feeBps = 0`); set to connected wallet for user swap quotes.",
    },
  ] as readonly ApiFieldSpec[],
  swapAdditionalRequestFields: [
    {
      field: "sender",
      type: "string (0x address)",
      required: true,
      validationAndBehavior: "Checksummed wallet executing & signing the swap; also used for DailyGM.getEffectiveStreak lookup when trader is omitted.",
    },
    {
      field: "recipient",
      type: "string (0x address)",
      required: false,
      validationAndBehavior: "Checksummed output receiver; defaults to sender when omitted.",
    },
  ] as readonly ApiFieldSpec[],
  normalizedResponseFields: [
    {
      field: "amountOut",
      type: "bigint (from string/int/hex)",
      required: true,
      validationAndBehavior: "Exact quoted output in 6-decimal token units; displayed verbatim via formatUnits(amountOut, 6).",
    },
    {
      field: "minAmountOut",
      type: "bigint (minAmountOut ?? amountOutMin)",
      required: true,
      validationAndBehavior: "Slippage-protected minimum output; verified > 0 and >= accepted UI minimum before signing.",
    },
    {
      field: "priceImpactBps",
      type: "number | null",
      required: false,
      validationAndBehavior: `Rounded up conservatively (Math.ceil); swap is hard-blocked if > ${SWAP_MAX_PRICE_IMPACT_BPS} bps (5.00%).`,
    },
    {
      field: "partnerBps",
      type: "number | null",
      required: false,
      validationAndBehavior: "Applied Nexio protocol fee in bps (20, 10, 5, or 0) returned by the routing engine.",
    },
    {
      field: "executor",
      type: "string (checksummed 0x | '')",
      required: false,
      validationAndBehavior: "Resolved settlement executor/spender; rejects ZeroAddress and 0xeeee...eeee sentinel.",
    },
    {
      field: "approval",
      type: "{ token: string; spender: string; amount: bigint } | null",
      required: false,
      validationAndBehavior: "Returned by /swap when ERC-20 allowance is needed; verified token === tokenIn before approve + tx.wait(1).",
    },
    {
      field: "tx",
      type: "{ to: string; data: string; value: bigint; gas: bigint }",
      required: false,
      validationAndBehavior: "Returned by /swap; validated for checksummed non-zero `to`, hex `data` >= 10 chars, non-negative `value`, and chain 5042.",
    },
  ] as readonly ApiFieldSpec[],
  errorMatrix: [
    {
      httpStatus: "400",
      code: "INVALID_REQUEST",
      layer: "Proxy Route",
      retryPolicy: "Do not retry; fix request payload.",
      meaningAndHandling: "Malformed JSON, chainId !== 5042, identical/invalid token addresses, amountIn <= 0, or slippageBps outside 0..2000.",
    },
    {
      httpStatus: "401",
      code: "MISSING_API_KEY",
      layer: "Proxy Route",
      retryPolicy: "Do not retry until server env is set.",
      meaningAndHandling: "ACHSWAP_API_KEY is unset/blank on the Next.js server (.env.local).",
    },
    {
      httpStatus: "401 / 403",
      code: "UNAUTHORIZED",
      layer: "Upstream / Proxy",
      retryPolicy: "Do not retry; rotate server key.",
      meaningAndHandling: "Routing service rejected the configured server API key.",
    },
    {
      httpStatus: "404",
      code: "NOT_FOUND",
      layer: "Proxy Route",
      retryPolicy: "Do not retry.",
      meaningAndHandling: "Dynamic [action] segment was neither `quote` nor `swap`.",
    },
    {
      httpStatus: "400 / 404",
      code: "NO_ROUTE",
      layer: "Upstream / Proxy",
      retryPolicy: "Never fee-fallback retried.",
      meaningAndHandling: "No executable liquidity path exists on Arc Mainnet for the requested pair/size.",
    },
    {
      httpStatus: "400 / 422",
      code: "SIMULATION_FAILED",
      layer: "Upstream / Proxy",
      retryPolicy: "Never fee-fallback retried; refresh quote/allowance.",
      meaningAndHandling: "On-chain swap simulation reverted (e.g., allowance not yet mined, expired quote, or insufficient balance); includes optional `reason`.",
    },
    {
      httpStatus: "429",
      code: "RATE_LIMITED",
      layer: "Upstream / Proxy",
      retryPolicy: "Auto-retried [0, 400, 900] ms + Retry-After (<=5s).",
      meaningAndHandling: "Per-IP proxy limit (60 req/60s) or upstream rate limit exhausted after 3 attempts.",
    },
    {
      httpStatus: "429",
      code: "CONCURRENCY_LIMITED",
      layer: "Upstream / Proxy",
      retryPolicy: "Wait briefly and re-quote.",
      meaningAndHandling: "Concurrent routing worker cap reached; mapped to sanitized busy notice.",
    },
    {
      httpStatus: "499",
      code: "(Client Abort)",
      layer: "Proxy Route",
      retryPolicy: "Silent abort (ignored by UI).",
      meaningAndHandling: "Browser AbortController cancelled a superseded debounced quote; returns empty 499 response.",
    },
    {
      httpStatus: "502 / 504",
      code: "UNAVAILABLE",
      layer: "Proxy Route",
      retryPolicy: "Retry on next user action / poll.",
      meaningAndHandling: "Upstream network failure or 8,000 ms AbortSignal timeout.",
    },
    {
      httpStatus: "502 / 5xx",
      code: "INTERNAL",
      layer: "Proxy Route",
      retryPolicy: "Retry after brief delay.",
      meaningAndHandling: "Upstream returned empty or non-JSON body.",
    },
    {
      httpStatus: "502",
      code: "INVALID_RESPONSE",
      layer: "Client Normalizer",
      retryPolicy: "Hard-block signing.",
      meaningAndHandling: "Response missed amountOut, minAmountOut, valid checksummed `tx.to`, or >=10-char hex calldata.",
    },
    {
      httpStatus: "0 / Non-2xx",
      code: "NETWORK / REQUEST_FAILED",
      layer: "Client Normalizer",
      retryPolicy: "Check connectivity & retry.",
      meaningAndHandling: "Browser fetch failed to reach Next.js `/api/achswap/*` or received an unstructured error.",
    },
  ] as readonly ApiErrorSpec[],
} as const;

export const ACHSWAP_API_SPEC = ROUTING_API_SPEC;

export type SecurityGuardrailSpec = {
  id: string;
  title: string;
  thresholdOrRule: string;
  enforcementLayer: string;
  description: string;
};

export const SECURITY_GUARDRAILS: readonly SecurityGuardrailSpec[] = [
  {
    id: "G-01",
    title: "Strict Arc Mainnet Chain Lock",
    thresholdOrRule: `chainId === ${ARC_CHAIN_ID} (${ARC_CHAIN_ID_HEX})`,
    enforcementLayer: "Client Signer + Server Proxy + Deploy Script",
    description:
      "Every transaction preparation (`prepareAndSendTx`), API route (`parseQuoteBody`), and Hardhat deployment script rejects any network other than Arc Mainnet 5042.",
  },
  {
    id: "G-02",
    title: "Native Gas Buffer on Max USDC",
    thresholdOrRule: "0.005 USDC (5 * 10^15 native wei / 5,000 ERC-20 units; scaled × N in sequential batch)",
    enforcementLayer: "Send, Batch Send, Swap, Vault Stake, Liquidity Add",
    description:
      "Because native USDC pays L1 gas and shares one balance with ERC-20 USDC (0x3600...0000), `maxNativeSpend` and `maxPoolUsdcSpend` reserve 0.005 USDC before truncating by 10^12 so approvals and settlement never strand the wallet.",
  },
  {
    id: "G-03",
    title: "±5.00% Liquidity Pool Reserve-Skew & Spot-Freshness Guard",
    thresholdOrRule: `LP_MAX_SKEW_BPS = ${LP_MAX_SKEW_BPS} bps (±5.00%) + Spot Age <= 45s`,
    enforcementLayer: "Liquidity Add (`app/page.tsx` & `lib/contracts.ts`)",
    description:
      "Blocks `addLiquidity` whenever V2 reserve ratio (or initial empty-pool ratio) diverges > 5.00% from pure two-sided live market spot OR when spot is unavailable/stale (>45s). `removeLiquidity` always remains open.",
  },
  {
    id: "G-04",
    title: "5.00% Swap Price Impact Cap",
    thresholdOrRule: `SWAP_MAX_PRICE_IMPACT_BPS = ${SWAP_MAX_PRICE_IMPACT_BPS} bps (5.00%)`,
    enforcementLayer: "`assessStableSwap` (`lib/achswap.ts`)",
    description:
      "Disables swap execution whenever `priceImpactBps > 500` (rounded up conservatively via `Math.ceil`).",
  },
  {
    id: "G-05",
    title: "20.00% Swap Spot Value-Loss Cap & Pure Mid-Spot Reference",
    thresholdOrRule: `SWAP_MAX_VALUE_LOSS_BPS = ${SWAP_MAX_VALUE_LOSS_BPS} bps (20.00%)`,
    enforcementLayer: "`assessStableSwap` + Two-Sided `spotOnly: true` Mid-Spot",
    description:
      "Compares swap output against an unskewed two-sided 1-unit market spot quote (never assuming 1 EURC == 1 USD). Blocks execution if shortfall exceeds 20.00% or if both spot reference and `priceImpactBps` are unavailable.",
  },
  {
    id: "G-06",
    title: "Single-Pass Verified Allowance (`tx.wait(1)` + Propagation Poll)",
    thresholdOrRule: "`approval.token === tokenIn` + `receipt.status === 1` + `allowance >= amount`",
    enforcementLayer: "`ensureExactAllowance` / Swap, Vaults, Liquidity",
    description:
      "Requests `/swap` first (zero premature blind approvals), verifies `approval.token === tokenIn` and `minAmountOut >= acceptedMinOut`, mines `approve`, polls on-chain `allowance`, and fetches fresh `/swap` calldata before signing.",
  },
  {
    id: "G-07",
    title: "Pre-Sign `eth_call` Simulation, Gas +15% & Envelope Gate",
    thresholdOrRule: "Checksummed non-zero `to` (!== 0xeeee...eeee), `0x` hex `data >= 10`, `eth_call`, `estimateGas * 1.15`",
    enforcementLayer: "`prepareAndSendTx` & `assertTransactionRequest`",
    description:
      "Validates transaction target and calldata, static-simulates via `eth_call` with human-readable revert decoding, adds a 15% gas safety buffer, and confirms native USDC covers `value + gasLimit * feePrice`.",
  },
  {
    id: "G-08",
    title: "Strict Server & Deployer Credential Isolation",
    thresholdOrRule: "`ACHSWAP_API_KEY` in `.env.local` only; `PRIVATE_KEY` in `.env.hardhat` only",
    enforcementLayer: "`lib/achswap-server.ts`, `hardhat.config.ts` & `next.config.ts`",
    description:
      "Browser never sees routing API keys, `.env.hardhat` keeps deployer private keys out of Next.js server memory, and `next.config.ts` enforces `X-Frame-Options: DENY` and `frame-ancestors 'none'`.",
  },
  {
    id: "G-09",
    title: "Consecutive 48h `DailyGM` Fee Authority & Targeted 0-bps Fallback",
    thresholdOrRule: "`getEffectiveStreak` (`<=48h`) -> `20 | 10 | 5 | 0 bps` to `0x9AFe...d372`",
    enforcementLayer: "`withProtocolFee` & `app/api/achswap/[action]/route.ts`",
    description:
      "Client `feeBps` is ignored. Server reads `DailyGM.getEffectiveStreak` (returning 0 if >48h expired) and applies 3-tier discounts; if upstream rejects partner-fee fields (400/422 citing fee/partner), proxy retries once at `0 bps`.",
  },
  {
    id: "G-10",
    title: "Immutable 1-Wallet-1-.nex & Revert-Safe Bidirectional Verification",
    thresholdOrRule: "`!hasDomain(sender)` && `isAvailable(label)` && `resolve(label) === wallet`",
    enforcementLayer: "`NexNameService` + `lib/contracts.ts`",
    description:
      "Each wallet binds at most one permanent `.nex` domain. Lookups pre-check `hasDomain`/`isAvailable` to avoid revert exceptions, rethrow genuine RPC outages, and require forward+reverse match before granting Verified Pass status.",
  },
] as const;

export type TroubleshootingRow = {
  symptomOrCode: string;
  module: string;
  rootCause: string;
  resolution: string;
};

export const TROUBLESHOOTING_MATRIX: readonly TroubleshootingRow[] = [
  {
    symptomOrCode: "Wrong network / Transactions disabled",
    module: "Global Wallet Gate",
    rootCause: "Connected wallet is not on Arc Mainnet (Chain ID 5042 / 0x13b2).",
    resolution:
      "Click `Switch to Arc Mainnet` in the top banner or add RPC `https://rpc.mainnet.arc.io`, Chain ID `5042` (`0x13b2`), Symbol `USDC` (18 decimals).",
  },
  {
    symptomOrCode: "MISSING_API_KEY (HTTP 401)",
    module: "Nexio Swap / Market Spot",
    rootCause: "`ACHSWAP_API_KEY` is missing or blank in server `.env.local`.",
    resolution:
      "Set `ACHSWAP_API_KEY=<your_key>` in `.env.local` (never prefixed with `NEXT_PUBLIC_`) and restart `npm run dev` / `npm start`.",
  },
  {
    symptomOrCode: "UNAUTHORIZED (HTTP 401 / 403)",
    module: "Swap Routing Proxy",
    rootCause: "Upstream routing engine rejected the configured server `ACHSWAP_API_KEY`.",
    resolution: "Verify key validity and active permissions, update `.env.local`, and restart the Next.js server.",
  },
  {
    symptomOrCode: "NO_ROUTE (HTTP 400 / 404)",
    module: "Nexio Swap",
    rootCause: "No executable Arc Mainnet USDC/EURC liquidity route exists for the requested trade size.",
    resolution: "Reduce `amountIn` to match available pool depth and request a fresh quote.",
  },
  {
    symptomOrCode: "SIMULATION_FAILED (HTTP 400 / 422)",
    module: "Nexio Swap",
    rootCause: "On-chain simulation reverted due to unmined token approval, moved quote, or insufficient gas headroom.",
    resolution:
      "Wait for Step 1 (`approve` + `tx.wait(1)`) confirmation, leave `0.005 USDC` for gas, and refresh the quote.",
  },
  {
    symptomOrCode: "RATE_LIMITED / CONCURRENCY_LIMITED (HTTP 429)",
    module: "Swap Routing Proxy",
    rootCause: "Exceeded 60 req/60s per-IP proxy window or upstream concurrency after 3 automatic backoff retries.",
    resolution: "Pause 2–5 seconds before re-quoting; identical quotes within 3s automatically share cached responses.",
  },
  {
    symptomOrCode: "Swap disabled (Price impact > 5% or Value loss > 20%)",
    module: "Nexio Swap",
    rootCause: "`assessStableSwap` tripped because `priceImpactBps > 500`, shortfall vs pure 1-unit spot exceeded `2000 bps`, or spot quote expired (>45s).",
    resolution: "Trade a smaller amount or wait for the two-sided 1-unit market spot quote to refresh.",
  },
  {
    symptomOrCode: "Add blocked: pool skew",
    module: "Liquidity (V2 Pool)",
    rootCause: "V2 USDC/EURC reserve ratio differs by > 5.00% (`500 bps`) from live 1-EURC market spot, or spot quote is unavailable/stale.",
    resolution:
      "Wait for V2 pool arbitrage parity (`<= 5.00%`) before adding liquidity; `Remove Liquidity` always stays unlocked.",
  },
  {
    symptomOrCode: "No NLP available to claim",
    module: "Automated Vaults & NLP",
    rootCause: "`claimNLP()` was called when `getPendingNLP(wallet) == 0` (no active stake time elapsed since last claim/deposit).",
    resolution:
      "Stake USDC or EURC first (`$100 USD` staked accrues exact `10.00 NLP` per `24h` / `86,400s`) and claim once pending NLP > 0.",
  },
  {
    symptomOrCode: "Daily GM streak reset to 1 or Wait 24 hours before next GM",
    module: "Daily GM",
    rootCause: "`DailyGM` enforces a `24h` minimum cooldown AND a strict `48h` consecutive window (`block.timestamp > lastCheckIn + 48h` resets streak to `1`).",
    resolution:
      "Check in once every `24h–48h` window against L1 `blockTimestamp` to advance consecutively toward `30D`, `90D`, and `180D VIP` tiers.",
  },
  {
    symptomOrCode: "CALL_EXCEPTION on resolve() or resolveByAddress()",
    module: ".nex Domains / Scripts",
    rootCause: "`NexNameService.resolve(name)` and `resolveByAddress(owner)` execute `require(...)` and revert when unregistered.",
    resolution:
      "Always pre-check `isAvailable(label)` before `resolve(label)` and `hasDomain(owner)` before `resolveByAddress(owner)`.",
  },
  {
    symptomOrCode: "Domain rejected (.eth / .arc / invalid chars) or Already owns domain",
    module: ".nex Domains",
    rootCause: "Input contained foreign TLDs/dots/uppercase/symbols, or `hasDomain(wallet)` is already `true`.",
    resolution:
      "Enter a 1–63 char lowercase `[a-z0-9-]` label (no leading/trailing hyphen), or click `Recover My Domain` to sync your bound `.nex` name.",
  },
  {
    symptomOrCode: ".nex Domain or History missing after clearing browser data",
    module: "Nexio Pass & History",
    rootCause: "Local browser storage was cleared while Arc Mainnet state remains permanent.",
    resolution:
      "Use `Recover My Domain` (`hasDomain` + `resolveByAddress` + `resolve` check) and open `History` (`eth_getLogs` indexes both active and legacy contracts).",
  },
] as const;

export type ModuleFlowSpec = {
  num: string;
  id: string;
  title: string;
  subtitle: string;
  svgPath: string;
  svgAlt: string;
  contractsAndRoutes: string;
  summary: string;
  invariants: readonly string[];
};

export const MODULE_FLOW_SPECS: readonly ModuleFlowSpec[] = [
  {
    num: "01",
    id: "dashboard",
    title: "Dashboard, QR Request & Multi-Recipient Batch Settlement",
    subtitle: "Shared 18/6-dec USDC, EURC, local ISO QR, and EIP-5792 / sequential batch fan-out",
    svgPath: DOCS_MOTION_SVGS.batch,
    svgAlt: "Dashboard Send and Multi-Recipient Batch Settlement animated pipeline",
    contractsAndRoutes: "Native USDC, EURC (0xbEf5…21c1), NexNameService.resolve, EIP-5792 wallet_sendCalls / prepareAndSendTx",
    summary:
      "Resolves single and comma-separated `.nex` recipients via Multicall3 read batching, reserves `0.005 USDC` (scaled × N in sequential fallback) for L1 gas, generates zero-leak on-device SVG payment QRs, and executes multi-recipient transfers up to `5 / 20 / 50 / Unlimited` recipients.",
    invariants: [
      "Batch recipient cap is governed by consecutive DailyGM tier (5 default -> 20 at 30D -> 50 at 90D -> Unlimited at 180D VIP).",
      "Multicall3 (0xcA11…CA11) is strictly read-only (`batchResolveRecipients`) and never called for ERC-20 `transfer` writes.",
      "Includes 1-click `Retry Remaining` recovery if any leg is rejected in sequential wallet mode.",
    ],
  },
  {
    num: "02",
    id: "portfolio",
    title: "Portfolio, Automated Vaults & Exact 1e18 NLP Engine",
    subtitle: "$100 USD staked = exact 10.00 NLP / 24h (86,400s) + real on-chain claimNLP() + pure two-sided spot",
    svgPath: DOCS_MOTION_SVGS.vaults,
    svgAlt: "Automated Yield Vaults and Exact 1e18 NLP Accrual Engine animated diagram",
    contractsAndRoutes: `NexioUSDCVault (${USDC_VAULT_ADDRESS.slice(0, 6)}…${USDC_VAULT_ADDRESS.slice(-4)}), NexioVault [EURC] (${EURC_VAULT_ADDRESS.slice(0, 6)}…${EURC_VAULT_ADDRESS.slice(-4)}), Pure Two-Sided Spot`,
    summary:
      "Computes exact BigInt Net Worth across single-counted wallet USDC, 1:1 staked Vault USDC/EURC, and V2 LP underlying marked against unskewed two-sided market spot (`spotOnly: true, feeBps: 0`), while accruing continuous `1e18` NLP settled on-chain via `claimNLP()`.",
    invariants: [
      "Native USDC (18-dec) and ERC-20 USDC (6-dec) are counted once (`native / 10^12`); LP underlying is included in Net Worth.",
      "`deltaPoints18 = (stakedBalance * 1e12 * elapsed) / 864000` yields exact `10.00 NLP / $100 USD / 24h` across both USDC and spot-normalized EURC.",
      "`claimNLP()` settles `accruedPoints` into `claimedPoints` on-chain and emits `NLPClaimed` (zero self-transfers).",
    ],
  },
  {
    num: "03",
    id: "swap",
    title: "Nexio Swap (Protected Execution Pipeline)",
    subtitle: "Server-isolated credentials, consecutive streak fee discounts, single-pass allowance, and dual price guards",
    svgPath: DOCS_MOTION_SVGS.swap,
    svgAlt: "Nexio Swap Execution Pipeline animated diagram",
    contractsAndRoutes: "POST /api/achswap/quote, POST /api/achswap/swap, DailyGM.getEffectiveStreak, Dynamic Settlement Executor",
    summary:
      "Streams debounced quotes through the Next.js server routing proxy, applies active consecutive streak discounts (`20 / 10 / 5 / 0 bps`), enforces `<= 5.00%` impact and `<= 20.00%` spot value-loss circuit breakers, mines exact `approval.spender` (`tx.wait(1)` + poll), and pre-simulates `swap.tx`.",
    invariants: [
      "Receive & Min Received display verbatim `amountOut` and `minAmountOut` with zero synthetic formulas.",
      "Single-pass `/swap` flow verifies `approval.token === tokenIn` and `swap.minAmountOut >= acceptedMinOut` before signing.",
      "Targeted fee fallback retries `0 bps` only on partner-fee rejections (`400`/`422`), never on `NO_ROUTE` or `SIMULATION_FAILED`.",
    ],
  },
  {
    num: "04",
    id: "liquidity",
    title: "USDC/EURC V2 Liquidity Pool & ±5% Reserve-Skew Guard",
    subtitle: "Constant-product provisioning protected against stale or arbitraged reserve ratios",
    svgPath: DOCS_MOTION_SVGS.liquidity,
    svgAlt: "USDC/EURC Liquidity Pool and 5 percent Reserve-Skew Guard animated diagram",
    contractsAndRoutes: "Nexio V2 Router (0x52FE…4AFD), V2 Factory (0xb0C2…C530), USDC/EURC Pair, Pure Two-Sided Spot",
    summary:
      "Reads live V2 `getReserves()` and `totalSupply()`, auto-quotes balanced deposit legs via `router.quote()`, blocks `addLiquidity` when pool ratio diverges `> 5.00%` (`500 bps`) from fresh (`<= 45s`) market spot, and keeps `removeLiquidity` unconditionally open.",
    invariants: [
      "Symmetric divergence `> 500 bps` or missing/expired (`> 45s`) spot hard-locks `addLiquidity` (including empty-pool init).",
      "`removeLiquidity` is never blocked by pool skew so LPs retain unconditional exit.",
      "Parses settled `Transfer` receipt logs on withdrawal for exact returned `USDC` & `EURC` reporting.",
    ],
  },
  {
    num: "05",
    id: "dailygm",
    title: "Consecutive Daily GM Protocol & 3 Unlockable Tiers",
    subtitle: "24h cooldown + strict 48h consecutive window unlocking 30D, 90D, and 180D VIP protocol status",
    svgPath: DOCS_MOTION_SVGS.dailyGm,
    svgAlt: "Consecutive Daily GM Protocol and 3 Unlockable Tiers animated diagram",
    contractsAndRoutes: `DailyGM (${DAILY_GM_ADDRESS.slice(0, 6)}…${DAILY_GM_ADDRESS.slice(-4)}), lib/gm-tiers.ts, getEffectiveStreak / getStreakWindow`,
    summary:
      "Enforces a 24-hour check-in cooldown and a 48-hour consecutive expiry window on Arc Mainnet. Progresses from `0–29D` Unranked Building (`20 bps` / `5` batch) into **strictly 3 unlockable consecutive tiers**: `30D` Tier 1 (`10 bps` / `20` batch), `90D` Tier 2 (`5 bps` / `50` batch), and `180D` Tier 3 VIP (`0 bps` / `Unlimited` batch).",
    invariants: [
      "Missing the 48-hour window (`block.timestamp > lastCheckIn + 48h`) resets `streak` to `1` on next check-in; `getEffectiveStreak` returns `0` immediately.",
      "Strictly 3 unlockable milestone tiers (`30D`, `90D`, `180D VIP`); zero inflationary token emissions.",
      "12-hour pre-expiry warning surfaces whenever `streakExpiresInSec <= 43,200`.",
    ],
  },
  {
    num: "06",
    id: "domains",
    title: "Nexio Domains (.nex Name Service)",
    subtitle: "Permanent 1-wallet-1-domain registry with revert-safe forward & reverse resolution",
    svgPath: DOCS_MOTION_SVGS.identity,
    svgAlt: "Permanent .nex Identity and Sovereign Pass Recovery animated diagram",
    contractsAndRoutes: "NexNameService (0xE3Fd…5Ed7) — hasDomain, isAvailable, register, resolve, resolveByAddress",
    summary:
      "Validates strict lowercase `[a-z0-9-]{1,63}` labels (rejecting `.eth`, `.arc`, underscores, and invalid hyphens), pre-checks `hasDomain(wallet)` and `isAvailable(label)`, registers permanent `.nex` bindings, and separates RPC transport errors from taken-domain states.",
    invariants: [
      "1 Wallet = at most 1 permanent `.nex` domain (`_hasDomain[msg.sender]` enforced on-chain).",
      "Registered labels never expire, transfer, or overwrite (`_isRegistered[_name]` permanent).",
      "`isAvailable` / `hasDomain` always run before `resolve` / `resolveByAddress` to avoid revert exceptions.",
    ],
  },
  {
    num: "07",
    id: "pass",
    title: "Nexio Pass & Sovereign Identity Recovery",
    subtitle: "Bidirectional on-chain handshake & deterministic 3× DPI HTML5 Canvas PNG export",
    svgPath: DOCS_MOTION_SVGS.identity,
    svgAlt: "Nexio Pass Sovereign On-Chain Identity Verification animated diagram",
    contractsAndRoutes: "NexNameService (`hasDomain` + `resolveByAddress` + `resolve`), PassExporter.ts (3× Canvas 2D)",
    summary:
      "Verifies connected wallet identity on Arc Mainnet (`5042`) by cross-checking `resolveByAddress(wallet)` against forward `resolve(label) === wallet`, recovering bindings even after browser storage is cleared, and exports a 1.586:1 tier-themed fintech Pass card locally.",
    invariants: [
      "Header & Pass blue verification checkmarks require verified bidirectional on-chain match (`passVerified === true`).",
      "Rendered at ISO ID-1 1.586:1 proportions (24px radius, tier-matched metallic gradients, blue-gradient `.nex`) on local 3× 2D Canvas with zero external CDN scripts.",
      "1-click `Recover Bound .nex Domain` restores profile & Pass state directly from `0xE3Fd…5Ed7`.",
    ],
  },
  {
    num: "08",
    id: "history",
    title: "Adaptive eth_getLogs History Indexer & SSOT Specs",
    subtitle: "5,000-block event scanner (active + legacy contracts) & single-source /docs, /docs.txt, /llms.txt",
    svgPath: DOCS_MOTION_SVGS.history,
    svgAlt: "Adaptive eth_getLogs History Indexer and SSOT Spec Pipeline animated diagram",
    contractsAndRoutes: "lib/history.ts (`eth_getLogs`), lib/protocol-spec.ts, /docs, /docs.txt, /llms.txt",
    summary:
      "Scans Arc Mainnet `Transfer`, `Deposited`, `Withdrawn`, `NLPClaimed`, `CheckedIn`, and `DomainRegistered` logs across both active and legacy contract generations in 5,000-block adaptive windows, while `lib/protocol-spec.ts` keeps all documentation endpoints synchronized.",
    invariants: [
      "Automatic binary block-range halving on RPC limits + `${txHash}:${logIndex}` deterministic deduplication.",
      "Indexes both current (`0x1A85…`, `0x77e4…`, `0xfE12…`) and legacy (`0x609A…`, `0x0457…`, `0xb30c…`) deployments.",
      "`/docs`, `/docs.txt`, `/llms.txt`, and `README.md` share one canonical specification source.",
    ],
  },
] as const;

export function buildDocsTxt(): string {
  const lines: string[] = [
    "NEXIO PROTOCOL — ARC MAINNET DEVELOPER & ARCHITECTURE SPECIFICATION",
    "===================================================================",
    `${NETWORK_SPEC.tagline}`,
    "",
    "1. NETWORK, DUAL-DECIMAL USDC & PURE SPOT ARCHITECTURE",
    "------------------------------------------------------",
    `Protocol          : ${NETWORK_SPEC.protocolName}`,
    `Network Name      : ${NETWORK_SPEC.name}`,
    `Chain ID          : ${NETWORK_SPEC.chainId} (${NETWORK_SPEC.chainIdHex})`,
    `RPC Endpoint      : ${NETWORK_SPEC.rpcUrl} (supports comma-separated NEXT_PUBLIC_ARC_RPC_URLS failover)`,
    `Block Explorer    : ${NETWORK_SPEC.explorerUrl}`,
    `Native Gas Asset  : ${NETWORK_SPEC.nativeCurrency.symbol} (${NETWORK_SPEC.nativeCurrency.decimals} decimals)`,
    `USDC ERC-20       : ${USDC_ERC20_ADDRESS} (${NETWORK_SPEC.erc20UsdcDecimals} decimals — shared balance with native USDC, scaled by 10^12)`,
    `EURC ERC-20       : ${EURC_ADDRESS} (${NETWORK_SPEC.eurcDecimals} decimals)`,
    `Native Gas Buffer : ${NETWORK_SPEC.gasBufferUsdc} USDC (${NETWORK_SPEC.gasBufferNativeWei} native wei / ${NETWORK_SPEC.gasBufferErc20Units} ERC-20 units) reserved on Max`,
    `Vault NLP Rate    : ${NETWORK_SPEC.nlpAccrualRateSummary}`,
    `Daily GM Window   : ${NETWORK_SPEC.gmCooldownSeconds}s (24h) cooldown | ${NETWORK_SPEC.gmExpiryWindowSeconds}s (48h) consecutive reset window`,
    `Solidity Compiler : ${NETWORK_SPEC.solidityCompiler}`,
    `Fee Treasury      : ${NETWORK_SPEC.feeRecipient} (override via server ACHSWAP_FEE_RECIPIENT; default ${NETWORK_SPEC.defaultFeeRecipient})`,
    "",
    "Dual-Decimal & Pure Spot Invariants:",
    "- Native USDC (eth_getBalance, 18 decimals) and ERC-20 USDC (0x3600000000000000000000000000000000000000, 6 decimals) read and mutate ONE shared account balance (`poolUsdcFromNative(raw18) = raw18 / 10^12`).",
    "- Never sum native USDC + ERC-20 USDC in Portfolio Net Worth, and never call WETH9 deposit()/withdraw() on 0x3600...0000.",
    `- Pure Unskewed Two-Sided Market Spot: ${ROUTING_API_SPEC.pureSpotPolicy}`,
    "",
    "2. DEPLOYED CONTRACTS, TOKENS & INFRASTRUCTURE (ARC MAINNET 5042)",
    "-----------------------------------------------------------------",
  ];

  for (const c of CONTRACT_SPECS) {
    lines.push(`${c.name} [${c.solidityName}]`);
    lines.push(`  Address       : ${c.address}`);
    if (c.legacyAddress) lines.push(`  Legacy Addr   : ${c.legacyAddress} (historical eth_getLogs indexing only)`);
    lines.push(`  Category      : ${c.category}${c.sourceFile ? ` (${c.sourceFile})` : ""}`);
    lines.push(`  Decimals      : ${c.decimals}`);
    if (c.deploymentTx) lines.push(`  Deployment Tx : ${NETWORK_SPEC.explorerUrl}/tx/${c.deploymentTx}`);
    if (c.envOverrideVar) lines.push(`  Env Override  : ${c.envOverrideVar}`);
    lines.push(`  Role          : ${c.role}`);
    lines.push(`  Note          : ${c.integrationNote}`);
    if (c.readFunctions.length > 0) {
      lines.push("  Read ABI      :");
      for (const fn of c.readFunctions) lines.push(`    - ${fn}`);
    }
    if (c.writeFunctions.length > 0) {
      lines.push("  Write ABI     :");
      for (const fn of c.writeFunctions) lines.push(`    - ${fn}`);
    }
    if (c.events.length > 0) {
      lines.push("  Events        :");
      for (const ev of c.events) lines.push(`    - ${ev}`);
    }
    if (c.reverts.length > 0) {
      lines.push(`  Reverts       : ${c.reverts.join(" | ")}`);
    }
    lines.push("");
  }

  lines.push(
    "3. SERVER SWAP ROUTING PROXY API (/api/achswap/quote & /api/achswap/swap)",
    "-------------------------------------------------------------------------",
    `Local Routes      : POST ${ROUTING_API_SPEC.proxyQuotePath} | POST ${ROUTING_API_SPEC.proxySwapPath}`,
    `Auth Isolation    : ${ROUTING_API_SPEC.authentication}`,
    `Timeout & Limits  : ${ROUTING_API_SPEC.upstreamTimeoutMs} ms upstream timeout | ${ROUTING_API_SPEC.ipRateLimit}`,
    `Pure Spot Engine  : ${ROUTING_API_SPEC.pureSpotPolicy}`,
    `Quote Caching     : ${ROUTING_API_SPEC.quoteCachePolicy}`,
    `Swap Caching      : ${ROUTING_API_SPEC.swapCachePolicy}`,
    `Streak Fee Lookup : ${ROUTING_API_SPEC.streakLookupPolicy}`,
    `HTTP 429 Retry    : ${ROUTING_API_SPEC.rateLimitRetryPolicy}`,
    `Fee Fallback      : ${ROUTING_API_SPEC.feeFallbackPolicy}`,
    "",
    "Quote Request Body (POST /api/achswap/quote):",
  );

  for (const f of ROUTING_API_SPEC.quoteRequestFields) {
    lines.push(`  - ${f.field} (${f.type}, ${f.required ? "required" : "optional"}): ${f.validationAndBehavior}`);
  }
  lines.push("", "Additional Swap Request Fields (POST /api/achswap/swap):");
  for (const f of ROUTING_API_SPEC.swapAdditionalRequestFields) {
    lines.push(`  - ${f.field} (${f.type}, ${f.required ? "required" : "optional"}): ${f.validationAndBehavior}`);
  }
  lines.push("", "Normalized Client Response Fields:");
  for (const f of ROUTING_API_SPEC.normalizedResponseFields) {
    lines.push(`  - ${f.field} (${f.type}): ${f.validationAndBehavior}`);
  }
  lines.push("", "Error Envelope (`{ error: { code, message, reason? } }`):");
  for (const e of ROUTING_API_SPEC.errorMatrix) {
    lines.push(`  - HTTP ${e.httpStatus} | ${e.code} [${e.layer}]: ${e.meaningAndHandling} (Retry: ${e.retryPolicy})`);
  }

  lines.push(
    "",
    "4. CONSECUTIVE DAILY GM PROTOCOL (3 UNLOCKABLE TIERS) & BATCH TRANSFERS",
    "-----------------------------------------------------------------------",
    "On-chain `DailyGM.checkIn()` enforces a 24h cooldown (`block.timestamp >= lastCheckIn + 24 hours`) AND a strict 48h consecutive window: if `block.timestamp > lastCheckIn + 48 hours`, `streak` resets to `1` on check-in and `getEffectiveStreak(user)` returns `0` immediately.",
    `  - ${UNRANKED_GM_SPEC.label} (${UNRANKED_GM_SPEC.rangeLabel}): feeBps = ${UNRANKED_GM_SPEC.feeBps} (${UNRANKED_GM_SPEC.discountLabel}) | Batch Cap = ${UNRANKED_GM_SPEC.batchLimit} recipients | ${UNRANKED_GM_SPEC.perk}`,
  );
  for (const t of GM_TIER_SPECS) {
    const cap = t.batchLimit === null ? "Unlimited" : `${t.batchLimit} recipients`;
    lines.push(`  - ${t.name} — ${t.label} (${t.rangeLabel}): feeBps = ${t.feeBps} (${t.discountLabel}) | Batch Cap = ${cap} | Badge: ${t.badge} | ${t.perk}`);
  }
  lines.push(
    "",
    "Batch Execution Rule:",
    "  - Multi-recipient batch transfers execute via EIP-5792 `wallet_sendCalls` when supported by the connected wallet, with automatic fallback to sequential `prepareAndSendTx` transactions and per-recipient retry tracking.",
    `  - Multicall3 (${MULTICALL3_CANONICAL_ADDRESS}) is used STRICTLY for batched eth_call reads (aggregate3) and NEVER for ERC-20 transfer writes.`,
    "",
    "5. .NEX IDENTITY, AUTOMATED VAULTS / NLP & LP SKEW GUARD",
    "--------------------------------------------------------",
    "- .nex Domains (`NexNameService`): 1 wallet = 1 permanent `.nex` name; labels are normalized lowercase `[a-z0-9-]{1,63}` without `.nex` (rejecting `.eth`/`.arc`). Always pre-check `isAvailable(label)` before `resolve(label)` and `hasDomain(wallet)` before `resolveByAddress(wallet)` because unregistered lookups revert.",
    "- Sovereign Recovery: Clearing browser storage never affects on-chain ownership. Identity Vault / Nexio Pass calls `hasDomain(wallet)` -> `resolveByAddress(wallet)` -> verifies `resolve(label) === wallet`.",
    "- Automated Vaults & Exact NLP Math: `NexioUSDCVault` (`0x77e4...e599`) and `NexioVault` [EURC] (`0xfE12...4CB7`) custody 1:1 6-decimal principal and accrue 18-decimal NLP via `deltaPoints18 = (stakedBalance * 1e12 * elapsed) / 864000` (`$100 USD` staked = exact `10.00 NLP` per `24h`, USD-normalized for EURC via `computeUsdScaledVaultNlp18`). Pending NLP settles on-chain via `claimNLP()` emitting `NLPClaimed`.",
    `- Liquidity Skew Guard: Compares V2 USDC/EURC reserve ratio against pure two-sided 1-EURC live market spot. Symmetric divergence > ${LP_MAX_SKEW_BPS} bps (5.00%) or missing/stale (>45s) spot blocks addLiquidity; removeLiquidity stays open at all times.`,
    "",
    "6. SECURITY GUARDRAILS",
    "----------------------",
  );

  for (const g of SECURITY_GUARDRAILS) {
    lines.push(`  [${g.id}] ${g.title} (${g.thresholdOrRule}) — ${g.description}`);
  }

  lines.push("", "7. DEVELOPER & USER TROUBLESHOOTING MATRIX", "------------------------------------------");
  for (const row of TROUBLESHOOTING_MATRIX) {
    lines.push(`  * ${row.symptomOrCode} [${row.module}]`);
    lines.push(`    Cause : ${row.rootCause}`);
    lines.push(`    Fix   : ${row.resolution}`);
  }

  return `${lines.join("\n")}\n`;
}

export function buildLlmsTxt(): string {
  const contractLines = CONTRACT_SPECS.map((c) => {
    const txPart = c.deploymentTx ? ` — Deploy Tx: ${NETWORK_SPEC.explorerUrl}/tx/${c.deploymentTx}` : "";
    return `- **${c.name}** (\`${c.solidityName}\`): \`${c.address}\` (${c.decimals})${txPart} — ${c.role} ${c.integrationNote}`;
  }).join("\n");

  const abiLines = CONTRACT_SPECS.filter((c) => c.category === "protocol")
    .map((c) => {
      const fns = [...c.readFunctions, ...c.writeFunctions, ...c.events].map((sig) => `  - \`${sig}\``).join("\n");
      const rev = c.reverts.length ? `\n  - Reverts: ${c.reverts.map((r) => `\`${r}\``).join(", ")}` : "";
      return `### ${c.name} (\`${c.address}\`)\n${fns}${rev}`;
    })
    .join("\n\n");

  const tierRows = [
    `| ${UNRANKED_GM_SPEC.name} | ${UNRANKED_GM_SPEC.rangeLabel} | ${UNRANKED_GM_SPEC.feeBps} bps (${UNRANKED_GM_SPEC.discountLabel}) | ${UNRANKED_GM_SPEC.batchLimit} | ${UNRANKED_GM_SPEC.perk} |`,
    ...GM_TIER_SPECS.map((t) => {
      const cap = t.batchLimit === null ? "Unlimited" : `${t.batchLimit}`;
      return `| **${t.name} (${t.label})** | ${t.rangeLabel} | ${t.feeBps} bps (${t.discountLabel}) | ${cap} | ${t.perk} |`;
    }),
  ].join("\n");

  const guardrailLines = SECURITY_GUARDRAILS.map(
    (g) => `- **${g.id} ${g.title}** (\`${g.thresholdOrRule}\`): ${g.description}`
  ).join("\n");

  const errorLines = ROUTING_API_SPEC.errorMatrix
    .map((e) => `| \`${e.httpStatus}\` | \`${e.code}\` | ${e.layer} | ${e.retryPolicy} | ${e.meaningAndHandling} |`)
    .join("\n");

  return `# ${NETWORK_SPEC.protocolName}

> ${NETWORK_SPEC.tagline} (Chain ID \`${NETWORK_SPEC.chainId}\` / \`${NETWORK_SPEC.chainIdHex}\`).

## Canonical Documentation & Machine Specs

- [Interactive Developer Portal](/docs): Full architecture explorer, 8 animated SVG protocol flows, verified ABIs, routing proxy schemas, security guardrails, and troubleshooting matrix.
- [Plain-Text Protocol Manual](/docs.txt): Complete CLI- and curl-friendly plain-text specification derived from \`lib/protocol-spec.ts\`.
- [Arc Mainnet Block Explorer](${NETWORK_SPEC.explorerUrl}): Verify contracts, token precompiles, and settlement receipts on Chain ID \`${NETWORK_SPEC.chainId}\`.

## Arc Mainnet Network, Dual-Decimal USDC & Pure Market Spot

- **Network**: ${NETWORK_SPEC.name} — Chain ID \`${NETWORK_SPEC.chainId}\` (\`${NETWORK_SPEC.chainIdHex}\`), RPC \`${NETWORK_SPEC.rpcUrl}\`, Explorer \`${NETWORK_SPEC.explorerUrl}\`.
- **Shared Native / ERC-20 USDC State**: Native gas \`USDC\` (\`eth_getBalance\`, \`18\` decimals) and ERC-20 \`USDC\` (\`${USDC_ERC20_ADDRESS}\`, \`6\` decimals) share one underlying balance scaled by \`10^12\` (\`1 USDC = 10^18 wei = 10^6 ERC-20 units\`). Never sum both in Net Worth, and never call WETH9 \`deposit()\`/\`withdraw()\` on \`${USDC_ERC20_ADDRESS}\`.
- **Pure Unskewed Two-Sided EURC Spot**: \`${EURC_ADDRESS}\` (\`6\` decimals) is valued via parallel \`1 EURC -> USDC\` and \`1 USDC -> EURC\` quotes (\`spotOnly: true, feeBps: 0\`), computing exact mid-spot \`(bidOut + impliedAskOut + 1n) / 2n\` when spread \`<= 400 bps\` (\`30s\` TTL, \`45s\` hard staleness ceiling).
- **Exact Vault NLP Rate & On-Chain Claim**: \`deltaPoints18 = (stakedBalance * 1e12 * elapsed) / 864000\` (\`$100 USD\` staked = exact \`10.00 NLP\` per \`24h\` / \`86,400s\`, USD-normalized for EURC via \`computeUsdScaledVaultNlp18\`), settled on-chain via \`claimNLP()\` emitting \`NLPClaimed\`.
- **Max Spend Gas Buffer**: \`${NETWORK_SPEC.gasBufferUsdc} USDC\` (\`${NETWORK_SPEC.gasBufferNativeWei}\` native wei / \`${NETWORK_SPEC.gasBufferErc20Units}\` ERC-20 units) reserved across Send, Batch Send, Swap, Vault Stake, and Liquidity Add.

## Deployed Contracts, Tokens & Infrastructure

${contractLines}
- **Protocol Fee Treasury**: \`${NETWORK_SPEC.feeRecipient}\` (server env \`ACHSWAP_FEE_RECIPIENT\`, default \`${NETWORK_SPEC.defaultFeeRecipient}\`).

## Verified Protocol Contract ABIs & Revert Semantics

${abiLines}

## Server Swap Routing Proxy API (\`POST /api/achswap/quote\` & \`POST /api/achswap/swap\`)

- **Key Isolation**: \`ACHSWAP_API_KEY\` stays strictly server-only (\`.env.local\`); \`PRIVATE_KEY\` stays strictly in \`.env.hardhat\`.
- **Caching & Retries**: Quotes deduplicate in-flight requests and cache 2xx responses for \`3,000 ms\` (max \`200\` keys); swaps are never cached (\`Cache-Control: no-store\`). Both \`/quote\` and \`/swap\` enforce an \`8,000 ms\` timeout, \`60 req/60s\` per-IP rate limit, and \`[0, 400, 900] ms\` HTTP \`429\` backoff (\`Retry-After <= 5,000 ms\`).
- **Consecutive Streak Fee & Targeted Fallback**: Server ignores client \`feeBps\`, calls \`DailyGM.getEffectiveStreak(trader || sender)\` (\`60s\` cache + \`stale-if-error\`; \`0\` if \`>48h\` expired), and injects \`feeBps\` (\`20 | 10 | 5 | 0\`) + \`feeRecipient\` (omitted at \`0 bps\`). If upstream returns \`400\`/\`422\` referencing \`fee\`/\`feebps\`/\`feerecipient\`/\`partner\` while \`feeBps > 0\`, the proxy retries once with \`feeBps: 0\`.
- **Quote Request JSON**: \`{ chainId?: 5042, tokenIn: "0x...", tokenOut: "0x...", amountIn: "1000000", slippageBps: 0..${ACHSWAP_MAX_SLIPPAGE_BPS}, spotOnly?: boolean, trader?: "0x..." }\`
- **Swap Request JSON**: \`{ chainId?: 5042, tokenIn: "0x...", tokenOut: "0x...", amountIn: "1000000", slippageBps: 0..${ACHSWAP_MAX_SLIPPAGE_BPS}, sender: "0x...", recipient?: "0x..." }\`

### Proxy & Client Error Matrix (\`{ error: { code, message, reason? } }\`)

| HTTP | Code | Layer | Retry Policy | Meaning & Handling |
| --- | --- | --- | --- | --- |
${errorLines}

## Consecutive Daily GM Tiers (3 Unlockable Tiers) & Batch Execution

\`DailyGM.checkIn()\` (\`${DAILY_GM_ADDRESS}\`) enforces a \`24h\` cooldown and a strict \`48h\` consecutive window (\`streak\` resets to \`1\` if \`>48h\` elapse; \`getEffectiveStreak\` returns \`0\` immediately upon expiry).

| Profile / Tier | Consecutive Window | Protocol Swap Fee | Batch Cap | Unlocked Utility |
| --- | --- | --- | --- | --- |
${tierRows}

- **Batch Reads vs Batch Writes**: \`Multicall3\` (\`${MULTICALL3_CANONICAL_ADDRESS}\`) is used **exclusively for batched \`eth_call\` reads** (\`aggregate3\`). Multi-recipient Batch Transfer **writes** execute via EIP-5792 \`wallet_sendCalls\` when supported by the wallet, falling back automatically to sequential \`prepareAndSendTx\` per-recipient transfers.

## Security Guardrails

${guardrailLines}
`;
}

export const PROTOCOL_SPEC = buildDocsTxt();
