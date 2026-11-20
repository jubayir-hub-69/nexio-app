import { ethers } from "ethers";
import {
  RpcTransportError,
  getArcReadProvider,
  getArcRpcUrls,
  getLatestRpcLatencyMs,
  getRpcHealthSnapshot,
  isLikelyRpcTransportFailure,
  isRpcTransportError,
  withArcRpc,
  withArcRpcTimed,
} from "@/lib/rpc";

export {
  RpcTransportError,
  getArcReadProvider,
  getArcRpcUrls,
  getLatestRpcLatencyMs,
  getRpcHealthSnapshot,
  isRpcTransportError,
  withArcRpc,
  withArcRpcTimed,
};

// Arc Mainnet (chain ID 5042) is the only network this app talks to.
export const ARC_CHAIN_ID = 5042;
export const ARC_CHAIN_ID_HEX = "0x13b2";
export const ARC_RPC_URL = "https://rpc.mainnet.arc.io";
export const ARC_EXPLORER = "https://explorer.arc.io";
export const ARC_NETWORK_LABEL = "Arc Mainnet";

const NATIVE_SENTINEL_LOWER = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function pickAddress(value: string | undefined, fallback: string): string {
  const trimmed = (value || "").trim();
  return ethers.isAddress(trimmed) ? ethers.getAddress(trimmed) : fallback;
}

const MAINNET_USDC = "0x3600000000000000000000000000000000000000";
const MAINNET_EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";

export const EURC_ADDRESS = MAINNET_EURC;
export const WUSDC_ADDRESS = MAINNET_USDC;
export const USDC_ERC20_ADDRESS = MAINNET_USDC;
export const FACTORY_ADDRESS = "0xb0C2B0acb9c13079dDd871eDaF43Aabf6e88C530";
export const ROUTER_ADDRESS = "0x52FE40c00530db2e43d01652f903870571A14AFD";
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

export const DAILY_GM_ADDRESS = pickAddress(
  process.env.NEXT_PUBLIC_DAILY_GM_ADDRESS,
  "0x1A85147a0b372A56A2C93515E44d99d062264c54"
);
export const ANS_CONTRACT_ADDRESS = pickAddress(
  process.env.NEXT_PUBLIC_ANS_ADDRESS,
  "0xE3FdB021493953C95F4c93bCCF83B762e4475Ed7"
);
export const EURC_VAULT_ADDRESS = pickAddress(
  process.env.NEXT_PUBLIC_EURC_VAULT_ADDRESS,
  "0xfE128bCc8F4D45AB9E24bF446EEa8302d1FD4CB7"
);
export const USDC_VAULT_ADDRESS = pickAddress(
  process.env.NEXT_PUBLIC_USDC_VAULT_ADDRESS,
  "0x77e46702C82f16D6227686e0ED8882c3cf44e599"
);
export const NEXIO_SWAP_ADDRESS = pickAddress(
  process.env.NEXT_PUBLIC_NEXIO_SWAP_ADDRESS,
  "0xD3504e2118b1c7a52cf44947510633562635ee03"
);
export const ADDRESS_BOOK_ADDRESS = pickAddress(
  process.env.NEXT_PUBLIC_ADDRESS_BOOK_ADDRESS,
  "0xD043C8e124bBa0Eb33F5f62348f1914e425663C0"
);

// Previous generation addresses retained strictly for historical log indexing
export const LEGACY_DAILY_GM_ADDRESS = "0x609A9D897DB4c554a03d4304c8EF42b56ea32e31";
export const LEGACY_EURC_VAULT_ADDRESS = "0xb30c9272a28749Ae0B04E1d5977337a570025009";
export const LEGACY_USDC_VAULT_ADDRESS = "0x045700Cd0D442E65dcB549330580d9981bcbC5E0";

export const ADDRESS_BOOK_ABI = [
  "function MAX_CONTACTS_PER_WALLET() external view returns (uint256)",
  "function saveContact(address recipient, string label, string domain) external",
  "function removeContact(address recipient) external",
  "function getContacts(address owner) external view returns (tuple(address recipient, string label, string domain, uint64 addedAt, uint64 updatedAt, bool exists)[])",
  "function getContactCount(address owner) external view returns (uint256)",
  "function isWhitelisted(address owner, address recipient) external view returns (bool)",
  "event ContactSaved(address indexed owner, address indexed recipient, string label, string domain, uint64 timestamp)",
  "event ContactRemoved(address indexed owner, address indexed recipient, uint64 timestamp)",
];

export const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
  "function getEthBalance(address addr) view returns (uint256 balance)",
  "function getBlockNumber() view returns (uint256 blockNumber)",
  "function getCurrentBlockTimestamp() view returns (uint256 timestamp)",
];

export const DAILY_GM_ABI = [
  "function checkIn() external",
  "function lastCheckIn(address) external view returns (uint256)",
  "function streak(address) external view returns (uint256)",
  "function getEffectiveStreak(address user) external view returns (uint256)",
  "function getStreakWindow(address user) external view returns (uint256 effectiveStreak, uint256 nextCheckInAt, uint256 expiresAt)",
  "event CheckedIn(address indexed user, uint256 streak, uint256 timestamp)",
];

export const ANS_ABI = [
  "function register(string _name) external",
  "function resolve(string _name) external view returns (address)",
  "function resolveByAddress(address _owner) external view returns (string memory)",
  "function isAvailable(string _name) external view returns (bool)",
  "function hasDomain(address _owner) external view returns (bool)",
  "function getFullDomain(address _owner) external view returns (string memory)",
  "event DomainRegistered(string indexed name, address indexed owner)",
];

export const BALANCE_CACHE_MS = 30_000;

export const NATIVE_USDC_DECIMALS = 18;
export const WUSDC_DECIMALS = 6;
export const EURC_DECIMALS = 6;
export const LP_DECIMALS = 18;
export const NLP_DECIMALS = 18;

export const DEFAULT_SLIPPAGE_BPS = 100;
export const SLIPPAGE_PRESETS = [50, 100, 300] as const;
export const MAX_SWAP_PRICE_IMPACT_BPS = 500;
export const SWAP_MAX_PRICE_IMPACT_BPS = MAX_SWAP_PRICE_IMPACT_BPS;
export const MAX_SWAP_VALUE_LOSS_BPS = 2000;
export const SWAP_MAX_VALUE_LOSS_BPS = MAX_SWAP_VALUE_LOSS_BPS;
export const DEADLINE_SECONDS = 20 * 60;
/** Native USDC kept back so a max spend still pays Arc gas. 0.005 USDC, 18-decimal native units. */
export const NATIVE_GAS_BUFFER = ethers.parseUnits("0.005", 18);
export const POOL_SKEW_LIMIT_BPS = 500;
export const LP_MAX_SKEW_BPS = POOL_SKEW_LIMIT_BPS;

export const USDC_VAULT_ABI = [
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function claimNLP() external returns (uint256 claimed18)",
  "function stakedBalance(address) external view returns (uint256)",
  "function lastStakeTime(address) external view returns (uint256)",
  "function accruedPoints(address) external view returns (uint256)",
  "function claimedPoints(address) external view returns (uint256)",
  "function getPendingNLP(address user) external view returns (uint256)",
  "function getLifetimeNLP(address user) external view returns (uint256)",
  "function earnedYield(address) external view returns (uint256)",
  "function getPendingYield(address user) external view returns (uint256)",
  "function usdc() external view returns (address)",
  "event Deposited(address indexed user, uint256 amount, uint256 timestamp)",
  "event Withdrawn(address indexed user, uint256 amount, uint256 timestamp)",
  "event NLPClaimed(address indexed user, uint256 amount, uint256 totalClaimed, uint256 timestamp)",
];

export const EURC_VAULT_ABI = [
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function claimNLP() external returns (uint256 claimed18)",
  "function stakedBalance(address) external view returns (uint256)",
  "function lastStakeTime(address) external view returns (uint256)",
  "function accruedPoints(address) external view returns (uint256)",
  "function claimedPoints(address) external view returns (uint256)",
  "function getPendingNLP(address user) external view returns (uint256)",
  "function getLifetimeNLP(address user) external view returns (uint256)",
  "function earnedYield(address) external view returns (uint256)",
  "function getPendingYield(address user) external view returns (uint256)",
  "function stablecoin() external view returns (address)",
  "event Deposited(address indexed user, uint256 amount, uint256 timestamp)",
  "event Withdrawn(address indexed user, uint256 amount, uint256 timestamp)",
  "event NLPClaimed(address indexed user, uint256 amount, uint256 totalClaimed, uint256 timestamp)",
];

export const NEXIO_SWAP_ABI = [
  "function usdc() external view returns (address)",
  "function eurc() external view returns (address)",
  "function router() external view returns (address)",
  "function factory() external view returns (address)",
  "function swapUSDCforEURC(uint256 amountIn, uint256 amountOutMin, uint256 deadline) external returns (uint256 amountOut)",
  "function swapEURCforUSDC(uint256 amountIn, uint256 amountOutMin, uint256 deadline) external returns (uint256 amountOut)",
  "function addLiquidity(uint256 amountUsdcDesired, uint256 amountEurcDesired, uint256 amountUsdcMin, uint256 amountEurcMin, uint256 deadline) external returns (uint256 amountUsdc, uint256 amountEurc, uint256 liquidity)",
  "function removeLiquidity(uint256 liquidity, uint256 amountUsdcMin, uint256 amountEurcMin, uint256 deadline) external returns (uint256 amountUsdc, uint256 amountEurc)",
];

