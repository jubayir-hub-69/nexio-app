"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ethers } from "ethers";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import {
  WUSDC_ADDRESS,
  FACTORY_ADDRESS,
  ROUTER_ADDRESS,
  DAILY_GM_ADDRESS,
  DAILY_GM_ABI,
  ANS_CONTRACT_ADDRESS,
  ANS_ABI,
  WUSDC_DECIMALS,
  EURC_DECIMALS,
  LP_DECIMALS,
  ERC20_ABI as TOKEN_ABI,
  WUSDC_ABI,
  ROUTER_ABI,
  PAIR_ABI,
  applySlippage,
  BALANCE_CACHE_MS,
  fetchPairState,
  formatDisplay,
  formatExact,
  formatPretty,
  formatSharePercent,
  getArcReadProvider,
  getTxErrorMessage,
  invalidatePairCache,
  isAmountDraft,
  maxNativeSpend,
  parseAmount,
  slippageLabel,
  SLIPPAGE_PRESETS,
  swapDeadline,
  underlyingFromLp,
  sanitizeAnsName,
  resolveAddressToDomain,
  resolveDomainToAddress,
  isDomainAvailable,
} from "@/lib/contracts";

const QrScanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  { ssr: false }
);

const ARC_CHAIN_ID = 5042002;
const ARC_CHAIN_ID_HEX = "0x4cef52";
const ARC_RPC = "https://rpc.testnet.arc.network";
const ARC_EXPLORER = "https://testnet.arcscan.app";
const ARC_FAUCET = "https://faucet.circle.com";

const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

// REAL DEPLOYED SMART CONTRACTS
const EURC_VAULT_ADDRESS = "0x9b3D45Fb7Ce921baB078aB270f7f67b54Fc7c0AC";
const USDC_VAULT_ADDRESS = "0x0cbF1bA0D6F7e820f25FBE473Be352E516C0F1C8";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

const EURC_VAULT_ABI = [
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function stakedBalance(address) external view returns (uint256)",
  "function getPendingYield(address user) external view returns (uint256)"
];

const USDC_VAULT_ABI = [
  "function deposit() external payable",
  "function withdraw(uint256 amount) external",
  "function stakedBalance(address) external view returns (uint256)",
  "function getPendingYield(address user) external view returns (uint256)"
];



