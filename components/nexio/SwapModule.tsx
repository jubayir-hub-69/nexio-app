"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  ARC_CHAIN_ID,
  ARC_EXPLORER,
  ARC_NETWORK_LABEL,
  ERC20_ABI,
  EURC_ADDRESS,
  SLIPPAGE_PRESETS,
  USDC_ERC20_ADDRESS,
  WUSDC_DECIMALS,
  ensureExactAllowance,
  fetchMultiTokenBalances,
  formatExact,
  formatPretty,
  getTxErrorMessage,
  isAmountDraft,
  parseStrictAmount,
  poolUsdcFromNative,
  prepareAndSendTx,
  slippageLabel,
  type AllowanceStage,
  type TxExecutionStage,
} from "@/lib/contracts";
import {
  ACHSWAP_MAX_SLIPPAGE_BPS,
  DEFAULT_EURC_TOKEN,
  DEFAULT_USDC_TOKEN,
  assessStableSwap,
  describeAchswapError,
  fetchAchswapTokens,
  isAbortError,
  requestAchswapQuote,
  requestAchswapSwap,
  requestPairReferenceSpot,
  type AchswapToken,
} from "@/lib/achswap";
import { gmTierForStreak, unlockedGmTierForStreak } from "@/lib/gm-tiers";
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  LockIcon,
  RadarSpinner,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "./Icons";
import {
  PriceImpactMeter,
  QuoteFreshnessRing,
  SwapFlipButton,
  SwapRouteConduit,
} from "./ModuleVisuals";
import {
  TxLifecycleStepper,
  type TxLifecycleState,
  type TxStepItem,
  type TxStepStatus,
} from "./TxLifecycleStepper";

const ZERO = 0n;
export const SWAP_AUTO_REFRESH_MS = 5_000;

export type SwapModuleProps = {
  active: boolean;
  wallet: string;
  isArcMainnet: boolean;
  chainLocked: boolean;
  streak: number;
  usdcBalanceRaw: bigint;
  usdcSpendable: bigint;
  eurcBalanceRaw: bigint;
  txLifecycle: TxLifecycleState | null;
  txBusyRef: React.MutableRefObject<boolean>;
  getEthereum: () => ethers.Eip1193Provider | null;
  onConnectWallet: () => Promise<void>;
  onSwitchToArcMainnet: () => Promise<boolean>;
  onShowMessage: (text: string) => void;
  onSetTxLifecycle: React.Dispatch<React.SetStateAction<TxLifecycleState | null>>;
  onResetReceiptDismissed: () => void;
  onSwapBusyChange: (busy: boolean) => void;
  onSwapFinalized: () => void;
};

function sanitizeDecimalDraft(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return `${cleaned.slice(0, firstDot + 1)}${cleaned.slice(firstDot + 1).replace(/\./g, "")}`;
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

function isUserWalletRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string | number; message?: string; shortMessage?: string };
  if (err.code === 4001 || err.code === "ACTION_REJECTED") return true;
  const msg = `${err.shortMessage ?? ""} ${err.message ?? ""}`;
  return /user rejected|denied transaction|rejected the request|rejected in wallet/i.test(msg);
}