const USDC_POOL_SCALE = 10n ** BigInt(NATIVE_USDC_DECIMALS - WUSDC_DECIMALS);

export function poolUsdcFromNative(nativeAmount: bigint): bigint {
  return nativeAmount / USDC_POOL_SCALE;
}

export function maxPoolUsdcSpend(nativeBalance: bigint, buffer: bigint = NATIVE_GAS_BUFFER): bigint {
  return nativeBalance > buffer ? (nativeBalance - buffer) / USDC_POOL_SCALE : 0n;
}

/**
 * Combines 18-decimal USDC vault NLP and USD-marked EURC vault NLP so $100 USD of staked EURC
 * accrues exact 10.00 NLP per 24h (86,400s), identical to $100 USD of staked USDC.
 */
export function computeUsdScaledVaultNlp18(input: {
  usdcNlp18: bigint;
  eurcNlp18: bigint;
  eurcSpotOut6: bigint | null;
}): bigint {
  const usdcPart = input.usdcNlp18 > 0n ? input.usdcNlp18 : 0n;
  const eurcRaw = input.eurcNlp18 > 0n ? input.eurcNlp18 : 0n;
  if (eurcRaw === 0n) return usdcPart;
  if (input.eurcSpotOut6 !== null && input.eurcSpotOut6 > 0n) {
    return usdcPart + (eurcRaw * input.eurcSpotOut6) / 1_000_000n;
  }
  return usdcPart + eurcRaw;
}

/** USDC per 1 EURC implied by V2 reserves. Both reserves are 6-decimal token units. */
export function poolPriceUsdPerEurc(reserveUsdc: bigint, reserveEurc: bigint): number | null {
  if (reserveUsdc <= 0n || reserveEurc <= 0n) return null;
  const scaled = (reserveUsdc * 1_000_000n) / reserveEurc;
  const price = Number(scaled) / 1_000_000;
  return Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * Symmetric basis-point divergence between two positive prices using max(left, right)
 * as the denominator so priceDivergenceBps(a, b) === priceDivergenceBps(b, a).
 */
export function priceDivergenceBps(left: number, right: number): number | null {
  if (!(left > 0) || !(right > 0) || !Number.isFinite(left) || !Number.isFinite(right)) return null;
  const denom = Math.max(left, right);
  return Math.round((Math.abs(left - right) / denom) * 10000);
}

/** Signed basis-point skew of poolPrice relative to referenceSpotPrice. */
export function signedPoolSkewBps(poolPrice: number, referenceSpotPrice: number): number | null {
  if (
    !(poolPrice > 0) ||
    !(referenceSpotPrice > 0) ||
    !Number.isFinite(poolPrice) ||
    !Number.isFinite(referenceSpotPrice)
  ) {
    return null;
  }
  return Math.round(((poolPrice - referenceSpotPrice) / referenceSpotPrice) * 10000);
}

export function assertArcChainId(chainId: number): void {
  if (chainId !== ARC_CHAIN_ID) {
    throw new Error(`Wallet is on chain ${chainId}. Switch to Arc Mainnet (5042).`);
  }
}

export function normalizeTargetAddress(raw: string, label = "Address"): string {
  const trimmed = (raw || "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(`${label} is not a valid EVM address.`);
  }
  const lower = trimmed.toLowerCase();
  if (lower === ethers.ZeroAddress || lower === NATIVE_SENTINEL_LOWER) {
    throw new Error(`${label} cannot be the zero or native sentinel address.`);
  }
  return ethers.isAddress(trimmed) ? ethers.getAddress(trimmed) : ethers.getAddress(lower);
}

export function assertTransactionRequest(tx: { to: string; data: string; value: bigint }): void {
  if (
    typeof tx.to !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(tx.to.trim()) ||
    tx.to.trim().toLowerCase() === ethers.ZeroAddress ||
    tx.to.trim().toLowerCase() === NATIVE_SENTINEL_LOWER
  ) {
    throw new Error("Transaction target is not a valid contract or wallet address.");
  }
  if (typeof tx.data !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(tx.data)) {
    throw new Error("Transaction data is not valid even-length hex.");
  }
  if (typeof tx.value !== "bigint" || tx.value < 0n) {
    throw new Error("Transaction value cannot be negative.");
  }
}

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address sender, address recipient, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// Arc Mainnet USDC at 0x3600...0000 is the native-backed 6-decimal ERC-20 precompile, not WETH9.
export const WUSDC_ABI = [...ERC20_ABI];

export const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
  "function allPairs(uint256) view returns (address pair)",
  "function allPairsLength() view returns (uint256)",
  "function createPair(address tokenA, address tokenB) returns (address pair)",
];

export const ROUTER_ABI = [
  "function factory() view returns (address)",
  "function WETH() view returns (address)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function getAmountsIn(uint256 amountOut, address[] path) view returns (uint256[] amounts)",
  "function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) pure returns (uint256 amountB)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)",
  "function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) returns (uint256 amountToken, uint256 amountETH)",
];

export const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address sender, address recipient, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event Mint(address indexed sender, uint256 amount0, uint256 amount1)",
  "event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)",
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
];

export type PairReserves = {
  pairAddress: string;
  token0: string;
  reserveWusdc: bigint;
  reserveEurc: bigint;
  totalSupply: bigint;
};

export function swapDeadline(): number {
  return Math.floor(Date.now() / 1000) + DEADLINE_SECONDS;
}

export function applySlippage(amount: bigint, bps: number = DEFAULT_SLIPPAGE_BPS): bigint {
  if (amount <= 0n) return 0n;
  const bpsBig = BigInt(Math.max(0, Math.min(2000, Math.round(bps))));
  return amount - (amount * bpsBig) / 10000n;
}

function bpsBetween(expected: bigint, actual: bigint): number {
  if (expected <= 0n) return 10000;
  if (actual >= expected) return 0;
  const bps = ((expected - actual) * 10000n) / expected;
  const asNumber = Number(bps);
  return Number.isFinite(asNumber) ? asNumber : 10000;
}

/** Shortfall versus a 1-unit spot quote for the same pair. USDC and EURC are not treated as 1:1. */
export function valueLossVersusSpotBps(
  amountIn: bigint,
  amountOut: bigint,
  spotAmountIn: bigint,
  spotAmountOut: bigint
): number {
  if (amountIn <= 0n || spotAmountIn <= 0n || spotAmountOut <= 0n) return 10000;
  const expectedOut = (amountIn * spotAmountOut) / spotAmountIn;
  return bpsBetween(expectedOut, amountOut);
}

export function formatExact(value: bigint, decimals: number): string {
  return ethers.formatUnits(value, decimals);
}

export function trimZeros(value: string): string {
  if (!value.includes(".")) return value;
  const trimmed = value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return trimmed.length ? trimmed : "0";
}

export function formatPretty(value: bigint, decimals: number, maxFrac = 6): string {
  if (value === 0n) return "0.00";
  const exact = ethers.formatUnits(value, decimals);
  const negative = exact.startsWith("-");
  const unsigned = negative ? exact.slice(1) : exact;
  const [whole, frac = ""] = unsigned.split(".");
  let cut = maxFrac;
  if (whole === "0") {
    const firstNz = frac.search(/[1-9]/);
    if (firstNz === -1) return "0.00";
    cut = Math.min(decimals, Math.max(maxFrac, firstNz + 2));
  }
  const sliced = frac.slice(0, cut).replace(/0+$/, "");
  const body = sliced ? `${whole}.${sliced}` : `${whole}.00`;
  return negative ? `-${body}` : body;
}

export function formatDisplay(value: bigint, decimals: number, digits = 2): string {
  return formatPretty(value, decimals, digits);
}

export function formatAmount(value: bigint, decimals: number, digits = 6): string {
  return formatPretty(value, decimals, digits);
}

export function isAmountDraft(input: string): boolean {
  const cleaned = input.trim();
  return cleaned === "" || cleaned === "." || cleaned.endsWith(".");
}

export type StrictAmountResult =
  | { ok: true; value: bigint }
  | { ok: false; error: string };

/**
 * Strict decimal parser that rejects empty/draft strings, invalid characters,
 * or fractional precision exceeding `decimals` instead of crashing or silently truncating.
 */
export function parseStrictAmount(input: string, decimals: number): StrictAmountResult {
  const cleaned = input.trim();
  if (!cleaned) return { ok: false, error: "Enter an amount." };
  if (cleaned === "." || cleaned.endsWith(".")) {
    return { ok: false, error: "Complete the decimal amount." };
  }
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, error: "Amount must be a valid positive number." };
  }
  const [, frac = ""] = cleaned.split(".");
  if (frac.length > decimals) {
    return {
      ok: false,
      error: `Amount supports at most ${decimals} decimal places.`,
    };
  }
  try {
    return { ok: true, value: ethers.parseUnits(cleaned, decimals) };
  } catch {
    return { ok: false, error: "Amount is out of range." };
  }
}

export function parseAmount(input: string, decimals: number): bigint | null {
  const cleaned = input.trim();
  if (!cleaned || cleaned === "." || cleaned === "0.") return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  try {
    const [whole, frac = ""] = cleaned.split(".");
    const clipped = frac.length > decimals ? `${whole}.${frac.slice(0, decimals)}` : cleaned;
    return ethers.parseUnits(clipped, decimals);
  } catch {
    return null;
  }
}