type ActivityItem = {
  id: number;
  label: string;
  amount: string;
  meta: string;
  status: "Completed" | "Pending" | "Failed";
  txHash?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeDomainName = (raw: string) =>
  raw.trim().toLowerCase().replace(/\.nex$/i, "").replace(/[^a-z0-9-]/g, "");

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [message, setMessage] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);

  const [selectedTab, setSelectedTab] = useState<"overview" | "portfolio" | "swap" | "lp" | "dailygm" | "domains" | "trustpass" | "history" | "learn">("overview");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [usdcBalance, setUsdcBalance] = useState("0.00");
  const [eurcBalance, setEurcBalance] = useState("0.00");
  const [usdcBalanceRaw, setUsdcBalanceRaw] = useState<bigint>(BigInt(0));
  const [eurcBalanceRaw, setEurcBalanceRaw] = useState<bigint>(BigInt(0));
  const [wusdcBalanceRaw, setWusdcBalanceRaw] = useState<bigint>(BigInt(0));
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesReady, setBalancesReady] = useState(false);
  const balanceCacheRef = useRef({ address: "", at: 0 });
  const balanceInflightRef = useRef<Promise<void> | null>(null);
  const txBusyRef = useRef(false);
  const lastSwapQuoteKeyRef = useRef("");
  const lastLpQuoteKeyRef = useRef("");
  const walletRef = useRef("");
  const registeredDomainRef = useRef("");
  const resolveAddressGenRef = useRef(0);
  const verifyPassGenRef = useRef(0);
  const messageTimerRef = useRef<number | null>(null);
  const sendLockRef = useRef(false);
  const yieldPartsRef = useRef({ eurc: 0, usdc: 0 });
  const [passVerified, setPassVerified] = useState(false);
  const [isVerifyingPass, setIsVerifyingPass] = useState(false);

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

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [requestAsset, setRequestAsset] = useState<"USDC" | "EURC">("USDC");
  const [paymentLink, setPaymentLink] = useState("");

  const [streak, setStreak] = useState(0);
  const [lastCheckInTime, setLastCheckInTime] = useState(0);
  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  const [domainSearch, setDomainSearch] = useState("");
  const [domainAvailable, setDomainAvailable] = useState(false);
  const [isCheckingDomain, setIsCheckingDomain] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showDomainSuccess, setShowDomainSuccess] = useState(false);
  const [registeredDomain, setRegisteredDomain] = useState("");
  const [registrationHash, setRegistrationHash] = useState("");

  // REVERSE DOMAIN RESOLUTION STATES
  const [domainSubTab, setDomainSubTab] = useState<"register" | "reverse">("register");
  const [resolveAddressInput, setResolveAddressInput] = useState("");
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [resolvedDomainResult, setResolvedDomainResult] = useState<string | null>(null);
  const [resolvedOwnerAddress, setResolvedOwnerAddress] = useState<string | null>(null);
  const [resolvedAddressError, setResolvedAddressError] = useState<string | null>(null);
  const [hasSearchedAddress, setHasSearchedAddress] = useState(false);
  const [resolvedRecipientDomain, setResolvedRecipientDomain] = useState<string | null>(null);
  const [isResolvingRecipient, setIsResolvingRecipient] = useState(false);

  const [txHistory, setTxHistory] = useState<ActivityItem[]>([]);
  const [networkLatency, setNetworkLatency] = useState(0);

  // REAL DEFI VAULT STATES
  const [vaultAsset, setVaultAsset] = useState<"USDC" | "EURC">("USDC");
  const [usdcStakedBalance, setUsdcStakedBalance] = useState("0.00");
  const [eurcStakedBalance, setEurcStakedBalance] = useState("0.00");
  const [liveEurcUsdRate, setLiveEurcUsdRate] = useState<number>(1.09);

  const [lifetimePts, setLifetimePts] = useState(0);
  const [claimedPts, setClaimedPts] = useState(0);
  const unclaimedPts = claimedPts > lifetimePts
    ? lifetimePts
    : Math.max(0, lifetimePts - claimedPts);

  const [vaultInput, setVaultInput] = useState("");
  const [isVaultLoading, setIsVaultLoading] = useState(false);
  const [vaultAction, setVaultAction] = useState<"stake" | "withdraw" | "claim" | null>(null);

  // SWAP STATES
  const [swapInput, setSwapInput] = useState("");
  const [swapDirection, setSwapDirection] = useState<"USDCtoEURC" | "EURCtoUSDC">("USDCtoEURC");
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapStatus, setSwapStatus] = useState<"approving" | "confirm" | "pending" | null>(null);
  const [swapQuote, setSwapQuote] = useState("");
  const [swapQuoteRaw, setSwapQuoteRaw] = useState<bigint>(BigInt(0));
  const [swapQuoteError, setSwapQuoteError] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [customSlippage, setCustomSlippage] = useState("");
  const [showSlippage, setShowSlippage] = useState(false);

  // LP STATES
  const [lpMode, setLpMode] = useState<"add" | "remove">("add");
  const [lpUsdcInput, setLpUsdcInput] = useState("");
  const [lpEurcInput, setLpEurcInput] = useState("");
  const [lpLastEdited, setLpLastEdited] = useState<"usdc" | "eurc">("usdc");
  const [lpRemoveInput, setLpRemoveInput] = useState("");
  const [lpRemoveIsMax, setLpRemoveIsMax] = useState(false);
  const [isLpLoading, setIsLpLoading] = useState(false);
  const [lpAction, setLpAction] = useState<"add" | "remove" | "approve" | null>(null);
  const [lpBalance, setLpBalance] = useState("0.00");
  const [lpBalanceRaw, setLpBalanceRaw] = useState<bigint>(BigInt(0));
  const [lpSharePct, setLpSharePct] = useState("0");
  const [lpPooledUsdc, setLpPooledUsdc] = useState("0.00");
  const [lpPooledEurc, setLpPooledEurc] = useState("0.00");
  const [poolReserveUsdc, setPoolReserveUsdc] = useState("0.00");
  const [poolReserveEurc, setPoolReserveEurc] = useState("0.00");
  const [lpPairAddress, setLpPairAddress] = useState("");
  const [lpRemovePreviewUsdc, setLpRemovePreviewUsdc] = useState("");
  const [lpRemovePreviewEurc, setLpRemovePreviewEurc] = useState("");
  const [lpSlippageBps, setLpSlippageBps] = useState(100);
  const [lpCustomSlippage, setLpCustomSlippage] = useState("");
  const [showLpSlippage, setShowLpSlippage] = useState(false);

  const isArcTestnet = chainId === ARC_CHAIN_ID;
  txBusyRef.current = isSending || isVaultLoading || isSwapping || isLpLoading;
  walletRef.current = wallet;
  registeredDomainRef.current = registeredDomain;

  // --- PORTFOLIO CALCULATION LOGIC ---
  const usdcWalletValue = parseFloat(usdcBalance || "0");
  const eurcWalletValue = parseFloat(eurcBalance || "0");
  const uStakedValue = parseFloat(usdcStakedBalance || "0");
  const eStakedValue = parseFloat(eurcStakedBalance || "0");
  const lpUsdcValue = parseFloat(lpPooledUsdc || "0");
  const lpEurcValue = parseFloat(lpPooledEurc || "0");
  const wusdcWalletValue = parseFloat(formatPretty(wusdcBalanceRaw, WUSDC_DECIMALS, 6) || "0");

  const totalUsdcValue = usdcWalletValue + uStakedValue + lpUsdcValue + wusdcWalletValue;
  const totalEurcValue = eurcWalletValue + eStakedValue + lpEurcValue;
  const eurcUsdRate = liveEurcUsdRate;
  const netWorthUsd = totalUsdcValue + (totalEurcValue * eurcUsdRate);

  const usdcPercent = netWorthUsd > 0 ? ((totalUsdcValue / netWorthUsd) * 100).toFixed(0) : "0";
  const eurcPercent = netWorthUsd > 0 ? (((totalEurcValue * eurcUsdRate) / netWorthUsd) * 100).toFixed(0) : "0";

  let totalVolume = 0;
  txHistory.forEach(tx => {
    if (tx.status === "Completed" && tx.amount && tx.amount.startsWith("-")) {
      totalVolume += parseFloat(tx.amount.replace(/[^0-9.]/g, ""));
    }
  });
  // -----------------------------------

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const to = params.get("to");
      const amount = params.get("amount");
      const token = params.get("token");

      const tab = params.get("tab");
      if (tab === "lp" || tab === "swap" || tab === "portfolio" || tab === "overview" || tab === "dailygm" || tab === "domains" || tab === "trustpass" || tab === "history" || tab === "learn") {
        setSelectedTab(tab);
      }

      if (to && amount) {
        setSendAddress(to);
        setSendAmount(amount);
        if (token === "EURC") setSendAsset("EURC");
        else setSendAsset("USDC");

        setShowSendModal(true);

        setTimeout(() => {
          showMessage(`Payment Request Received: ${amount} ${token || "USDC"}`);
        }, 1500);

        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  useEffect(() => {
    const oldTheme = localStorage.getItem("trustbank_theme");
    if (oldTheme && !localStorage.getItem("nexio_theme")) {
      localStorage.setItem("nexio_theme", oldTheme);
    }
    const savedTheme = localStorage.getItem("nexio_theme") as "dark" | "light";
    if (savedTheme) setTheme(savedTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("nexio_theme", newTheme);
  };

  const addHistoryRecord = (label: string, amount: string, meta: string, status: "Completed" | "Pending" | "Failed", txHash?: string) => {
    setTxHistory((prev) => {
      const newHistory = [{ id: Date.now(), label, amount, meta, status, txHash }, ...prev];
      if (wallet) {
        localStorage.setItem(`nexio_history_${wallet}`, JSON.stringify(newHistory.slice(0, 50)));
      }
      return newHistory;
    });
  };

  const showMessage = (text: string) => {
    setMessage(text);
    if (messageTimerRef.current) window.clearTimeout(messageTimerRef.current);
    messageTimerRef.current = window.setTimeout(() => setMessage(""), 4000);
  };

  const getEthereum = () => {
    if (typeof window === "undefined") return null;
    const eth = (window as any).ethereum;
    if (!eth) return null;

    if (eth.providers && eth.providers.length > 0) {
      const rabby = eth.providers.find((p: any) => p.isRabby);
      if (rabby) return rabby;
      const metaMask = eth.providers.find((p: any) => p.isMetaMask && !p.isPhantom);
      if (metaMask) return metaMask;
      return eth.providers[0];
    }
    return eth;
  };

  const syncNetwork = async () => {
    const ethereum = getEthereum();
    if (!ethereum) return null;
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);
      setChainId(currentChainId);
      return currentChainId;
    } catch {
      return null;
    }
  };

  const fetchBalances = useCallback(async (address: string, options?: { force?: boolean }) => {
    if (!address) return;
    const normalized = address.toLowerCase();
    const force = !!options?.force;
    const now = Date.now();

    if (
      !force &&
      balanceCacheRef.current.address === normalized &&
      now - balanceCacheRef.current.at < BALANCE_CACHE_MS
    ) {
      return;
    }

    if (balanceInflightRef.current) {
      await balanceInflightRef.current;
      if (
        !force &&
        balanceCacheRef.current.address === normalized &&
        Date.now() - balanceCacheRef.current.at < BALANCE_CACHE_MS
      ) {
        return;
      }
    }

    const run = async () => {
      const firstLoad = balanceCacheRef.current.address !== normalized;
      if (firstLoad) setBalancesLoading(true);

      try {
        const provider = getArcReadProvider();
        const eurcContract = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, provider);
        const wusdcContract = new ethers.Contract(WUSDC_ADDRESS, WUSDC_ABI, provider);
        const eurcVault = new ethers.Contract(EURC_VAULT_ADDRESS, EURC_VAULT_ABI, provider);
        const usdcVault = new ethers.Contract(USDC_VAULT_ADDRESS, USDC_VAULT_ABI, provider);
        const dailyGmContract = new ethers.Contract(DAILY_GM_ADDRESS, DAILY_GM_ABI, provider);

        try {
          const routerRate = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);
          const oneEurc = ethers.parseUnits("1", 6);
          const amounts = await routerRate.getAmountsOut(oneEurc, [EURC_ADDRESS, WUSDC_ADDRESS]);
          const fetchedRate = parseFloat(ethers.formatUnits(amounts[1], 18));
          if (fetchedRate > 0) setLiveEurcUsdRate(fetchedRate);
        } catch (rateError) {
          console.error("Failed to fetch live rate", rateError);
        }

        const start = Date.now();
        const [
          nativeUsdcRes,
          eurcRes,
          wusdcRes,
          pairRes,
          eurcStakedRes,
          usdcStakedRes,
          eurcYieldRes,
          usdcYieldRes,
          lastCheckInRes,
          streakRes,
        ] = await Promise.allSettled([
          provider.getBalance(address),
          eurcContract.balanceOf(address),
          wusdcContract.balanceOf(address),
          fetchPairState(provider, EURC_ADDRESS, { force }),
          eurcVault.stakedBalance(address),
          usdcVault.stakedBalance(address),
          eurcVault.getPendingYield(address),
          usdcVault.getPendingYield(address),
          dailyGmContract.lastCheckIn(address),
          dailyGmContract.streak(address),
        ]);

        if (!walletRef.current || address.toLowerCase() !== walletRef.current.toLowerCase()) return;

        setNetworkLatency(Date.now() - start);

        const takeBig = (res: PromiseSettledResult<unknown>): bigint | null =>
          res.status === "fulfilled" && typeof res.value === "bigint" ? res.value : null;

        const nativeUsdcRaw = takeBig(nativeUsdcRes);
        const eurcRaw = takeBig(eurcRes);
        const wusdcRaw = takeBig(wusdcRes);
        const eurcStakedRaw = takeBig(eurcStakedRes);
        const usdcStakedRaw = takeBig(usdcStakedRes);
        const eurcYieldRaw = takeBig(eurcYieldRes);
        const usdcYieldRaw = takeBig(usdcYieldRes);
        const pairState = pairRes.status === "fulfilled" ? pairRes.value : undefined;

        if (nativeUsdcRaw !== null) {
          setUsdcBalanceRaw(nativeUsdcRaw);
          setUsdcBalance(formatDisplay(nativeUsdcRaw, WUSDC_DECIMALS, 2));
        }
        if (wusdcRaw !== null) setWusdcBalanceRaw(wusdcRaw);
        if (eurcRaw !== null) {
          setEurcBalanceRaw(eurcRaw);
          setEurcBalance(formatDisplay(eurcRaw, EURC_DECIMALS, 2));
        }
        if (eurcStakedRaw !== null) setEurcStakedBalance(formatDisplay(eurcStakedRaw, EURC_DECIMALS, 2));
        if (usdcStakedRaw !== null) setUsdcStakedBalance(formatDisplay(usdcStakedRaw, WUSDC_DECIMALS, 2));

        if (pairState) {
          setLpPairAddress(pairState.pairAddress);
          setPoolReserveUsdc(formatPretty(pairState.reserveWusdc, WUSDC_DECIMALS, 4));
          setPoolReserveEurc(formatPretty(pairState.reserveEurc, EURC_DECIMALS, 4));
          const pair = new ethers.Contract(pairState.pairAddress, PAIR_ABI, provider);
          try {
            const lpRaw = (await pair.balanceOf(address)) as bigint;
            if (!walletRef.current || address.toLowerCase() !== walletRef.current.toLowerCase()) return;
            setLpBalanceRaw(lpRaw);
            setLpBalance(formatPretty(lpRaw, LP_DECIMALS, 8));
            setLpSharePct(formatSharePercent(lpRaw, pairState.totalSupply));
            const underlying = underlyingFromLp(lpRaw, pairState.totalSupply, pairState.reserveWusdc, pairState.reserveEurc);
            setLpPooledUsdc(formatPretty(underlying.wusdc, WUSDC_DECIMALS, 6));
            setLpPooledEurc(formatPretty(underlying.eurc, EURC_DECIMALS, 6));
          } catch {
            // keep last known LP position
          }
        }

        if (!walletRef.current || address.toLowerCase() !== walletRef.current.toLowerCase()) return;

        if (eurcYieldRaw !== null) {
          yieldPartsRef.current.eurc = Number(ethers.formatUnits(eurcYieldRaw, 6));
        }
        if (usdcYieldRaw !== null) {
          yieldPartsRef.current.usdc = Number(ethers.formatUnits(usdcYieldRaw, 18));
        }
        if (eurcYieldRaw !== null || usdcYieldRaw !== null) {
          setLifetimePts(yieldPartsRef.current.eurc + yieldPartsRef.current.usdc);
        }

        const lastCheckInRaw = takeBig(lastCheckInRes);
        const streakRaw = takeBig(streakRes);
        if (lastCheckInRaw !== null) {
          const lastTs = Number(lastCheckInRaw);
          setLastCheckInTime(lastTs);
          setHasCheckedInToday((Date.now() / 1000) < (lastTs + 86400));
        }
        if (streakRaw !== null) setStreak(Number(streakRaw));

        if (
          nativeUsdcRes.status === "fulfilled" ||
          eurcRes.status === "fulfilled" ||
          pairRes.status === "fulfilled"
        ) {
          balanceCacheRef.current = { address: normalized, at: Date.now() };
          setBalancesReady(true);
        }
      } catch (error) {
        console.error("Fetch Balance Error:", error);
      } finally {
        setBalancesLoading(false);
      }
    };

    const pending = run();
    balanceInflightRef.current = pending;
    try {
      await pending;
    } finally {
      if (balanceInflightRef.current === pending) balanceInflightRef.current = null;
    }
  }, []);

  const syncConnectedAccount = async () => {
    const ethereum = getEthereum();
    if (!ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = await provider.send("eth_accounts", []);
      if (accounts?.length && localStorage.getItem("nexio_manual_disconnect") !== "1") {
        setWallet(accounts[0]);
      } else if (!accounts?.length) {
        setWallet("");
      }
      await syncNetwork();
    } catch { }
  };

  useEffect(() => {
    if (!wallet) return;

    const oldDomain = localStorage.getItem(`trustbank_domain_name_${wallet}`);
    if (oldDomain && !localStorage.getItem(`nexio_domain_name_${wallet}`)) {
      const migratedDomain = oldDomain.replace(".trust", ".nex");
      localStorage.setItem(`nexio_domain_name_${wallet}`, migratedDomain);
    }

    const oldHistory = localStorage.getItem(`trustbank_history_${wallet}`);
    if (oldHistory && !localStorage.getItem(`nexio_history_${wallet}`)) {
      localStorage.setItem(`nexio_history_${wallet}`, oldHistory);
    }

    const myDomain = localStorage.getItem(`nexio_domain_name_${wallet}`) || "";
    if (myDomain) {
      setRegisteredDomain(myDomain);
    }

    const savedHistory = localStorage.getItem(`nexio_history_${wallet}`);
    setTxHistory(safeParseJson<ActivityItem[]>(savedHistory, []));

    const savedClaimedPts = localStorage.getItem(`nexio_claimed_pts_${wallet}`);
    const parsedClaimed = savedClaimedPts ? Number(savedClaimedPts) : 0;
    setClaimedPts(Number.isFinite(parsedClaimed) ? parsedClaimed : 0);

    let cancelled = false;
    const syncUserIdentity = async () => {
      try {
        const onChainName = await resolveAddressToDomain(wallet);
        if (!cancelled && onChainName) {
          const formatted = `${onChainName}.nex`;
          setRegisteredDomain(formatted);
          setPassVerified(true);
          localStorage.setItem(`nexio_domain_name_${wallet}`, formatted);
          return;
        }
      } catch { }

      if (myDomain && !cancelled) {
        const nameOnly = sanitizeDomainName(myDomain);
        try {
          const resolved = await resolveDomainToAddress(nameOnly);
          if (!cancelled && resolved && resolved.toLowerCase() === wallet.toLowerCase()) {
            setPassVerified(true);
            return;
          }
        } catch { }
      }

      if (!cancelled) {
        setPassVerified(false);
      }
    };

    void syncUserIdentity();

    return () => {
      cancelled = true;
    };
  }, [wallet]);

  useEffect(() => {
    if (!hasCheckedInToday) {
      setTimeLeft("");
      return;
    }
    const timer = setInterval(() => {
      const diff = (lastCheckInTime + 86400) * 1000 - Date.now();

      if (diff <= 0) {
        setHasCheckedInToday(false);
        setTimeLeft("");
        clearInterval(timer);
        return;
      }

      const h = Math.floor((diff / (1000 * 60 * 60)) % 24).toString().padStart(2, '0');
      const m = Math.floor((diff / 1000 / 60) % 60).toString().padStart(2, '0');
      const s = Math.floor((diff / 1000) % 60).toString().padStart(2, '0');
      setTimeLeft(`${h}h ${m}m ${s}s`);
    }, 1000);

    return () => clearInterval(timer);
  }, [hasCheckedInToday, lastCheckInTime]);

  const resetSessionState = (options?: { keepWallet?: boolean }) => {
    setUsdcBalance("0.00");
    setEurcBalance("0.00");
    setUsdcBalanceRaw(BigInt(0));
    setEurcBalanceRaw(BigInt(0));
    setWusdcBalanceRaw(BigInt(0));
    setUsdcStakedBalance("0.00");
    setEurcStakedBalance("0.00");
    setLpBalance("0.00");
    setLpBalanceRaw(BigInt(0));
    setLpSharePct("0");
    setLpPooledUsdc("0.00");
    setLpPooledEurc("0.00");
    setPoolReserveUsdc("0.00");
    setPoolReserveEurc("0.00");
    setBalancesReady(false);
    setBalancesLoading(false);
    balanceCacheRef.current = { address: "", at: 0 };
    lastSwapQuoteKeyRef.current = "";
    lastLpQuoteKeyRef.current = "";
    yieldPartsRef.current = { eurc: 0, usdc: 0 };
    setLifetimePts(0);
    setClaimedPts(0);
    setHasCheckedInToday(false);
    setStreak(0);
    setLastCheckInTime(0);
    setRegisteredDomain("");
    setPassVerified(false);
    setIsVerifyingPass(false);
    verifyPassGenRef.current += 1;
    setNetworkLatency(0);
    setIsBatchMode(false);
    setSendAddress("");
    setSendAmount("");
    setSendMemo("");
    setIsScanning(false);
    setShowSendModal(false);
    setShowConfirmModal(false);
    setShowReceiveModal(false);
    setShowRequestModal(false);
    setShowDomainSuccess(false);
    setVaultInput("");
    setSwapInput("");
    setLpUsdcInput("");
    setLpEurcInput("");
    setLpRemoveInput("");
    setLpRemoveIsMax(false);
    setLpRemovePreviewUsdc("");
    setLpRemovePreviewEurc("");
    setSwapQuote("");
    setSwapQuoteRaw(BigInt(0));
    setSwapQuoteError("");
    setRequestAmount("");
    setDomainSearch("");
    setDomainAvailable(false);
    setDomainSubTab("register");
    setResolveAddressInput("");
    setResolvedDomainResult(null);
    setResolvedOwnerAddress(null);
    setResolvedAddressError(null);
    setHasSearchedAddress(false);
    setResolvedRecipientDomain(null);
    setIsResolvingRecipient(false);
    setTxHistory([]);
    if (!options?.keepWallet) {
      setChainId(null);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ethereum = getEthereum();
    if (!ethereum) return;

    const handleChainChanged = (nextChainIdHex: string) => {
      setChainId(Number.parseInt(nextChainIdHex, 16));
    };
    const handleAccountsChanged = (accounts: string[]) => {
      if (!accounts?.length) {
        resetSessionState();
        setWallet("");
        showMessage("Wallet Disconnected");
      } else {
        const newWallet = accounts[0];
        resetSessionState({ keepWallet: true });
        setWallet(newWallet);
        localStorage.removeItem("nexio_manual_disconnect");
        const savedHistory = localStorage.getItem(`nexio_history_${newWallet}`);
        setTxHistory(safeParseJson<ActivityItem[]>(savedHistory, []));
        const savedClaimedPts = localStorage.getItem(`nexio_claimed_pts_${newWallet}`);
        const parsedClaimed = savedClaimedPts ? Number(savedClaimedPts) : 0;
        setClaimedPts(Number.isFinite(parsedClaimed) ? parsedClaimed : 0);
      }
    };

    syncConnectedAccount();
    ethereum.on?.("chainChanged", handleChainChanged);
    ethereum.on?.("accountsChanged", handleAccountsChanged);

    return () => {
      ethereum.removeListener?.("chainChanged", handleChainChanged);
      ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  useEffect(() => {
    if (!wallet || !isArcTestnet) return;
    void fetchBalances(wallet);
    const intervalId = setInterval(() => {
      if (txBusyRef.current) return;
      void fetchBalances(wallet);
    }, BALANCE_CACHE_MS);
    return () => clearInterval(intervalId);
  }, [wallet, isArcTestnet, fetchBalances]);

  useEffect(() => {
    if (!wallet || isArcTestnet) return;
    setUsdcBalance("0.00");
    setEurcBalance("0.00");
    setUsdcBalanceRaw(BigInt(0));
    setEurcBalanceRaw(BigInt(0));
    setWusdcBalanceRaw(BigInt(0));
    setUsdcStakedBalance("0.00");
    setEurcStakedBalance("0.00");
    setLpBalance("0.00");
    setLpBalanceRaw(BigInt(0));
    setLpSharePct("0");
    setLpPooledUsdc("0.00");
    setLpPooledEurc("0.00");
    setBalancesReady(false);
    balanceCacheRef.current = { address: "", at: 0 };
  }, [wallet, isArcTestnet]);

  const fetchAndVerifyPass = useCallback(async (userWallet?: string) => {
    const target = userWallet || walletRef.current;
    if (!target || !ethers.isAddress(target)) {
      setPassVerified(false);
      setIsVerifyingPass(false);
      return;
    }

    const gen = ++verifyPassGenRef.current;
    const isStale = () =>
      gen !== verifyPassGenRef.current ||
      !walletRef.current ||
      walletRef.current.toLowerCase() !== target.toLowerCase();

    setIsVerifyingPass(true);
    try {
      // 1. Actively query resolveByAddress from the ANS smart contract (0x19c27c2a8729e8A326dF24EF740832b09A607fD0)
      let onChainDomain: string | null = null;
      try {
        onChainDomain = await resolveAddressToDomain(target);
      } catch (e) {
        console.error("fetchAndVerifyPass reverse lookup error:", e);
      }
      if (isStale()) return;
      if (onChainDomain && onChainDomain.trim().length > 0) {
        const formatted = `${onChainDomain}.nex`;
        setRegisteredDomain(formatted);
        setPassVerified(true);
        localStorage.setItem(`nexio_domain_name_${target}`, formatted);
        return;
      }

      // 2. Fallback: check stored domain forward resolution
      const currentOrStored = registeredDomainRef.current || localStorage.getItem(`nexio_domain_name_${target}`) || "";
      if (currentOrStored) {
        const nameOnly = sanitizeDomainName(currentOrStored);
        if (nameOnly) {
          const resolved = await resolveDomainToAddress(nameOnly);
          if (isStale()) return;
          if (resolved && resolved.toLowerCase() === target.toLowerCase()) {
            setRegisteredDomain(`${nameOnly}.nex`);
            setPassVerified(true);
            return;
          }
        }
      }

      if (isStale()) return;
      setPassVerified(false);
    } catch (e) {
      console.error("fetchAndVerifyPass error:", e);
      if (!isStale()) setPassVerified(false);
    } finally {
      if (!isStale()) setIsVerifyingPass(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const target = sendAddress.trim();
    if (!target || isBatchMode) {
      setResolvedRecipientDomain(null);
      setIsResolvingRecipient(false);
      return;
    }

    if (ethers.isAddress(target)) {
      setIsResolvingRecipient(true);
      const timer = setTimeout(async () => {
        try {
          const domain = await resolveAddressToDomain(target);
          if (!cancelled && domain) {
            setResolvedRecipientDomain(`${domain}.nex`);
          } else if (!cancelled) {
            setResolvedRecipientDomain(null);
          }
        } catch {
          if (!cancelled) setResolvedRecipientDomain(null);
        } finally {
          if (!cancelled) setIsResolvingRecipient(false);
        }
      }, 350);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    } else {
      setResolvedRecipientDomain(null);
      setIsResolvingRecipient(false);
    }
  }, [sendAddress, isBatchMode]);

  const switchToArcTestnet = async () => {
    const ethereum = getEthereum();
    if (!ethereum) return false;

    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ARC_CHAIN_ID_HEX }],
      });
      await syncNetwork();
      return true;
    } catch (switchError: any) {
      try {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: ARC_CHAIN_ID_HEX,
            chainName: "Arc Testnet",
            rpcUrls: [ARC_RPC],
            blockExplorerUrls: [ARC_EXPLORER],
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          }],
        });
        await syncNetwork();
        return true;
      } catch (addError) {
        return false;
      }
    }
  };

  const connectWallet = async () => {
    try {
      const ethereum = getEthereum();
      if (!ethereum) return showMessage("Install Rabby or MetaMask extension properly");

      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts?.length) return;

      const signer = await provider.getSigner();
      await signer.signMessage("Sign in to Nexio");

      localStorage.removeItem("nexio_manual_disconnect");
      setWallet(accounts[0]);
      const currentChainId = await syncNetwork();

      if (currentChainId !== ARC_CHAIN_ID) {
        showMessage("Switching to Arc Testnet...");
        const switched = await switchToArcTestnet();
        if (switched) showMessage("Wallet Connected Successfully");
        else showMessage("Please switch to Arc Testnet manually in your wallet.");
      } else {
        showMessage("Wallet Connected Successfully");
      }

      void fetchBalances(accounts[0]);
    } catch (error) {
      showMessage("Connection Rejected or Wallet Blocked");
    }
  };

  const disconnectWallet = () => {
    localStorage.setItem("nexio_manual_disconnect", "1");
    resetSessionState();
    setWallet("");
    showMessage("Wallet Disconnected");
  };

  const copyAddress = async () => {
    if (!wallet) return showMessage("Connect wallet first");
    await navigator.clipboard.writeText(wallet);
    showMessage("Address Copied! 📋");
  };

  const openFaucet = () => window.open(ARC_FAUCET, "_blank", "noopener,noreferrer");
  const openExplorer = () => window.open(ARC_EXPLORER, "_blank", "noopener,noreferrer");
  const openArcWebsite = () => window.open("https://www.arc.io/", "_blank", "noopener,noreferrer");

  const handleOpenSendModal = async () => {
    if (!wallet) return showMessage("Please connect wallet first");
    if (!isArcTestnet) {
      showMessage("Switching to Arc Testnet...");
      const switched = await switchToArcTestnet();
      if (!switched) return showMessage("Network switch failed. Please switch manually.");
    }
    setIsScanning(false);
    setShowSendModal(true);
  };

  const handleOpenRequestModal = () => {
    if (!wallet) return showMessage("Please connect wallet first");
    setPaymentLink("");
    setRequestAmount("");
    setShowRequestModal(true);
  };

  const generatePaymentLink = () => {
    if (!requestAmount) return showMessage("Enter an amount");
    if (parseFloat(requestAmount) <= 0) return showMessage("Invalid amount");

    const baseUrl = window.location.origin + window.location.pathname;
    const link = `${baseUrl}?to=${wallet}&amount=${requestAmount}&token=${requestAsset}`;
    setPaymentLink(link);
    showMessage("Payment link generated!");
  };

  const copyPaymentLink = async () => {
    if (!paymentLink) return;
    await navigator.clipboard.writeText(paymentLink);
    showMessage("Link copied to clipboard! 📋");
  };

  const applyScannedRecipient = (raw: string) => {
    const text = raw.trim();
    if (!text) return;

    let recipient = text;
    if (text.toLowerCase().startsWith("ethereum:")) {
      recipient = text.slice(9).split(/[?@]/)[0];
    } else {
      try {
        const url = new URL(text);
        const to = url.searchParams.get("to");
        if (to) recipient = to;
      } catch {
        // raw address or .nex domain
      }
    }

    recipient = recipient.trim();
    if (!recipient) return;

    if (isBatchMode && sendAddress.trim()) {
      const parts = sendAddress.split(",").map((part) => part.trim()).filter(Boolean);
      const exists = parts.some((part) => part.toLowerCase() === recipient.toLowerCase());
      if (!exists) setSendAddress(`${parts.join(", ")}, ${recipient}`);
    } else {
      setSendAddress(recipient);
    }
    setIsScanning(false);
  };

  const handleSendClick = () => {
    if (!wallet) return showMessage("Please connect wallet first to send");
    if (isSending) return;
    if (!sendAddress || !sendAmount) return showMessage("Please fill required fields");

    const amountNum = Number(sendAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return showMessage("Enter a valid amount greater than 0");

    const addresses = (isBatchMode ? sendAddress.split(",") : [sendAddress])
      .map((a) => a.trim())
      .filter((a) => a !== "");

    if (addresses.length === 0) return showMessage("Please enter at least one address");

    const recipientCount = BigInt(addresses.length);
    if (sendAsset === "USDC") {
      const perAmount = parseAmount(sendAmount, WUSDC_DECIMALS);
      if (!perAmount || perAmount <= BigInt(0)) return showMessage("Enter a valid amount greater than 0");
      const totalNeeded = perAmount * recipientCount;
      if (totalNeeded > maxNativeSpend(usdcBalanceRaw)) {
        return showMessage(
          isBatchMode
            ? `Insufficient USDC for ${addresses.length} recipients (including gas).`
            : "Insufficient USDC balance (including gas)."
        );
      }
    } else {
      const perAmount = parseAmount(sendAmount, EURC_DECIMALS);
      if (!perAmount || perAmount <= BigInt(0)) return showMessage("Enter a valid amount greater than 0");
      const totalNeeded = perAmount * recipientCount;
      if (totalNeeded > eurcBalanceRaw) {
        return showMessage(
          isBatchMode
            ? `Insufficient EURC for ${addresses.length} recipients.`
            : "Insufficient EURC balance."
        );
      }
    }

    setShowConfirmModal(true);
  };

  const executeSend = async () => {
    if (isSending || sendLockRef.current) return;
    sendLockRef.current = true;
    setIsSending(true);

    const rawAddresses = isBatchMode ? sendAddress.split(',') : [sendAddress];
    const addresses = rawAddresses.map(a => a.trim()).filter(a => a !== "");

    if (!isArcTestnet) {
      showMessage("Switching to Arc Testnet...");
      const switched = await switchToArcTestnet();
      if (!switched) {
        sendLockRef.current = false;
        setIsSending(false);
        return showMessage("Network switch failed. Please switch to Arc Testnet manually.");
      }
    }

    setShowConfirmModal(false);

    try {
      const ethereum = getEthereum();
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      const ansContract = new ethers.Contract(ANS_CONTRACT_ADDRESS, ANS_ABI, provider);
      const resolvedAddresses: string[] = [];

      for (let target of addresses) {
        const lowerTarget = target.toLowerCase();
        if (lowerTarget.endsWith(".nex")) {
          showMessage(`Resolving ${target}...`);
          const nameOnly = lowerTarget.replace(/\.nex$/, "");
          try {
            const resolvedAddress = await ansContract.resolve(nameOnly);
            if (!resolvedAddress || resolvedAddress === ethers.ZeroAddress) {
              showMessage(`Domain ${target} is not registered.`);
              setIsSending(false); return;
            }
            resolvedAddresses.push(resolvedAddress);
          } catch (e) {
            showMessage(`Domain ${target} could not be resolved.`);
            setIsSending(false); return;
          }
        } else if (ethers.isAddress(target)) {
          resolvedAddresses.push(target);
        } else {
          showMessage(`Invalid address format: ${target}`);
          setIsSending(false); return;
        }
      }

      const memoHex = sendMemo ? ethers.hexlify(ethers.toUtf8Bytes(sendMemo)) : "0x";
      const memoBytes = sendMemo ? memoHex.replace("0x", "") : "";
      let successCount = 0;
      const sendDecimals = sendAsset === "USDC" ? WUSDC_DECIMALS : EURC_DECIMALS;
      const batchTotalRaw = (parseAmount(sendAmount, sendDecimals) ?? BigInt(0)) * BigInt(resolvedAddresses.length);
      const batchTotalLabel = formatPretty(batchTotalRaw, sendDecimals, 6);

      if (isBatchMode) {
        const MULTICALL3_FROM = "0x522fAf9A91c41c443c66765030741e4AaCe147D0";
        const MULTICALL_ABI = ["function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])"];

        // Native USDC ERC-20 precompile shares the native balance; it uses 6 decimals (native sends use 18).
        const USDC_ERC20_ADDRESS = "0x3600000000000000000000000000000000000000";
        const parsedAmount = ethers.parseUnits(sendAmount, 6);
        const targetContractAddress = sendAsset === "USDC" ? USDC_ERC20_ADDRESS : EURC_ADDRESS;
        const tokenContract = new ethers.Contract(targetContractAddress, ERC20_ABI, signer);
        const calls: [string, boolean, string][] = [];

        for (const currentTarget of resolvedAddresses) {
          const transferData = tokenContract.interface.encodeFunctionData("transfer", [currentTarget, parsedAmount]);
          const finalData = memoBytes ? transferData + memoBytes : transferData;
          calls.push([targetContractAddress, false, finalData]);
        }

        showMessage("Confirm Batch Transaction in wallet...");
        try {
          const multicall = new ethers.Contract(MULTICALL3_FROM, MULTICALL_ABI, signer);
          const tx = await multicall.aggregate3(calls);
          showMessage("Broadcasting Batch Transfer...");
          const receipt = await tx.wait();
          addHistoryRecord(
            `Batch Transfer ${sendAsset}`,
            `-${batchTotalLabel} ${sendAsset}`,
            `To ${resolvedAddresses.length} recipients${sendMemo ? ` (Memo: ${sendMemo})` : ""}`,
            "Completed",
            receipt?.hash || ""
          );
          successCount = resolvedAddresses.length;
        } catch (txError) {
          addHistoryRecord(
            `Batch Transfer ${sendAsset}`,
            `${batchTotalLabel} ${sendAsset}`,
            `Failed: ${resolvedAddresses.length} recipients`,
            "Failed"
          );
        }
      } else {
        for (let i = 0; i < resolvedAddresses.length; i++) {
          const currentTarget = resolvedAddresses[i];
          const displayTarget = addresses[i];

          if (i > 0) { showMessage(`Processing transaction ${i + 1} of ${resolvedAddresses.length}...`); await sleep(500); }
          if (isBatchMode) showMessage(`Transaction ${i + 1} of ${resolvedAddresses.length}: Please sign in wallet...`);
          else showMessage("Confirm transaction in your wallet...");

          try {
            let tx: any;
            if (sendAsset === "USDC") {
              const parsedAmount = ethers.parseUnits(sendAmount, 18);
              tx = await signer.sendTransaction({ to: currentTarget, value: parsedAmount, data: memoHex });
            } else {
              const parsedAmount = ethers.parseUnits(sendAmount, 6);
              const contract = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, signer);
              const transferData = contract.interface.encodeFunctionData("transfer", [currentTarget, parsedAmount]);
              const finalData = memoBytes ? transferData + memoBytes : transferData;
              tx = await signer.sendTransaction({ to: EURC_ADDRESS, data: finalData });
            }

            showMessage(`Broadcasting ${sendAsset} to network...`);
            const receipt = await tx.wait();
            addHistoryRecord(isBatchMode ? `Batch Transfer ${sendAsset}` : `Transfer ${sendAsset}`, `-${sendAmount} ${sendAsset}`, `To ${displayTarget}${sendMemo ? ` (Memo: ${sendMemo})` : ""}`, "Completed", receipt?.hash || "");
            successCount++;
          } catch (txError) {
            addHistoryRecord(isBatchMode ? `Batch Transfer ${sendAsset}` : `Transfer ${sendAsset}`, `${sendAmount} ${sendAsset}`, `Failed: ${displayTarget}`, "Failed");
          }
        }
      }

      if (successCount > 0) {
        showMessage(isBatchMode ? `Batch Complete: ${successCount}/${resolvedAddresses.length} sent! 🎉` : `Successfully sent ${sendAmount} ${sendAsset}!`);
        setShowSendModal(false); setSendAddress(""); setSendAmount(""); setSendMemo(""); setIsBatchMode(false);
        void fetchBalances(wallet, { force: true });
      } else {
        showMessage(isBatchMode ? `Batch Failed: 0/${resolvedAddresses.length} succeeded.` : `Transaction failed or rejected.`);
      }
    } catch (error) {
      showMessage("Operation failed. Check wallet connection.");
    } finally {
      sendLockRef.current = false;
      setIsSending(false);
    }
  };

  // REAL DEFI VAULT EXECUTION LOGIC
  const handleVaultAction = async (action: "stake" | "withdraw") => {
    if (!wallet) return showMessage("Please connect wallet first");
    if (!vaultInput || parseFloat(vaultInput) <= 0) return showMessage("Enter a valid amount");

    if (!isArcTestnet) {
      showMessage("Switching to Arc Testnet...");
      const switched = await switchToArcTestnet();
      if (!switched) return showMessage("Network switch failed. Please switch to Arc Testnet manually.");
    }

    setIsVaultLoading(true);
    setVaultAction(action);
    try {
      const ethereum = getEthereum();
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      let tx;
      let receipt;

      if (vaultAsset === "USDC") {
        const vaultContract = new ethers.Contract(USDC_VAULT_ADDRESS, USDC_VAULT_ABI, signer);
        const amountWei = ethers.parseUnits(vaultInput, 18);
        if (action === "stake" && amountWei > maxNativeSpend(usdcBalanceRaw)) {
          return showMessage("Insufficient USDC balance (including gas).");
        }

        if (action === "stake") {
          showMessage("Depositing USDC in progress...");
          tx = await vaultContract.deposit({ value: amountWei });
          receipt = await tx.wait();
          addHistoryRecord("Staked in Vault", `-${vaultInput} USDC`, "Nexio Yield Vault", "Completed", receipt?.hash || "");
          showMessage("Staked USDC successfully! 🌱");
        } else {
          showMessage("Withdrawing USDC from Vault...");
          tx = await vaultContract.withdraw(amountWei);
          receipt = await tx.wait();
          addHistoryRecord("Withdrew from Vault", `+${vaultInput} USDC`, "Nexio Yield Vault", "Completed", receipt?.hash || "");
          showMessage("Withdrawn USDC successfully! 💸");
        }
      } else {
        const vaultContract = new ethers.Contract(EURC_VAULT_ADDRESS, EURC_VAULT_ABI, signer);
        const amountWei = ethers.parseUnits(vaultInput, 6);

        if (action === "stake") {
          const tokenContract = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, signer);
          await ensureTokenAllowance(tokenContract, wallet, EURC_VAULT_ADDRESS, amountWei, "EURC");

          showMessage("Deposit in progress. Confirm in wallet...");
          tx = await vaultContract.deposit(amountWei);
          receipt = await tx.wait();
          addHistoryRecord("Staked in Vault", `-${vaultInput} EURC`, "Nexio Yield Vault", "Completed", receipt?.hash || "");
          showMessage("Staked EURC successfully! 🌱");
        } else {
          showMessage("Withdrawing EURC from Vault...");
          tx = await vaultContract.withdraw(amountWei);
          receipt = await tx.wait();
          addHistoryRecord("Withdrew from Vault", `+${vaultInput} EURC`, "Nexio Yield Vault", "Completed", receipt?.hash || "");
          showMessage("Withdrawn EURC successfully! 💸");
        }
      }

      setVaultInput("");
      invalidatePairCache();
      void fetchBalances(wallet, { force: true });

    } catch (error: any) {
      console.error("Vault Error:", error);
      showMessage(error?.reason || "Transaction failed or rejected");
    } finally {
      setIsVaultLoading(false);
      setVaultAction(null);
    }
  };

  const ensureTokenAllowance = async (
    token: ethers.Contract,
    owner: string,
    spender: string,
    amount: bigint,
    label: string
  ) => {
    const current = (await token.allowance(owner, spender)) as bigint;
    if (current >= amount) return;
    showMessage(`Approving ${label}...`);
    setSwapStatus("approving");
    setLpAction("approve");
    const approveTx = await token.approve(spender, amount);
    showMessage("Waiting for approval confirmation...");
    await approveTx.wait();
  };

  const applyCustomSlippage = (raw: string, setter: (bps: number) => void) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    setter(Math.max(1, Math.min(5000, Math.round(n * 100))));
  };

  const fillSwapMax = () => {
    if (swapDirection === "USDCtoEURC") {
      setSwapInput(formatExact(maxNativeSpend(usdcBalanceRaw), WUSDC_DECIMALS));
    } else {
      setSwapInput(formatExact(eurcBalanceRaw, EURC_DECIMALS));
    }
  };

  const fillLpUsdcMax = () => {
    setLpLastEdited("usdc");
    setLpUsdcInput(formatExact(maxNativeSpend(usdcBalanceRaw), WUSDC_DECIMALS));
  };

  const fillLpEurcMax = () => {
    setLpLastEdited("eurc");
    setLpEurcInput(formatExact(eurcBalanceRaw, EURC_DECIMALS));
  };

  const fillLpRemoveMax = () => {
    setLpRemoveIsMax(true);
    setLpRemoveInput(formatExact(lpBalanceRaw, LP_DECIMALS));
  };

  const swapAmountIn = parseAmount(swapInput, swapDirection === "USDCtoEURC" ? WUSDC_DECIMALS : EURC_DECIMALS);
  const swapInsufficient = !!swapAmountIn && (
    swapDirection === "USDCtoEURC"
      ? swapAmountIn > usdcBalanceRaw
      : swapAmountIn > eurcBalanceRaw
  );
  const swapMinOut = swapQuoteRaw > BigInt(0) ? applySlippage(swapQuoteRaw, slippageBps) : BigInt(0);
  const swapUsdcLabel = formatPretty(usdcBalanceRaw, WUSDC_DECIMALS, 6);
  const swapEurcLabel = formatPretty(eurcBalanceRaw, EURC_DECIMALS, 6);

  useEffect(() => {
    let cancelled = false;

    const loadQuote = async () => {
      if (!swapInput.trim()) {
        lastSwapQuoteKeyRef.current = "";
        setSwapQuote("");
        setSwapQuoteRaw(BigInt(0));
        setSwapQuoteError("");
        return;
      }

      if (isAmountDraft(swapInput)) return;

      const amountIn = parseAmount(swapInput, swapDirection === "USDCtoEURC" ? WUSDC_DECIMALS : EURC_DECIMALS);
      if (!amountIn || amountIn <= BigInt(0)) return;

      const quoteKey = `${swapDirection}:${amountIn.toString()}`;
      if (quoteKey === lastSwapQuoteKeyRef.current) return;

      try {
        const provider = getArcReadProvider();
        const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);
        const isUsdcIn = swapDirection === "USDCtoEURC";
        const path = isUsdcIn ? [WUSDC_ADDRESS, EURC_ADDRESS] : [EURC_ADDRESS, WUSDC_ADDRESS];
        const amounts = (await router.getAmountsOut(amountIn, path)) as bigint[];
        const out = amounts[amounts.length - 1];
        if (!cancelled) {
          lastSwapQuoteKeyRef.current = quoteKey;
          setSwapQuoteRaw(out);
          setSwapQuote(formatPretty(out, isUsdcIn ? EURC_DECIMALS : WUSDC_DECIMALS, isUsdcIn ? 6 : 8));
          setSwapQuoteError("");
        }
      } catch {
        if (!cancelled && lastSwapQuoteKeyRef.current === "") {
          setSwapQuoteError("No quote. Check pool liquidity.");
        }
      }
    };

    const timer = window.setTimeout(() => { void loadQuote(); }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [swapInput, swapDirection]);

  useEffect(() => {
    let cancelled = false;

    const syncOtherSide = async () => {
      if (lpMode !== "add") return;
      const source = lpLastEdited === "usdc" ? lpUsdcInput : lpEurcInput;
      if (!source.trim()) {
        lastLpQuoteKeyRef.current = "";
        if (lpLastEdited === "usdc") setLpEurcInput("");
        else setLpUsdcInput("");
        return;
      }

      if (isAmountDraft(source)) return;

      const parsed = parseAmount(source, lpLastEdited === "usdc" ? WUSDC_DECIMALS : EURC_DECIMALS);
      if (!parsed || parsed <= BigInt(0)) return;

      const quoteKey = `${lpLastEdited}:${parsed.toString()}`;
      if (quoteKey === lastLpQuoteKeyRef.current) return;

      try {
        const provider = getArcReadProvider();
        const pairState = await fetchPairState(provider, EURC_ADDRESS);
        if (!pairState || pairState.reserveWusdc === BigInt(0) || pairState.reserveEurc === BigInt(0)) return;
        const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);
        if (lpLastEdited === "usdc") {
          const quotedEurc = (await router.quote(parsed, pairState.reserveWusdc, pairState.reserveEurc)) as bigint;
          if (!cancelled) {
            lastLpQuoteKeyRef.current = quoteKey;
            setLpEurcInput(formatExact(quotedEurc, EURC_DECIMALS));
          }
        } else {
          const quotedUsdc = (await router.quote(parsed, pairState.reserveEurc, pairState.reserveWusdc)) as bigint;
          if (!cancelled) {
            lastLpQuoteKeyRef.current = quoteKey;
            setLpUsdcInput(formatExact(quotedUsdc, WUSDC_DECIMALS));
          }
        }
      } catch { }
    };

    const timer = window.setTimeout(() => { void syncOtherSide(); }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lpUsdcInput, lpEurcInput, lpLastEdited, lpMode]);

  useEffect(() => {
    let cancelled = false;

    const previewRemove = async () => {
      const lpAmount = lpRemoveIsMax ? lpBalanceRaw : parseAmount(lpRemoveInput, LP_DECIMALS);
      if (lpMode !== "remove" || !lpRemoveInput.trim()) {
        setLpRemovePreviewUsdc("");
        setLpRemovePreviewEurc("");
        return;
      }
      if (!lpAmount || lpAmount <= BigInt(0)) return;
      try {
        const provider = getArcReadProvider();
        const pairState = await fetchPairState(provider, EURC_ADDRESS);
        if (!pairState) return;
        const underlying = underlyingFromLp(lpAmount, pairState.totalSupply, pairState.reserveWusdc, pairState.reserveEurc);
        if (!cancelled) {
          setLpRemovePreviewUsdc(formatPretty(underlying.wusdc, WUSDC_DECIMALS, 8));
          setLpRemovePreviewEurc(formatPretty(underlying.eurc, EURC_DECIMALS, 6));
        }
      } catch {
        // keep last known remove preview
      }
    };

    const timer = window.setTimeout(() => { void previewRemove(); }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lpRemoveInput, lpMode, lpRemoveIsMax, lpBalanceRaw]);

  const handleSwap = async () => {
    if (!wallet) return showMessage("Please connect wallet first");
    const isUsdcIn = swapDirection === "USDCtoEURC";
    const amountIn = parseAmount(swapInput, isUsdcIn ? WUSDC_DECIMALS : EURC_DECIMALS);
    if (!amountIn || amountIn <= BigInt(0)) return showMessage("Enter a valid amount");

    if (!isArcTestnet) {
      showMessage("Switching to Arc Testnet...");
      const switched = await switchToArcTestnet();
      if (!switched) return showMessage("Please switch to Arc Testnet manually.");
    }

    if (isUsdcIn && amountIn > usdcBalanceRaw) return showMessage("Insufficient USDC balance");
    if (!isUsdcIn && amountIn > eurcBalanceRaw) return showMessage("Insufficient EURC balance");

    setIsSwapping(true);
    setSwapStatus("confirm");
    try {
      const ethereum = getEthereum();
      if (!ethereum) return showMessage("Wallet not found");
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
      const deadline = swapDeadline();
      const path = isUsdcIn ? [WUSDC_ADDRESS, EURC_ADDRESS] : [EURC_ADDRESS, WUSDC_ADDRESS];
      const amounts = (await router.getAmountsOut(amountIn, path)) as bigint[];
      const amountOutMin = applySlippage(amounts[1], slippageBps);

      if (isUsdcIn) {
        showMessage("Confirm Swap in wallet (USDC → EURC)...");
        const tx = await router.swapExactETHForTokens(amountOutMin, path, wallet, deadline, { value: amountIn });
        showMessage("Broadcasting Swap...");
        setSwapStatus("pending");
        const receipt = await tx.wait();
        addHistoryRecord("Nexio Swap", `-${formatPretty(amountIn, WUSDC_DECIMALS, 6)} USDC`, `Min ${formatPretty(amountOutMin, EURC_DECIMALS, 6)} EURC`, "Completed", receipt?.hash || "");
        showMessage("Swap Successful! 🔄");
      } else {
        const token = new ethers.Contract(EURC_ADDRESS, TOKEN_ABI, signer);
        await ensureTokenAllowance(token, wallet, ROUTER_ADDRESS, amountIn, "EURC");
        showMessage("Confirm Swap in wallet (EURC → USDC)...");
        setSwapStatus("confirm");
        const tx = await router.swapExactTokensForETH(amountIn, amountOutMin, path, wallet, deadline);
        showMessage("Broadcasting Swap...");
        setSwapStatus("pending");
        const receipt = await tx.wait();
        addHistoryRecord("Nexio Swap", `-${formatPretty(amountIn, EURC_DECIMALS, 6)} EURC`, `Min ${formatPretty(amountOutMin, WUSDC_DECIMALS, 6)} USDC`, "Completed", receipt?.hash || "");
        showMessage("Swap Successful! 🔄");
      }
      setSwapInput("");
      setSwapQuote("");
      setSwapQuoteRaw(BigInt(0));
      lastSwapQuoteKeyRef.current = "";
      invalidatePairCache();
      void fetchBalances(wallet, { force: true });
    } catch (error: unknown) {
      console.error("Swap Error:", error);
      showMessage(getTxErrorMessage(error));
    } finally {
      setIsSwapping(false);
      setSwapStatus(null);
    }
  };

  const handleAddLiquidity = async () => {
    if (!wallet) return showMessage("Please connect wallet first");

    if (!isArcTestnet) {
      showMessage("Switching to Arc Testnet...");
      const switched = await switchToArcTestnet();
      if (!switched) return showMessage("Please switch to Arc Testnet manually.");
    }

    setIsLpLoading(true);
    setLpAction("add");
    try {
      const ethereum = getEthereum();
      if (!ethereum) return showMessage("Wallet not found");
      const readProvider = getArcReadProvider();
      const pairState = await fetchPairState(readProvider, EURC_ADDRESS, { force: true });
      if (!pairState) {
        return showMessage("Liquidity pair not found.");
      }

      const routerRead = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, readProvider);
      let amountUsdc: bigint;
      let amountEurc: bigint;
      const poolEmpty = pairState.reserveWusdc === BigInt(0) || pairState.reserveEurc === BigInt(0);

      if (poolEmpty) {
        const parsedUsdc = parseAmount(lpUsdcInput, WUSDC_DECIMALS);
        const parsedEurc = parseAmount(lpEurcInput, EURC_DECIMALS);
        if (!parsedUsdc || parsedUsdc <= BigInt(0)) return showMessage("Enter a valid USDC amount");
        if (!parsedEurc || parsedEurc <= BigInt(0)) return showMessage("Enter a valid EURC amount");
        amountUsdc = parsedUsdc;
        amountEurc = parsedEurc;
      } else if (lpLastEdited === "usdc") {
        const parsed = parseAmount(lpUsdcInput, WUSDC_DECIMALS);
        if (!parsed || parsed <= BigInt(0)) return showMessage("Enter a valid USDC amount");
        amountUsdc = parsed;
        amountEurc = (await routerRead.quote(amountUsdc, pairState.reserveWusdc, pairState.reserveEurc)) as bigint;
      } else {
        const parsed = parseAmount(lpEurcInput, EURC_DECIMALS);
        if (!parsed || parsed <= BigInt(0)) return showMessage("Enter a valid EURC amount");
        amountEurc = parsed;
        amountUsdc = (await routerRead.quote(amountEurc, pairState.reserveEurc, pairState.reserveWusdc)) as bigint;
      }

      if (amountUsdc > usdcBalanceRaw) return showMessage("Insufficient USDC balance");
      if (amountEurc > eurcBalanceRaw) return showMessage("Insufficient EURC balance");

      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);
      const eurcToken = new ethers.Contract(EURC_ADDRESS, TOKEN_ABI, signer);
      await ensureTokenAllowance(eurcToken, wallet, ROUTER_ADDRESS, amountEurc, "EURC");

      const amountTokenMin = applySlippage(amountEurc, lpSlippageBps);
      const amountEthMin = applySlippage(amountUsdc, lpSlippageBps);

      showMessage("Confirm Add Liquidity in wallet...");
      setLpAction("add");
      const tx = await router.addLiquidityETH(
        EURC_ADDRESS,
        amountEurc,
        amountTokenMin,
        amountEthMin,
        wallet,
        swapDeadline(),
        { value: amountUsdc }
      );
      showMessage("Broadcasting liquidity deposit...");
      const receipt = await tx.wait();
      addHistoryRecord(
        "Add Liquidity",
        `-${formatPretty(amountUsdc, WUSDC_DECIMALS, 6)} USDC / -${formatPretty(amountEurc, EURC_DECIMALS, 6)} EURC`,
        `Min ${slippageLabel(lpSlippageBps)} slippage`,
        "Completed",
        receipt?.hash || ""
      );
      showMessage("Liquidity added! 💧");
      setLpUsdcInput("");
      setLpEurcInput("");
      lastLpQuoteKeyRef.current = "";
      invalidatePairCache();
      void fetchBalances(wallet, { force: true });
    } catch (error: unknown) {
      console.error("Add Liquidity Error:", error);
      showMessage(getTxErrorMessage(error));
    } finally {
      setIsLpLoading(false);
      setLpAction(null);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!wallet) return showMessage("Please connect wallet first");
    const liquidity = lpRemoveIsMax ? lpBalanceRaw : parseAmount(lpRemoveInput, LP_DECIMALS);
    if (!liquidity || liquidity <= BigInt(0)) return showMessage("Enter an LP amount to remove");

    if (!isArcTestnet) {
      showMessage("Switching to Arc Testnet...");
      const switched = await switchToArcTestnet();
      if (!switched) return showMessage("Please switch to Arc Testnet manually.");
    }

    if (liquidity > lpBalanceRaw) return showMessage("Insufficient LP token balance");

    setIsLpLoading(true);
    setLpAction("remove");
    try {
      const ethereum = getEthereum();
      if (!ethereum) return showMessage("Wallet not found");
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const pairState = await fetchPairState(getArcReadProvider(), EURC_ADDRESS, { force: true });
      if (!pairState) return showMessage("Liquidity pair not found");

      const pair = new ethers.Contract(pairState.pairAddress, PAIR_ABI, signer);
      await ensureTokenAllowance(pair, wallet, ROUTER_ADDRESS, liquidity, "LP tokens");

      const underlying = underlyingFromLp(liquidity, pairState.totalSupply, pairState.reserveWusdc, pairState.reserveEurc);
      const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);

      showMessage("Confirm Remove Liquidity in wallet...");
      setLpAction("remove");
      const tx = await router.removeLiquidityETH(
        EURC_ADDRESS,
        liquidity,
        applySlippage(underlying.eurc, lpSlippageBps),
        applySlippage(underlying.wusdc, lpSlippageBps),
        wallet,
        swapDeadline()
      );
      showMessage("Broadcasting liquidity withdrawal...");
      const receipt = await tx.wait();
      addHistoryRecord(
        "Remove Liquidity",
        `+${formatPretty(applySlippage(underlying.wusdc, lpSlippageBps), WUSDC_DECIMALS, 6)} USDC / +${formatPretty(applySlippage(underlying.eurc, lpSlippageBps), EURC_DECIMALS, 6)} EURC`,
        "USDC/EURC Pool",
        "Completed",
        receipt?.hash || ""
      );
      showMessage("Liquidity removed! 💸");
      setLpRemoveInput("");
      setLpRemoveIsMax(false);
      setLpRemovePreviewUsdc("");
      setLpRemovePreviewEurc("");
      invalidatePairCache();
      void fetchBalances(wallet, { force: true });
    } catch (error: unknown) {
      console.error("Remove Liquidity Error:", error);
      showMessage(getTxErrorMessage(error));
    } finally {
      setIsLpLoading(false);
      setLpAction(null);
    }
  };

  // REAL TRANSACTION PTS CLAIM LOGIC
  const handleClaimPts = async () => {
    if (!wallet) return showMessage("Please connect wallet first");
    if (unclaimedPts <= 0) return showMessage("No pending NLP to claim");

    if (!isArcTestnet) {
      showMessage("Switching to Arc Testnet...");
      const switched = await switchToArcTestnet();
      if (!switched) return showMessage("Network switch failed. Please switch to Arc Testnet manually.");
    }

    setIsVaultLoading(true);
    setVaultAction("claim");

    try {
      const ethereum = getEthereum();
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      showMessage("Confirm NLP Claim in your wallet...");

      const memoHex = ethers.hexlify(ethers.toUtf8Bytes(`Nexio NLP Claim: ${unclaimedPts.toFixed(2)}`));
      const tx = await signer.sendTransaction({
        to: wallet,
        value: 0,
        data: memoHex
      });

      showMessage("Broadcasting Claim to Arc Network...");
      const receipt = await tx.wait();

      setClaimedPts(lifetimePts);
      localStorage.setItem(`nexio_claimed_pts_${wallet}`, lifetimePts.toString());

      addHistoryRecord("Claimed Nexio NLP", `+${unclaimedPts.toFixed(2)} NLP`, "Loyalty Engagement Record", "Completed", receipt?.hash || "");
      showMessage("NLP Claimed Successfully! 🎯");
      triggerConfetti();

    } catch (error: any) {
      console.error("Claim Error:", error);
      showMessage(error?.reason || "Claim transaction failed or rejected");
    } finally {
      setIsVaultLoading(false);
      setVaultAction(null);
    }
  };

  const executeDailyGM = async () => {
    if (!wallet) return showMessage("Please connect wallet first");
    if (!isArcTestnet) {
      showMessage("Switching to Arc Testnet...");
      const switched = await switchToArcTestnet();
      if (!switched) return showMessage("Network switch failed. Please switch to Arc Testnet manually.");
    }
    if (hasCheckedInToday) return showMessage("Already checked in today! Come back tomorrow.");

    setIsCheckingIn(true);
    try {
      const ethereum = getEthereum();
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      showMessage("Confirm Daily GM Check-in...");
      const contract = new ethers.Contract(DAILY_GM_ADDRESS, DAILY_GM_ABI, signer);
      const tx = await contract.checkIn();

      showMessage("Broadcasting GM Transaction to Arc Network...");
      const receipt = await tx.wait();

      showMessage(`GM! Daily check-in successful. You are on Day ${streak + 1} 🔥`);
      addHistoryRecord("Daily GM Check-in", "", `Streak: Day ${streak + 1} 🔥`, "Completed", receipt?.hash || "");

      void fetchBalances(wallet, { force: true });
    } catch (error) {
      showMessage("GM Check-in rejected or failed");
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleSearchDomain = async () => {
    const cleanSearch = sanitizeDomainName(domainSearch);
    setDomainSearch(cleanSearch);

    if (!cleanSearch) return showMessage("Enter a valid domain name");

    setIsCheckingDomain(true);
    setDomainAvailable(false);
    try {
      const available = await isDomainAvailable(cleanSearch);

      if (available) {
        setDomainAvailable(true);
        showMessage("Domain is available! 🚀");
      } else {
        setDomainAvailable(false);
        showMessage("Domain is already taken! Try another.");
      }
    } catch (error) {
      console.error(error);
      showMessage("Failed to check network. Try again.");
    } finally {
      setIsCheckingDomain(false);
    }
  };

  const handleResolveAddress = async (customAddr?: string) => {
    const rawTarget = (customAddr ?? resolveAddressInput).trim();
    if (!rawTarget) {
      showMessage("Please enter an Arc wallet address");
      return;
    }
    if (!ethers.isAddress(rawTarget)) {
      resolveAddressGenRef.current += 1;
      setResolvedDomainResult(null);
      setResolvedOwnerAddress(rawTarget);
      setResolvedAddressError("Invalid EVM wallet address format (must start with 0x and be 42 characters).");
      setHasSearchedAddress(true);
      return;
    }

    const gen = ++resolveAddressGenRef.current;
    setIsResolvingAddress(true);
    setResolvedAddressError(null);
    setResolvedDomainResult(null);
    setResolvedOwnerAddress(rawTarget);
    setHasSearchedAddress(true);

    try {
      const domain = await resolveAddressToDomain(rawTarget);
      if (gen !== resolveAddressGenRef.current) return;
      if (domain && domain.trim().length > 0) {
        setResolvedDomainResult(domain);
        setResolvedAddressError(null);
        showMessage(`Resolved: ${domain}.nex 🎉`);
      } else {
        setResolvedDomainResult(null);
        setResolvedAddressError("No .nex domain registered for this address on Arc Testnet.");
      }
    } catch (error) {
      console.error("Reverse resolution error:", error);
      if (gen !== resolveAddressGenRef.current) return;
      setResolvedDomainResult(null);
      setResolvedAddressError("Network error. Could not query Arc Name Service. Please try again.");
    } finally {
      if (gen === resolveAddressGenRef.current) {
        setIsResolvingAddress(false);
      }
    }
  };

  const handlePasteResolveAddress = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const trimmed = text.trim();
          setResolveAddressInput(trimmed);
          void handleResolveAddress(trimmed);
        }
      }
    } catch {
      showMessage("Could not access clipboard");
    }
  };

  const copyResolvedText = (text: string, label = "Address") => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      showMessage(`${label} copied to clipboard! 📋`);
    }
  };

  const triggerConfetti = () => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js";
    script.onload = () => {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100000 };
      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;
      const interval: any = setInterval(function () {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        const particleCount = 50 * (timeLeft / duration);
        (window as any).confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        (window as any).confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
    };
    document.body.appendChild(script);
  };

  const executeRegisterDomain = async () => {
    if (!wallet) return showMessage("Connect wallet first");

    if (!isArcTestnet) {
      showMessage("Switching to Arc Testnet...");
      const switched = await switchToArcTestnet();
      if (!switched) return showMessage("Network switch failed. Please switch to Arc Testnet manually.");
    }

    try {
      setIsRegistering(true);
      const ethereum = getEthereum();
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      const ansContract = new ethers.Contract(ANS_CONTRACT_ADDRESS, ANS_ABI, signer);

      const cleanName = sanitizeDomainName(domainSearch);
      if (!cleanName) return showMessage("Enter a valid domain name");
      setDomainSearch(cleanName);

      showMessage("Confirm Registration in Wallet...");

      const tx = await ansContract.register(cleanName);

      showMessage("Registering domain on Arc Network...");
      const receipt = await tx.wait();

      const newDomain = `${cleanName}.nex`;
      setRegisteredDomain(newDomain);
      setRegistrationHash(receipt?.hash || "");

      localStorage.setItem(`nexio_domain_name_${wallet}`, newDomain);

      addHistoryRecord("Nexio Domain Registration", "Free", newDomain, "Completed", receipt?.hash || "");

      setShowDomainSuccess(true);
      triggerConfetti();

      setDomainSearch("");
      setDomainAvailable(false);
    } catch (error: any) {
      console.error(error);
      if (error.reason) {
        showMessage(`Registration Failed: ${error.reason}`);
      } else {
        showMessage("Domain registration failed or rejected");
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const shareOnX = () => {
    const appUrl = window.location.origin;
    const text = encodeURIComponent(`Just created my Web3 identity with @Nexio_0.\nHuman-readable domains, secure stablecoin payments, and enterprise-grade identity infrastructure—all in one place.\n\n${appUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
  };

  const downloadTrustPass = () => {
    showMessage("Generating Image... Please wait ⏳");
    const element = document.getElementById("nexio-pass-card");
    if (!element) return;

    const runImageGenerator = () => {
      (window as any).domtoimage.toPng(element, { quality: 1, bgcolor: '#050B14', scale: 3 })
        .then((dataUrl: string) => {
          const link = document.createElement('a');
          link.download = `${registeredDomain || 'nexio'}-pass.png`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          showMessage("Nexio Pass saved to your device! 📸");
        })
        .catch((err: any) => {
          console.error("Image Generation Error:", err);
          showMessage("Failed to generate image.");
        });
    };

    if ((window as any).domtoimage) {
      runImageGenerator();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/dom-to-image/2.6.0/dom-to-image.min.js";
      script.onload = runImageGenerator;
      script.onerror = () => showMessage("Could not load image generator.");
      document.body.appendChild(script);
    }
  };

  const handleTabSwitch = (tab: any) => {
    setSelectedTab(tab);
    setIsSidebarOpen(false);
  };

  const tc = theme === 'dark' ? {
    bgApp: "bg-[#020617] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.15),rgba(2,6,23,1))] text-white",
    navBorder: "border-white/5 bg-transparent",
    textWelcome: "from-white via-cyan-100 to-cyan-500",
    textDesc: "text-cyan-100/70",
    textMain: "text-white",
    textMuted: "text-gray-400",
    solidCardBg: "bg-white/[0.02] border-white/10 backdrop-blur-3xl shadow-2xl",
    sidebarActive: "bg-white/10 text-white border-white/20 shadow-[0_0_30px_rgba(6,182,212,0.15)]",
    sidebarInactive: "bg-transparent text-gray-500 hover:bg-white/5 hover:text-white",
    drawerBg: "bg-[#050B14] border-white/10",
    cardBg: "border-white/10 bg-gradient-to-b from-[#0A1A3F]/50 to-transparent shadow-2xl text-white hover:border-white/20",
    actionCard: "border-white/5 bg-[#0A1A3F]/30 shadow-lg text-white hover:bg-white/10 hover:border-white/20",
    modalBg: "border-white/10 bg-[#0A1A3F] shadow-2xl text-white",
    inputBg: "border-white/10 bg-black/50 text-white focus:border-cyan-500",
    historyCard: "border-white/5 bg-[#0A1A3F]/30 hover:border-white/10 hover:bg-black/80 text-white",
    historyText: "text-gray-400",
    footerBg: "border-white/10 bg-black/60",
    footerIcon: "text-gray-500 border-white/5 bg-white/5 hover:text-white hover:bg-white/10",
  } : {
    bgApp: "bg-slate-50 text-slate-900",
    navBorder: "border-slate-200 bg-white/60",
    textWelcome: "from-slate-900 via-cyan-700 to-cyan-500",
    textDesc: "text-slate-600",
    textMain: "text-slate-900",
    textMuted: "text-slate-500",
    solidCardBg: "bg-white border-slate-200 shadow-xl",
    sidebarActive: "bg-cyan-50 text-cyan-700 border-cyan-200 shadow-sm",
    sidebarInactive: "bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800",
    drawerBg: "bg-white border-slate-200",
    cardBg: "border-slate-200 bg-white shadow-xl text-slate-900 hover:border-slate-300",
    actionCard: "border-slate-200 bg-white shadow-md text-slate-900 hover:bg-slate-50 hover:border-slate-300",
    modalBg: "border-slate-200 bg-white shadow-2xl text-slate-900",
    inputBg: "border-slate-300 bg-slate-50 text-slate-900 focus:border-cyan-500",
    historyCard: "border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-900",
    historyText: "text-slate-500",
    footerBg: "border-slate-200 bg-white/80",
    footerIcon: "text-slate-500 border-slate-200 bg-slate-50 hover:text-cyan-600 hover:bg-slate-100",
  };

  return (
    <div className={`min-h-screen relative font-sans flex flex-col selection:bg-cyan-500/30 transition-colors duration-500 overflow-x-hidden ${tc.bgApp}`}>

      {message && (
        <div className="fixed top-8 left-1/2 z-[100] -translate-x-1/2 rounded-full border border-white/10 bg-[#0A1A3F]/90 backdrop-blur-xl px-4 py-3 sm:px-8 sm:py-4 shadow-[0_0_40px_rgba(6,182,212,0.2)] transition-all duration-500 animate-in fade-in slide-in-from-top-4">
          <div className="font-bold text-xs sm:text-sm tracking-wide text-white whitespace-nowrap">{message}</div>
        </div>
      )}

      {showDomainSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/90 p-4 backdrop-blur-xl">
          <div className="w-full max-w-md rounded-[2.5rem] border border-cyan-500/30 bg-gradient-to-b from-[#0A1A3F] to-[#020617] p-8 shadow-[0_0_80px_rgba(6,182,212,0.2)] flex flex-col items-center text-center relative overflow-hidden">
            <button onClick={() => setShowDomainSuccess(false)} className="absolute top-6 right-6 text-gray-500 hover:text-white transition bg-white/5 hover:bg-white/10 rounded-full p-2.5 z-10">✕</button>
            <div className="w-24 h-24 bg-[#050B14] border border-cyan-500/20 rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.3)] mb-6 overflow-hidden p-2 transform transition-transform hover:scale-105 pointer-events-none">
              <img src="/nexio-logo.png" alt="Nexio Logo" crossOrigin="anonymous" className="w-full h-full object-contain rounded-2xl" />
            </div>
            <h2 className="text-3xl font-black text-white tracking-tight mb-2">Congratulations!</h2>
            <p className="text-sm font-medium text-gray-300 mb-6">Your domain has been successfully registered, <span className="text-cyan-400 font-bold">verified on Arc Testnet</span>!</p>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/50 bg-cyan-500/10 px-6 py-2 mb-8 pointer-events-none">
              <span className="text-cyan-400">⚡</span>
              <span className="text-sm font-black text-cyan-400 tracking-widest uppercase">Lifetime Ownership</span>
            </div>
            <div className="w-full rounded-2xl border border-cyan-500/20 bg-black/50 p-5 flex justify-between items-center mb-4">
              <span className="text-xl font-black text-white">{registeredDomain}</span>
              <span className="bg-white/10 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider text-gray-300">Forever</span>
            </div>
            <div className="w-full rounded-2xl border border-white/5 bg-black/50 p-5 flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-gray-400">Tx Hash: <span className="text-white ml-1">{registrationHash.slice(0, 6)}...{registrationHash.slice(-4)}</span></span>
              <button onClick={() => window.open(`${ARC_EXPLORER}/tx/${registrationHash}`, "_blank")} className="bg-white/10 hover:bg-white/20 transition px-4 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1">Explorer ↗</button>
            </div>
          </div>
        </div>
      )}

      {showReceiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-[2rem] border p-6 sm:p-8 backdrop-blur-2xl transition-colors duration-300 shadow-[0_0_50px_rgba(6,182,212,0.15)] ${tc.modalBg}`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-2xl font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Receive Funds</h3>
              <button onClick={() => setShowReceiveModal(false)} className="text-gray-400 hover:text-cyan-500 transition rounded-full p-2.5">✕</button>
            </div>

            <div className="flex flex-col items-center justify-center space-y-6">
              <div className="bg-white p-3 rounded-3xl shadow-xl border border-gray-200">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${wallet}&color=0A1A3F`} alt="Wallet QR Code" className="w-48 h-48 rounded-2xl" />
              </div>

              <div className="text-center w-full">
                <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${tc.textMuted}`}>Your Wallet Address</p>
                <div className={`text-sm font-mono break-all p-4 rounded-2xl border ${theme === 'dark' ? 'bg-black/50 border-white/10 text-cyan-400' : 'bg-slate-50 border-slate-200 text-cyan-700'}`}>
                  {wallet}
                </div>
              </div>

              <button onClick={copyAddress} className="w-full rounded-2xl bg-cyan-500 text-white hover:bg-cyan-400 py-4 font-black text-lg transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy Address
              </button>
            </div>
          </div>
        </div>
      )}

      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-[2rem] border p-6 sm:p-8 backdrop-blur-2xl transition-colors duration-300 ${tc.modalBg}`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-2xl font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Request Payment</h3>
              <button onClick={() => setShowRequestModal(false)} className="text-gray-400 hover:text-cyan-500 transition rounded-full p-2.5">✕</button>
            </div>

            <div className="space-y-5">
              <div>
                <label className={`text-xs font-bold mb-2 block uppercase tracking-widest ${tc.historyText}`}>Select Asset to Receive</label>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setRequestAsset("USDC")} className={`rounded-2xl py-3 border-2 font-black tracking-wide transition-all ${requestAsset === "USDC" ? "border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]" : "border-transparent bg-slate-100 dark:bg-black/50 text-gray-500"}`}>USDC</button>
                  <button onClick={() => setRequestAsset("EURC")} className={`rounded-2xl py-3 border-2 font-black tracking-wide transition-all ${requestAsset === "EURC" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "border-transparent bg-slate-100 dark:bg-black/50 text-gray-500"}`}>EURC</button>
                </div>
              </div>

              <div>
                <label className={`text-xs font-bold mb-2 flex justify-between uppercase tracking-widest ${tc.historyText}`}>
                  <span>Requested Amount</span>
                  <span className="font-mono">Bal: {requestAsset === "USDC" ? usdcBalance : eurcBalance}</span>
                </label>
                <input type="number" value={requestAmount} onChange={(e) => setRequestAmount(e.target.value)} placeholder="0.00" className={`w-full rounded-2xl border px-5 py-4 focus:outline-none transition text-2xl font-black ${tc.inputBg}`} />
              </div>

              {!paymentLink ? (
                <button onClick={generatePaymentLink} disabled={!requestAmount} className="w-full rounded-2xl bg-cyan-500 text-white hover:bg-cyan-400 py-4 font-black text-lg transition-all active:scale-95 disabled:opacity-50 mt-2 shadow-xl">
                  Generate Link
                </button>
              ) : (
                <div className="mt-4 p-5 rounded-3xl border border-cyan-500/30 bg-cyan-500/10 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="bg-white p-2 rounded-xl shadow-lg shrink-0 pointer-events-none">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(paymentLink)}&color=0A1A3F`} alt="Payment Link QR" className="w-20 h-20 rounded-lg" />
                    </div>
                    <div className="flex flex-col w-full text-center sm:text-left">
                      <div className="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-1">Scan or Share Link</div>
                      <div className="text-[10px] sm:text-xs font-mono break-all text-gray-300 bg-black/50 p-2.5 rounded-xl border border-white/5">
                        {paymentLink}
                      </div>
                    </div>
                  </div>

                  <button onClick={copyPaymentLink} className="w-full rounded-xl bg-white text-black hover:bg-gray-200 py-3 font-black transition-all active:scale-95 flex items-center justify-center gap-2 mt-1">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    Copy Payment Link
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className={`w-full max-w-sm rounded-[2rem] border p-6 sm:p-8 backdrop-blur-2xl transition-colors duration-300 shadow-[0_0_50px_rgba(6,182,212,0.15)] ${tc.modalBg}`}>
            <div className="text-center mb-6">
              <div className="text-4xl mb-4 animate-pulse pointer-events-none">⚠️</div>
              <h3 className={`text-xl font-black mb-2 ${tc.textMain}`}>Confirm Payment</h3>
              <p className={`text-sm ${tc.textMuted}`}>Please verify the details below before sending. Transactions cannot be reversed.</p>
            </div>

            <div className={`rounded-2xl p-4 mb-6 border space-y-3 ${theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Asset</span>
                <span className={`font-black text-lg ${tc.textMain}`}>
                  {(() => {
                    const recipients = (isBatchMode ? sendAddress.split(",") : [sendAddress]).map((a) => a.trim()).filter((a) => a !== "");
                    const count = isBatchMode ? Math.max(recipients.length, 1) : 1;
                    const decimals = sendAsset === "USDC" ? WUSDC_DECIMALS : EURC_DECIMALS;
                    const per = parseAmount(sendAmount, decimals);
                    const total = per ? per * BigInt(count) : null;
                    const label = total ? formatPretty(total, decimals, 6) : sendAmount;
                    return `${label} ${sendAsset}`;
                  })()}
                </span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">To</span>
                <div className="text-right">
                  {isBatchMode ? (
                    <span className={`text-sm font-mono font-bold ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>{(sendAddress.split(',').map((a) => a.trim()).filter((a) => a !== "")).length} Recipients</span>
                  ) : (
                    <span className={`text-sm font-mono font-bold break-all ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>{sendAddress}</span>
                  )}
                </div>
              </div>
              {sendMemo && (
                <div className="flex justify-between items-center pt-2 border-t border-gray-500/20">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Memo</span>
                  <span className={`text-xs font-medium ${tc.textMuted}`}>{sendMemo}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowConfirmModal(false)} disabled={isSending} className={`flex-1 rounded-xl py-3 font-bold transition-all border disabled:opacity-50 ${theme === 'dark' ? 'bg-gray-800 text-white border-transparent hover:bg-gray-700' : 'bg-slate-200 text-slate-800 border-slate-300 hover:bg-slate-300'}`}>Cancel</button>
              <button onClick={executeSend} disabled={isSending} className="flex-1 rounded-xl bg-cyan-500 text-white py-3 font-black hover:bg-cyan-400 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:active:scale-100">{isSending ? "Processing..." : "Confirm & Send"}</button>
            </div>
          </div>
        </div>
      )}

      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-[2rem] border p-6 sm:p-8 backdrop-blur-2xl transition-colors duration-300 ${tc.modalBg}`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-2xl font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Send Asset</h3>
              <button onClick={() => { setIsScanning(false); setShowSendModal(false); }} className="text-gray-400 hover:text-cyan-500 transition rounded-full p-2.5">✕</button>
            </div>

            <div className="flex items-center justify-between bg-black/20 p-3 rounded-2xl mb-6 border border-white/5">
              <div className="flex flex-col">
                <span className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>Batch Transfer</span>
                <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">v0.7.2 FEATURE</span>
              </div>
              <button onClick={() => setIsBatchMode(!isBatchMode)} className={`w-12 h-6 rounded-full transition-colors relative ${isBatchMode ? 'bg-cyan-500' : 'bg-gray-600'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${isBatchMode ? 'translate-x-7' : 'translate-x-1'}`}></div>
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className={`text-xs font-bold mb-2 flex justify-between items-center uppercase tracking-widest ${tc.historyText}`}>
                  <span className="flex items-center gap-2">
                    Recipient {isBatchMode ? "Addresses or names" : "Address or name"}
                    <button
                      type="button"
                      onClick={() => setIsScanning((prev) => !prev)}
                      className={`normal-case tracking-wide text-[10px] font-black px-2.5 py-1 rounded-lg border transition-all ${isScanning
                        ? (theme === "dark" ? "border-cyan-400 bg-cyan-500/20 text-cyan-300" : "border-cyan-500 bg-cyan-100 text-cyan-700")
                        : (theme === "dark" ? "border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10" : "border-cyan-300 text-cyan-600 hover:bg-cyan-50")
                        }`}
                    >
                      {isScanning ? "Close" : "Scan QR"}
                    </button>
                  </span>
                  {isBatchMode && <span className="text-[9px] text-orange-400">Separate with comma (,)</span>}
                </label>
                {isScanning && (
                  <div className="mb-3 overflow-hidden rounded-2xl border border-cyan-500/30 bg-black">
                    <QrScanner
                      onScan={(detected: IDetectedBarcode[]) => {
                        const text = detected?.[0]?.rawValue;
                        if (text) applyScannedRecipient(text);
                      }}
                      onError={(error) => {
                        if (error?.kind === "permission-denied") showMessage("Camera permission denied");
                        else if (error?.kind === "no-camera") showMessage("No camera found");
                        else if (error?.message) showMessage(error.message);
                      }}
                      constraints={{ facingMode: "environment" }}
                      formats={["qr_code"]}
                      sound={false}
                      styles={{ container: { width: "100%" } }}
                    />
                  </div>
                )}
                {isBatchMode ? (
                  <textarea value={sendAddress} onChange={(e) => setSendAddress(e.target.value)} placeholder="0x1..., jubayir.nex, 0x3..." className={`w-full rounded-2xl border px-5 py-4 focus:outline-none transition font-mono text-sm resize-none h-24 ${tc.inputBg}`} />
                ) : (
                  <div>
                    <input type="text" value={sendAddress} onChange={(e) => setSendAddress(e.target.value)} placeholder="e.g., 0x... or jubayir.nex" className={`w-full rounded-2xl border px-5 py-4 focus:outline-none transition font-mono text-sm ${tc.inputBg}`} />
                    {isResolvingRecipient && (
                      <div className="mt-1.5 px-3 py-1 rounded-xl text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-2 animate-pulse">
                        <span>🔄</span> Resolving on-chain identity...
                      </div>
                    )}
                    {!isResolvingRecipient && resolvedRecipientDomain && (
                      <div className="mt-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <span>🛡️</span>
                          <span>Verified Arc Domain: <strong className="text-white font-black">{resolvedRecipientDomain}</strong></span>
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-mono">ANS Verified</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className={`text-xs font-bold mb-2 block uppercase tracking-widest ${tc.historyText}`}>Select Asset</label>
                <div className="grid grid-cols-2 gap-4">
                  <button onClick={() => setSendAsset("USDC")} className={`rounded-2xl py-3 border-2 font-black tracking-wide transition-all ${sendAsset === "USDC" ? "border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]" : "border-transparent bg-slate-100 dark:bg-black/50 text-gray-500"}`}>USDC</button>
                  <button onClick={() => setSendAsset("EURC")} className={`rounded-2xl py-3 border-2 font-black tracking-wide transition-all ${sendAsset === "EURC" ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]" : "border-transparent bg-slate-100 dark:bg-black/50 text-gray-500"}`}>EURC</button>
                </div>
              </div>
              <div>
                <label className={`text-xs font-bold mb-2 flex justify-between uppercase tracking-widest ${tc.historyText}`}>
                  <span>Amount {isBatchMode && "(Per address)"}</span>
                  <span className="font-mono">Bal: {sendAsset === "USDC" ? usdcBalance : eurcBalance}</span>
                </label>
                <input type="number" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} placeholder="0.00" className={`w-full rounded-2xl border px-5 py-4 focus:outline-none transition text-2xl font-black ${tc.inputBg}`} />
              </div>

              <div>
                <label className={`text-xs font-bold mb-2 flex justify-between uppercase tracking-widest ${tc.historyText}`}>
                  <span>Tx Memo</span>
                  <span className={`text-[9px] sm:text-[10px] px-2 py-0.5 rounded-md ${theme === 'dark' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-100 text-cyan-600'}`}>v0.7.2 FEATURE</span>
                </label>
                <input type="text" value={sendMemo} onChange={(e) => setSendMemo(e.target.value)} placeholder="Optional (e.g. Invoice #123)" className={`w-full rounded-2xl border px-5 py-3 focus:outline-none transition text-sm ${tc.inputBg}`} />
              </div>

              <button onClick={handleSendClick} disabled={isSending || !sendAddress || !sendAmount} className="w-full rounded-2xl bg-cyan-500 text-white hover:bg-cyan-400 py-4 font-black text-lg transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 mt-2 shadow-xl">
                {isSending ? "Processing..." : `Send ${sendAsset}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER / SIDEBAR */}
      <div className={`fixed inset-0 z-[100] transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)}></div>
        <div className={`absolute top-0 right-0 w-72 sm:w-80 h-full border-l p-6 flex flex-col gap-2 transform transition-transform duration-300 shadow-2xl overflow-y-auto ${tc.drawerBg} ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex justify-between items-center mb-6">
            <span className={`text-xl font-black ${tc.textMain}`}>Menu</span>
            <button onClick={() => setIsSidebarOpen(false)} className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'}`}>✕</button>
          </div>

          <button onClick={() => handleTabSwitch("overview")} className={`w-full rounded-2xl px-6 py-4 text-left font-black tracking-wide transition-all border ${selectedTab === "overview" ? tc.sidebarActive : tc.sidebarInactive}`}>
            Dashboard
          </button>

          <button onClick={() => handleTabSwitch("portfolio")} className={`w-full rounded-2xl px-6 py-4 text-left flex justify-between items-center font-black tracking-wide transition-all border ${selectedTab === "portfolio" ? tc.sidebarActive : tc.sidebarInactive}`}>
            <span>Portfolio & DeFi</span>
            <span className={`text-[10px] px-2 py-1 rounded-lg font-black tracking-widest ${theme === 'dark' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>LIVE</span>
          </button>

          <button onClick={() => handleTabSwitch("swap")} className={`w-full rounded-2xl px-6 py-4 text-left flex justify-between items-center font-black tracking-wide transition-all border ${selectedTab === "swap" ? tc.sidebarActive : tc.sidebarInactive}`}>
            <span>Nexio Swap</span>
            <span className={`text-[10px] px-2 py-1 rounded-lg font-black tracking-widest ${theme === 'dark' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-100 text-indigo-700'}`}>NEW</span>
          </button>

          <button onClick={() => handleTabSwitch("lp")} className={`w-full rounded-2xl px-6 py-4 text-left flex justify-between items-center font-black tracking-wide transition-all border ${selectedTab === "lp" ? tc.sidebarActive : tc.sidebarInactive}`}>
            <span>Liquidity</span>
            <span className={`text-[10px] px-2 py-1 rounded-lg font-black tracking-widest ${theme === 'dark' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-100 text-cyan-700'}`}>LP</span>
          </button>

          <button onClick={() => handleTabSwitch("dailygm")} className={`w-full rounded-2xl px-6 py-4 text-left flex justify-between items-center font-black tracking-wide transition-all border ${selectedTab === "dailygm" ? tc.sidebarActive : tc.sidebarInactive}`}>
            <span>Daily GM</span>
            <span className="text-xl pointer-events-none">🔥</span>
          </button>
          <button onClick={() => handleTabSwitch("domains")} className={`w-full rounded-2xl px-6 py-4 text-left font-black tracking-wide transition-all border ${selectedTab === "domains" ? tc.sidebarActive : tc.sidebarInactive}`}>
            Nexio Domains
          </button>
          <button onClick={() => handleTabSwitch("trustpass")} className={`w-full rounded-2xl px-6 py-4 text-left flex justify-between items-center font-black tracking-wide transition-all border ${selectedTab === "trustpass" ? tc.sidebarActive : tc.sidebarInactive}`}>
            <span>Nexio Pass</span>
            <span className={`text-[10px] px-2 py-1 rounded-lg ${theme === 'dark' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-100 text-cyan-700'}`}>NEW</span>
          </button>
          <button onClick={() => handleTabSwitch("history")} className={`w-full rounded-2xl px-6 py-4 text-left font-black tracking-wide transition-all border ${selectedTab === "history" ? tc.sidebarActive : tc.sidebarInactive}`}>
            History
          </button>
          <button onClick={() => handleTabSwitch("learn")} className={`w-full rounded-2xl px-6 py-4 text-left font-black tracking-wide transition-all border ${selectedTab === "learn" ? tc.sidebarActive : tc.sidebarInactive}`}>
            Learn
          </button>

          <div className="mt-auto pt-6 border-t border-white/5 space-y-2">
            {wallet && (
              <button onClick={() => { setIsSidebarOpen(false); disconnectWallet(); }} className={`w-full rounded-2xl px-6 py-4 font-black tracking-wide transition-all border ${theme === 'dark' ? 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white' : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white'}`}>
                Disconnect Wallet
              </button>
            )}
            <button onClick={toggleTheme} className={`w-full rounded-2xl px-6 py-4 font-black tracking-wide transition-all border flex items-center justify-center gap-2 ${theme === 'dark' ? 'border-white/10 bg-white/5 hover:bg-white/10 text-yellow-400' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-indigo-900'}`}>
              {theme === 'dark' ? '☀️ Switch to Light Mode' : '🌙 Switch to Dark Mode'}
            </button>
          </div>
        </div>
      </div>

      {/* TOP NAVIGATION */}
      <nav className={`flex flex-wrap items-center justify-between gap-4 px-4 py-4 md:px-10 md:py-6 sticky top-0 z-40 backdrop-blur-xl border-b transition-colors duration-500 ${tc.navBorder}`}>
        <div className="flex items-center gap-3 md:gap-5">
          <h1 className={`text-xl sm:text-2xl md:text-3xl font-black tracking-tighter drop-shadow-md ${tc.textMain}`}>Nexio</h1>

          {wallet && (
            <div className={`hidden sm:flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md ${theme === 'dark' ? 'border-white/5 bg-black/30' : 'border-slate-200 bg-white shadow-sm'}`}>
              <div className={`w-2 h-2 rounded-full pointer-events-none ${isArcTestnet ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'} animate-pulse`}></div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-gray-400' : 'text-slate-500'}`}>
                {isArcTestnet ? `Online ⚡ ${networkLatency > 0 ? `${networkLatency}ms` : ''}` : 'Offline'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {wallet ? (
            <>
              <div className={`hidden md:block rounded-full border px-5 py-2 font-bold tracking-wider backdrop-blur-md shadow-sm text-sm ${theme === 'dark' ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>{wallet.slice(0, 6)}...{wallet.slice(-4)}</div>
              <button type="button" onClick={disconnectWallet} className="hidden sm:block rounded-full bg-red-500/10 text-red-500 border border-red-500/20 px-4 py-2 text-xs md:text-sm transition-all hover:bg-red-500 hover:text-white font-bold backdrop-blur-md hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]">Disconnect</button>
            </>
          ) : (
            <button type="button" onClick={connectWallet} className={`rounded-full px-4 py-2 text-xs sm:text-sm md:text-base transition-all hover:scale-105 active:scale-95 font-black shadow-lg ${theme === 'dark' ? 'bg-white text-black' : 'bg-slate-900 text-white'}`}>Connect Wallet</button>
          )}

          <button onClick={() => setIsSidebarOpen(true)} className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all active:scale-90 ${theme === 'dark' ? 'border-white/20 bg-white/5 hover:bg-white/10 text-white' : 'border-slate-300 bg-white shadow-sm hover:bg-slate-50 text-slate-900'}`}>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        </div>
      </nav>

      {/* MAIN CONTENT */}
      <main className="flex-1 px-4 py-6 md:py-10 md:px-10 flex flex-col items-center">
        <div className="w-full max-w-4xl flex flex-col gap-8 md:gap-10">

          <div className="text-center space-y-3 md:space-y-4">
            <h1 className={`text-4xl sm:text-6xl md:text-7xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-br pb-2 drop-shadow-sm ${tc.textWelcome}`}>
              Welcome to Nexio
            </h1>
            <p className={`text-sm md:text-lg font-medium tracking-wide max-w-xl mx-auto px-2 ${tc.textDesc}`}>
              Enterprise-grade stablecoin management built on the lightning-fast Arc L1 Network.
            </p>
          </div>

          <div className="w-full">
            {selectedTab === "overview" && (
              <div className="space-y-6 md:space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
                  <div className={`rounded-3xl md:rounded-[2.5rem] p-6 md:p-8 relative overflow-hidden group transition-all duration-500 md:hover:-translate-y-1 ${tc.cardBg}`}>
                    <div className="absolute -top-6 -right-6 md:-top-10 md:-right-10 p-6 md:p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-700 text-7xl md:text-9xl group-hover:scale-110 pointer-events-none">💵</div>
                    <div className={`text-[10px] md:text-xs font-black uppercase tracking-widest mb-3 md:mb-4 ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>USDC Balance</div>
                    <div className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter drop-shadow-sm">{!balancesReady && balancesLoading ? "..." : usdcBalance}</div>
                  </div>

                  <div className={`rounded-3xl md:rounded-[2.5rem] p-6 md:p-8 relative overflow-hidden group transition-all duration-500 md:hover:-translate-y-1 ${tc.cardBg}`}>
                    <div className="absolute -top-6 -right-6 md:-top-10 md:-right-10 p-6 md:p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-700 text-7xl md:text-9xl group-hover:scale-110 pointer-events-none">💶</div>
                    <div className={`text-[10px] md:text-xs font-black uppercase tracking-widest mb-3 md:mb-4 ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>EURC Balance</div>
                    <div className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter drop-shadow-sm">{!balancesReady && balancesLoading ? "..." : eurcBalance}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 md:gap-6">
                  <button onClick={handleOpenSendModal} className={`group rounded-2xl sm:rounded-3xl md:rounded-[2.5rem] p-4 sm:p-6 md:p-8 text-center transition-all md:hover:-translate-y-2 flex flex-col items-center justify-center ${tc.actionCard}`}>
                    <div className="text-sm sm:text-lg md:text-xl font-black group-hover:scale-105 transition-transform tracking-wide">Send</div>
                    <span className={`text-[8px] mt-1 tracking-widest opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>BATCH (v0.7.2)</span>
                  </button>

                  <button onClick={handleOpenRequestModal} className={`group rounded-2xl sm:rounded-3xl md:rounded-[2.5rem] p-4 sm:p-6 md:p-8 text-center transition-all md:hover:-translate-y-2 flex flex-col items-center justify-center relative ${tc.actionCard}`}>
                    <div className="absolute top-2 right-2 md:top-4 md:right-4 w-2 h-2 rounded-full bg-cyan-500 animate-pulse pointer-events-none"></div>
                    <div className="text-sm sm:text-lg md:text-xl font-black group-hover:scale-105 transition-transform tracking-wide">Request</div>
                    <span className={`text-[8px] mt-1 tracking-widest opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>PAYMENT LINK</span>
                  </button>

                  <button onClick={() => {
                    if (!wallet) return showMessage("Connect wallet first");
                    setShowReceiveModal(true);
                  }} className={`group rounded-2xl sm:rounded-3xl md:rounded-[2.5rem] p-4 sm:p-6 md:p-8 text-center transition-all md:hover:-translate-y-2 flex flex-col items-center justify-center ${tc.actionCard}`}>
                    <div className="text-sm sm:text-lg md:text-xl font-black group-hover:scale-105 transition-transform tracking-wide">Receive</div>
                    <span className={`text-[8px] mt-1 tracking-widest opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>QR CODE PAY</span>
                  </button>

                  <button onClick={openFaucet} className={`group rounded-2xl sm:rounded-3xl md:rounded-[2.5rem] p-4 sm:p-6 md:p-8 text-center transition-all md:hover:-translate-y-2 flex flex-col items-center justify-center ${tc.actionCard}`}>
                    <div className="text-sm sm:text-lg md:text-xl font-black group-hover:scale-105 transition-transform tracking-wide">Faucet</div>
                    <span className={`text-[8px] mt-1 tracking-widest opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>FREE TESTNET</span>
                  </button>
                </div>
              </div>
            )}

            {/* REAL PORTFOLIO & DEFI TAB CONTENT */}
            {selectedTab === "portfolio" && (
              <div className="w-full max-w-2xl mx-auto space-y-6 md:space-y-8 animate-in fade-in zoom-in-95 duration-500 font-mono">

                {/* 100% Real Portfolio Header */}
                <div className={`p-8 md:p-10 rounded-[2rem] border transition-all duration-500 ${tc.solidCardBg}`}>
                  <div className="flex flex-col items-center text-center">
                    <span className={`text-sm font-bold tracking-widest uppercase mb-4 ${tc.textMuted}`}>Total Net Worth</span>
                    <div className={`text-5xl sm:text-6xl font-black tracking-tighter mb-2 ${tc.textMain}`}>
                      ${!balancesReady && balancesLoading ? "..." : netWorthUsd.toFixed(2)}
                    </div>
                    <span className={`text-xs font-bold tracking-widest uppercase mb-6 ${tc.textMuted}`}>Based on live data (1 EURC ≈ ${liveEurcUsdRate.toFixed(4)})</span>
                  </div>
                </div>

                {/* 100% REAL DEFI VAULT STAKING SECTION */}
                <div className={`rounded-3xl md:rounded-[2rem] border p-6 md:p-8 relative overflow-hidden transition-all shadow-[0_0_40px_rgba(16,185,129,0.1)] ${theme === 'dark' ? 'bg-gradient-to-br from-[#0A1A3F] to-emerald-950/30 border-emerald-500/30' : 'bg-gradient-to-br from-emerald-50 to-white border-emerald-200'}`}>
                  <div className={`absolute top-4 right-4 p-3 text-5xl md:text-6xl pointer-events-none ${theme === 'dark' ? 'opacity-10' : 'opacity-[0.05]'}`}>🌱</div>

                  <div className={`text-[10px] md:text-xs font-black uppercase tracking-widest mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${tc.textMuted}`}>
                    <span>Nexio DeFi Vault</span>
                    <div className="flex gap-2 p-1 rounded-lg bg-black/20 border border-white/5 relative z-10">
                      <button onClick={() => setVaultAsset("USDC")} className={`px-4 py-1.5 rounded-md transition-colors ${vaultAsset === "USDC" ? "bg-cyan-500 text-white shadow-sm" : "hover:bg-white/10"}`}>USDC</button>
                      <button onClick={() => setVaultAsset("EURC")} className={`px-4 py-1.5 rounded-md transition-colors ${vaultAsset === "EURC" ? "bg-emerald-500 text-white shadow-sm" : "hover:bg-white/10"}`}>EURC</button>
                    </div>
                  </div>

                  <div className="flex flex-col mb-8 gap-1 relative z-10">
                    <div className={`text-xs font-bold uppercase tracking-widest ${tc.textMuted}`}>Your Staked Balance</div>
                    <div className={`text-4xl md:text-5xl font-black tracking-tighter ${vaultAsset === "USDC" ? (theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600') : (theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600')}`}>
                      {vaultAsset === "USDC" ? usdcStakedBalance : eurcStakedBalance} <span className="text-xl md:text-2xl text-gray-500">{vaultAsset}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3 mt-2 relative z-10">
                    <div className="relative w-full">
                      <input
                        type="number"
                        value={vaultInput}
                        onChange={(e) => setVaultInput(e.target.value)}
                        placeholder="0.00"
                        className={`w-full rounded-xl border px-4 py-3 focus:outline-none transition font-bold text-lg ${tc.inputBg}`}
                      />
                      <button
                        onClick={() => setVaultInput(vaultAsset === "USDC" ? formatExact(maxNativeSpend(usdcBalanceRaw), WUSDC_DECIMALS) : formatExact(eurcBalanceRaw, EURC_DECIMALS))}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-black uppercase rounded bg-white/10 hover:bg-white/20 transition-colors ${tc.textMain}`}
                      >
                        Max
                      </button>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        onClick={() => handleVaultAction("stake")}
                        disabled={isVaultLoading || !vaultInput}
                        className={`flex-1 sm:flex-none px-6 py-3 rounded-xl font-black text-base transition-all shadow-md text-white flex justify-center items-center gap-2 disabled:opacity-50 ${vaultAsset === "USDC" ? 'bg-cyan-500 hover:bg-cyan-400' : 'bg-emerald-500 hover:bg-emerald-400'} active:scale-95`}
                      >
                        {isVaultLoading && vaultAction === 'stake' ? '...' : 'Stake'}
                      </button>
                      <button
                        onClick={() => handleVaultAction("withdraw")}
                        disabled={isVaultLoading || !vaultInput}
                        className={`flex-1 sm:flex-none px-6 py-3 rounded-xl font-black text-base transition-all border shadow-sm flex justify-center items-center gap-2 active:scale-95 disabled:opacity-50 ${vaultAsset === "USDC" ? (theme === 'dark' ? 'bg-transparent border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10' : 'bg-white border-cyan-300 text-cyan-700 hover:bg-cyan-50') : (theme === 'dark' ? 'bg-transparent border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10' : 'bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50')}`}
                      >
                        {isVaultLoading && vaultAction === 'withdraw' ? '...' : 'Withdraw'}
                      </button>
                    </div>
                  </div>
                  <div className={`text-[10px] mt-4 text-center font-bold ${tc.textMuted}`}>Contract: {vaultAsset === "USDC" ? USDC_VAULT_ADDRESS : EURC_VAULT_ADDRESS}</div>
                </div>

                {/* REAL NEXIO LOYALTY POINTS (PTS) SECTION */}
                <div className={`rounded-3xl md:rounded-[2rem] border p-6 md:p-8 relative overflow-hidden transition-all shadow-xl ${theme === 'dark' ? 'bg-gradient-to-br from-[#0A1A3F] to-indigo-950/40 border-indigo-500/30' : 'bg-gradient-to-br from-indigo-50 to-white border-indigo-200'}`}>
                  <div className={`absolute top-4 right-4 p-3 text-5xl md:text-6xl pointer-events-none ${theme === 'dark' ? 'opacity-10' : 'opacity-[0.05]'}`}>🎯</div>

                  <div className="mb-6 max-w-[80%] relative z-10">
                    <h3 className={`text-xl md:text-2xl font-black tracking-tight mb-2 ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-700'}`}>Nexio Loyalty Points (NLP)</h3>
                    <p className={`text-xs md:text-sm font-medium leading-relaxed ${tc.textMuted}`}>
                      Track your ecosystem engagement. NLP reflects your active participation in the Nexio protocol and helps build your on-chain reputation.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-black/20 p-5 rounded-2xl border border-white/5 relative z-10">
                    <div className="flex flex-col gap-4 w-full">
                      <div className="flex justify-between items-center">
                        <span className={`text-xs font-bold uppercase tracking-widest ${tc.textMuted}`}>Total Lifetime NLP</span>
                        <span className={`text-xl font-black ${tc.textMain}`}>{lifetimePts.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-white/10 pt-4">
                        <span className={`text-xs font-bold uppercase tracking-widest ${tc.textMuted}`}>Unclaimed NLP</span>
                        <span className={`text-2xl font-black text-indigo-400 animate-pulse`}>+ {unclaimedPts.toFixed(2)}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleClaimPts}
                      disabled={isVaultLoading || unclaimedPts <= 0}
                      className={`w-full sm:w-auto px-6 py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] disabled:opacity-50 disabled:shadow-none active:scale-95 ${theme === 'dark' ? 'bg-indigo-500 hover:bg-indigo-400 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                    >
                      {isVaultLoading && vaultAction === 'claim' ? 'Claiming...' : 'Claim NLP'}
                    </button>
                  </div>
                </div>

                {/* 100% Real Assets List */}
                <div className={`p-8 md:p-10 rounded-[2rem] border transition-all duration-500 ${tc.solidCardBg}`}>
                  <span className={`text-sm font-bold tracking-widest uppercase mb-6 block ${tc.textMuted}`}>Your Assets</span>

                  <div className="space-y-4">
                    {/* USDC */}
                    <div className="flex justify-between items-center pb-4 border-b border-gray-500/20">
                      <div className="flex items-center gap-4">
                        <div className="w-3 h-3 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] pointer-events-none"></div>
                        <span className={`text-lg font-black uppercase tracking-wider ${tc.textMain}`}>USDC</span>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${tc.textMain}`}>{usdcBalance} <span className="text-sm">USDC</span></div>
                        <div className={`text-xs font-medium mt-1 ${tc.textMuted}`}>${usdcWalletValue.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Staked USDC */}
                    <div className="flex justify-between items-center pb-4 border-b border-gray-500/20">
                      <div className="flex items-center gap-4">
                        <div className="w-3 h-3 rounded-full border-2 border-cyan-500 bg-transparent shadow-[0_0_10px_rgba(6,182,212,0.5)] pointer-events-none"></div>
                        <span className={`text-lg font-black uppercase tracking-wider ${tc.textMain}`}>USDC <span className="text-[10px] text-gray-500 ml-1">STAKED</span></span>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${tc.textMain}`}>{usdcStakedBalance} <span className="text-sm">USDC</span></div>
                        <div className={`text-xs font-medium mt-1 ${tc.textMuted}`}>${uStakedValue.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* EURC */}
                    <div className="flex justify-between items-center pb-4 border-b border-gray-500/20">
                      <div className="flex items-center gap-4">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] pointer-events-none"></div>
                        <span className={`text-lg font-black uppercase tracking-wider ${tc.textMain}`}>EURC</span>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${tc.textMain}`}>{eurcBalance} <span className="text-sm">EURC</span></div>
                        <div className={`text-xs font-medium mt-1 ${tc.textMuted}`}>${(eurcWalletValue * eurcUsdRate).toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Staked EURC */}
                    <div className="flex justify-between items-center pb-4 border-b border-gray-500/20">
                      <div className="flex items-center gap-4">
                        <div className="w-3 h-3 rounded-full border-2 border-emerald-500 bg-transparent shadow-[0_0_10px_rgba(16,185,129,0.5)] pointer-events-none"></div>
                        <span className={`text-lg font-black uppercase tracking-wider ${tc.textMain}`}>EURC <span className="text-[10px] text-gray-500 ml-1">STAKED</span></span>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${tc.textMain}`}>{eurcStakedBalance} <span className="text-sm">EURC</span></div>
                        <div className={`text-xs font-medium mt-1 ${tc.textMuted}`}>${(eStakedValue * eurcUsdRate).toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Other */}
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className="w-3 h-3 rounded-full bg-gray-500 pointer-events-none"></div>
                        <span className={`text-lg font-black uppercase tracking-wider ${tc.textMain}`}>Other</span>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-bold ${tc.textMain}`}>0.00</div>
                        <div className={`text-xs font-medium mt-1 ${tc.textMuted}`}>$0.00</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 100% Real Asset Allocation Bar */}
                <div className={`p-8 md:p-10 rounded-[2rem] border transition-all duration-500 ${tc.solidCardBg}`}>
                  <span className={`text-sm font-bold tracking-widest uppercase mb-6 block ${tc.textMuted}`}>Asset Allocation (Inc. Staked)</span>

                  <div className="w-full">
                    <div className={`w-full h-4 md:h-6 rounded-full overflow-hidden flex border shadow-inner mb-5 ${theme === 'dark' ? 'bg-black/50 border-white/5' : 'bg-gray-200 border-gray-300'}`}>
                      <div className="h-full bg-cyan-500 transition-all duration-1000" style={{ width: `${usdcPercent}%` }}></div>
                      <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${eurcPercent}%` }}></div>
                    </div>
                    <div className="flex justify-between text-xs md:text-sm font-black">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-cyan-500 pointer-events-none"></div>
                        <span className={tc.textMain}>USDC <span className={tc.textMuted}>({usdcPercent}%)</span></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={tc.textMain}><span className={tc.textMuted}>({eurcPercent}%)</span> EURC</span>
                        <div className="w-3 h-3 rounded-full bg-emerald-500 pointer-events-none"></div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {selectedTab === "swap" && (
              <div className="w-full max-w-lg mx-auto animate-in fade-in zoom-in-95 mt-2 md:mt-6">
                <div className={`p-5 sm:p-8 rounded-[1.75rem] sm:rounded-[2rem] border shadow-2xl relative overflow-hidden ${tc.solidCardBg}`}>
                  <div className="flex items-start justify-between gap-3 mb-6 relative z-10">
                    <div>
                      <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${tc.textMain}`}>Swap</h2>
                      <p className={`text-[10px] sm:text-xs mt-1 font-bold uppercase tracking-widest ${tc.textMuted}`}>USDC / EURC · 18-dec WUSDC</p>
                    </div>
                    <button
                      onClick={() => setShowSlippage((v) => !v)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition ${theme === 'dark' ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'}`}
                    >
                      Slip {slippageLabel(slippageBps)}
                    </button>
                  </div>

                  {showSlippage && (
                    <div className={`mb-5 p-3 rounded-2xl border relative z-10 ${theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                      <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${tc.textMuted}`}>Max slippage</div>
                      <div className="flex flex-wrap gap-2">
                        {SLIPPAGE_PRESETS.map((bps) => (
                          <button key={bps} onClick={() => { setSlippageBps(bps); setCustomSlippage(""); }} className={`px-3 py-1.5 rounded-xl text-xs font-black ${slippageBps === bps && !customSlippage ? "bg-cyan-500 text-white" : "bg-white/10 text-gray-400 hover:bg-white/20"}`}>
                            {slippageLabel(bps)}
                          </button>
                        ))}
                        <input
                          type="number"
                          inputMode="decimal"
                          value={customSlippage}
                          onChange={(e) => { setCustomSlippage(e.target.value); applyCustomSlippage(e.target.value, setSlippageBps); }}
                          placeholder="Custom %"
                          className={`w-24 rounded-xl border px-3 py-1.5 text-xs font-bold ${tc.inputBg}`}
                        />
                      </div>
                    </div>
                  )}

                  <div className="bg-black/20 p-1 rounded-2xl flex gap-1 mb-5 border border-white/5 relative z-10">
                    <button onClick={() => setSwapDirection("USDCtoEURC")} className={`flex-1 py-3 rounded-xl font-black text-xs sm:text-sm tracking-wide transition-all ${swapDirection === "USDCtoEURC" ? "bg-cyan-500 text-white shadow-lg" : "text-gray-500 hover:bg-white/10"}`}>USDC → EURC</button>
                    <button onClick={() => setSwapDirection("EURCtoUSDC")} className={`flex-1 py-3 rounded-xl font-black text-xs sm:text-sm tracking-wide transition-all ${swapDirection === "EURCtoUSDC" ? "bg-emerald-500 text-white shadow-lg" : "text-gray-500 hover:bg-white/10"}`}>EURC → USDC</button>
                  </div>

                  <div className="space-y-3 relative z-10">
                    <div className={`rounded-2xl border p-4 ${theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${tc.textMuted}`}>You Pay</span>
                        <span className={`text-[10px] font-bold ${tc.textMuted}`}>Bal {swapDirection === "USDCtoEURC" ? swapUsdcLabel : swapEurcLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="text" inputMode="decimal" value={swapInput} onChange={(e) => setSwapInput(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" className={`flex-1 min-w-0 bg-transparent border-none outline-none font-black text-2xl sm:text-3xl ${tc.textMain}`} />
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-sm font-black ${tc.textMain}`}>{swapDirection === "USDCtoEURC" ? "USDC" : "EURC"}</span>
                          <button onClick={fillSwapMax} className="px-2.5 py-1 text-[10px] font-black uppercase rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30">Max</button>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-center -my-1 relative z-10">
                      <div className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm ${theme === 'dark' ? 'bg-[#0A1A3F] border-white/10' : 'bg-white border-slate-200'}`}>↓</div>
                    </div>

                    <div className={`rounded-2xl border p-4 ${theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${tc.textMuted}`}>You Receive</div>
                      <div className="flex items-end justify-between gap-2">
                        <div className={`font-black text-2xl sm:text-3xl break-all ${tc.textMain}`}>
                          {swapQuote || "0.00"}
                        </div>
                        <span className="text-sm font-black text-gray-500 shrink-0">{swapDirection === "USDCtoEURC" ? "EURC" : "USDC"}</span>
                      </div>
                      {swapQuoteRaw > BigInt(0) && (
                        <div className={`text-[10px] font-bold mt-2 ${tc.textMuted}`}>
                          Min received ({slippageLabel(slippageBps)}): {formatPretty(swapMinOut, swapDirection === "USDCtoEURC" ? EURC_DECIMALS : WUSDC_DECIMALS, 6)}
                        </div>
                      )}
                      {swapQuoteError && <div className="text-[10px] font-bold mt-2 text-red-400">{swapQuoteError}</div>}
                    </div>

                    <button
                      onClick={!wallet ? connectWallet : handleSwap}
                      disabled={!!wallet && (isSwapping || !swapAmountIn || !!swapQuoteError || swapInsufficient)}
                      className={`w-full py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${swapDirection === "USDCtoEURC" ? 'bg-cyan-500 hover:bg-cyan-400 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-white'}`}
                    >
                      {!wallet
                        ? "Connect Wallet"
                        : isSwapping
                          ? (swapStatus === "approving" ? "Approving EURC..." : swapStatus === "pending" ? "Pending..." : "Confirm in Wallet...")
                          : swapInsufficient
                            ? "Insufficient Balance"
                            : "Swap"}
                    </button>
                  </div>

                  <div className={`text-[10px] mt-5 text-center font-bold tracking-widest ${tc.textMuted}`}>Router {ROUTER_ADDRESS.slice(0, 6)}...{ROUTER_ADDRESS.slice(-4)}</div>
                </div>
              </div>
            )}

            {selectedTab === "lp" && (
              <div className="w-full max-w-lg mx-auto animate-in fade-in zoom-in-95 mt-2 md:mt-6">
                <div className={`p-5 sm:p-8 rounded-[1.75rem] sm:rounded-[2rem] border shadow-2xl relative overflow-hidden ${tc.solidCardBg}`}>
                  <div className="flex items-start justify-between gap-3 mb-5 relative z-10">
                    <div>
                      <h2 className={`text-2xl sm:text-3xl font-black tracking-tight ${tc.textMain}`}>Liquidity</h2>
                      <p className={`text-[10px] sm:text-xs mt-1 font-bold uppercase tracking-widest ${tc.textMuted}`}>USDC / EURC Pool</p>
                    </div>
                    <button
                      onClick={() => setShowLpSlippage((v) => !v)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border transition ${theme === 'dark' ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'}`}
                    >
                      Slip {slippageLabel(lpSlippageBps)}
                    </button>
                  </div>

                  {showLpSlippage && (
                    <div className={`mb-5 p-3 rounded-2xl border relative z-10 ${theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                      <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${tc.textMuted}`}>Max slippage</div>
                      <div className="flex flex-wrap gap-2">
                        {SLIPPAGE_PRESETS.map((bps) => (
                          <button key={bps} onClick={() => { setLpSlippageBps(bps); setLpCustomSlippage(""); }} className={`px-3 py-1.5 rounded-xl text-xs font-black ${lpSlippageBps === bps && !lpCustomSlippage ? "bg-cyan-500 text-white" : "bg-white/10 text-gray-400 hover:bg-white/20"}`}>
                            {slippageLabel(bps)}
                          </button>
                        ))}
                        <input
                          type="number"
                          inputMode="decimal"
                          value={lpCustomSlippage}
                          onChange={(e) => { setLpCustomSlippage(e.target.value); applyCustomSlippage(e.target.value, setLpSlippageBps); }}
                          placeholder="Custom %"
                          className={`w-24 rounded-xl border px-3 py-1.5 text-xs font-bold ${tc.inputBg}`}
                        />
                      </div>
                    </div>
                  )}

                  <div className={`p-4 rounded-2xl border mb-5 relative z-10 ${theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                    <div className={`text-[10px] font-black uppercase tracking-widest mb-3 ${tc.textMuted}`}>Your Position</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className={`text-[10px] font-bold uppercase ${tc.textMuted}`}>LP Tokens</div>
                        <div className={`text-base sm:text-lg font-black break-all ${tc.textMain}`}>{!balancesReady && balancesLoading ? "..." : lpBalance}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-[10px] font-bold uppercase ${tc.textMuted}`}>Pool Share</div>
                        <div className={`text-base sm:text-lg font-black ${tc.textMain}`}>{lpSharePct}%</div>
                      </div>
                      <div>
                        <div className={`text-[10px] font-bold uppercase ${tc.textMuted}`}>Pooled USDC</div>
                        <div className={`text-sm font-black break-all ${tc.textMain}`}>{lpPooledUsdc}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-[10px] font-bold uppercase ${tc.textMuted}`}>Pooled EURC</div>
                        <div className={`text-sm font-black break-all ${tc.textMain}`}>{lpPooledEurc}</div>
                      </div>
                    </div>
                    <div className={`flex justify-between mt-3 pt-3 border-t text-[10px] font-bold ${theme === 'dark' ? 'border-white/5' : 'border-slate-200'} ${tc.textMuted}`}>
                      <span>Wallet WUSDC</span>
                      <span className={tc.textMain}>{formatPretty(wusdcBalanceRaw, WUSDC_DECIMALS, 6)}</span>
                    </div>
                  </div>

                  <div className="bg-black/20 p-1 rounded-2xl flex gap-1 mb-5 border border-white/5 relative z-10">
                    <button onClick={() => setLpMode("add")} className={`flex-1 py-3 rounded-xl font-black text-sm tracking-wide transition-all ${lpMode === "add" ? "bg-cyan-500 text-white shadow-lg" : "text-gray-500 hover:bg-white/10"}`}>Add</button>
                    <button onClick={() => setLpMode("remove")} className={`flex-1 py-3 rounded-xl font-black text-sm tracking-wide transition-all ${lpMode === "remove" ? "bg-emerald-500 text-white shadow-lg" : "text-gray-500 hover:bg-white/10"}`}>Remove</button>
                  </div>

                  {lpMode === "add" ? (
                    <div className="space-y-3 relative z-10">
                      <div className={`rounded-2xl border p-4 ${theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex justify-between mb-2">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${tc.textMuted}`}>USDC</span>
                          <span className={`text-[10px] font-bold ${tc.textMuted}`}>Bal {swapUsdcLabel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="text" inputMode="decimal" value={lpUsdcInput} onChange={(e) => { setLpLastEdited("usdc"); setLpUsdcInput(e.target.value.replace(/[^\d.]/g, "")); }} placeholder="0.00" className={`flex-1 min-w-0 bg-transparent outline-none font-black text-xl sm:text-2xl ${tc.textMain}`} />
                          <button onClick={fillLpUsdcMax} className="px-2.5 py-1 text-[10px] font-black uppercase rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 shrink-0">Max</button>
                        </div>
                      </div>
                      <div className={`rounded-2xl border p-4 ${theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex justify-between mb-2">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${tc.textMuted}`}>EURC</span>
                          <span className={`text-[10px] font-bold ${tc.textMuted}`}>Bal {swapEurcLabel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="text" inputMode="decimal" value={lpEurcInput} onChange={(e) => { setLpLastEdited("eurc"); setLpEurcInput(e.target.value.replace(/[^\d.]/g, "")); }} placeholder="0.00" className={`flex-1 min-w-0 bg-transparent outline-none font-black text-xl sm:text-2xl ${tc.textMain}`} />
                          <button onClick={fillLpEurcMax} className="px-2.5 py-1 text-[10px] font-black uppercase rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 shrink-0">Max</button>
                        </div>
                      </div>
                      <div className={`text-[10px] font-bold text-center ${tc.textMuted}`}>
                        Pool {poolReserveUsdc} USDC / {poolReserveEurc} EURC · Min {slippageLabel(lpSlippageBps)}
                      </div>
                      <button
                        onClick={!wallet ? connectWallet : handleAddLiquidity}
                        disabled={!!wallet && (isLpLoading || !parseAmount(lpUsdcInput, WUSDC_DECIMALS) || !parseAmount(lpEurcInput, EURC_DECIMALS))}
                        className="w-full py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:active:scale-100 bg-cyan-500 hover:bg-cyan-400 text-white"
                      >
                        {!wallet
                          ? "Connect Wallet"
                          : isLpLoading
                            ? (lpAction === "approve" ? "Approving EURC..." : "Adding Liquidity...")
                            : ((parseAmount(lpUsdcInput, WUSDC_DECIMALS) ?? BigInt(0)) > usdcBalanceRaw || (parseAmount(lpEurcInput, EURC_DECIMALS) ?? BigInt(0)) > eurcBalanceRaw
                              ? "Insufficient Balance"
                              : "Add Liquidity")}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 relative z-10">
                      <div className={`rounded-2xl border p-4 ${theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex justify-between mb-2">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${tc.textMuted}`}>LP to remove</span>
                          <span className={`text-[10px] font-bold ${tc.textMuted}`}>Bal {lpBalance}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="text" inputMode="decimal" value={lpRemoveInput} onChange={(e) => { setLpRemoveIsMax(false); setLpRemoveInput(e.target.value.replace(/[^\d.]/g, "")); }} placeholder="0.00" className={`flex-1 min-w-0 bg-transparent outline-none font-black text-xl sm:text-2xl ${tc.textMain}`} />
                          <button onClick={fillLpRemoveMax} className="px-2.5 py-1 text-[10px] font-black uppercase rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 shrink-0">Max</button>
                        </div>
                      </div>
                      <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                        <div className={`text-[10px] font-bold uppercase mb-2 tracking-widest ${tc.textMuted}`}>You receive (est.)</div>
                        <div className={`text-base font-black ${tc.textMain}`}>{lpRemovePreviewUsdc || "0.00"} <span className="text-sm text-gray-500">USDC</span></div>
                        <div className={`text-base font-black mt-1 ${tc.textMain}`}>{lpRemovePreviewEurc || "0.00"} <span className="text-sm text-gray-500">EURC</span></div>
                        {lpRemovePreviewUsdc && (
                          <div className={`text-[10px] font-bold mt-2 ${tc.textMuted}`}>Mins use {slippageLabel(lpSlippageBps)} slippage</div>
                        )}
                      </div>
                      <button
                        onClick={!wallet ? connectWallet : handleRemoveLiquidity}
                        disabled={!!wallet && (isLpLoading || (!lpRemoveIsMax && !parseAmount(lpRemoveInput, LP_DECIMALS)))}
                        className="w-full py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:active:scale-100 bg-emerald-500 hover:bg-emerald-400 text-white"
                      >
                        {!wallet
                          ? "Connect Wallet"
                          : isLpLoading
                            ? (lpAction === "approve" ? "Approving LP..." : "Removing Liquidity...")
                            : ((!lpRemoveIsMax && (parseAmount(lpRemoveInput, LP_DECIMALS) ?? BigInt(0)) > lpBalanceRaw)
                              ? "Insufficient LP Balance"
                              : "Remove Liquidity")}
                      </button>
                    </div>
                  )}

                  <div className={`text-[10px] mt-5 text-center font-bold tracking-widest space-y-1 ${tc.textMuted}`}>
                    <div>Router {ROUTER_ADDRESS.slice(0, 6)}...{ROUTER_ADDRESS.slice(-4)}</div>
                    <div>Factory {FACTORY_ADDRESS.slice(0, 6)}...{FACTORY_ADDRESS.slice(-4)}</div>
                  </div>
                </div>
              </div>
            )}

            {selectedTab === "dailygm" && (
              <div className="w-full flex items-center justify-center animate-in fade-in zoom-in-95 duration-500 mt-4 md:mt-10">
                <div className={`w-full max-w-2xl rounded-3xl md:rounded-[3rem] border p-8 md:p-14 shadow-2xl flex flex-col items-center text-center relative overflow-hidden group gap-6 md:gap-8 ${theme === 'dark' ? 'border-orange-500/20 bg-gradient-to-br from-orange-500/10 to-black backdrop-blur-2xl text-white' : 'border-orange-200 bg-gradient-to-br from-orange-50 to-white text-slate-900'}`}>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 opacity-5 text-[15rem] md:text-[20rem] group-hover:rotate-12 transition-transform duration-1000 pointer-events-none">☀️</div>

                  <div className="flex flex-col items-center z-10">
                    <div className="text-6xl md:text-7xl mb-4 animate-bounce pointer-events-none">{hasCheckedInToday ? "🔥" : "⏳"}</div>
                    <h3 className="text-3xl md:text-4xl font-black mb-3 tracking-tight">Daily GM Protocol</h3>
                    <p className={`text-sm md:text-base font-medium max-w-md ${theme === 'dark' ? 'text-gray-400' : 'text-slate-500'}`}>Establish your presence on the Arc L1 Network. Execute a zero-value smart contract transaction to build your immutable on-chain streak!</p>
                  </div>

                  <div className="flex flex-col w-full items-center gap-4 z-10 mt-4">
                    <div className={`text-xl md:text-2xl font-black uppercase tracking-widest px-8 py-3 rounded-full border shadow-inner ${theme === 'dark' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-orange-100 text-orange-600 border-orange-300'}`}>
                      {streak > 0 ? `Current Streak: ${streak} Days` : "No Streak Yet"}
                    </div>
                    <button
                      onClick={executeDailyGM}
                      disabled={isCheckingIn || hasCheckedInToday || !wallet}
                      className={`w-full max-w-sm rounded-2xl py-4 md:py-5 font-black text-lg md:text-xl transition-all duration-300 shadow-2xl mt-4 ${hasCheckedInToday
                        ? (theme === 'dark' ? "bg-white/5 text-gray-500 border border-white/10 cursor-not-allowed" : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed")
                        : (theme === 'dark' ? "bg-white text-black hover:bg-gray-200 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)] animate-pulse hover:animate-none" : "bg-slate-900 text-white hover:bg-slate-800 active:scale-95 shadow-md animate-pulse hover:animate-none")
                        }`}
                    >
                      {isCheckingIn ? "Signing Transaction..." : hasCheckedInToday ? `Next GM in: ${timeLeft}` : "Say GM (Check-in)"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {selectedTab === "domains" && (
              <div className={`rounded-3xl md:rounded-[2.5rem] p-6 md:p-10 relative overflow-hidden animate-in fade-in zoom-in-95 duration-500 ${theme === 'dark' ? 'border border-cyan-500/20 bg-gradient-to-br from-[#0A1A3F]/60 to-black backdrop-blur-3xl shadow-2xl' : 'border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white shadow-xl'}`}>
                <div className={`absolute top-0 right-0 p-6 md:p-10 text-7xl md:text-9xl pointer-events-none ${theme === 'dark' ? 'opacity-5' : 'opacity-[0.03]'}`}>🌐</div>

                <div className="relative z-10">
                  {/* Tab Header & Switcher */}
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`text-[10px] md:text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full border ${theme === 'dark' ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' : 'border-cyan-200 bg-cyan-100 text-cyan-700'}`}>
                          Arc Name Service (ANS)
                        </span>
                        <a
                          href={`${ARC_EXPLORER}/address/${ANS_CONTRACT_ADDRESS}`}
                          target="_blank"
                          rel="noreferrer"
                          className={`text-[10px] font-mono hover:underline flex items-center gap-1 ${tc.textMuted}`}
                        >
                          <span>{ANS_CONTRACT_ADDRESS.slice(0, 6)}...{ANS_CONTRACT_ADDRESS.slice(-4)}</span>
                          <span>↗</span>
                        </a>
                      </div>
                      <h2 className={`text-2xl md:text-4xl font-black tracking-tight mb-2 ${tc.textMain}`}>Nexio Web3 Identity</h2>
                      <p className={`text-xs md:text-base font-medium max-w-xl ${tc.textMuted}`}>
                        On-chain domain registry and reverse resolution engine built on Arc L1 Network.
                      </p>
                    </div>

                    {/* Sub-tab Switcher */}
                    <div className={`flex items-center p-1.5 rounded-2xl border self-start md:self-center shrink-0 ${theme === 'dark' ? 'bg-black/60 border-cyan-500/20 shadow-inner' : 'bg-slate-100 border-slate-200 shadow-inner'}`}>
                      <button
                        type="button"
                        onClick={() => setDomainSubTab("register")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs md:text-sm font-black transition-all ${domainSubTab === "register"
                          ? (theme === 'dark' ? 'bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'bg-cyan-500 text-white shadow-md')
                          : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                          }`}
                      >
                        <span>🔍 Register / Search</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDomainSubTab("reverse")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs md:text-sm font-black transition-all ${domainSubTab === "reverse"
                          ? (theme === 'dark' ? 'bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'bg-cyan-500 text-white shadow-md')
                          : (theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                          }`}
                      >
                        <span>🔄 Resolve by Address</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${domainSubTab === "reverse" ? 'bg-white/20 text-white' : (theme === 'dark' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-cyan-200 text-cyan-800')}`}>NEW</span>
                      </button>
                    </div>
                  </div>

                  {/* Connected Domain Banner if present */}
                  {wallet && registeredDomain && passVerified && (
                    <div className={`mb-6 p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${theme === 'dark' ? 'bg-cyan-950/20 border-cyan-500/30' : 'bg-cyan-50/80 border-cyan-200'}`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xl">🛡️</span>
                        <div>
                          <div className={`text-[10px] font-black uppercase tracking-widest ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-700'}`}>Connected Wallet Identity</div>
                          <div className={`text-base md:text-lg font-black ${tc.textMain}`}>{registeredDomain}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTabSwitch("trustpass")}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${theme === 'dark' ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20' : 'border-cyan-300 bg-white text-cyan-700 hover:bg-cyan-50'}`}
                        >
                          View Nexio Pass 🪪
                        </button>
                      </div>
                    </div>
                  )}

                  {/* SUB-TAB 1: REGISTER & SEARCH */}
                  {domainSubTab === "register" && (
                    <div className="space-y-6">
                      <div className={`flex flex-col sm:flex-row items-center gap-3 md:gap-4 w-full bg-black border rounded-3xl sm:rounded-full p-2 pl-4 md:pl-6 transition-shadow relative z-10 ${theme === 'dark' ? 'border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.1)] hover:shadow-[0_0_40px_rgba(6,182,212,0.2)]' : 'border-cyan-300 shadow-md hover:shadow-lg'}`}>
                        <span className={`hidden sm:inline-block text-xl font-bold ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>∞</span>
                        <input
                          type="text"
                          value={domainSearch}
                          onChange={(e) => {
                            setDomainSearch(sanitizeDomainName(e.target.value));
                            setDomainAvailable(false);
                          }}
                          placeholder="Search a name (e.g. jubayir69)"
                          className={`flex-1 w-full bg-transparent border-none text-lg md:text-xl font-bold focus:outline-none text-center sm:text-left py-2 sm:py-0 ${theme === 'dark' ? 'text-white placeholder-zinc-700' : 'text-slate-900 placeholder-slate-400'}`}
                        />
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                          <div className={`font-black px-3 py-1.5 md:px-4 md:py-2 rounded-full border tracking-widest text-sm md:text-base ${theme === 'dark' ? 'bg-white/10 text-cyan-400 border-cyan-500/20' : 'bg-cyan-100 text-cyan-700 border-cyan-200'}`}>.nex</div>
                          <button onClick={handleSearchDomain} disabled={isCheckingDomain} className="bg-cyan-500 hover:bg-cyan-400 text-white font-black px-6 py-2 md:px-8 md:py-4 rounded-full transition-all active:scale-95 text-sm md:text-lg w-full sm:w-auto shadow-md disabled:opacity-50">
                            {isCheckingDomain ? "Checking..." : "Search →"}
                          </button>
                        </div>
                      </div>

                      {domainAvailable && (
                        <div className={`mt-6 md:mt-8 flex flex-col sm:flex-row items-center justify-between p-5 md:p-6 rounded-3xl animate-in fade-in slide-in-from-bottom-4 duration-500 relative z-10 ${theme === 'dark' ? 'bg-cyan-950/30 border border-cyan-500/30' : 'bg-cyan-50 border border-cyan-200'}`}>
                          <div className="flex items-center gap-4 md:gap-5">
                            <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center p-1.5 ${theme === 'dark' ? 'bg-[#050B14] border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.3)]' : 'bg-white border border-cyan-200 shadow-sm'}`}>
                              <img src="/nexio-logo.png" alt="Logo" crossOrigin="anonymous" className="w-full h-full object-contain rounded-lg md:rounded-xl" />
                            </div>
                            <div className={`text-xl md:text-2xl font-black ${tc.textMain}`}>{domainSearch}.nex</div>
                          </div>
                          <div className="flex items-center gap-4 md:gap-6 mt-4 sm:mt-0 w-full sm:w-auto justify-between sm:justify-end">
                            <div className={`text-sm md:text-base font-bold ${theme === 'dark' ? 'text-gray-300' : 'text-slate-600'}`}>Free (Gas Only)</div>
                            <button
                              onClick={executeRegisterDomain}
                              disabled={isRegistering}
                              className={`font-black px-6 py-2.5 md:px-8 md:py-3.5 rounded-full transition-all active:scale-95 text-sm md:text-lg w-full sm:w-auto ${theme === 'dark' ? 'bg-cyan-400 hover:bg-cyan-300 disabled:bg-zinc-800 disabled:text-zinc-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.3)]' : 'bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-300 disabled:text-slate-500 text-white shadow-md'}`}
                            >
                              {isRegistering ? "Registering..." : "Register Now"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SUB-TAB 2: RESOLVE BY ADDRESS (REVERSE RESOLUTION) */}
                  {domainSubTab === "reverse" && (
                    <div className="space-y-6">
                      <div className={`p-6 rounded-3xl border ${theme === 'dark' ? 'bg-black/40 border-cyan-500/20' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                          <div>
                            <h3 className={`text-lg font-black ${tc.textMain}`}>Query Address → .nex Domain</h3>
                            <p className={`text-xs ${tc.textMuted}`}>Enter any EVM address on Arc Testnet to reverse-resolve its on-chain domain.</p>
                          </div>

                          {/* Quick fill buttons */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {wallet && (
                              <button
                                type="button"
                                onClick={() => {
                                  setResolveAddressInput(wallet);
                                  void handleResolveAddress(wallet);
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${theme === 'dark'
                                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20'
                                  : 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'
                                  }`}
                              >
                                👤 My Address ({wallet.slice(0, 6)}...{wallet.slice(-4)})
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handlePasteResolveAddress}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${theme === 'dark'
                                ? 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                                : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                            >
                              📋 Paste
                            </button>
                          </div>
                        </div>

                        {/* Address Input Bar */}
                        <div className={`flex flex-col sm:flex-row items-center gap-2 p-2 rounded-2xl border ${theme === 'dark' ? 'bg-black border-cyan-500/30' : 'bg-slate-50 border-slate-300'}`}>
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
                            placeholder="e.g. 0x19c27c2a8729e8A326dF24EF740832b09A607fD0"
                            className={`flex-1 w-full bg-transparent border-none text-sm md:text-base font-mono font-bold focus:outline-none px-3 py-2 ${theme === 'dark' ? 'text-white placeholder-zinc-700' : 'text-slate-900 placeholder-slate-400'}`}
                          />
                          {resolveAddressInput && (
                            <button
                              type="button"
                              onClick={() => {
                                resolveAddressGenRef.current += 1;
                                setResolveAddressInput("");
                                setResolvedDomainResult(null);
                                setResolvedAddressError(null);
                                setHasSearchedAddress(false);
                              }}
                              className="px-2 text-xs font-bold text-gray-500 hover:text-white"
                            >
                              ✕
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleResolveAddress()}
                            disabled={isResolvingAddress || !resolveAddressInput}
                            className="bg-cyan-500 hover:bg-cyan-400 text-white font-black px-6 py-2.5 rounded-xl transition-all active:scale-95 text-sm md:text-base w-full sm:w-auto shadow-md disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
                          >
                            {isResolvingAddress ? (
                              <>
                                <span className="animate-spin text-sm">⏳</span>
                                <span>Resolving...</span>
                              </>
                            ) : (
                              <span>Resolve Address →</span>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* RESOLUTION RESULTS */}
                      {resolvedDomainResult && resolvedOwnerAddress && (
                        <div className={`p-6 md:p-8 rounded-3xl border animate-in fade-in slide-in-from-bottom-4 duration-500 relative overflow-hidden ${theme === 'dark'
                          ? 'border-cyan-500/40 bg-gradient-to-br from-cyan-950/40 via-black to-blue-950/20 shadow-[0_0_50px_rgba(6,182,212,0.15)]'
                          : 'border-cyan-300 bg-gradient-to-br from-cyan-50 to-white shadow-xl'
                          }`}>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-cyan-500/20">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse"></span>
                              <span className={`text-xs font-black uppercase tracking-widest ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-700'}`}>
                                Verified On-Chain Domain
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                              Arc Name Service (ANS)
                            </span>
                          </div>

                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                            <div className="flex items-center gap-4 md:gap-5">
                              <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center p-2 shrink-0 ${theme === 'dark' ? 'bg-[#050B14] border border-cyan-500/30 shadow-[0_0_25px_rgba(6,182,212,0.3)]' : 'bg-white border border-cyan-200 shadow-md'}`}>
                                <img src="/nexio-logo.png" alt="Nexio Logo" crossOrigin="anonymous" className="w-full h-full object-contain rounded-xl" />
                              </div>
                              <div>
                                <div className={`text-2xl sm:text-4xl md:text-5xl font-black tracking-tight ${theme === 'dark' ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400 drop-shadow-sm' : 'text-cyan-600'}`}>
                                  {resolvedDomainResult}.nex
                                </div>
                                <div className={`text-xs font-bold mt-1 ${tc.textMuted}`}>
                                  Registered on Arc L1 Network
                                </div>
                              </div>
                            </div>

                            {/* Quick send & copy actions */}
                            <div className="flex flex-wrap items-center gap-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSendAddress(resolvedOwnerAddress);
                                  setShowSendModal(true);
                                }}
                                className="px-5 py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-white font-black text-xs sm:text-sm transition-all active:scale-95 shadow-lg flex items-center gap-1.5"
                              >
                                <span>💸</span>
                                <span>Send Crypto</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => copyResolvedText(`${resolvedDomainResult}.nex`, "Domain")}
                                className={`px-4 py-3 rounded-2xl font-bold text-xs sm:text-sm border transition-all active:scale-95 ${theme === 'dark' ? 'border-white/10 bg-white/5 hover:bg-white/10 text-white' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                                  }`}
                              >
                                📋 Copy Name
                              </button>
                            </div>
                          </div>

                          {/* Address Details Bar */}
                          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${theme === 'dark' ? 'bg-black/50 border-white/10' : 'bg-white/80 border-slate-200'}`}>
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Associated Wallet Address</div>
                              <div className="font-mono text-xs sm:text-sm font-bold break-all text-cyan-400">
                                {resolvedOwnerAddress}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => copyResolvedText(resolvedOwnerAddress, "Address")}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${theme === 'dark' ? 'border-white/10 bg-white/5 hover:bg-white/10 text-gray-200' : 'border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-800'
                                  }`}
                              >
                                Copy
                              </button>
                              <a
                                href={`${ARC_EXPLORER}/address/${resolvedOwnerAddress}`}
                                target="_blank"
                                rel="noreferrer"
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1 ${theme === 'dark' ? 'border-white/10 bg-white/5 hover:bg-white/10 text-gray-200' : 'border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-800'
                                  }`}
                              >
                                <span>Explorer</span>
                                <span>↗</span>
                              </a>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Not Registered Notice */}
                      {resolvedAddressError && (
                        <div className={`p-6 rounded-3xl border animate-in fade-in slide-in-from-bottom-2 ${theme === 'dark' ? 'bg-yellow-500/5 border-yellow-500/30 text-yellow-200' : 'bg-yellow-50 border-yellow-200 text-yellow-900'
                          }`}>
                          <div className="flex items-start gap-3">
                            <span className="text-2xl shrink-0">🔍</span>
                            <div className="flex-1">
                              <h4 className="font-black text-sm md:text-base mb-1">No .nex Domain Found</h4>
                              <p className="text-xs md:text-sm opacity-90 mb-3">{resolvedAddressError}</p>
                              {resolvedOwnerAddress && wallet && resolvedOwnerAddress.toLowerCase() === wallet.toLowerCase() && (
                                <button
                                  type="button"
                                  onClick={() => setDomainSubTab("register")}
                                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-black text-xs transition-all active:scale-95 shadow-md"
                                >
                                  Register a Domain for this Wallet →
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Informational Feature Cards */}
                      {!hasSearchedAddress && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                          <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-black/30 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="text-xl mb-2">⚡</div>
                            <div className={`text-xs font-black mb-1 ${tc.textMain}`}>On-Chain Query</div>
                            <div className={`text-[11px] font-medium leading-relaxed ${tc.textMuted}`}>
                              Calls the smart contract function <code className="text-[10px] text-cyan-400">resolveByAddress</code> directly on Arc L1.
                            </div>
                          </div>
                          <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-black/30 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="text-xl mb-2">🛡️</div>
                            <div className={`text-xs font-black mb-1 ${tc.textMain}`}>Verify Identity</div>
                            <div className={`text-[11px] font-medium leading-relaxed ${tc.textMuted}`}>
                              Verify domain ownership and human-readable tags before executing stablecoin payments.
                            </div>
                          </div>
                          <div className={`p-4 rounded-2xl border ${theme === 'dark' ? 'bg-black/30 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="text-xl mb-2">💸</div>
                            <div className={`text-xs font-black mb-1 ${tc.textMain}`}>Instant Payments</div>
                            <div className={`text-[11px] font-medium leading-relaxed ${tc.textMuted}`}>
                              Click Send to immediately initiate USDC or EURC transfers to the resolved recipient.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {selectedTab === "trustpass" && (
              <div className={`rounded-3xl md:rounded-[2.5rem] p-6 md:p-10 flex flex-col items-center justify-center min-h-[50vh] md:min-h-[60vh] relative overflow-hidden animate-in fade-in zoom-in-95 duration-500 ${theme === 'dark' ? 'border border-white/10 bg-white/[0.02] backdrop-blur-3xl shadow-2xl' : 'border border-slate-200 bg-white shadow-xl'}`}>
                {theme === 'dark' && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 md:w-96 md:h-96 bg-cyan-500/20 rounded-full blur-[80px] md:blur-[100px] pointer-events-none"></div>}

                {isVerifyingPass ? (
                  <div className="text-center z-10 max-w-lg px-4 flex flex-col items-center animate-in fade-in duration-300">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-3xl border border-cyan-500/40 bg-cyan-500/10 flex items-center justify-center text-3xl md:text-4xl mb-6 shadow-[0_0_40px_rgba(6,182,212,0.25)] animate-pulse">
                      🔄
                    </div>
                    <h2 className={`text-2xl md:text-3xl font-black mb-3 ${tc.textMain}`}>Querying Nexio Pass</h2>
                    <p className={`text-xs md:text-sm font-medium mb-4 ${tc.textMuted}`}>
                      Querying on-chain identity with <code className="text-cyan-400 font-mono">resolveByAddress</code> on Arc Name Service CA:
                    </p>
                    <div className={`text-[11px] md:text-xs font-mono font-bold px-3 py-1.5 rounded-xl border mb-6 ${theme === 'dark' ? 'bg-black/50 border-cyan-500/30 text-cyan-300' : 'bg-slate-100 border-slate-300 text-cyan-800'}`}>
                      {ANS_CONTRACT_ADDRESS}
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                      <span>Fetching reverse resolution...</span>
                    </div>
                  </div>
                ) : !registeredDomain || !passVerified ? (
                  <div className="text-center z-10 max-w-lg px-4 flex flex-col items-center animate-in fade-in duration-300">
                    <div className="text-5xl md:text-7xl mb-4 md:mb-6 animate-pulse pointer-events-none">🪪</div>
                    <h2 className={`text-2xl md:text-3xl font-black mb-3 md:mb-4 ${tc.textMain}`}>Unlock Your Nexio Pass</h2>
                    <p className={`text-sm md:text-base mb-6 md:mb-8 ${tc.textMuted}`}>
                      {registeredDomain && !passVerified
                        ? "This domain is not verified on-chain for the connected wallet. Register or use a .nex name that resolves to your address."
                        : "You need a registered .nex domain on Arc Name Service to generate your exclusive Web3 Holographic Identity Card."}
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto">
                      {wallet && (
                        <button
                          type="button"
                          onClick={() => void fetchAndVerifyPass(wallet)}
                          disabled={isVerifyingPass}
                          className={`w-full sm:w-auto px-6 py-3.5 md:px-7 md:py-4 rounded-full font-black text-xs md:text-sm border transition-all active:scale-95 shadow-md flex items-center justify-center gap-2 ${
                            theme === 'dark'
                              ? 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                              : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-200'
                          }`}
                        >
                          <span>🔄</span>
                          <span>Fetch from Smart Contract</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleTabSwitch("domains")}
                        className="w-full sm:w-auto bg-cyan-500 hover:bg-cyan-600 text-white font-black px-6 py-3.5 md:px-8 md:py-4 rounded-full transition-all active:scale-95 shadow-lg text-xs md:text-sm"
                      >
                        Register Domain Now →
                      </button>
                    </div>

                    <div className={`mt-8 text-[11px] font-mono font-semibold ${tc.textMuted}`}>
                      ANS CA: {ANS_CONTRACT_ADDRESS.slice(0, 6)}...{ANS_CONTRACT_ADDRESS.slice(-4)}
                    </div>
                  </div>
                ) : (
                  <div className="z-10 w-full flex flex-col items-center animate-in fade-in duration-300">
                    <div className="text-center mb-8 md:mb-10">
                      <h2 className={`text-2xl md:text-3xl font-black tracking-tight ${tc.textMain}`}>Your Digital Identity</h2>
                      <p className={`text-xs md:text-sm font-bold mt-1 md:mt-2 ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>
                        Verified on Arc Blockchain (ANS CA: {ANS_CONTRACT_ADDRESS.slice(0, 6)}...{ANS_CONTRACT_ADDRESS.slice(-4)})
                      </p>
                    </div>

                    <div id="nexio-pass-card" className="w-[90%] sm:w-full max-w-[450px] aspect-[1.58/1] rounded-2xl md:rounded-[2rem] border border-white/20 bg-gradient-to-br from-[#0A1A3F] to-cyan-900/40 backdrop-blur-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.1)] md:shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.1)] relative overflow-hidden flex flex-col justify-between p-5 md:p-8 transform transition-transform md:hover:scale-105 md:hover:rotate-1 duration-500 group">

                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out"></div>

                      <div className="flex justify-between items-start w-full relative z-10">
                        <div className="flex items-center gap-2 md:gap-3">
                          <div className="w-8 h-8 md:w-10 md:h-10 bg-[#050B14] rounded-lg md:rounded-xl overflow-hidden border border-cyan-500/30 flex items-center justify-center p-1 md:p-1.5 shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                            <img src="/nexio-logo.png" alt="Logo" crossOrigin="anonymous" className="w-full h-full object-contain rounded-md" />
                          </div>
                          <div className="font-black text-base md:text-xl text-white tracking-widest uppercase">NEXIO PASS</div>
                        </div>
                        <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[8px] md:text-[10px] font-black tracking-widest uppercase flex items-center gap-1 md:gap-1.5">
                          <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                          Verified
                        </div>
                      </div>

                      <div className="relative z-10 mt-4 md:mt-6">
                        <div className="text-[8px] md:text-[10px] text-cyan-200/70 font-black uppercase tracking-[0.2em] mb-1">Web3 Identity</div>
                        <div className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight drop-shadow-md truncate">{registeredDomain}</div>
                        <div className="text-xs md:text-sm font-mono text-gray-400 mt-1 md:mt-2 bg-black/30 inline-block px-2 py-0.5 md:px-3 md:py-1 rounded-md md:rounded-lg border border-white/5">
                          {wallet.slice(0, 6)}...{wallet.slice(-4)}
                        </div>
                      </div>

                      <div className="flex justify-between items-end w-full relative z-10 mt-2 md:mt-0">
                        <div className="flex gap-4 md:gap-6">
                          <div>
                            <div className="text-[8px] md:text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5 md:mb-1">Network</div>
                            <div className="font-black text-xs md:text-sm text-cyan-400">ARC TESTNET</div>
                          </div>
                          <div>
                            <div className="text-[8px] md:text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5 md:mb-1">GM Streak</div>
                            <div className="font-black text-xs md:text-sm text-orange-400 flex items-center gap-1">
                              {streak} DAYS 🔥
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 md:mt-10 flex flex-wrap justify-center gap-3 md:gap-4">
                      {wallet && (
                        <button
                          type="button"
                          onClick={() => void fetchAndVerifyPass(wallet)}
                          disabled={isVerifyingPass}
                          className={`flex items-center gap-2 px-5 py-2.5 md:px-6 md:py-3 rounded-full transition-all font-bold text-xs md:text-sm border active:scale-95 shadow-md ${
                            theme === 'dark' ? 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border-cyan-500/30' : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-200'
                          }`}
                        >
                          <span>🔄</span>
                          <span>Re-sync Pass</span>
                        </button>
                      )}

                      <button onClick={downloadTrustPass} className={`flex items-center gap-2 px-5 py-2.5 md:px-6 md:py-3 rounded-full transition-all font-bold text-xs md:text-sm border active:scale-95 shadow-md ${theme === 'dark' ? 'bg-white/10 hover:bg-white/20 text-white border-white/10' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'}`}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2-2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Save Image
                      </button>

                      <button onClick={shareOnX} className={`flex items-center gap-2 px-5 py-2.5 md:px-6 md:py-3 rounded-full transition-all font-bold text-xs md:text-sm border active:scale-95 shadow-md ${theme === 'dark' ? 'bg-black hover:bg-zinc-900 text-white border-zinc-800' : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-800'}`}>
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 md:w-4 md:h-4"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 24.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.337H5.051z" /></svg>
                        Share on X
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedTab === "history" && (
              <div className={`rounded-3xl md:rounded-[2.5rem] p-6 md:p-10 animate-in fade-in duration-500 ${tc.solidCardBg}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 md:gap-6 mb-6 md:mb-10">
                  <div>
                    <h2 className={`text-2xl md:text-3xl font-black tracking-tight ${tc.textMain}`}>Transaction History</h2>
                    <p className={`text-xs md:text-sm font-semibold mt-1 md:mt-2 ${tc.textMuted}`}>Real verifiable blockchain events</p>
                  </div>
                  <button onClick={openExplorer} className={`rounded-full border px-6 py-2.5 md:px-8 md:py-3 text-xs md:text-sm font-black tracking-wide transition-all active:scale-95 w-full sm:w-auto shadow-sm ${theme === 'dark' ? 'bg-white/5 border-white/10 hover:bg-white hover:text-black text-white' : 'bg-slate-100 border-slate-200 hover:bg-slate-900 hover:text-white text-slate-800'}`}>
                    Arc Explorer ↗
                  </button>
                </div>

                <div className="space-y-3 md:space-y-4">
                  {txHistory.length === 0 ? (
                    <div className="text-center py-10 md:py-20">
                      <div className="text-5xl md:text-6xl mb-3 md:mb-4 opacity-50 pointer-events-none">📭</div>
                      <div className={`font-bold text-base md:text-lg ${tc.textMuted}`}>No blockchain activity found.</div>
                    </div>
                  ) : (
                    txHistory.map((item) => (
                      <div key={item.id} className={`rounded-xl md:rounded-2xl border p-4 md:p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4 md:gap-6 transition-all ${tc.historyCard}`}>
                        <div className="flex items-center gap-4 md:gap-6">
                          <div className={`p-3 md:p-4 rounded-full border ${item.status === "Completed" ? (theme === 'dark' ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-green-100 text-green-600 border-green-200") : item.status === "Failed" ? (theme === 'dark' ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-100 text-red-600 border-red-200") : (theme === 'dark' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-100 text-amber-600 border-amber-200")}`}>
                            {item.status === "Completed" ? "✓" : item.status === "Failed" ? "✕" : "⏳"}
                          </div>
                          <div>
                            <div className={`font-black text-lg md:text-xl tracking-tight leading-tight ${tc.textMain}`}>{item.label}</div>
                            {item.txHash ? (
                              <a href={`${ARC_EXPLORER}/tx/${item.txHash}`} target="_blank" rel="noopener noreferrer" className={`mt-1 md:mt-1.5 text-xs md:text-sm font-bold underline underline-offset-4 flex items-center gap-1 md:gap-1.5 transition-colors ${theme === 'dark' ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-500'}`}>
                                <span className="truncate max-w-[150px] sm:max-w-none">{item.meta}</span> <span className="text-[10px] md:text-xs flex-shrink-0">↗</span>
                              </a>
                            ) : (
                              <div className={`mt-1 md:mt-1.5 text-xs md:text-sm font-bold ${tc.textMuted}`}>{item.meta}</div>
                            )}
                          </div>
                        </div>

                        <div className="sm:text-right pl-14 md:pl-20 sm:pl-0 flex flex-col items-start sm:items-end">
                          {item.amount && (
                            <div className={`font-black text-xl md:text-2xl tracking-tighter ${item.amount.startsWith("+") ? (theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600') : item.amount.startsWith("-") ? tc.textMain : tc.textMuted}`}>
                              {item.amount}
                            </div>
                          )}
                          <div className={`mt-1.5 md:mt-2 inline-block px-2.5 py-1 md:px-3 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest ${item.status === "Completed" ? (theme === 'dark' ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-100 text-emerald-600") : item.status === "Failed" ? (theme === 'dark' ? "bg-red-500/10 text-red-400" : "bg-red-100 text-red-600") : (theme === 'dark' ? "bg-amber-500/10 text-amber-400" : "bg-amber-100 text-amber-600")}`}>
                            {item.status}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {selectedTab === "learn" && (
              <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500">
                <div className={`rounded-3xl md:rounded-[2.5rem] border p-6 md:p-12 shadow-2xl relative overflow-hidden mb-6 md:mb-8 ${theme === 'dark' ? 'border-cyan-500/20 bg-gradient-to-br from-[#0A1A3F]/80 to-black backdrop-blur-3xl' : 'border-cyan-200 bg-gradient-to-br from-cyan-50 to-white'}`}>
                  <div className={`absolute top-0 right-0 p-6 md:p-10 text-7xl md:text-9xl pointer-events-none ${theme === 'dark' ? 'opacity-10' : 'opacity-[0.03]'}`}>🏦</div>
                  <h2 className={`text-3xl md:text-5xl font-black mb-4 md:mb-6 tracking-tighter drop-shadow-sm ${tc.textMain}`}>What is Nexio?</h2>
                  <p className={`text-sm md:text-xl font-medium leading-relaxed max-w-3xl mb-6 md:mb-10 ${tc.textDesc}`}>
                    Nexio is an advanced Web3 Stablecoin Management and Identity Protocol built on the Arc Network. We make blockchain payments as simple as traditional banking by replacing complex addresses with human-readable <strong>.nex</strong> domains and offering enterprise-grade batch payment tools.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 mt-8">
                    <div className={`p-5 md:p-6 rounded-2xl border ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="text-2xl mb-2 pointer-events-none">🌐</div>
                      <h4 className={`text-lg font-black mb-2 ${tc.textMain}`}>Nexio Name Service</h4>
                      <p className={`text-xs md:text-sm ${tc.textMuted}`}>Register a permanent .nex domain to replace your long 0x wallet address.</p>
                    </div>
                    <div className={`p-5 md:p-6 rounded-2xl border ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="text-2xl mb-2 pointer-events-none">💸</div>
                      <h4 className={`text-lg font-black mb-2 ${tc.textMain}`}>Batch Transfers</h4>
                      <p className={`text-xs md:text-sm ${tc.textMuted}`}>Send USDC or EURC to multiple domains simultaneously with our domain-resolved engine.</p>
                    </div>
                    <div className={`p-5 md:p-6 rounded-2xl border ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="text-2xl mb-2 pointer-events-none">🔗</div>
                      <h4 className={`text-lg font-black mb-2 ${tc.textMain}`}>Automated Invoicing</h4>
                      <p className={`text-xs md:text-sm ${tc.textMuted}`}>Generate shareable payment links that auto-fill the exact recipient, asset, and amount.</p>
                    </div>
                    <div className={`p-5 md:p-6 rounded-2xl border ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="text-2xl mb-2 pointer-events-none">🪪</div>
                      <h4 className={`text-lg font-black mb-2 ${tc.textMain}`}>Nexio Pass & Daily GM</h4>
                      <p className={`text-xs md:text-sm ${tc.textMuted}`}>Build an on-chain streak and unlock your verifiable, holographic Web3 Identity Card.</p>
                    </div>
                    <div className={`p-5 md:p-6 rounded-2xl border ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="text-2xl mb-2 pointer-events-none">🔄</div>
                      <h4 className={`text-lg font-black mb-2 ${tc.textMain}`}>Nexio Swap</h4>
                      <p className={`text-xs md:text-sm ${tc.textMuted}`}>Exchange USDC and EURC seamlessly with real on-chain AMM routing and live market rates.</p>
                    </div>
                    <div className={`p-5 md:p-6 rounded-2xl border ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="text-2xl mb-2 pointer-events-none">💧</div>
                      <h4 className={`text-lg font-black mb-2 ${tc.textMain}`}>Liquidity Pools</h4>
                      <p className={`text-xs md:text-sm ${tc.textMuted}`}>Provide liquidity to the USDC/EURC pool, earn protocol fees, and manage your LP tokens.</p>
                    </div>
                    <div className={`p-5 md:p-6 rounded-2xl border ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="text-2xl mb-2 pointer-events-none">🌱</div>
                      <h4 className={`text-lg font-black mb-2 ${tc.textMain}`}>DeFi Vault</h4>
                      <p className={`text-xs md:text-sm ${tc.textMuted}`}>Stake your native assets into Nexio's smart contracts to earn Nexio Loyalty Points (NLP).</p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-3xl md:rounded-[2.5rem] border p-6 md:p-12 shadow-2xl relative overflow-hidden ${theme === 'dark' ? 'border-blue-500/20 bg-gradient-to-br from-[#0A1A3F]/80 to-black backdrop-blur-3xl' : 'border-blue-200 bg-gradient-to-br from-blue-50 to-white'}`}>
                  <div className={`absolute top-0 right-0 p-6 md:p-10 text-7xl md:text-9xl pointer-events-none ${theme === 'dark' ? 'opacity-10' : 'opacity-[0.03]'}`}>📖</div>
                  <h2 className={`text-3xl md:text-5xl font-black mb-4 md:mb-6 tracking-tighter drop-shadow-sm ${tc.textMain}`}>Built on Arc Network</h2>
                  <p className={`text-sm md:text-xl font-medium leading-relaxed max-w-3xl mb-6 md:mb-10 ${tc.textDesc}`}>
                    Nexio relies on Arc, an enterprise-grade L1 blockchain designed specifically for stablecoin management, rapid payments, and decentralized finance. It brings together fiat-backed assets and powerful infrastructure to make global money movement seamless.
                  </p>
                  <button onClick={openArcWebsite} className={`rounded-full px-6 py-3 md:px-10 md:py-4 font-black transition-all active:scale-95 flex items-center gap-2 md:gap-3 text-sm md:text-base w-full sm:w-auto justify-center shadow-lg ${theme === 'dark' ? 'bg-white text-black hover:bg-gray-200' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                    Visit Arc Official Website <span className="text-xl md:text-2xl">↗</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className={`mt-auto border-t py-8 md:py-12 backdrop-blur-2xl transition-colors duration-500 ${tc.footerBg}`}>
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center justify-between gap-6 md:gap-8 px-6 md:flex-row">
          <div className={`text-xs md:text-sm font-bold tracking-widest uppercase text-center md:text-left ${tc.textMuted}`}>
            © 2026 NEXIO · BUILT ON ARC NETWORK
          </div>

          <div className="flex flex-col items-center gap-3 md:gap-4 md:items-end">
            <div className={`text-[10px] md:text-xs font-black uppercase tracking-widest ${tc.textMuted}`}>
              BUILT BY <span className={tc.textMain}>JUBAYIR69</span>
            </div>
            <div className="flex gap-3 md:gap-4">
              <a href="https://discordapp.com/users/1209377505442537484" target="_blank" rel="noopener noreferrer" className={`transition-all p-2.5 md:p-3 border rounded-full md:hover:scale-110 flex items-center justify-center ${tc.footerIcon}`}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" /></svg>
              </a>
              <a href="https://github.com/jubayir-hub-69" target="_blank" rel="noopener noreferrer" className={`transition-all p-2.5 md:p-3 border rounded-full md:hover:scale-110 flex items-center justify-center ${tc.footerIcon}`}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
              </a>
              <a href="https://www.linkedin.com/in/jubayir-haider-302aab372" target="_blank" rel="noopener noreferrer" className={`transition-all p-2.5 md:p-3 border rounded-full md:hover:scale-110 flex items-center justify-center ${tc.footerIcon}`}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.848-3.037-1.85 0-2.132 1.445-2.132 2.939v5.667H9.36V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