function formatUnitRate(
  refIn: bigint,
  decIn: number,
  refOut: bigint,
  decOut: number,
  invert = false
): string | null {
  if (refIn <= ZERO || refOut <= ZERO) return null;
  const inNum = Number(ethers.formatUnits(refIn, decIn));
  const outNum = Number(ethers.formatUnits(refOut, decOut));
  if (!Number.isFinite(inNum) || !Number.isFinite(outNum) || inNum <= 0 || outNum <= 0) {
    return null;
  }
  const rate = invert ? inNum / outNum : outNum / inNum;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (rate >= 1_000) {
    return rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (rate >= 1) {
    return rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  if (rate >= 0.0001) {
    return rate.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  }
  return rate.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function formatUsdCompact(usd: number | null): string | null {
  if (usd === null || !Number.isFinite(usd) || usd <= 0) return null;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  if (usd >= 1) return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${usd.toFixed(4)}`;
}

const AVATAR_PALETTES = [
  "from-sky-600 to-cyan-500",
  "from-emerald-600 to-teal-500",
  "from-indigo-600 to-blue-500",
  "from-amber-600 to-orange-500",
  "from-violet-600 to-purple-500",
  "from-rose-600 to-pink-500",
] as const;

function pickAvatarPalette(address: string): string {
  let sum = 0;
  for (let i = 0; i < address.length; i++) {
    sum = (sum + address.charCodeAt(i)) % AVATAR_PALETTES.length;
  }
  return AVATAR_PALETTES[sum];
}

function TokenAvatar({ token, size = 28 }: { token: AchswapToken; size?: number }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImg = Boolean(token.logoURI) && failedUri !== token.logoURI;
  const monogram = token.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?";

  if (showImg && token.logoURI) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={token.logoURI}
        alt={token.symbol}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailedUri(token.logoURI)}
        style={{ width: size, height: size }}
        className="rounded-full object-cover shrink-0 border border-slate-300/80 dark:border-white/15 bg-slate-100 dark:bg-slate-900"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) }}
      className={`inline-flex items-center justify-center rounded-full shrink-0 bg-gradient-to-br ${pickAvatarPalette(
        token.address
      )} text-white font-black tracking-tight shadow-xs border border-white/20`}
    >
      {monogram}
    </span>
  );
}

export function SwapModule({
  active,
  wallet,
  isArcMainnet,
  chainLocked,
  streak,
  usdcBalanceRaw,
  usdcSpendable,
  eurcBalanceRaw,
  txLifecycle,
  txBusyRef,
  getEthereum,
  onConnectWallet,
  onSwitchToArcMainnet,
  onShowMessage,
  onSetTxLifecycle,
  onResetReceiptDismissed,
  onSwapBusyChange,
  onSwapFinalized,
}: SwapModuleProps) {
  // Dynamic Token Directory State
  const [tokenCatalog, setTokenCatalog] = useState<AchswapToken[]>([
    DEFAULT_USDC_TOKEN,
    DEFAULT_EURC_TOKEN,
  ]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenBalances, setTokenBalances] = useState<Record<string, bigint>>({});
  const [balancesSyncing, setBalancesSyncing] = useState(false);

  // Selected Swap Pair
  const [tokenIn, setTokenIn] = useState<AchswapToken>(DEFAULT_USDC_TOKEN);
  const [tokenOut, setTokenOut] = useState<AchswapToken>(DEFAULT_EURC_TOKEN);
  const [flipToggle, setFlipToggle] = useState(false);
  const [invertSpotDisplay, setInvertSpotDisplay] = useState(false);

  // Token Selector Modal State
  const [selectorSide, setSelectorSide] = useState<"in" | "out" | null>(null);
  const [tokenSearchQuery, setTokenSearchQuery] = useState("");
  const [tokenFilter, setTokenFilter] = useState<"all" | "verified">("all");
  const [remoteSearchTokens, setRemoteSearchTokens] = useState<AchswapToken[]>([]);
  const [remoteSearching, setRemoteSearching] = useState(false);

  // Swap Amount, Quote & Pure Live Spot State
  const [swapInput, setSwapInput] = useState("");
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapQuote, setSwapQuote] = useState("");
  const [swapQuoteRaw, setSwapQuoteRaw] = useState<bigint>(ZERO);
  const [swapMinRaw, setSwapMinRaw] = useState<bigint>(ZERO);
  const [swapQuoteError, setSwapQuoteError] = useState("");
  const [swapQuoting, setSwapQuoting] = useState(false);
  const [swapImpactBps, setSwapImpactBps] = useState<number | null>(null);
  const [swapPartnerBps, setSwapPartnerBps] = useState<number | null>(null);
  const [swapLossBps, setSwapLossBps] = useState<number | null>(null);
  const [swapBlockReason, setSwapBlockReason] = useState("");
  const [pairSpotRef, setPairSpotRef] = useState<{
    refAmountIn: bigint;
    refAmountOut: bigint;
    tokenInAddr: string;
    tokenOutAddr: string;
  } | null>(null);
  const [quoteCycleId, setQuoteCycleId] = useState(0);
  const [manualRefreshSeq, setManualRefreshSeq] = useState(0);

  // Slippage Settings
  const [slippageBps, setSlippageBps] = useState(100);
  const [customSlippage, setCustomSlippage] = useState("");
  const [showSlippage, setShowSlippage] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const usdcLower = USDC_ERC20_ADDRESS.toLowerCase();
  const eurcLower = EURC_ADDRESS.toLowerCase();

  const gmProfile = useMemo(() => gmTierForStreak(streak), [streak]);
  const unlockedTier = useMemo(() => unlockedGmTierForStreak(streak), [streak]);

  useEffect(() => {
    onSwapBusyChange(isSwapping);
  }, [isSwapping, onSwapBusyChange]);

  // Reset input & transient balances cleanly on wallet disconnect/switch
  const prevWalletRef = useRef(wallet);
  useEffect(() => {
    if (prevWalletRef.current !== wallet) {
      prevWalletRef.current = wallet;
      const timer = window.setTimeout(() => {
        setTokenBalances({});
        setSwapInput("");
        setSwapQuote("");
        setSwapQuoteRaw(ZERO);
        setSwapMinRaw(ZERO);
        setSwapQuoteError("");
        setSwapImpactBps(null);
        setSwapPartnerBps(null);
        setSwapLossBps(null);
        setSwapBlockReason("");
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [wallet]);

  // Load full verified + live token directory from /api/achswap/tokens
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const loadCatalog = async () => {
      setTokensLoading(true);
      try {
        const fetched = await fetchAchswapTokens({ signal: controller.signal });
        if (cancelled || fetched.length === 0) return;

        setTokenCatalog(fetched);
        setTokenIn((prev) => {
          const match = fetched.find((t) => t.address.toLowerCase() === prev.address.toLowerCase());
          return match ?? prev;
        });
        setTokenOut((prev) => {
          const match = fetched.find((t) => t.address.toLowerCase() === prev.address.toLowerCase());
          return match ?? prev;
        });
      } catch (err) {
        if (!isAbortError(err)) {
          // Keep default verified USDC/EURC fallback if upstream directory is temporarily unavailable
        }
      } finally {
        if (!cancelled) setTokensLoading(false);
      }
    };

    void loadCatalog();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // Live backend token search (symbols, names, or arbitrary 0x Arc Mainnet ERC-20 addresses)
  useEffect(() => {
    if (!selectorSide) return;
    const trimmed = tokenSearchQuery.trim();
    if (!trimmed) {
      const clearTimer = window.setTimeout(() => {
        setRemoteSearchTokens([]);
        setRemoteSearching(false);
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }

    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setRemoteSearching(true);
      try {
        const hits = await fetchAchswapTokens({ query: trimmed, signal: controller.signal });
        if (!cancelled) {
          setRemoteSearchTokens(hits);
        }
      } catch (err) {
        if (!isAbortError(err) && !cancelled) {
          setRemoteSearchTokens([]);
        }
      } finally {
        if (!cancelled) setRemoteSearching(false);
      }
    }, 260);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [selectorSide, tokenSearchQuery]);

  // Focus search input and handle Escape when Token Selector Modal opens
  useEffect(() => {
    if (!selectorSide) return;
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 40);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setSelectorSide(null);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [selectorSide]);

  // Batch-read live wallet balances across all visible tokens via 1 Multicall3 call
  const trackedTokenAddresses = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of [tokenIn, tokenOut, ...tokenCatalog, ...remoteSearchTokens]) {
      map.set(t.address.toLowerCase(), t.address);
    }
    return Array.from(map.values());
  }, [tokenIn, tokenOut, tokenCatalog, remoteSearchTokens]);

  const refreshTokenBalances = useCallback(
    async (signal?: AbortSignal) => {
      if (!wallet || !isArcMainnet || trackedTokenAddresses.length === 0) return;
      setBalancesSyncing(true);
      try {
        const res = await fetchMultiTokenBalances(wallet, trackedTokenAddresses, { signal });
        if (!signal?.aborted) {
          setTokenBalances((prev) => ({ ...prev, ...res }));
        }
      } catch (err) {
        if (!isAbortError(err)) {
          // Keep last known balances on transient RPC timeouts
        }
      } finally {
        if (!signal?.aborted) setBalancesSyncing(false);
      }
    },
    [wallet, isArcMainnet, trackedTokenAddresses]
  );

  useEffect(() => {
    if (!wallet || !isArcMainnet) return;
    if (!active && !selectorSide) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void refreshTokenBalances(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [wallet, isArcMainnet, active, selectorSide, refreshTokenBalances]);

  const getTokenBalanceRaw = useCallback(
    (token: AchswapToken): bigint => {
      const lower = token.address.toLowerCase();
      if (lower === usdcLower) return poolUsdcFromNative(usdcBalanceRaw);
      if (lower === eurcLower) return eurcBalanceRaw;
      return tokenBalances[lower] ?? ZERO;
    },
    [usdcLower, eurcLower, usdcBalanceRaw, eurcBalanceRaw, tokenBalances]
  );

  const isTokenInUsdc = tokenIn.address.toLowerCase() === usdcLower;
  const tokenInBalanceRaw = getTokenBalanceRaw(tokenIn);
  const tokenOutBalanceRaw = getTokenBalanceRaw(tokenOut);
  const tokenInSpendable = isTokenInUsdc ? usdcSpendable : tokenInBalanceRaw;

  const swapStrictIn = useMemo(
    () => parseStrictAmount(swapInput, tokenIn.decimals),
    [swapInput, tokenIn.decimals]
  );
  const swapAmountIn = swapStrictIn.ok && swapStrictIn.value > ZERO ? swapStrictIn.value : null;

  const swapInsufficient = Boolean(swapAmountIn) && swapAmountIn! > tokenInSpendable;
  const swapMissingNativeGas =
    !isTokenInUsdc && Boolean(wallet) && usdcBalanceRaw <= ZERO;

  const clearQuoteDisplay = useCallback(() => {
    setSwapQuote("");
    setSwapQuoteRaw(ZERO);
    setSwapMinRaw(ZERO);
    setSwapImpactBps(null);
    setSwapPartnerBps(null);
    setSwapLossBps(null);
    setSwapBlockReason("");
  }, []);

  const syncDraftState = useCallback(
    (nextInput: string, nextDecimals: number) => {
      const trimmed = nextInput.trim();
      if (!trimmed || isAmountDraft(trimmed)) {
        setSwapQuoting(false);
        setSwapQuoteError("");
        clearQuoteDisplay();
        return;
      }
      const strict = parseStrictAmount(trimmed, nextDecimals);
      if (!strict.ok || strict.value <= ZERO) {
        setSwapQuoting(false);
        setSwapQuoteError(strict.ok ? "" : strict.error);
        clearQuoteDisplay();
        return;
      }
      setSwapQuoteError("");
      setSwapQuoting(true);
    },
    [clearQuoteDisplay]
  );

  const handleSwapInputChange = (raw: string) => {
    const clean = sanitizeDecimalDraft(raw);
    setSwapInput(clean);
    syncDraftState(clean, tokenIn.decimals);
  };

  const handleFlipPair = () => {
    const nextIn = tokenOut;
    const nextOut = tokenIn;
    setTokenIn(nextIn);
    setTokenOut(nextOut);
    setFlipToggle((prev) => !prev);
    setPairSpotRef(null);
    clearQuoteDisplay();
    // Trim fractional precision if switching to a token with fewer decimals
    let adjustedInput = swapInput;
    if (adjustedInput.includes(".")) {
      const [w, f = ""] = adjustedInput.split(".");
      if (f.length > nextIn.decimals) {
        adjustedInput = `${w}.${f.slice(0, nextIn.decimals)}`;
        setSwapInput(adjustedInput);
      }
    }
    syncDraftState(adjustedInput, nextIn.decimals);
  };

  const handleSelectToken = (chosen: AchswapToken) => {
    if (!selectorSide) return;
    if (selectorSide === "in") {
      if (chosen.address.toLowerCase() === tokenOut.address.toLowerCase()) {
        handleFlipPair();
        setSelectorSide(null);
        return;
      }
      setTokenIn(chosen);
      setPairSpotRef(null);
      clearQuoteDisplay();
      let adjustedInput = swapInput;
      if (adjustedInput.includes(".")) {
        const [w, f = ""] = adjustedInput.split(".");
        if (f.length > chosen.decimals) {
          adjustedInput = `${w}.${f.slice(0, chosen.decimals)}`;
          setSwapInput(adjustedInput);
        }
      }
      syncDraftState(adjustedInput, chosen.decimals);
    } else {
      if (chosen.address.toLowerCase() === tokenIn.address.toLowerCase()) {
        handleFlipPair();
        setSelectorSide(null);
        return;
      }
      setTokenOut(chosen);
      setPairSpotRef(null);
      clearQuoteDisplay();
      syncDraftState(swapInput, tokenIn.decimals);
    }
    // Add newly discovered custom/search tokens into local catalog for seamless switching
    setTokenCatalog((prev) =>
      prev.some((t) => t.address.toLowerCase() === chosen.address.toLowerCase())
        ? prev
        : [...prev, chosen]
    );
    setSelectorSide(null);
    setTokenSearchQuery("");
  };

  const fillSwapMax = () => {
    if (isTokenInUsdc) {
      if (usdcSpendable <= ZERO) {
        onShowMessage("Insufficient USDC remaining after the 0.005 gas buffer.");
        return;
      }
      const next = formatExact(usdcSpendable, WUSDC_DECIMALS);
      setSwapInput(next);
      syncDraftState(next, WUSDC_DECIMALS);
      return;
    }

    if (tokenInBalanceRaw <= ZERO) {
      onShowMessage(`No ${tokenIn.symbol} balance available to swap.`);
      return;
    }
    const next = formatExact(tokenInBalanceRaw, tokenIn.decimals);
    setSwapInput(next);
    syncDraftState(next, tokenIn.decimals);
  };

  const applyCustomSlippage = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    const clamped = Math.max(1, Math.min(ACHSWAP_MAX_SLIPPAGE_BPS, Math.round(n * 100)));
    setSlippageBps(clamped);
    if (swapAmountIn) setSwapQuoting(true);
  };

  // ============================================================================
  // Strict 5-Second Auto-Refresh Loop with AbortController Race Protection
  // Fetches pure unskewed spot (spotOnly: true, feeBps: 0) AND live user quote
  // ============================================================================
  useEffect(() => {
    if (!active || isSwapping) return;

    let cancelled = false;
    let activeController: AbortController | null = null;
    let debounceTimer: number | null = null;

    const runQuoteCycle = async (isBackgroundTick: boolean) => {
      if (cancelled) return;
      if (
        isBackgroundTick &&
        ((typeof document !== "undefined" && document.visibilityState === "hidden") ||
          txBusyRef.current)
      ) {
        return;
      }

      // Abort any prior in-flight cycle so slower earlier responses can never overwrite newer quotes
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      const currentIn = tokenIn;
      const currentOut = tokenOut;
      const currentAmt = swapAmountIn;

      if (currentAmt) {
        setSwapQuoting(true);
      }

      try {
        const spotPromise = requestPairReferenceSpot({
          tokenIn: currentIn,
          tokenOut: currentOut,
          chainId: ARC_CHAIN_ID,
          signal: controller.signal,
        });

        if (!currentAmt) {
          const spot = await spotPromise;
          if (cancelled || controller.signal.aborted) return;
          if (spot) {
            setPairSpotRef({
              refAmountIn: spot.refAmountIn,
              refAmountOut: spot.refAmountOut,
              tokenInAddr: currentIn.address,
              tokenOutAddr: currentOut.address,
            });
          } else {
            setPairSpotRef(null);
          }
          setQuoteCycleId((c) => c + 1);
          return;
        }

        const [quoted, spot] = await Promise.all([
          requestAchswapQuote({
            tokenIn: currentIn.address,
            tokenOut: currentOut.address,
            amountIn: currentAmt,
            slippageBps,
            chainId: ARC_CHAIN_ID,
            trader: wallet || undefined,
            signal: controller.signal,
          }),
          spotPromise,
        ]);

        if (cancelled || controller.signal.aborted) return;

        if (spot) {
          setPairSpotRef({
            refAmountIn: spot.refAmountIn,
            refAmountOut: spot.refAmountOut,
            tokenInAddr: currentIn.address,
            tokenOutAddr: currentOut.address,
          });
        }

        const effectiveSpotIn = spot ? spot.refAmountIn : null;
        const effectiveSpotOut = spot ? spot.refAmountOut : null;
        const assessed = assessStableSwap(
          currentAmt,
          quoted.amountOut,
          effectiveSpotIn,
          effectiveSpotOut,
          quoted.priceImpactBps
        );

        setSwapQuoteRaw(quoted.amountOut);
        setSwapMinRaw(quoted.minAmountOut);
        setSwapQuote(formatPretty(quoted.amountOut, currentOut.decimals, 6));
        setSwapImpactBps(quoted.priceImpactBps);
        setSwapPartnerBps(quoted.partnerBps);
        setSwapLossBps(assessed.valueLossBps);
        setSwapBlockReason(assessed.blocked ? assessed.reason : "");
        setSwapQuoteError("");
        setQuoteCycleId((c) => c + 1);
      } catch (error) {
        if (cancelled || isAbortError(error)) return;
        if (currentAmt) {
          clearQuoteDisplay();
          setSwapQuoteError(
            describeAchswapError(error) ?? "No quote available. Check pool liquidity."
          );
        }
      } finally {
        if (!cancelled && activeController === controller) {
          setSwapQuoting(false);
        }
      }
    };

    const initialDelay = swapAmountIn ? 220 : 0;
    debounceTimer = window.setTimeout(() => {
      void runQuoteCycle(false);
    }, initialDelay);

    const intervalId = window.setInterval(() => {
      void runQuoteCycle(true);
    }, SWAP_AUTO_REFRESH_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void runQuoteCycle(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      activeController?.abort();
    };
  }, [
    active,
    isSwapping,
    tokenIn,
    tokenOut,
    swapAmountIn,
    slippageBps,
    wallet,
    streak,
    manualRefreshSeq,
    txBusyRef,
    clearQuoteDisplay,
  ]);

  // Execute Universal Swap (Single-Pass /swap -> Safety Check -> Exact Approval -> Pre-Simulated Send)
  const handleSwap = async () => {
    if (!wallet) {
      onShowMessage("Connect wallet first.");
      return;
    }

    const parsedIn = parseStrictAmount(swapInput, tokenIn.decimals);
    if (!parsedIn.ok || parsedIn.value <= ZERO) {
      onShowMessage(parsedIn.ok ? "Enter an amount greater than zero." : parsedIn.error);
      return;
    }
    const amountIn = parsedIn.value;

    if (isTokenInUsdc && amountIn > usdcSpendable) {
      onShowMessage("Insufficient USDC balance after the 0.005 gas buffer.");
      return;
    }
    if (!isTokenInUsdc) {
      if (amountIn > tokenInBalanceRaw) {
        onShowMessage(`Insufficient ${tokenIn.symbol} balance.`);
        return;
      }
      if (usdcBalanceRaw <= ZERO) {
        onShowMessage("Insufficient native USDC to pay Arc Mainnet gas.");
        return;
      }
    }
    if (swapBlockReason) {
      onShowMessage(swapBlockReason);
      return;
    }

    if (!isArcMainnet) {
      onShowMessage(`Switching to ${ARC_NETWORK_LABEL}...`);
      const switched = await onSwitchToArcMainnet();
      if (!switched) {
        onShowMessage(`Switch to ${ARC_NETWORK_LABEL} (5042) manually.`);
        return;
      }
    }

    const acceptedMinOut = swapMinRaw;
    setIsSwapping(true);
    onResetReceiptDismissed();
    const opId = `swap-${Date.now()}`;

    try {
      const ethereum = getEthereum();
      if (!ethereum) throw new Error("Wallet provider not found.");
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const sender = ethers.getAddress(await signer.getAddress());

      onSetTxLifecycle({
        id: opId,
        operationTitle: `Swap ${tokenIn.symbol} → ${tokenOut.symbol}`,
        amountSummary: `${formatPretty(amountIn, tokenIn.decimals, 6)} ${tokenIn.symbol}`,
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
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          amountIn,
          slippageBps,
          chainId: ARC_CHAIN_ID,
          sender,
          recipient: sender,
          trader: sender,
        });

      let swap = await callSwapEndpoint();

      const verifySwapSafety = async (candidate: typeof swap): Promise<boolean> => {
        const spot = await requestPairReferenceSpot({
          tokenIn,
          tokenOut,
          chainId: ARC_CHAIN_ID,
        });
        const assessed = assessStableSwap(
          amountIn,
          candidate.amountOut,
          spot ? spot.refAmountIn : null,
          spot ? spot.refAmountOut : null,
          candidate.priceImpactBps
        );

        if (assessed.blocked) {
          setSwapBlockReason(assessed.reason);
          onSetTxLifecycle(null);
          onShowMessage(assessed.reason);
          return false;
        }
        if (candidate.minAmountOut <= ZERO) {
          onSetTxLifecycle(null);
          onShowMessage("Quoted minimum output is zero; swap halted for safety.");
          return false;
        }
        if (acceptedMinOut > ZERO && candidate.minAmountOut < acceptedMinOut) {
          setSwapQuoteRaw(candidate.amountOut);
          setSwapMinRaw(candidate.minAmountOut);
          setSwapQuote(formatPretty(candidate.amountOut, tokenOut.decimals, 6));
          setSwapImpactBps(candidate.priceImpactBps);
          setSwapPartnerBps(candidate.partnerBps);
          onSetTxLifecycle(null);
          onShowMessage(
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
        const readTok = new ethers.Contract(tokenIn.address, ERC20_ABI, provider);
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
                title: `Approve ${tokenIn.symbol}`,
                spender: spenderCandidate,
                status: "upcoming" as TxStepStatus,
              },
            ]
          : []),
        {
          id: "swap-exec",
          title: `Execute ${tokenIn.symbol} → ${tokenOut.symbol} Swap`,
          subtitle: `Min ${formatPretty(swap.minAmountOut, tokenOut.decimals, 6)} ${tokenOut.symbol}`,
          status: "upcoming" as TxStepStatus,
        },
      ];

      const syncState = (extra?: Partial<TxLifecycleState>) => {
        onSetTxLifecycle({
          id: opId,
          operationTitle: `Swap ${tokenIn.symbol} → ${tokenOut.symbol}`,
          amountSummary: `${formatPretty(
            amountIn,
            tokenIn.decimals,
            6
          )} ${tokenIn.symbol} → min ${formatPretty(
            swap.minAmountOut,
            tokenOut.decimals,
            6
          )} ${tokenOut.symbol}`,
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
          tokenAddress: swap.approval?.token ?? tokenIn.address,
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
        subtitle: `Min ${formatPretty(swap.minAmountOut, tokenOut.decimals, 6)} ${tokenOut.symbol}`,
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

      onShowMessage(`Swap ${tokenIn.symbol} → ${tokenOut.symbol} finalized on Arc Mainnet.`);
      setSwapInput("");
      clearQuoteDisplay();
      setSwapQuoteError("");
      onSwapFinalized();
      void refreshTokenBalances();
    } catch (error) {
      if (isUserWalletRejection(error)) {
        onSetTxLifecycle(null);
        onShowMessage("Swap rejected in wallet.");
      } else {
        const msg = describeAchswapError(error) ?? getTxErrorMessage(error);
        onSetTxLifecycle((prev) =>
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
        onShowMessage(msg);
      }
    } finally {
      setIsSwapping(false);
    }
  };

  // Filtered & Prioritized Token List for Selector Modal
  const verifiedQuickTokens = useMemo(
    () => tokenCatalog.filter((t) => t.verified).slice(0, 6),
    [tokenCatalog]
  );

  const modalTokenList = useMemo(() => {
    const byAddr = new Map<string, AchswapToken>();
    for (const t of tokenCatalog) {
      byAddr.set(t.address.toLowerCase(), t);
    }
    for (const t of remoteSearchTokens) {
      const k = t.address.toLowerCase();
      if (!byAddr.has(k)) byAddr.set(k, t);
    }

    const q = tokenSearchQuery.trim().toLowerCase();
    const list = Array.from(byAddr.values()).filter((t) => {
      if (tokenFilter === "verified" && !t.verified) return false;
      if (!q) return true;
      return (
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
      );
    });

    list.sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      const balA = getTokenBalanceRaw(a);
      const balB = getTokenBalanceRaw(b);
      if ((balA > ZERO) !== (balB > ZERO)) return balA > ZERO ? -1 : 1;
      const liqA = a.liquidityUsd ?? 0;
      const liqB = b.liquidityUsd ?? 0;
      if (liqB !== liqA) return liqB - liqA;
      return a.symbol.localeCompare(b.symbol);
    });

    return list;
  }, [tokenCatalog, remoteSearchTokens, tokenSearchQuery, tokenFilter, getTokenBalanceRaw]);

  const activeSpotText = useMemo(() => {
    if (
      !pairSpotRef ||
      pairSpotRef.tokenInAddr.toLowerCase() !== tokenIn.address.toLowerCase() ||
      pairSpotRef.tokenOutAddr.toLowerCase() !== tokenOut.address.toLowerCase()
    ) {
      return null;
    }
    const formatted = formatUnitRate(
      pairSpotRef.refAmountIn,
      tokenIn.decimals,
      pairSpotRef.refAmountOut,
      tokenOut.decimals,
      invertSpotDisplay
    );
    if (!formatted) return null;
    return invertSpotDisplay
      ? `1 ${tokenOut.symbol} = ${formatted} ${tokenIn.symbol}`
      : `1 ${tokenIn.symbol} = ${formatted} ${tokenOut.symbol}`;
  }, [pairSpotRef, tokenIn, tokenOut, invertSpotDisplay]);

  const tokenInBalanceLabel = formatPretty(tokenInBalanceRaw, tokenIn.decimals, 6);
  const tokenOutBalanceLabel = formatPretty(tokenOutBalanceRaw, tokenOut.decimals, 6);

  return (
    <>
      {/* Universal Token Selector Modal */}
      {selectorSide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="token-selector-title"
          onClick={() => setSelectorSide(null)}
          className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="nx-enter w-full max-w-md max-h-[min(86dvh,680px)] flex flex-col rounded-[2rem] border border-slate-300 bg-white shadow-2xl text-slate-900 dark:border-white/12 dark:bg-[#071326] dark:text-white overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-200 dark:border-white/10">
              <div>
                <h3
                  id="token-selector-title"
                  className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white"
                >
                  Select Token ({selectorSide === "in" ? "Pay" : "Receive"})
                </h3>
                <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mt-0.5">
                  Arc Mainnet Live Directory · {tokenCatalog.length} tokens indexed
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectorSide(null)}
                aria-label="Close token selector"
                className="rounded-full p-2 text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 transition"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            {/* Search & Filters */}
            <div className="px-5 pt-4 pb-3 space-y-3 border-b border-slate-200/80 dark:border-white/[0.08]">
              <div className="flex items-center gap-2.5 rounded-2xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-black/45 px-3.5 py-2.5 focus-within:border-sky-700 dark:focus-within:border-cyan-400 transition">
                <SearchIcon size={16} className="text-slate-500 dark:text-slate-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={tokenSearchQuery}
                  onChange={(e) => setTokenSearchQuery(e.target.value)}
                  placeholder="Search symbol, name, or paste 0x address"
                  className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none"
                />
                {remoteSearching && <RadarSpinner size={15} className="text-sky-700 dark:text-cyan-400" />}
                {tokenSearchQuery && !remoteSearching && (
                  <button
                    type="button"
                    onClick={() => setTokenSearchQuery("")}
                    aria-label="Clear search"
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-extrabold text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Verified Quick-Pick Chips */}
              {verifiedQuickTokens.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {verifiedQuickTokens.map((t) => {
                    const isSelected =
                      (selectorSide === "in" ? tokenIn.address : tokenOut.address).toLowerCase() ===
                      t.address.toLowerCase();
                    return (
                      <button
                        key={t.address}
                        type="button"
                        onClick={() => handleSelectToken(t)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black transition active:scale-95 ${
                          isSelected
                            ? "border-sky-700 bg-sky-100 text-sky-950 dark:border-cyan-400 dark:bg-cyan-500/20 dark:text-cyan-200"
                            : "border-slate-300 bg-white hover:bg-slate-100 text-slate-900 dark:border-white/12 dark:bg-white/[0.04] dark:hover:bg-white/10 dark:text-slate-100"
                        }`}
                      >
                        <TokenAvatar token={t} size={18} />
                        <span>{t.symbol}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* All vs Verified Filter Bar */}
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-xl border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-black/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => setTokenFilter("all")}
                    className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition ${
                      tokenFilter === "all"
                        ? "bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950"
                        : "text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                    }`}
                  >
                    All Tokens
                  </button>
                  <button
                    type="button"
                    onClick={() => setTokenFilter("verified")}
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-extrabold transition ${
                      tokenFilter === "verified"
                        ? "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-slate-950"
                        : "text-slate-700 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white"
                    }`}
                  >
                    <ShieldCheckIcon size={12} />
                    <span>Verified</span>
                  </button>
                </div>

                {wallet && isArcMainnet && (
                  <button
                    type="button"
                    onClick={() => void refreshTokenBalances()}
                    disabled={balancesSyncing}
                    className="inline-flex items-center gap-1 text-[11px] font-extrabold text-sky-800 dark:text-cyan-300 hover:underline disabled:opacity-50"
                  >
                    {balancesSyncing ? <RadarSpinner size={12} /> : <RefreshCwIcon size={12} />}
                    <span>Sync Balances</span>
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Token Rows */}
            <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-1">
              {tokensLoading && modalTokenList.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-2 text-slate-600 dark:text-slate-400">
                  <RadarSpinner size={22} />
                  <span className="text-xs font-bold">Loading live Arc Mainnet tokens...</span>
                </div>
              ) : modalTokenList.length === 0 ? (
                <div className="py-10 px-4 text-center">
                  <div className="text-sm font-black text-slate-900 dark:text-white">
                    No matching tokens found
                  </div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-1">
                    Try another symbol or paste a valid 0x Arc Mainnet ERC-20 token address.
                  </p>
                </div>
              ) : (
                modalTokenList.map((token) => {
                  const activeAddr =
                    selectorSide === "in" ? tokenIn.address : tokenOut.address;
                  const isCurrent =
                    activeAddr.toLowerCase() === token.address.toLowerCase();
                  const balRaw = getTokenBalanceRaw(token);
                  const hasBal = balRaw > ZERO;
                  const balFormatted = formatPretty(balRaw, token.decimals, 6);
                  const usdUnitLabel = formatUsdCompact(token.priceUsd);

                  return (
                    <button
                      key={token.address}
                      type="button"
                      onClick={() => handleSelectToken(token)}
                      className={`w-full flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition ${
                        isCurrent
                          ? "border-sky-600/50 bg-sky-50 dark:border-cyan-400/45 dark:bg-cyan-500/12"
                          : "border-transparent hover:border-slate-300 hover:bg-slate-100/90 dark:hover:border-white/10 dark:hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <TokenAvatar token={token} size={34} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-sm text-slate-900 dark:text-white truncate">
                              {token.symbol}
                            </span>
                            {token.verified ? (
                              <span
                                title="Verified Arc Mainnet token"
                                className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 border border-emerald-300 dark:border-emerald-500/30 dark:bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-900 dark:text-emerald-300"
                              >
                                <ShieldCheckIcon size={10} />
                                <span>Verified</span>
                              </span>
                            ) : (
                              <span
                                title="Unverified community token — verify contract address carefully"
                                className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 border border-amber-300 dark:border-amber-500/30 dark:bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300"
                              >
                                Unverified
                              </span>
                            )}
                            {isCurrent && (
                              <CheckIcon size={14} className="text-sky-700 dark:text-cyan-400 shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400 truncate mt-0.5">
                            <span className="truncate">{token.name}</span>
                            {!token.verified && (
                              <span className="font-mono text-[10px] opacity-80 shrink-0">
                                · {token.address.slice(0, 6)}…{token.address.slice(-4)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="nx-num text-right shrink-0">
                        <div
                          className={`text-sm font-black ${
                            hasBal
                              ? "text-slate-900 dark:text-white"
                              : "text-slate-500 dark:text-slate-500"
                          }`}
                        >
                          {wallet ? (hasBal ? balFormatted : "0.00") : usdUnitLabel ?? "—"}
                        </div>
                        {wallet && usdUnitLabel && (
                          <div className="text-[10px] font-bold text-slate-600 dark:text-slate-400">
                            {usdUnitLabel} / unit
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Swap Card */}
      <div className="nx-enter w-full max-w-lg mx-auto">
        <div className="p-5 sm:p-7 rounded-[2rem] border bg-white border-slate-300 shadow-sm dark:bg-[#071120]/85 dark:border-white/10 dark:backdrop-blur-2xl dark:shadow-[0_24px_60px_-15px_rgba(2,6,23,0.7)]">
          {/* Card Header */}
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
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
              <p className="text-xs mt-1 font-bold text-slate-700 dark:text-slate-400">
                Universal Arc Mainnet Routing · 5s Real-Time Quotes
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <QuoteFreshnessRing
                quoting={swapQuoting}
                hasQuote={Boolean(activeSpotText || (swapQuoteRaw > ZERO && !swapQuoteError))}
                quoteKey={quoteCycleId}
                ttlMs={SWAP_AUTO_REFRESH_MS}
                onRefresh={() => {
                  if (isSwapping) return;
                  if (swapAmountIn) setSwapQuoting(true);
                  setManualRefreshSeq((s) => s + 1);
                }}
                disabled={isSwapping}
              />
              <button
                type="button"
                onClick={() => setShowSlippage((v) => !v)}
                className="nx-num rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider border transition bg-[#eef2f6] border-slate-300 dark:bg-black/35 dark:border-white/[0.08] text-slate-900 dark:text-slate-100 hover:border-sky-600 dark:hover:border-cyan-500/40"
              >
                Slip {slippageLabel(slippageBps)}
              </button>
            </div>
          </div>

          {/* Slippage Drawer */}
          {showSlippage && (
            <div className="nx-enter mb-4 p-3.5 rounded-2xl border bg-[#eef2f6] border-slate-300 dark:bg-black/35 dark:border-white/[0.08]">
              <div className="text-[10px] font-extrabold uppercase tracking-widest mb-2 text-slate-700 dark:text-slate-400">
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
                    applyCustomSlippage(val);
                  }}
                  placeholder="Custom %"
                  className="nx-num w-24 rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-sky-700 dark:border-white/12 dark:bg-black/45 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-cyan-400 px-3 py-1.5 text-xs font-bold focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Unverified Token Caution Banner */}
          {(!tokenIn.verified || !tokenOut.verified) && (
            <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-600/40 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2.5 text-[11px] font-bold text-amber-950 dark:text-amber-200">
              <AlertTriangleIcon size={15} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>
                You selected an unverified community token. Confirm its symbol and on-chain price impact before signing.
              </span>
            </div>
          )}

          <div className="space-y-2.5">
            {/* Pay Input Box */}
            <div className="rounded-2xl border p-4 bg-[#eef2f6] border-slate-300 dark:bg-black/35 dark:border-white/[0.08]">
              <div className="nx-num flex justify-between items-center mb-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-400">
                  You Pay
                </span>
                <span className="text-[11px] font-bold flex items-center gap-2 text-slate-700 dark:text-slate-400">
                  <span>
                    Bal: {tokenInBalanceLabel} {tokenIn.symbol}
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

              <div className="flex items-center gap-2.5">
                <input
                  type="text"
                  inputMode="decimal"
                  value={swapInput}
                  onChange={(e) => handleSwapInputChange(e.target.value)}
                  placeholder="0.00"
                  className="nx-num flex-1 min-w-0 bg-transparent border-none outline-none font-black text-2xl sm:text-3xl text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  disabled={isSwapping}
                  onClick={() => {
                    setTokenSearchQuery("");
                    setSelectorSide("in");
                  }}
                  className="inline-flex items-center gap-2 shrink-0 pl-2 pr-3 py-1.5 rounded-2xl border border-slate-300 bg-white hover:border-sky-600 dark:border-white/15 dark:bg-[#0B192E] dark:hover:border-cyan-400/50 text-slate-900 dark:text-white shadow-xs transition active:scale-95 disabled:opacity-50"
                >
                  <TokenAvatar token={tokenIn} size={24} />
                  <span className="text-sm sm:text-base font-black tracking-tight max-w-[92px] truncate">
                    {tokenIn.symbol}
                  </span>
                  <ChevronDownIcon size={15} className="text-slate-600 dark:text-slate-400" />
                </button>
              </div>
            </div>

            {/* Interactive Pair Flip Control */}
            <div className="flex justify-center -my-3">
              <SwapFlipButton
                direction={flipToggle ? "EURCtoUSDC" : "USDCtoEURC"}
                onClick={handleFlipPair}
                disabled={isSwapping}
              />
            </div>

            {/* Receive Output Box */}
            <div className="rounded-2xl border p-4 bg-[#eef2f6] border-slate-300 dark:bg-black/35 dark:border-white/[0.08]">
              <div className="nx-num flex justify-between items-center mb-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-400">
                  You Receive (Estimated)
                </span>
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400">
                  Bal: {tokenOutBalanceLabel} {tokenOut.symbol}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2.5">
                <div className="nx-num flex-1 min-w-0 font-black text-2xl sm:text-3xl break-all text-slate-900 dark:text-white">
                  {swapQuoting && !swapQuote ? (
                    <span className="nx-shimmer inline-block h-8 w-32 rounded-lg" />
                  ) : (
                    swapQuote || "0.00"
                  )}
                </div>
                <button
                  type="button"
                  disabled={isSwapping}
                  onClick={() => {
                    setTokenSearchQuery("");
                    setSelectorSide("out");
                  }}
                  className="inline-flex items-center gap-2 shrink-0 pl-2 pr-3 py-1.5 rounded-2xl border border-slate-300 bg-white hover:border-sky-600 dark:border-white/15 dark:bg-[#0B192E] dark:hover:border-cyan-400/50 text-slate-900 dark:text-white shadow-xs transition active:scale-95 disabled:opacity-50"
                >
                  <TokenAvatar token={tokenOut} size={24} />
                  <span className="text-sm sm:text-base font-black tracking-tight max-w-[92px] truncate">
                    {tokenOut.symbol}
                  </span>
                  <ChevronDownIcon size={15} className="text-slate-600 dark:text-slate-400" />
                </button>
              </div>

              {swapQuoteRaw > ZERO && (
                <div className="nx-num text-[11px] font-bold mt-2 text-slate-700 dark:text-slate-400">
                  Min received ({slippageLabel(slippageBps)}):{" "}
                  {formatPretty(swapMinRaw, tokenOut.decimals, 6)} {tokenOut.symbol}
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

            {/* Live Pure Spot Ticker Bar (0 bps Spot · 5s Auto-Refresh) */}
            <div className="nx-num flex items-center justify-between gap-2 rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-slate-100/90 dark:bg-black/25 px-3.5 py-2 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setInvertSpotDisplay((v) => !v)}
                className="text-left text-slate-900 dark:text-slate-200 hover:text-sky-800 dark:hover:text-cyan-300 transition truncate"
                title="Click to invert spot rate"
              >
                {activeSpotText ?? "Fetching live 0-fee market spot..."}
              </button>
              <span className="inline-flex items-center gap-1.5 shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse" />
                <span>Live · 5s</span>
              </span>
            </div>

            {/* Route Conduit & Price Impact Guard */}
            <SwapRouteConduit
              tokenInSymbol={tokenIn.symbol.slice(0, 7)}
              tokenOutSymbol={tokenOut.symbol.slice(0, 7)}
              quoting={swapQuoting}
              swapping={isSwapping}
              hasQuote={swapQuoteRaw > ZERO && !swapQuoteError}
              partnerFeeBps={swapPartnerBps ?? (wallet ? gmProfile.feeBps : null)}
            />

            <PriceImpactMeter
              priceImpactBps={swapImpactBps}
              valueLossBps={swapLossBps}
              blocked={Boolean(swapBlockReason)}
              blockReason={swapBlockReason || undefined}
            />

            {/* Primary Execution CTA */}
            <button
              type="button"
              onClick={() => (!wallet ? void onConnectWallet() : void handleSwap())}
              disabled={
                Boolean(wallet) &&
                (chainLocked ||
                  isSwapping ||
                  swapQuoting ||
                  !swapAmountIn ||
                  swapQuoteRaw <= ZERO ||
                  Boolean(swapQuoteError) ||
                  swapInsufficient ||
                  swapMissingNativeGas ||
                  Boolean(swapBlockReason))
              }
              className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base sm:text-lg font-black ${
                !wallet
                  ? "nx-btn-primary"
                  : swapBlockReason
                    ? "nx-btn-guard-block"
                    : swapInsufficient || swapMissingNativeGas
                      ? "nx-btn-guard-warn"
                      : tokenOut.address.toLowerCase() === usdcLower
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
                `Insufficient ${tokenIn.symbol} Balance`
              ) : swapMissingNativeGas ? (
                "Insufficient Native USDC for Gas"
              ) : swapQuoteError ? (
                "Quote Unavailable"
              ) : (
                `Swap ${tokenIn.symbol} → ${tokenOut.symbol}`
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
    </>
  );
}