export function maxNativeSpend(balance: bigint, buffer: bigint = NATIVE_GAS_BUFFER): bigint {
  return balance > buffer ? balance - buffer : 0n;
}

export function formatSharePercent(part: bigint, total: bigint): string {
  if (total === 0n || part === 0n) return "0";
  const scaled = (part * 100000000n) / total;
  if (scaled === 0n) return "<0.000001";
  return trimZeros(ethers.formatUnits(scaled, 6));
}

export function slippageLabel(bps: number): string {
  return `${(bps / 100).toString()}%`;
}

// ============================================================================
// Revert & Error Decoding
// ============================================================================

const CUSTOM_ERROR_IFACE = new ethers.Interface([
  "error Error(string reason)",
  "error Panic(uint256 code)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InvalidSender(address sender)",
  "error ERC20InvalidReceiver(address receiver)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InvalidApprover(address approver)",
  "error ERC20InvalidSpender(address spender)",
]);

export type ErrorDecodeContext = {
  gmLastCheckIn?: number;
  blockTimestamp?: number;
};

function formatCooldownRemaining(secondsLeft: number): string {
  const clamped = Math.max(1, Math.ceil(secondsLeft));
  const hours = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
}

function extractRevertDataHex(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const err = error as {
    data?: unknown;
    error?: { data?: unknown };
    info?: { error?: { data?: unknown } };
  };
  const candidates = [err.data, err.error?.data, err.info?.error?.data];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^0x[0-9a-fA-F]{8,}$/.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function decodeRawHexRevert(dataHex: string): string | null {
  try {
    const parsed = CUSTOM_ERROR_IFACE.parseError(dataHex);
    if (!parsed) return null;
    if (parsed.name === "Error") {
      return String(parsed.args[0] ?? "");
    }
    if (parsed.name === "Panic") {
      const code = Number(parsed.args[0] ?? 0);
      if (code === 0x11) return "Arithmetic overflow or underflow in contract call.";
      if (code === 0x12) return "Division by zero in contract call.";
      return `Contract panic (0x${code.toString(16)}).`;
    }
    if (parsed.name === "ERC20InsufficientBalance") {
      return "Insufficient token balance.";
    }
    if (parsed.name === "ERC20InsufficientAllowance") {
      return "Insufficient token allowance. Approve the spender first.";
    }
    if (parsed.name.startsWith("ERC20Invalid")) {
      return "Invalid token transfer or approval target address.";
    }
  } catch {
    return null;
  }
  return null;
}

function mapKnownReason(reason: string, context?: ErrorDecodeContext): string | null {
  if (/Wait 24 hours before next GM/i.test(reason)) {
    if (context?.gmLastCheckIn && context.gmLastCheckIn > 0) {
      const nowSec = context.blockTimestamp ?? Math.floor(Date.now() / 1000);
      const unlockAt = context.gmLastCheckIn + 86_400;
      if (unlockAt > nowSec) {
        return `Daily GM cooldown active. Next check-in unlocks in ${formatCooldownRemaining(unlockAt - nowSec)}.`;
      }
    }
    return "Daily GM cooldown active. Wait 24 hours before your next check-in.";
  }

  if (/No NLP available to claim/i.test(reason)) {
    return "No accrued NLP points available to claim yet.";
  }
  if (/Zero recipient/i.test(reason)) return "Recipient address cannot be the zero address.";
  if (/Invalid label length/i.test(reason)) return "Contact label must be between 1 and 64 characters.";
  if (/Invalid domain length/i.test(reason)) return "Domain name exceeds the maximum length.";
  if (/Address book full/i.test(reason)) return "Address book has reached the 100-contact limit.";
  if (/Contact not found/i.test(reason)) return "That contact is no longer in your on-chain address book.";
  if (/NEX:\s*Name cannot be empty/i.test(reason)) return "Enter a valid .nex domain name.";
  if (/NEX:\s*Domain already taken/i.test(reason)) return "That .nex domain is already registered.";
  if (/NEX:\s*Address already has a domain/i.test(reason)) {
    return "This wallet already owns a permanent .nex domain (1 wallet = 1 domain).";
  }
  if (/NEX:\s*Domain not found/i.test(reason)) return "No wallet is registered for that .nex domain.";
  if (/NEX:\s*No domain found for address/i.test(reason)) return "No .nex domain is bound to this wallet.";

  if (/Transfer failed\.\s*Check allowance/i.test(reason)) {
    return "Token transfer failed. Confirm allowance and token balance.";
  }
  if (/Deposit amount must be > 0/i.test(reason)) return "Deposit amount must be greater than zero.";
  if (/Withdraw amount must be > 0/i.test(reason)) return "Withdrawal amount must be greater than zero.";
  if (/Insufficient balance/i.test(reason)) return "Insufficient balance.";
  if (/Pair not found/i.test(reason)) return "USDC/EURC liquidity pair is not initialized.";
  if (/Reentrant/i.test(reason)) return "Reentrancy guard triggered. Retry once.";
  if (/INSUFFICIENT_OUTPUT_AMOUNT/i.test(reason)) return "Quote moved beyond slippage tolerance. Retry with a fresh quote.";
  if (/INSUFFICIENT_LIQUIDITY/i.test(reason)) return "Insufficient pool liquidity for this amount.";
  if (/INSUFFICIENT_A_AMOUNT|INSUFFICIENT_B_AMOUNT/i.test(reason)) return "Pool reserves shifted beyond slippage. Retry the transaction.";
  if (/INSUFFICIENT_INPUT|insufficient funds/i.test(reason)) return "Insufficient balance to cover amount and Arc gas.";
  if (/\bEXPIRED\b/i.test(reason)) return "Transaction deadline expired. Request a fresh quote and retry.";

  return null;
}

export function decodeNexioError(error: unknown, context?: ErrorDecodeContext): string {
  if (isRpcTransportError(error)) {
    return "Arc Mainnet RPC is temporarily busy or unreachable. Please retry in a moment.";
  }

  const err = error as {
    code?: string | number;
    shortMessage?: string;
    reason?: string;
    message?: string;
    info?: { error?: { message?: string } };
  };

  if (err?.code === 4001 || err?.code === "ACTION_REJECTED") {
    return "Transaction rejected in wallet";
  }

  const hexData = extractRevertDataHex(error);
  if (hexData) {
    const decodedHex = decodeRawHexRevert(hexData);
    if (decodedHex) {
      return mapKnownReason(decodedHex, context) ?? decodedHex;
    }
  }

  const raw =
    err?.reason ||
    err?.shortMessage ||
    err?.info?.error?.message ||
    err?.message ||
    "Transaction failed";

  const cleaned = raw
    .replace(/^execution reverted:\s*/i, "")
    .replace(/^VM Exception while processing transaction:\s*reverted with reason string\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(/^"|"$/g, "")
    .replace(/\(action="[^"]*",[^)]*\)/g, "")
    .trim();

  if (/user rejected|denied transaction|rejected the request/i.test(cleaned)) {
    return "Transaction rejected in wallet";
  }

  const known = mapKnownReason(cleaned, context);
  if (known) return known;

  if (/missing revert data|CALL_EXCEPTION|could not coalesce|UNPREDICTABLE_GAS/i.test(cleaned)) {
    return `Simulation failed on ${ARC_NETWORK_LABEL}. Confirm balances, allowances, and network (5042).`;
  }

  return cleaned.slice(0, 180) || "Transaction failed";
}

export function getTxErrorMessage(error: unknown, context?: ErrorDecodeContext): string {
  return decodeNexioError(error, context);
}

// ============================================================================
// Pre-Execution Simulation & Smart Allowance Management
// ============================================================================

export type TxExecutionStage =
  | "simulating"
  | "awaiting_wallet"
  | "confirming_block"
  | "completed";

export type PrepareAndSendOptions = {
  label?: string;
  confirmations?: number;
  gmLastCheckIn?: number;
  blockTimestamp?: number;
  onStage?: (stage: TxExecutionStage) => void;
  onHash?: (hash: string) => void;
};

export type PreparedTxResult = {
  hash: string;
  tx: ethers.TransactionResponse;
  receipt: ethers.TransactionReceipt | null;
};

export async function prepareAndSendTx(
  signer: ethers.Signer,
  txReq: { to: string; data?: string; value?: bigint; gasLimit?: bigint },
  opts?: PrepareAndSendOptions
): Promise<PreparedTxResult> {
  const provider = signer.provider;
  if (!provider) {
    throw new Error("Wallet provider is disconnected.");
  }

  opts?.onStage?.("simulating");

  const network = await provider.getNetwork();
  assertArcChainId(Number(network.chainId));

  const to = normalizeTargetAddress(txReq.to, opts?.label ?? "Transaction target");
  const data = txReq.data && txReq.data.length > 0 ? txReq.data : "0x";
  const value = txReq.value ?? 0n;
  assertTransactionRequest({ to, data, value });

  const from = ethers.getAddress(await signer.getAddress());
  const errCtx: ErrorDecodeContext = {
    gmLastCheckIn: opts?.gmLastCheckIn,
    blockTimestamp: opts?.blockTimestamp,
  };

  try {
    await provider.call({ from, to, data, value });
  } catch (simError) {
    throw new Error(decodeNexioError(simError, errCtx));
  }

  let estimatedGas: bigint;
  try {
    estimatedGas = await provider.estimateGas({ from, to, data, value });
  } catch (estError) {
    throw new Error(decodeNexioError(estError, errCtx));
  }

  const bufferedGas = (estimatedGas * 115n) / 100n;
  const gasLimit = txReq.gasLimit && txReq.gasLimit > bufferedGas ? txReq.gasLimit : bufferedGas;

  const [nativeBalance, feeData] = await Promise.all([
    provider.getBalance(from),
    provider.getFeeData(),
  ]);
  const feePrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits("20", "gwei");
  const requiredNative = value + gasLimit * feePrice;
  if (nativeBalance < requiredNative) {
    throw new Error("Insufficient native USDC to cover transaction value and Arc Mainnet gas.");
  }

  opts?.onStage?.("awaiting_wallet");
  let tx: ethers.TransactionResponse;
  try {
    tx = await signer.sendTransaction({ to, data, value, gasLimit });
  } catch (sendError) {
    throw new Error(decodeNexioError(sendError, errCtx));
  }

  opts?.onHash?.(tx.hash);

  const confirmations = opts?.confirmations ?? 1;
  if (confirmations <= 0) {
    return { hash: tx.hash, tx, receipt: null };
  }

  opts?.onStage?.("confirming_block");
  const receipt = await tx.wait(confirmations);
  if (!receipt || receipt.status !== 1) {
    throw new Error("Transaction reverted on Arc Mainnet.");
  }

  opts?.onStage?.("completed");
  return { hash: tx.hash, tx, receipt };
}

export type AllowanceStage =
  | "checking_allowance"
  | "resetting_allowance"
  | "simulating"
  | "awaiting_wallet"
  | "confirming_block"
  | "verifying_propagation"
  | "completed";

export type EnsureExactAllowanceParams = {
  signer: ethers.Signer;
  tokenAddress: string;
  spender: string;
  requiredAmount: bigint;
  owner?: string;
  onStage?: (stage: AllowanceStage) => void;
  onApproveHash?: (hash: string) => void;
};

export type EnsureExactAllowanceResult = {
  approved: boolean;
  approvalTxHash?: string;
  finalAllowance: bigint;
};

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureExactAllowance(
  params: EnsureExactAllowanceParams
): Promise<EnsureExactAllowanceResult> {
  const token = normalizeTargetAddress(params.tokenAddress, "Token address");
  const spender = normalizeTargetAddress(params.spender, "Spender address");
  if (params.requiredAmount <= 0n) {
    return { approved: false, finalAllowance: 0n };
  }

  const provider = params.signer.provider;
  if (!provider) {
    throw new Error("Wallet provider is disconnected.");
  }

  params.onStage?.("checking_allowance");
  const owner = params.owner
    ? normalizeTargetAddress(params.owner, "Owner address")
    : ethers.getAddress(await params.signer.getAddress());

  const erc20Iface = new ethers.Interface(ERC20_ABI);
  const readContract = new ethers.Contract(token, ERC20_ABI, provider);
  const currentAllowance = (await readContract.allowance(owner, spender)) as bigint;

  if (currentAllowance >= params.requiredAmount) {
    params.onStage?.("completed");
    return { approved: false, finalAllowance: currentAllowance };
  }

  const approveData = erc20Iface.encodeFunctionData("approve", [spender, params.requiredAmount]);

  if (currentAllowance > 0n) {
    try {
      await provider.call({ from: owner, to: token, data: approveData, value: 0n });
    } catch {
      params.onStage?.("resetting_allowance");
      const resetData = erc20Iface.encodeFunctionData("approve", [spender, 0n]);
      await prepareAndSendTx(
        params.signer,
        { to: token, data: resetData, value: 0n },
        { label: "Token allowance reset", confirmations: 1 }
      );
    }
  }

  const { hash } = await prepareAndSendTx(
    params.signer,
    { to: token, data: approveData, value: 0n },
    {
      label: "Token approval",
      confirmations: 1,
      onStage: (stage) => params.onStage?.(stage),
      onHash: params.onApproveHash,
    }
  );

  params.onStage?.("verifying_propagation");
  let verifiedAllowance = 0n;
  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleepMs(250);
    const [walletObserved, rpcObserved] = await Promise.all([
      (readContract.allowance(owner, spender) as Promise<bigint>).catch(() => 0n),
      withArcRpc(async (rpc) => {
        const rpcToken = new ethers.Contract(token, ERC20_ABI, rpc);
        return (await rpcToken.allowance(owner, spender)) as bigint;
      }).catch(() => 0n),
    ]);
    verifiedAllowance = walletObserved < rpcObserved ? walletObserved : rpcObserved;
    if (verifiedAllowance >= params.requiredAmount) break;
    if (walletObserved >= params.requiredAmount && i === 2) {
      verifiedAllowance = walletObserved;
    }
  }

  if (verifiedAllowance < params.requiredAmount) {
    throw new Error("Approval mined, but updated allowance has not propagated yet. Retry in a second.");
  }

  params.onStage?.("completed");
  return {
    approved: true,
    approvalTxHash: hash,
    finalAllowance: verifiedAllowance,
  };
}

// ============================================================================
// Pair State, Multicall3 Batched Snapshot & ANS Domain Resolution
// ============================================================================

const pairMetaMemo = new Map<string, { pairAddress: string; token0: string }>();
let pairCache: { eurc: string; at: number; state: PairReserves | null } | null = null;
const pairInflight = new Map<string, Promise<PairReserves | null>>();

let multicall3Status: boolean | null = null;
let multicall3ProbeInflight: Promise<boolean> | null = null;

async function isMulticall3Available(): Promise<boolean> {
  if (multicall3Status !== null) return multicall3Status;
  if (multicall3ProbeInflight) return multicall3ProbeInflight;

  multicall3ProbeInflight = withArcRpc(async (provider) => {
    const code = await provider.getCode(MULTICALL3_ADDRESS);
    const available = typeof code === "string" && code !== "0x" && code.length > 2;
    multicall3Status = available;
    return available;
  })
    .catch(() => false)
    .finally(() => {
      multicall3ProbeInflight = null;
    });

  return multicall3ProbeInflight;
}

export function invalidatePairCache() {
  pairCache = null;
}

async function resolvePairMeta(
  eurcAddress: string,
  customProvider?: ethers.Provider
): Promise<{ pairAddress: string; token0: string } | null> {
  const key = eurcAddress.toLowerCase();
  const memo = pairMetaMemo.get(key);
  if (memo) return memo;

  const loadFromProvider = async (p: ethers.Provider) => {
    const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, p);
    const pairAddress = (await factory.getPair(WUSDC_ADDRESS, eurcAddress)) as string;
    if (!pairAddress || pairAddress.toLowerCase() === ethers.ZeroAddress) {
      return null;
    }
    const checksummedPair = ethers.getAddress(pairAddress);
    const pair = new ethers.Contract(checksummedPair, PAIR_ABI, p);
    const token0 = ethers.getAddress((await pair.token0()) as string);
    const resolved = { pairAddress: checksummedPair, token0 };
    pairMetaMemo.set(key, resolved);
    return resolved;
  };

  if (customProvider) {
    return loadFromProvider(customProvider);
  }
  return withArcRpc((p) => loadFromProvider(p));
}

export async function fetchPairState(
  provider?: ethers.Provider,
  eurcAddress: string = EURC_ADDRESS,
  options?: { force?: boolean }
): Promise<PairReserves | null> {
  const key = eurcAddress.toLowerCase();
  if (
    !options?.force &&
    pairCache &&
    pairCache.eurc === key &&
    Date.now() - pairCache.at < BALANCE_CACHE_MS
  ) {
    return pairCache.state;
  }

  const existingInflight = pairInflight.get(key);
  if (!options?.force && existingInflight) {
    return existingInflight;
  }

  const task = (async (): Promise<PairReserves | null> => {
    const meta = await resolvePairMeta(eurcAddress, provider);
    if (!meta) {
      pairCache = { eurc: key, at: Date.now(), state: null };
      return null;
    }

    const readDynamic = async (p: ethers.Provider): Promise<PairReserves> => {
      const pair = new ethers.Contract(meta.pairAddress, PAIR_ABI, p);
      const [reserves, totalSupply] = await Promise.all([
        pair.getReserves() as Promise<{ reserve0: bigint; reserve1: bigint }>,
        pair.totalSupply() as Promise<bigint>,
      ]);
      const token0IsEurc = meta.token0.toLowerCase() === key;
      return {
        pairAddress: meta.pairAddress,
        token0: meta.token0,
        reserveEurc: token0IsEurc ? reserves.reserve0 : reserves.reserve1,
        reserveWusdc: token0IsEurc ? reserves.reserve1 : reserves.reserve0,
        totalSupply,
      };
    };

    const state = provider ? await readDynamic(provider) : await withArcRpc((p) => readDynamic(p));
    pairCache = { eurc: key, at: Date.now(), state };
    return state;
  })().finally(() => {
    if (pairInflight.get(key) === task) {
      pairInflight.delete(key);
    }
  });

  pairInflight.set(key, task);
  return task;
}

export function underlyingFromLp(
  lpAmount: bigint,
  totalSupply: bigint,
  reserveWusdc: bigint,
  reserveEurc: bigint
): { wusdc: bigint; eurc: bigint } {
  if (totalSupply === 0n || lpAmount === 0n) return { wusdc: 0n, eurc: 0n };
  return {
    wusdc: (lpAmount * reserveWusdc) / totalSupply,
    eurc: (lpAmount * reserveEurc) / totalSupply,
  };
}

// ============================================================================
// ANS (.nex) Domain Validation & Lookups
// ============================================================================

export type AnsValidationResult = {
  valid: boolean;
  label: string;
  fullDomain: string;
  error?: string;
};

export function validateAnsDomainInput(raw: string): AnsValidationResult {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return { valid: false, label: "", fullDomain: "", error: "Enter a .nex domain name." };
  }

  if (trimmed.endsWith(".arc")) {
    return {
      valid: false,
      label: "",
      fullDomain: "",
      error: ".arc domains are not supported. Use a .nex domain.",
    };
  }

  let label = trimmed;
  if (trimmed.includes(".")) {
    if (!trimmed.endsWith(".nex")) {
      return {
        valid: false,
        label: "",
        fullDomain: "",
        error: "Only .nex domains are supported.",
      };
    }
    label = trimmed.slice(0, -4);
    if (label.includes(".")) {
      return {
        valid: false,
        label: "",
        fullDomain: "",
        error: "Subdomains and extra dots are not supported in .nex names.",
      };
    }
  }

  if (label.length < 1 || label.length > 63) {
    return {
      valid: false,
      label: "",
      fullDomain: "",
      error: "Domain name must be between 1 and 63 characters.",
    };
  }

  if (!/^[a-z0-9-]+$/.test(label)) {
    return {
      valid: false,
      label: "",
      fullDomain: "",
      error: "Use only lowercase letters (a-z), numbers (0-9), and hyphens (-).",
    };
  }

  if (label.startsWith("-") || label.endsWith("-")) {
    return {
      valid: false,
      label: "",
      fullDomain: "",
      error: "Domain name cannot start or end with a hyphen.",
    };
  }

  return {
    valid: true,
    label,
    fullDomain: `${label}.nex`,
  };
}

