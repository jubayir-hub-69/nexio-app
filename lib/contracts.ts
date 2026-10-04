import { ethers } from "ethers";

export type ArcNetworkName = "testnet" | "mainnet";

const REQUESTED_NETWORK = (process.env.NEXT_PUBLIC_NETWORK || "testnet").trim().toLowerCase();
export const ARC_NETWORK: ArcNetworkName =
  REQUESTED_NETWORK === "mainnet" || REQUESTED_NETWORK === "arc_mainnet" ? "mainnet" : "testnet";
export const IS_ARC_MAINNET = ARC_NETWORK === "mainnet";
export const USE_ERC20_USDC = IS_ARC_MAINNET;
export const ARC_NETWORK_LABEL = IS_ARC_MAINNET ? "Arc Mainnet" : "Arc Testnet";

function pickAddress(value: string | undefined, fallback: string): string {
  const trimmed = (value || "").trim();
  return ethers.isAddress(trimmed) ? ethers.getAddress(trimmed) : fallback;
}

const TESTNET = {
  chainId: 5042002,
  chainIdHex: "0x4cef52",
  rpcUrl: "https://rpc.testnet.arc.network",
  explorer: "https://testnet.arcscan.app",
  eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  usdcPool: "0xDe5DB9049a8dd344dC1B7Bbb098f9da60930A6dA",
  usdcPoolDecimals: 18,
  factory: "0x7cC023C7184810B84657D55c1943eBfF8603B72B",
  router: "0xB92428D440c335546b69138F7fAF689F5ba8D436",
  dailyGm: "0x38e1458db96272B23c270AC2428f849D8b7611AD",
  ans: "0x19c27c2a8729e8A326dF24EF740832b09A607fD0",
  eurcVault: "0x9b3D45Fb7Ce921baB078aB270f7f67b54Fc7c0AC",
  usdcVault: "0x0cbF1bA0D6F7e820f25FBE473Be352E516C0F1C8",
  swap: ethers.ZeroAddress,
};

const MAINNET_USDC = "0x3600000000000000000000000000000000000000";
const MAINNET_EURC = "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1";
const MAINNET_FACTORY = "0xb0C2B0acb9c13079dDd871eDaF43Aabf6e88C530";
const MAINNET_ROUTER = "0x52FE40c00530db2e43d01652f903870571A14AFD";

const MAINNET = {
  chainId: 5042,
  chainIdHex: "0x13b2",
  rpcUrl: "https://rpc.mainnet.arc.io",
  explorer: "https://explorer.arc.io",
  eurc: MAINNET_EURC,
  usdcPool: MAINNET_USDC,
  usdcPoolDecimals: 6,
  factory: MAINNET_FACTORY,
  router: MAINNET_ROUTER,
  dailyGm: pickAddress(process.env.NEXT_PUBLIC_DAILY_GM_ADDRESS, "0x609A9D897DB4c554a03d4304c8EF42b56ea32e31"),
  ans: pickAddress(process.env.NEXT_PUBLIC_ANS_ADDRESS, "0xE3FdB021493953C95F4c93bCCF83B762e4475Ed7"),
  eurcVault: pickAddress(process.env.NEXT_PUBLIC_EURC_VAULT_ADDRESS, "0xb30c9272a28749Ae0B04E1d5977337a570025009"),
  usdcVault: pickAddress(process.env.NEXT_PUBLIC_USDC_VAULT_ADDRESS, "0x045700Cd0D442E65dcB549330580d9981bcbC5E0"),
  swap: pickAddress(process.env.NEXT_PUBLIC_NEXIO_SWAP_ADDRESS, "0xD3504e2118b1c7a52cf44947510633562635ee03"),
};

const ACTIVE = IS_ARC_MAINNET ? MAINNET : TESTNET;

export const ARC_CHAIN_ID = ACTIVE.chainId;
export const ARC_CHAIN_ID_HEX = ACTIVE.chainIdHex;
export const ARC_RPC_URL = ACTIVE.rpcUrl;
export const ARC_EXPLORER = ACTIVE.explorer;
export const EURC_ADDRESS = ACTIVE.eurc;
export const WUSDC_ADDRESS = ACTIVE.usdcPool;
export const FACTORY_ADDRESS = ACTIVE.factory;
export const ROUTER_ADDRESS = ACTIVE.router;
export const DAILY_GM_ADDRESS = ACTIVE.dailyGm;
export const ANS_CONTRACT_ADDRESS = ACTIVE.ans;
export const EURC_VAULT_ADDRESS = ACTIVE.eurcVault;
export const USDC_VAULT_ADDRESS = ACTIVE.usdcVault;
export const NEXIO_SWAP_ADDRESS = ACTIVE.swap;

