import { ethers } from "ethers";

export const WUSDC_ADDRESS = "0xDe5DB9049a8dd344dC1B7Bbb098f9da60930A6dA";
export const FACTORY_ADDRESS = "0x7cC023C7184810B84657D55c1943eBfF8603B72B";
export const ROUTER_ADDRESS = "0xB92428D440c335546b69138F7fAF689F5ba8D436";
export const ARC_RPC_URL = "https://rpc.testnet.arc.network";
export const ARC_CHAIN_ID = 5042002;

export const BALANCE_CACHE_MS = 30_000;

let arcReadProvider: ethers.JsonRpcProvider | null = null;

export function getArcReadProvider(): ethers.JsonRpcProvider {
  if (!arcReadProvider) {
    arcReadProvider = new ethers.JsonRpcProvider(ARC_RPC_URL, ARC_CHAIN_ID, { staticNetwork: true });
  }
  return arcReadProvider;
}

export const WUSDC_DECIMALS = 18;
export const EURC_DECIMALS = 6;
export const LP_DECIMALS = 18;

export const DEFAULT_SLIPPAGE_BPS = 100;
export const SLIPPAGE_PRESETS = [50, 100, 300] as const;
export const DEADLINE_SECONDS = 20 * 60;
export const NATIVE_GAS_BUFFER = ethers.parseUnits("0.02", 18);

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
  "function swapExactETHForTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable returns (uint256[] amounts)",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)",
  "function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) returns (uint256 amountToken, uint256 amountETH)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)",
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
    return "Network call failed. Confirm you are on Arc Testnet and try again.";
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