export function sanitizeAnsName(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes(".")) {
    if (!trimmed.endsWith(".nex")) return "";
    const withoutNex = trimmed.slice(0, -4);
    if (withoutNex.includes(".")) return "";
    return withoutNex.replace(/[^a-z0-9-]/g, "");
  }
  return trimmed.replace(/[^a-z0-9-]/g, "");
}

const ansForwardMemo = new Map<string, string>();
const ansReverseMemo = new Map<string, string>();

export function invalidateAnsCache(address?: string, domainLabel?: string) {
  if (address && ethers.isAddress(address)) {
    ansReverseMemo.delete(address.toLowerCase());
  } else if (!address && !domainLabel) {
    ansForwardMemo.clear();
    ansReverseMemo.clear();
  }
  if (domainLabel) {
    ansForwardMemo.delete(domainLabel.trim().toLowerCase().replace(/\.nex$/i, ""));
  }
}

async function runAnsRead<T>(
  work: (provider: ethers.Provider) => Promise<T>,
  customProvider?: ethers.Provider
): Promise<T> {
  if (!customProvider) {
    return withArcRpc((p) => work(p));
  }
  try {
    return await work(customProvider);
  } catch (error) {
    if (isLikelyRpcTransportFailure(error)) {
      throw new RpcTransportError("Arc Mainnet RPC call failed during ANS lookup.", {
        code: "RPC_UNAVAILABLE",
        cause: error,
      });
    }
    throw error;
  }
}

