"use client";

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";

const ARC_CHAIN_ID = 5042002;
const ARC_CHAIN_ID_HEX = "0x4cef52";
const ARC_RPC = "https://rpc.testnet.arc.network";
const ARC_EXPLORER = "https://testnet.arcscan.app";
const ARC_FAUCET = "https://faucet.circle.com";

const EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";

const ANS_CONTRACT_ADDRESS = "0x68A2a776BaE48fd0bB7a409a9709d61A34Ced42c";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

const ANS_ABI = [
  "function register(string _name) external",
  "function resolve(string _name) external view returns (address)",
  "function isAvailable(string _name) external view returns (bool)"
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

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [message, setMessage] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  
  const [selectedTab, setSelectedTab] = useState<"overview" | "dailygm" | "domains" | "trustpass" | "history" | "learn">("overview");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [usdcBalance, setUsdcBalance] = useState("0.00");
  const [eurcBalance, setEurcBalance] = useState("0.00");
  const [balancesLoading, setBalancesLoading] = useState(false);

  const [showSendModal, setShowSendModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
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

  const [txHistory, setTxHistory] = useState<ActivityItem[]>([]);
  const [networkLatency, setNetworkLatency] = useState(0);

  const isArcTestnet = chainId === ARC_CHAIN_ID;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const to = params.get("to");
      const amount = params.get("amount");
      const token = params.get("token");

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
    window.setTimeout(() => setMessage(""), 4000);
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

  const fetchBalances = useCallback(async (address: string, isSilentRefresh = false) => {
    if (!address) return;
    try {
      if (!isSilentRefresh) setBalancesLoading(true);
      const rpcProvider = new ethers.JsonRpcProvider(ARC_RPC, undefined, { staticNetwork: true });
      const eurcContract = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, rpcProvider);

      const start = Date.now();
      const [nativeUsdcRaw, eurcRaw] = await Promise.all([
        rpcProvider.getBalance(address),
        eurcContract.balanceOf(address)
      ]);
      setNetworkLatency(Date.now() - start);

      setUsdcBalance(Number(ethers.formatUnits(nativeUsdcRaw, 18)).toFixed(2));
      setEurcBalance(Number(ethers.formatUnits(eurcRaw, 6)).toFixed(2));
    } catch (error) {
      console.error("Fetch Balance Error:", error);
    } finally {
      if (!isSilentRefresh) setBalancesLoading(false);
    }
  }, []);

  const syncConnectedAccount = async () => {
    const ethereum = getEthereum();
    if (!ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(ethereum);
      const accounts = await provider.send("eth_accounts", []);
      if (accounts?.length) {
        setWallet(accounts[0]);
      } else {
        setWallet("");
      }
      await syncNetwork();
    } catch {}
  };

  useEffect(() => {
    if (!wallet) return;

    const oldStreak = localStorage.getItem(`trustbank_streak_${wallet}`);
    if (oldStreak && !localStorage.getItem(`nexio_streak_${wallet}`)) {
      localStorage.setItem(`nexio_streak_${wallet}`, oldStreak);
      localStorage.setItem(`nexio_last_gm_${wallet}`, localStorage.getItem(`trustbank_last_gm_${wallet}`) || "");
    }

    const oldDomain = localStorage.getItem(`trustbank_domain_name_${wallet}`);
    if (oldDomain && !localStorage.getItem(`nexio_domain_name_${wallet}`)) {
      const migratedDomain = oldDomain.replace(".trust", ".nex");
      localStorage.setItem(`nexio_domain_name_${wallet}`, migratedDomain);
    }

    const oldHistory = localStorage.getItem(`trustbank_history_${wallet}`);
    if (oldHistory && !localStorage.getItem(`nexio_history_${wallet}`)) {
      localStorage.setItem(`nexio_history_${wallet}`, oldHistory);
    }

    const storedStreak = localStorage.getItem(`nexio_streak_${wallet}`);
    const storedDate = localStorage.getItem(`nexio_last_gm_${wallet}`);
    const today = new Date().toLocaleDateString();

    if (storedDate) {
      const lastDate = new Date(storedDate);
      const currentDate = new Date(today);
      const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (storedDate === today) {
        setHasCheckedInToday(true);
        setStreak(Number(storedStreak) || 1);
      } else if (diffDays === 1) {
        setHasCheckedInToday(false);
        setStreak(Number(storedStreak) || 0);
      } else {
        setHasCheckedInToday(false);
        setStreak(0);
      }
    } else {
      setHasCheckedInToday(false);
      setStreak(0);
    }
    
    const myDomain = localStorage.getItem(`nexio_domain_name_${wallet}`);
    if (myDomain) setRegisteredDomain(myDomain);

    const savedHistory = localStorage.getItem(`nexio_history_${wallet}`);
    if (savedHistory) setTxHistory(JSON.parse(savedHistory));

  }, [wallet]);

  useEffect(() => {
    if (!hasCheckedInToday) {
      setTimeLeft("");
      return;
    }
    const timer = setInterval(() => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const diff = tomorrow.getTime() - now.getTime();

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
  }, [hasCheckedInToday]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ethereum = getEthereum();
    if (!ethereum) return;

    const handleChainChanged = (nextChainIdHex: string) => {
      setChainId(Number.parseInt(nextChainIdHex, 16));
    };
    const handleAccountsChanged = (accounts: string[]) => {
      if (!accounts?.length) {
        setWallet("");
        setUsdcBalance("0.00");
        setEurcBalance("0.00");
        setHasCheckedInToday(false);
        setStreak(0);
        setRegisteredDomain("");
        setNetworkLatency(0);
        setIsBatchMode(false);
        setSendAddress("");
        setSendMemo("");
        setShowConfirmModal(false);
        setTxHistory([]);
        showMessage("Wallet Disconnected");
      } else {
        const newWallet = accounts[0];
        setWallet(newWallet);
        const savedHistory = localStorage.getItem(`nexio_history_${newWallet}`);
        if (savedHistory) setTxHistory(JSON.parse(savedHistory));
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
    if (!wallet || !isArcTestnet || isSending || showSendModal) return;
    void fetchBalances(wallet);
    const intervalId = setInterval(() => void fetchBalances(wallet, true), 8000);
    return () => clearInterval(intervalId);
  }, [wallet, isArcTestnet, fetchBalances, isSending, showSendModal]);

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
    setWallet("");
    setChainId(null);
    setUsdcBalance("0.00");
    setEurcBalance("0.00");
    setRegisteredDomain("");
    setNetworkLatency(0);
    setIsBatchMode(false);
    setSendAddress("");
    setSendMemo("");
    setShowConfirmModal(false);
    setTxHistory([]);
    showMessage("Wallet Disconnected");
  };

  const copyAddress = async () => {
    if (!wallet) return showMessage("Connect wallet first");
    await navigator.clipboard.writeText(wallet);
    showMessage("Address Copied");
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

  const handleSendClick = () => {
    if (!wallet) return showMessage("Please connect wallet first to send");
    if (!sendAddress || !sendAmount) return showMessage("Please fill required fields");
    
    const rawAddresses = isBatchMode ? sendAddress.split(',') : [sendAddress];
    const addresses = rawAddresses.map(a => a.trim()).filter(a => a !== "");

    if (addresses.length === 0) return showMessage("Please enter at least one address");
    
    setShowConfirmModal(true); 
  };

  const executeSend = async () => {
    setShowConfirmModal(false); 
    
    const rawAddresses = isBatchMode ? sendAddress.split(',') : [sendAddress];
    const addresses = rawAddresses.map(a => a.trim()).filter(a => a !== "");

    if (!isArcTestnet) {
      showMessage("Switching to Arc Testnet...");
      const switched = await switchToArcTestnet();
      if (!switched) return;
    }

    try {
      setIsSending(true);
      const ethereum = getEthereum();
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      const rpcProvider = new ethers.JsonRpcProvider(ARC_RPC, undefined, { staticNetwork: true });
      const ansContract = new ethers.Contract(ANS_CONTRACT_ADDRESS, ANS_ABI, rpcProvider);
      
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
                setIsSending(false);
                return;
             }
             resolvedAddresses.push(resolvedAddress);
          } catch (e) {
             showMessage(`Domain ${target} could not be resolved.`);
             setIsSending(false);
             return;
          }
        } else if (ethers.isAddress(target)) {
          resolvedAddresses.push(target);
        } else {
          showMessage(`Invalid address format: ${target}`);
          setIsSending(false);
          return;
        }
      }

      const memoHex = sendMemo ? ethers.hexlify(ethers.toUtf8Bytes(sendMemo)) : "0x";
      const memoBytes = sendMemo ? memoHex.replace("0x", "") : "";

      let successCount = 0;

      for (let i = 0; i < resolvedAddresses.length; i++) {
        const currentTarget = resolvedAddresses[i];
        const displayTarget = addresses[i];

        if (i > 0) {
          for (let s = 8; s > 0; s--) {
            showMessage(`Preparing transaction ${i + 1} of ${resolvedAddresses.length}... (${s}s)`);
            await sleep(1000);
          }
        }

        if (isBatchMode) showMessage(`Transaction ${i+1} of ${resolvedAddresses.length}: Please sign in wallet...`);
        else showMessage("Confirm transaction in your wallet...");

        try {
          let tx: any;

          if (sendAsset === "USDC") {
            const parsedAmount = ethers.parseUnits(sendAmount, 18);
            tx = await signer.sendTransaction({
              to: currentTarget,
              value: parsedAmount,
              data: memoHex
            });
          } else {
            const parsedAmount = ethers.parseUnits(sendAmount, 6);
            const contract = new ethers.Contract(EURC_ADDRESS, ERC20_ABI, signer);
            const transferData = contract.interface.encodeFunctionData("transfer", [currentTarget, parsedAmount]);
            const finalData = memoBytes ? transferData + memoBytes : transferData;

            tx = await signer.sendTransaction({
              to: EURC_ADDRESS,
              data: finalData
            });
          }
          
          showMessage(`Broadcasting ${sendAsset} to network...`);
          
          const receipt = await tx.wait();

          addHistoryRecord(
            isBatchMode ? `Batch Transfer ${sendAsset}` : `Transfer ${sendAsset}`, 
            `-${sendAmount} ${sendAsset}`, 
            `To ${displayTarget}${sendMemo ? ` (Memo: ${sendMemo})` : ""}`, 
            "Completed", 
            receipt?.hash || ""
          );
          successCount++;

        } catch (txError) {
          console.error("Transaction Error:", txError);
          addHistoryRecord(
            isBatchMode ? `Batch Transfer ${sendAsset}` : `Transfer ${sendAsset}`, 
            `${sendAmount} ${sendAsset}`, 
            `Failed: ${displayTarget}`, 
            "Failed"
          );
        }
      }
      
      if (successCount > 0) {
        showMessage(isBatchMode ? `Batch Complete: ${successCount}/${resolvedAddresses.length} sent! 🎉` : `Successfully sent ${sendAmount} ${sendAsset}!`);
        setShowSendModal(false);
        setSendAddress("");
        setSendAmount("");
        setSendMemo("");
        setIsBatchMode(false);
      } else {
        showMessage(isBatchMode ? `Batch Failed: 0/${resolvedAddresses.length} succeeded.` : `Transaction failed or rejected.`);
      }

    } catch (error) {
      console.error(error);
      showMessage("Operation failed. Check wallet connection.");
    } finally {
      setIsSending(false);
    }
  };

  const executeDailyGM = async () => {
    if (!wallet) return showMessage("Please connect wallet first");
    if (!isArcTestnet) {
      showMessage("Switching to Arc Testnet...");
      const switched = await switchToArcTestnet();
      if (!switched) return;
    }
    if (hasCheckedInToday) return showMessage("Already checked in today! Come back tomorrow.");

    setIsCheckingIn(true);
    try {
      const ethereum = getEthereum();
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      showMessage("Confirm Daily GM Check-in...");
      const tx = await signer.sendTransaction({ to: wallet, value: 0 });

      showMessage("Broadcasting GM Transaction to Arc Network...");
      const receipt = await tx.wait();
      
      const newStreak = streak + 1;
      const today = new Date().toLocaleDateString();
      setStreak(newStreak);
      setHasCheckedInToday(true);
      localStorage.setItem(`nexio_streak_${wallet}`, newStreak.toString());
      localStorage.setItem(`nexio_last_gm_${wallet}`, today);

      showMessage(`GM! Daily check-in successful. You are on Day ${newStreak} 🔥`);
      addHistoryRecord("Daily GM Check-in", "", `Streak: Day ${newStreak} 🔥`, "Completed", receipt?.hash || "");
      
      void fetchBalances(wallet); 
    } catch (error) {
      showMessage("GM Check-in rejected or failed");
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleSearchDomain = async () => {
    let cleanSearch = domainSearch.trim().toLowerCase();
    cleanSearch = cleanSearch.replace(/\.nex$/, "");
    cleanSearch = cleanSearch.replace(/[^a-z0-9-]/g, '');

    if (!cleanSearch) return showMessage("Enter a valid domain name");
    
    setIsCheckingDomain(true);
    try {
      const rpcProvider = new ethers.JsonRpcProvider(ARC_RPC);
      const ansContract = new ethers.Contract(ANS_CONTRACT_ADDRESS, ANS_ABI, rpcProvider);
      
      const available = await ansContract.isAvailable(cleanSearch);
      
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

  const triggerConfetti = () => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js";
    script.onload = () => {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100000 };
      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;
      const interval: any = setInterval(function() {
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
      if (!switched) return;
    }

    try {
      setIsRegistering(true);
      const ethereum = getEthereum();
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      const ansContract = new ethers.Contract(ANS_CONTRACT_ADDRESS, ANS_ABI, signer);
      
      let cleanName = domainSearch.toLowerCase();
      cleanName = cleanName.replace(/\.nex$/, "");
      cleanName = cleanName.replace(/[^a-z0-9-]/g, '');

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
            <div className="w-24 h-24 bg-[#050B14] border border-cyan-500/20 rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.3)] mb-6 overflow-hidden p-2 transform transition-transform hover:scale-105">
              <img src="/nexio-logo.png" alt="Nexio Logo" crossOrigin="anonymous" className="w-full h-full object-contain rounded-2xl" />
            </div>
            <h2 className="text-3xl font-black text-white tracking-tight mb-2">Congratulations!</h2>
            <p className="text-sm font-medium text-gray-300 mb-6">Your domain has been successfully registered, <span className="text-cyan-400 font-bold">verified on Arc Testnet</span>!</p>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/50 bg-cyan-500/10 px-6 py-2 mb-8">
              <span className="text-cyan-400">⚡</span>
              <span className="text-sm font-black text-cyan-400 tracking-widest uppercase">Lifetime Ownership</span>
            </div>
            <div className="w-full rounded-2xl border border-cyan-500/20 bg-black/50 p-5 flex justify-between items-center mb-4">
              <span className="text-xl font-black text-white">{registeredDomain}</span>
              <span className="bg-white/10 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider text-gray-300">Forever</span>
            </div>
            <div className="w-full rounded-2xl border border-white/5 bg-black/50 p-5 flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-gray-400">Tx Hash: <span className="text-white ml-1">{registrationHash.slice(0,6)}...{registrationHash.slice(-4)}</span></span>
              <button onClick={() => window.open(`${ARC_EXPLORER}/tx/${registrationHash}`, "_blank")} className="bg-white/10 hover:bg-white/20 transition px-4 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1">Explorer ↗</button>
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
                <div className="mt-4 p-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2">
                  <div className="text-xs font-bold text-cyan-500 uppercase tracking-widest">Share this unique link:</div>
                  <div className="text-xs font-mono break-all text-gray-300 bg-black/50 p-3 rounded-xl border border-white/5">
                    {paymentLink}
                  </div>
                  <button onClick={copyPaymentLink} className="w-full rounded-xl bg-white text-black hover:bg-gray-200 py-3 font-black transition-all active:scale-95 flex items-center justify-center gap-2">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    Copy Link
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
              <div className="text-4xl mb-4 animate-pulse">⚠️</div>
              <h3 className={`text-xl font-black mb-2 ${tc.textMain}`}>Confirm Payment</h3>
              <p className={`text-sm ${tc.textMuted}`}>Please verify the details below before sending. Transactions cannot be reversed.</p>
            </div>

            <div className={`rounded-2xl p-4 mb-6 border space-y-3 ${theme === 'dark' ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Asset</span>
                <span className={`font-black text-lg ${tc.textMain}`}>{sendAmount} {sendAsset}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">To</span>
                <div className="text-right">
                  {isBatchMode ? (
                    <span className={`text-sm font-mono font-bold ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>{sendAddress.split(',').length} Recipients</span>
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
              <button onClick={() => setShowConfirmModal(false)} className={`flex-1 rounded-xl py-3 font-bold transition-all border ${theme === 'dark' ? 'bg-gray-800 text-white border-transparent hover:bg-gray-700' : 'bg-slate-200 text-slate-800 border-slate-300 hover:bg-slate-300'}`}>Cancel</button>
              <button onClick={executeSend} className="flex-1 rounded-xl bg-cyan-500 text-white py-3 font-black hover:bg-cyan-400 transition-all shadow-lg active:scale-95">Confirm & Send</button>
            </div>
          </div>
        </div>
      )}

      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-[2rem] border p-6 sm:p-8 backdrop-blur-2xl transition-colors duration-300 ${tc.modalBg}`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-2xl font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Send Asset</h3>
              <button onClick={() => setShowSendModal(false)} className="text-gray-400 hover:text-cyan-500 transition rounded-full p-2.5">✕</button>
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
                <label className={`text-xs font-bold mb-2 flex justify-between uppercase tracking-widest ${tc.historyText}`}>
                  <span>Recipient {isBatchMode ? "Addresses or names" : "Address or name"}</span>
                  {isBatchMode && <span className="text-[9px] text-orange-400">Separate with comma (,)</span>}
                </label>
                {isBatchMode ? (
                  <textarea value={sendAddress} onChange={(e) => setSendAddress(e.target.value)} placeholder="0x1..., jubayir.nex, 0x3..." className={`w-full rounded-2xl border px-5 py-4 focus:outline-none transition font-mono text-sm resize-none h-24 ${tc.inputBg}`} />
                ) : (
                  <input type="text" value={sendAddress} onChange={(e) => setSendAddress(e.target.value)} placeholder="e.g., 0x... or jubayir.nex" className={`w-full rounded-2xl border px-5 py-4 focus:outline-none transition font-mono text-sm ${tc.inputBg}`} />
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
        <div className={`absolute top-0 right-0 w-72 sm:w-80 h-full border-l p-6 flex flex-col gap-2 transform transition-transform duration-300 shadow-2xl ${tc.drawerBg} ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex justify-between items-center mb-6">
            <span className={`text-xl font-black ${tc.textMain}`}>Menu</span>
            <button onClick={() => setIsSidebarOpen(false)} className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'}`}>✕</button>
          </div>
          
          <button onClick={() => handleTabSwitch("overview")} className={`w-full rounded-2xl px-6 py-4 text-left font-black tracking-wide transition-all border ${selectedTab === "overview" ? tc.sidebarActive : tc.sidebarInactive}`}>
            Dashboard
          </button>
          <button onClick={() => handleTabSwitch("dailygm")} className={`w-full rounded-2xl px-6 py-4 text-left flex justify-between items-center font-black tracking-wide transition-all border ${selectedTab === "dailygm" ? tc.sidebarActive : tc.sidebarInactive}`}>
            <span>Daily GM</span>
            <span className="text-xl">🔥</span>
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

          <div className="mt-auto pt-6 border-t border-white/5">
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
              <div className={`w-2 h-2 rounded-full ${isArcTestnet ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'} animate-pulse`}></div>
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
                    <div className="absolute -top-6 -right-6 md:-top-10 md:-right-10 p-6 md:p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-700 text-7xl md:text-9xl group-hover:scale-110">💵</div>
                    <div className={`text-[10px] md:text-xs font-black uppercase tracking-widest mb-3 md:mb-4 ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>USDC Balance</div>
                    <div className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter drop-shadow-sm">{balancesLoading ? "..." : usdcBalance}</div>
                  </div>

                  <div className={`rounded-3xl md:rounded-[2.5rem] p-6 md:p-8 relative overflow-hidden group transition-all duration-500 md:hover:-translate-y-1 ${tc.cardBg}`}>
                    <div className="absolute -top-6 -right-6 md:-top-10 md:-right-10 p-6 md:p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-all duration-700 text-7xl md:text-9xl group-hover:scale-110">💶</div>
                    <div className={`text-[10px] md:text-xs font-black uppercase tracking-widest mb-3 md:mb-4 ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>EURC Balance</div>
                    <div className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter drop-shadow-sm">{balancesLoading ? "..." : eurcBalance}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 md:gap-6">
                  <button onClick={handleOpenSendModal} className={`group rounded-2xl sm:rounded-3xl md:rounded-[2.5rem] p-4 sm:p-6 md:p-8 text-center transition-all md:hover:-translate-y-2 flex flex-col items-center justify-center ${tc.actionCard}`}>
                    <div className="text-sm sm:text-lg md:text-xl font-black group-hover:scale-105 transition-transform tracking-wide">Send</div>
                    <span className={`text-[8px] mt-1 tracking-widest opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>BATCH (v0.7.2)</span>
                  </button>
                  
                  <button onClick={handleOpenRequestModal} className={`group rounded-2xl sm:rounded-3xl md:rounded-[2.5rem] p-4 sm:p-6 md:p-8 text-center transition-all md:hover:-translate-y-2 flex flex-col items-center justify-center relative ${tc.actionCard}`}>
                    <div className="absolute top-2 right-2 md:top-4 md:right-4 w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
                    <div className="text-sm sm:text-lg md:text-xl font-black group-hover:scale-105 transition-transform tracking-wide">Request</div>
                    <span className={`text-[8px] mt-1 tracking-widest opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>PAYMENT LINK</span>
                  </button>

                  <button onClick={copyAddress} className={`group rounded-2xl sm:rounded-3xl md:rounded-[2.5rem] p-4 sm:p-6 md:p-8 text-center transition-all md:hover:-translate-y-2 flex flex-col items-center justify-center ${tc.actionCard}`}>
                    <div className="text-sm sm:text-lg md:text-xl font-black group-hover:scale-105 transition-transform tracking-wide">Receive</div>
                    <span className={`text-[8px] mt-1 tracking-widest opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>COPY ADDRESS</span>
                  </button>

                  <button onClick={openFaucet} className={`group rounded-2xl sm:rounded-3xl md:rounded-[2.5rem] p-4 sm:p-6 md:p-8 text-center transition-all md:hover:-translate-y-2 flex flex-col items-center justify-center ${tc.actionCard}`}>
                    <div className="text-sm sm:text-lg md:text-xl font-black group-hover:scale-105 transition-transform tracking-wide">Faucet</div>
                    <span className={`text-[8px] mt-1 tracking-widest opacity-0 group-hover:opacity-100 transition-opacity ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>FREE TESTNET</span>
                  </button>
                </div>
              </div>
            )}

            {selectedTab === "dailygm" && (
              <div className="w-full flex items-center justify-center animate-in fade-in zoom-in-95 duration-500 mt-4 md:mt-10">
                <div className={`w-full max-w-2xl rounded-3xl md:rounded-[3rem] border p-8 md:p-14 shadow-2xl flex flex-col items-center text-center relative overflow-hidden group gap-6 md:gap-8 ${theme === 'dark' ? 'border-orange-500/20 bg-gradient-to-br from-orange-500/10 to-black backdrop-blur-2xl text-white' : 'border-orange-200 bg-gradient-to-br from-orange-50 to-white text-slate-900'}`}>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 opacity-5 text-[15rem] md:text-[20rem] group-hover:rotate-12 transition-transform duration-1000">☀️</div>
                  
                  <div className="flex flex-col items-center z-10">
                     <div className="text-6xl md:text-7xl mb-4 animate-bounce">{hasCheckedInToday ? "🔥" : "⏳"}</div>
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
                        className={`w-full max-w-sm rounded-2xl py-4 md:py-5 font-black text-lg md:text-xl transition-all duration-300 shadow-2xl mt-4 ${
                           hasCheckedInToday 
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
                <div className={`absolute top-0 right-0 p-6 md:p-10 text-7xl md:text-9xl ${theme === 'dark' ? 'opacity-5' : 'opacity-[0.03]'}`}>🌐</div>
                <h2 className={`text-2xl md:text-4xl font-black tracking-tight mb-2 md:mb-3 ${tc.textMain}`}>Nexio Web3 Identity</h2>
                <p className={`text-xs md:text-base font-medium mb-6 md:mb-10 max-w-xl ${tc.textMuted}`}>Register your unique <span className={theme === 'dark' ? 'text-cyan-400 font-bold' : 'text-cyan-600 font-bold'}>.nex</span> username on the blockchain and establish your lifetime identity.</p>
                
                <div className={`flex flex-col sm:flex-row items-center gap-3 md:gap-4 w-full bg-black border rounded-3xl sm:rounded-full p-2 pl-4 md:pl-6 transition-shadow ${theme === 'dark' ? 'border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.1)] hover:shadow-[0_0_40px_rgba(6,182,212,0.2)]' : 'border-cyan-300 shadow-md hover:shadow-lg'}`}>
                  <span className={`hidden sm:inline-block text-xl font-bold ${theme === 'dark' ? 'text-cyan-500' : 'text-cyan-600'}`}>∞</span>
                  <input 
                    type="text" 
                    value={domainSearch}
                    onChange={(e) => { 
                      let val = e.target.value.toLowerCase();
                      val = val.replace(/\.nex$/, "");
                      val = val.replace(/[^a-z0-9-]/g, '');
                      setDomainSearch(val); 
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
                  <div className={`mt-6 md:mt-8 flex flex-col sm:flex-row items-center justify-between p-5 md:p-6 rounded-3xl animate-in fade-in slide-in-from-bottom-4 duration-500 ${theme === 'dark' ? 'bg-cyan-950/30 border border-cyan-500/30' : 'bg-cyan-50 border border-cyan-200'}`}>
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

            {selectedTab === "trustpass" && (
              <div className={`rounded-3xl md:rounded-[2.5rem] p-6 md:p-10 flex flex-col items-center justify-center min-h-[50vh] md:min-h-[60vh] relative overflow-hidden animate-in fade-in zoom-in-95 duration-500 ${theme === 'dark' ? 'border border-white/10 bg-white/[0.02] backdrop-blur-3xl shadow-2xl' : 'border border-slate-200 bg-white shadow-xl'}`}>
                {theme === 'dark' && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 md:w-96 md:h-96 bg-cyan-500/20 rounded-full blur-[80px] md:blur-[100px] pointer-events-none"></div>}

                {!registeredDomain ? (
                  <div className="text-center z-10 max-w-lg px-4">
                    <div className="text-5xl md:text-7xl mb-4 md:mb-6 animate-pulse">🪪</div>
                    <h2 className={`text-2xl md:text-3xl font-black mb-3 md:mb-4 ${tc.textMain}`}>Unlock Your Nexio Pass</h2>
                    <p className={`text-sm md:text-base mb-6 md:mb-8 ${tc.textMuted}`}>You need to register a .nex domain to generate your exclusive Web3 Holographic Identity Card.</p>
                    <button onClick={() => handleTabSwitch("domains")} className="bg-cyan-500 hover:bg-cyan-600 text-white font-black px-6 py-3 md:px-8 md:py-4 rounded-full transition-all active:scale-95 shadow-lg text-sm md:text-base">
                      Register Domain Now
                    </button>
                  </div>
                ) : (
                  <div className="z-10 w-full flex flex-col items-center">
                    <div className="text-center mb-8 md:mb-10">
                      <h2 className={`text-2xl md:text-3xl font-black tracking-tight ${tc.textMain}`}>Your Digital Identity</h2>
                      <p className={`text-xs md:text-sm font-bold mt-1 md:mt-2 ${theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'}`}>Verified on Arc Blockchain</p>
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
                          {wallet.slice(0,6)}...{wallet.slice(-4)}
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
                      <button onClick={downloadTrustPass} className={`flex items-center gap-2 px-5 py-2.5 md:px-6 md:py-3 rounded-full transition-all font-bold text-xs md:text-sm border active:scale-95 shadow-md ${theme === 'dark' ? 'bg-white/10 hover:bg-white/20 text-white border-white/10' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'}`}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
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
                      <div className="text-5xl md:text-6xl mb-3 md:mb-4 opacity-50">📭</div>
                      <div className={`font-bold text-base md:text-lg ${tc.textMuted}`}>No blockchain activity found.</div>
                    </div>
                  ) : (
                    txHistory.map((item) => (
                      <div key={item.id} className={`rounded-xl md:rounded-2xl border p-4 md:p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-4 md:gap-6 transition-all ${tc.historyCard}`}>
                        <div className="flex items-center gap-4 md:gap-6">
                          <div className={`p-3 md:p-4 rounded-full border ${item.status === "Completed" ? (theme==='dark'?"bg-green-500/10 text-green-400 border-green-500/20":"bg-green-100 text-green-600 border-green-200") : item.status === "Failed" ? (theme==='dark'?"bg-red-500/10 text-red-400 border-red-500/20":"bg-red-100 text-red-600 border-red-200") : (theme==='dark'?"bg-amber-500/10 text-amber-400 border-amber-500/20":"bg-amber-100 text-amber-600 border-amber-200")}`}>
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
                            <div className={`font-black text-xl md:text-2xl tracking-tighter ${item.amount.startsWith("+") ? (theme==='dark'?'text-emerald-400':'text-emerald-600') : item.amount.startsWith("-") ? tc.textMain : tc.textMuted}`}>
                              {item.amount}
                            </div>
                          )}
                          <div className={`mt-1.5 md:mt-2 inline-block px-2.5 py-1 md:px-3 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest ${item.status === "Completed" ? (theme==='dark'?"bg-emerald-500/10 text-emerald-400":"bg-emerald-100 text-emerald-600") : item.status === "Failed" ? (theme==='dark'?"bg-red-500/10 text-red-400":"bg-red-100 text-red-600") : (theme==='dark'?"bg-amber-500/10 text-amber-400":"bg-amber-100 text-amber-600")}`}>
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
                  <div className={`absolute top-0 right-0 p-6 md:p-10 text-7xl md:text-9xl ${theme === 'dark' ? 'opacity-10' : 'opacity-[0.03]'}`}>🏦</div>
                  <h2 className={`text-3xl md:text-5xl font-black mb-4 md:mb-6 tracking-tighter drop-shadow-sm ${tc.textMain}`}>What is Nexio?</h2>
                  <p className={`text-sm md:text-xl font-medium leading-relaxed max-w-3xl mb-6 md:mb-10 ${tc.textDesc}`}>
                    Nexio is an advanced Web3 Stablecoin Management and Identity Protocol built on the Arc Network. We make blockchain payments as simple as traditional banking by replacing complex addresses with human-readable <strong>.nex</strong> domains and offering enterprise-grade batch payment tools.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 mt-8">
                    <div className={`p-5 md:p-6 rounded-2xl border ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="text-2xl mb-2">🌐</div>
                      <h4 className={`text-lg font-black mb-2 ${tc.textMain}`}>Nexio Name Service</h4>
                      <p className={`text-xs md:text-sm ${tc.textMuted}`}>Register a permanent .nex domain to replace your long 0x wallet address.</p>
                    </div>
                    <div className={`p-5 md:p-6 rounded-2xl border ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="text-2xl mb-2">💸</div>
                      <h4 className={`text-lg font-black mb-2 ${tc.textMain}`}>Batch Transfers</h4>
                      <p className={`text-xs md:text-sm ${tc.textMuted}`}>Send USDC or EURC to multiple domains simultaneously with our domain-resolved engine.</p>
                    </div>
                    <div className={`p-5 md:p-6 rounded-2xl border ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="text-2xl mb-2">🔗</div>
                      <h4 className={`text-lg font-black mb-2 ${tc.textMain}`}>Automated Invoicing</h4>
                      <p className={`text-xs md:text-sm ${tc.textMuted}`}>Generate shareable payment links that auto-fill the exact recipient, asset, and amount.</p>
                    </div>
                    <div className={`p-5 md:p-6 rounded-2xl border ${theme === 'dark' ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                      <div className="text-2xl mb-2">🪪</div>
                      <h4 className={`text-lg font-black mb-2 ${tc.textMain}`}>Nexio Pass & Daily GM</h4>
                      <p className={`text-xs md:text-sm ${tc.textMuted}`}>Build an on-chain streak and unlock your verifiable, holographic Web3 Identity Card.</p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-3xl md:rounded-[2.5rem] border p-6 md:p-12 shadow-2xl relative overflow-hidden ${theme === 'dark' ? 'border-blue-500/20 bg-gradient-to-br from-[#0A1A3F]/80 to-black backdrop-blur-3xl' : 'border-blue-200 bg-gradient-to-br from-blue-50 to-white'}`}>
                  <div className={`absolute top-0 right-0 p-6 md:p-10 text-7xl md:text-9xl ${theme === 'dark' ? 'opacity-10' : 'opacity-[0.03]'}`}>📖</div>
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
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>
              </a>
              <a href="https://github.com/jubayir-hub-69" target="_blank" rel="noopener noreferrer" className={`transition-all p-2.5 md:p-3 border rounded-full md:hover:scale-110 flex items-center justify-center ${tc.footerIcon}`}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/></svg>
              </a>
              <a href="https://www.linkedin.com/in/jubayir-haider-302aab372" target="_blank" rel="noopener noreferrer" className={`transition-all p-2.5 md:p-3 border rounded-full md:hover:scale-110 flex items-center justify-center ${tc.footerIcon}`}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.848-3.037-1.85 0-2.132 1.445-2.132 2.939v5.667H9.36V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