export const NEXIO_SWAP_ABI = [
  "function swapUSDCforEURC(uint256 amountIn, uint256 amountOutMin, uint256 deadline) returns (uint256 amountOut)",
  "function swapEURCforUSDC(uint256 amountIn, uint256 amountOutMin, uint256 deadline) returns (uint256 amountOut)",
  "function usdc() view returns (address)",
  "function eurc() view returns (address)",
];
export const USDC_ERC20_ADDRESS = "0x3600000000000000000000000000000000000000";

export const DAILY_GM_ABI = [
  "function checkIn() external",
  "function lastCheckIn(address) external view returns (uint256)",
  "function streak(address) external view returns (uint256)"
];

export const ANS_ABI = [
  "function register(string _name) external",
  "function resolve(string _name) external view returns (address)",
  "function resolveByAddress(address _owner) external view returns (string memory)",
  "function isAvailable(string _name) external view returns (bool)",
  "event DomainRegistered(string indexed name, address indexed owner)"
];

export const BALANCE_CACHE_MS = 30_000;

let arcReadProvider: ethers.JsonRpcProvider | null = null;

export function getArcReadProvider(): ethers.JsonRpcProvider {
  if (!arcReadProvider) {
    arcReadProvider = new ethers.JsonRpcProvider(ARC_RPC_URL, ARC_CHAIN_ID, { staticNetwork: true });
  }
  return arcReadProvider;
}

export const NATIVE_USDC_DECIMALS = 18;
export const WUSDC_DECIMALS = ACTIVE.usdcPoolDecimals;
export const EURC_DECIMALS = 6;
export const LP_DECIMALS = 18;

export const DEFAULT_SLIPPAGE_BPS = 100;
export const SLIPPAGE_PRESETS = [50, 100, 300] as const;
export const MAX_SWAP_PRICE_IMPACT_BPS = 500;
export const MAX_SWAP_VALUE_LOSS_BPS = 2000;
export const DEADLINE_SECONDS = 20 * 60;
export const NATIVE_GAS_BUFFER = ethers.parseUnits("0.02", 18);

export const USDC_VAULT_ABI = USE_ERC20_USDC
  ? [
      "function deposit(uint256 amount) external",
      "function withdraw(uint256 amount) external",
      "function stakedBalance(address) external view returns (uint256)",
      "function getPendingYield(address user) external view returns (uint256)",
    ]
  : [
      "function deposit() external payable",
      "function withdraw(uint256 amount) external",
      "function stakedBalance(address) external view returns (uint256)",
      "function getPendingYield(address user) external view returns (uint256)",
    ];

const USDC_POOL_SCALE = BigInt(10) ** BigInt(NATIVE_USDC_DECIMALS - WUSDC_DECIMALS);

export function poolUsdcFromNative(nativeAmount: bigint): bigint {
  if (WUSDC_DECIMALS === NATIVE_USDC_DECIMALS) return nativeAmount;
  return nativeAmount / USDC_POOL_SCALE;
}

export function maxPoolUsdcSpend(nativeBalance: bigint, buffer: bigint = NATIVE_GAS_BUFFER): bigint {
  if (WUSDC_DECIMALS === NATIVE_USDC_DECIMALS) {
    return nativeBalance > buffer ? nativeBalance - buffer : BigInt(0);
  }
  const poolBalance = poolUsdcFromNative(nativeBalance);
  const poolBuffer = poolUsdcFromNative(buffer);
  return poolBalance > poolBuffer ? poolBalance - poolBuffer : BigInt(0);
}

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export const WUSDC_ABI = [
  ...ERC20_ABI,
  "function deposit() payable",
  "function withdraw(uint256 wad)",
];

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
  "function decimals() view returns (uint8)",
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
  if (amount <= BigInt(0)) return BigInt(0);
  const bpsBig = BigInt(Math.max(0, Math.min(5000, Math.round(bps))));
  return amount - (amount * bpsBig) / BigInt(10000);
}