export async function resolveAddressToDomain(
  address: string,
  provider?: ethers.Provider
): Promise<string | null> {
  const trimmed = (address || "").trim();
  if (!trimmed || !ethers.isAddress(trimmed)) return null;
  const checksummed = ethers.getAddress(trimmed);
  const memoKey = checksummed.toLowerCase();
  const cached = ansReverseMemo.get(memoKey);
  if (cached) return cached;

  try {
    return await runAnsRead(async (p) => {
      const contract = new ethers.Contract(ANS_CONTRACT_ADDRESS, ANS_ABI, p);
      const owns = Boolean(await contract.hasDomain(checksummed));
      if (!owns) return null;

      const rawDomain = String(await contract.resolveByAddress(checksummed)).trim();
      if (!rawDomain) return null;

      const validated = validateAnsDomainInput(rawDomain);
      if (!validated.valid) return null;

      if (rawDomain !== validated.label) {
        const forwardAvailable = Boolean(await contract.isAvailable(validated.label));
        if (forwardAvailable) return null;
        const forwardOwner = String(await contract.resolve(validated.label));
        if (!ethers.isAddress(forwardOwner) || ethers.getAddress(forwardOwner) !== checksummed) {
          return null;
        }
      }

      ansReverseMemo.set(memoKey, validated.label);
      ansForwardMemo.set(validated.label, checksummed);
      return validated.label;
    }, provider);
  } catch (error) {
    if (isRpcTransportError(error)) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (/NEX:\s*No domain found for address/i.test(msg)) return null;
    if (isLikelyRpcTransportFailure(error)) {
      throw new RpcTransportError("Arc Mainnet RPC failed while resolving wallet domain.", {
        code: "RPC_UNAVAILABLE",
        cause: error,
      });
    }
    return null;
  }
}

export async function resolveDomainToAddress(
  name: string,
  provider?: ethers.Provider
): Promise<string | null> {
  const validated = validateAnsDomainInput(name);
  if (!validated.valid) return null;

  const cached = ansForwardMemo.get(validated.label);
  if (cached) return cached;

  try {
    return await runAnsRead(async (p) => {
      const contract = new ethers.Contract(ANS_CONTRACT_ADDRESS, ANS_ABI, p);
      const available = Boolean(await contract.isAvailable(validated.label));
      if (available) return null;

      const resolved = String(await contract.resolve(validated.label));
      if (!resolved || !ethers.isAddress(resolved) || resolved.toLowerCase() === ethers.ZeroAddress) {
        return null;
      }
      const checksummed = ethers.getAddress(resolved);
      ansForwardMemo.set(validated.label, checksummed);
      return checksummed;
    }, provider);
  } catch (error) {
    if (isRpcTransportError(error)) throw error;
    const msg = error instanceof Error ? error.message : String(error);
    if (/NEX:\s*Domain not found/i.test(msg)) return null;
    if (isLikelyRpcTransportFailure(error)) {
      throw new RpcTransportError("Arc Mainnet RPC failed while resolving .nex domain.", {
        code: "RPC_UNAVAILABLE",
        cause: error,
      });
    }
    return null;
  }
}

export async function isDomainAvailable(
  name: string,
  provider?: ethers.Provider
): Promise<boolean> {
  const validated = validateAnsDomainInput(name);
  if (!validated.valid) return false;
  if (ansForwardMemo.has(validated.label)) return false;

  return runAnsRead(async (p) => {
    const contract = new ethers.Contract(ANS_CONTRACT_ADDRESS, ANS_ABI, p);
    return Boolean(await contract.isAvailable(validated.label));
  }, provider);
}

// ============================================================================
// Atomic Protocol Snapshot & Batch Recipient Resolution (Multicall3)
// ============================================================================

export type AccountProtocolSnapshot = {
  blockNumber: number;
  blockTimestamp: number;
  latencyMs: number;
  nativeUsdcRaw: bigint;
  eurcRaw: bigint;
  usdcStakedRaw: bigint;
  eurcStakedRaw: bigint;
  usdcPendingYieldRaw: bigint;
  eurcPendingYieldRaw: bigint;
  usdcPendingNlp18: bigint;
  usdcClaimedNlp18: bigint;
  eurcPendingNlp18: bigint;
  eurcClaimedNlp18: bigint;
  gmStreak: number;
  gmStoredStreak: number;
  gmLastCheckIn: number;
  gmNextCheckInAt: number;
  gmStreakExpiresAt: number;
  hasDomain: boolean;
  boundDomain: string | null;
  pairState: PairReserves | null;
  lpBalanceRaw: bigint;
};

type MulticallCall = {
  target: string;
  allowFailure: boolean;
  callData: string;
};

type MulticallResult = {
  success: boolean;
  returnData: string;
};

const SNAPSHOT_DEDUPE_TTL_MS = 3_000;
const snapshotCache = new Map<string, { at: number; snapshot: AccountProtocolSnapshot }>();
const snapshotInflight = new Map<string, Promise<AccountProtocolSnapshot>>();

export function invalidateSnapshotCache(wallet?: string) {
  if (wallet && ethers.isAddress(wallet)) {
    snapshotCache.delete(wallet.toLowerCase());
  } else {
    snapshotCache.clear();
  }
}

