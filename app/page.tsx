"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { ethers } from "ethers";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import nexioLogo from "@/public/nexio-logo.png";
import {
  ANS_ABI,
  ANS_CONTRACT_ADDRESS,
  ARC_CHAIN_ID,
  ARC_CHAIN_ID_HEX,
  ARC_EXPLORER,
  ARC_NETWORK_LABEL,
  ARC_RPC_URL,
  BALANCE_CACHE_MS,
  DAILY_GM_ABI,
  DAILY_GM_ADDRESS,
  ERC20_ABI,
  EURC_ADDRESS,
  EURC_DECIMALS,
  EURC_VAULT_ABI,
  EURC_VAULT_ADDRESS,
  FACTORY_ADDRESS,
  LP_DECIMALS,
  NATIVE_GAS_BUFFER,
  NATIVE_USDC_DECIMALS,
  NLP_DECIMALS,
  PAIR_ABI,
  POOL_SKEW_LIMIT_BPS,
  ROUTER_ABI,
  ROUTER_ADDRESS,
  SLIPPAGE_PRESETS,
  USDC_ERC20_ADDRESS,
  USDC_VAULT_ABI,
  USDC_VAULT_ADDRESS,
  WUSDC_ADDRESS,
  WUSDC_DECIMALS,
  applySlippage,
  batchResolveRecipients,
  computeUsdScaledVaultNlp18,
  decodeNexioError,
  ensureExactAllowance,
  fetchAccountProtocolSnapshot,
  fetchPairState,
  formatDisplay,
  formatExact,
  formatPretty,
  formatSharePercent,
  getArcReadProvider,
  getTxErrorMessage,
  invalidateAnsCache,
  invalidatePairCache,
  invalidateSnapshotCache,
  isAmountDraft,
  isDomainAvailable,
  isRpcTransportError,
  maxNativeSpend,
  maxPoolUsdcSpend,
  parseAmount,
  parseStrictAmount,
  poolPriceUsdPerEurc,
  poolUsdcFromNative,
  prepareAndSendTx,
  priceDivergenceBps,
  resolveAddressToDomain,
  resolveDomainToAddress,
  slippageLabel,
  swapDeadline,
  underlyingFromLp,
  validateAnsDomainInput,
  type AllowanceStage,
  type ResolvedRecipient,
  type TxExecutionStage,
} from "@/lib/contracts";
import {
  ACHSWAP_MAX_SLIPPAGE_BPS,
  SPOT_MAX_STALENESS_MS,
  assessStableSwap,
  describeAchswapError,
  isAbortError,
  isSpotRateFresh,
  requestAchswapQuote,
  requestAchswapSwap,
  requestOneUnitSpotOut,
  requestOneUnitSpotSnapshot,
} from "@/lib/achswap";
import {
  GM_TIERS,
  UNRANKED_GM_PROFILE,
  batchLimitForStreak,
  daysUntilNextGmTier,
  gmTierForStreak,
  nextGmTierForStreak,
  unlockedGmTierForStreak,
} from "@/lib/gm-tiers";
import { fetchOnChainHistory, type OnChainHistoryEntry } from "@/lib/history";
import {
  AlertTriangleIcon,
  AnimatedNumber,
  BatchCapacityRail,
  CloseIcon,
  CopyButton,
  DailyGmGauge,
  DomainResolutionBadge,
  ExplorerReceiptDrawer,
  ExternalLinkIcon,
  HistoryEmptyIcon,
  HoloPassCard,
  LinkIcon,
  LiquidityTelemetryBar,
  LockIcon,
  MoonIcon,
  OnChainSeal,
  PassBadgeIcon,
  PortfolioAllocationBar,
  PriceImpactMeter,
  QrCodeIcon,
  QrCodeSvg,
  QuoteFreshnessRing,
  RadarSpinner,
  ReceiveArrowIcon,
  RefreshCwIcon,
  ReserveSkewGauge,
  SearchIcon,
  SendArrowIcon,
  ShieldCheckIcon,
  SparklesSealIcon,
  SunIcon,
  SwapFlipButton,
  SwapRouteConduit,
  TxHeaderStatusPill,
  TxLifecycleStepper,
  VaultPositionMeter,
  exportNexioPassPng,
  type BatchRecipientStatus,
  type TxLifecycleState,
  type TxStepItem,
  type TxStepStatus,
} from "@/components/nexio";
import Documentation from "@/components/docs/Documentation";

const QrScanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  { ssr: false }
);

type TabId =
  | "overview"
  | "portfolio"
  | "swap"
  | "lp"
  | "dailygm"
  | "domains"
  | "trustpass"
  | "history"
  | "docs";

const ALL_TABS: readonly { id: TabId; label: string; shortLabel: string; badge?: string }[] = [
  { id: "overview", label: "Dashboard", shortLabel: "Dashboard" },
  { id: "portfolio", label: "Portfolio & DeFi", shortLabel: "Portfolio", badge: "LIVE" },
  { id: "swap", label: "Nexio Swap", shortLabel: "Swap" },
  { id: "lp", label: "Liquidity", shortLabel: "Liquidity", badge: "LP" },
  { id: "dailygm", label: "Daily GM", shortLabel: "Daily GM" },
  { id: "domains", label: "Nexio Domains", shortLabel: "Domains" },
  { id: "trustpass", label: "Nexio Pass", shortLabel: "Pass" },
  { id: "history", label: "History", shortLabel: "History" },
  { id: "docs", label: "Documentation", shortLabel: "Docs" },
] as const;

const VALID_TABS = new Set<TabId>([
  "overview",
  "portfolio",
  "swap",
  "lp",
  "dailygm",
  "domains",
  "trustpass",
  "history",
  "docs",
]);

type AppTheme = "dark" | "light";