function bpsBetween(expected: bigint, actual: bigint): number {
  if (expected <= BigInt(0)) return 10000;
  if (actual >= expected) return 0;
  const bps = ((expected - actual) * BigInt(10000)) / expected;
  const asNumber = Number(bps);
  return Number.isFinite(asNumber) ? asNumber : 10000;
}

export function quotePriceImpactBps(unitIn: bigint, spotOut: bigint, amountIn: bigint, amountOut: bigint): number {
  if (unitIn <= BigInt(0) || spotOut <= BigInt(0) || amountIn <= BigInt(0) || amountOut <= BigInt(0)) return 10000;
  const expected = (spotOut * amountIn) / unitIn;
  return bpsBetween(expected, amountOut);
}

export function stableValueLossBps(amountIn: bigint, inDecimals: number, amountOut: bigint, outDecimals: number): number {
  if (amountIn <= BigInt(0) || inDecimals < 0 || outDecimals < 0 || inDecimals > 18 || outDecimals > 18) return 10000;
  const inNorm = amountIn * (BigInt(10) ** BigInt(18 - inDecimals));
  const outNorm = amountOut * (BigInt(10) ** BigInt(18 - outDecimals));
  return bpsBetween(inNorm, outNorm);
}

export type SwapQuote = {
  amountOut: bigint;
  amountOutMin: bigint;
  priceImpactBps: number;
  valueLossBps: number;
  blocked: boolean;
  reason: string;
};