export async function fetchAccountProtocolSnapshot(
  wallet?: string,
  options?: { force?: boolean; signal?: AbortSignal }
): Promise<AccountProtocolSnapshot> {
  const cleanWallet = wallet && ethers.isAddress(wallet.trim()) ? ethers.getAddress(wallet.trim()) : null;
  const cacheKey = cleanWallet ? cleanWallet.toLowerCase() : "__anon__";

  if (!options?.force) {
    const hit = snapshotCache.get(cacheKey);
    if (hit && Date.now() - hit.at < SNAPSHOT_DEDUPE_TTL_MS) {
      return hit.snapshot;
    }
    const pending = snapshotInflight.get(cacheKey);
    if (pending) return pending;
  }

  const job = (async (): Promise<AccountProtocolSnapshot> => {
    const [useMc3, pairMeta] = await Promise.all([
      isMulticall3Available(),
      resolvePairMeta(EURC_ADDRESS),
    ]);

    if (useMc3) {
      try {
        const mcIface = new ethers.Interface(MULTICALL3_ABI);
        const erc20Iface = new ethers.Interface(ERC20_ABI);
        const vaultIface = new ethers.Interface(USDC_VAULT_ABI);
        const gmIface = new ethers.Interface(DAILY_GM_ABI);
        const ansIface = new ethers.Interface(ANS_ABI);
        const pairIface = new ethers.Interface(PAIR_ABI);

        const calls: MulticallCall[] = [
          {
            target: MULTICALL3_ADDRESS,
            allowFailure: false,
            callData: mcIface.encodeFunctionData("getBlockNumber", []),
          },
          {
            target: MULTICALL3_ADDRESS,
            allowFailure: false,
            callData: mcIface.encodeFunctionData("getCurrentBlockTimestamp", []),
          },
        ];

        const idxReserves = pairMeta ? calls.length : -1;
        if (pairMeta) {
          calls.push({
            target: pairMeta.pairAddress,
            allowFailure: true,
            callData: pairIface.encodeFunctionData("getReserves", []),
          });
        }
        const idxTotalSupply = pairMeta ? calls.length : -1;
        if (pairMeta) {
          calls.push({
            target: pairMeta.pairAddress,
            allowFailure: true,
            callData: pairIface.encodeFunctionData("totalSupply", []),
          });
        }

        let idxWalletStart = -1;
        let idxLpBal = -1;
        if (cleanWallet) {
          idxWalletStart = calls.length;
          calls.push(
            {
              target: MULTICALL3_ADDRESS,
              allowFailure: true,
              callData: mcIface.encodeFunctionData("getEthBalance", [cleanWallet]),
            },
            {
              target: EURC_ADDRESS,
              allowFailure: true,
              callData: erc20Iface.encodeFunctionData("balanceOf", [cleanWallet]),
            },
            {
              target: USDC_VAULT_ADDRESS,
              allowFailure: true,
              callData: vaultIface.encodeFunctionData("stakedBalance", [cleanWallet]),
            },
            {
              target: EURC_VAULT_ADDRESS,
              allowFailure: true,
              callData: vaultIface.encodeFunctionData("stakedBalance", [cleanWallet]),
            },
            {
              target: USDC_VAULT_ADDRESS,
              allowFailure: true,
              callData: vaultIface.encodeFunctionData("getPendingNLP", [cleanWallet]),
            },
            {
              target: USDC_VAULT_ADDRESS,
              allowFailure: true,
              callData: vaultIface.encodeFunctionData("claimedPoints", [cleanWallet]),
            },
            {
              target: EURC_VAULT_ADDRESS,
              allowFailure: true,
              callData: vaultIface.encodeFunctionData("getPendingNLP", [cleanWallet]),
            },
            {
              target: EURC_VAULT_ADDRESS,
              allowFailure: true,
              callData: vaultIface.encodeFunctionData("claimedPoints", [cleanWallet]),
            },
            {
              target: DAILY_GM_ADDRESS,
              allowFailure: true,
              callData: gmIface.encodeFunctionData("streak", [cleanWallet]),
            },
            {
              target: DAILY_GM_ADDRESS,
              allowFailure: true,
              callData: gmIface.encodeFunctionData("lastCheckIn", [cleanWallet]),
            },
            {
              target: DAILY_GM_ADDRESS,
              allowFailure: true,
              callData: gmIface.encodeFunctionData("getEffectiveStreak", [cleanWallet]),
            },
            {
              target: ANS_CONTRACT_ADDRESS,
              allowFailure: true,
              callData: ansIface.encodeFunctionData("hasDomain", [cleanWallet]),
            },
            {
              target: ANS_CONTRACT_ADDRESS,
              allowFailure: true,
              callData: ansIface.encodeFunctionData("resolveByAddress", [cleanWallet]),
            }
          );

          if (pairMeta) {
            idxLpBal = calls.length;
            calls.push({
              target: pairMeta.pairAddress,
              allowFailure: true,
              callData: pairIface.encodeFunctionData("balanceOf", [cleanWallet]),
            });
          }
        }

        const { result: rawResults, latencyMs } = await withArcRpcTimed(
          async (provider) => {
            const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
            return (await mc.aggregate3.staticCall(calls)) as MulticallResult[];
          },
          { signal: options?.signal }
        );

        const decodeUint = (res: MulticallResult | undefined, iface: ethers.Interface, fn: string): bigint => {
          if (!res || !res.success || !res.returnData || res.returnData === "0x") return 0n;
          try {
            return BigInt(iface.decodeFunctionResult(fn, res.returnData)[0]);
          } catch {
            return 0n;
          }
        };

        const blockNumber = Number(decodeUint(rawResults[0], mcIface, "getBlockNumber"));
        const blockTimestamp = Number(decodeUint(rawResults[1], mcIface, "getCurrentBlockTimestamp"));

        let pairState: PairReserves | null = null;
        if (pairMeta && idxReserves >= 0 && idxTotalSupply >= 0) {
          const resEntry = rawResults[idxReserves];
          const supEntry = rawResults[idxTotalSupply];
          if (resEntry?.success && supEntry?.success) {
            const decodedRes = pairIface.decodeFunctionResult("getReserves", resEntry.returnData);
            const reserve0 = BigInt(decodedRes[0]);
            const reserve1 = BigInt(decodedRes[1]);
            const totalSupply = BigInt(pairIface.decodeFunctionResult("totalSupply", supEntry.returnData)[0]);
            const token0IsEurc = pairMeta.token0.toLowerCase() === EURC_ADDRESS.toLowerCase();
            pairState = {
              pairAddress: pairMeta.pairAddress,
              token0: pairMeta.token0,
              reserveEurc: token0IsEurc ? reserve0 : reserve1,
              reserveWusdc: token0IsEurc ? reserve1 : reserve0,
              totalSupply,
            };
            pairCache = { eurc: EURC_ADDRESS.toLowerCase(), at: Date.now(), state: pairState };
          }
        }

        let nativeUsdcRaw = 0n;
        let eurcRaw = 0n;
        let usdcStakedRaw = 0n;
        let eurcStakedRaw = 0n;
        let usdcPendingNlp18 = 0n;
        let usdcClaimedNlp18 = 0n;
        let eurcPendingNlp18 = 0n;
        let eurcClaimedNlp18 = 0n;
        let gmStoredStreak = 0;
        let gmLastCheckIn = 0;
        let gmStreak = 0;
        let hasDomain = false;
        let boundDomain: string | null = null;
        let lpBalanceRaw = 0n;

        if (cleanWallet && idxWalletStart >= 0) {
          nativeUsdcRaw = decodeUint(rawResults[idxWalletStart], mcIface, "getEthBalance");
          eurcRaw = decodeUint(rawResults[idxWalletStart + 1], erc20Iface, "balanceOf");
          usdcStakedRaw = decodeUint(rawResults[idxWalletStart + 2], vaultIface, "stakedBalance");
          eurcStakedRaw = decodeUint(rawResults[idxWalletStart + 3], vaultIface, "stakedBalance");
          usdcPendingNlp18 = decodeUint(rawResults[idxWalletStart + 4], vaultIface, "getPendingNLP");
          usdcClaimedNlp18 = decodeUint(rawResults[idxWalletStart + 5], vaultIface, "claimedPoints");
          eurcPendingNlp18 = decodeUint(rawResults[idxWalletStart + 6], vaultIface, "getPendingNLP");
          eurcClaimedNlp18 = decodeUint(rawResults[idxWalletStart + 7], vaultIface, "claimedPoints");
          gmStoredStreak = Number(decodeUint(rawResults[idxWalletStart + 8], gmIface, "streak"));
          gmLastCheckIn = Number(decodeUint(rawResults[idxWalletStart + 9], gmIface, "lastCheckIn"));

          const effEntry = rawResults[idxWalletStart + 10];
          if (effEntry?.success && effEntry.returnData !== "0x") {
            gmStreak = Number(decodeUint(effEntry, gmIface, "getEffectiveStreak"));
          } else {
            gmStreak =
              gmLastCheckIn > 0 && blockTimestamp <= gmLastCheckIn + 172_800 ? gmStoredStreak : 0;
          }

          const hasDomRes = rawResults[idxWalletStart + 11];
          if (hasDomRes?.success && hasDomRes.returnData !== "0x") {
            hasDomain = Boolean(ansIface.decodeFunctionResult("hasDomain", hasDomRes.returnData)[0]);
          }

          const domRes = rawResults[idxWalletStart + 12];
          if (hasDomain && domRes?.success && domRes.returnData !== "0x") {
            const rawDom = String(ansIface.decodeFunctionResult("resolveByAddress", domRes.returnData)[0] ?? "");
            const v = validateAnsDomainInput(rawDom);
            if (v.valid) {
              boundDomain = v.label;
              ansReverseMemo.set(cleanWallet.toLowerCase(), v.label);
            }
          }

          if (idxLpBal >= 0) {
            lpBalanceRaw = decodeUint(rawResults[idxLpBal], pairIface, "balanceOf");
          }
        }

        const snapshot: AccountProtocolSnapshot = {
          blockNumber,
          blockTimestamp,
          latencyMs,
          nativeUsdcRaw,
          eurcRaw,
          usdcStakedRaw,
          eurcStakedRaw,
          usdcPendingYieldRaw: usdcPendingNlp18 / 1_000_000_000_000n,
          eurcPendingYieldRaw: eurcPendingNlp18 / 1_000_000_000_000n,
          usdcPendingNlp18,
          usdcClaimedNlp18,
          eurcPendingNlp18,
          eurcClaimedNlp18,
          gmStreak,
          gmStoredStreak,
          gmLastCheckIn,
          gmNextCheckInAt: gmLastCheckIn > 0 ? gmLastCheckIn + 86_400 : 0,
          gmStreakExpiresAt: gmLastCheckIn > 0 ? gmLastCheckIn + 172_800 : 0,
          hasDomain,
          boundDomain,
          pairState,
          lpBalanceRaw,
        };
        snapshotCache.set(cacheKey, { at: Date.now(), snapshot });
        return snapshot;
      } catch (mcError) {
        if (mcError instanceof Error && mcError.name === "AbortError") throw mcError;
        multicall3Status = false;
      }
    }

    // Automatic batched JsonRpcProvider fallback (Promise.allSettled)
    const { result: fallbackSnapshot, latencyMs } = await withArcRpcTimed(
      async (provider) => {
        const eurc = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, provider);
        const usdcVault = new ethers.Contract(USDC_VAULT_ADDRESS, USDC_VAULT_ABI, provider);
        const eurcVault = new ethers.Contract(EURC_VAULT_ADDRESS, EURC_VAULT_ABI, provider);
        const gm = new ethers.Contract(DAILY_GM_ADDRESS, DAILY_GM_ABI, provider);
        const ans = new ethers.Contract(ANS_CONTRACT_ADDRESS, ANS_ABI, provider);

        const [block, pairState, walletTuple] = await Promise.all([
          provider.getBlock("latest"),
          fetchPairState(provider, EURC_ADDRESS, { force: options?.force }),
          cleanWallet
            ? Promise.allSettled([
                provider.getBalance(cleanWallet),
                eurc.balanceOf(cleanWallet) as Promise<bigint>,
                usdcVault.stakedBalance(cleanWallet) as Promise<bigint>,
                eurcVault.stakedBalance(cleanWallet) as Promise<bigint>,
                usdcVault.getPendingNLP(cleanWallet) as Promise<bigint>,
                usdcVault.claimedPoints(cleanWallet) as Promise<bigint>,
                eurcVault.getPendingNLP(cleanWallet) as Promise<bigint>,
                eurcVault.claimedPoints(cleanWallet) as Promise<bigint>,
                gm.streak(cleanWallet) as Promise<bigint>,
                gm.lastCheckIn(cleanWallet) as Promise<bigint>,
                gm.getEffectiveStreak(cleanWallet) as Promise<bigint>,
                ans.hasDomain(cleanWallet) as Promise<boolean>,
                pairMeta
                  ? (new ethers.Contract(pairMeta.pairAddress, PAIR_ABI, provider).balanceOf(cleanWallet) as Promise<bigint>)
                  : Promise.resolve(0n),
              ])
            : Promise.resolve(null),
        ]);

        const pickBig = (entry: PromiseSettledResult<unknown> | undefined): bigint =>
          entry && entry.status === "fulfilled" ? BigInt(entry.value as bigint) : 0n;

        const blockTimestamp = block?.timestamp ?? Math.floor(Date.now() / 1000);
        const gmStoredStreak = Number(pickBig(walletTuple?.[8]));
        const gmLastCheckIn = Number(pickBig(walletTuple?.[9]));
        const gmStreak =
          walletTuple && walletTuple[10].status === "fulfilled"
            ? Number(BigInt(walletTuple[10].value as bigint))
            : gmLastCheckIn > 0 && blockTimestamp <= gmLastCheckIn + 172_800
              ? gmStoredStreak
              : 0;

        const hasDomain =
          walletTuple && walletTuple[11].status === "fulfilled" ? Boolean(walletTuple[11].value) : false;

        let boundDomain: string | null = null;
        if (cleanWallet && hasDomain) {
          boundDomain = await resolveAddressToDomain(cleanWallet, provider);
        }

        const usdcPendingNlp18 = pickBig(walletTuple?.[4]);
        const usdcClaimedNlp18 = pickBig(walletTuple?.[5]);
        const eurcPendingNlp18 = pickBig(walletTuple?.[6]);
        const eurcClaimedNlp18 = pickBig(walletTuple?.[7]);

        return {
          blockNumber: block?.number ?? 0,
          blockTimestamp,
          nativeUsdcRaw: pickBig(walletTuple?.[0]),
          eurcRaw: pickBig(walletTuple?.[1]),
          usdcStakedRaw: pickBig(walletTuple?.[2]),
          eurcStakedRaw: pickBig(walletTuple?.[3]),
          usdcPendingYieldRaw: usdcPendingNlp18 / 1_000_000_000_000n,
          eurcPendingYieldRaw: eurcPendingNlp18 / 1_000_000_000_000n,
          usdcPendingNlp18,
          usdcClaimedNlp18,
          eurcPendingNlp18,
          eurcClaimedNlp18,
          gmStreak,
          gmStoredStreak,
          gmLastCheckIn,
          gmNextCheckInAt: gmLastCheckIn > 0 ? gmLastCheckIn + 86_400 : 0,
          gmStreakExpiresAt: gmLastCheckIn > 0 ? gmLastCheckIn + 172_800 : 0,
          hasDomain,
          boundDomain,
          pairState,
          lpBalanceRaw: pickBig(walletTuple?.[12]),
        };
      },
      { signal: options?.signal }
    );

    const completed: AccountProtocolSnapshot = {
      ...fallbackSnapshot,
      latencyMs,
    };
    snapshotCache.set(cacheKey, { at: Date.now(), snapshot: completed });
    return completed;
  })().finally(() => {
    if (snapshotInflight.get(cacheKey) === job) {
      snapshotInflight.delete(cacheKey);
    }
  });

  snapshotInflight.set(cacheKey, job);
  return job;
}