type Eip1193Provider = ethers.Eip1193Provider & {
  isRabby?: boolean;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  providers?: Eip1193Provider[];
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type WindowWithEthereum = Window & {
  ethereum?: Eip1193Provider;
};

const ZERO = 0n;
const UNIT_6 = 1_000_000n;
const NLP_SCALE_12 = 1_000_000_000_000n;
const NLP_DIVISOR = 864_000n; // Exact: 100 * 10^6 staked * 10^12 * 86,400s / 864,000 = 10 * 10^18 NLP / 24h
const SWAP_QUOTE_REFRESH_MS = 15_000;

function readDocumentTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  const attr = document.documentElement.dataset.theme;
  if (attr === "light" || attr === "dark") return attr;
  try {
    const saved =
      window.localStorage.getItem("nexio_theme") ||
      window.localStorage.getItem("trustbank_theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore storage errors
  }
  return "dark";
}

function parseTabParam(raw: string | null): TabId {
  if (!raw) return "overview";
  const clean = raw.trim().toLowerCase();
  if (clean === "learn") return "docs";
  if (VALID_TABS.has(clean as TabId)) return clean as TabId;
  return "overview";
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function walletStorageKey(prefix: string, wallet: string): string {
  return `${prefix}_${wallet.trim().toLowerCase()}`;
}

function readNormalizedLocalItem(prefix: string, wallet: string): string | null {
  if (typeof window === "undefined" || !wallet) return null;
  try {
    const canonicalKey = walletStorageKey(prefix, wallet);
    const direct = window.localStorage.getItem(canonicalKey);
    if (direct !== null) return direct;

    const rawCase = window.localStorage.getItem(`${prefix}_${wallet}`);
    if (rawCase !== null) {
      window.localStorage.setItem(canonicalKey, rawCase);
      return rawCase;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function sanitizeDecimalDraft(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, "")}`;
}

function formatCooldownHms(secondsLeft: number): string {
  if (secondsLeft <= 0) return "";
  const clamped = Math.max(0, Math.floor(secondsLeft));
  const h = Math.floor(clamped / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((clamped % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(clamped % 60)
    .toString()
    .padStart(2, "0");
  return `${h}h ${m}m ${s}s`;
}

function isUserWalletRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string | number; message?: string; shortMessage?: string };
  if (err.code === 4001 || err.code === "ACTION_REJECTED") return true;
  const msg = `${err.shortMessage ?? ""} ${err.message ?? ""}`;
  return /user rejected|denied transaction|rejected the request|rejected in wallet/i.test(msg);
}

function isUnsupportedBatchCallsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (isUserWalletRejection(error)) return false;
  const err = error as {
    code?: string | number;
    message?: string;
    shortMessage?: string;
    info?: { error?: { code?: number; message?: string } };
  };
  const codes = [err.code, err.info?.error?.code];
  for (const c of codes) {
    if (
      c === 4200 ||
      c === -32601 ||
      c === -32600 ||
      c === -32602 ||
      c === -32004 ||
      c === 5700 ||
      c === 5710
    ) {
      return true;
    }
  }
  const text = `${err.shortMessage ?? ""} ${err.message ?? ""} ${err.info?.error?.message ?? ""}`;
  return /method not found|not supported|unsupported|does not exist|not implemented|wallet_sendCalls|atomic|eoa/i.test(
    text
  );
}

function mapStageToStepStatus(stage: TxExecutionStage | AllowanceStage): TxStepStatus {
  switch (stage) {
    case "checking_allowance":
    case "resetting_allowance":
    case "simulating":
      return "simulating";
    case "awaiting_wallet":
      return "awaiting_wallet";
    case "confirming_block":
    case "verifying_propagation":
      return "confirming_block";
    case "completed":
      return "completed";
  }
}

function formatHistoryTimestamp(ts: number | null): string {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "Confirmed on Arc";
  try {
    return new Date(ts * 1000).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Confirmed on Arc";
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Static, Hydration-Safe Dual-Theme Palette (Light Mode WCAG AAA + Dark Mode)
// Driven entirely by `<html data-theme="light|dark">` set before first paint in `app/layout.tsx`.
const tc = {
  bgApp:
    "bg-[#f1f5f9] bg-[radial-gradient(ellipse_80%_70%_at_50%_-20%,rgba(3,105,161,0.08),rgba(241,245,249,1))] text-slate-900 dark:bg-[#020617] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.14),rgba(2,6,23,1))] dark:text-slate-50",
  textWelcome:
    "from-slate-950 via-sky-900 to-sky-700 dark:from-white dark:via-cyan-100 dark:to-cyan-400",
  textDesc: "text-slate-700 dark:text-slate-300",
  textMain: "text-slate-900 dark:text-white",
  textMuted: "text-slate-600 dark:text-slate-400",
  solidCardBg:
    "bg-white border-slate-300 shadow-sm dark:bg-[#071120]/85 dark:border-white/10 dark:backdrop-blur-2xl dark:shadow-[0_24px_60px_-15px_rgba(2,6,23,0.7)]",
  subPanelBg:
    "bg-[#eef2f6] border-slate-300 dark:bg-black/35 dark:border-white/[0.08]",
  segTrackBg:
    "bg-slate-200/90 border-slate-300 dark:bg-black/40 dark:border-white/[0.08]",
  sidebarActive:
    "bg-slate-900 text-white border-slate-900 shadow-sm dark:bg-cyan-500/15 dark:text-cyan-200 dark:border-cyan-400/35",
  sidebarInactive:
    "bg-transparent text-slate-700 border-transparent hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white",
  drawerBg: "bg-white border-slate-300 dark:bg-[#050B16] dark:border-white/10",
  cardBg:
    "border-slate-300 bg-white shadow-sm text-slate-900 hover:border-sky-600/50 dark:border-white/10 dark:bg-gradient-to-b dark:from-[#0A1A38]/65 dark:to-[#060E1E]/85 dark:shadow-2xl dark:text-white dark:hover:border-cyan-400/25",
  actionCard:
    "border-slate-300 bg-white shadow-sm text-slate-900 hover:bg-slate-50 hover:border-sky-600/50 dark:border-white/10 dark:bg-[#0A1931]/60 dark:shadow-lg dark:text-white dark:hover:bg-[#0E2242]/80 dark:hover:border-cyan-400/30",
  modalBg:
    "border-slate-300 bg-white shadow-2xl text-slate-900 dark:border-white/12 dark:bg-[#071326] dark:text-white",
  inputBg:
    "border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-sky-700 dark:border-white/12 dark:bg-black/45 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-cyan-400",
  historyCard:
    "border-slate-300 bg-white hover:border-sky-600/50 hover:bg-slate-50/90 text-slate-900 dark:border-white/[0.08] dark:bg-[#09162B]/65 dark:hover:border-cyan-400/25 dark:hover:bg-[#0B1B35] dark:text-white",
  footerBg: "border-slate-300 bg-white/95 dark:border-white/10 dark:bg-[#030814]/85",
  footerIcon:
    "text-slate-700 border-slate-300 bg-slate-100 hover:text-sky-800 hover:bg-slate-200 dark:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:hover:text-white dark:hover:bg-white/10",
} as const;

export default function Home() {
  // Deterministic SSR + Hydration state (100% byte-for-byte match on hydrateRoot)
  const [theme, setTheme] = useState<AppTheme>("dark");
  const [selectedTab, setSelectedTab] = useState<TabId>("overview");

  const [wallet, setWallet] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Protocol Snapshot & Balances
  const [usdcBalance, setUsdcBalance] = useState("0.00");
  const [eurcBalance, setEurcBalance] = useState("0.00");
  const [usdcBalanceRaw, setUsdcBalanceRaw] = useState<bigint>(ZERO);
  const [eurcBalanceRaw, setEurcBalanceRaw] = useState<bigint>(ZERO);
  const [wusdcBalanceRaw, setWusdcBalanceRaw] = useState<bigint>(ZERO);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesReady, setBalancesReady] = useState(false);
  const [networkLatency, setNetworkLatency] = useState(0);

  // Transaction Lifecycle & Receipt Drawer
  const [txLifecycle, setTxLifecycle] = useState<TxLifecycleState | null>(null);
  const [receiptDrawerDismissed, setReceiptDrawerDismissed] = useState(false);

  // Identity & Nexio Pass
  const [registeredDomain, setRegisteredDomain] = useState("");
  const [passVerified, setPassVerified] = useState(false);
  const [isVerifyingPass, setIsVerifyingPass] = useState(false);
  const [isExportingPass, setIsExportingPass] = useState(false);
  const [isRecoveringDomain, setIsRecoveringDomain] = useState(false);

  // Dashboard: Send, Request, Receive & Batch
  const [showSendModal, setShowSendModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendMemo, setSendMemo] = useState("");
  const [sendAsset, setSendAsset] = useState<"USDC" | "EURC">("USDC");
  const [isSending, setIsSending] = useState(false);
  const [resolvedRecipients, setResolvedRecipients] = useState<ResolvedRecipient[]>([]);
  const [isResolvingRecipient, setIsResolvingRecipient] = useState(false);
  const [batchRecipientStatuses, setBatchRecipientStatuses] = useState<BatchRecipientStatus[]>([]);
  const [batchExecutionMode, setBatchExecutionMode] = useState<
    "idle" | "wallet_batch" | "sequential"
  >("idle");
  const [failedBatchTargets, setFailedBatchTargets] = useState<string[]>([]);

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [requestAsset, setRequestAsset] = useState<"USDC" | "EURC">("USDC");
  const [paymentLink, setPaymentLink] = useState("");

  // Daily GM (Consecutive 24h Cooldown + 48h Expiry Window)
  const [streak, setStreak] = useState(0);
  const [lastCheckInTime, setLastCheckInTime] = useState(0);
  const [gmStreakExpiresAt, setGmStreakExpiresAt] = useState(0);
  const [cooldownRemainingSec, setCooldownRemainingSec] = useState(0);
  const [streakExpiresInSec, setStreakExpiresInSec] = useState<number | null>(null);
  const [liveChainNowSec, setLiveChainNowSec] = useState(0);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // Nexio Domains (ANS)
  const [domainSubTab, setDomainSubTab] = useState<"register" | "reverse">("register");
  const [domainSearch, setDomainSearch] = useState("");
  const [domainAvailable, setDomainAvailable] = useState(false);
  const [domainTaken, setDomainTaken] = useState(false);
  const [domainValidationMsg, setDomainValidationMsg] = useState<string | null>(null);
  const [isCheckingDomain, setIsCheckingDomain] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showDomainSuccess, setShowDomainSuccess] = useState(false);
  const [registrationHash, setRegistrationHash] = useState("");

  const [resolveAddressInput, setResolveAddressInput] = useState("");
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [resolvedDomainResult, setResolvedDomainResult] = useState<string | null>(null);
  const [resolvedOwnerAddress, setResolvedOwnerAddress] = useState<string | null>(null);
  const [resolvedAddressError, setResolvedAddressError] = useState<string | null>(null);

  // Portfolio, Vaults & Exact On-Chain 18-Dec NLP (10.00 NLP / $100 / 24h)
  const [vaultAsset, setVaultAsset] = useState<"USDC" | "EURC">("USDC");
  const [vaultMode, setVaultMode] = useState<"stake" | "withdraw">("stake");
  const [usdcStakedBalance, setUsdcStakedBalance] = useState("0.00");
  const [eurcStakedBalance, setEurcStakedBalance] = useState("0.00");
  const [usdcStakedRaw, setUsdcStakedRaw] = useState<bigint>(ZERO);
  const [eurcStakedRaw, setEurcStakedRaw] = useState<bigint>(ZERO);
  const [snapshotUsdcPendingNlp18, setSnapshotUsdcPendingNlp18] = useState<bigint>(ZERO);
  const [snapshotUsdcClaimedNlp18, setSnapshotUsdcClaimedNlp18] = useState<bigint>(ZERO);
  const [snapshotEurcPendingNlp18, setSnapshotEurcPendingNlp18] = useState<bigint>(ZERO);
  const [snapshotEurcClaimedNlp18, setSnapshotEurcClaimedNlp18] = useState<bigint>(ZERO);
  const [snapshotChainTs, setSnapshotChainTs] = useState<number>(0);
  const [vaultInput, setVaultInput] = useState("");
  const [isVaultLoading, setIsVaultLoading] = useState(false);
  const [vaultAction, setVaultAction] = useState<"stake" | "withdraw" | "claim" | null>(null);

  // Pure Unskewed Two-Sided EURC/USDC Spot Mark (with strict 45s staleness eviction)
  const [eurcSpotOut, setEurcSpotOut] = useState<bigint | null>(null);
  const [eurcSpotFetchedAt, setEurcSpotFetchedAt] = useState<number>(0);

  // Nexio Swap
  const [swapInput, setSwapInput] = useState("");
  const [swapDirection, setSwapDirection] = useState<"USDCtoEURC" | "EURCtoUSDC">("USDCtoEURC");
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapQuote, setSwapQuote] = useState("");
  const [swapQuoteRaw, setSwapQuoteRaw] = useState<bigint>(ZERO);
  const [swapQuoteError, setSwapQuoteError] = useState("");
  const [swapMinRaw, setSwapMinRaw] = useState<bigint>(ZERO);
  const [swapExecutor, setSwapExecutor] = useState("");
  const [swapQuoting, setSwapQuoting] = useState(false);
  const [swapImpactBps, setSwapImpactBps] = useState<number | null>(null);
  const [swapPartnerBps, setSwapPartnerBps] = useState<number | null>(null);
  const [swapLossBps, setSwapLossBps] = useState<number | null>(null);
  const [swapBlockReason, setSwapBlockReason] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [customSlippage, setCustomSlippage] = useState("");
  const [showSlippage, setShowSlippage] = useState(false);
  const [swapRefreshTick, setSwapRefreshTick] = useState(0);

  // Liquidity (LP)
  const [lpMode, setLpMode] = useState<"add" | "remove">("add");
  const [lpUsdcInput, setLpUsdcInput] = useState("");
  const [lpEurcInput, setLpEurcInput] = useState("");
  const [lpLastEdited, setLpLastEdited] = useState<"usdc" | "eurc">("usdc");
  const [lpRemoveInput, setLpRemoveInput] = useState("");
  const [lpRemoveIsMax, setLpRemoveIsMax] = useState(false);
  const [isLpLoading, setIsLpLoading] = useState(false);
  const [lpBalance, setLpBalance] = useState("0.00");
  const [lpBalanceRaw, setLpBalanceRaw] = useState<bigint>(ZERO);
  const [lpSharePct, setLpSharePct] = useState("0");
  const [lpPooledUsdc, setLpPooledUsdc] = useState("0.00");
  const [lpPooledEurc, setLpPooledEurc] = useState("0.00");
  const [lpPooledUsdcRaw, setLpPooledUsdcRaw] = useState<bigint>(ZERO);
  const [lpPooledEurcRaw, setLpPooledEurcRaw] = useState<bigint>(ZERO);
  const [poolReserveUsdc, setPoolReserveUsdc] = useState("0.00");
  const [poolReserveEurc, setPoolReserveEurc] = useState("0.00");
  const [poolReserveUsdcRaw, setPoolReserveUsdcRaw] = useState<bigint>(ZERO);
  const [poolReserveEurcRaw, setPoolReserveEurcRaw] = useState<bigint>(ZERO);
  const [lpPairAddress, setLpPairAddress] = useState("");
  const [lpRemovePreviewUsdc, setLpRemovePreviewUsdc] = useState("");
  const [lpRemovePreviewEurc, setLpRemovePreviewEurc] = useState("");
  const [lpSlippageBps, setLpSlippageBps] = useState(100);
  const [lpCustomSlippage, setLpCustomSlippage] = useState("");
  const [showLpSlippage, setShowLpSlippage] = useState(false);

  // Live On-Chain History + Session Memos
  const [historyEntries, setHistoryEntries] = useState<OnChainHistoryEntry[]>([]);
  const [sessionTxMemos, setSessionTxMemos] = useState<Record<string, string>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyNextCursor, setHistoryNextCursor] = useState<number | null>(null);
  const [historyScannedRange, setHistoryScannedRange] = useState<{
    from: number;
    to: number;
    latest: number;
  } | null>(null);

  // Non-render refs
  const txBusyRef = useRef(false);
  const walletRef = useRef("");
  const registeredDomainRef = useRef("");
  const latestAppliedBlockRef = useRef<{ wallet: string; blockNumber: number }>({
    wallet: "",
    blockNumber: 0,
  });
  const chainClockRef = useRef<{ blockTs: number; perfMs: number }>({ blockTs: 0, perfMs: 0 });
  const resolveAddressGenRef = useRef(0);
  const verifyPassGenRef = useRef(0);
  const recipientResolveGenRef = useRef(0);
  const historyGenRef = useRef(0);
  const messageTimerRef = useRef<number | null>(null);
  const sendLockRef = useRef(false);
  const lastLpQuoteKeyRef = useRef("");
  const autoCheckedPassWalletRef = useRef("");

  const isArcMainnet = chainId === ARC_CHAIN_ID;
  const chainLocked = Boolean(wallet) && chainId !== null && !isArcMainnet;
  const gmProfile = useMemo(() => gmTierForStreak(streak), [streak]);
  const unlockedTier = useMemo(() => unlockedGmTierForStreak(streak), [streak]);
  const nextGmTier = useMemo(() => nextGmTierForStreak(streak), [streak]);
  const daysToNextTier = useMemo(() => daysUntilNextGmTier(streak), [streak]);
  const verifiedIdentityDomain = passVerified && registeredDomain ? registeredDomain : "";

  // Sync mutable refs in effect (strictly compliant with react-hooks/refs)
  useEffect(() => {
    txBusyRef.current =
      isSending || isVaultLoading || isSwapping || isLpLoading || isCheckingIn || isRegistering;
  }, [isSending, isVaultLoading, isSwapping, isLpLoading, isCheckingIn, isRegistering]);

  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);

  useEffect(() => {
    registeredDomainRef.current = verifiedIdentityDomain;
  }, [verifiedIdentityDomain]);

  // Hydration-safe post-mount sync of theme & URL ?tab= parameter
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncClientView = () => {
      const currentTheme = readDocumentTheme();
      document.documentElement.dataset.theme = currentTheme;
      setTheme(currentTheme);

      const params = new URLSearchParams(window.location.search);
      setSelectedTab(parseTabParam(params.get("tab")));
    };

    const initId = window.setTimeout(syncClientView, 0);

    const onThemeSync = () => {
      setTheme(readDocumentTheme());
    };
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedTab(parseTabParam(params.get("tab")));
    };

    window.addEventListener("storage", onThemeSync);
    window.addEventListener("nexio-theme", onThemeSync);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.clearTimeout(initId);
      window.removeEventListener("storage", onThemeSync);
      window.removeEventListener("nexio-theme", onThemeSync);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = "Nexio Protocol | Arc Mainnet";
    }
  }, [selectedTab]);

  const showMessage = useCallback((text: string) => {
    setMessage(text);
    if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
    messageTimerRef.current = window.setTimeout(() => setMessage(""), 4500);
  }, []);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current !== null) window.clearTimeout(messageTimerRef.current);
    };
  }, []);

  const getChainClockNowSec = useCallback((): number => {
    if (chainClockRef.current.blockTs > 0 && typeof performance !== "undefined") {
      const elapsedSec = Math.max(
        0,
        Math.floor((performance.now() - chainClockRef.current.perfMs) / 1000)
      );
      return chainClockRef.current.blockTs + elapsedSec;
    }
    return Math.floor(Date.now() / 1000);
  }, []);

  const toggleTheme = useCallback(() => {
    const current = readDocumentTheme();
    const next: AppTheme = current === "dark" ? "light" : "dark";
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = next;
    }
    try {
      window.localStorage.setItem("nexio_theme", next);
    } catch {
      // ignore storage errors
    }
    setTheme(next);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("nexio-theme"));
    }
  }, []);

  const handleTabSwitch = useCallback((nextTab: TabId) => {
    setIsSidebarOpen(false);
    setSelectedTab(nextTab);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (nextTab === "overview") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", nextTab);
    }
    if (nextTab !== "docs") {
      url.hash = "";
    }
    const nextSearch = url.searchParams.toString();
    const nextHref = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
    window.history.replaceState({}, document.title, nextHref);
  }, []);

  // Close topmost modal or sidebar on Escape key
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showConfirmModal && !isSending) {
        setShowConfirmModal(false);
      } else if (showSendModal && !isSending) {
        setIsScanning(false);
        setShowSendModal(false);
      } else if (showReceiveModal) {
        setShowReceiveModal(false);
      } else if (showRequestModal) {
        setShowRequestModal(false);
      } else if (showDomainSuccess) {
        setShowDomainSuccess(false);
      } else if (isSidebarOpen) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    showConfirmModal,
    showSendModal,
    showReceiveModal,
    showRequestModal,
    showDomainSuccess,
    isSidebarOpen,
    isSending,
  ]);

  const rememberSessionMemo = useCallback((addr: string, txHash: string, memoText: string) => {
    const cleanHash = txHash.trim().toLowerCase();
    const cleanMemo = memoText.trim();
    if (!addr || !cleanHash || !cleanMemo) return;
    setSessionTxMemos((prev) => {
      const next = { ...prev, [cleanHash]: cleanMemo };
      try {
        window.localStorage.setItem(walletStorageKey("nexio_memos", addr), JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  }, []);

  const hydrateWalletLocalCache = useCallback((addr: string) => {
    if (!addr) return;
    const rawMemos = readNormalizedLocalItem("nexio_memos", addr);
    setSessionTxMemos(safeParseJson<Record<string, string>>(rawMemos, {}));
  }, []);

  const clearOnChainBalancesOnly = useCallback(() => {
    setUsdcBalance("0.00");
    setEurcBalance("0.00");
    setUsdcBalanceRaw(ZERO);
    setEurcBalanceRaw(ZERO);
    setWusdcBalanceRaw(ZERO);
    setUsdcStakedBalance("0.00");
    setEurcStakedBalance("0.00");
    setUsdcStakedRaw(ZERO);
    setEurcStakedRaw(ZERO);
    setSnapshotUsdcPendingNlp18(ZERO);
    setSnapshotUsdcClaimedNlp18(ZERO);
    setSnapshotEurcPendingNlp18(ZERO);
    setSnapshotEurcClaimedNlp18(ZERO);
    setSnapshotChainTs(0);
    setLpBalance("0.00");
    setLpBalanceRaw(ZERO);
    setLpSharePct("0");
    setLpPooledUsdc("0.00");
    setLpPooledEurc("0.00");
    setLpPooledUsdcRaw(ZERO);
    setLpPooledEurcRaw(ZERO);
    setBalancesReady(false);
    setBalancesLoading(false);
    latestAppliedBlockRef.current = { wallet: "", blockNumber: 0 };
  }, []);

  const resetSessionState = useCallback(
    (options?: { keepWallet?: boolean }) => {
      clearOnChainBalancesOnly();
      setPoolReserveUsdc("0.00");
      setPoolReserveEurc("0.00");
      setPoolReserveUsdcRaw(ZERO);
      setPoolReserveEurcRaw(ZERO);
      setLpPairAddress("");
      setTxLifecycle(null);
      setReceiptDrawerDismissed(false);
      lastLpQuoteKeyRef.current = "";
      setStreak(0);
      setLastCheckInTime(0);
      setGmStreakExpiresAt(0);
      setCooldownRemainingSec(0);
      setStreakExpiresInSec(null);
      setRegisteredDomain("");
      setPassVerified(false);
      setIsVerifyingPass(false);
      verifyPassGenRef.current += 1;
      historyGenRef.current += 1;
      autoCheckedPassWalletRef.current = "";
      setNetworkLatency(0);
      setIsBatchMode(false);
      setSendAddress("");
      setSendAmount("");
      setSendMemo("");
      setResolvedRecipients([]);
      setIsResolvingRecipient(false);
      setBatchRecipientStatuses([]);
      setBatchExecutionMode("idle");
      setFailedBatchTargets([]);
      setIsScanning(false);
      setShowSendModal(false);
      setShowConfirmModal(false);
      setShowReceiveModal(false);
      setShowRequestModal(false);
      setShowDomainSuccess(false);
      setVaultInput("");
      setSwapInput("");
      setSwapQuote("");
      setSwapQuoteRaw(ZERO);
      setSwapMinRaw(ZERO);
      setSwapExecutor("");
      setSwapImpactBps(null);
      setSwapPartnerBps(null);
      setSwapLossBps(null);
      setSwapBlockReason("");
      setSwapQuoteError("");
      setSwapQuoting(false);
      setLpUsdcInput("");
      setLpEurcInput("");
      setLpRemoveInput("");
      setLpRemoveIsMax(false);
      setLpRemovePreviewUsdc("");
      setLpRemovePreviewEurc("");
      setRequestAmount("");
      setPaymentLink("");
      setDomainSearch("");
      setDomainAvailable(false);
      setDomainTaken(false);
      setDomainValidationMsg(null);
      setDomainSubTab("register");
      setResolveAddressInput("");
      setResolvedDomainResult(null);
      setResolvedOwnerAddress(null);
      setResolvedAddressError(null);
      setHistoryEntries([]);
      setSessionTxMemos({});
      setHistoryError(null);
      setHistoryNextCursor(null);
      setHistoryScannedRange(null);
      setHistoryLoading(false);
      setHistoryLoadingMore(false);
      if (!options?.keepWallet) {
        setChainId(null);
      }
    },
    [clearOnChainBalancesOnly]
  );

  // Parse incoming ?to=&amount=&token= payment link cleanly without clobbering ?tab=
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      const rawTo = url.searchParams.get("to");
      const rawAmount = url.searchParams.get("amount");
      const rawToken = url.searchParams.get("token");

      if (!rawTo && !rawAmount) return;

      url.searchParams.delete("to");
      url.searchParams.delete("amount");
      url.searchParams.delete("token");
      const remainingSearch = url.searchParams.toString();
      window.history.replaceState(
        {},
        document.title,
        `${url.pathname}${remainingSearch ? `?${remainingSearch}` : ""}${url.hash}`
      );

      const cleanTo = (rawTo || "").trim();
      const asset: "USDC" | "EURC" = rawToken?.toUpperCase() === "EURC" ? "EURC" : "USDC";
      const decimals = asset === "EURC" ? EURC_DECIMALS : NATIVE_USDC_DECIMALS;

      const isValidAddress =
        ethers.isAddress(cleanTo) && cleanTo.toLowerCase() !== ethers.ZeroAddress;
      const domainCheck = validateAnsDomainInput(cleanTo);
      if (!isValidAddress && !domainCheck.valid) {
        showMessage("Invalid recipient in payment request link.");
        return;
      }

      const amountCheck = parseStrictAmount(rawAmount || "", decimals);
      if (!amountCheck.ok || amountCheck.value <= ZERO) {
        showMessage("Invalid amount in payment request link.");
        return;
      }

      setIsBatchMode(false);
      setSendAsset(asset);
      setSendAddress(isValidAddress ? ethers.getAddress(cleanTo) : domainCheck.fullDomain);
      setSendAmount((rawAmount || "").trim());
      setShowSendModal(true);
      showMessage(`Payment request loaded: ${(rawAmount || "").trim()} ${asset}`);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [showMessage]);

  const getEthereum = useCallback((): Eip1193Provider | null => {
    if (typeof window === "undefined") return null;
    const eth = (window as WindowWithEthereum).ethereum;
    if (!eth) return null;

    if (Array.isArray(eth.providers) && eth.providers.length > 0) {
      const rabby = eth.providers.find((p) => p.isRabby);
      if (rabby) return rabby;
      const metaMask = eth.providers.find((p) => p.isMetaMask && !p.isPhantom);
      if (metaMask) return metaMask;
      return eth.providers[0];
    }
    return eth;
  }, []);

  const syncNetwork = useCallback(async (): Promise<number | null> => {
    const ethereum = getEthereum();
    if (!ethereum) return null;
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);
      setChainId(currentChainId);
      if (currentChainId !== ARC_CHAIN_ID) {
        clearOnChainBalancesOnly();
      }
      return currentChainId;
    } catch {
      return null;
    }
  }, [getEthereum, clearOnChainBalancesOnly]);

  // Atomic Multicall3 Protocol Snapshot Loader (gated by latestAppliedBlockRef)
  const syncProtocolSnapshot = useCallback(
    async (address?: string, options?: { force?: boolean; signal?: AbortSignal }) => {
      await Promise.resolve();
      const targetWallet = (address ?? "").trim();
      const targetKey = targetWallet ? targetWallet.toLowerCase() : "__anon__";
      const isInitialForWallet = latestAppliedBlockRef.current.wallet !== targetKey;

      if (targetWallet && isInitialForWallet) {
        setBalancesLoading(true);
      }

      try {
        const snapshot = await fetchAccountProtocolSnapshot(targetWallet || undefined, {
          force: options?.force,
          signal: options?.signal,
        });

        const activeKey = walletRef.current ? walletRef.current.toLowerCase() : "__anon__";
        if (targetKey !== activeKey) return;

        if (
          snapshot.blockNumber > 0 &&
          latestAppliedBlockRef.current.wallet === targetKey &&
          snapshot.blockNumber < latestAppliedBlockRef.current.blockNumber
        ) {
          return;
        }

        if (snapshot.blockNumber > 0) {
          latestAppliedBlockRef.current = {
            wallet: targetKey,
            blockNumber: snapshot.blockNumber,
          };
        }

        const effectiveTs =
          snapshot.blockTimestamp > 0 ? snapshot.blockTimestamp : Math.floor(Date.now() / 1000);
        if (typeof performance !== "undefined") {
          chainClockRef.current = {
            blockTs: effectiveTs,
            perfMs: performance.now(),
          };
        }
        setLiveChainNowSec(effectiveTs);
        setNetworkLatency(snapshot.latencyMs);

        if (snapshot.pairState) {
          setLpPairAddress(snapshot.pairState.pairAddress);
          setPoolReserveUsdcRaw(snapshot.pairState.reserveWusdc);
          setPoolReserveEurcRaw(snapshot.pairState.reserveEurc);
          setPoolReserveUsdc(formatPretty(snapshot.pairState.reserveWusdc, WUSDC_DECIMALS, 4));
          setPoolReserveEurc(formatPretty(snapshot.pairState.reserveEurc, EURC_DECIMALS, 4));
        } else {
          setLpPairAddress("");
          setPoolReserveUsdcRaw(ZERO);
          setPoolReserveEurcRaw(ZERO);
          setPoolReserveUsdc("0.00");
          setPoolReserveEurc("0.00");
        }

        if (targetWallet) {
          setUsdcBalanceRaw(snapshot.nativeUsdcRaw);
          setUsdcBalance(formatDisplay(snapshot.nativeUsdcRaw, NATIVE_USDC_DECIMALS, 2));
          setWusdcBalanceRaw(poolUsdcFromNative(snapshot.nativeUsdcRaw));

          setEurcBalanceRaw(snapshot.eurcRaw);
          setEurcBalance(formatDisplay(snapshot.eurcRaw, EURC_DECIMALS, 2));

          setUsdcStakedRaw(snapshot.usdcStakedRaw);
          setUsdcStakedBalance(formatDisplay(snapshot.usdcStakedRaw, WUSDC_DECIMALS, 2));

          setEurcStakedRaw(snapshot.eurcStakedRaw);
          setEurcStakedBalance(formatDisplay(snapshot.eurcStakedRaw, EURC_DECIMALS, 2));

          setSnapshotUsdcPendingNlp18(snapshot.usdcPendingNlp18);
          setSnapshotUsdcClaimedNlp18(snapshot.usdcClaimedNlp18);
          setSnapshotEurcPendingNlp18(snapshot.eurcPendingNlp18);
          setSnapshotEurcClaimedNlp18(snapshot.eurcClaimedNlp18);
          setSnapshotChainTs(effectiveTs);

          if (snapshot.pairState) {
            setLpBalanceRaw(snapshot.lpBalanceRaw);
            setLpBalance(formatPretty(snapshot.lpBalanceRaw, LP_DECIMALS, 8));
            setLpSharePct(
              formatSharePercent(snapshot.lpBalanceRaw, snapshot.pairState.totalSupply)
            );
            const underlying = underlyingFromLp(
              snapshot.lpBalanceRaw,
              snapshot.pairState.totalSupply,
              snapshot.pairState.reserveWusdc,
              snapshot.pairState.reserveEurc
            );
            setLpPooledUsdcRaw(underlying.wusdc);
            setLpPooledEurcRaw(underlying.eurc);
            setLpPooledUsdc(formatPretty(underlying.wusdc, WUSDC_DECIMALS, 6));
            setLpPooledEurc(formatPretty(underlying.eurc, EURC_DECIMALS, 6));
          } else {
            setLpBalanceRaw(ZERO);
            setLpBalance("0.00");
            setLpSharePct("0");
            setLpPooledUsdcRaw(ZERO);
            setLpPooledEurcRaw(ZERO);
            setLpPooledUsdc("0.00");
            setLpPooledEurc("0.00");
          }

          setStreak(snapshot.gmStreak);
          setLastCheckInTime(snapshot.gmLastCheckIn);
          setGmStreakExpiresAt(snapshot.gmStreakExpiresAt);

          if (snapshot.gmLastCheckIn > 0) {
            setCooldownRemainingSec(Math.max(0, snapshot.gmLastCheckIn + 86_400 - effectiveTs));
            setStreakExpiresInSec(
              snapshot.gmStreak > 0 && snapshot.gmStreakExpiresAt > effectiveTs
                ? snapshot.gmStreakExpiresAt - effectiveTs
                : null
            );
          } else {
            setCooldownRemainingSec(0);
            setStreakExpiresInSec(null);
          }

          if (snapshot.hasDomain && snapshot.boundDomain) {
            const full = `${snapshot.boundDomain}.nex`;
            setRegisteredDomain(full);
            setPassVerified(true);
            try {
              window.localStorage.setItem(walletStorageKey("nexio_domain_name", targetWallet), full);
            } catch {
              // ignore
            }
          } else {
            setRegisteredDomain("");
            setPassVerified(false);
            try {
              window.localStorage.removeItem(walletStorageKey("nexio_domain_name", targetWallet));
            } catch {
              // ignore
            }
          }
        }

        setBalancesReady(true);
      } catch (error) {
        if (isAbortError(error)) return;
        // Transient RPC failures are handled gracefully via multi-RPC quarantine without console.error noise
      } finally {
        if (targetKey === (walletRef.current ? walletRef.current.toLowerCase() : "__anon__")) {
          setBalancesLoading(false);
        }
      }
    },
    []
  );

  // Live Arc Mainnet History Loader (eth_getLogs adaptive pagination)
  const loadOnChainHistory = useCallback(
    async (targetWallet: string, opts?: { toBlock?: number; append?: boolean }) => {
      if (!targetWallet || !ethers.isAddress(targetWallet)) return;
      const gen = ++historyGenRef.current;
      if (opts?.append) {
        setHistoryLoadingMore(true);
      } else {
        setHistoryLoading(true);
      }
      setHistoryError(null);

      try {
        const res = await fetchOnChainHistory(targetWallet, { toBlock: opts?.toBlock });
        if (
          gen !== historyGenRef.current ||
          walletRef.current.toLowerCase() !== targetWallet.toLowerCase()
        ) {
          return;
        }

        setHistoryEntries((prev) => {
          if (!opts?.append) return res.entries;
          const seen = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          for (const item of res.entries) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
            }
          }
          merged.sort((a, b) =>
            b.blockNumber !== a.blockNumber ? b.blockNumber - a.blockNumber : b.logIndex - a.logIndex
          );
          return merged;
        });

        setHistoryNextCursor(res.nextCursorBlock);
        setHistoryScannedRange((prev) => ({
          from: res.scannedFromBlock,
          to: opts?.append && prev ? prev.to : res.scannedToBlock,
          latest: res.latestBlock,
        }));
      } catch (error) {
        if (isAbortError(error)) return;
        if (gen !== historyGenRef.current) return;
        setHistoryError(decodeNexioError(error));
      } finally {
        if (gen === historyGenRef.current) {
          setHistoryLoading(false);
          setHistoryLoadingMore(false);
        }
      }
    },
    []
  );

  // Pure Unskewed Two-Sided 1-EURC Live Market Spot Mark (with strict 45s staleness eviction)
  useEffect(() => {
    let cancelled = false;
    let activeController: AbortController | null = null;

    const refreshSpotRate = async (force = false) => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      try {
        const snapshot = await requestOneUnitSpotSnapshot({
          tokenIn: EURC_ADDRESS,
          tokenOut: WUSDC_ADDRESS,
          decimals: EURC_DECIMALS,
          chainId: ARC_CHAIN_ID,
          force,
          maxAgeMs: SPOT_MAX_STALENESS_MS,
          signal: controller.signal,
        });
        if (cancelled || controller.signal.aborted) return;

        if (snapshot && !snapshot.expired && snapshot.amountOut > ZERO) {
          setEurcSpotOut(snapshot.amountOut);
          setEurcSpotFetchedAt(snapshot.fetchedAt);
        } else {
          setEurcSpotOut((prev) =>
            isSpotRateFresh(eurcSpotFetchedAt, SPOT_MAX_STALENESS_MS) ? prev : null
          );
        }
      } catch (error) {
        if (cancelled || isAbortError(error)) return;
        setEurcSpotFetchedAt((prevAt) => {
          if (!isSpotRateFresh(prevAt, SPOT_MAX_STALENESS_MS)) {
            setEurcSpotOut(null);
            return 0;
          }
          return prevAt;
        });
      }
    };

    void refreshSpotRate();
    const pollId = window.setInterval(() => {
      void refreshSpotRate();
    }, BALANCE_CACHE_MS);

    const stalenessGuardId = window.setInterval(() => {
      setEurcSpotFetchedAt((prevAt) => {
        if (prevAt > 0 && !isSpotRateFresh(prevAt, SPOT_MAX_STALENESS_MS)) {
          setEurcSpotOut(null);
          return 0;
        }
        return prevAt;
      });
    }, 5_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshSpotRate();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      activeController?.abort();
      window.clearInterval(pollId);
      window.clearInterval(stalenessGuardId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [eurcSpotFetchedAt]);

  // Wallet Account & Chain Listener Setup
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ethereum = getEthereum();
    if (!ethereum) return;

    const syncConnected = async () => {
      try {
        const provider = new ethers.BrowserProvider(ethereum);
        const accounts = (await provider.send("eth_accounts", [])) as string[];
        const net = await provider.getNetwork();
        const currentChain = Number(net.chainId);
        setChainId(currentChain);

        if (
          accounts?.length &&
          window.localStorage.getItem("nexio_manual_disconnect") !== "1"
        ) {
          const checksummed = ethers.getAddress(accounts[0]);
          walletRef.current = checksummed;
          setWallet(checksummed);
          hydrateWalletLocalCache(checksummed);
          if (currentChain === ARC_CHAIN_ID) {
            void syncProtocolSnapshot(checksummed);
            void loadOnChainHistory(checksummed);
          }
        } else {
          walletRef.current = "";
          setWallet("");
          void syncProtocolSnapshot(undefined);
        }
      } catch {
        void syncProtocolSnapshot(undefined);
      }
    };

    const handleChainChanged = (nextChainIdHex: unknown) => {
      const parsed =
        typeof nextChainIdHex === "string"
          ? Number.parseInt(nextChainIdHex, 16)
          : Number(nextChainIdHex);
      if (!Number.isFinite(parsed)) return;
      setChainId(parsed);
      if (parsed !== ARC_CHAIN_ID) {
        clearOnChainBalancesOnly();
      } else if (walletRef.current) {
        invalidateSnapshotCache(walletRef.current);
        void syncProtocolSnapshot(walletRef.current, { force: true });
        void loadOnChainHistory(walletRef.current);
      }
    };

    const handleAccountsChanged = (rawAccounts: unknown) => {
      const accounts = Array.isArray(rawAccounts) ? (rawAccounts as string[]) : [];
      if (!accounts.length) {
        walletRef.current = "";
        resetSessionState();
        setWallet("");
        showMessage("Wallet disconnected.");
        void syncProtocolSnapshot(undefined, { force: true });
      } else {
        const nextWallet = ethers.getAddress(accounts[0]);
        walletRef.current = nextWallet;
        resetSessionState({ keepWallet: true });
        setWallet(nextWallet);
        try {
          window.localStorage.removeItem("nexio_manual_disconnect");
        } catch {
          // ignore
        }
        hydrateWalletLocalCache(nextWallet);
        void syncNetwork().then((cid) => {
          if (cid === ARC_CHAIN_ID) {
            void syncProtocolSnapshot(nextWallet, { force: true });
            void loadOnChainHistory(nextWallet);
          }
        });
      }
    };

    void syncConnected();
    ethereum.on?.("chainChanged", handleChainChanged);
    ethereum.on?.("accountsChanged", handleAccountsChanged);

    return () => {
      ethereum.removeListener?.("chainChanged", handleChainChanged);
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, [
    getEthereum,
    hydrateWalletLocalCache,
    syncProtocolSnapshot,
    loadOnChainHistory,
    clearOnChainBalancesOnly,
    resetSessionState,
    syncNetwork,
    showMessage,
  ]);

  // Visibility-Aware Polling & On-Chain Event Listeners (Transfer, NLPClaimed, CheckedIn, DomainRegistered)
  useEffect(() => {
    const controller = new AbortController();

    const triggerRefresh = (force = false) => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (txBusyRef.current && !force) return;
      if (wallet && !isArcMainnet) return;
      void syncProtocolSnapshot(wallet || undefined, { force, signal: controller.signal });
    };

    const immediateId =
      !wallet || isArcMainnet
        ? window.setTimeout(() => {
            triggerRefresh(false);
          }, 0)
        : null;

    const intervalId = window.setInterval(() => {
      triggerRefresh(false);
    }, BALANCE_CACHE_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerRefresh(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    let eventDebounceTimer: number | null = null;
    const cleanups: Array<() => void> = [];

    if (wallet && isArcMainnet && ethers.isAddress(wallet)) {
      try {
        const provider = getArcReadProvider();
        const checksummed = ethers.getAddress(wallet);
        const padded = ethers.zeroPadValue(checksummed, 32);
        const transferTopic = ethers.id("Transfer(address,address,uint256)");
        const nlpClaimedTopic = ethers.id("NLPClaimed(address,uint256,uint256,uint256)");
        const checkedInTopic = ethers.id("CheckedIn(address,uint256,uint256)");
        const domainTopic = ethers.id("DomainRegistered(string,address)");

        const scheduleEventSync = () => {
          if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
          if (eventDebounceTimer !== null) window.clearTimeout(eventDebounceTimer);
          eventDebounceTimer = window.setTimeout(() => {
            if (!walletRef.current) return;
            invalidateSnapshotCache(walletRef.current);
            void syncProtocolSnapshot(walletRef.current, { force: true });
            void loadOnChainHistory(walletRef.current);
          }, 500);
        };

        const trackedTokens = [
          USDC_ERC20_ADDRESS,
          EURC_ADDRESS,
          ...(lpPairAddress && ethers.isAddress(lpPairAddress) ? [lpPairAddress] : []),
        ];

        const outFilter = { address: trackedTokens, topics: [transferTopic, padded] };
        const inFilter = { address: trackedTokens, topics: [transferTopic, null, padded] };
        const nlpFilter = {
          address: [USDC_VAULT_ADDRESS, EURC_VAULT_ADDRESS],
          topics: [nlpClaimedTopic, padded],
        };
        const gmFilter = { address: DAILY_GM_ADDRESS, topics: [checkedInTopic, padded] };
        const ansFilter = { address: ANS_CONTRACT_ADDRESS, topics: [domainTopic, null, padded] };

        for (const filter of [outFilter, inFilter, nlpFilter, gmFilter, ansFilter]) {
          void provider.on(filter, scheduleEventSync);
          cleanups.push(() => {
            void provider.off(filter, scheduleEventSync);
          });
        }
      } catch {
        // Provider filter subscription is opportunistic; 30s Multicall3 poll remains active
      }
    }

    return () => {
      controller.abort();
      if (immediateId !== null) window.clearTimeout(immediateId);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (eventDebounceTimer !== null) window.clearTimeout(eventDebounceTimer);
      for (const fn of cleanups) {
        try {
          fn();
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [wallet, isArcMainnet, lpPairAddress, syncProtocolSnapshot, loadOnChainHistory]);

  // Chain-Clock Driven 1s Ticker (Drives DailyGM 24h Cooldown, 48h Expiry & Real-Time NLP Accrual)
  useEffect(() => {
    const hasActiveTimers =
      lastCheckInTime > 0 || usdcStakedRaw > ZERO || eurcStakedRaw > ZERO;
    if (!hasActiveTimers) return;

    const id = window.setInterval(() => {
      const nowSec = getChainClockNowSec();
      setLiveChainNowSec(nowSec);
      if (lastCheckInTime > 0) {
        setCooldownRemainingSec(Math.max(0, lastCheckInTime + 86_400 - nowSec));
        if (gmStreakExpiresAt > nowSec) {
          setStreakExpiresInSec(gmStreakExpiresAt - nowSec);
        } else {
          setStreakExpiresInSec(null);
          setStreak(0);
        }
      }
    }, 1_000);

    return () => window.clearInterval(id);
  }, [
    lastCheckInTime,
    gmStreakExpiresAt,
    usdcStakedRaw,
    eurcStakedRaw,
    getChainClockNowSec,
  ]);

  const hasCheckedInToday = cooldownRemainingSec > 0;
  const timeLeft = useMemo(
    () => formatCooldownHms(cooldownRemainingSec),
    [cooldownRemainingSec]
  );

  // Nexio Pass On-Chain Verification
  const fetchAndVerifyPass = useCallback(
    async (userWallet?: string) => {
      const target = (userWallet || walletRef.current).trim();
      if (!target || !ethers.isAddress(target)) {
        setPassVerified(false);
        setRegisteredDomain("");
        setIsVerifyingPass(false);
        return;
      }

      const checksummed = ethers.getAddress(target);
      const gen = ++verifyPassGenRef.current;
      const isStale = () =>
        gen !== verifyPassGenRef.current ||
        !walletRef.current ||
        walletRef.current.toLowerCase() !== checksummed.toLowerCase();

      setIsVerifyingPass(true);
      try {
        invalidateAnsCache(checksummed);
        const onChainDomain = await resolveAddressToDomain(checksummed);
        if (isStale()) return;

        if (onChainDomain && onChainDomain.trim().length > 0) {
          const formatted = `${onChainDomain}.nex`;
          setRegisteredDomain(formatted);
          setPassVerified(true);
          try {
            window.localStorage.setItem(
              walletStorageKey("nexio_domain_name", checksummed),
              formatted
            );
          } catch {
            // ignore
          }
          return;
        }

        setRegisteredDomain("");
        setPassVerified(false);
        try {
          window.localStorage.removeItem(walletStorageKey("nexio_domain_name", checksummed));
        } catch {
          // ignore
        }
      } catch (error) {
        if (!isStale() && isRpcTransportError(error)) {
          showMessage("Arc Mainnet RPC is busy. Retry identity verification in a moment.");
        } else if (!isStale()) {
          setPassVerified(false);
          setRegisteredDomain("");
        }
      } finally {
        if (!isStale()) setIsVerifyingPass(false);
      }
    },
    [showMessage]
  );

  // Refresh history automatically when opening the History tab if not loaded yet
  useEffect(() => {
    if (selectedTab !== "history" || !wallet || !isArcMainnet) return;
    if (historyScannedRange === null && !historyLoading) {
      const timer = window.setTimeout(() => {
        void loadOnChainHistory(wallet);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [selectedTab, wallet, isArcMainnet, historyScannedRange, historyLoading, loadOnChainHistory]);

  // Auto-verify Nexio Pass once per connected wallet when opening the Pass tab
  useEffect(() => {
    if (selectedTab !== "trustpass" || !wallet || !isArcMainnet || passVerified || isVerifyingPass) {
      return;
    }
    const lower = wallet.toLowerCase();
    if (autoCheckedPassWalletRef.current === lower) return;
    autoCheckedPassWalletRef.current = lower;
    const timer = window.setTimeout(() => {
      void fetchAndVerifyPass(wallet);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedTab, wallet, isArcMainnet, passVerified, isVerifyingPass, fetchAndVerifyPass]);

  // Debounced Forward & Reverse Recipient Resolution (Single & Batch via Multicall3)
  const rawRecipientList = useMemo(() => {
    const raw = isBatchMode ? sendAddress.split(",") : [sendAddress];
    return raw.map((item) => item.trim()).filter((item) => item.length > 0);
  }, [sendAddress, isBatchMode]);

  useEffect(() => {
    if (rawRecipientList.length === 0) return;

    const gen = ++recipientResolveGenRef.current;
    const timer = window.setTimeout(async () => {
      setIsResolvingRecipient(true);
      try {
        const resolved = await batchResolveRecipients(rawRecipientList);
        if (gen !== recipientResolveGenRef.current) return;
        setResolvedRecipients(resolved);
      } catch (error) {
        if (gen !== recipientResolveGenRef.current) return;
        if (isRpcTransportError(error)) {
          setResolvedRecipients(
            rawRecipientList.map((input) => ({
              input,
              valid: false,
              kind: "invalid",
              address: null,
              domain: null,
              error: "Arc Mainnet RPC unreachable while resolving recipient.",
            }))
          );
        }
      } finally {
        if (gen === recipientResolveGenRef.current) {
          setIsResolvingRecipient(false);
        }
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
    };
  }, [rawRecipientList]);

  // ============================================================================
  // Pure Unskewed Spot Mark, Exact BigInt Net Worth & Exact 10 NLP / $100 / 24h
  // ============================================================================
  const spotFresh =
    eurcSpotOut !== null &&
    eurcSpotOut > ZERO &&
    isSpotRateFresh(eurcSpotFetchedAt, SPOT_MAX_STALENESS_MS);
  const activeEurcSpotOut = spotFresh ? eurcSpotOut : null;
  const eurcUsdRate = useMemo(() => {
    if (!activeEurcSpotOut) return null;
    const n = Number(ethers.formatUnits(activeEurcSpotOut, WUSDC_DECIMALS));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [activeEurcSpotOut]);
  const eurcRateLabel = activeEurcSpotOut
    ? formatPretty(activeEurcSpotOut, WUSDC_DECIMALS, 4)
    : null;

  // Native USDC (18-dec) and ERC-20 USDC at 0x3600...0000 (6-dec) share one balance — count wallet USDC once.
  const usdcWallet6 = poolUsdcFromNative(usdcBalanceRaw);
  const usdcCore6 = usdcWallet6 + usdcStakedRaw;
  const eurcCore6 = eurcBalanceRaw + eurcStakedRaw;
  const usdcPosition6 = usdcCore6 + lpPooledUsdcRaw;
  const eurcPositionRaw = eurcCore6 + lpPooledEurcRaw;

  const netWorth6 =
    activeEurcSpotOut === null && eurcPositionRaw > ZERO
      ? null
      : usdcPosition6 +
        (activeEurcSpotOut === null ? ZERO : (eurcPositionRaw * activeEurcSpotOut) / UNIT_6);
  const netWorthLabel = netWorth6 === null ? null : formatPretty(netWorth6, WUSDC_DECIMALS, 2);

  const usdcWalletUsdLabel = formatPretty(usdcWallet6, WUSDC_DECIMALS, 2);
  const usdcStakedUsdLabel = formatPretty(usdcStakedRaw, WUSDC_DECIMALS, 2);
  const eurcWalletUsdLabel =
    activeEurcSpotOut === null
      ? null
      : formatPretty((eurcBalanceRaw * activeEurcSpotOut) / UNIT_6, WUSDC_DECIMALS, 2);
  const eurcStakedUsdLabel =
    activeEurcSpotOut === null
      ? null
      : formatPretty((eurcStakedRaw * activeEurcSpotOut) / UNIT_6, WUSDC_DECIMALS, 2);
  const lpTotalUsd6 =
    lpPooledEurcRaw > ZERO && activeEurcSpotOut === null
      ? null
      : lpPooledUsdcRaw +
        (activeEurcSpotOut === null ? ZERO : (lpPooledEurcRaw * activeEurcSpotOut) / UNIT_6);
  const lpTotalUsdLabel =
    lpTotalUsd6 === null ? null : formatPretty(lpTotalUsd6, WUSDC_DECIMALS, 2);

  // Real-Time Exact On-Chain NLP Accrual ($100 USD Staked = 10.00 NLP per 24h / 86,400s)
  const liveNlpDeltaSec =
    snapshotChainTs > 0 && liveChainNowSec > snapshotChainTs
      ? BigInt(liveChainNowSec - snapshotChainTs)
      : ZERO;
  const liveUsdcPendingNlp18 =
    snapshotUsdcPendingNlp18 +
    (usdcStakedRaw > ZERO
      ? (usdcStakedRaw * NLP_SCALE_12 * liveNlpDeltaSec) / NLP_DIVISOR
      : ZERO);
  const liveEurcPendingNlp18 =
    snapshotEurcPendingNlp18 +
    (eurcStakedRaw > ZERO
      ? (eurcStakedRaw * NLP_SCALE_12 * liveNlpDeltaSec) / NLP_DIVISOR
      : ZERO);

  const unclaimedNlp18 = useMemo(
    () =>
      computeUsdScaledVaultNlp18({
        usdcNlp18: liveUsdcPendingNlp18,
        eurcNlp18: liveEurcPendingNlp18,
        eurcSpotOut6: activeEurcSpotOut,
      }),
    [liveUsdcPendingNlp18, liveEurcPendingNlp18, activeEurcSpotOut]
  );
  const claimedNlp18 = useMemo(
    () =>
      computeUsdScaledVaultNlp18({
        usdcNlp18: snapshotUsdcClaimedNlp18,
        eurcNlp18: snapshotEurcClaimedNlp18,
        eurcSpotOut6: activeEurcSpotOut,
      }),
    [snapshotUsdcClaimedNlp18, snapshotEurcClaimedNlp18, activeEurcSpotOut]
  );
  const lifetimeNlp18 = unclaimedNlp18 + claimedNlp18;

  const hasClaimableOnChainNlp =
    liveUsdcPendingNlp18 > ZERO || liveEurcPendingNlp18 > ZERO;
  const lifetimePtsLabel = formatPretty(lifetimeNlp18, NLP_DECIMALS, 2);
  const claimedPtsLabel = formatPretty(claimedNlp18, NLP_DECIMALS, 2);
  const unclaimedPtsLabel = formatPretty(unclaimedNlp18, NLP_DECIMALS, 4);
  const lifetimePtsTelemetryLabel = formatPretty(lifetimeNlp18, NLP_DECIMALS, 6);

  // LP Pool Skew Protection (applies to both existing reserves and initial empty-pool seeding)
  const poolEurcUsd = poolPriceUsdPerEurc(poolReserveUsdcRaw, poolReserveEurcRaw);
  const poolSkewBps =
    poolEurcUsd !== null && eurcUsdRate !== null
      ? priceDivergenceBps(poolEurcUsd, eurcUsdRate)
      : null;
  const poolSkewed = poolSkewBps !== null && poolSkewBps > POOL_SKEW_LIMIT_BPS;

  const lpParsedUsdc = parseAmount(lpUsdcInput, WUSDC_DECIMALS);
  const lpParsedEurc = parseAmount(lpEurcInput, EURC_DECIMALS);
  const emptyPoolOpeningUsd =
    poolEurcUsd === null && lpParsedUsdc && lpParsedEurc
      ? poolPriceUsdPerEurc(lpParsedUsdc, lpParsedEurc)
      : null;
  const emptyPoolOpeningSkewBps =
    emptyPoolOpeningUsd !== null && eurcUsdRate !== null
      ? priceDivergenceBps(emptyPoolOpeningUsd, eurcUsdRate)
      : null;
  const emptyPoolSkewBlocked =
    poolEurcUsd === null &&
    Boolean(lpParsedUsdc && lpParsedEurc) &&
    (eurcUsdRate === null ||
      (emptyPoolOpeningSkewBps !== null && emptyPoolOpeningSkewBps > POOL_SKEW_LIMIT_BPS));

  const addBlockedBySkew =
    (poolEurcUsd !== null && (eurcUsdRate === null || poolSkewed)) || emptyPoolSkewBlocked;

  // ============================================================================
  // Network & Wallet Connection Actions
  // ============================================================================
  const switchToArcMainnet = useCallback(async (): Promise<boolean> => {
    const ethereum = getEthereum();
    if (!ethereum) return false;

    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ARC_CHAIN_ID_HEX }],
      });
      await syncNetwork();
      return true;
    } catch {
      try {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: ARC_CHAIN_ID_HEX,
              chainName: ARC_NETWORK_LABEL,
              rpcUrls: [ARC_RPC_URL],
              blockExplorerUrls: [ARC_EXPLORER],
              nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
            },
          ],
        });
        await syncNetwork();
        return true;
      } catch {
        return false;
      }
    }
  }, [getEthereum, syncNetwork]);

  const connectWallet = useCallback(async () => {
    if (isConnecting) return;
    const ethereum = getEthereum();
    if (!ethereum) {
      showMessage("Install Rabby or MetaMask to connect to Arc Mainnet.");
      return;
    }

    setIsConnecting(true);
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
      if (!accounts?.length) return;

      const checksummed = ethers.getAddress(accounts[0]);
      try {
        window.localStorage.removeItem("nexio_manual_disconnect");
      } catch {
        // ignore
      }

      walletRef.current = checksummed;
      setWallet(checksummed);
      hydrateWalletLocalCache(checksummed);

      let activeChain = await syncNetwork();
      if (activeChain !== ARC_CHAIN_ID) {
        showMessage(`Switching wallet to ${ARC_NETWORK_LABEL}...`);
        const switched = await switchToArcMainnet();
        if (switched) {
          activeChain = ARC_CHAIN_ID;
          showMessage("Wallet connected on Arc Mainnet.");
        } else {
          showMessage(`Switch to ${ARC_NETWORK_LABEL} (5042) in your wallet.`);
        }
      } else {
        showMessage("Wallet connected on Arc Mainnet.");
      }

      if (activeChain === ARC_CHAIN_ID) {
        void syncProtocolSnapshot(checksummed, { force: true });
        void loadOnChainHistory(checksummed);
      }
    } catch (error) {
      showMessage(
        isUserWalletRejection(error)
          ? "Wallet connection request was declined."
          : "Could not connect wallet. Check your browser extension."
      );
    } finally {
      setIsConnecting(false);
    }
  }, [
    isConnecting,
    getEthereum,
    hydrateWalletLocalCache,
    syncNetwork,
    switchToArcMainnet,
    syncProtocolSnapshot,
    loadOnChainHistory,
    showMessage,
  ]);

  const disconnectWallet = useCallback(() => {
    try {
      window.localStorage.setItem("nexio_manual_disconnect", "1");
    } catch {
      // ignore
    }
    walletRef.current = "";
    resetSessionState();
    setWallet("");
    showMessage("Wallet disconnected.");
    void syncProtocolSnapshot(undefined, { force: true });
  }, [resetSessionState, showMessage, syncProtocolSnapshot]);

  // ============================================================================
  // Module 1: Dashboard — Send, Request, Receive & Batch Execution
  // ============================================================================
  const sendDecimals =
    sendAsset === "USDC" ? (isBatchMode ? WUSDC_DECIMALS : NATIVE_USDC_DECIMALS) : EURC_DECIMALS;

  const recipientCountForGas = Math.max(1, isBatchMode ? rawRecipientList.length : 1);
  const scaledSendGasBuffer = NATIVE_GAS_BUFFER * BigInt(recipientCountForGas);

  const handleOpenSendModal = useCallback(
    async (prefillRecipient?: string) => {
      if (!wallet) {
        showMessage("Connect wallet first.");
        return;
      }
      if (!isArcMainnet) {
        showMessage(`Switching to ${ARC_NETWORK_LABEL}...`);
        const switched = await switchToArcMainnet();
        if (!switched) {
          showMessage(`Switch to ${ARC_NETWORK_LABEL} (5042) manually.`);
          return;
        }
      }
      setIsScanning(false);
      if (prefillRecipient !== undefined) {
        setIsBatchMode(false);
        setSendAddress(prefillRecipient);
        setResolvedRecipients([]);
        setBatchRecipientStatuses([]);
        setFailedBatchTargets([]);
        setBatchExecutionMode("idle");
      }
      setShowSendModal(true);
    },
    [wallet, isArcMainnet, switchToArcMainnet, showMessage]
  );

  const handleOpenRequestModal = () => {
    if (!wallet) {
      showMessage("Connect wallet first.");
      return;
    }
    setPaymentLink("");
    setRequestAmount("");
    setShowRequestModal(true);
  };

  const generatePaymentLink = () => {
    const decimals = requestAsset === "EURC" ? EURC_DECIMALS : NATIVE_USDC_DECIMALS;
    const check = parseStrictAmount(requestAmount, decimals);
    if (!check.ok || check.value <= ZERO) {
      showMessage(check.ok ? "Enter an amount greater than zero." : check.error);
      return;
    }

    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const qs = new URLSearchParams({
      to: wallet,
      amount: requestAmount.trim(),
      token: requestAsset,
    });
    setPaymentLink(`${baseUrl}?${qs.toString()}`);
    showMessage("Payment request link generated.");
  };

  const applyScannedRecipient = (raw: string) => {
    const text = raw.trim();
    if (!text) return;

    let recipient = text;
    if (text.toLowerCase().startsWith("ethereum:")) {
      recipient = text.slice(9).split(/[?@/]/)[0];
    } else {
      try {
        const url = new URL(text);
        const to = url.searchParams.get("to");
        if (to) recipient = to;
      } catch {
        // plain address or .nex domain
      }
    }

    recipient = recipient.trim();
    if (!recipient) return;

    if (isBatchMode && sendAddress.trim()) {
      const parts = sendAddress
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      const exists = parts.some((part) => part.toLowerCase() === recipient.toLowerCase());
      if (!exists) setSendAddress(`${parts.join(", ")}, ${recipient}`);
    } else {
      setSendAddress(recipient);
    }
    setIsScanning(false);
  };

  const fillSendMax = () => {
    const count = BigInt(recipientCountForGas);
    if (sendAsset === "USDC") {
      if (isBatchMode) {
        const spendable6 = maxPoolUsdcSpend(usdcBalanceRaw, scaledSendGasBuffer);
        const each6 = spendable6 / count;
        if (each6 <= ZERO) {
          showMessage("Insufficient USDC remaining after reserving Arc gas.");
          return;
        }
        setSendAmount(formatExact(each6, WUSDC_DECIMALS));
      } else {
        const spendable18 = maxNativeSpend(usdcBalanceRaw, NATIVE_GAS_BUFFER);
        if (spendable18 <= ZERO) {
          showMessage("Insufficient USDC remaining after the 0.005 gas buffer.");
          return;
        }
        setSendAmount(formatExact(spendable18, NATIVE_USDC_DECIMALS));
      }
      return;
    }

    if (usdcBalanceRaw <= ZERO) {
      showMessage("Insufficient native USDC to pay Arc Mainnet gas.");
      return;
    }
    const eachEurc = eurcBalanceRaw / count;
    if (eachEurc <= ZERO) {
      showMessage("Insufficient EURC balance.");
      return;
    }
    setSendAmount(formatExact(eachEurc, EURC_DECIMALS));
  };

  const handleSendClick = async () => {
    if (!wallet) {
      showMessage("Connect wallet first.");
      return;
    }
    if (isSending) return;
    if (rawRecipientList.length === 0) {
      showMessage("Enter at least one recipient address or .nex domain.");
      return;
    }

    const batchCap = batchLimitForStreak(streak);
    if (isBatchMode && batchCap !== null && rawRecipientList.length > batchCap) {
      showMessage(`${gmProfile.name} allows up to ${batchCap} batch recipients.`);
      return;
    }

    const strictAmt = parseStrictAmount(sendAmount, sendDecimals);
    if (!strictAmt.ok || strictAmt.value <= ZERO) {
      showMessage(strictAmt.ok ? "Enter an amount greater than zero." : strictAmt.error);
      return;
    }

    const countBig = BigInt(rawRecipientList.length);
    if (sendAsset === "USDC") {
      const maxAllowed = isBatchMode
        ? maxPoolUsdcSpend(usdcBalanceRaw, scaledSendGasBuffer)
        : maxNativeSpend(usdcBalanceRaw, NATIVE_GAS_BUFFER);
      if (strictAmt.value * countBig > maxAllowed) {
        showMessage(
          isBatchMode
            ? `Insufficient USDC for ${rawRecipientList.length} recipients (including gas buffer).`
            : "Insufficient USDC balance after the 0.005 gas buffer."
        );
        return;
      }
    } else {
      if (usdcBalanceRaw <= ZERO) {
        showMessage("Insufficient native USDC to cover Arc Mainnet gas.");
        return;
      }
      if (strictAmt.value * countBig > eurcBalanceRaw) {
        showMessage(
          isBatchMode
            ? `Insufficient EURC for ${rawRecipientList.length} recipients.`
            : "Insufficient EURC balance."
        );
        return;
      }
    }

    setIsResolvingRecipient(true);
    try {
      const checked = await batchResolveRecipients(rawRecipientList);
      setResolvedRecipients(checked);

      const firstInvalid = checked.findIndex((r) => !r.valid || !r.address);
      if (firstInvalid !== -1) {
        const bad = checked[firstInvalid];
        showMessage(
          isBatchMode
            ? `Recipient #${firstInvalid + 1} (${bad.input}): ${bad.error ?? "Invalid recipient."}`
            : bad.error ?? "Invalid recipient."
        );
        return;
      }

      const seenAddrs = new Map<string, string>();
      for (const item of checked) {
        const lower = (item.address || "").toLowerCase();
        const prevInput = seenAddrs.get(lower);
        if (prevInput) {
          showMessage(
            `Duplicate recipient detected: "${item.input}" resolves to the same wallet as "${prevInput}".`
          );
          return;
        }
        seenAddrs.set(lower, item.input);
      }

      setShowConfirmModal(true);
    } catch (error) {
      showMessage(decodeNexioError(error));
    } finally {
      setIsResolvingRecipient(false);
    }
  };

  const executeSend = async (overrideTargets?: string[]) => {
    if (isSending || sendLockRef.current) return;
    const targetsToProcess = overrideTargets ?? rawRecipientList;
    if (targetsToProcess.length === 0) return;

    const batchCap = batchLimitForStreak(streak);
    if (isBatchMode && batchCap !== null && targetsToProcess.length > batchCap) {
      showMessage(`${gmProfile.name} allows up to ${batchCap} batch recipients.`);
      return;
    }

    const strictAmt = parseStrictAmount(sendAmount, sendDecimals);
    if (!strictAmt.ok || strictAmt.value <= ZERO) {
      showMessage(strictAmt.ok ? "Enter an amount greater than zero." : strictAmt.error);
      return;
    }

    sendLockRef.current = true;
    setIsSending(true);
    setFailedBatchTargets([]);

    if (!isArcMainnet) {
      showMessage(`Switching to ${ARC_NETWORK_LABEL}...`);
      const switched = await switchToArcMainnet();
      if (!switched) {
        sendLockRef.current = false;
        setIsSending(false);
        showMessage(`Switch to ${ARC_NETWORK_LABEL} (5042) manually.`);
        return;
      }
    }

    setShowConfirmModal(false);
    setReceiptDrawerDismissed(false);

    const opId = `send-${Date.now()}`;

    try {
      const ethereum = getEthereum();
      if (!ethereum) throw new Error("Wallet provider not found.");
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const sender = ethers.getAddress(await signer.getAddress());

      const resolved = await batchResolveRecipients(targetsToProcess);
      const invalidIdx = resolved.findIndex((r) => !r.valid || !r.address);
      if (invalidIdx !== -1) {
        showMessage(
          resolved[invalidIdx].error ?? `Invalid recipient: ${targetsToProcess[invalidIdx]}`
        );
        return;
      }

      const seen = new Set<string>();
      for (const r of resolved) {
        const addrLower = (r.address || "").toLowerCase();
        if (seen.has(addrLower)) {
          showMessage(`Duplicate recipient address detected (${r.input}).`);
          return;
        }
        seen.add(addrLower);
      }

      const totalAmountRaw = strictAmt.value * BigInt(resolved.length);
      const totalSummary = `${formatPretty(totalAmountRaw, sendDecimals, 6)} ${sendAsset}`;
      const cleanMemo = sendMemo.trim();

      // Single-Recipient Execution
      if (!isBatchMode && resolved.length === 1) {
        const target = resolved[0];
        const recipientAddr = target.address!;
        const stepId = "send-single";

        const updateSingleLifecycle = (
          status: TxStepStatus,
          extra?: Partial<TxLifecycleState>,
          txHash?: string
        ) => {
          setTxLifecycle({
            id: opId,
            operationTitle: `Send ${sendAsset}`,
            amountSummary: `${totalSummary} → ${
              target.domain ?? `${recipientAddr.slice(0, 6)}...${recipientAddr.slice(-4)}`
            }`,
            steps: [
              {
                id: stepId,
                title: `Transfer ${sendAsset}`,
                subtitle: target.domain
                  ? `${target.domain} (${recipientAddr.slice(0, 6)}...${recipientAddr.slice(-4)})`
                  : recipientAddr,
                txHash,
                status,
              },
            ],
            explorerUrl: ARC_EXPLORER,
            chainId: ARC_CHAIN_ID,
            ...extra,
          });
        };

        updateSingleLifecycle("simulating");

        let txReq: { to: string; data: string; value: bigint };
        if (sendAsset === "USDC") {
          let safeData = "0x";
          if (cleanMemo) {
            const targetCode = await provider.getCode(recipientAddr).catch(() => "0x");
            if (!targetCode || targetCode === "0x") {
              safeData = ethers.hexlify(ethers.toUtf8Bytes(cleanMemo));
            }
          }
          txReq = { to: recipientAddr, value: strictAmt.value, data: safeData };
        } else {
          const erc20Iface = new ethers.Interface(ERC20_ABI);
          const transferData = erc20Iface.encodeFunctionData("transfer", [
            recipientAddr,
            strictAmt.value,
          ]);
          txReq = { to: EURC_ADDRESS, value: ZERO, data: transferData };
        }

        const { hash, receipt } = await prepareAndSendTx(signer, txReq, {
          label: `${sendAsset} recipient`,
          onStage: (stage) => updateSingleLifecycle(mapStageToStepStatus(stage)),
          onHash: (h) => updateSingleLifecycle("confirming_block", { txHash: h }, h),
        });

        if (cleanMemo) {
          rememberSessionMemo(wallet, hash, cleanMemo);
        }

        updateSingleLifecycle(
          "completed",
          {
            confirmed: true,
            txHash: hash,
            blockNumber: receipt?.blockNumber ?? null,
          },
          hash
        );

        showMessage(`${sendAsset} transfer finalized on Arc Mainnet.`);
        setShowSendModal(false);
        setSendAddress("");
        setSendAmount("");
        setSendMemo("");
        setResolvedRecipients([]);
        invalidateSnapshotCache(wallet);
        void syncProtocolSnapshot(wallet, { force: true });
        void loadOnChainHistory(wallet);
        return;
      }

      // Multi-Recipient Batch Mode: EIP-5792 wallet_sendCalls -> Sequential prepareAndSendTx fallback
      const tokenTarget = sendAsset === "USDC" ? USDC_ERC20_ADDRESS : EURC_ADDRESS;
      const erc20Iface = new ethers.Interface(ERC20_ABI);
      const preparedCalls = resolved.map((r) => ({
        recipient: r,
        to: tokenTarget,
        data: erc20Iface.encodeFunctionData("transfer", [r.address!, strictAmt.value]),
      }));

      const initialStatuses: BatchRecipientStatus[] = resolved.map((r) => ({
        target: r.input,
        resolved: r.address!,
        status: "pending",
      }));
      setBatchRecipientStatuses(initialStatuses);

      let handledViaWalletBatch = false;
      try {
        setBatchExecutionMode("wallet_batch");
        setTxLifecycle({
          id: opId,
          operationTitle: `Batch Send ${sendAsset}`,
          amountSummary: `${totalSummary} across ${resolved.length} recipients`,
          steps: [
            {
              id: "batch-5792",
              title: `Sign Atomic Batch (${resolved.length} transfers)`,
              subtitle: "EIP-5792 wallet_sendCalls",
              status: "awaiting_wallet",
            },
          ],
          explorerUrl: ARC_EXPLORER,
          chainId: ARC_CHAIN_ID,
        });

        await provider.call({
          from: sender,
          to: preparedCalls[0].to,
          data: preparedCalls[0].data,
          value: ZERO,
        });

        const rawBundleRes = await ethereum.request({
          method: "wallet_sendCalls",
          params: [
            {
              version: "2.0.0",
              chainId: ARC_CHAIN_ID_HEX,
              from: sender,
              atomicRequired: false,
              calls: preparedCalls.map((c) => ({
                to: c.to,
                data: c.data,
                value: "0x0",
              })),
            },
          ],
        });

        const bundleId =
          typeof rawBundleRes === "string"
            ? rawBundleRes
            : typeof (rawBundleRes as { id?: unknown })?.id === "string"
              ? (rawBundleRes as { id: string }).id
              : "";

        if (!bundleId) {
          throw new Error("Unsupported wallet_sendCalls response.");
        }

        handledViaWalletBatch = true;
        setBatchRecipientStatuses((prev) =>
          prev.map((item) => ({ ...item, status: "confirming" }))
        );
        setTxLifecycle({
          id: opId,
          operationTitle: `Batch Send ${sendAsset}`,
          amountSummary: `${totalSummary} across ${resolved.length} recipients`,
          steps: [
            {
              id: "batch-5792",
              title: `Confirming Batch (${resolved.length} transfers)`,
              subtitle: "Waiting for Arc Mainnet block inclusion",
              status: "confirming_block",
            },
          ],
          explorerUrl: ARC_EXPLORER,
          chainId: ARC_CHAIN_ID,
        });

        let batchHash = "";
        let batchBlock: number | null = null;
        for (let poll = 0; poll < 90; poll++) {
          await sleepMs(1000);
          const statusRes = (await ethereum.request({
            method: "wallet_getCallsStatus",
            params: [bundleId],
          })) as {
            status?: number | string;
            receipts?: Array<{
              transactionHash?: string;
              blockNumber?: string | number;
              status?: string | number;
            }>;
          };

          const st = statusRes?.status;
          const isDone = st === 200 || st === "CONFIRMED";
          const isFailed =
            (typeof st === "number" && st >= 400) || st === "FAILED" || st === "REVERTED";

          if (isFailed) {
            throw new Error("Wallet batch bundle reverted on Arc Mainnet.");
          }
          if (isDone) {
            const firstReceipt = statusRes.receipts?.[0];
            batchHash = firstReceipt?.transactionHash ?? "";
            const rawBn = firstReceipt?.blockNumber;
            batchBlock =
              typeof rawBn === "string"
                ? Number.parseInt(rawBn, rawBn.startsWith("0x") ? 16 : 10)
                : typeof rawBn === "number"
                  ? rawBn
                  : null;
            if (cleanMemo && statusRes.receipts) {
              for (const rc of statusRes.receipts) {
                if (rc.transactionHash) {
                  rememberSessionMemo(wallet, rc.transactionHash, cleanMemo);
                }
              }
            }
            break;
          }
        }

        setBatchRecipientStatuses((prev) =>
          prev.map((item) => ({ ...item, status: "confirmed" }))
        );
        setTxLifecycle({
          id: opId,
          operationTitle: `Batch Send ${sendAsset}`,
          amountSummary: `${totalSummary} across ${resolved.length} recipients`,
          steps: [
            {
              id: "batch-5792",
              title: `Batch Confirmed (${resolved.length}/${resolved.length})`,
              txHash: batchHash || undefined,
              status: "completed",
            },
          ],
          confirmed: true,
          txHash: batchHash || undefined,
          blockNumber: batchBlock,
          explorerUrl: ARC_EXPLORER,
          chainId: ARC_CHAIN_ID,
        });

        showMessage(`Batch complete: ${resolved.length}/${resolved.length} transfers confirmed.`);
        setShowSendModal(false);
        setSendAddress("");
        setSendAmount("");
        setSendMemo("");
        setIsBatchMode(false);
        setBatchExecutionMode("idle");
        setBatchRecipientStatuses([]);
        invalidateSnapshotCache(wallet);
        void syncProtocolSnapshot(wallet, { force: true });
        void loadOnChainHistory(wallet);
        return;
      } catch (batchErr) {
        if (isUserWalletRejection(batchErr)) {
          setBatchExecutionMode("idle");
          setBatchRecipientStatuses([]);
          setTxLifecycle(null);
          showMessage("Batch transaction declined in wallet.");
          return;
        }
        if (handledViaWalletBatch || !isUnsupportedBatchCallsError(batchErr)) {
          if (handledViaWalletBatch) {
            const errMsg = decodeNexioError(batchErr);
            setBatchRecipientStatuses((prev) =>
              prev.map((item) => ({ ...item, status: "failed" }))
            );
            setFailedBatchTargets(resolved.map((r) => r.input));
            setTxLifecycle((prev) =>
              prev ? { ...prev, failed: true, errorMessage: errMsg } : null
            );
            showMessage(errMsg);
            return;
          }
        }
      }

      // Sequential Fallback Execution with Live Per-Recipient Status & Partial Recovery
      setBatchExecutionMode("sequential");
      const seqSteps: TxStepItem[] = preparedCalls.map((c, idx) => ({
        id: `seq-${idx}`,
        title: `Recipient ${idx + 1}/${preparedCalls.length}: ${
          c.recipient.domain ?? `${c.recipient.address!.slice(0, 6)}...${c.recipient.address!.slice(-4)}`
        }`,
        subtitle: `${formatPretty(strictAmt.value, sendDecimals, 6)} ${sendAsset}`,
        status: "upcoming",
      }));

      const syncSeqLifecycle = (extra?: Partial<TxLifecycleState>) => {
        setTxLifecycle({
          id: opId,
          operationTitle: `Batch Send ${sendAsset}`,
          amountSummary: `${totalSummary} (${preparedCalls.length} sequential transfers)`,
          steps: [...seqSteps],
          explorerUrl: ARC_EXPLORER,
          chainId: ARC_CHAIN_ID,
          ...extra,
        });
      };

      syncSeqLifecycle();

      let confirmedCount = 0;
      let lastConfirmedHash = "";
      let lastConfirmedBlock: number | null = null;
      const unconfirmedInputs: string[] = [];

      for (let i = 0; i < preparedCalls.length; i++) {
        const call = preparedCalls[i];
        setBatchRecipientStatuses((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, status: "signing" } : item))
        );

        try {
          const { hash, receipt } = await prepareAndSendTx(
            signer,
            { to: call.to, data: call.data, value: ZERO },
            {
              label: `Recipient #${i + 1}`,
              onStage: (stage) => {
                seqSteps[i] = { ...seqSteps[i], status: mapStageToStepStatus(stage) };
                if (stage === "confirming_block") {
                  setBatchRecipientStatuses((prev) =>
                    prev.map((item, idx) =>
                      idx === i ? { ...item, status: "confirming" } : item
                    )
                  );
                }
                syncSeqLifecycle();
              },
              onHash: (h) => {
                seqSteps[i] = { ...seqSteps[i], txHash: h, status: "confirming_block" };
                syncSeqLifecycle({ txHash: h });
              },
            }
          );

          if (cleanMemo) {
            rememberSessionMemo(wallet, hash, cleanMemo);
          }

          confirmedCount++;
          lastConfirmedHash = hash;
          lastConfirmedBlock = receipt?.blockNumber ?? lastConfirmedBlock;
          seqSteps[i] = { ...seqSteps[i], txHash: hash, status: "completed" };
          setBatchRecipientStatuses((prev) =>
            prev.map((item, idx) => (idx === i ? { ...item, status: "confirmed" } : item))
          );
          syncSeqLifecycle({ txHash: hash, blockNumber: lastConfirmedBlock });
        } catch (stepErr) {
          if (isUserWalletRejection(stepErr)) {
            for (let rem = i; rem < preparedCalls.length; rem++) {
              unconfirmedInputs.push(preparedCalls[rem].recipient.input);
            }
            seqSteps[i] = {
              ...seqSteps[i],
              status: "failed",
              subtitle: "Declined in wallet — remaining paused",
            };
            setBatchRecipientStatuses((prev) =>
              prev.map((item, idx) => (idx === i ? { ...item, status: "failed" } : item))
            );
            syncSeqLifecycle({
              failed: confirmedCount === 0,
              confirmed: confirmedCount > 0,
              errorMessage:
                confirmedCount > 0
                  ? `${confirmedCount}/${preparedCalls.length} confirmed. Remaining ${unconfirmedInputs.length} paused for retry.`
                  : "Transaction rejected in wallet.",
            });
            break;
          } else {
            unconfirmedInputs.push(call.recipient.input);
            seqSteps[i] = {
              ...seqSteps[i],
              status: "failed",
              subtitle: decodeNexioError(stepErr),
            };
            setBatchRecipientStatuses((prev) =>
              prev.map((item, idx) => (idx === i ? { ...item, status: "failed" } : item))
            );
            syncSeqLifecycle();
          }
        }
      }

      if (confirmedCount > 0) {
        invalidateSnapshotCache(wallet);
        void syncProtocolSnapshot(wallet, { force: true });
        void loadOnChainHistory(wallet);
      }

      if (unconfirmedInputs.length === 0 && confirmedCount === preparedCalls.length) {
        syncSeqLifecycle({
          confirmed: true,
          txHash: lastConfirmedHash || undefined,
          blockNumber: lastConfirmedBlock,
        });
        showMessage(`Batch complete: ${confirmedCount}/${preparedCalls.length} confirmed.`);
        setShowSendModal(false);
        setSendAddress("");
        setSendAmount("");
        setSendMemo("");
        setIsBatchMode(false);
        setBatchExecutionMode("idle");
        setBatchRecipientStatuses([]);
      } else if (unconfirmedInputs.length > 0) {
        setFailedBatchTargets(unconfirmedInputs);
        setSendAddress(unconfirmedInputs.join(", "));
        showMessage(
          confirmedCount > 0
            ? `${confirmedCount}/${preparedCalls.length} sent. ${unconfirmedInputs.length} remaining ready to retry.`
            : "Batch transfer halted. Review recipient status below."
        );
      }
    } catch (error) {
      if (isUserWalletRejection(error)) {
        setTxLifecycle(null);
        showMessage("Transaction rejected in wallet.");
      } else {
        const msg = decodeNexioError(error);
        setTxLifecycle((prev) =>
          prev ? { ...prev, failed: true, errorMessage: msg } : null
        );
        showMessage(msg);
      }
    } finally {
      sendLockRef.current = false;
      setIsSending(false);
    }
  };

  // ============================================================================
  // Module 2: Vault Stake / Withdraw & Real On-Chain claimNLP()
  // ============================================================================
  const usdcSpendable = maxPoolUsdcSpend(usdcBalanceRaw);
  const vaultParsedStrict = useMemo(
    () => parseStrictAmount(vaultInput, 6),
    [vaultInput]
  );
  const vaultAmountRaw = vaultParsedStrict.ok ? vaultParsedStrict.value : null;
  const vaultMaxAvailableRaw =
    vaultMode === "stake"
      ? vaultAsset === "USDC"
        ? usdcSpendable
        : eurcBalanceRaw
      : vaultAsset === "USDC"
        ? usdcStakedRaw
        : eurcStakedRaw;
  const vaultExceedsLimit =
    vaultAmountRaw !== null && vaultAmountRaw > vaultMaxAvailableRaw;
  const vaultMissingGas = vaultAsset === "EURC" && usdcBalanceRaw <= ZERO;

  const fillVaultMax = () => {
    if (vaultMode === "stake") {
      if (vaultAsset === "USDC") {
        if (usdcSpendable <= ZERO) {
          showMessage("Insufficient USDC remaining after the 0.005 gas buffer.");
          return;
        }
        setVaultInput(formatExact(usdcSpendable, WUSDC_DECIMALS));
      } else {
        if (eurcBalanceRaw <= ZERO) {
          showMessage("No EURC available in wallet to stake.");
          return;
        }
        setVaultInput(formatExact(eurcBalanceRaw, EURC_DECIMALS));
      }
    } else {
      const staked = vaultAsset === "USDC" ? usdcStakedRaw : eurcStakedRaw;
      if (staked <= ZERO) {
        showMessage(`No staked ${vaultAsset} available to withdraw.`);
        return;
      }
      setVaultInput(formatExact(staked, 6));
    }
  };

  const handleVaultAction = async (action: "stake" | "withdraw") => {
    if (!wallet) {
      showMessage("Connect wallet first.");
      return;
    }
    const parsed = parseStrictAmount(vaultInput, 6);
    if (!parsed.ok || parsed.value <= ZERO) {
      showMessage(parsed.ok ? "Enter an amount greater than zero." : parsed.error);
      return;
    }

    const amountWei = parsed.value;
    if (action === "stake") {
      if (vaultAsset === "USDC" && amountWei > usdcSpendable) {
        showMessage("Insufficient USDC balance after the 0.005 gas buffer.");
        return;
      }
      if (vaultAsset === "EURC") {
        if (amountWei > eurcBalanceRaw) {
          showMessage("Insufficient EURC balance.");
          return;
        }
        if (usdcBalanceRaw <= ZERO) {
          showMessage("Insufficient native USDC to pay Arc Mainnet gas.");
          return;
        }
      }
    } else {
      const staked = vaultAsset === "USDC" ? usdcStakedRaw : eurcStakedRaw;
      if (amountWei > staked) {
        showMessage(`Withdrawal exceeds your staked ${vaultAsset} balance.`);
        return;
      }
      if (usdcBalanceRaw <= ZERO) {
        showMessage("Insufficient native USDC to pay Arc Mainnet gas.");
        return;
      }
    }

    if (!isArcMainnet) {
      showMessage(`Switching to ${ARC_NETWORK_LABEL}...`);
      const switched = await switchToArcMainnet();
      if (!switched) {
        showMessage(`Switch to ${ARC_NETWORK_LABEL} (5042) manually.`);
        return;
      }
    }

    setIsVaultLoading(true);
    setVaultAction(action);
    setReceiptDrawerDismissed(false);
    const opId = `vault-${action}-${Date.now()}`;

    try {
      const ethereum = getEthereum();
      if (!ethereum) throw new Error("Wallet provider not found.");
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const owner = ethers.getAddress(await signer.getAddress());

      const isUsdc = vaultAsset === "USDC";
      const tokenAddr = isUsdc ? WUSDC_ADDRESS : EURC_ADDRESS;
      const vaultAddr = isUsdc ? USDC_VAULT_ADDRESS : EURC_VAULT_ADDRESS;
      const vaultAbi = isUsdc ? USDC_VAULT_ABI : EURC_VAULT_ABI;
      const vaultIface = new ethers.Interface(vaultAbi);
      const amountSummary = `${formatPretty(amountWei, 6, 6)} ${vaultAsset}`;

      if (action === "stake") {
        const readToken = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
        const currentAllowance = (await readToken.allowance(owner, vaultAddr)) as bigint;
        const needsApprove = currentAllowance < amountWei;

        const steps: TxStepItem[] = [
          ...(needsApprove
            ? [
                {
                  id: "vault-approve",
                  title: `Approve ${vaultAsset} for Vault`,
                  spender: vaultAddr,
                  status: "upcoming" as TxStepStatus,
                },
              ]
            : []),
          {
            id: "vault-deposit",
            title: `Stake ${vaultAsset} in Vault`,
            subtitle: amountSummary,
            status: "upcoming" as TxStepStatus,
          },
        ];

        const syncState = (extra?: Partial<TxLifecycleState>) => {
          setTxLifecycle({
            id: opId,
            operationTitle: `Stake ${vaultAsset}`,
            amountSummary,
            steps: [...steps],
            explorerUrl: ARC_EXPLORER,
            chainId: ARC_CHAIN_ID,
            ...extra,
          });
        };

        syncState();

        if (needsApprove) {
          await ensureExactAllowance({
            signer,
            tokenAddress: tokenAddr,
            spender: vaultAddr,
            requiredAmount: amountWei,
            owner,
            onStage: (st) => {
              steps[0] = { ...steps[0], status: mapStageToStepStatus(st) };
              syncState();
            },
            onApproveHash: (h) => {
              steps[0] = { ...steps[0], txHash: h, status: "confirming_block" };
              syncState();
            },
          });
          steps[0] = { ...steps[0], status: "completed" };
          syncState();
        }

        const depositIdx = steps.length - 1;
        const depositData = vaultIface.encodeFunctionData("deposit", [amountWei]);
        const { hash, receipt } = await prepareAndSendTx(
          signer,
          { to: vaultAddr, data: depositData, value: ZERO },
          {
            label: `${vaultAsset} Vault`,
            onStage: (st) => {
              steps[depositIdx] = { ...steps[depositIdx], status: mapStageToStepStatus(st) };
              syncState();
            },
            onHash: (h) => {
              steps[depositIdx] = {
                ...steps[depositIdx],
                txHash: h,
                status: "confirming_block",
              };
              syncState({ txHash: h });
            },
          }
        );

        steps[depositIdx] = { ...steps[depositIdx], txHash: hash, status: "completed" };
        syncState({
          confirmed: true,
          txHash: hash,
          blockNumber: receipt?.blockNumber ?? null,
        });
        showMessage(`Staked ${amountSummary} on Arc Mainnet.`);
      } else {
        const steps: TxStepItem[] = [
          {
            id: "vault-withdraw",
            title: `Withdraw ${vaultAsset} from Vault`,
            subtitle: amountSummary,
            status: "simulating",
          },
        ];

        const syncState = (extra?: Partial<TxLifecycleState>) => {
          setTxLifecycle({
            id: opId,
            operationTitle: `Withdraw ${vaultAsset}`,
            amountSummary,
            steps: [...steps],
            explorerUrl: ARC_EXPLORER,
            chainId: ARC_CHAIN_ID,
            ...extra,
          });
        };

        syncState();

        const withdrawData = vaultIface.encodeFunctionData("withdraw", [amountWei]);
        const { hash, receipt } = await prepareAndSendTx(
          signer,
          { to: vaultAddr, data: withdrawData, value: ZERO },
          {
            label: `${vaultAsset} Vault`,
            onStage: (st) => {
              steps[0] = { ...steps[0], status: mapStageToStepStatus(st) };
              syncState();
            },
            onHash: (h) => {
              steps[0] = { ...steps[0], txHash: h, status: "confirming_block" };
              syncState({ txHash: h });
            },
          }
        );

        steps[0] = { ...steps[0], txHash: hash, status: "completed" };
        syncState({
          confirmed: true,
          txHash: hash,
          blockNumber: receipt?.blockNumber ?? null,
        });
        showMessage(`Withdrew ${amountSummary} from Nexio Vault.`);
      }

      setVaultInput("");
      invalidatePairCache();
      invalidateSnapshotCache(wallet);
      void syncProtocolSnapshot(wallet, { force: true });
      void loadOnChainHistory(wallet);
    } catch (error) {
      if (isUserWalletRejection(error)) {
        setTxLifecycle(null);
        showMessage("Transaction rejected in wallet.");
      } else {
        const msg = getTxErrorMessage(error);
        setTxLifecycle((prev) =>
          prev
            ? {
                ...prev,
                failed: true,
                errorMessage: msg,
                steps: prev.steps.map((s) =>
                  s.status === "simulating" ||
                  s.status === "awaiting_wallet" ||
                  s.status === "confirming_block"
                    ? { ...s, status: "failed" }
                    : s
                ),
              }
            : null
        );
        showMessage(msg);
      }
    } finally {
      setIsVaultLoading(false);
      setVaultAction(null);
    }
  };

  // Real On-Chain claimNLP() across active USDC & EURC Vaults (Zero self-transfers / Zero localStorage drift)
  const handleClaimPts = async () => {
    if (!wallet) {
      showMessage("Connect wallet first.");
      return;
    }
    if (!hasClaimableOnChainNlp || unclaimedNlp18 <= ZERO) {
      showMessage("No unclaimed NLP available yet.");
      return;
    }
    if (usdcBalanceRaw <= ZERO) {
      showMessage("Insufficient native USDC to pay Arc Mainnet gas.");
      return;
    }

    if (!isArcMainnet) {
      showMessage(`Switching to ${ARC_NETWORK_LABEL}...`);
      const switched = await switchToArcMainnet();
      if (!switched) {
        showMessage(`Switch to ${ARC_NETWORK_LABEL} (5042) manually.`);
        return;
      }
    }

    setIsVaultLoading(true);
    setVaultAction("claim");
    setReceiptDrawerDismissed(false);

    const claimTargets: Array<{
      id: string;
      title: string;
      vaultAddr: string;
      abi: readonly string[];
      isEurc: boolean;
    }> = [];

    if (liveUsdcPendingNlp18 > ZERO) {
      claimTargets.push({
        id: "claim-usdc-nlp",
        title: "Claim USDC Vault NLP",
        vaultAddr: USDC_VAULT_ADDRESS,
        abi: USDC_VAULT_ABI,
        isEurc: false,
      });
    }
    if (liveEurcPendingNlp18 > ZERO) {
      claimTargets.push({
        id: "claim-eurc-nlp",
        title: "Claim EURC Vault NLP",
        vaultAddr: EURC_VAULT_ADDRESS,
        abi: EURC_VAULT_ABI,
        isEurc: true,
      });
    }

    const opId = `nlp-claim-${Date.now()}`;
    const estClaimSummary = `+${formatPretty(unclaimedNlp18, NLP_DECIMALS, 4)} NLP`;
    const steps: TxStepItem[] = claimTargets.map((t) => ({
      id: t.id,
      title: t.title,
      subtitle: `${t.vaultAddr.slice(0, 6)}...${t.vaultAddr.slice(-4)} · claimNLP()`,
      status: "upcoming" as TxStepStatus,
    }));

    const syncState = (extra?: Partial<TxLifecycleState>) => {
      setTxLifecycle({
        id: opId,
        operationTitle: "Claim On-Chain NLP",
        amountSummary: estClaimSummary,
        steps: [...steps],
        explorerUrl: ARC_EXPLORER,
        chainId: ARC_CHAIN_ID,
        ...extra,
      });
    };

    try {
      const ethereum = getEthereum();
      if (!ethereum) throw new Error("Wallet provider not found.");
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      syncState();

      let totalClaimedUsd18 = ZERO;
      let lastHash = "";
      let lastBlock: number | null = null;

      for (let i = 0; i < claimTargets.length; i++) {
        const target = claimTargets[i];
        const vaultIface = new ethers.Interface(target.abi);
        const claimData = vaultIface.encodeFunctionData("claimNLP", []);

        const { hash, receipt } = await prepareAndSendTx(
          signer,
          { to: target.vaultAddr, data: claimData, value: ZERO },
          {
            label: target.title,
            onStage: (st) => {
              steps[i] = { ...steps[i], status: mapStageToStepStatus(st) };
              syncState();
            },
            onHash: (h) => {
              steps[i] = { ...steps[i], txHash: h, status: "confirming_block" };
              syncState({ txHash: h });
            },
          }
        );

        lastHash = hash;
        lastBlock = receipt?.blockNumber ?? lastBlock;

        let emitted18 = ZERO;
        if (receipt?.logs?.length) {
          for (const log of receipt.logs) {
            try {
              const parsed = vaultIface.parseLog({ topics: [...log.topics], data: log.data });
              if (parsed?.name === "NLPClaimed") {
                emitted18 += BigInt(parsed.args[1]);
              }
            } catch {
              // ignore non-matching logs
            }
          }
        }

        if (emitted18 > ZERO) {
          totalClaimedUsd18 += target.isEurc
            ? computeUsdScaledVaultNlp18({
                usdcNlp18: ZERO,
                eurcNlp18: emitted18,
                eurcSpotOut6: activeEurcSpotOut,
              })
            : emitted18;
        }

        steps[i] = {
          ...steps[i],
          subtitle:
            emitted18 > ZERO
              ? `+${formatPretty(emitted18, NLP_DECIMALS, 4)} NLP settled`
              : "Settled on Arc Mainnet",
          txHash: hash,
          status: "completed",
        };
        syncState({ txHash: hash, blockNumber: lastBlock });
      }

      const finalClaimLabel =
        totalClaimedUsd18 > ZERO
          ? `+${formatPretty(totalClaimedUsd18, NLP_DECIMALS, 4)} NLP`
          : estClaimSummary;

      syncState({
        amountSummary: finalClaimLabel,
        confirmed: true,
        txHash: lastHash || undefined,
        blockNumber: lastBlock,
      });

      showMessage(`Claimed ${finalClaimLabel} on Arc Mainnet.`);
      invalidateSnapshotCache(wallet);
      void syncProtocolSnapshot(wallet, { force: true });
      void loadOnChainHistory(wallet);
    } catch (error) {
      if (isUserWalletRejection(error)) {
        setTxLifecycle(null);
        showMessage("NLP claim rejected in wallet.");
      } else {
        const msg = getTxErrorMessage(error);
        setTxLifecycle((prev) =>
          prev
            ? {
                ...prev,
                failed: true,
                errorMessage: msg,
                steps: prev.steps.map((s) =>
                  s.status === "simulating" ||
                  s.status === "awaiting_wallet" ||
                  s.status === "confirming_block"
                    ? { ...s, status: "failed" }
                    : s
                ),
              }
            : null
        );
        showMessage(msg);
      }
    } finally {
      setIsVaultLoading(false);
      setVaultAction(null);
    }
  };

  // ============================================================================
  // Module 3: Nexio Swap (Nexio Routing Engine)
  // ============================================================================
  const clearSwapQuoteState = useCallback(() => {
    setSwapQuote("");
    setSwapQuoteRaw(ZERO);
    setSwapMinRaw(ZERO);
    setSwapExecutor("");
    setSwapImpactBps(null);
    setSwapPartnerBps(null);
    setSwapLossBps(null);
    setSwapBlockReason("");
  }, []);

  const syncSwapDraftState = useCallback(
    (nextInput: string, nextDir: "USDCtoEURC" | "EURCtoUSDC") => {
      const trimmed = nextInput.trim();
      if (!trimmed || isAmountDraft(trimmed)) {
        setSwapQuoting(false);
        setSwapQuoteError("");
        clearSwapQuoteState();
        return;
      }
      const inDec = nextDir === "USDCtoEURC" ? WUSDC_DECIMALS : EURC_DECIMALS;
      const strict = parseStrictAmount(trimmed, inDec);
      if (!strict.ok || strict.value <= ZERO) {
        setSwapQuoting(false);
        setSwapQuoteError(strict.ok ? "" : strict.error);
        clearSwapQuoteState();
        return;
      }
      setSwapQuoteError("");
      setSwapQuoting(true);
    },
    [clearSwapQuoteState]
  );

  const handleSwapInputChange = (raw: string) => {
    const clean = sanitizeDecimalDraft(raw);
    setSwapInput(clean);
    syncSwapDraftState(clean, swapDirection);
  };

  const handleFlipSwapDirection = () => {
    const nextDir = swapDirection === "USDCtoEURC" ? "EURCtoUSDC" : "USDCtoEURC";
    setSwapDirection(nextDir);
    clearSwapQuoteState();
    syncSwapDraftState(swapInput, nextDir);
  };

  const fillSwapMax = () => {
    if (swapDirection === "USDCtoEURC") {
      if (usdcSpendable <= ZERO) {
        showMessage("Insufficient USDC remaining after the 0.005 gas buffer.");
        return;
      }
      const next = formatExact(usdcSpendable, WUSDC_DECIMALS);
      setSwapInput(next);
      syncSwapDraftState(next, swapDirection);
    } else {
      if (eurcBalanceRaw <= ZERO) {
        showMessage("No EURC balance available to swap.");
        return;
      }
      const next = formatExact(eurcBalanceRaw, EURC_DECIMALS);
      setSwapInput(next);
      syncSwapDraftState(next, swapDirection);
    }
  };

  const applyCustomSlippage = (
    raw: string,
    setter: (bps: number) => void,
    maxBps = ACHSWAP_MAX_SLIPPAGE_BPS
  ) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    setter(Math.max(1, Math.min(maxBps, Math.round(n * 100))));
  };

  const swapInDecimals = swapDirection === "USDCtoEURC" ? WUSDC_DECIMALS : EURC_DECIMALS;
  const swapOutDecimals = swapDirection === "USDCtoEURC" ? EURC_DECIMALS : WUSDC_DECIMALS;
  const swapStrictIn = useMemo(
    () => parseStrictAmount(swapInput, swapInDecimals),
    [swapInput, swapInDecimals]
  );
  const swapAmountIn = swapStrictIn.ok && swapStrictIn.value > ZERO ? swapStrictIn.value : null;

  const swapInsufficient =
    Boolean(swapAmountIn) &&
    (swapDirection === "USDCtoEURC"
      ? swapAmountIn! > usdcSpendable
      : swapAmountIn! > eurcBalanceRaw);
  const swapMissingEurcGas =
    swapDirection === "EURCtoUSDC" && Boolean(wallet) && usdcBalanceRaw <= ZERO;

  const swapUsdcLabel = formatPretty(usdcWallet6, WUSDC_DECIMALS, 6);
  const swapEurcLabel = formatPretty(eurcBalanceRaw, EURC_DECIMALS, 6);

  const activeSwapQuoteKey = useMemo(() => {
    if (!swapAmountIn) return "";
    return `${swapDirection}:${swapAmountIn.toString()}:${slippageBps}:${(
      wallet || "anon"
    ).toLowerCase()}:${streak}:${swapRefreshTick}`;
  }, [swapDirection, swapAmountIn, slippageBps, wallet, streak, swapRefreshTick]);

  // 15s Visible-Tab Active Quote Auto-Refresh
  useEffect(() => {
    if (selectedTab !== "swap" || !swapAmountIn || isSwapping) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (txBusyRef.current) return;
      setSwapQuoting(true);
      setSwapRefreshTick((t) => t + 1);
    }, SWAP_QUOTE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [selectedTab, swapAmountIn, isSwapping]);

  // Debounced Swap Quote Loader
  useEffect(() => {
    if (!activeSwapQuoteKey || !swapAmountIn) return;

    const controller = new AbortController();
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      const isUsdcIn = swapDirection === "USDCtoEURC";
      const tokenIn = isUsdcIn ? WUSDC_ADDRESS : EURC_ADDRESS;
      const tokenOut = isUsdcIn ? EURC_ADDRESS : WUSDC_ADDRESS;
      const oneUnit = ethers.parseUnits("1", swapInDecimals);

      setSwapQuoting(true);
      try {
        const [quoted, spotAmountOut] = await Promise.all([
          requestAchswapQuote({
            tokenIn,
            tokenOut,
            amountIn: swapAmountIn,
            slippageBps,
            chainId: ARC_CHAIN_ID,
            trader: wallet || undefined,
            signal: controller.signal,
          }),
          requestOneUnitSpotOut({
            tokenIn,
            tokenOut,
            decimals: swapInDecimals,
            chainId: ARC_CHAIN_ID,
            signal: controller.signal,
          }),
        ]);

        if (cancelled || controller.signal.aborted) return;

        const spotOut = spotAmountOut ?? (swapAmountIn === oneUnit ? quoted.amountOut : null);
        const assessed = assessStableSwap(
          swapAmountIn,
          quoted.amountOut,
          spotOut === null ? null : oneUnit,
          spotOut,
          quoted.priceImpactBps
        );

        setSwapQuoteRaw(quoted.amountOut);
        setSwapMinRaw(quoted.minAmountOut);
        setSwapExecutor(quoted.executor);
        setSwapQuote(formatPretty(quoted.amountOut, swapOutDecimals, 6));
        setSwapImpactBps(quoted.priceImpactBps);
        setSwapPartnerBps(quoted.partnerBps);
        setSwapLossBps(assessed.valueLossBps);
        setSwapBlockReason(assessed.blocked ? assessed.reason : "");
        setSwapQuoteError("");
      } catch (error) {
        if (cancelled || isAbortError(error)) return;
        clearSwapQuoteState();
        setSwapQuoteError(
          describeAchswapError(error) ?? "No quote available. Check pool liquidity."
        );
      } finally {
        if (!cancelled) setSwapQuoting(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    activeSwapQuoteKey,
    swapAmountIn,
    swapDirection,
    swapInDecimals,
    swapOutDecimals,
    slippageBps,
    wallet,
    clearSwapQuoteState,
  ]);

  const handleSwap = async () => {
    if (!wallet) {
      showMessage("Connect wallet first.");
      return;
    }
    const isUsdcIn = swapDirection === "USDCtoEURC";
    const tokenInAddress = isUsdcIn ? WUSDC_ADDRESS : EURC_ADDRESS;
    const tokenOutAddress = isUsdcIn ? EURC_ADDRESS : WUSDC_ADDRESS;
    const tokenLabel = isUsdcIn ? "USDC" : "EURC";
    const outLabel = isUsdcIn ? "EURC" : "USDC";

    const parsedIn = parseStrictAmount(swapInput, swapInDecimals);
    if (!parsedIn.ok || parsedIn.value <= ZERO) {
      showMessage(parsedIn.ok ? "Enter an amount greater than zero." : parsedIn.error);
      return;
    }
    const amountIn = parsedIn.value;

    if (isUsdcIn && amountIn > usdcSpendable) {
      showMessage("Insufficient USDC balance after the 0.005 gas buffer.");
      return;
    }
    if (!isUsdcIn) {
      if (amountIn > eurcBalanceRaw) {
        showMessage("Insufficient EURC balance.");
        return;
      }
      if (usdcBalanceRaw <= ZERO) {
        showMessage("Insufficient native USDC to pay Arc Mainnet gas.");
        return;
      }
    }
    if (swapBlockReason) {
      showMessage(swapBlockReason);
      return;
    }

    if (!isArcMainnet) {
      showMessage(`Switching to ${ARC_NETWORK_LABEL}...`);
      const switched = await switchToArcMainnet();
      if (!switched) {
        showMessage(`Switch to ${ARC_NETWORK_LABEL} (5042) manually.`);
        return;
      }
    }

    const acceptedMinOut = swapMinRaw;
    setIsSwapping(true);
    setReceiptDrawerDismissed(false);
    const opId = `swap-${Date.now()}`;

    try {
      const ethereum = getEthereum();
      if (!ethereum) throw new Error("Wallet provider not found.");
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const sender = ethers.getAddress(await signer.getAddress());

      setTxLifecycle({
        id: opId,
        operationTitle: `Swap ${tokenLabel} → ${outLabel}`,
        amountSummary: `${formatPretty(amountIn, swapInDecimals, 6)} ${tokenLabel}`,
        steps: [
          {
            id: "swap-route",
            title: "Requesting Verified Swap Route",
            status: "simulating",
          },
        ],
        explorerUrl: ARC_EXPLORER,
        chainId: ARC_CHAIN_ID,
      });

      const callSwapEndpoint = () =>
        requestAchswapSwap({
          tokenIn: tokenInAddress,
          tokenOut: tokenOutAddress,
          amountIn,
          slippageBps,
          chainId: ARC_CHAIN_ID,
          sender,
          recipient: sender,
          trader: sender,
        });

      let swap = await callSwapEndpoint();

      const verifySwapSafety = async (candidate: typeof swap): Promise<boolean> => {
        const oneUnit = ethers.parseUnits("1", swapInDecimals);
        const spotOut = await requestOneUnitSpotOut({
          tokenIn: tokenInAddress,
          tokenOut: tokenOutAddress,
          decimals: swapInDecimals,
          chainId: ARC_CHAIN_ID,
        });
        const assessed = assessStableSwap(
          amountIn,
          candidate.amountOut,
          spotOut === null ? null : oneUnit,
          spotOut,
          candidate.priceImpactBps
        );

        if (assessed.blocked) {
          setSwapBlockReason(assessed.reason);
          setTxLifecycle(null);
          showMessage(assessed.reason);
          return false;
        }
        if (candidate.minAmountOut <= ZERO) {
          setTxLifecycle(null);
          showMessage("Quoted minimum output is zero; swap halted for safety.");
          return false;
        }
        if (acceptedMinOut > ZERO && candidate.minAmountOut < acceptedMinOut) {
          setSwapQuoteRaw(candidate.amountOut);
          setSwapMinRaw(candidate.minAmountOut);
          setSwapQuote(formatPretty(candidate.amountOut, swapOutDecimals, 6));
          setSwapExecutor(candidate.executor);
          setSwapImpactBps(candidate.priceImpactBps);
          setSwapPartnerBps(candidate.partnerBps);
          setTxLifecycle(null);
          showMessage(
            "Rate moved below your displayed minimum output. Review the updated quote and confirm again."
          );
          return false;
        }
        return true;
      };

      if (!(await verifySwapSafety(swap))) return;

      const spenderCandidate = swap.approval?.spender || swap.executor;
      const requiredAllowance = swap.approval?.amount ?? amountIn;
      let needsApprove = Boolean(swap.approval);

      if (!needsApprove && spenderCandidate && ethers.isAddress(spenderCandidate)) {
        const readTok = new ethers.Contract(tokenInAddress, ERC20_ABI, provider);
        const currentAll = (await readTok.allowance(sender, spenderCandidate)) as bigint;
        if (currentAll < requiredAllowance) {
          needsApprove = true;
        }
      }

      const steps: TxStepItem[] = [
        ...(needsApprove && spenderCandidate
          ? [
              {
                id: "swap-approve",
                title: `Approve ${tokenLabel}`,
                spender: spenderCandidate,
                status: "upcoming" as TxStepStatus,
              },
            ]
          : []),
        {
          id: "swap-exec",
          title: `Execute ${tokenLabel} → ${outLabel} Swap`,
          subtitle: `Min ${formatPretty(swap.minAmountOut, swapOutDecimals, 6)} ${outLabel}`,
          status: "upcoming" as TxStepStatus,
        },
      ];

      const syncState = (extra?: Partial<TxLifecycleState>) => {
        setTxLifecycle({
          id: opId,
          operationTitle: `Swap ${tokenLabel} → ${outLabel}`,
          amountSummary: `${formatPretty(
            amountIn,
            swapInDecimals,
            6
          )} ${tokenLabel} → min ${formatPretty(swap.minAmountOut, swapOutDecimals, 6)} ${outLabel}`,
          steps: [...steps],
          explorerUrl: ARC_EXPLORER,
          chainId: ARC_CHAIN_ID,
          ...extra,
        });
      };

      syncState();

      if (needsApprove && spenderCandidate) {
        const approveRes = await ensureExactAllowance({
          signer,
          tokenAddress: swap.approval?.token ?? tokenInAddress,
          spender: spenderCandidate,
          requiredAmount: requiredAllowance,
          owner: sender,
          onStage: (st) => {
            steps[0] = { ...steps[0], status: mapStageToStepStatus(st) };
            syncState();
          },
          onApproveHash: (h) => {
            steps[0] = { ...steps[0], txHash: h, status: "confirming_block" };
            syncState();
          },
        });
        steps[0] = { ...steps[0], status: "completed" };
        syncState();

        if (approveRes.approved) {
          swap = await callSwapEndpoint();
          if (!(await verifySwapSafety(swap))) return;
        }
      }

      const execIdx = steps.length - 1;
      steps[execIdx] = {
        ...steps[execIdx],
        subtitle: `Min ${formatPretty(swap.minAmountOut, swapOutDecimals, 6)} ${outLabel}`,
      };

      const { hash, receipt } = await prepareAndSendTx(
        signer,
        {
          to: swap.tx.to,
          data: swap.tx.data,
          value: swap.tx.value,
          ...(swap.tx.gas > ZERO ? { gasLimit: swap.tx.gas } : {}),
        },
        {
          label: "Settlement Executor",
          onStage: (st) => {
            steps[execIdx] = { ...steps[execIdx], status: mapStageToStepStatus(st) };
            syncState();
          },
          onHash: (h) => {
            steps[execIdx] = { ...steps[execIdx], txHash: h, status: "confirming_block" };
            syncState({ txHash: h });
          },
        }
      );

      steps[execIdx] = { ...steps[execIdx], txHash: hash, status: "completed" };
      syncState({
        confirmed: true,
        txHash: hash,
        blockNumber: receipt?.blockNumber ?? null,
      });

      showMessage("Swap finalized on Arc Mainnet.");
      setSwapInput("");
      clearSwapQuoteState();
      setSwapQuoteError("");
      invalidatePairCache();
      invalidateSnapshotCache(wallet);
      void syncProtocolSnapshot(wallet, { force: true });
      void loadOnChainHistory(wallet);
    } catch (error) {
      if (isUserWalletRejection(error)) {
        setTxLifecycle(null);
        showMessage("Swap rejected in wallet.");
      } else {
        const msg = describeAchswapError(error) ?? getTxErrorMessage(error);
        setTxLifecycle((prev) =>
          prev
            ? {
                ...prev,
                failed: true,
                errorMessage: msg,
                steps: prev.steps.map((s) =>
                  s.status === "simulating" ||
                  s.status === "awaiting_wallet" ||
                  s.status === "confirming_block"
                    ? { ...s, status: "failed" }
                    : s
                ),
              }
            : null
        );
        showMessage(msg);
      }
    } finally {
      setIsSwapping(false);
    }
  };

  // ============================================================================
  // Module 4: Liquidity (LP) — Add & Remove with 5% Live Spot Skew Guard
  // ============================================================================
  const fillLpUsdcMax = () => {
    setLpLastEdited("usdc");
    setLpUsdcInput(formatExact(usdcSpendable, WUSDC_DECIMALS));
  };

  const fillLpEurcMax = () => {
    setLpLastEdited("eurc");
    setLpEurcInput(formatExact(eurcBalanceRaw, EURC_DECIMALS));
  };

  const fillLpRemoveMax = () => {
    setLpRemoveIsMax(true);
    setLpRemoveInput(formatExact(lpBalanceRaw, LP_DECIMALS));
  };

  // Paired-side Add Liquidity Quote Sync
  useEffect(() => {
    if (lpMode !== "add") return;
    const source = lpLastEdited === "usdc" ? lpUsdcInput : lpEurcInput;
    if (!source.trim() || isAmountDraft(source)) return;

    const parsed = parseAmount(source, lpLastEdited === "usdc" ? WUSDC_DECIMALS : EURC_DECIMALS);
    if (!parsed || parsed <= ZERO) return;

    const quoteKey = `${lpLastEdited}:${parsed.toString()}`;
    if (quoteKey === lastLpQuoteKeyRef.current) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const pairState = await fetchPairState(undefined, EURC_ADDRESS);
        if (!pairState || pairState.reserveWusdc <= ZERO || pairState.reserveEurc <= ZERO) return;

        const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, getArcReadProvider());
        if (lpLastEdited === "usdc") {
          const quotedEurc = (await router.quote(
            parsed,
            pairState.reserveWusdc,
            pairState.reserveEurc
          )) as bigint;
          if (!cancelled) {
            lastLpQuoteKeyRef.current = quoteKey;
            setLpEurcInput(formatExact(quotedEurc, EURC_DECIMALS));
          }
        } else {
          const quotedUsdc = (await router.quote(
            parsed,
            pairState.reserveEurc,
            pairState.reserveWusdc
          )) as bigint;
          if (!cancelled) {
            lastLpQuoteKeyRef.current = quoteKey;
            setLpUsdcInput(formatExact(quotedUsdc, WUSDC_DECIMALS));
          }
        }
      } catch {
        // non-blocking quote sync
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lpUsdcInput, lpEurcInput, lpLastEdited, lpMode]);

  // Remove Liquidity Underlying Preview
  useEffect(() => {
    if (lpMode !== "remove" || !lpRemoveInput.trim()) return;
    const lpAmount = lpRemoveIsMax ? lpBalanceRaw : parseAmount(lpRemoveInput, LP_DECIMALS);
    if (!lpAmount || lpAmount <= ZERO) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const pairState = await fetchPairState(undefined, EURC_ADDRESS);
        if (!pairState || cancelled) return;
        const underlying = underlyingFromLp(
          lpAmount,
          pairState.totalSupply,
          pairState.reserveWusdc,
          pairState.reserveEurc
        );
        setLpRemovePreviewUsdc(formatPretty(underlying.wusdc, WUSDC_DECIMALS, 6));
        setLpRemovePreviewEurc(formatPretty(underlying.eurc, EURC_DECIMALS, 6));
      } catch {
        // keep last preview
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lpRemoveInput, lpMode, lpRemoveIsMax, lpBalanceRaw]);

  const lpUsdcStrict = useMemo(
    () => parseStrictAmount(lpUsdcInput, WUSDC_DECIMALS),
    [lpUsdcInput]
  );
  const lpEurcStrict = useMemo(
    () => parseStrictAmount(lpEurcInput, EURC_DECIMALS),
    [lpEurcInput]
  );
  const lpAddValidInputs =
    lpUsdcStrict.ok && lpUsdcStrict.value > ZERO && lpEurcStrict.ok && lpEurcStrict.value > ZERO;
  const lpAddInsufficient =
    lpAddValidInputs &&
    (lpUsdcStrict.value > usdcSpendable || lpEurcStrict.value > eurcBalanceRaw);

  const lpRemoveStrict = useMemo(
    () => parseStrictAmount(lpRemoveInput, LP_DECIMALS),
    [lpRemoveInput]
  );
  const lpRemoveAmountRaw = lpRemoveIsMax
    ? lpBalanceRaw
    : lpRemoveStrict.ok
      ? lpRemoveStrict.value
      : null;
  const lpRemoveInsufficient =
    lpRemoveAmountRaw !== null && lpRemoveAmountRaw > ZERO && lpRemoveAmountRaw > lpBalanceRaw;

  const handleAddLiquidity = async () => {
    if (!wallet) {
      showMessage("Connect wallet first.");
      return;
    }
    if (!lpUsdcStrict.ok || lpUsdcStrict.value <= ZERO) {
      showMessage(lpUsdcStrict.ok ? "Enter a valid USDC amount." : lpUsdcStrict.error);
      return;
    }
    if (!lpEurcStrict.ok || lpEurcStrict.value <= ZERO) {
      showMessage(lpEurcStrict.ok ? "Enter a valid EURC amount." : lpEurcStrict.error);
      return;
    }

    if (!isArcMainnet) {
      showMessage(`Switching to ${ARC_NETWORK_LABEL}...`);
      const switched = await switchToArcMainnet();
      if (!switched) {
        showMessage(`Switch to ${ARC_NETWORK_LABEL} (5042) manually.`);
        return;
      }
    }

    setIsLpLoading(true);
    setReceiptDrawerDismissed(false);
    const opId = `lp-add-${Date.now()}`;

    try {
      const ethereum = getEthereum();
      if (!ethereum) throw new Error("Wallet provider not found.");

      const [pairState, spotSnap] = await Promise.all([
        fetchPairState(undefined, EURC_ADDRESS, { force: true }),
        requestOneUnitSpotSnapshot({
          tokenIn: EURC_ADDRESS,
          tokenOut: WUSDC_ADDRESS,
          decimals: EURC_DECIMALS,
          chainId: ARC_CHAIN_ID,
          maxAgeMs: SPOT_MAX_STALENESS_MS,
        }),
      ]);

      if (!pairState) {
        showMessage("USDC/EURC liquidity pair not found on Factory.");
        return;
      }

      const freshEurcUsd =
        spotSnap && !spotSnap.expired && spotSnap.amountOut > ZERO
          ? Number(ethers.formatUnits(spotSnap.amountOut, WUSDC_DECIMALS))
          : null;
      if (spotSnap && !spotSnap.expired && spotSnap.amountOut > ZERO) {
        setEurcSpotOut(spotSnap.amountOut);
        setEurcSpotFetchedAt(spotSnap.fetchedAt);
      }

      const poolEmpty = pairState.reserveWusdc <= ZERO || pairState.reserveEurc <= ZERO;
      if (!poolEmpty) {
        const freshPoolPrice = poolPriceUsdPerEurc(
          pairState.reserveWusdc,
          pairState.reserveEurc
        );
        const freshSkew =
          freshPoolPrice !== null && freshEurcUsd !== null
            ? priceDivergenceBps(freshPoolPrice, freshEurcUsd)
            : null;
        if (
          freshEurcUsd === null ||
          freshSkew === null ||
          freshSkew > POOL_SKEW_LIMIT_BPS
        ) {
          showMessage(
            "Add liquidity blocked: pool price diverges >5% from live market EURC spot, or spot quote is unavailable."
          );
          return;
        }
      } else {
        const openingPrice = poolPriceUsdPerEurc(lpUsdcStrict.value, lpEurcStrict.value);
        const openingSkew =
          openingPrice !== null && freshEurcUsd !== null
            ? priceDivergenceBps(openingPrice, freshEurcUsd)
            : null;
        if (
          freshEurcUsd === null ||
          openingSkew === null ||
          openingSkew > POOL_SKEW_LIMIT_BPS
        ) {
          showMessage(
            "Initial pool seeding blocked: deposit ratio must be within 5% of live market EURC spot."
          );
          return;
        }
      }

      let amountUsdc = lpUsdcStrict.value;
      let amountEurc = lpEurcStrict.value;

      if (!poolEmpty) {
        const routerRead = new ethers.Contract(
          ROUTER_ADDRESS,
          ROUTER_ABI,
          getArcReadProvider()
        );
        if (lpLastEdited === "usdc") {
          const quotedEurc = (await routerRead.quote(
            amountUsdc,
            pairState.reserveWusdc,
            pairState.reserveEurc
          )) as bigint;
          const maxAllowedEurc =
            lpEurcStrict.value +
            (lpEurcStrict.value * BigInt(lpSlippageBps)) / 10_000n;
          if (quotedEurc > maxAllowedEurc) {
            setLpEurcInput(formatExact(quotedEurc, EURC_DECIMALS));
            showMessage("Pool reserves shifted; updated EURC amount. Review and confirm again.");
            return;
          }
          amountEurc = quotedEurc;
        } else {
          const quotedUsdc = (await routerRead.quote(
            amountEurc,
            pairState.reserveEurc,
            pairState.reserveWusdc
          )) as bigint;
          const maxAllowedUsdc =
            lpUsdcStrict.value +
            (lpUsdcStrict.value * BigInt(lpSlippageBps)) / 10_000n;
          if (quotedUsdc > maxAllowedUsdc) {
            setLpUsdcInput(formatExact(quotedUsdc, WUSDC_DECIMALS));
            showMessage("Pool reserves shifted; updated USDC amount. Review and confirm again.");
            return;
          }
          amountUsdc = quotedUsdc;
        }
      }

      if (amountUsdc > usdcSpendable) {
        showMessage("Insufficient USDC balance after the 0.005 gas buffer.");
        return;
      }
      if (amountEurc > eurcBalanceRaw) {
        showMessage("Insufficient EURC balance.");
        return;
      }

      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const owner = ethers.getAddress(await signer.getAddress());

      const eurcRead = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, provider);
      const usdcRead = new ethers.Contract(WUSDC_ADDRESS, ERC20_ABI, provider);
      const [eurcAllowance, usdcAllowance] = await Promise.all([
        eurcRead.allowance(owner, ROUTER_ADDRESS) as Promise<bigint>,
        usdcRead.allowance(owner, ROUTER_ADDRESS) as Promise<bigint>,
      ]);

      const needEurcApprove = eurcAllowance < amountEurc;
      const needUsdcApprove = usdcAllowance < amountUsdc;

      const steps: TxStepItem[] = [
        ...(needEurcApprove
          ? [
              {
                id: "lp-approve-eurc",
                title: "Approve EURC for V2 Router",
                spender: ROUTER_ADDRESS,
                status: "upcoming" as TxStepStatus,
              },
            ]
          : []),
        ...(needUsdcApprove
          ? [
              {
                id: "lp-approve-usdc",
                title: "Approve USDC for V2 Router",
                spender: ROUTER_ADDRESS,
                status: "upcoming" as TxStepStatus,
              },
            ]
          : []),
        {
          id: "lp-add-exec",
          title: "Supply USDC / EURC Liquidity",
          subtitle: `${formatPretty(amountUsdc, WUSDC_DECIMALS, 4)} USDC + ${formatPretty(
            amountEurc,
            EURC_DECIMALS,
            4
          )} EURC`,
          status: "upcoming" as TxStepStatus,
        },
      ];

      const summary = `${formatPretty(amountUsdc, WUSDC_DECIMALS, 4)} USDC + ${formatPretty(
        amountEurc,
        EURC_DECIMALS,
        4
      )} EURC`;

      const syncState = (extra?: Partial<TxLifecycleState>) => {
        setTxLifecycle({
          id: opId,
          operationTitle: "Add Liquidity",
          amountSummary: summary,
          steps: [...steps],
          explorerUrl: ARC_EXPLORER,
          chainId: ARC_CHAIN_ID,
          ...extra,
        });
      };

      syncState();

      let cursor = 0;
      if (needEurcApprove) {
        const idx = cursor++;
        await ensureExactAllowance({
          signer,
          tokenAddress: EURC_ADDRESS,
          spender: ROUTER_ADDRESS,
          requiredAmount: amountEurc,
          owner,
          onStage: (st) => {
            steps[idx] = { ...steps[idx], status: mapStageToStepStatus(st) };
            syncState();
          },
          onApproveHash: (h) => {
            steps[idx] = { ...steps[idx], txHash: h, status: "confirming_block" };
            syncState();
          },
        });
        steps[idx] = { ...steps[idx], status: "completed" };
        syncState();
      }

      if (needUsdcApprove) {
        const idx = cursor++;
        await ensureExactAllowance({
          signer,
          tokenAddress: WUSDC_ADDRESS,
          spender: ROUTER_ADDRESS,
          requiredAmount: amountUsdc,
          owner,
          onStage: (st) => {
            steps[idx] = { ...steps[idx], status: mapStageToStepStatus(st) };
            syncState();
          },
          onApproveHash: (h) => {
            steps[idx] = { ...steps[idx], txHash: h, status: "confirming_block" };
            syncState();
          },
        });
        steps[idx] = { ...steps[idx], status: "completed" };
        syncState();
      }

      const addIdx = cursor;
      const routerIface = new ethers.Interface(ROUTER_ABI);
      const addData = routerIface.encodeFunctionData("addLiquidity", [
        WUSDC_ADDRESS,
        EURC_ADDRESS,
        amountUsdc,
        amountEurc,
        applySlippage(amountUsdc, lpSlippageBps),
        applySlippage(amountEurc, lpSlippageBps),
        owner,
        swapDeadline(),
      ]);

      const { hash, receipt } = await prepareAndSendTx(
        signer,
        { to: ROUTER_ADDRESS, data: addData, value: ZERO },
        {
          label: "V2 Liquidity Router",
          onStage: (st) => {
            steps[addIdx] = { ...steps[addIdx], status: mapStageToStepStatus(st) };
            syncState();
          },
          onHash: (h) => {
            steps[addIdx] = { ...steps[addIdx], txHash: h, status: "confirming_block" };
            syncState({ txHash: h });
          },
        }
      );

      steps[addIdx] = { ...steps[addIdx], txHash: hash, status: "completed" };
      syncState({
        confirmed: true,
        txHash: hash,
        blockNumber: receipt?.blockNumber ?? null,
      });

      showMessage("Liquidity supplied on Arc Mainnet.");
      setLpUsdcInput("");
      setLpEurcInput("");
      lastLpQuoteKeyRef.current = "";
      invalidatePairCache();
      invalidateSnapshotCache(wallet);
      void syncProtocolSnapshot(wallet, { force: true });
      void loadOnChainHistory(wallet);
    } catch (error) {
      if (isUserWalletRejection(error)) {
        setTxLifecycle(null);
        showMessage("Add liquidity rejected in wallet.");
      } else {
        const msg = getTxErrorMessage(error);
        setTxLifecycle((prev) =>
          prev
            ? {
                ...prev,
                failed: true,
                errorMessage: msg,
                steps: prev.steps.map((s) =>
                  s.status === "simulating" ||
                  s.status === "awaiting_wallet" ||
                  s.status === "confirming_block"
                    ? { ...s, status: "failed" }
                    : s
                ),
              }
            : null
        );
        showMessage(msg);
      }
    } finally {
      setIsLpLoading(false);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!wallet) {
      showMessage("Connect wallet first.");
      return;
    }
    const liquidity = lpRemoveIsMax
      ? lpBalanceRaw
      : lpRemoveStrict.ok
        ? lpRemoveStrict.value
        : null;
    if (!liquidity || liquidity <= ZERO) {
      showMessage(
        !lpRemoveIsMax && !lpRemoveStrict.ok
          ? lpRemoveStrict.error
          : "Enter an LP amount to remove."
      );
      return;
    }
    if (liquidity > lpBalanceRaw) {
      showMessage("Insufficient LP token balance.");
      return;
    }
    if (usdcBalanceRaw <= ZERO) {
      showMessage("Insufficient native USDC to pay Arc Mainnet gas.");
      return;
    }

    if (!isArcMainnet) {
      showMessage(`Switching to ${ARC_NETWORK_LABEL}...`);
      const switched = await switchToArcMainnet();
      if (!switched) {
        showMessage(`Switch to ${ARC_NETWORK_LABEL} (5042) manually.`);
        return;
      }
    }

    setIsLpLoading(true);
    setReceiptDrawerDismissed(false);
    const opId = `lp-remove-${Date.now()}`;

    try {
      const ethereum = getEthereum();
      if (!ethereum) throw new Error("Wallet provider not found.");
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const owner = ethers.getAddress(await signer.getAddress());

      const pairState = await fetchPairState(undefined, EURC_ADDRESS, { force: true });
      if (!pairState) {
        showMessage("Liquidity pair not found.");
        return;
      }

      const underlying = underlyingFromLp(
        liquidity,
        pairState.totalSupply,
        pairState.reserveWusdc,
        pairState.reserveEurc
      );

      const pairRead = new ethers.Contract(pairState.pairAddress, PAIR_ABI, provider);
      const lpAllowance = (await pairRead.allowance(owner, ROUTER_ADDRESS)) as bigint;
      const needLpApprove = lpAllowance < liquidity;

      const estSummary = `~${formatPretty(underlying.wusdc, WUSDC_DECIMALS, 4)} USDC + ${formatPretty(
        underlying.eurc,
        EURC_DECIMALS,
        4
      )} EURC`;

      const steps: TxStepItem[] = [
        ...(needLpApprove
          ? [
              {
                id: "lp-approve-pair",
                title: "Approve LP Tokens for Router",
                spender: ROUTER_ADDRESS,
                status: "upcoming" as TxStepStatus,
              },
            ]
          : []),
        {
          id: "lp-remove-exec",
          title: "Withdraw Underlying USDC & EURC",
          subtitle: estSummary,
          status: "upcoming" as TxStepStatus,
        },
      ];

      const syncState = (extra?: Partial<TxLifecycleState>) => {
        setTxLifecycle({
          id: opId,
          operationTitle: "Remove Liquidity",
          amountSummary: estSummary,
          steps: [...steps],
          explorerUrl: ARC_EXPLORER,
          chainId: ARC_CHAIN_ID,
          ...extra,
        });
      };

      syncState();

      if (needLpApprove) {
        await ensureExactAllowance({
          signer,
          tokenAddress: pairState.pairAddress,
          spender: ROUTER_ADDRESS,
          requiredAmount: liquidity,
          owner,
          onStage: (st) => {
            steps[0] = { ...steps[0], status: mapStageToStepStatus(st) };
            syncState();
          },
          onApproveHash: (h) => {
            steps[0] = { ...steps[0], txHash: h, status: "confirming_block" };
            syncState();
          },
        });
        steps[0] = { ...steps[0], status: "completed" };
        syncState();
      }

      const remIdx = steps.length - 1;
      const routerIface = new ethers.Interface(ROUTER_ABI);
      const remData = routerIface.encodeFunctionData("removeLiquidity", [
        WUSDC_ADDRESS,
        EURC_ADDRESS,
        liquidity,
        applySlippage(underlying.wusdc, lpSlippageBps),
        applySlippage(underlying.eurc, lpSlippageBps),
        owner,
        swapDeadline(),
      ]);

      const { hash, receipt } = await prepareAndSendTx(
        signer,
        { to: ROUTER_ADDRESS, data: remData, value: ZERO },
        {
          label: "V2 Liquidity Router",
          onStage: (st) => {
            steps[remIdx] = { ...steps[remIdx], status: mapStageToStepStatus(st) };
            syncState();
          },
          onHash: (h) => {
            steps[remIdx] = { ...steps[remIdx], txHash: h, status: "confirming_block" };
            syncState({ txHash: h });
          },
        }
      );

      let actualUsdc = underlying.wusdc;
      let actualEurc = underlying.eurc;
      if (receipt?.logs?.length) {
        const ercIface = new ethers.Interface(ERC20_ABI);
        let sumU = ZERO;
        let sumE = ZERO;
        for (const log of receipt.logs) {
          try {
            const parsed = ercIface.parseLog({ topics: [...log.topics], data: log.data });
            if (parsed?.name === "Transfer") {
              const toAddr = String(parsed.args[1]).toLowerCase();
              const val = BigInt(parsed.args[2]);
              if (toAddr === owner.toLowerCase()) {
                if (log.address.toLowerCase() === WUSDC_ADDRESS.toLowerCase()) sumU += val;
                if (log.address.toLowerCase() === EURC_ADDRESS.toLowerCase()) sumE += val;
              }
            }
          } catch {
            // non-ERC20 log
          }
        }
        if (sumU > ZERO) actualUsdc = sumU;
        if (sumE > ZERO) actualEurc = sumE;
      }

      const finalSummary = `+${formatPretty(actualUsdc, WUSDC_DECIMALS, 6)} USDC / +${formatPretty(
        actualEurc,
        EURC_DECIMALS,
        6
      )} EURC`;

      steps[remIdx] = {
        ...steps[remIdx],
        subtitle: finalSummary,
        txHash: hash,
        status: "completed",
      };
      syncState({
        amountSummary: finalSummary,
        confirmed: true,
        txHash: hash,
        blockNumber: receipt?.blockNumber ?? null,
      });

      showMessage("Liquidity withdrawn on Arc Mainnet.");
      setLpRemoveInput("");
      setLpRemoveIsMax(false);
      setLpRemovePreviewUsdc("");
      setLpRemovePreviewEurc("");
      invalidatePairCache();
      invalidateSnapshotCache(wallet);
      void syncProtocolSnapshot(wallet, { force: true });
      void loadOnChainHistory(wallet);
    } catch (error) {
      if (isUserWalletRejection(error)) {
        setTxLifecycle(null);
        showMessage("Remove liquidity rejected in wallet.");
      } else {
        const msg = getTxErrorMessage(error);
        setTxLifecycle((prev) =>
          prev
            ? {
                ...prev,
                failed: true,
                errorMessage: msg,
                steps: prev.steps.map((s) =>
                  s.status === "simulating" ||
                  s.status === "awaiting_wallet" ||
                  s.status === "confirming_block"
                    ? { ...s, status: "failed" }
                    : s
                ),
              }
            : null
        );
        showMessage(msg);
      }
    } finally {
      setIsLpLoading(false);
    }
  };

  // ============================================================================
  // Module 5: Daily GM Check-In (24h Cooldown + 48h Consecutive Streak Window)
  // ============================================================================
  const executeDailyGM = async () => {
    if (!wallet) {
      showMessage("Connect wallet first.");
      return;
    }
    if (hasCheckedInToday) {
      showMessage(`Next Daily GM unlocks in ${timeLeft}.`);
      return;
    }
    if (usdcBalanceRaw <= ZERO) {
      showMessage("Insufficient native USDC to pay Arc Mainnet gas.");
      return;
    }

    if (!isArcMainnet) {
      showMessage(`Switching to ${ARC_NETWORK_LABEL}...`);
      const switched = await switchToArcMainnet();
      if (!switched) {
        showMessage(`Switch to ${ARC_NETWORK_LABEL} (5042) manually.`);
        return;
      }
    }

    setIsCheckingIn(true);
    setReceiptDrawerDismissed(false);
    const opId = `gm-${Date.now()}`;
    const nowSec = getChainClockNowSec();
    const expectedNextStreak = streak + 1;

    const steps: TxStepItem[] = [
      {
        id: "gm-checkin",
        title: "Daily GM On-Chain Check-In",
        subtitle: `Consecutive Day ${expectedNextStreak}`,
        status: "simulating",
      },
    ];

    const syncState = (extra?: Partial<TxLifecycleState>) => {
      setTxLifecycle({
        id: opId,
        operationTitle: "Daily GM Check-In",
        amountSummary: `Consecutive Streak → Day ${expectedNextStreak}`,
        steps: [...steps],
        explorerUrl: ARC_EXPLORER,
        chainId: ARC_CHAIN_ID,
        ...extra,
      });
    };

    try {
      const ethereum = getEthereum();
      if (!ethereum) throw new Error("Wallet provider not found.");
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      syncState();

      const gmIface = new ethers.Interface(DAILY_GM_ABI);
      const checkInData = gmIface.encodeFunctionData("checkIn", []);

      const { hash, receipt } = await prepareAndSendTx(
        signer,
        { to: DAILY_GM_ADDRESS, data: checkInData, value: ZERO },
        {
          label: "Daily GM",
          gmLastCheckIn: lastCheckInTime,
          blockTimestamp: nowSec,
          onStage: (st) => {
            steps[0] = { ...steps[0], status: mapStageToStepStatus(st) };
            syncState();
          },
          onHash: (h) => {
            steps[0] = { ...steps[0], txHash: h, status: "confirming_block" };
            syncState({ txHash: h });
          },
        }
      );

      let emittedStreak = expectedNextStreak;
      if (receipt?.logs?.length) {
        for (const log of receipt.logs) {
          try {
            const parsed = gmIface.parseLog({ topics: [...log.topics], data: log.data });
            if (parsed?.name === "CheckedIn") {
              emittedStreak = Number(BigInt(parsed.args[1]));
              const emittedTs = Number(BigInt(parsed.args[2]));
              if (emittedTs > 0 && typeof performance !== "undefined") {
                chainClockRef.current = { blockTs: emittedTs, perfMs: performance.now() };
                setLiveChainNowSec(emittedTs);
                setLastCheckInTime(emittedTs);
                setGmStreakExpiresAt(emittedTs + 172_800);
                setCooldownRemainingSec(86_400);
                setStreakExpiresInSec(172_800);
              }
            }
          } catch {
            // ignore other logs
          }
        }
      }

      setStreak(emittedStreak);
      steps[0] = {
        ...steps[0],
        subtitle: `Confirmed Consecutive Day ${emittedStreak}`,
        txHash: hash,
        status: "completed",
      };
      syncState({
        amountSummary: `Streak Confirmed · Day ${emittedStreak}`,
        confirmed: true,
        txHash: hash,
        blockNumber: receipt?.blockNumber ?? null,
      });

      showMessage(`Daily GM confirmed on Arc Mainnet. Consecutive streak: ${emittedStreak} days.`);
      invalidateSnapshotCache(wallet);
      void syncProtocolSnapshot(wallet, { force: true });
      void loadOnChainHistory(wallet);
    } catch (error) {
      if (isUserWalletRejection(error)) {
        setTxLifecycle(null);
        showMessage("Daily GM check-in rejected in wallet.");
      } else {
        const msg = decodeNexioError(error, {
          gmLastCheckIn: lastCheckInTime,
          blockTimestamp: getChainClockNowSec(),
        });
        steps[0] = { ...steps[0], status: "failed" };
        syncState({ failed: true, errorMessage: msg });
        showMessage(msg);
      }
    } finally {
      setIsCheckingIn(false);
    }
  };

  // ============================================================================
  // Module 6: Nexio Domains (ANS) — Search, Register, Reverse Lookup & Recovery
  // ============================================================================
  const handleDomainSearchInputChange = (raw: string) => {
    const trimmed = raw.trimStart().toLowerCase();
    setDomainSearch(trimmed);
    setDomainAvailable(false);
    setDomainTaken(false);
    if (!trimmed.trim()) {
      setDomainValidationMsg(null);
      return;
    }
    const v = validateAnsDomainInput(trimmed);
    setDomainValidationMsg(v.valid ? null : v.error ?? "Invalid .nex domain.");
  };

  const handleSearchDomain = async () => {
    const validation = validateAnsDomainInput(domainSearch);
    if (!validation.valid) {
      setDomainAvailable(false);
      setDomainTaken(false);
      setDomainValidationMsg(validation.error ?? "Enter a valid .nex domain.");
      showMessage(validation.error ?? "Enter a valid .nex domain.");
      return;
    }

    setDomainSearch(validation.label);
    setDomainValidationMsg(null);
    setIsCheckingDomain(true);
    setDomainAvailable(false);
    setDomainTaken(false);

    try {
      if (wallet && ethers.isAddress(wallet)) {
        const existing = await resolveAddressToDomain(wallet);
        if (existing) {
          const full = `${existing}.nex`;
          setRegisteredDomain(full);
          setPassVerified(true);
          try {
            window.localStorage.setItem(walletStorageKey("nexio_domain_name", wallet), full);
          } catch {
            // ignore
          }
          setDomainTaken(true);
          showMessage(`This wallet already owns ${full} (1 wallet = 1 .nex domain).`);
          return;
        }
      }

      const available = await isDomainAvailable(validation.label);
      if (available) {
        setDomainAvailable(true);
        setDomainTaken(false);
        showMessage(`${validation.fullDomain} is available.`);
      } else {
        setDomainAvailable(false);
        setDomainTaken(true);
        showMessage(`${validation.fullDomain} is permanently registered.`);
      }
    } catch (error) {
      if (isRpcTransportError(error)) {
        showMessage("Arc Mainnet RPC is temporarily unreachable. Please retry.");
      } else {
        showMessage(decodeNexioError(error));
      }
    } finally {
      setIsCheckingDomain(false);
    }
  };

  const executeRegisterDomain = async () => {
    if (!wallet) {
      showMessage("Connect wallet first.");
      return;
    }
    const validation = validateAnsDomainInput(domainSearch);
    if (!validation.valid) {
      showMessage(validation.error ?? "Enter a valid .nex domain.");
      return;
    }
    if (usdcBalanceRaw <= ZERO) {
      showMessage("Insufficient native USDC to pay Arc Mainnet gas.");
      return;
    }

    if (!isArcMainnet) {
      showMessage(`Switching to ${ARC_NETWORK_LABEL}...`);
      const switched = await switchToArcMainnet();
      if (!switched) {
        showMessage(`Switch to ${ARC_NETWORK_LABEL} (5042) manually.`);
        return;
      }
    }

    setIsRegistering(true);
    setReceiptDrawerDismissed(false);
    const opId = `ans-reg-${Date.now()}`;

    const steps: TxStepItem[] = [
      {
        id: "ans-register",
        title: `Register ${validation.fullDomain}`,
        subtitle: "Permanent 1-Wallet-1-Domain binding",
        status: "simulating",
      },
    ];

    const syncState = (extra?: Partial<TxLifecycleState>) => {
      setTxLifecycle({
        id: opId,
        operationTitle: "Register .nex Domain",
        amountSummary: validation.fullDomain,
        steps: [...steps],
        explorerUrl: ARC_EXPLORER,
        chainId: ARC_CHAIN_ID,
        ...extra,
      });
    };

    try {
      const existing = await resolveAddressToDomain(wallet);
      if (existing) {
        const full = `${existing}.nex`;
        setRegisteredDomain(full);
        setPassVerified(true);
        setDomainAvailable(false);
        setDomainTaken(true);
        setTxLifecycle(null);
        showMessage(`This wallet already owns ${full}.`);
        return;
      }

      const stillAvailable = await isDomainAvailable(validation.label);
      if (!stillAvailable) {
        setDomainAvailable(false);
        setDomainTaken(true);
        setTxLifecycle(null);
        showMessage(`${validation.fullDomain} is permanently registered.`);
        return;
      }

      const ethereum = getEthereum();
      if (!ethereum) throw new Error("Wallet provider not found.");
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      syncState();

      const ansIface = new ethers.Interface(ANS_ABI);
      const regData = ansIface.encodeFunctionData("register", [validation.label]);

      const { hash, receipt } = await prepareAndSendTx(
        signer,
        { to: ANS_CONTRACT_ADDRESS, data: regData, value: ZERO },
        {
          label: "Arc Name Service",
          onStage: (st) => {
            steps[0] = { ...steps[0], status: mapStageToStepStatus(st) };
            syncState();
          },
          onHash: (h) => {
            steps[0] = { ...steps[0], txHash: h, status: "confirming_block" };
            syncState({ txHash: h });
          },
        }
      );

      invalidateAnsCache(wallet, validation.label);
      invalidateSnapshotCache(wallet);

      setRegisteredDomain(validation.fullDomain);
      setPassVerified(true);
      setRegistrationHash(hash);

      try {
        window.localStorage.setItem(
          walletStorageKey("nexio_domain_name", wallet),
          validation.fullDomain
        );
      } catch {
        // ignore
      }

      steps[0] = { ...steps[0], txHash: hash, status: "completed" };
      syncState({
        confirmed: true,
        txHash: hash,
        blockNumber: receipt?.blockNumber ?? null,
      });

      setShowDomainSuccess(true);
      setDomainSearch("");
      setDomainAvailable(false);
      setDomainTaken(false);
      showMessage(`Registered ${validation.fullDomain} on Arc Mainnet.`);
      void syncProtocolSnapshot(wallet, { force: true });
      void loadOnChainHistory(wallet);
    } catch (error) {
      if (isUserWalletRejection(error)) {
        setTxLifecycle(null);
        showMessage("Domain registration rejected in wallet.");
      } else {
        const msg = decodeNexioError(error);
        steps[0] = { ...steps[0], status: "failed" };
        syncState({ failed: true, errorMessage: msg });
        showMessage(msg);
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const handleResolveAddress = async (customAddr?: string) => {
    const rawTarget = (customAddr ?? resolveAddressInput).trim();
    if (!rawTarget) {
      showMessage("Enter an Arc Mainnet wallet address.");
      return;
    }
    if (!ethers.isAddress(rawTarget)) {
      resolveAddressGenRef.current += 1;
      setResolvedDomainResult(null);
      setResolvedOwnerAddress(rawTarget);
      setResolvedAddressError(
        "Invalid EVM wallet address format (expected 0x followed by 40 hex characters)."
      );
      return;
    }

    const checksummed = ethers.getAddress(rawTarget);
    const gen = ++resolveAddressGenRef.current;
    setIsResolvingAddress(true);
    setResolvedAddressError(null);
    setResolvedDomainResult(null);
    setResolvedOwnerAddress(checksummed);

    try {
      const domain = await resolveAddressToDomain(checksummed);
      if (gen !== resolveAddressGenRef.current) return;

      if (domain && domain.trim().length > 0) {
        setResolvedDomainResult(domain);
        setResolvedAddressError(null);
        showMessage(`Resolved: ${domain}.nex`);
      } else {
        setResolvedDomainResult(null);
        setResolvedAddressError(
          `No .nex domain registered for this address on ${ARC_NETWORK_LABEL}.`
        );
      }
    } catch (error) {
      if (gen !== resolveAddressGenRef.current) return;
      setResolvedDomainResult(null);
      setResolvedAddressError(
        isRpcTransportError(error)
          ? "Arc Mainnet RPC is temporarily unreachable. Please retry in a moment."
          : decodeNexioError(error)
      );
    } finally {
      if (gen === resolveAddressGenRef.current) {
        setIsResolvingAddress(false);
      }
    }
  };

  const handlePasteResolveAddress = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const trimmed = text.trim();
          setResolveAddressInput(trimmed);
          void handleResolveAddress(trimmed);
        }
      }
    } catch {
      showMessage("Clipboard permission denied.");
    }
  };

  const recoverBoundDomain = async () => {
    if (!wallet) {
      showMessage("Connect wallet first.");
      return;
    }
    setIsRecoveringDomain(true);
    try {
      invalidateAnsCache(wallet);
      const bound = await resolveAddressToDomain(wallet);
      if (!bound) {
        setRegisteredDomain("");
        setPassVerified(false);
        try {
          window.localStorage.removeItem(walletStorageKey("nexio_domain_name", wallet));
        } catch {
          // ignore
        }
        showMessage("No .nex domain is bound to this address on Arc Mainnet.");
        return;
      }

      const owner = await resolveDomainToAddress(bound);
      if (!owner || owner.toLowerCase() !== wallet.toLowerCase()) {
        setRegisteredDomain("");
        setPassVerified(false);
        showMessage("Forward ANS resolution did not match this wallet.");
        return;
      }

      const full = `${bound}.nex`;
      setRegisteredDomain(full);
      setPassVerified(true);
      try {
        window.localStorage.setItem(walletStorageKey("nexio_domain_name", wallet), full);
      } catch {
        // ignore
      }
      showMessage(`Recovered ${full} from Arc Name Service.`);
    } catch (error) {
      showMessage(
        isRpcTransportError(error)
          ? "Arc Mainnet RPC is temporarily unreachable. Retry recovery shortly."
          : decodeNexioError(error)
      );
    } finally {
      setIsRecoveringDomain(false);
    }
  };

  // ============================================================================
  // Module 7: Nexio Pass PNG Export & Live History
  // ============================================================================
  const handleSavePassPng = async () => {
    if (!verifiedIdentityDomain || !wallet || isExportingPass) return;
    setIsExportingPass(true);
    try {
      await exportNexioPassPng({
        domain: verifiedIdentityDomain,
        wallet,
        streak,
        tierName: unlockedTier ? unlockedTier.name : undefined,
        chainId: ARC_CHAIN_ID,
        networkLabel: "ARC MAINNET",
        contractAddress: ANS_CONTRACT_ADDRESS,
      });
      showMessage("Nexio Pass PNG exported.");
    } catch {
      showMessage("Could not export Nexio Pass PNG.");
    } finally {
      setIsExportingPass(false);
    }
  };

  const shareOnX = () => {
    const appUrl = window.location.origin;
    const text = encodeURIComponent(
      `Verified my on-chain ${verifiedIdentityDomain || ".nex"} identity on @Nexio_0 (${ARC_NETWORK_LABEL} · 5042).\nEnterprise USDC & EURC banking, automated yield vaults, and permanent ANS naming.\n\n${appUrl}`
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank", "noopener,noreferrer");
  };

  // Header Explorer Contextual Target
  const headerExplorerTarget = useMemo(() => {
    switch (selectedTab) {
      case "portfolio":
        return { href: `${ARC_EXPLORER}/address/${USDC_VAULT_ADDRESS}`, label: "USDC Vault" };
      case "swap":
        return { href: `${ARC_EXPLORER}/address/${WUSDC_ADDRESS}`, label: "USDC Token" };
      case "lp":
        return { href: `${ARC_EXPLORER}/address/${ROUTER_ADDRESS}`, label: "V2 Router" };
      case "dailygm":
        return { href: `${ARC_EXPLORER}/address/${DAILY_GM_ADDRESS}`, label: "Daily GM" };
      case "domains":
      case "trustpass":
        return { href: `${ARC_EXPLORER}/address/${ANS_CONTRACT_ADDRESS}`, label: "Name Service" };
      case "history":
        return {
          href: wallet ? `${ARC_EXPLORER}/address/${wallet}` : ARC_EXPLORER,
          label: wallet ? "Wallet Explorer" : "Arc Explorer",
        };
      case "docs":
      default:
        return { href: ARC_EXPLORER, label: "Arc Explorer" };
    }
  }, [selectedTab, wallet]);

  const singleRecipientPreview =
    !isBatchMode && rawRecipientList.length === 1 ? resolvedRecipients[0] : null;

  return (
    <div
      className={`min-h-screen relative font-sans flex flex-col selection:bg-sky-500/25 dark:selection:bg-cyan-500/30 transition-colors duration-200 overflow-x-hidden ${tc.bgApp}`}
    >
      {/* Mobile-Safe Notification Toast */}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className="nx-enter fixed top-5 left-1/2 z-[110] -translate-x-1/2 w-max max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-300 dark:border-cyan-400/30 bg-white/98 dark:bg-[#07152B]/95 backdrop-blur-xl px-4 py-3 sm:px-6 sm:py-3.5 shadow-[0_16px_40px_rgba(15,23,42,0.18)] dark:shadow-[0_16px_40px_rgba(2,6,23,0.45)]"
        >
          <div className="font-bold text-xs sm:text-sm tracking-tight text-slate-900 dark:text-white text-center break-words">
            {message}
          </div>
        </div>
      )}

      {/* Non-Blocking Institutional Explorer Receipt Drawer */}
      <ExplorerReceiptDrawer
        state={!receiptDrawerDismissed ? txLifecycle : null}
        onDismiss={() => setReceiptDrawerDismissed(true)}
      />

      {/* Domain Registration Confirmation Modal */}
      {showDomainSuccess && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="domain-success-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
        >
          <div
            className={`nx-enter w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[2rem] border p-6 sm:p-8 flex flex-col items-center text-center relative ${tc.modalBg}`}
          >
            <button
              type="button"
              onClick={() => setShowDomainSuccess(false)}
              aria-label="Close modal"
              className="absolute top-5 right-5 rounded-full p-2 text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition border border-slate-300 dark:border-white/10"
            >
              <CloseIcon size={16} />
            </button>

            <div className="mb-4">
              <OnChainSeal status="verified" size={64} />
            </div>

            <h2
              id="domain-success-title"
              className={`text-2xl sm:text-3xl font-black tracking-tight mb-2 ${tc.textMain}`}
            >
              Domain Registered
            </h2>
            <p className={`text-sm font-medium mb-6 ${tc.textMuted}`}>
              Permanently bound to your wallet on{" "}
              <span className="font-bold text-sky-800 dark:text-cyan-300">{ARC_NETWORK_LABEL}</span>.
            </p>

            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-600/35 dark:border-emerald-500/35 bg-emerald-100/80 dark:bg-emerald-500/12 px-4 py-1.5 mb-6">
              <ShieldCheckIcon size={15} className="text-emerald-800 dark:text-emerald-400" />
              <span className="text-xs font-black text-emerald-900 dark:text-emerald-300 tracking-wider uppercase">
                1 Wallet = 1 Permanent .nex Name
              </span>
            </div>

            <div
              className={`w-full rounded-2xl border p-4 flex justify-between items-center mb-3 ${tc.subPanelBg}`}
            >
              <span className={`text-lg sm:text-xl font-black truncate ${tc.textMain}`}>
                {verifiedIdentityDomain}
              </span>
              <span className="rounded-full bg-sky-100 border border-sky-300 dark:border-transparent dark:bg-cyan-500/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-sky-900 dark:text-cyan-300">
                Bound
              </span>
            </div>

            {registrationHash && (
              <div
                className={`w-full rounded-2xl border p-4 flex justify-between items-center gap-2 mb-6 ${tc.subPanelBg}`}
              >
                <span className={`nx-num text-xs font-mono font-bold truncate ${tc.textMuted}`}>
                  Tx: {registrationHash.slice(0, 8)}...{registrationHash.slice(-6)}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <CopyButton value={registrationHash} label="Copy" size="xs" />
                  <a
                    href={`${ARC_EXPLORER}/tx/${registrationHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-sky-600/35 dark:border-cyan-500/35 bg-sky-100 dark:bg-cyan-500/12 px-2.5 py-1 text-xs font-bold text-sky-900 dark:text-cyan-300 hover:bg-sky-200/70 dark:hover:bg-cyan-500/20 transition"
                  >
                    <span>Explorer</span>
                    <ExternalLinkIcon size={12} />
                  </a>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setShowDomainSuccess(false);
                handleTabSwitch("trustpass");
              }}
              className="nx-btn-primary w-full rounded-2xl py-3.5 text-sm font-black"
            >
              Open Verified Nexio Pass
            </button>
          </div>
        </div>
      )}

      {/* Receive Modal (Pure Client-Side SVG QR + Consecutive Tier Badges) */}
      {showReceiveModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="receive-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
        >
          <div
            className={`nx-enter w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[2rem] border p-6 sm:p-8 ${tc.modalBg}`}
          >
            <div className="flex items-center justify-between mb-5">
              <h3
                id="receive-modal-title"
                className={`text-xl sm:text-2xl font-black tracking-tight ${tc.textMain}`}
              >
                Receive Funds
              </h3>
              <button
                type="button"
                onClick={() => setShowReceiveModal(false)}
                aria-label="Close receive modal"
                className="rounded-full p-2 text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 transition"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            {(verifiedIdentityDomain || streak >= 30) && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 mb-5">
                {verifiedIdentityDomain && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-600/35 dark:border-cyan-500/35 bg-sky-100 dark:bg-cyan-500/12 px-2.5 py-1 text-[11px] font-extrabold text-sky-900 dark:text-cyan-300">
                    <ShieldCheckIcon size={13} />
                    <span>{verifiedIdentityDomain}</span>
                  </span>
                )}
                {streak >= 30 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/35 dark:border-emerald-500/35 bg-emerald-100 dark:bg-emerald-500/12 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                    Verified Active Sender
                  </span>
                )}
                {streak >= 180 && (
                  <span className="inline-flex items-center rounded-full border border-amber-600/40 dark:border-amber-500/40 bg-amber-100 dark:bg-amber-500/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                    Tier 3 VIP
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-col items-center justify-center space-y-5">
              <div className="rounded-3xl bg-white p-3.5 shadow-md border border-slate-300">
                <QrCodeSvg
                  value={wallet}
                  size={192}
                  ariaLabel={`Arc Mainnet wallet QR code for ${wallet}`}
                  className="rounded-xl"
                />
              </div>

              <div className="text-center w-full">
                <p
                  className={`text-[11px] font-extrabold uppercase tracking-widest mb-2 ${tc.textMuted}`}
                >
                  Arc Mainnet Address (USDC & EURC)
                </p>
                <div
                  className={`nx-num text-xs font-mono font-bold break-all p-3.5 rounded-2xl border ${tc.subPanelBg} text-sky-900 dark:text-cyan-300`}
                >
                  {wallet}
                </div>
              </div>

              <CopyButton
                value={wallet}
                label="Copy Wallet Address"
                copiedLabel="Address Copied"
                variant="solid"
                size="md"
                className="w-full py-3.5"
              />
            </div>
          </div>
        </div>
      )}

      {/* Request Payment Link Modal */}
      {showRequestModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="request-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
        >
          <div
            className={`nx-enter w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[2rem] border p-6 sm:p-8 ${tc.modalBg}`}
          >
            <div className="flex items-center justify-between mb-6">
              <h3
                id="request-modal-title"
                className={`text-xl sm:text-2xl font-black tracking-tight ${tc.textMain}`}
              >
                Request Payment
              </h3>
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                aria-label="Close request modal"
                className="rounded-full p-2 text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 transition"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label
                  className={`text-[11px] font-extrabold mb-2 block uppercase tracking-widest ${tc.textMuted}`}
                >
                  Asset to Receive
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setRequestAsset("USDC");
                      setPaymentLink("");
                    }}
                    className={`rounded-2xl py-3 border-2 font-black tracking-wide transition-all ${
                      requestAsset === "USDC"
                        ? "border-sky-700 bg-sky-100/80 text-sky-900 dark:border-cyan-500 dark:bg-cyan-500/12 dark:text-cyan-300"
                        : "border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-black/40 text-slate-700 dark:text-slate-400"
                    }`}
                  >
                    USDC
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestAsset("EURC");
                      setPaymentLink("");
                    }}
                    className={`rounded-2xl py-3 border-2 font-black tracking-wide transition-all ${
                      requestAsset === "EURC"
                        ? "border-emerald-700 bg-emerald-100/80 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-500/12 dark:text-emerald-300"
                        : "border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-black/40 text-slate-700 dark:text-slate-400"
                    }`}
                  >
                    EURC
                  </button>
                </div>
              </div>

              <div>
                <label
                  className={`text-[11px] font-extrabold mb-2 flex justify-between uppercase tracking-widest ${tc.textMuted}`}
                >
                  <span>Requested Amount</span>
                  <span className="nx-num font-mono">
                    Bal: {requestAsset === "USDC" ? usdcBalance : eurcBalance}
                  </span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={requestAmount}
                  onChange={(e) => {
                    setRequestAmount(sanitizeDecimalDraft(e.target.value));
                    setPaymentLink("");
                  }}
                  placeholder="0.00"
                  className={`nx-num w-full rounded-2xl border px-5 py-4 focus:outline-none transition text-2xl font-black ${tc.inputBg}`}
                />
              </div>

              {!paymentLink ? (
                <button
                  type="button"
                  onClick={generatePaymentLink}
                  disabled={!requestAmount.trim()}
                  className="nx-btn-primary w-full rounded-2xl py-4 font-black text-base"
                >
                  Generate Payment Link
                </button>
              ) : (
                <div className="nx-enter mt-4 p-4 rounded-3xl border border-sky-600/35 dark:border-cyan-500/35 bg-sky-50 dark:bg-cyan-500/10 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-300 shrink-0">
                      <QrCodeSvg
                        value={paymentLink}
                        size={96}
                        ariaLabel="Payment request QR code"
                        className="rounded-lg"
                      />
                    </div>
                    <div className="flex flex-col w-full min-w-0 text-center sm:text-left">
                      <div className="text-[11px] font-extrabold text-sky-900 dark:text-cyan-300 uppercase tracking-widest mb-1">
                        Shareable Arc Payment URI
                      </div>
                      <div className="nx-num text-xs font-mono break-all text-slate-900 dark:text-slate-200 bg-white dark:bg-black/45 p-2.5 rounded-xl border border-slate-300 dark:border-white/10">
                        {paymentLink}
                      </div>
                    </div>
                  </div>

                  <CopyButton
                    value={paymentLink}
                    label="Copy Payment Link"
                    copiedLabel="Link Copied"
                    variant="solid"
                    size="md"
                    className="w-full py-3"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Payment Modal */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-send-title"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
        >
          <div
            className={`nx-enter w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[2rem] border p-6 sm:p-8 ${tc.modalBg}`}
          >
            <div className="flex flex-col items-center text-center mb-5">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-600/35 dark:border-cyan-500/35 bg-sky-100 dark:bg-cyan-500/12 text-sky-800 dark:text-cyan-300">
                <ShieldCheckIcon size={24} />
              </div>
              <h3 id="confirm-send-title" className={`text-xl font-black mb-1.5 ${tc.textMain}`}>
                Confirm {isBatchMode ? "Batch Transfer" : "Transfer"}
              </h3>
              <p className={`text-xs sm:text-sm ${tc.textMuted}`}>
                Verify the resolved Arc Mainnet recipient details below before signing.
              </p>
            </div>

            <div className={`rounded-2xl p-4 mb-6 border space-y-3 ${tc.subPanelBg}`}>
              <div className="flex justify-between items-center">
                <span className={`text-xs font-extrabold uppercase tracking-wider ${tc.textMuted}`}>
                  Total Amount
                </span>
                <span className={`nx-num font-black text-lg ${tc.textMain}`}>
                  {(() => {
                    const count = Math.max(
                      1,
                      resolvedRecipients.length || rawRecipientList.length
                    );
                    const per = parseAmount(sendAmount, sendDecimals);
                    const total = per ? per * BigInt(count) : null;
                    return `${total ? formatPretty(total, sendDecimals, 6) : sendAmount} ${sendAsset}`;
                  })()}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-300 dark:border-white/10">
                <div
                  className={`text-[11px] font-extrabold uppercase tracking-wider mb-2 ${tc.textMuted}`}
                >
                  {isBatchMode
                    ? `Resolved Recipients (${resolvedRecipients.length})`
                    : "Resolved Recipient"}
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {resolvedRecipients.map((r, idx) => (
                    <div
                      key={`${r.input}-${idx}`}
                      className="nx-num flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-black/35 px-2.5 py-1.5 text-xs border border-slate-300 dark:border-white/5"
                    >
                      <span className="font-bold truncate text-slate-900 dark:text-slate-200">
                        {r.domain ?? `${r.address?.slice(0, 8)}...${r.address?.slice(-6)}`}
                      </span>
                      <span className="font-mono text-[11px] text-sky-900 dark:text-cyan-300 shrink-0">
                        {r.address ? `${r.address.slice(0, 6)}...${r.address.slice(-4)}` : r.input}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {sendMemo.trim() && (
                <div className="flex justify-between items-center gap-3 pt-2 border-t border-slate-300 dark:border-white/10">
                  <span
                    className={`text-xs font-extrabold uppercase tracking-wider ${tc.textMuted}`}
                  >
                    Memo
                  </span>
                  <span className={`text-xs font-semibold truncate ${tc.textMain}`}>
                    {sendMemo.trim()}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSending}
                className="flex-1 rounded-xl py-3 font-bold transition border border-slate-300 dark:border-white/15 bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeSend()}
                disabled={chainLocked || isSending}
                className="nx-btn-primary inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-black text-sm"
              >
                {isSending ? (
                  <>
                    <RadarSpinner size={15} />
                    <span>Sending...</span>
                  </>
                ) : (
                  "Confirm & Sign"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Modal (Single & EIP-5792 / Sequential Multi-Recipient Batch) */}
      {showSendModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
        >
          <div
            className={`nx-enter w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[2rem] border p-6 sm:p-8 ${tc.modalBg}`}
          >
            <div className="flex items-center justify-between mb-5">
              <h3
                id="send-modal-title"
                className={`text-xl sm:text-2xl font-black tracking-tight ${tc.textMain}`}
              >
                Send Asset
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (isSending) return;
                  setIsScanning(false);
                  setShowSendModal(false);
                }}
                aria-label="Close send modal"
                className="rounded-full p-2 text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 transition"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            {/* Batch Mode Toggle Bar */}
            <div
              className={`flex items-center justify-between p-3.5 rounded-2xl mb-4 border ${tc.subPanelBg}`}
            >
              <div className="flex flex-col gap-0.5">
                <span className={`text-sm font-extrabold ${tc.textMain}`}>
                  Multi-Recipient Batch Mode
                </span>
                <span className="nx-num text-[11px] text-sky-800 dark:text-cyan-300 font-bold">
                  {gmProfile.batchLimit === null
                    ? "Unlimited recipients (Tier 3 VIP)"
                    : `Up to ${gmProfile.batchLimit} recipients (${gmProfile.name})`}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  {streak >= 30 && (
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                      Verified Active Sender
                    </span>
                  )}
                  {streak >= 180 && (
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                      VIP
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isBatchMode}
                aria-label="Toggle batch transfer mode"
                disabled={isSending}
                onClick={() => {
                  const nextBatch = !isBatchMode;
                  setIsBatchMode(nextBatch);
                  setResolvedRecipients([]);
                  setBatchRecipientStatuses([]);
                  setFailedBatchTargets([]);
                  setBatchExecutionMode("idle");
                  if (nextBatch && sendAsset === "USDC" && sendAmount.includes(".")) {
                    const [w, f = ""] = sendAmount.split(".");
                    if (f.length > 6) setSendAmount(`${w}.${f.slice(0, 6)}`);
                  }
                }}
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  isBatchMode ? "bg-sky-700 dark:bg-cyan-500" : "bg-slate-400 dark:bg-slate-700"
                }`}
              >
                <span
                  className={`block w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                    isBatchMode ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {isBatchMode && (
              <BatchCapacityRail
                recipientCount={rawRecipientList.length}
                batchLimit={gmProfile.batchLimit}
                tierName={gmProfile.name}
                recipientStatuses={
                  batchRecipientStatuses.length > 0 ? batchRecipientStatuses : undefined
                }
                executionMode={batchExecutionMode}
                className="mb-4"
              />
            )}

            {failedBatchTargets.length > 0 && !isSending && (
              <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border border-amber-600/40 bg-amber-100/85 dark:bg-amber-500/10 px-3.5 py-2.5 text-xs font-bold text-amber-950 dark:text-amber-200">
                <span>{failedBatchTargets.length} unconfirmed recipient(s) queued</span>
                <button
                  type="button"
                  onClick={() => void executeSend(failedBatchTargets)}
                  className="rounded-xl bg-amber-600 dark:bg-amber-500 px-3 py-1.5 text-[11px] font-black text-white dark:text-slate-950 hover:bg-amber-700 dark:hover:bg-amber-400 transition active:scale-95 shrink-0"
                >
                  Retry Remaining
                </button>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label
                  className={`text-[11px] font-extrabold mb-2 flex justify-between items-center uppercase tracking-wider ${tc.textMuted}`}
                >
                  <span className="flex items-center gap-2">
                    <span>{isBatchMode ? "Recipients (0x or .nex)" : "Recipient (0x or .nex)"}</span>
                    <button
                      type="button"
                      onClick={() => setIsScanning((prev) => !prev)}
                      className="inline-flex items-center gap-1 normal-case tracking-normal text-[11px] font-extrabold px-2.5 py-1 rounded-lg border border-sky-600/35 dark:border-cyan-500/35 bg-sky-100 dark:bg-cyan-500/10 text-sky-900 dark:text-cyan-300 hover:bg-sky-200/70 dark:hover:bg-cyan-500/20 transition"
                    >
                      <QrCodeIcon size={13} />
                      <span>{isScanning ? "Close QR" : "Scan QR"}</span>
                    </button>
                  </span>
                  {isBatchMode && (
                    <span className="text-[10px] text-sky-800 dark:text-cyan-300">
                      Comma-separated
                    </span>
                  )}
                </label>

                {isScanning && (
                  <div className="mb-3 overflow-hidden rounded-2xl border border-sky-600/35 dark:border-cyan-500/35 bg-black">
                    <QrScanner
                      onScan={(detected: IDetectedBarcode[]) => {
                        const text = detected?.[0]?.rawValue;
                        if (text) applyScannedRecipient(text);
                      }}
                      onError={(err: unknown) => {
                        const scanErr = err as { kind?: string; message?: string };
                        if (scanErr?.kind === "permission-denied") {
                          showMessage("Camera permission denied.");
                        } else if (scanErr?.kind === "no-camera") {
                          showMessage("No camera detected on this device.");
                        } else if (scanErr?.message) {
                          showMessage(scanErr.message);
                        }
                      }}
                      constraints={{ facingMode: "environment" }}
                      formats={["qr_code"]}
                      sound={false}
                      styles={{ container: { width: "100%" } }}
                    />
                  </div>
                )}

                {isBatchMode ? (
                  <div>
                    <textarea
                      value={sendAddress}
                      onChange={(e) => {
                        setSendAddress(e.target.value);
                        if (!e.target.value.trim()) {
                          setResolvedRecipients([]);
                          setIsResolvingRecipient(false);
                        }
                      }}
                      placeholder="0x19c2..., jubayir.nex, 0x8a4d..."
                      className={`w-full rounded-2xl border px-4 py-3 focus:outline-none transition font-mono text-xs sm:text-sm resize-none h-24 ${tc.inputBg}`}
                    />
                    {rawRecipientList.length > 0 && (
                      <div className="mt-1.5 text-[11px] font-bold">
                        {isResolvingRecipient ? (
                          <span className="inline-flex items-center gap-1.5 text-sky-800 dark:text-cyan-300">
                            <RadarSpinner size={12} />
                            <span>Resolving {rawRecipientList.length} recipients on ANS...</span>
                          </span>
                        ) : (() => {
                          const bad = resolvedRecipients.find((r) => !r.valid);
                          if (bad) {
                            return (
                              <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                                <AlertTriangleIcon size={13} />
                                <span>
                                  {bad.input}: {bad.error ?? "Invalid recipient"}
                                </span>
                              </span>
                            );
                          }
                          const domainMatches = resolvedRecipients.filter((r) => r.domain).length;
                          if (resolvedRecipients.length > 0) {
                            return (
                              <span className="inline-flex items-center gap-1 text-emerald-800 dark:text-emerald-400">
                                <ShieldCheckIcon size={13} />
                                <span>
                                  {resolvedRecipients.length} verified recipient(s)
                                  {domainMatches > 0 ? ` · ${domainMatches} .nex bound` : ""}
                                </span>
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={sendAddress}
                      onChange={(e) => {
                        setSendAddress(e.target.value);
                        if (!e.target.value.trim()) {
                          setResolvedRecipients([]);
                          setIsResolvingRecipient(false);
                        }
                      }}
                      placeholder="0x... or jubayir.nex"
                      className={`w-full rounded-2xl border px-4 py-3.5 focus:outline-none transition font-mono text-sm ${tc.inputBg}`}
                    />
                    <DomainResolutionBadge
                      resolving={isResolvingRecipient}
                      resolvedDomain={
                        singleRecipientPreview?.valid && singleRecipientPreview.kind === "address"
                          ? singleRecipientPreview.domain
                          : null
                      }
                      resolvedAddress={
                        singleRecipientPreview?.valid && singleRecipientPreview.kind === "domain"
                          ? singleRecipientPreview.address
                          : null
                      }
                      error={
                        singleRecipientPreview && !singleRecipientPreview.valid && sendAddress.trim()
                          ? singleRecipientPreview.error ?? "Invalid recipient"
                          : null
                      }
                    />
                  </div>
                )}
              </div>

              <div>
                <label
                  className={`text-[11px] font-extrabold mb-2 block uppercase tracking-wider ${tc.textMuted}`}
                >
                  Select Asset
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSendAsset("USDC")}
                    className={`rounded-2xl py-2.5 border-2 font-black tracking-wide transition-all ${
                      sendAsset === "USDC"
                        ? "border-sky-700 bg-sky-100/80 text-sky-900 dark:border-cyan-500 dark:bg-cyan-500/12 dark:text-cyan-300"
                        : "border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-black/40 text-slate-700 dark:text-slate-400"
                    }`}
                  >
                    USDC
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSendAsset("EURC");
                      if (sendAmount.includes(".")) {
                        const [w, f = ""] = sendAmount.split(".");
                        if (f.length > 6) setSendAmount(`${w}.${f.slice(0, 6)}`);
                      }
                    }}
                    className={`rounded-2xl py-2.5 border-2 font-black tracking-wide transition-all ${
                      sendAsset === "EURC"
                        ? "border-emerald-700 bg-emerald-100/80 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-500/12 dark:text-emerald-300"
                        : "border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-black/40 text-slate-700 dark:text-slate-400"
                    }`}
                  >
                    EURC
                  </button>
                </div>
              </div>

              <div>
                <label
                  className={`text-[11px] font-extrabold mb-2 flex justify-between items-center uppercase tracking-wider ${tc.textMuted}`}
                >
                  <span>Amount {isBatchMode ? "(Per Recipient)" : ""}</span>
                  <span className="nx-num flex items-center gap-2 font-mono">
                    <span>Bal: {sendAsset === "USDC" ? usdcBalance : eurcBalance}</span>
                    <button type="button" onClick={fillSendMax} className="nx-max-pill">
                      Max
                    </button>
                  </span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(sanitizeDecimalDraft(e.target.value))}
                  placeholder="0.00"
                  className={`nx-num w-full rounded-2xl border px-4 py-3.5 focus:outline-none transition text-2xl font-black ${tc.inputBg}`}
                />
                <p className={`nx-num mt-1 text-[11px] font-semibold ${tc.textMuted}`}>
                  {sendAsset === "USDC"
                    ? `Max reserves ${(0.005 * recipientCountForGas).toFixed(3)} USDC for Arc Mainnet gas.`
                    : "Arc Mainnet gas is paid in native USDC."}
                </p>
              </div>

              <div>
                <label
                  className={`text-[11px] font-extrabold mb-1.5 block uppercase tracking-wider ${tc.textMuted}`}
                >
                  Memo (Optional)
                </label>
                <input
                  type="text"
                  value={sendMemo}
                  onChange={(e) => setSendMemo(e.target.value)}
                  placeholder="Invoice reference or note"
                  className={`w-full rounded-2xl border px-4 py-3 focus:outline-none transition text-sm ${tc.inputBg}`}
                />
              </div>

              {(() => {
                const overBatchCap =
                  isBatchMode &&
                  gmProfile.batchLimit !== null &&
                  rawRecipientList.length > gmProfile.batchLimit;
                return (
                  <button
                    type="button"
                    onClick={() => void handleSendClick()}
                    disabled={
                      chainLocked ||
                      isSending ||
                      isResolvingRecipient ||
                      !sendAddress.trim() ||
                      !sendAmount.trim() ||
                      overBatchCap
                    }
                    className={`mt-1 inline-flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-black ${
                      overBatchCap
                        ? "nx-btn-guard-block"
                        : sendAsset === "EURC"
                          ? "nx-btn-emerald"
                          : "nx-btn-primary"
                    }`}
                  >
                    {isSending ? (
                      <>
                        <RadarSpinner size={16} />
                        <span>Executing Transfer...</span>
                      </>
                    ) : isResolvingRecipient ? (
                      <>
                        <RadarSpinner size={16} />
                        <span>Verifying Recipient...</span>
                      </>
                    ) : chainLocked ? (
                      "Wrong Network (Switch to 5042)"
                    ) : overBatchCap ? (
                      `Exceeds ${gmProfile.name} Batch Limit (${gmProfile.batchLimit})`
                    ) : (
                      `Review ${sendAsset} Transfer`
                    )}
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Slide-Over Navigation Drawer */}
      <div
        aria-hidden={!isSidebarOpen}
        className={`fixed inset-0 z-[100] transition-opacity duration-200 ${
          isSidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div
          className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
        <aside
          aria-label="Navigation menu"
          className={`absolute top-0 right-0 w-72 sm:w-80 h-full border-l p-5 flex flex-col gap-1.5 transform transition-transform duration-200 shadow-2xl overflow-y-auto ${tc.drawerBg} ${
            isSidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-300 dark:border-white/10">
            <span className={`text-lg font-black ${tc.textMain}`}>Navigation</span>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              aria-label="Close menu"
              className="p-2 rounded-full transition bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:text-slate-200"
            >
              <CloseIcon size={16} />
            </button>
          </div>

          {ALL_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTabSwitch(item.id)}
              className={`w-full rounded-xl px-4 py-3 text-left text-sm flex justify-between items-center font-extrabold tracking-tight transition-all border ${
                selectedTab === item.id ? tc.sidebarActive : tc.sidebarInactive
              }`}
            >
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md font-black tracking-widest ${
                    selectedTab === item.id
                      ? "bg-white/20 text-white dark:bg-cyan-500/20 dark:text-cyan-200"
                      : "bg-sky-100 text-sky-900 dark:bg-cyan-500/15 dark:text-cyan-300"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          ))}

          <div className="mt-auto pt-5 border-t border-slate-300 dark:border-white/10 space-y-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-full rounded-xl px-4 py-3 text-sm font-extrabold transition border flex items-center justify-center gap-2 border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:text-slate-100"
            >
              <span className="hidden dark:inline-flex items-center gap-2">
                <SunIcon size={16} className="text-amber-400" />
                <span>Switch to Light Mode</span>
              </span>
              <span className="inline-flex dark:hidden items-center gap-2">
                <MoonIcon size={16} className="text-sky-800" />
                <span>Switch to Dark Mode</span>
              </span>
            </button>

            {wallet && (
              <button
                type="button"
                onClick={() => {
                  setIsSidebarOpen(false);
                  disconnectWallet();
                }}
                className="w-full rounded-xl px-4 py-3 text-sm font-extrabold transition border border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-600 hover:text-white dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500 dark:hover:text-white"
              >
                Disconnect Wallet
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* Top Sticky Institutional Header (WCAG AAA Light & Dark) */}
      <header className="sticky top-0 z-40 border-b border-slate-300 bg-white/95 dark:border-white/10 dark:bg-[#050C1A]/85 backdrop-blur-2xl">
        {chainLocked && (
          <div className="flex flex-col gap-2.5 border-b border-amber-500/40 bg-amber-400 px-4 py-2.5 text-slate-950 sm:flex-row sm:items-center sm:justify-between md:px-8">
            <p className="nx-num text-xs sm:text-sm font-black tracking-tight flex items-center gap-2">
              <AlertTriangleIcon size={16} />
              <span>
                Wrong network (Chain {chainId}). Transactions remain locked until Arc Mainnet (5042).
              </span>
            </p>
            <button
              type="button"
              onClick={() => void switchToArcMainnet()}
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-slate-800 active:scale-95 shrink-0"
            >
              Switch to Arc Mainnet
            </button>
          </div>
        )}

        <div className="mx-auto flex max-w-[1440px] items-center gap-2.5 px-4 py-3 md:px-6">
          <button
            type="button"
            onClick={() => handleTabSwitch("overview")}
            className="flex items-center gap-2.5 text-left shrink-0 focus-visible:outline-2 focus-visible:outline-sky-600 dark:focus-visible:outline-cyan-400 rounded-xl"
          >
            <Image
              src={nexioLogo}
              width={36}
              height={36}
              sizes="36px"
              preload
              alt="Nexio Protocol"
              style={{ width: 36, height: 36 }}
              className="h-9 w-9 rounded-xl object-contain border border-slate-300 dark:border-white/10 bg-[#050B16]"
            />
            <div className="min-w-0">
              <div
                className={`text-base sm:text-lg font-black tracking-tight leading-none ${tc.textMain}`}
              >
                Nexio
              </div>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] mt-0.5 text-slate-600 dark:text-slate-400">
                Arc Mainnet
              </div>
            </div>
          </button>

          {/* Full 9-View Desktop Navigation Bar */}
          <nav
            aria-label="Primary sections"
            className="ml-2 hidden lg:flex items-center gap-0.5 overflow-x-auto rounded-full border border-slate-300 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.03] p-1"
          >
            {ALL_TABS.map((tab) => {
              const active = selectedTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => handleTabSwitch(tab.id)}
                  className={`rounded-full px-2.5 py-1.5 text-[11px] tracking-tight whitespace-nowrap transition-all border ${
                    active
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm font-extrabold dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-400/30"
                      : "border-transparent text-slate-800 hover:text-slate-950 hover:bg-slate-200/70 font-semibold dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/[0.06]"
                  }`}
                >
                  {tab.shortLabel}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            {txLifecycle && (
              <TxHeaderStatusPill
                state={txLifecycle}
                onClick={() => setReceiptDrawerDismissed(false)}
              />
            )}

            {/* Top-Right Network & Pure Spot Ticker Pill */}
            <div
              className={`nx-num hidden xl:flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider ${
                !wallet || isArcMainnet
                  ? "bg-slate-100 border-slate-300 text-slate-900 dark:bg-white/[0.05] dark:border-white/10 dark:text-slate-200"
                  : "bg-amber-100 border-amber-400 text-amber-950 dark:bg-amber-500/10 dark:border-amber-500/40 dark:text-amber-200"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  !wallet || isArcMainnet ? "bg-emerald-600 dark:bg-emerald-400" : "bg-amber-600"
                }`}
              />
              <span className="text-sky-800 dark:text-cyan-300">
                {!wallet || isArcMainnet ? "ARC · 5042" : `Chain ${chainId ?? "—"}`}
              </span>
              <span className="text-slate-700 dark:text-slate-400">
                {networkLatency > 0 ? `${networkLatency}ms` : "RPC"}
              </span>
              <span className="text-emerald-800 dark:text-emerald-300">
                1 EURC = {eurcRateLabel === null ? "…" : `$${eurcRateLabel}`}
              </span>
            </div>

            {/* Hydration-Safe Dual-Icon Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-white/12 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/12 transition active:scale-95"
            >
              <SunIcon size={16} className="hidden dark:block text-amber-400" />
              <MoonIcon size={16} className="block dark:hidden text-sky-800" />
            </button>

            {wallet ? (
              <button
                type="button"
                onClick={() => handleTabSwitch(verifiedIdentityDomain ? "trustpass" : "domains")}
                title={wallet}
                className="nx-num inline-flex max-w-[175px] items-center gap-1.5 truncate rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-900 hover:border-sky-600 dark:border-white/12 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:border-cyan-400/40 transition"
              >
                {verifiedIdentityDomain && (
                  <ShieldCheckIcon
                    size={13}
                    className="shrink-0 text-emerald-700 dark:text-emerald-400"
                  />
                )}
                <span className="truncate">
                  {verifiedIdentityDomain || `${wallet.slice(0, 6)}...${wallet.slice(-4)}`}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void connectWallet()}
                disabled={isConnecting}
                className="nx-btn-primary inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-black"
              >
                {isConnecting ? (
                  <>
                    <RadarSpinner size={13} />
                    <span>Connecting...</span>
                  </>
                ) : (
                  "Connect Wallet"
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 transition active:scale-95 lg:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                width="17"
                height="17"
                stroke="currentColor"
                strokeWidth="2.2"
                fill="none"
                aria-hidden="true"
              >
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </button>

            {wallet && (
              <button
                type="button"
                onClick={disconnectWallet}
                title="Disconnect wallet"
                aria-label="Disconnect wallet"
                className="hidden lg:inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-900 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 dark:bg-white/[0.06] dark:border-white/12 dark:text-slate-100 dark:hover:bg-rose-500/15 dark:hover:text-rose-300 dark:hover:border-rose-400/40 transition"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        {/* Compact Telemetry Strip below XL */}
        <div
          className={`nx-num flex flex-wrap items-center justify-between gap-2 border-t px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wider xl:hidden ${
            !wallet || isArcMainnet
              ? "border-slate-300 bg-slate-100/90 text-slate-900 dark:border-white/[0.08] dark:bg-transparent dark:text-emerald-200"
              : "border-amber-300 bg-amber-50 text-amber-950 dark:border-white/[0.08] dark:bg-transparent dark:text-amber-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                !wallet || isArcMainnet ? "bg-emerald-600 dark:bg-emerald-400" : "bg-amber-600"
              }`}
            />
            <span className="text-sky-900 dark:text-cyan-300">
              {!wallet || isArcMainnet ? "Arc Mainnet · 5042" : `Chain ${chainId ?? "—"}`}
            </span>
            <span className="text-slate-700 dark:text-slate-400">
              {networkLatency > 0 ? `${networkLatency}ms` : "RPC"}
            </span>
          </div>
          <span className="text-emerald-800 dark:text-emerald-300">
            1 EURC = {eurcRateLabel === null ? "…" : `${eurcRateLabel} USDC`}
          </span>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 px-4 py-6 md:py-10 md:px-8 flex flex-col items-center">
        <div
          className={`w-full ${
            selectedTab === "docs" ? "max-w-6xl" : "max-w-4xl"
          } flex flex-col gap-7 md:gap-9`}
        >
          {selectedTab === "overview" ? (
            <div className="nx-enter text-center space-y-3">
              <h1
                className={`text-4xl sm:text-6xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br pb-1 ${tc.textWelcome}`}
              >
                Nexio Protocol
              </h1>
              <p className={`text-sm md:text-base font-medium max-w-2xl mx-auto px-2 ${tc.textDesc}`}>
                Enterprise Stablecoin Banking, Automated Yield Vaults &amp; Permanent .nex Identity on Arc Mainnet.
              </p>
            </div>
          ) : (
            <div className="nx-enter flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className={`text-2xl font-black tracking-tight sm:text-3xl ${tc.textMain}`}>
                  {ALL_TABS.find((t) => t.id === selectedTab)?.label ?? "Nexio Protocol"}
                </h1>
                <p className={`mt-1 max-w-2xl text-sm ${tc.textMuted}`}>
                  {selectedTab === "portfolio"
                    ? "Unified wallet balances, automated yield vaults, LP positions, and pure unskewed EURC spot valuation."
                    : selectedTab === "swap"
                      ? "Institutional USDC/EURC routing engine with consecutive Daily GM streak fee discounts."
                      : selectedTab === "lp"
                        ? "USDC/EURC V2 pool reserves. Deposits lock above a 5% skew from live market spot; withdrawals stay open."
                        : selectedTab === "dailygm"
                          ? "Consecutive 24-hour on-chain check-in (48-hour reset window) unlocking 30D, 90D, and 180D VIP tiers."
                          : selectedTab === "domains"
                            ? "Permanent 1-wallet-1-domain .nex registry with forward and reverse on-chain resolution."
                            : selectedTab === "trustpass"
                              ? "Cryptographically verified on-chain .nex identity credential for Arc Mainnet."
                              : selectedTab === "history"
                                ? "Live verifiable on-chain events indexed directly from Arc Mainnet logs."
                                : "Technical architecture, contract ABIs, API schemas, and operational guardrails."}
                </p>
              </div>
              <a
                href={headerExplorerTarget.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 rounded-full border border-sky-600/35 dark:border-cyan-500/35 bg-sky-100/80 dark:bg-cyan-500/10 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-sky-900 dark:text-cyan-200 hover:bg-sky-200/70 dark:hover:bg-cyan-500/20 transition shrink-0"
              >
                <span>{headerExplorerTarget.label}</span>
                <ExternalLinkIcon size={12} />
              </a>
            </div>
          )}

          {/* ================================================================
           * TAB 1: DASHBOARD (OVERVIEW)
           * ============================================================== */}
          {selectedTab === "overview" && (
            <div className="nx-enter space-y-6 md:space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-7">
                <div
                  className={`rounded-3xl p-6 md:p-8 border transition-all duration-200 ${tc.cardBg}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black uppercase tracking-widest text-sky-800 dark:text-cyan-400">
                      USDC Balance
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${tc.textMuted}`}
                    >
                      Native + ERC-20 Unified
                    </span>
                  </div>
                  <div className="text-4xl sm:text-5xl font-black tracking-tight">
                    <AnimatedNumber
                      value={usdcBalance}
                      decimals={2}
                      loading={balancesLoading}
                      ready={!wallet || balancesReady}
                      skeletonWidthClass="w-36 h-11"
                    />
                  </div>
                  <div className={`nx-num mt-2 text-xs font-semibold ${tc.textMuted}`}>
                    ${usdcWalletUsdLabel} USD · Spendable max leaves 0.005 for gas
                  </div>
                </div>

                <div
                  className={`rounded-3xl p-6 md:p-8 border transition-all duration-200 ${tc.cardBg}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-400">
                      EURC Balance
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${tc.textMuted}`}
                    >
                      6-Decimal ERC-20
                    </span>
                  </div>
                  <div className="text-4xl sm:text-5xl font-black tracking-tight">
                    <AnimatedNumber
                      value={eurcBalance}
                      decimals={2}
                      loading={balancesLoading}
                      ready={!wallet || balancesReady}
                      skeletonWidthClass="w-36 h-11"
                    />
                  </div>
                  <div className={`nx-num mt-2 text-xs font-semibold ${tc.textMuted}`}>
                    {eurcWalletUsdLabel === null
                      ? "Awaiting live market EURC spot"
                      : `≈ $${eurcWalletUsdLabel} USD · Live Market Spot Valuation`}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:gap-5">
                <button
                  type="button"
                  onClick={() => void handleOpenSendModal()}
                  disabled={chainLocked}
                  className={`group rounded-2xl sm:rounded-3xl p-4 sm:p-6 border text-center transition-all hover:-translate-y-0.5 active:scale-[0.98] flex flex-col items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none ${tc.actionCard}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-800 border border-sky-300/80 dark:bg-cyan-500/12 dark:text-cyan-300 dark:border-cyan-500/25 group-hover:scale-105 transition-transform">
                    <SendArrowIcon size={18} />
                  </span>
                  <span className="text-sm sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">
                    Send
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:block text-slate-700 dark:text-slate-400">
                    Single or Batch
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenRequestModal}
                  className={`group rounded-2xl sm:rounded-3xl p-4 sm:p-6 border text-center transition-all hover:-translate-y-0.5 active:scale-[0.98] flex flex-col items-center justify-center gap-2 ${tc.actionCard}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 border border-emerald-300/80 dark:bg-emerald-500/12 dark:text-emerald-300 dark:border-emerald-500/25 group-hover:scale-105 transition-transform">
                    <LinkIcon size={18} />
                  </span>
                  <span className="text-sm sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">
                    Request
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:block text-slate-700 dark:text-slate-400">
                    Payment URI &amp; QR
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!wallet) {
                      showMessage("Connect wallet first.");
                      return;
                    }
                    setShowReceiveModal(true);
                  }}
                  className={`group rounded-2xl sm:rounded-3xl p-4 sm:p-6 border text-center transition-all hover:-translate-y-0.5 active:scale-[0.98] flex flex-col items-center justify-center gap-2 ${tc.actionCard}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-800 border border-indigo-300/80 dark:bg-sky-500/12 dark:text-sky-300 dark:border-sky-500/25 group-hover:scale-105 transition-transform">
                    <ReceiveArrowIcon size={18} />
                  </span>
                  <span className="text-sm sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">
                    Receive
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:block text-slate-700 dark:text-slate-400">
                    Address &amp; SVG QR
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ================================================================
           * TAB 2: PORTFOLIO & DEFI (VAULTS, NET WORTH & ON-CHAIN NLP)
           * ============================================================== */}
          {selectedTab === "portfolio" && (
            <div className="nx-enter w-full max-w-2xl mx-auto space-y-6 md:space-y-8">
              {/* Total Net Worth Header */}
              <div className={`p-7 sm:p-9 rounded-[2rem] border ${tc.solidCardBg}`}>
                <div className="flex flex-col items-center text-center">
                  <span
                    className={`text-xs font-extrabold tracking-widest uppercase mb-3 ${tc.textMuted}`}
                  >
                    Total Net Worth (Wallet + Vaults + LP)
                  </span>
                  <div className={`text-4xl sm:text-6xl font-black tracking-tight mb-2 ${tc.textMain}`}>
                    <AnimatedNumber
                      value={netWorthLabel}
                      prefix="$"
                      decimals={2}
                      loading={balancesLoading}
                      ready={(!wallet || balancesReady) && netWorthLabel !== null}
                      fallbackText="Awaiting Rate"
                      skeletonWidthClass="w-48 h-12"
                    />
                  </div>
                  <span className={`nx-num text-xs font-bold ${tc.textMuted}`}>
                    Live Market Spot: 1 EURC ={" "}
                    {eurcRateLabel === null ? "…" : `${eurcRateLabel} USDC`}
                  </span>
                </div>
              </div>

              {/* Nexio DeFi Vault Staking & Withdrawal */}
              <div className={`rounded-[2rem] border p-6 sm:p-8 ${tc.solidCardBg}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                  <div>
                    <div
                      className={`text-xs font-extrabold uppercase tracking-widest ${tc.textMuted}`}
                    >
                      Nexio Automated Yield Vaults
                    </div>
                    <h2 className={`text-xl sm:text-2xl font-black tracking-tight mt-0.5 ${tc.textMain}`}>
                      {vaultAsset} Vault
                    </h2>
                  </div>

                  <div
                    className={`flex gap-1.5 p-1 rounded-xl border self-start sm:self-auto ${tc.segTrackBg}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setVaultAsset("USDC");
                        setVaultInput("");
                      }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                        vaultAsset === "USDC"
                          ? "bg-sky-700 dark:bg-cyan-500 text-white shadow-sm"
                          : "text-slate-800 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-white/10"
                      }`}
                    >
                      USDC
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setVaultAsset("EURC");
                        setVaultInput("");
                      }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                        vaultAsset === "EURC"
                          ? "bg-emerald-700 dark:bg-emerald-500 text-white shadow-sm"
                          : "text-slate-800 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-white/10"
                      }`}
                    >
                      EURC
                    </button>
                  </div>
                </div>

                <div className="mb-5">
                  <div
                    className={`text-[11px] font-extrabold uppercase tracking-widest ${tc.textMuted}`}
                  >
                    Staked Position
                  </div>
                  <div
                    className={`nx-num text-3xl sm:text-4xl font-black tracking-tight mt-1 ${
                      vaultAsset === "USDC"
                        ? "text-sky-800 dark:text-cyan-300"
                        : "text-emerald-800 dark:text-emerald-300"
                    }`}
                  >
                    <AnimatedNumber
                      value={vaultAsset === "USDC" ? usdcStakedBalance : eurcStakedBalance}
                      decimals={2}
                      loading={balancesLoading}
                      ready={!wallet || balancesReady}
                    />{" "}
                    <span className="text-lg sm:text-xl text-slate-600 dark:text-slate-400">
                      {vaultAsset}
                    </span>
                  </div>
                </div>

                <VaultPositionMeter
                  asset={vaultAsset}
                  stakedRaw={vaultAsset === "USDC" ? usdcStakedRaw : eurcStakedRaw}
                  walletSpendableRaw={vaultAsset === "USDC" ? usdcSpendable : eurcBalanceRaw}
                  stakedLabel={
                    vaultAsset === "USDC"
                      ? formatPretty(usdcStakedRaw, WUSDC_DECIMALS, 4)
                      : formatPretty(eurcStakedRaw, EURC_DECIMALS, 4)
                  }
                  walletLabel={
                    vaultAsset === "USDC"
                      ? formatPretty(usdcSpendable, WUSDC_DECIMALS, 4)
                      : formatPretty(eurcBalanceRaw, EURC_DECIMALS, 4)
                  }
                  pendingYieldLabel={`${formatPretty(
                    vaultAsset === "USDC"
                      ? liveUsdcPendingNlp18
                      : computeUsdScaledVaultNlp18({
                          usdcNlp18: ZERO,
                          eurcNlp18: liveEurcPendingNlp18,
                          eurcSpotOut6: activeEurcSpotOut,
                        }),
                    NLP_DECIMALS,
                    4
                  )} NLP`}
                  className="mb-5"
                />

                {/* Stake / Withdraw Mode Switcher */}
                <div className={`p-1 rounded-2xl flex gap-1 mb-4 border ${tc.segTrackBg}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setVaultMode("stake");
                      setVaultInput("");
                    }}
                    className={`flex-1 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all ${
                      vaultMode === "stake"
                        ? vaultAsset === "USDC"
                          ? "bg-sky-700 dark:bg-cyan-500 text-white shadow"
                          : "bg-emerald-700 dark:bg-emerald-500 text-white shadow"
                        : "text-slate-700 dark:text-slate-400 hover:bg-slate-300/70 dark:hover:bg-white/10"
                    }`}
                  >
                    Stake {vaultAsset}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVaultMode("withdraw");
                      setVaultInput("");
                    }}
                    className={`flex-1 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all ${
                      vaultMode === "withdraw"
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow"
                        : "text-slate-700 dark:text-slate-400 hover:bg-slate-300/70 dark:hover:bg-white/10"
                    }`}
                  >
                    Withdraw {vaultAsset}
                  </button>
                </div>

                <div className={`rounded-2xl border p-4 mb-4 ${tc.subPanelBg}`}>
                  <div className="nx-num flex items-center justify-between text-[11px] font-bold mb-2">
                    <span className={`uppercase tracking-wider ${tc.textMuted}`}>
                      {vaultMode === "stake" ? "Amount to Stake" : "Amount to Withdraw"}
                    </span>
                    <span className={`flex items-center gap-2 ${tc.textMuted}`}>
                      <span>
                        {vaultMode === "stake"
                          ? `Available: ${
                              vaultAsset === "USDC"
                                ? formatPretty(usdcSpendable, WUSDC_DECIMALS, 4)
                                : formatPretty(eurcBalanceRaw, EURC_DECIMALS, 4)
                            }`
                          : `Staked: ${
                              vaultAsset === "USDC"
                                ? formatPretty(usdcStakedRaw, WUSDC_DECIMALS, 4)
                                : formatPretty(eurcStakedRaw, EURC_DECIMALS, 4)
                            }`}
                      </span>
                      <button
                        type="button"
                        onClick={fillVaultMax}
                        disabled={vaultMaxAvailableRaw <= ZERO}
                        className="nx-max-pill"
                      >
                        Max
                      </button>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={vaultInput}
                      onChange={(e) => setVaultInput(sanitizeDecimalDraft(e.target.value))}
                      placeholder="0.00"
                      className={`nx-num flex-1 min-w-0 bg-transparent outline-none font-black text-2xl ${tc.textMain}`}
                    />
                    <span className={`text-sm font-black shrink-0 ${tc.textMuted}`}>
                      {vaultAsset}
                    </span>
                  </div>

                  {vaultInput.trim() && !vaultParsedStrict.ok && (
                    <div className="mt-2 text-xs font-bold text-rose-700 dark:text-rose-400">
                      {vaultParsedStrict.error}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    !wallet ? void connectWallet() : void handleVaultAction(vaultMode)
                  }
                  disabled={
                    Boolean(wallet) &&
                    (chainLocked ||
                      isVaultLoading ||
                      !vaultParsedStrict.ok ||
                      vaultParsedStrict.value <= ZERO ||
                      vaultExceedsLimit ||
                      vaultMissingGas)
                  }
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-black ${
                    !wallet
                      ? "nx-btn-primary"
                      : vaultExceedsLimit || vaultMissingGas
                        ? "nx-btn-guard-warn"
                        : vaultAsset === "EURC" && vaultMode === "stake"
                          ? "nx-btn-emerald"
                          : "nx-btn-primary"
                  }`}
                >
                  {!wallet ? (
                    "Connect Wallet"
                  ) : chainLocked ? (
                    "Wrong Network (Switch to 5042)"
                  ) : isVaultLoading && vaultAction === vaultMode ? (
                    <>
                      <RadarSpinner size={16} />
                      <span>{vaultMode === "stake" ? "Staking..." : "Withdrawing..."}</span>
                    </>
                  ) : vaultExceedsLimit ? (
                    vaultMode === "stake"
                      ? `Insufficient ${vaultAsset} Balance`
                      : `Exceeds Staked ${vaultAsset}`
                  ) : vaultMissingGas ? (
                    "Insufficient Native USDC for Gas"
                  ) : vaultMode === "stake" ? (
                    `Stake ${vaultAsset}`
                  ) : (
                    `Withdraw ${vaultAsset}`
                  )}
                </button>

                {isVaultLoading &&
                  (vaultAction === "stake" || vaultAction === "withdraw") &&
                  txLifecycle && (
                    <TxLifecycleStepper
                      steps={txLifecycle.steps}
                      explorerUrl={ARC_EXPLORER}
                      compact
                      className="mt-4"
                    />
                  )}

                <div className={`nx-num text-[11px] mt-4 text-center font-semibold ${tc.textMuted}`}>
                  USDC Max reserves 0.005 USDC for gas · Contract{" "}
                  {(vaultAsset === "USDC" ? USDC_VAULT_ADDRESS : EURC_VAULT_ADDRESS).slice(0, 8)}...
                  {(vaultAsset === "USDC" ? USDC_VAULT_ADDRESS : EURC_VAULT_ADDRESS).slice(-6)}
                </div>
              </div>

              {/* Exact On-Chain Nexio Loyalty Points (10.00 NLP / $100 Staked / 24h) */}
              <div className={`rounded-[2rem] border p-6 sm:p-8 ${tc.solidCardBg}`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-widest text-sky-800 dark:text-cyan-300 mb-1">
                      On-Chain Vault Rewards
                    </div>
                    <h3 className={`text-xl sm:text-2xl font-black tracking-tight ${tc.textMain}`}>
                      Nexio Loyalty Points (NLP)
                    </h3>
                    <p className={`text-xs sm:text-sm font-medium mt-1 ${tc.textMuted}`}>
                      Deterministic on-chain accrual settled directly via claimNLP() on Nexio Vault contracts.
                    </p>
                  </div>

                  <span className="nx-num inline-flex items-center gap-1.5 rounded-full border border-emerald-600/35 dark:border-emerald-500/35 bg-emerald-100/85 dark:bg-emerald-500/12 px-3 py-1 text-[11px] font-extrabold text-emerald-900 dark:text-emerald-300 shrink-0 self-start">
                    <SparklesSealIcon size={14} />
                    <span>10 NLP / $100 Staked / 24h</span>
                  </span>
                </div>

                <div
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-5 p-4 sm:p-5 rounded-2xl border ${tc.subPanelBg}`}
                >
                  <div className="flex flex-col gap-3 w-full">
                    <div className="flex justify-between items-center">
                      <span
                        className={`text-xs font-extrabold uppercase tracking-wider ${tc.textMuted}`}
                      >
                        Lifetime Accrued NLP
                      </span>
                      <span className={`nx-num text-lg font-black ${tc.textMain}`}>
                        {lifetimePtsLabel}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span
                        className={`text-xs font-extrabold uppercase tracking-wider ${tc.textMuted}`}
                      >
                        Claimed On-Chain
                      </span>
                      <span className={`nx-num text-sm font-bold ${tc.textMuted}`}>
                        {claimedPtsLabel} NLP
                      </span>
                    </div>

                    {streak >= 90 && (
                      <div className={`nx-num text-xs font-bold ${tc.textMuted}`}>
                        Tier 2+ Vault Telemetry: {lifetimePtsTelemetryLabel} exact 18-dec NLP
                      </div>
                    )}

                    <div className="flex justify-between items-center border-t border-slate-300 dark:border-white/10 pt-3">
                      <span
                        className={`text-xs font-extrabold uppercase tracking-wider ${tc.textMuted}`}
                      >
                        Pending Unclaimed NLP
                      </span>
                      <span className="nx-num text-xl sm:text-2xl font-black text-sky-800 dark:text-cyan-300">
                        +{unclaimedPtsLabel}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleClaimPts()}
                    disabled={
                      !wallet ||
                      chainLocked ||
                      isVaultLoading ||
                      !hasClaimableOnChainNlp ||
                      unclaimedNlp18 <= ZERO ||
                      usdcBalanceRaw <= ZERO
                    }
                    className="nx-btn-primary w-full sm:w-auto shrink-0 px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-wider inline-flex items-center justify-center gap-2"
                  >
                    {isVaultLoading && vaultAction === "claim" ? (
                      <>
                        <RadarSpinner size={14} />
                        <span>Claiming...</span>
                      </>
                    ) : chainLocked ? (
                      "Wrong Network"
                    ) : (
                      "Claim On-Chain NLP"
                    )}
                  </button>
                </div>

                {isVaultLoading && vaultAction === "claim" && txLifecycle && (
                  <TxLifecycleStepper
                    steps={txLifecycle.steps}
                    explorerUrl={ARC_EXPLORER}
                    compact
                    className="mt-4"
                  />
                )}
              </div>

              {/* Asset Breakdown (Includes LP Underlying — Zero Synthetic Formulas) */}
              <div className={`p-6 sm:p-8 rounded-[2rem] border ${tc.solidCardBg}`}>
                <span
                  className={`text-xs font-extrabold tracking-widest uppercase mb-5 block ${tc.textMuted}`}
                >
                  Portfolio Holdings Breakdown
                </span>

                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3.5 border-b border-slate-300 dark:border-white/10">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-600 dark:bg-cyan-500" />
                      <div>
                        <div className={`text-sm sm:text-base font-black ${tc.textMain}`}>
                          Wallet USDC
                        </div>
                        <div className={`text-[11px] font-semibold ${tc.textMuted}`}>
                          Unified Native + ERC-20
                        </div>
                      </div>
                    </div>
                    <div className="nx-num text-right">
                      <div className={`text-base sm:text-lg font-black ${tc.textMain}`}>
                        {usdcBalance} USDC
                      </div>
                      <div className={`text-xs font-semibold ${tc.textMuted}`}>
                        ${usdcWalletUsdLabel}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pb-3.5 border-b border-slate-300 dark:border-white/10">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full border-2 border-sky-600 dark:border-cyan-500" />
                      <div>
                        <div className={`text-sm sm:text-base font-black ${tc.textMain}`}>
                          Staked USDC
                        </div>
                        <div className={`text-[11px] font-semibold ${tc.textMuted}`}>
                          NexioUSDCVault
                        </div>
                      </div>
                    </div>
                    <div className="nx-num text-right">
                      <div className={`text-base sm:text-lg font-black ${tc.textMain}`}>
                        {usdcStakedBalance} USDC
                      </div>
                      <div className={`text-xs font-semibold ${tc.textMuted}`}>
                        ${usdcStakedUsdLabel}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pb-3.5 border-b border-slate-300 dark:border-white/10">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-500" />
                      <div>
                        <div className={`text-sm sm:text-base font-black ${tc.textMain}`}>
                          Wallet EURC
                        </div>
                        <div className={`text-[11px] font-semibold ${tc.textMuted}`}>
                          Circle Euro Coin
                        </div>
                      </div>
                    </div>
                    <div className="nx-num text-right">
                      <div className={`text-base sm:text-lg font-black ${tc.textMain}`}>
                        {eurcBalance} EURC
                      </div>
                      <div className={`text-xs font-semibold ${tc.textMuted}`}>
                        {eurcWalletUsdLabel === null ? "…" : `$${eurcWalletUsdLabel}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pb-3.5 border-b border-slate-300 dark:border-white/10">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full border-2 border-emerald-600 dark:border-emerald-500" />
                      <div>
                        <div className={`text-sm sm:text-base font-black ${tc.textMain}`}>
                          Staked EURC
                        </div>
                        <div className={`text-[11px] font-semibold ${tc.textMuted}`}>
                          NexioEURCVault
                        </div>
                      </div>
                    </div>
                    <div className="nx-num text-right">
                      <div className={`text-base sm:text-lg font-black ${tc.textMain}`}>
                        {eurcStakedBalance} EURC
                      </div>
                      <div className={`text-xs font-semibold ${tc.textMuted}`}>
                        {eurcStakedUsdLabel === null ? "…" : `$${eurcStakedUsdLabel}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-sky-400" />
                      <div>
                        <div className={`text-sm sm:text-base font-black ${tc.textMain}`}>
                          USDC / EURC LP Pool
                        </div>
                        <div className={`nx-num text-[11px] font-semibold ${tc.textMuted}`}>
                          {lpBalanceRaw > ZERO
                            ? `${lpPooledUsdc} USDC + ${lpPooledEurc} EURC (${lpSharePct}% share)`
                            : "No active V2 LP tokens"}
                        </div>
                      </div>
                    </div>
                    <div className="nx-num text-right">
                      <div className={`text-base sm:text-lg font-black ${tc.textMain}`}>
                        {lpBalance} LP
                      </div>
                      <div className={`text-xs font-semibold ${tc.textMuted}`}>
                        {lpTotalUsdLabel === null ? "…" : `$${lpTotalUsdLabel}`}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Exact BigInt Portfolio Allocation Bar */}
              <div className={`p-6 sm:p-8 rounded-[2rem] border ${tc.solidCardBg}`}>
                <span
                  className={`text-xs font-extrabold tracking-widest uppercase mb-4 block ${tc.textMuted}`}
                >
                  Capital Allocation (Wallet + Staked + LP)
                </span>
                <PortfolioAllocationBar
                  usdcTotal6={usdcCore6}
                  eurcTotal6={eurcCore6}
                  lpUsdc6={lpPooledUsdcRaw}
                  lpEurc6={lpPooledEurcRaw}
                  eurcSpotOut={activeEurcSpotOut}
                />
              </div>
            </div>
          )}

          {/* ================================================================
           * TAB 3: NEXIO SWAP (NEXIO ROUTING ENGINE)
           * ============================================================== */}
          {selectedTab === "swap" && (
            <div className="nx-enter w-full max-w-lg mx-auto">
              <div className={`p-5 sm:p-7 rounded-[2rem] border ${tc.solidCardBg}`}>
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${tc.textMain}`}>
                        Swap
                      </h2>
                      <span
                        className={`nx-num rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                          gmProfile.feeBps === 0
                            ? "border-amber-600/40 dark:border-amber-500/40 bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-300"
                            : "border-sky-600/35 dark:border-cyan-500/35 bg-sky-100 dark:bg-cyan-500/12 text-sky-900 dark:text-cyan-300"
                        }`}
                      >
                        {unlockedTier ? unlockedTier.name : "Standard"} ·{" "}
                        {gmProfile.feeBps === 0 ? "0 bps VIP" : `${gmProfile.feeBps} bps`}
                      </span>
                    </div>
                    <p className={`text-xs mt-1 font-bold ${tc.textMuted}`}>
                      USDC / EURC · Nexio Routing Engine
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <QuoteFreshnessRing
                      quoting={swapQuoting}
                      hasQuote={swapQuoteRaw > ZERO && !swapQuoteError}
                      quoteKey={activeSwapQuoteKey}
                      ttlMs={SWAP_QUOTE_REFRESH_MS}
                      onRefresh={() => {
                        if (!swapAmountIn || isSwapping) return;
                        setSwapQuoting(true);
                        setSwapRefreshTick((t) => t + 1);
                      }}
                      disabled={!swapAmountIn || isSwapping}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSlippage((v) => !v)}
                      className={`nx-num rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider border transition ${tc.subPanelBg} text-slate-900 dark:text-slate-100 hover:border-sky-600 dark:hover:border-cyan-500/40`}
                    >
                      Slip {slippageLabel(slippageBps)}
                    </button>
                  </div>
                </div>

                {showSlippage && (
                  <div className={`nx-enter mb-4 p-3.5 rounded-2xl border ${tc.subPanelBg}`}>
                    <div
                      className={`text-[10px] font-extrabold uppercase tracking-widest mb-2 ${tc.textMuted}`}
                    >
                      Max Slippage Tolerance (0.01% – 20%)
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {SLIPPAGE_PRESETS.map((bps) => (
                        <button
                          key={bps}
                          type="button"
                          onClick={() => {
                            setSlippageBps(bps);
                            setCustomSlippage("");
                            if (swapAmountIn) setSwapQuoting(true);
                          }}
                          className={`nx-num px-3 py-1.5 rounded-xl text-xs font-black transition border ${
                            slippageBps === bps && !customSlippage
                              ? "bg-sky-700 border-sky-700 dark:bg-cyan-500 dark:border-cyan-500 text-white shadow-sm"
                              : "bg-white border-slate-300 text-slate-800 hover:bg-slate-100 dark:bg-white/10 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/15"
                          }`}
                        >
                          {slippageLabel(bps)}
                        </button>
                      ))}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={customSlippage}
                        onChange={(e) => {
                          const val = sanitizeDecimalDraft(e.target.value);
                          setCustomSlippage(val);
                          applyCustomSlippage(
                            val,
                            (nextBps) => {
                              setSlippageBps(nextBps);
                              if (swapAmountIn) setSwapQuoting(true);
                            },
                            ACHSWAP_MAX_SLIPPAGE_BPS
                          );
                        }}
                        placeholder="Custom %"
                        className={`nx-num w-24 rounded-xl border px-3 py-1.5 text-xs font-bold focus:outline-none ${tc.inputBg}`}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2.5">
                  {/* Pay Input Box */}
                  <div className={`rounded-2xl border p-4 ${tc.subPanelBg}`}>
                    <div className="nx-num flex justify-between items-center mb-2">
                      <span
                        className={`text-[11px] font-extrabold uppercase tracking-wider ${tc.textMuted}`}
                      >
                        You Pay
                      </span>
                      <span className={`text-[11px] font-bold flex items-center gap-2 ${tc.textMuted}`}>
                        <span>
                          Bal: {swapDirection === "USDCtoEURC" ? swapUsdcLabel : swapEurcLabel}
                        </span>
                        <button
                          type="button"
                          onClick={fillSwapMax}
                          disabled={isSwapping}
                          className="nx-max-pill"
                        >
                          Max
                        </button>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={swapInput}
                        onChange={(e) => handleSwapInputChange(e.target.value)}
                        placeholder="0.00"
                        className={`nx-num flex-1 min-w-0 bg-transparent border-none outline-none font-black text-2xl sm:text-3xl ${tc.textMain}`}
                      />
                      <span
                        className={`text-sm sm:text-base font-black shrink-0 px-3 py-1 rounded-xl border bg-white border-slate-300 dark:bg-black/40 dark:border-white/10 ${tc.textMain}`}
                      >
                        {swapDirection === "USDCtoEURC" ? "USDC" : "EURC"}
                      </span>
                    </div>
                  </div>

                  {/* Interactive Token Flip Control */}
                  <div className="flex justify-center -my-3">
                    <SwapFlipButton
                      direction={swapDirection}
                      onClick={handleFlipSwapDirection}
                      disabled={isSwapping}
                    />
                  </div>

                  {/* Receive Output Box */}
                  <div className={`rounded-2xl border p-4 ${tc.subPanelBg}`}>
                    <div
                      className={`text-[11px] font-extrabold uppercase tracking-wider mb-2 ${tc.textMuted}`}
                    >
                      You Receive (Estimated Output)
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div
                        className={`nx-num font-black text-2xl sm:text-3xl break-all ${tc.textMain}`}
                      >
                        {swapQuoting && !swapQuote ? (
                          <span className="nx-shimmer inline-block h-8 w-32 rounded-lg" />
                        ) : (
                          swapQuote || "0.00"
                        )}
                      </div>
                      <span
                        className={`text-sm sm:text-base font-black shrink-0 px-3 py-1 rounded-xl border bg-white border-slate-300 dark:bg-black/40 dark:border-white/10 ${tc.textMain}`}
                      >
                        {swapDirection === "USDCtoEURC" ? "EURC" : "USDC"}
                      </span>
                    </div>

                    {swapQuoteRaw > ZERO && (
                      <div className={`nx-num text-[11px] font-bold mt-2 ${tc.textMuted}`}>
                        Min received ({slippageLabel(slippageBps)}):{" "}
                        {formatPretty(swapMinRaw, swapOutDecimals, 6)}{" "}
                        {swapDirection === "USDCtoEURC" ? "EURC" : "USDC"}
                        {swapPartnerBps !== null ? ` · Protocol fee ${swapPartnerBps} bps` : ""}
                      </div>
                    )}

                    {swapQuoteError && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                        <AlertTriangleIcon size={14} />
                        <span>{swapQuoteError}</span>
                      </div>
                    )}
                  </div>

                  {/* Route Conduit & Price Impact Guard */}
                  <SwapRouteConduit
                    tokenInSymbol={swapDirection === "USDCtoEURC" ? "USDC" : "EURC"}
                    tokenOutSymbol={swapDirection === "USDCtoEURC" ? "EURC" : "USDC"}
                    quoting={swapQuoting}
                    swapping={isSwapping}
                    hasQuote={swapQuoteRaw > ZERO && !swapQuoteError}
                    executorAddress={swapExecutor || undefined}
                    partnerFeeBps={swapPartnerBps ?? (wallet ? gmProfile.feeBps : null)}
                    explorerUrl={ARC_EXPLORER}
                  />

                  <PriceImpactMeter
                    priceImpactBps={swapImpactBps}
                    valueLossBps={swapLossBps}
                    blocked={Boolean(swapBlockReason)}
                    blockReason={swapBlockReason || undefined}
                  />

                  <button
                    type="button"
                    onClick={() => (!wallet ? void connectWallet() : void handleSwap())}
                    disabled={
                      Boolean(wallet) &&
                      (chainLocked ||
                        isSwapping ||
                        swapQuoting ||
                        !swapAmountIn ||
                        swapQuoteRaw <= ZERO ||
                        Boolean(swapQuoteError) ||
                        swapInsufficient ||
                        swapMissingEurcGas ||
                        Boolean(swapBlockReason))
                    }
                    className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base sm:text-lg font-black ${
                      !wallet
                        ? "nx-btn-primary"
                        : swapBlockReason
                          ? "nx-btn-guard-block"
                          : swapInsufficient || swapMissingEurcGas
                            ? "nx-btn-guard-warn"
                            : swapDirection === "EURCtoUSDC"
                              ? "nx-btn-emerald"
                              : "nx-btn-primary"
                    }`}
                  >
                    {!wallet ? (
                      "Connect Wallet"
                    ) : chainLocked ? (
                      "Wrong Network (Switch to 5042)"
                    ) : isSwapping ? (
                      <>
                        <RadarSpinner size={17} />
                        <span>Executing Swap...</span>
                      </>
                    ) : swapQuoting ? (
                      <>
                        <RadarSpinner size={17} />
                        <span>Fetching Live Quote...</span>
                      </>
                    ) : swapBlockReason ? (
                      <>
                        <LockIcon size={16} />
                        <span>Swap Blocked by Price Guard</span>
                      </>
                    ) : swapInsufficient ? (
                      `Insufficient ${swapDirection === "USDCtoEURC" ? "USDC" : "EURC"} Balance`
                    ) : swapMissingEurcGas ? (
                      "Insufficient Native USDC for Gas"
                    ) : swapQuoteError === "No route found." ? (
                      "No Route Found"
                    ) : swapQuoteError ? (
                      "Quote Unavailable"
                    ) : (
                      `Swap ${swapDirection === "USDCtoEURC" ? "USDC → EURC" : "EURC → USDC"}`
                    )}
                  </button>

                  {isSwapping && txLifecycle && (
                    <TxLifecycleStepper
                      steps={txLifecycle.steps}
                      explorerUrl={ARC_EXPLORER}
                      compact
                      className="pt-2"
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
           * TAB 4: LIQUIDITY (LP)
           * ============================================================== */}
          {selectedTab === "lp" && (
            <div className="nx-enter w-full max-w-lg mx-auto">
              <div className={`p-5 sm:p-7 rounded-[2rem] border ${tc.solidCardBg}`}>
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${tc.textMain}`}>
                        Liquidity
                      </h2>
                      {streak >= 180 && (
                        <span className="rounded-full border border-amber-600/40 dark:border-amber-500/40 bg-amber-100 dark:bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                          Tier 3 VIP
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-1 font-bold ${tc.textMuted}`}>
                      USDC / EURC V2 Constant-Product Pool
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowLpSlippage((v) => !v)}
                    className={`nx-num shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider border transition ${tc.subPanelBg} text-slate-900 dark:text-slate-100 hover:border-sky-600 dark:hover:border-cyan-500/40`}
                  >
                    Slip {slippageLabel(lpSlippageBps)}
                  </button>
                </div>

                {showLpSlippage && (
                  <div className={`nx-enter mb-4 p-3.5 rounded-2xl border ${tc.subPanelBg}`}>
                    <div
                      className={`text-[10px] font-extrabold uppercase tracking-widest mb-2 ${tc.textMuted}`}
                    >
                      Max Slippage Tolerance (0.01% – 20%)
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {SLIPPAGE_PRESETS.map((bps) => (
                        <button
                          key={bps}
                          type="button"
                          onClick={() => {
                            setLpSlippageBps(bps);
                            setLpCustomSlippage("");
                          }}
                          className={`nx-num px-3 py-1.5 rounded-xl text-xs font-black transition border ${
                            lpSlippageBps === bps && !lpCustomSlippage
                              ? "bg-sky-700 border-sky-700 dark:bg-cyan-500 dark:border-cyan-500 text-white shadow-sm"
                              : "bg-white border-slate-300 text-slate-800 hover:bg-slate-100 dark:bg-white/10 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/15"
                          }`}
                        >
                          {slippageLabel(bps)}
                        </button>
                      ))}
                      <input
                        type="text"
                        inputMode="decimal"
                        value={lpCustomSlippage}
                        onChange={(e) => {
                          const clean = sanitizeDecimalDraft(e.target.value);
                          setLpCustomSlippage(clean);
                          applyCustomSlippage(clean, setLpSlippageBps, ACHSWAP_MAX_SLIPPAGE_BPS);
                        }}
                        placeholder="Custom %"
                        className={`nx-num w-24 rounded-xl border px-3 py-1.5 text-xs font-bold focus:outline-none ${tc.inputBg}`}
                      />
                    </div>
                  </div>
                )}

                <LiquidityTelemetryBar
                  reserveUsdcRaw={poolReserveUsdcRaw}
                  reserveEurcRaw={poolReserveEurcRaw}
                  eurcSpotOut={activeEurcSpotOut}
                  reserveUsdcLabel={poolReserveUsdc}
                  reserveEurcLabel={poolReserveEurc}
                  userSharePctLabel={lpSharePct}
                  className="mb-4"
                />

                {/* User LP Position Card */}
                <div className={`p-4 rounded-2xl border mb-4 ${tc.subPanelBg}`}>
                  <div
                    className={`text-[10px] font-extrabold uppercase tracking-widest mb-3 ${tc.textMuted}`}
                  >
                    Your LP Position
                  </div>
                  <div className="nx-num grid grid-cols-2 gap-3">
                    <div>
                      <div className={`text-[10px] font-bold uppercase ${tc.textMuted}`}>
                        LP Tokens
                      </div>
                      <div className={`text-base font-black break-all ${tc.textMain}`}>
                        {!balancesReady && balancesLoading ? "…" : lpBalance}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-[10px] font-bold uppercase ${tc.textMuted}`}>
                        Pool Share
                      </div>
                      <div className={`text-base font-black ${tc.textMain}`}>{lpSharePct}%</div>
                    </div>
                    <div>
                      <div className={`text-[10px] font-bold uppercase ${tc.textMuted}`}>
                        Pooled USDC
                      </div>
                      <div className={`text-sm font-black ${tc.textMain}`}>{lpPooledUsdc}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-[10px] font-bold uppercase ${tc.textMuted}`}>
                        Pooled EURC
                      </div>
                      <div className={`text-sm font-black ${tc.textMain}`}>{lpPooledEurc}</div>
                    </div>
                  </div>
                  <div className="nx-num flex justify-between mt-3 pt-2.5 border-t border-slate-300 dark:border-white/10 text-[11px] font-bold">
                    <span className={tc.textMuted}>Wallet USDC (ERC-20)</span>
                    <span className={tc.textMain}>
                      {formatPretty(wusdcBalanceRaw, WUSDC_DECIMALS, 6)}
                    </span>
                  </div>
                </div>

                {/* 5% Reserve-Skew Comparator Gauge */}
                <ReserveSkewGauge
                  poolEurcUsd={poolEurcUsd}
                  liveEurcUsd={eurcUsdRate}
                  skewBps={poolSkewBps}
                  skewLimitBps={POOL_SKEW_LIMIT_BPS}
                  ready={balancesReady}
                  className="mb-4"
                />

                {/* Add / Remove Mode Toggle */}
                <div className={`p-1 rounded-2xl flex gap-1 mb-4 border ${tc.segTrackBg}`}>
                  <button
                    type="button"
                    onClick={() => setLpMode("add")}
                    className={`flex-1 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all ${
                      lpMode === "add"
                        ? "bg-sky-700 dark:bg-cyan-500 text-white shadow"
                        : "text-slate-700 dark:text-slate-400 hover:bg-slate-300/70 dark:hover:bg-white/10"
                    }`}
                  >
                    Add Liquidity
                  </button>
                  <button
                    type="button"
                    onClick={() => setLpMode("remove")}
                    className={`flex-1 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all ${
                      lpMode === "remove"
                        ? "bg-emerald-700 dark:bg-emerald-500 text-white shadow"
                        : "text-slate-700 dark:text-slate-400 hover:bg-slate-300/70 dark:hover:bg-white/10"
                    }`}
                  >
                    Remove Liquidity
                  </button>
                </div>

                {lpMode === "add" ? (
                  <div className="space-y-3">
                    <div className={`rounded-2xl border p-4 ${tc.subPanelBg}`}>
                      <div className="nx-num flex justify-between items-center mb-2">
                        <span
                          className={`text-[11px] font-extrabold uppercase tracking-wider ${tc.textMuted}`}
                        >
                          USDC Deposit
                        </span>
                        <span
                          className={`text-[11px] font-bold flex items-center gap-2 ${tc.textMuted}`}
                        >
                          <span>Bal: {swapUsdcLabel}</span>
                          <button
                            type="button"
                            onClick={fillLpUsdcMax}
                            disabled={isLpLoading}
                            className="nx-max-pill"
                          >
                            Max
                          </button>
                        </span>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={lpUsdcInput}
                        onChange={(e) => {
                          const next = sanitizeDecimalDraft(e.target.value);
                          setLpLastEdited("usdc");
                          setLpUsdcInput(next);
                          if (!next.trim()) {
                            lastLpQuoteKeyRef.current = "";
                            setLpEurcInput("");
                          }
                        }}
                        placeholder="0.00"
                        className={`nx-num w-full bg-transparent outline-none font-black text-xl sm:text-2xl ${tc.textMain}`}
                      />
                    </div>

                    <div className={`rounded-2xl border p-4 ${tc.subPanelBg}`}>
                      <div className="nx-num flex justify-between items-center mb-2">
                        <span
                          className={`text-[11px] font-extrabold uppercase tracking-wider ${tc.textMuted}`}
                        >
                          EURC Deposit
                        </span>
                        <span
                          className={`text-[11px] font-bold flex items-center gap-2 ${tc.textMuted}`}
                        >
                          <span>Bal: {swapEurcLabel}</span>
                          <button
                            type="button"
                            onClick={fillLpEurcMax}
                            disabled={isLpLoading}
                            className="nx-max-pill"
                          >
                            Max
                          </button>
                        </span>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={lpEurcInput}
                        onChange={(e) => {
                          const next = sanitizeDecimalDraft(e.target.value);
                          setLpLastEdited("eurc");
                          setLpEurcInput(next);
                          if (!next.trim()) {
                            lastLpQuoteKeyRef.current = "";
                            setLpUsdcInput("");
                          }
                        }}
                        placeholder="0.00"
                        className={`nx-num w-full bg-transparent outline-none font-black text-xl sm:text-2xl ${tc.textMain}`}
                      />
                    </div>

                    {emptyPoolSkewBlocked && (
                      <div className="rounded-xl border border-amber-600/40 bg-amber-100 dark:bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-950 dark:text-amber-200">
                        Opening deposit ratio diverges &gt;5% from live market EURC spot (or spot quote is unavailable).
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        !wallet ? void connectWallet() : void handleAddLiquidity()
                      }
                      disabled={
                        Boolean(wallet) &&
                        (chainLocked ||
                          addBlockedBySkew ||
                          isLpLoading ||
                          !lpAddValidInputs ||
                          lpAddInsufficient)
                      }
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base sm:text-lg font-black ${
                        !wallet
                          ? "nx-btn-primary"
                          : addBlockedBySkew
                            ? "nx-btn-guard-block"
                            : lpAddInsufficient
                              ? "nx-btn-guard-warn"
                              : "nx-btn-primary"
                      }`}
                    >
                      {!wallet ? (
                        "Connect Wallet"
                      ) : chainLocked ? (
                        "Wrong Network (Switch to 5042)"
                      ) : addBlockedBySkew ? (
                        <>
                          <LockIcon size={16} />
                          <span>Add Blocked · 5% Skew Guard</span>
                        </>
                      ) : isLpLoading ? (
                        <>
                          <RadarSpinner size={17} />
                          <span>Supplying Liquidity...</span>
                        </>
                      ) : lpAddInsufficient ? (
                        "Insufficient Token Balance"
                      ) : (
                        "Add Liquidity"
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className={`rounded-2xl border p-4 ${tc.subPanelBg}`}>
                      <div className="nx-num flex justify-between items-center mb-2">
                        <span
                          className={`text-[11px] font-extrabold uppercase tracking-wider ${tc.textMuted}`}
                        >
                          LP Tokens to Burn
                        </span>
                        <span
                          className={`text-[11px] font-bold flex items-center gap-2 ${tc.textMuted}`}
                        >
                          <span>Bal: {lpBalance}</span>
                          <button
                            type="button"
                            onClick={fillLpRemoveMax}
                            disabled={isLpLoading || lpBalanceRaw <= ZERO}
                            className="nx-max-pill"
                          >
                            Max
                          </button>
                        </span>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={lpRemoveInput}
                        onChange={(e) => {
                          const next = sanitizeDecimalDraft(e.target.value);
                          setLpRemoveIsMax(false);
                          setLpRemoveInput(next);
                          if (!next.trim()) {
                            setLpRemovePreviewUsdc("");
                            setLpRemovePreviewEurc("");
                          }
                        }}
                        placeholder="0.00"
                        className={`nx-num w-full bg-transparent outline-none font-black text-xl sm:text-2xl ${tc.textMain}`}
                      />
                    </div>

                    <div className={`nx-num p-4 rounded-2xl border ${tc.subPanelBg}`}>
                      <div
                        className={`text-[10px] font-extrabold uppercase mb-2 tracking-widest ${tc.textMuted}`}
                      >
                        Estimated Underlying Return
                      </div>
                      <div className={`text-base font-black ${tc.textMain}`}>
                        {lpRemovePreviewUsdc || "0.00"}{" "}
                        <span className={`text-xs font-bold ${tc.textMuted}`}>USDC</span>
                      </div>
                      <div className={`text-base font-black mt-0.5 ${tc.textMain}`}>
                        {lpRemovePreviewEurc || "0.00"}{" "}
                        <span className={`text-xs font-bold ${tc.textMuted}`}>EURC</span>
                      </div>
                      {lpRemovePreviewUsdc && (
                        <div className={`text-[11px] font-semibold mt-2 ${tc.textMuted}`}>
                          Slippage floor: {slippageLabel(lpSlippageBps)} · Withdrawals stay open at all times
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        !wallet ? void connectWallet() : void handleRemoveLiquidity()
                      }
                      disabled={
                        Boolean(wallet) &&
                        (chainLocked ||
                          isLpLoading ||
                          !lpRemoveAmountRaw ||
                          lpRemoveAmountRaw <= ZERO ||
                          lpRemoveInsufficient ||
                          usdcBalanceRaw <= ZERO)
                      }
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base sm:text-lg font-black ${
                        !wallet
                          ? "nx-btn-primary"
                          : lpRemoveInsufficient || (wallet && usdcBalanceRaw <= ZERO)
                            ? "nx-btn-guard-warn"
                            : "nx-btn-emerald"
                      }`}
                    >
                      {!wallet ? (
                        "Connect Wallet"
                      ) : chainLocked ? (
                        "Wrong Network (Switch to 5042)"
                      ) : isLpLoading ? (
                        <>
                          <RadarSpinner size={17} />
                          <span>Withdrawing Liquidity...</span>
                        </>
                      ) : lpRemoveInsufficient ? (
                        "Insufficient LP Balance"
                      ) : usdcBalanceRaw <= ZERO ? (
                        "Insufficient Native USDC for Gas"
                      ) : (
                        "Remove Liquidity"
                      )}
                    </button>
                  </div>
                )}

                {isLpLoading && txLifecycle && (
                  <TxLifecycleStepper
                    steps={txLifecycle.steps}
                    explorerUrl={ARC_EXPLORER}
                    compact
                    className="mt-4"
                  />
                )}

                {streak >= 90 && (
                  <div className="nx-num mt-4 rounded-2xl border border-sky-600/35 dark:border-cyan-500/30 bg-sky-50 dark:bg-cyan-500/[0.08] p-4 text-xs">
                    <div className="font-black uppercase tracking-wider text-sky-900 dark:text-cyan-300">
                      Tier 2+ Priority LP Pool Telemetry
                    </div>
                    <div className={`mt-1.5 font-mono text-[11px] break-all ${tc.textMain}`}>
                      Pair: {lpPairAddress || "Resolving..."}
                    </div>
                    <div className={`mt-1 ${tc.textMuted}`}>
                      Reserves: {poolReserveUsdc} USDC / {poolReserveEurc} EURC
                    </div>
                    <div className={`mt-0.5 ${tc.textMuted}`}>
                      Divergence: {poolSkewBps === null ? "—" : `${poolSkewBps} bps`} vs live spot{" "}
                      {eurcRateLabel ?? "—"}
                    </div>
                  </div>
                )}

                <div
                  className={`nx-num text-[10px] mt-5 text-center font-bold tracking-wider space-y-0.5 ${tc.textMuted}`}
                >
                  <div>
                    Router {ROUTER_ADDRESS.slice(0, 6)}...{ROUTER_ADDRESS.slice(-4)} · Factory{" "}
                    {FACTORY_ADDRESS.slice(0, 6)}...{FACTORY_ADDRESS.slice(-4)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
           * TAB 5: DAILY GM PROTOCOL (STRICTLY 3 CONSECUTIVE TIERS: 30D, 90D, 180D)
           * ============================================================== */}
          {selectedTab === "dailygm" && (
            <div className="nx-enter w-full max-w-2xl mx-auto">
              <div
                className={`rounded-[2rem] border p-6 sm:p-10 flex flex-col items-center text-center ${tc.solidCardBg}`}
              >
                <DailyGmGauge
                  streak={streak}
                  hasCheckedInToday={hasCheckedInToday}
                  cooldownRemainingSec={cooldownRemainingSec}
                  streakExpiresInSec={streakExpiresInSec}
                  timeLeftLabel={timeLeft}
                  tierName={unlockedTier ? unlockedTier.name : UNRANKED_GM_PROFILE.name}
                  className="mb-5"
                />

                <h2 className={`text-2xl sm:text-3xl font-black tracking-tight mb-2 ${tc.textMain}`}>
                  Daily GM Protocol
                </h2>
                <p className={`text-xs sm:text-sm font-medium max-w-lg mb-5 ${tc.textMuted}`}>
                  Check in once every 24 hours on Arc Mainnet. Streaks require consecutive check-ins within each 48-hour window and reset if more than 48 hours elapse.
                </p>

                <div className="nx-num inline-flex items-center gap-2 rounded-full border border-sky-600/35 dark:border-cyan-500/35 bg-sky-100/85 dark:bg-cyan-500/12 px-5 py-2 text-xs sm:text-sm font-black uppercase tracking-wider text-sky-900 dark:text-cyan-300 mb-5">
                  <span>
                    {streak > 0 ? `${streak} Consecutive Days` : "0 Consecutive Days"} ·{" "}
                    {unlockedTier ? unlockedTier.name : UNRANKED_GM_PROFILE.name}
                  </span>
                </div>

                {/* Unranked 0–29D Progress Banner (Not a Tier Card) */}
                {!unlockedTier && (
                  <div
                    className={`nx-num w-full max-w-lg rounded-2xl border px-4 py-3 mb-5 text-xs font-bold leading-relaxed ${tc.subPanelBg}`}
                  >
                    <span className={tc.textMain}>
                      Unranked · Building Streak (0–29 Days)
                    </span>{" "}
                    <span className={tc.textMuted}>
                      — 20 bps default swap fee · 5 batch limit ·{" "}
                      <strong className="text-sky-800 dark:text-cyan-300">
                        {daysToNextTier} consecutive {daysToNextTier === 1 ? "day" : "days"}
                      </strong>{" "}
                      to unlock {nextGmTier?.name ?? "Tier 1"} (30 Days).
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => (!wallet ? void connectWallet() : void executeDailyGM())}
                  disabled={
                    Boolean(wallet) &&
                    (chainLocked || isCheckingIn || hasCheckedInToday || usdcBalanceRaw <= ZERO)
                  }
                  className={`w-full max-w-sm rounded-2xl py-4 font-black text-base sm:text-lg inline-flex items-center justify-center gap-2 mb-6 ${
                    !wallet
                      ? "nx-btn-primary"
                      : hasCheckedInToday
                        ? "border border-slate-300 dark:border-white/10 bg-slate-200/80 dark:bg-white/5 text-slate-600 dark:text-slate-400 cursor-not-allowed"
                        : usdcBalanceRaw <= ZERO
                          ? "nx-btn-guard-warn"
                          : "nx-btn-primary"
                  }`}
                >
                  {!wallet ? (
                    "Connect Wallet"
                  ) : chainLocked ? (
                    "Wrong Network (Switch to 5042)"
                  ) : isCheckingIn ? (
                    <>
                      <RadarSpinner size={17} />
                      <span>Confirming Check-In...</span>
                    </>
                  ) : hasCheckedInToday ? (
                    <span className="nx-num">Next Check-In in {timeLeft}</span>
                  ) : usdcBalanceRaw <= ZERO ? (
                    "Insufficient Native USDC for Gas"
                  ) : (
                    "Check In on Arc Mainnet"
                  )}
                </button>

                {isCheckingIn && txLifecycle && (
                  <TxLifecycleStepper
                    steps={txLifecycle.steps}
                    explorerUrl={ARC_EXPLORER}
                    compact
                    className="w-full max-w-sm mb-6 text-left"
                  />
                )}

                {/* Strictly the 3 Consecutive Unlockable Tier Cards: 30D, 90D, 180D VIP */}
                <div className="grid w-full gap-3.5 text-left sm:grid-cols-3">
                  {GM_TIERS.map((tier) => {
                    const isCurrent = unlockedTier?.tier === tier.tier;
                    const isUnlocked = streak >= tier.minStreak;
                    return (
                      <div
                        key={tier.tier}
                        className={`rounded-2xl border p-4 transition flex flex-col justify-between ${
                          isCurrent
                            ? "border-sky-600 dark:border-cyan-400/60 bg-sky-50 dark:bg-cyan-500/12 shadow-sm"
                            : isUnlocked
                              ? "border-emerald-600/40 dark:border-emerald-500/35 bg-emerald-50/70 dark:bg-emerald-500/[0.08]"
                              : tc.subPanelBg
                        }`}
                      >
                        <div>
                          <div className="nx-num flex items-center justify-between gap-2 mb-2">
                            <span
                              className={`text-[11px] font-black uppercase tracking-wider ${tc.textMain}`}
                            >
                              {tier.name}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                isCurrent
                                  ? "bg-sky-700 dark:bg-cyan-500 text-white"
                                  : isUnlocked
                                    ? "bg-emerald-100 border border-emerald-300 dark:border-transparent dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300"
                                    : "bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-400"
                              }`}
                            >
                              {isCurrent ? "Active" : isUnlocked ? "Unlocked" : `${tier.minStreak}D`}
                            </span>
                          </div>
                          <div className={`nx-num text-sm font-black ${tc.textMain}`}>
                            {tier.label}
                          </div>
                          <div className="nx-num mt-1 text-xs font-extrabold text-sky-800 dark:text-cyan-300">
                            {tier.discountLabel}
                          </div>
                          <div className={`mt-2 text-xs font-medium leading-relaxed ${tc.textMuted}`}>
                            {tier.perk}
                          </div>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-300/80 dark:border-white/10 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                          {tier.badge}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
           * TAB 6: NEXIO DOMAINS (ANS) & ON-CHAIN RECOVERY
           * ============================================================== */}
          {selectedTab === "domains" && (
            <div className={`nx-enter rounded-[2rem] p-6 sm:p-9 border ${tc.solidCardBg}`}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 mb-7">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-sky-600/35 dark:border-cyan-500/35 bg-sky-100 dark:bg-cyan-500/12 text-sky-900 dark:text-cyan-300">
                      Arc Name Service (ANS)
                    </span>
                    <a
                      href={`${ARC_EXPLORER}/address/${ANS_CONTRACT_ADDRESS}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`nx-num text-xs font-mono font-bold hover:underline inline-flex items-center gap-1 ${tc.textMuted}`}
                    >
                      <span>
                        {ANS_CONTRACT_ADDRESS.slice(0, 6)}...{ANS_CONTRACT_ADDRESS.slice(-4)}
                      </span>
                      <ExternalLinkIcon size={12} />
                    </a>
                  </div>
                  <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${tc.textMain}`}>
                    Nexio Domains (.nex)
                  </h2>
                  <p className={`text-xs sm:text-sm font-medium mt-1 max-w-xl ${tc.textMuted}`}>
                    Strict 1-Wallet-1-Domain registry. Registered .nex names never expire and cannot be overwritten.
                  </p>
                </div>

                {/* Sub-Tab Switcher */}
                <div
                  className={`flex items-center p-1 rounded-2xl border self-start md:self-center shrink-0 ${tc.segTrackBg}`}
                >
                  <button
                    type="button"
                    onClick={() => setDomainSubTab("register")}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                      domainSubTab === "register"
                        ? "bg-sky-700 dark:bg-cyan-500 text-white shadow-sm"
                        : "text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white"
                    }`}
                  >
                    <SearchIcon size={14} />
                    <span>Register / Search</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDomainSubTab("reverse")}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                      domainSubTab === "reverse"
                        ? "bg-sky-700 dark:bg-cyan-500 text-white shadow-sm"
                        : "text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white"
                    }`}
                  >
                    <ShieldCheckIcon size={14} />
                    <span>Resolve &amp; Recover</span>
                  </button>
                </div>
              </div>

              {/* Verified Connected Identity Banner */}
              {wallet && verifiedIdentityDomain && (
                <div className="mb-6 p-4 rounded-2xl border border-emerald-600/35 dark:border-emerald-500/35 bg-emerald-50 dark:bg-emerald-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                      <ShieldCheckIcon size={20} />
                    </span>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-900 dark:text-emerald-300">
                        On-Chain Verified Wallet Identity
                      </div>
                      <div className={`text-base sm:text-lg font-black ${tc.textMain}`}>
                        {verifiedIdentityDomain}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTabSwitch("trustpass")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition border border-sky-600/35 dark:border-cyan-500/35 bg-white dark:bg-cyan-500/15 text-sky-900 dark:text-cyan-200 hover:bg-sky-50 dark:hover:bg-cyan-500/25"
                  >
                    <PassBadgeIcon size={15} />
                    <span>View Nexio Pass</span>
                  </button>
                </div>
              )}

              {/* Sub-Tab 1: Register & Availability Search */}
              {domainSubTab === "register" && (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full rounded-2xl sm:rounded-full border border-slate-300 dark:border-cyan-400/40 bg-white dark:bg-[#050B16] p-2 sm:pl-5 shadow-sm focus-within:border-sky-700 dark:focus-within:border-cyan-400">
                    <div className="flex items-center gap-2.5 flex-1 px-2 sm:px-0">
                      <SearchIcon
                        size={18}
                        className="text-sky-700 dark:text-cyan-400 shrink-0"
                      />
                      <input
                        type="text"
                        value={domainSearch}
                        onChange={(e) => handleDomainSearchInputChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSearchDomain();
                        }}
                        placeholder="Search a .nex name (e.g. jubayir69)"
                        className="flex-1 min-w-0 bg-transparent border-none text-base sm:text-lg font-bold focus:outline-none py-2 text-slate-900 dark:text-white placeholder:text-slate-500"
                      />
                    </div>

                    <div className="flex items-center gap-2 justify-between sm:justify-end">
                      <span className="font-black px-3.5 py-1.5 rounded-full border text-xs sm:text-sm tracking-wider bg-sky-100 text-sky-900 border-sky-300 dark:bg-cyan-500/12 dark:text-cyan-300 dark:border-cyan-500/25">
                        .nex
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleSearchDomain()}
                        disabled={isCheckingDomain || !domainSearch.trim()}
                        className="nx-btn-primary inline-flex items-center justify-center gap-2 font-black px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-full text-sm shrink-0"
                      >
                        {isCheckingDomain ? (
                          <>
                            <RadarSpinner size={15} />
                            <span>Checking...</span>
                          </>
                        ) : (
                          <span>Search</span>
                        )}
                      </button>
                    </div>
                  </div>

                  {domainValidationMsg && (
                    <div className="flex items-center gap-2 rounded-2xl border border-rose-600/35 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-900 dark:text-rose-200">
                      <AlertTriangleIcon size={15} />
                      <span>{domainValidationMsg}</span>
                    </div>
                  )}

                  {domainTaken && !domainAvailable && !domainValidationMsg && (
                    <div className="flex items-center gap-2 rounded-2xl border border-amber-600/35 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-950 dark:text-amber-200">
                      <LockIcon size={15} />
                      <span>
                        {verifiedIdentityDomain
                          ? `This wallet already owns ${verifiedIdentityDomain}. Each address can bind one permanent .nex domain.`
                          : `${domainSearch.replace(/\.nex$/i, "")}.nex is permanently registered on Arc Mainnet.`}
                      </span>
                    </div>
                  )}

                  {domainAvailable && !domainValidationMsg && (
                    <div className="nx-enter flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-3xl border border-sky-600/35 dark:border-cyan-500/35 bg-sky-50 dark:bg-cyan-500/10">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center p-1 bg-[#050B16] border border-slate-300 dark:border-cyan-500/30 shrink-0">
                          <Image
                            src={nexioLogo}
                            alt="Nexio"
                            width={40}
                            height={40}
                            sizes="40px"
                            style={{ width: 40, height: 40 }}
                            className="h-10 w-10 object-contain rounded-xl"
                          />
                        </div>
                        <div>
                          <div className={`text-xl sm:text-2xl font-black ${tc.textMain}`}>
                            {domainSearch.replace(/\.nex$/i, "")}.nex
                          </div>
                          <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            Available · Free Registration (Arc Gas Only)
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          !wallet ? void connectWallet() : void executeRegisterDomain()
                        }
                        disabled={
                          Boolean(wallet) &&
                          (chainLocked ||
                            isRegistering ||
                            domainTaken ||
                            Boolean(verifiedIdentityDomain) ||
                            usdcBalanceRaw <= ZERO)
                        }
                        className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 font-black px-6 py-3 rounded-full text-sm ${
                          wallet && usdcBalanceRaw <= ZERO
                            ? "nx-btn-guard-warn"
                            : "nx-btn-primary"
                        }`}
                      >
                        {!wallet ? (
                          "Connect Wallet"
                        ) : chainLocked ? (
                          "Wrong Network"
                        ) : isRegistering ? (
                          <>
                            <RadarSpinner size={15} />
                            <span>Registering...</span>
                          </>
                        ) : usdcBalanceRaw <= ZERO ? (
                          "Insufficient USDC for Gas"
                        ) : (
                          "Register Permanently"
                        )}
                      </button>
                    </div>
                  )}

                  {isRegistering && txLifecycle && (
                    <TxLifecycleStepper
                      steps={txLifecycle.steps}
                      explorerUrl={ARC_EXPLORER}
                      compact
                    />
                  )}
                </div>
              )}

              {/* Sub-Tab 2: Reverse Resolution & On-Chain Wallet Recovery */}
              {domainSubTab === "reverse" && (
                <div className="space-y-6">
                  <div className={`p-5 sm:p-6 rounded-3xl border ${tc.subPanelBg}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <div>
                        <h3 className={`text-base sm:text-lg font-black ${tc.textMain}`}>
                          Reverse Lookup (0x Address → .nex)
                        </h3>
                        <p className={`text-xs ${tc.textMuted}`}>
                          Query any EVM wallet on {ARC_NETWORK_LABEL} via hasDomain and resolveByAddress.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {wallet && (
                          <button
                            type="button"
                            onClick={() => {
                              setResolveAddressInput(wallet);
                              void handleResolveAddress(wallet);
                            }}
                            className="nx-num px-3 py-1.5 rounded-xl text-xs font-extrabold border border-sky-600/35 dark:border-cyan-500/35 bg-sky-100 dark:bg-cyan-500/10 text-sky-900 dark:text-cyan-300 hover:bg-sky-200/70 dark:hover:bg-cyan-500/20 transition"
                          >
                            My Wallet ({wallet.slice(0, 6)}...{wallet.slice(-4)})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handlePasteResolveAddress()}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition"
                        >
                          Paste
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-2xl border border-slate-300 dark:border-cyan-500/30 bg-white dark:bg-[#050B16]">
                      <input
                        type="text"
                        value={resolveAddressInput}
                        onChange={(e) => {
                          resolveAddressGenRef.current += 1;
                          setResolveAddressInput(e.target.value.trim());
                          setResolvedDomainResult(null);
                          setResolvedAddressError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleResolveAddress();
                        }}
                        placeholder="0x19c27c2a8729e8A326dF24EF740832b09A607fD0"
                        className="flex-1 min-w-0 bg-transparent border-none text-xs sm:text-sm font-mono font-bold focus:outline-none px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-500"
                      />
                      {resolveAddressInput && (
                        <button
                          type="button"
                          onClick={() => {
                            resolveAddressGenRef.current += 1;
                            setResolveAddressInput("");
                            setResolvedDomainResult(null);
                            setResolvedAddressError(null);
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleResolveAddress()}
                        disabled={isResolvingAddress || !resolveAddressInput.trim()}
                        className="nx-btn-primary inline-flex items-center justify-center gap-2 font-black px-5 py-2.5 rounded-xl text-xs sm:text-sm shrink-0"
                      >
                        {isResolvingAddress ? (
                          <>
                            <RadarSpinner size={14} />
                            <span>Resolving...</span>
                          </>
                        ) : (
                          <span>Resolve Address</span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Verified Reverse Resolution Result */}
                  {resolvedDomainResult && resolvedOwnerAddress && (
                    <div className="nx-enter p-5 sm:p-7 rounded-3xl border border-sky-600/35 dark:border-cyan-500/40 bg-sky-50/80 dark:bg-cyan-500/[0.08]">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-5 pb-3.5 border-b border-slate-300 dark:border-cyan-500/20">
                        <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                          <ShieldCheckIcon size={15} />
                          <span>Verified On-Chain ANS Binding</span>
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-widest ${tc.textMuted}`}
                        >
                          Arc Mainnet · 5042
                        </span>
                      </div>

                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-5">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center p-1 shrink-0 bg-[#050B16] border border-slate-300 dark:border-cyan-500/30">
                            <Image
                              src={nexioLogo}
                              alt="Nexio"
                              width={40}
                              height={40}
                              sizes="40px"
                              style={{ width: 40, height: 40 }}
                              className="h-10 w-10 object-contain rounded-xl"
                            />
                          </div>
                          <div>
                            <div className="text-2xl sm:text-4xl font-black tracking-tight text-sky-900 dark:text-cyan-300">
                              {resolvedDomainResult}.nex
                            </div>
                            <div className={`text-xs font-bold mt-0.5 ${tc.textMuted}`}>
                              Permanent Arc Name Service Record
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleOpenSendModal(resolvedOwnerAddress)}
                            className="nx-btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs"
                          >
                            <SendArrowIcon size={14} />
                            <span>Send Funds</span>
                          </button>
                          <CopyButton
                            value={`${resolvedDomainResult}.nex`}
                            label="Copy .nex"
                            size="sm"
                          />
                        </div>
                      </div>

                      <div className="p-3.5 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-black/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-[10px] font-extrabold uppercase tracking-wider mb-0.5 ${tc.textMuted}`}
                          >
                            Owner Wallet Address
                          </div>
                          <div className="nx-num font-mono text-xs sm:text-sm font-bold break-all text-sky-900 dark:text-cyan-300">
                            {resolvedOwnerAddress}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <CopyButton value={resolvedOwnerAddress} label="Copy" size="xs" />
                          <a
                            href={`${ARC_EXPLORER}/address/${resolvedOwnerAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 dark:border-white/15 bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-slate-200 hover:border-sky-600 dark:hover:border-cyan-500 transition"
                          >
                            <span>Explorer</span>
                            <ExternalLinkIcon size={12} />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Unregistered or RPC Notice */}
                  {resolvedAddressError && (
                    <div className="nx-enter p-5 rounded-3xl border border-amber-600/35 bg-amber-50 dark:bg-amber-500/10 text-amber-950 dark:text-amber-100">
                      <div className="flex items-start gap-3">
                        <AlertTriangleIcon
                          size={20}
                          className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400"
                        />
                        <div className="flex-1">
                          <h4 className="font-black text-sm sm:text-base mb-1">
                            ANS Lookup Notice
                          </h4>
                          <p className="text-xs sm:text-sm font-medium opacity-95 mb-3">
                            {resolvedAddressError}
                          </p>
                          {resolvedOwnerAddress &&
                            wallet &&
                            resolvedOwnerAddress.toLowerCase() === wallet.toLowerCase() &&
                            !verifiedIdentityDomain && (
                              <button
                                type="button"
                                onClick={() => setDomainSubTab("register")}
                                className="nx-btn-primary px-4 py-2 rounded-xl font-black text-xs"
                              >
                                Register a .nex Domain for This Wallet
                              </button>
                            )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* On-Chain Identity Recovery Card */}
                  <div className={`p-5 sm:p-6 rounded-3xl border ${tc.subPanelBg}`}>
                    <div
                      className={`text-[11px] font-extrabold uppercase tracking-widest ${tc.textMuted}`}
                    >
                      On-Chain Identity Recovery
                    </div>
                    <p className={`mt-1.5 text-xs sm:text-sm font-medium ${tc.textMuted}`}>
                      Queries hasDomain(wallet) and resolveByAddress(wallet) directly on Arc Mainnet to restore your .nex identity across any browser or device without relying on local cache.
                    </p>
                    <div className="nx-num mt-4 rounded-2xl border border-slate-300 dark:border-white/10 bg-white dark:bg-black/30 p-3.5 font-mono text-xs sm:text-sm">
                      <div className="break-all text-slate-700 dark:text-slate-400">
                        {wallet || "No wallet connected"}
                      </div>
                      <div className={`mt-1 font-sans font-black ${tc.textMain}`}>
                        {verifiedIdentityDomain || "No verified .nex binding on this wallet"}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => void recoverBoundDomain()}
                        disabled={!wallet || isRecoveringDomain}
                        className="nx-btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-black"
                      >
                        {isRecoveringDomain ? (
                          <>
                            <RadarSpinner size={14} />
                            <span>Recovering from ANS...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCwIcon size={14} />
                            <span>Recover Bound .nex Domain</span>
                          </>
                        )}
                      </button>

                      {verifiedIdentityDomain && (
                        <button
                          type="button"
                          onClick={() => handleTabSwitch("trustpass")}
                          className="inline-flex items-center gap-1.5 rounded-full border border-sky-600/40 dark:border-cyan-500/40 bg-sky-100/85 dark:bg-cyan-500/10 px-4 py-2.5 text-xs font-black text-sky-900 dark:text-cyan-200 hover:bg-sky-200/70 dark:hover:bg-cyan-500/20 transition"
                        >
                          <PassBadgeIcon size={14} />
                          <span>Open Nexio Pass</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
           * TAB 7: NEXIO PASS (3D HOLOGRAPHIC CARD — ARC MAINNET · 5042)
           * ============================================================== */}
          {selectedTab === "trustpass" && (
            <div
              className={`nx-enter rounded-[2rem] p-6 sm:p-10 flex flex-col items-center justify-center min-h-[52vh] relative overflow-hidden border ${tc.solidCardBg}`}
            >
              {isVerifyingPass ? (
                <div className="text-center z-10 max-w-md px-4 flex flex-col items-center">
                  <OnChainSeal status="querying" size={64} className="mb-5" />
                  <h2 className={`text-2xl font-black mb-2 ${tc.textMain}`}>
                    Verifying On-Chain Identity
                  </h2>
                  <p className={`text-xs sm:text-sm font-medium mb-4 ${tc.textMuted}`}>
                    Querying resolveByAddress on Arc Name Service:
                  </p>
                  <div
                    className={`nx-num text-xs font-mono font-bold px-3.5 py-2 rounded-xl border mb-4 break-all ${tc.subPanelBg}`}
                  >
                    {ANS_CONTRACT_ADDRESS}
                  </div>
                  <div className="inline-flex items-center gap-2 text-xs font-bold text-sky-800 dark:text-cyan-300">
                    <RadarSpinner size={14} />
                    <span>Reading Arc Mainnet state...</span>
                  </div>
                </div>
              ) : !verifiedIdentityDomain ? (
                <div className="text-center z-10 max-w-lg px-4 flex flex-col items-center">
                  <OnChainSeal status="unverified" size={64} className="mb-5" />
                  <h2 className={`text-2xl sm:text-3xl font-black mb-3 ${tc.textMain}`}>
                    Unlock Your Nexio Pass
                  </h2>
                  <p className={`text-sm sm:text-base mb-7 ${tc.textMuted}`}>
                    Register a permanent .nex domain on Arc Name Service (or recover an existing on-chain binding) to mint your verified Arc Mainnet identity credential.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
                    {wallet ? (
                      <button
                        type="button"
                        onClick={() => void fetchAndVerifyPass(wallet)}
                        disabled={isVerifyingPass}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full font-black text-xs sm:text-sm border border-sky-600/40 dark:border-cyan-500/40 bg-sky-100/85 dark:bg-cyan-500/10 text-sky-900 dark:text-cyan-200 hover:bg-sky-200/70 dark:hover:bg-cyan-500/20 transition"
                      >
                        <RefreshCwIcon size={15} />
                        <span>Verify from Smart Contract</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void connectWallet()}
                        disabled={isConnecting}
                        className="nx-btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full font-black text-xs sm:text-sm"
                      >
                        {isConnecting ? (
                          <>
                            <RadarSpinner size={14} />
                            <span>Connecting...</span>
                          </>
                        ) : (
                          "Connect Wallet"
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleTabSwitch("domains")}
                      className="nx-btn-primary w-full sm:w-auto px-7 py-3.5 rounded-full font-black text-xs sm:text-sm"
                    >
                      Register .nex Domain
                    </button>
                  </div>

                  <div className={`nx-num mt-7 text-[11px] font-mono font-semibold ${tc.textMuted}`}>
                    ANS Registry: {ANS_CONTRACT_ADDRESS.slice(0, 8)}...
                    {ANS_CONTRACT_ADDRESS.slice(-6)}
                  </div>
                </div>
              ) : (
                <div className="z-10 w-full flex flex-col items-center">
                  <div className="text-center mb-7">
                    <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${tc.textMain}`}>
                      Verified Arc Mainnet Credential
                    </h2>
                    <p className="nx-num text-xs sm:text-sm font-bold mt-1 text-sky-800 dark:text-cyan-300">
                      ANS Registry {ANS_CONTRACT_ADDRESS.slice(0, 6)}...
                      {ANS_CONTRACT_ADDRESS.slice(-4)} · Chain ID 5042
                    </p>
                  </div>

                  <HoloPassCard
                    domain={verifiedIdentityDomain}
                    wallet={wallet}
                    streak={streak}
                    tierName={unlockedTier ? unlockedTier.name : undefined}
                    chainId={ARC_CHAIN_ID}
                    networkLabel="ARC MAINNET"
                    contractAddress={ANS_CONTRACT_ADDRESS}
                  />

                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => void fetchAndVerifyPass(wallet)}
                      disabled={isVerifyingPass}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full transition font-bold text-xs sm:text-sm border border-sky-600/35 dark:border-cyan-500/35 bg-sky-100/85 dark:bg-cyan-500/10 text-sky-900 dark:text-cyan-200 hover:bg-sky-200/70 dark:hover:bg-cyan-500/20 active:scale-95"
                    >
                      <RefreshCwIcon size={15} />
                      <span>Re-sync On-Chain</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleSavePassPng()}
                      disabled={isExportingPass}
                      className="nx-btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-black text-xs sm:text-sm"
                    >
                      {isExportingPass ? (
                        <>
                          <RadarSpinner size={14} />
                          <span>Exporting PNG...</span>
                        </>
                      ) : (
                        <span>Export High-DPI PNG</span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={shareOnX}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full transition font-bold text-xs sm:text-sm border border-slate-900 bg-slate-950 hover:bg-slate-800 text-white active:scale-95"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-3.5 h-3.5"
                        aria-hidden="true"
                      >
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 24.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.337H5.051z" />
                      </svg>
                      <span>Share on X</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
           * TAB 8: LIVE ARC MAINNET TRANSACTION HISTORY
           * ============================================================== */}
          {selectedTab === "history" && (
            <div className={`nx-enter rounded-[2rem] p-6 sm:p-9 border ${tc.solidCardBg}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
                <div>
                  <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${tc.textMain}`}>
                    On-Chain Activity
                  </h2>
                  <p className={`nx-num text-xs sm:text-sm font-medium mt-1 ${tc.textMuted}`}>
                    {historyScannedRange
                      ? `Indexed Arc Mainnet blocks #${historyScannedRange.from.toLocaleString()} – #${historyScannedRange.to.toLocaleString()}`
                      : "Live eth_getLogs indexing across USDC, EURC, Vaults, NLP Claims, V2 LP, Daily GM, and ANS."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {wallet && (
                    <button
                      type="button"
                      onClick={() => void loadOnChainHistory(wallet)}
                      disabled={historyLoading}
                      className="inline-flex items-center gap-1.5 rounded-full border border-sky-600/35 dark:border-cyan-500/35 bg-sky-100/85 dark:bg-cyan-500/10 px-4 py-2 text-xs font-extrabold text-sky-900 dark:text-cyan-200 hover:bg-sky-200/70 dark:hover:bg-cyan-500/20 transition disabled:opacity-50"
                    >
                      {historyLoading ? <RadarSpinner size={14} /> : <RefreshCwIcon size={14} />}
                      <span>Refresh</span>
                    </button>
                  )}

                  <a
                    href={wallet ? `${ARC_EXPLORER}/address/${wallet}` : ARC_EXPLORER}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-extrabold transition ${tc.subPanelBg} text-slate-900 dark:text-slate-100 hover:border-sky-600 dark:hover:border-cyan-500/40`}
                  >
                    <span>Arc Explorer</span>
                    <ExternalLinkIcon size={13} />
                  </a>
                </div>
              </div>

              {!wallet ? (
                <div className="text-center py-14 flex flex-col items-center">
                  <HistoryEmptyIcon size={36} className={`mb-3 ${tc.textMuted}`} />
                  <div className={`font-black text-base sm:text-lg mb-2 ${tc.textMain}`}>
                    Connect Wallet to Index On-Chain History
                  </div>
                  <p className={`text-xs sm:text-sm max-w-md mb-5 ${tc.textMuted}`}>
                    Nexio queries Arc Mainnet event logs directly for your connected address.
                  </p>
                  <button
                    type="button"
                    onClick={() => void connectWallet()}
                    disabled={isConnecting}
                    className="nx-btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-xs font-black"
                  >
                    {isConnecting ? (
                      <>
                        <RadarSpinner size={14} />
                        <span>Connecting...</span>
                      </>
                    ) : (
                      "Connect Wallet"
                    )}
                  </button>
                </div>
              ) : historyError ? (
                <div className="rounded-2xl border border-rose-600/35 bg-rose-50 dark:bg-rose-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangleIcon
                      size={20}
                      className="mt-0.5 shrink-0 text-rose-700 dark:text-rose-400"
                    />
                    <div>
                      <div className="text-sm font-black text-rose-950 dark:text-rose-100">
                        Could Not Load On-Chain Logs
                      </div>
                      <div className="text-xs font-medium text-rose-800 dark:text-rose-200 mt-0.5">
                        {historyError}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadOnChainHistory(wallet)}
                    className="nx-btn-primary shrink-0 rounded-xl px-4 py-2 text-xs font-black"
                  >
                    Retry Query
                  </button>
                </div>
              ) : historyLoading && historyEntries.length === 0 ? (
                <div className="space-y-3" aria-busy="true" aria-label="Indexing Arc Mainnet logs">
                  {[0, 1, 2, 3].map((k) => (
                    <div
                      key={k}
                      className={`rounded-2xl border p-5 flex justify-between items-center ${tc.subPanelBg}`}
                    >
                      <div className="space-y-2">
                        <div className="nx-shimmer h-4 w-44 rounded-md" />
                        <div className="nx-shimmer h-3 w-28 rounded-md" />
                      </div>
                      <div className="space-y-2 text-right">
                        <div className="nx-shimmer h-5 w-24 rounded-md" />
                        <div className="nx-shimmer h-3 w-16 rounded-md ml-auto" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : historyEntries.length === 0 ? (
                <div className="text-center py-14 flex flex-col items-center">
                  <HistoryEmptyIcon size={36} className={`mb-3 ${tc.textMuted}`} />
                  <div className={`font-black text-base sm:text-lg ${tc.textMain}`}>
                    No Recent Activity in Scanned Window
                  </div>
                  <p className={`text-xs sm:text-sm mt-1 max-w-md ${tc.textMuted}`}>
                    {historyNextCursor !== null
                      ? "Scan earlier Arc Mainnet blocks below to load older transactions."
                      : "Completed transfers, swaps, vault stakes, NLP claims, LP actions, Daily GMs, and .nex registrations appear here automatically."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyEntries.map((item) => {
                    const memoNote = sessionTxMemos[item.txHash.toLowerCase()];
                    const isNlpClaim = item.kind === "nlp_claim";
                    const isIncoming = item.direction === "in";
                    const isOutgoing = item.direction === "out";
                    const amountSign = isIncoming ? "+" : isOutgoing ? "-" : "";

                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-3.5 transition-all ${tc.historyCard}`}
                      >
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                          <span
                            className={`mt-0.5 sm:mt-0 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-xs font-black ${
                              isNlpClaim
                                ? "border-amber-600/35 bg-amber-100 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/12 dark:text-amber-300"
                                : isIncoming
                                  ? "border-emerald-600/35 bg-emerald-100 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/12 dark:text-emerald-300"
                                  : isOutgoing
                                    ? "border-sky-600/35 bg-sky-100 text-sky-800 dark:border-cyan-500/30 dark:bg-cyan-500/12 dark:text-cyan-300"
                                    : "border-indigo-600/35 bg-indigo-100 text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/12 dark:text-indigo-300"
                            }`}
                          >
                            {isNlpClaim ? (
                              <SparklesSealIcon size={17} />
                            ) : isIncoming ? (
                              <ReceiveArrowIcon size={17} />
                            ) : isOutgoing ? (
                              <SendArrowIcon size={17} />
                            ) : (
                              <ShieldCheckIcon size={17} />
                            )}
                          </span>

                          <div className="min-w-0">
                            <div
                              className={`font-black text-sm sm:text-base tracking-tight ${tc.textMain}`}
                            >
                              {item.label}
                            </div>
                            <div className="nx-num mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                              <span className={tc.textMuted}>
                                Block #{item.blockNumber.toLocaleString()} ·{" "}
                                {formatHistoryTimestamp(item.timestamp)}
                              </span>
                              {item.counterparty && (
                                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                  {isNlpClaim ? "Vault " : isIncoming ? "From " : isOutgoing ? "To " : ""}
                                  {item.counterparty.slice(0, 6)}...{item.counterparty.slice(-4)}
                                </span>
                              )}
                              {memoNote && (
                                <span className="rounded-md bg-sky-100 border border-sky-300 dark:border-transparent dark:bg-cyan-500/12 px-2 py-0.5 text-[11px] font-bold text-sky-900 dark:text-cyan-300">
                                  Memo: {memoNote}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="nx-num flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-300 dark:border-white/5">
                          {item.amountFormatted ? (
                            <div
                              className={`font-black text-base sm:text-lg tracking-tight ${
                                isIncoming
                                  ? "text-emerald-800 dark:text-emerald-400"
                                  : tc.textMain
                              }`}
                            >
                              {item.tokenSymbol
                                ? `${amountSign}${item.amountFormatted} ${item.tokenSymbol}`
                                : item.amountFormatted}
                            </div>
                          ) : (
                            <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                              Settled
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <CopyButton
                              value={item.txHash}
                              size="xs"
                              variant="ghost"
                              ariaLabel="Copy transaction hash"
                            />
                            <a
                              href={item.explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-bold text-sky-800 dark:text-cyan-300 hover:underline"
                            >
                              <span>
                                {item.txHash.slice(0, 6)}...{item.txHash.slice(-4)}
                              </span>
                              <ExternalLinkIcon size={12} />
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {wallet && historyNextCursor !== null && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      void loadOnChainHistory(wallet, {
                        toBlock: historyNextCursor,
                        append: true,
                      })
                    }
                    disabled={historyLoadingMore}
                    className={`nx-num inline-flex items-center gap-2 rounded-full border px-6 py-2.5 text-xs font-extrabold transition ${tc.subPanelBg} text-slate-900 dark:text-slate-100 hover:border-sky-600 dark:hover:border-cyan-500/40 disabled:opacity-50`}
                  >
                    {historyLoadingMore ? (
                      <>
                        <RadarSpinner size={14} />
                        <span>Scanning Older Blocks...</span>
                      </>
                    ) : (
                      <span>
                        Load Older Activity (Before Block #{(historyNextCursor + 1).toLocaleString()})
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
           * TAB 9: INSTITUTIONAL DOCUMENTATION PORTAL
           * ============================================================== */}
          {selectedTab === "docs" && (
            <div className="nx-enter">
              <Documentation theme={theme} />
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className={`mt-auto border-t py-8 md:py-10 backdrop-blur-2xl ${tc.footerBg}`}>
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-5 px-6 md:flex-row">
          <div
            className={`text-xs font-bold tracking-widest uppercase text-center md:text-left ${tc.textMuted}`}
          >
            © 2026 NEXIO PROTOCOL · BUILT ON ARC MAINNET
          </div>

          <div className="flex flex-col items-center gap-3 md:items-end">
            <div className={`text-[10px] font-black uppercase tracking-widest ${tc.textMuted}`}>
              ENGINEERED BY <span className={tc.textMain}>JUBAYIR69</span>
            </div>
            <div className="flex gap-3">
              <a
                href="https://discordapp.com/users/1209377505442537484"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
                className={`transition-all p-2.5 border rounded-full hover:scale-105 flex items-center justify-center ${tc.footerIcon}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
                </svg>
              </a>
              <a
                href="https://github.com/jubayir-hub-69"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className={`transition-all p-2.5 border rounded-full hover:scale-105 flex items-center justify-center ${tc.footerIcon}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
              </a>
              <a
                href="https://www.linkedin.com/in/jubayir-haider-302aab372"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className={`transition-all p-2.5 border rounded-full hover:scale-105 flex items-center justify-center ${tc.footerIcon}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                  aria-hidden="true"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.848-3.037-1.85 0-2.132 1.445-2.132 2.939v5.667H9.36V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