export async function quoteSwap(
  provider: ethers.Provider,
  amountIn: bigint,
  usdcIn: boolean,
  slippageBps: number = DEFAULT_SLIPPAGE_BPS
): Promise<SwapQuote> {
  const router = new ethers.Contract(ROUTER_ADDRESS, [
    "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  ], provider);
  const path = usdcIn ? [WUSDC_ADDRESS, EURC_ADDRESS] : [EURC_ADDRESS, WUSDC_ADDRESS];
  const inDecimals = usdcIn ? WUSDC_DECIMALS : EURC_DECIMALS;
  const outDecimals = usdcIn ? EURC_DECIMALS : WUSDC_DECIMALS;
  const unit = ethers.parseUnits("1", inDecimals);
  const [trade, spot] = await Promise.all([
    router.getAmountsOut(amountIn, path) as Promise<bigint[]>,
    router.getAmountsOut(unit, path) as Promise<bigint[]>,
  ]);
  const amountOut = trade[trade.length - 1] ?? BigInt(0);
  const spotOut = spot[spot.length - 1] ?? BigInt(0);
  const priceImpactBps = quotePriceImpactBps(unit, spotOut, amountIn, amountOut);
  const valueLossBps = stableValueLossBps(amountIn, inDecimals, amountOut, outDecimals);
  const impactBlocked = priceImpactBps > MAX_SWAP_PRICE_IMPACT_BPS;
  const lossBlocked = valueLossBps > MAX_SWAP_VALUE_LOSS_BPS;
  let reason = "";
  if (lossBlocked) {
    reason = `Swap disabled. You would lose about ${(valueLossBps / 100).toFixed(2)}% versus the amount you pay. The pool is too thin.`;
  } else if (impactBlocked) {
    reason = `Swap disabled. Price impact is ${(priceImpactBps / 100).toFixed(2)}%, above the ${(MAX_SWAP_PRICE_IMPACT_BPS / 100).toFixed(2)}% limit.`;
  }
  return {
    amountOut,
    amountOutMin: applySlippage(amountOut, slippageBps),
    priceImpactBps,
    valueLossBps,
    blocked: impactBlocked || lossBlocked,
    reason,
  };
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
  if (value === BigInt(0)) return "0.00";
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
  return balance > buffer ? balance - buffer : BigInt(0);
}

export function formatSharePercent(part: bigint, total: bigint): string {
  if (total === BigInt(0) || part === BigInt(0)) return "0";
  const scaled = (part * BigInt(100000000)) / total;
  if (scaled === BigInt(0)) return "<0.000001";
  return trimZeros(ethers.formatUnits(scaled, 6));
}

export function slippageLabel(bps: number): string {
  return `${(bps / 100).toString()}%`;
}

export function getTxErrorMessage(error: unknown): string {
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

  const raw =
    err?.shortMessage ||
    err?.reason ||
    err?.info?.error?.message ||
    err?.message ||
    "Transaction failed";

  const cleaned = raw
    .replace(/^execution reverted:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(/\(action="[^"]*",[^)]*\)/g, "")
    .trim();

  if (/INSUFFICIENT_OUTPUT_AMOUNT/i.test(cleaned)) return "Quote moved. Try a smaller amount or retry.";
  if (/INSUFFICIENT_LIQUIDITY/i.test(cleaned)) return "Insufficient pool liquidity for this amount.";
  if (/INSUFFICIENT_A_AMOUNT|INSUFFICIENT_B_AMOUNT/i.test(cleaned)) return "Amount slipped. Retry the transaction.";
  if (/INSUFFICIENT_INPUT|insufficient funds|insufficient balance/i.test(cleaned)) return "Insufficient balance.";
  if (/EXPIRED/i.test(cleaned)) return "Transaction expired. Please try again.";
  if (/user rejected|denied transaction|rejected the request/i.test(cleaned)) return "Transaction rejected in wallet";
  if (/missing revert data|CALL_EXCEPTION|could not coalesce|UNPREDICTABLE_GAS/i.test(cleaned)) {
    return `Network call failed. Confirm you are on ${ARC_NETWORK_LABEL} and try again.`;
  }

  return cleaned.slice(0, 160) || "Transaction failed";
}

let pairCache: { eurc: string; at: number; state: PairReserves | null } | null = null;

export function invalidatePairCache() {
  pairCache = null;
}

export async function fetchPairState(
  provider: ethers.Provider,
  eurcAddress: string,
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

  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
  const pairAddress = (await factory.getPair(WUSDC_ADDRESS, eurcAddress)) as string;
  if (!pairAddress || pairAddress === ethers.ZeroAddress) {
    pairCache = { eurc: key, at: Date.now(), state: null };
    return null;
  }

  const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const [token0, reserves, totalSupply] = await Promise.all([
    pair.token0() as Promise<string>,
    pair.getReserves() as Promise<{ reserve0: bigint; reserve1: bigint }>,
    pair.totalSupply() as Promise<bigint>,
  ]);

  const token0IsEurc = token0.toLowerCase() === eurcAddress.toLowerCase();
  const state: PairReserves = {
    pairAddress,
    token0,
    reserveEurc: token0IsEurc ? reserves.reserve0 : reserves.reserve1,
    reserveWusdc: token0IsEurc ? reserves.reserve1 : reserves.reserve0,
    totalSupply,
  };
  pairCache = { eurc: key, at: Date.now(), state };
  return state;
}

export function underlyingFromLp(
  lpAmount: bigint,
  totalSupply: bigint,
  reserveWusdc: bigint,
  reserveEurc: bigint
): { wusdc: bigint; eurc: bigint } {
  if (totalSupply === BigInt(0) || lpAmount === BigInt(0)) return { wusdc: BigInt(0), eurc: BigInt(0) };
  return {
    wusdc: (lpAmount * reserveWusdc) / totalSupply,
    eurc: (lpAmount * reserveEurc) / totalSupply,
  };
}

export function sanitizeAnsName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.nex$/i, "")
    .replace(/\.arc$/i, "")
    .replace(/[^a-z0-9-]/g, "");
}

export async function resolveAddressToDomain(
  address: string,
  provider?: ethers.Provider
): Promise<string | null> {
  if (!address || !ethers.isAddress(address)) return null;
  const p = provider || getArcReadProvider();
  const contract = new ethers.Contract(ANS_CONTRACT_ADDRESS, ANS_ABI, p);
  const domain = (await contract.resolveByAddress(address)) as string;
  if (!domain || !domain.trim()) return null;
  return sanitizeAnsName(domain);
}

export async function resolveDomainToAddress(
  name: string,
  provider?: ethers.Provider
): Promise<string | null> {
  const clean = sanitizeAnsName(name);
  if (!clean) return null;
  const p = provider || getArcReadProvider();
  try {
    const contract = new ethers.Contract(ANS_CONTRACT_ADDRESS, ANS_ABI, p);
    const address = (await contract.resolve(clean)) as string;
    if (!address || address === ethers.ZeroAddress) return null;
    return address;
  } catch {
    return null;
  }
}

export async function isDomainAvailable(
  name: string,
  provider?: ethers.Provider
): Promise<boolean> {
  const clean = sanitizeAnsName(name);
  if (!clean) return false;
  const p = provider || getArcReadProvider();
  try {
    const contract = new ethers.Contract(ANS_CONTRACT_ADDRESS, ANS_ABI, p);
    return Boolean(await contract.isAvailable(clean));
  } catch {
    return false;
  }
}