export type ResolvedRecipient = {
  input: string;
  valid: boolean;
  kind: "address" | "domain" | "invalid";
  address: string | null;
  domain: string | null;
  error?: string;
};

export async function batchResolveRecipients(items: string[]): Promise<ResolvedRecipient[]> {
  if (items.length === 0) return [];

  const results: ResolvedRecipient[] = items.map((raw) => ({
    input: raw,
    valid: false,
    kind: "invalid",
    address: null,
    domain: null,
  }));

  const ansIface = new ethers.Interface(ANS_ABI);
  const calls: MulticallCall[] = [];
  const addressLookups: Array<{ itemIdx: number; checksummed: string; hasIdx: number; revIdx: number }> = [];
  const domainLookups: Array<{ itemIdx: number; label: string; availIdx: number; fwdIdx: number }> = [];

  for (let i = 0; i < items.length; i++) {
    const trimmed = items[i].trim();
    if (!trimmed) {
      results[i] = {
        input: items[i],
        valid: false,
        kind: "invalid",
        address: null,
        domain: null,
        error: "Recipient is empty.",
      };
      continue;
    }

    if (/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      const lower = trimmed.toLowerCase();
      if (lower === ethers.ZeroAddress || lower === NATIVE_SENTINEL_LOWER) {
        results[i] = {
          input: items[i],
          valid: false,
          kind: "invalid",
          address: null,
          domain: null,
          error: "Zero or sentinel address is not a valid recipient.",
        };
        continue;
      }
      if (!ethers.isAddress(trimmed)) {
        results[i] = {
          input: items[i],
          valid: false,
          kind: "invalid",
          address: null,
          domain: null,
          error: "Address checksum is invalid.",
        };
        continue;
      }

      const checksummed = ethers.getAddress(trimmed);
      const cachedDom = ansReverseMemo.get(checksummed.toLowerCase()) ?? null;
      results[i] = {
        input: items[i],
        valid: true,
        kind: "address",
        address: checksummed,
        domain: cachedDom ? `${cachedDom}.nex` : null,
      };

      if (!cachedDom) {
        const hasIdx = calls.length;
        calls.push({
          target: ANS_CONTRACT_ADDRESS,
          allowFailure: true,
          callData: ansIface.encodeFunctionData("hasDomain", [checksummed]),
        });
        const revIdx = calls.length;
        calls.push({
          target: ANS_CONTRACT_ADDRESS,
          allowFailure: true,
          callData: ansIface.encodeFunctionData("resolveByAddress", [checksummed]),
        });
        addressLookups.push({ itemIdx: i, checksummed, hasIdx, revIdx });
      }
      continue;
    }

    const v = validateAnsDomainInput(trimmed);
    if (!v.valid) {
      results[i] = {
        input: items[i],
        valid: false,
        kind: "invalid",
        address: null,
        domain: null,
        error: v.error ?? "Invalid recipient.",
      };
      continue;
    }

    const cachedAddr = ansForwardMemo.get(v.label);
    if (cachedAddr) {
      results[i] = {
        input: items[i],
        valid: true,
        kind: "domain",
        address: cachedAddr,
        domain: v.fullDomain,
      };
      continue;
    }

    const availIdx = calls.length;
    calls.push({
      target: ANS_CONTRACT_ADDRESS,
      allowFailure: true,
      callData: ansIface.encodeFunctionData("isAvailable", [v.label]),
    });
    const fwdIdx = calls.length;
    calls.push({
      target: ANS_CONTRACT_ADDRESS,
      allowFailure: true,
      callData: ansIface.encodeFunctionData("resolve", [v.label]),
    });
    domainLookups.push({ itemIdx: i, label: v.label, availIdx, fwdIdx });
  }

  if (calls.length === 0) return results;

  const useMc3 = await isMulticall3Available();
  if (useMc3) {
    try {
      const rawResults = await withArcRpc(async (provider) => {
        const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
        return (await mc.aggregate3.staticCall(calls)) as MulticallResult[];
      });

      for (const lookup of addressLookups) {
        const hasEntry = rawResults[lookup.hasIdx];
        const revEntry = rawResults[lookup.revIdx];
        const owns =
          hasEntry?.success && hasEntry.returnData !== "0x"
            ? Boolean(ansIface.decodeFunctionResult("hasDomain", hasEntry.returnData)[0])
            : false;
        if (owns && revEntry?.success && revEntry.returnData !== "0x") {
          const rawDom = String(ansIface.decodeFunctionResult("resolveByAddress", revEntry.returnData)[0] ?? "");
          const v = validateAnsDomainInput(rawDom);
          if (v.valid) {
            ansReverseMemo.set(lookup.checksummed.toLowerCase(), v.label);
            results[lookup.itemIdx].domain = v.fullDomain;
          }
        }
      }

      for (const lookup of domainLookups) {
        const availEntry = rawResults[lookup.availIdx];
        const fwdEntry = rawResults[lookup.fwdIdx];
        const available =
          availEntry?.success && availEntry.returnData !== "0x"
            ? Boolean(ansIface.decodeFunctionResult("isAvailable", availEntry.returnData)[0])
            : true;

        if (!available && fwdEntry?.success && fwdEntry.returnData !== "0x") {
          const addr = String(ansIface.decodeFunctionResult("resolve", fwdEntry.returnData)[0] ?? "");
          if (ethers.isAddress(addr) && addr.toLowerCase() !== ethers.ZeroAddress) {
            const checksummed = ethers.getAddress(addr);
            ansForwardMemo.set(lookup.label, checksummed);
            results[lookup.itemIdx] = {
              input: items[lookup.itemIdx],
              valid: true,
              kind: "domain",
              address: checksummed,
              domain: `${lookup.label}.nex`,
            };
            continue;
          }
        }

        results[lookup.itemIdx] = {
          input: items[lookup.itemIdx],
          valid: false,
          kind: "domain",
          address: null,
          domain: `${lookup.label}.nex`,
          error: `${lookup.label}.nex is not registered.`,
        };
      }

      return results;
    } catch (error) {
      if (isRpcTransportError(error)) throw error;
      multicall3Status = false;
    }
  }

  await Promise.all([
    ...addressLookups.map(async (lookup) => {
      const dom = await resolveAddressToDomain(lookup.checksummed);
      if (dom) {
        results[lookup.itemIdx].domain = `${dom}.nex`;
      }
    }),
    ...domainLookups.map(async (lookup) => {
      const addr = await resolveDomainToAddress(lookup.label);
      if (addr) {
        results[lookup.itemIdx] = {
          input: items[lookup.itemIdx],
          valid: true,
          kind: "domain",
          address: addr,
          domain: `${lookup.label}.nex`,
        };
      } else {
        results[lookup.itemIdx] = {
          input: items[lookup.itemIdx],
          valid: false,
          kind: "domain",
          address: null,
          domain: `${lookup.label}.nex`,
          error: `${lookup.label}.nex is not registered.`,
        };
      }
    }),
  ]);

  return results;
}

// ============================================================================
// On-Chain Enterprise Address Book & Multi-Token Multicall3 Balance Reader
// ============================================================================

export type AddressBookContact = {
  recipient: string;
  label: string;
  domain: string;
  addedAt: number;
  updatedAt: number;
};

const ADDRESS_BOOK_CACHE_MS = 30_000;
const addressBookCache = new Map<string, { at: number; contacts: AddressBookContact[] }>();
const addressBookInflight = new Map<string, Promise<AddressBookContact[]>>();

export function invalidateAddressBookCache(owner?: string) {
  if (owner && ethers.isAddress(owner)) {
    addressBookCache.delete(owner.toLowerCase());
  } else {
    addressBookCache.clear();
  }
}

export async function fetchAddressBookContacts(
  owner: string,
  options?: { force?: boolean; signal?: AbortSignal }
): Promise<AddressBookContact[]> {
  const trimmed = (owner || "").trim();
  if (!trimmed || !ethers.isAddress(trimmed)) return [];
  const checksummed = ethers.getAddress(trimmed);
  const key = checksummed.toLowerCase();

  if (!options?.force) {
    const hit = addressBookCache.get(key);
    if (hit && Date.now() - hit.at < ADDRESS_BOOK_CACHE_MS) {
      return hit.contacts;
    }
    const existing = addressBookInflight.get(key);
    if (existing) return existing;
  }

  const task = (async (): Promise<AddressBookContact[]> => {
    const rawList = await withArcRpc(
      async (provider) => {
        const contract = new ethers.Contract(ADDRESS_BOOK_ADDRESS, ADDRESS_BOOK_ABI, provider);
        return (await contract.getContacts(checksummed)) as Array<{
          recipient: string;
          label: string;
          domain: string;
          addedAt: bigint;
          updatedAt: bigint;
          exists: boolean;
        }>;
      },
      { signal: options?.signal }
    );

    const contacts: AddressBookContact[] = [];
    for (const item of rawList) {
      if (!item || !item.exists || !ethers.isAddress(item.recipient)) continue;
      contacts.push({
        recipient: ethers.getAddress(item.recipient),
        label: String(item.label || "").trim(),
        domain: String(item.domain || "").trim(),
        addedAt: Number(item.addedAt ?? 0n),
        updatedAt: Number(item.updatedAt ?? 0n),
      });
    }

    contacts.sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
      return a.label.localeCompare(b.label);
    });

    addressBookCache.set(key, { at: Date.now(), contacts });
    return contacts;
  })().finally(() => {
    if (addressBookInflight.get(key) === task) {
      addressBookInflight.delete(key);
    }
  });

  addressBookInflight.set(key, task);
  return task;
}

/**
 * Fetches ERC-20 (and shared native-backed USDC) balances for an arbitrary token list
 * in a single Multicall3.aggregate3 RPC roundtrip, falling back to Promise.allSettled.
 * Keys in the returned record are lowercased token contract addresses.
 */
export async function fetchMultiTokenBalances(
  wallet: string,
  tokenAddresses: string[],
  options?: { signal?: AbortSignal }
): Promise<Record<string, bigint>> {
  const trimmedWallet = (wallet || "").trim();
  if (!trimmedWallet || !ethers.isAddress(trimmedWallet) || tokenAddresses.length === 0) {
    return {};
  }

  const checksummedWallet = ethers.getAddress(trimmedWallet);
  const uniqueTokens: string[] = [];
  const seen = new Set<string>();
  for (const addr of tokenAddresses) {
    if (!addr || !ethers.isAddress(addr)) continue;
    const lower = addr.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    uniqueTokens.push(ethers.getAddress(addr));
  }
  if (uniqueTokens.length === 0) return {};

  const usdcLower = USDC_ERC20_ADDRESS.toLowerCase();
  const useMc3 = await isMulticall3Available();

  if (useMc3) {
    try {
      const mcIface = new ethers.Interface(MULTICALL3_ABI);
      const erc20Iface = new ethers.Interface(ERC20_ABI);
      const calls: MulticallCall[] = uniqueTokens.map((tokenAddr) => {
        if (tokenAddr.toLowerCase() === usdcLower) {
          return {
            target: MULTICALL3_ADDRESS,
            allowFailure: true,
            callData: mcIface.encodeFunctionData("getEthBalance", [checksummedWallet]),
          };
        }
        return {
          target: tokenAddr,
          allowFailure: true,
          callData: erc20Iface.encodeFunctionData("balanceOf", [checksummedWallet]),
        };
      });

      const rawResults = await withArcRpc(
        async (provider) => {
          const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
          return (await mc.aggregate3.staticCall(calls)) as MulticallResult[];
        },
        { signal: options?.signal }
      );

      const balances: Record<string, bigint> = {};
      for (let i = 0; i < uniqueTokens.length; i++) {
        const tokenAddr = uniqueTokens[i];
        const lower = tokenAddr.toLowerCase();
        const entry = rawResults[i];
        if (!entry?.success || !entry.returnData || entry.returnData === "0x") {
          balances[lower] = 0n;
          continue;
        }
        try {
          if (lower === usdcLower) {
            const nativeBal = BigInt(mcIface.decodeFunctionResult("getEthBalance", entry.returnData)[0]);
            balances[lower] = poolUsdcFromNative(nativeBal);
          } else {
            balances[lower] = BigInt(erc20Iface.decodeFunctionResult("balanceOf", entry.returnData)[0]);
          }
        } catch {
          balances[lower] = 0n;
        }
      }
      return balances;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      multicall3Status = false;
    }
  }

  return withArcRpc(
    async (provider) => {
      const settled = await Promise.allSettled(
        uniqueTokens.map(async (tokenAddr) => {
          const lower = tokenAddr.toLowerCase();
          if (lower === usdcLower) {
            const nativeBal = await provider.getBalance(checksummedWallet);
            return [lower, poolUsdcFromNative(nativeBal)] as const;
          }
          const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
          const bal = (await erc20.balanceOf(checksummedWallet)) as bigint;
          return [lower, bal] as const;
        })
      );

      const balances: Record<string, bigint> = {};
      for (let i = 0; i < uniqueTokens.length; i++) {
        const res = settled[i];
        if (res.status === "fulfilled") {
          balances[res.value[0]] = res.value[1];
        } else {
          balances[uniqueTokens[i].toLowerCase()] = 0n;
        }
      }
      return balances;
    },
    { signal: options?.signal }
  );
}
