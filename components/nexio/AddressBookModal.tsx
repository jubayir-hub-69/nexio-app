"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import {
  ADDRESS_BOOK_ABI,
  ADDRESS_BOOK_ADDRESS,
  ARC_CHAIN_ID,
  ARC_EXPLORER,
  ARC_NETWORK_LABEL,
  batchResolveRecipients,
  getTxErrorMessage,
  invalidateAddressBookCache,
  prepareAndSendTx,
  type AddressBookContact,
  type ResolvedRecipient,
  type TxExecutionStage,
} from "@/lib/contracts";
import {
  AlertTriangleIcon,
  BookUserIcon,
  CheckIcon,
  CloseIcon,
  CopyButton,
  EditIcon,
  PlusIcon,
  RadarSpinner,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "./Icons";
import {
  TxLifecycleStepper,
  type TxLifecycleState,
  type TxStepItem,
  type TxStepStatus,
} from "./TxLifecycleStepper";

const ZERO = 0n;
const MAX_CONTACTS = 100;

function mapStageToStepStatus(stage: TxExecutionStage): TxStepStatus {
  switch (stage) {
    case "simulating":
      return "simulating";
    case "awaiting_wallet":
      return "awaiting_wallet";
    case "confirming_block":
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

export function findMatchingContact(
  contacts: AddressBookContact[],
  addressOrDomain: string | null | undefined
): AddressBookContact | null {
  const clean = (addressOrDomain || "").trim().toLowerCase();
  if (!clean) return null;
  return (
    contacts.find(
      (c) =>
        c.recipient.toLowerCase() === clean ||
        (c.domain && c.domain.toLowerCase() === clean)
    ) ?? null
  );
}

/* ============================================================================
 * 1. Live Recipient Autocomplete Dropdown (Single & Batch Send Inputs)
 * ========================================================================== */

export type AddressBookAutocompleteProps = {
  contacts: AddressBookContact[];
  inputValue: string;
  isBatchMode: boolean;
  open: boolean;
  onSelect: (contact: AddressBookContact) => void;
  onOpenAddressBook?: () => void;
};

export function AddressBookAutocomplete({
  contacts,
  inputValue,
  isBatchMode,
  open,
  onSelect,
  onOpenAddressBook,
}: AddressBookAutocompleteProps) {
  const { activeQuery, alreadySelectedSet } = useMemo(() => {
    if (!isBatchMode) {
      return {
        activeQuery: inputValue.trim().toLowerCase(),
        alreadySelectedSet: new Set<string>(),
      };
    }
    const parts = inputValue.split(",");
    const tail = (parts[parts.length - 1] ?? "").trim().toLowerCase();
    const prior = new Set<string>();
    for (let i = 0; i < parts.length - 1; i++) {
      const token = parts[i].trim().toLowerCase();
      if (token) prior.add(token);
    }
    return { activeQuery: tail, alreadySelectedSet: prior };
  }, [inputValue, isBatchMode]);

  const matches = useMemo(() => {
    if (!open || contacts.length === 0) return [];
    return contacts
      .filter((c) => {
        const addrLower = c.recipient.toLowerCase();
        const domLower = c.domain.toLowerCase();
        if (
          alreadySelectedSet.has(addrLower) ||
          (domLower && alreadySelectedSet.has(domLower))
        ) {
          return false;
        }
        if (!activeQuery) return true;
        return (
          c.label.toLowerCase().includes(activeQuery) ||
          addrLower.includes(activeQuery) ||
          (domLower && domLower.includes(activeQuery))
        );
      })
      .slice(0, 6);
  }, [open, contacts, activeQuery, alreadySelectedSet]);

  if (!open || matches.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Saved on-chain contacts"
      className="nx-enter absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border border-slate-300 dark:border-cyan-500/30 bg-white dark:bg-[#081529] shadow-[0_16px_40px_rgba(15,23,42,0.18)] dark:shadow-[0_16px_40px_rgba(2,6,23,0.75)]"
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-black/30 text-[10px] font-extrabold uppercase tracking-widest text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <BookUserIcon size={12} className="text-sky-700 dark:text-cyan-400" />
          <span>On-Chain Address Book</span>
        </span>
        {onOpenAddressBook && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onOpenAddressBook();
            }}
            className="text-sky-800 dark:text-cyan-300 hover:underline normal-case tracking-normal font-black"
          >
            Manage
          </button>
        )}
      </div>

      <div className="max-h-56 overflow-y-auto divide-y divide-slate-200/70 dark:divide-white/[0.06]">
        {matches.map((contact) => (
          <button
            key={contact.recipient}
            type="button"
            role="option"
            aria-selected={false}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(contact);
            }}
            className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-left hover:bg-sky-50 dark:hover:bg-cyan-500/12 transition"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                  {contact.label}
                </span>
                {contact.domain && (
                  <span className="rounded-md bg-sky-100 border border-sky-300 dark:border-cyan-500/30 dark:bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-900 dark:text-cyan-300 shrink-0">
                    {contact.domain}
                  </span>
                )}
              </div>
              <div className="nx-num font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                {contact.recipient.slice(0, 10)}…{contact.recipient.slice(-8)}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/35 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/12 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:text-emerald-300 shrink-0">
              <ShieldCheckIcon size={11} />
              <span>Use</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. Enterprise On-Chain Address Book Modal (CRUD via NexioAddressBook.sol)
 * ========================================================================== */

export type AddressBookModalProps = {
  open: boolean;
  wallet: string;
  isArcMainnet: boolean;
  chainLocked: boolean;
  usdcBalanceRaw: bigint;
  contacts: AddressBookContact[];
  loading: boolean;
  initialRecipient?: string;
  txLifecycle: TxLifecycleState | null;
  getEthereum: () => ethers.Eip1193Provider | null;
  onClose: () => void;
  onSwitchToArcMainnet: () => Promise<boolean>;
  onShowMessage: (text: string) => void;
  onSetTxLifecycle: React.Dispatch<React.SetStateAction<TxLifecycleState | null>>;
  onResetReceiptDismissed: () => void;
  onRefreshContacts: (force?: boolean) => Promise<void>;
  onSelectContact?: (contact: AddressBookContact) => void;
  onHistoryRefresh?: () => void;
};

export function AddressBookModal({
  open,
  wallet,
  isArcMainnet,
  chainLocked,
  usdcBalanceRaw,
  contacts,
  loading,
  initialRecipient,
  txLifecycle,
  getEthereum,
  onClose,
  onSwitchToArcMainnet,
  onShowMessage,
  onSetTxLifecycle,
  onResetReceiptDismissed,
  onRefreshContacts,
  onSelectContact,
  onHistoryRefresh,
}: AddressBookModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [recipientInput, setRecipientInput] = useState("");
  const [resolvedTarget, setResolvedTarget] = useState<ResolvedRecipient | null>(null);
  const [resolvingTarget, setResolvingTarget] = useState(false);
  const [confirmDeleteAddr, setConfirmDeleteAddr] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const resolveGenRef = useRef(0);

  // Pre-fill Add form when opened via "Save to Address Book" with an initialRecipient
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setConfirmDeleteAddr(null);
      if (initialRecipient && initialRecipient.trim()) {
        const existing = findMatchingContact(contacts, initialRecipient);
        setShowForm(true);
        setEditingRecipient(existing ? existing.recipient : null);
        setLabelInput(existing ? existing.label : "");
        setRecipientInput(initialRecipient.trim());
        setResolvedTarget(null);
      } else {
        setShowForm(false);
        setEditingRecipient(null);
        setLabelInput("");
        setRecipientInput("");
        setResolvedTarget(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, initialRecipient, contacts]);

  // Escape closes modal unless an on-chain write is actively running
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isMutating) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, isMutating, onClose]);

  // Live debounced .nex / 0x resolution for the Add/Edit form
  useEffect(() => {
    if (!open || !showForm) return;
    const trimmed = recipientInput.trim();
    if (!trimmed) {
      const clearTimer = window.setTimeout(() => {
        setResolvedTarget(null);
        setResolvingTarget(false);
      }, 0);
      return () => window.clearTimeout(clearTimer);
    }

    const gen = ++resolveGenRef.current;
    const timer = window.setTimeout(async () => {
      setResolvingTarget(true);
      try {
        const [first] = await batchResolveRecipients([trimmed]);
        if (gen !== resolveGenRef.current) return;
        setResolvedTarget(first ?? null);
      } catch {
        if (gen !== resolveGenRef.current) return;
        setResolvedTarget(null);
      } finally {
        if (gen === resolveGenRef.current) {
          setResolvingTarget(false);
        }
      }
    }, 240);

    return () => window.clearTimeout(timer);
  }, [open, showForm, recipientInput]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.recipient.toLowerCase().includes(q) ||
        c.domain.toLowerCase().includes(q)
    );
  }, [contacts, searchQuery]);

  if (!open) return null;

  const openAddForm = () => {
    setEditingRecipient(null);
    setLabelInput("");
    setRecipientInput("");
    setResolvedTarget(null);
    setConfirmDeleteAddr(null);
    setShowForm(true);
  };

  const openEditForm = (contact: AddressBookContact) => {
    setEditingRecipient(contact.recipient);
    setLabelInput(contact.label);
    setRecipientInput(contact.domain || contact.recipient);
    setResolvedTarget({
      input: contact.domain || contact.recipient,
      valid: true,
      kind: contact.domain ? "domain" : "address",
      address: contact.recipient,
      domain: contact.domain || null,
    });
    setConfirmDeleteAddr(null);
    setShowForm(true);
  };

  const handleSaveContact = async () => {
    if (!wallet || isMutating) return;
    const cleanLabel = labelInput.trim();
    if (cleanLabel.length < 1 || cleanLabel.length > 64) {
      onShowMessage("Enter a contact label between 1 and 64 characters.");
      return;
    }

    const rawRecipient = recipientInput.trim();
    if (!rawRecipient) {
      onShowMessage("Enter a recipient 0x address or .nex domain.");
      return;
    }

    if (usdcBalanceRaw <= ZERO) {
      onShowMessage("Insufficient native USDC to pay Arc Mainnet gas.");
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

    setIsMutating(true);
    onResetReceiptDismissed();
    const opId = `ab-save-${Date.now()}`;

    try {
      const [checked] = await batchResolveRecipients([rawRecipient]);
      if (!checked || !checked.valid || !checked.address) {
        onShowMessage(checked?.error ?? "Invalid 0x address or unregistered .nex domain.");
        return;
      }

      const targetAddr = ethers.getAddress(checked.address);
      const targetDomain = (checked.domain ?? "").trim();

      const ethereum = getEthereum();
      if (!ethereum) throw new Error("Wallet provider not found.");
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      const iface = new ethers.Interface(ADDRESS_BOOK_ABI);
      const callData = iface.encodeFunctionData("saveContact", [
        targetAddr,
        cleanLabel,
        targetDomain,
      ]);

      const steps: TxStepItem[] = [
        {
          id: "ab-save",
          title: editingRecipient ? `Update "${cleanLabel}"` : `Whitelist "${cleanLabel}"`,
          subtitle: targetDomain || `${targetAddr.slice(0, 8)}…${targetAddr.slice(-6)}`,
          status: "simulating",
        },
      ];

      const syncState = (extra?: Partial<TxLifecycleState>) => {
        onSetTxLifecycle({
          id: opId,
          operationTitle: editingRecipient ? "Update Contact" : "Save Contact On-Chain",
          amountSummary: targetDomain
            ? `${cleanLabel} (${targetDomain})`
            : `${cleanLabel} (${targetAddr.slice(0, 6)}…${targetAddr.slice(-4)})`,
          steps: [...steps],
          explorerUrl: ARC_EXPLORER,
          chainId: ARC_CHAIN_ID,
          ...extra,
        });
      };

      syncState();

      const { hash, receipt } = await prepareAndSendTx(
        signer,
        { to: ADDRESS_BOOK_ADDRESS, data: callData, value: ZERO },
        {
          label: "Nexio Address Book",
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

      invalidateAddressBookCache(wallet);
      await onRefreshContacts(true);
      onHistoryRefresh?.();

      setShowForm(false);
      setEditingRecipient(null);
      setLabelInput("");
      setRecipientInput("");
      setResolvedTarget(null);
      onShowMessage(`Saved "${cleanLabel}" to your on-chain Address Book.`);
    } catch (error) {
      if (isUserWalletRejection(error)) {
        onSetTxLifecycle(null);
        onShowMessage("Transaction rejected in wallet.");
      } else {
        const msg = getTxErrorMessage(error);
        onSetTxLifecycle((prev) =>
          prev
            ? {
                ...prev,
                failed: true,
                errorMessage: msg,
                steps: prev.steps.map((s) => ({ ...s, status: "failed" })),
              }
            : null
        );
        onShowMessage(msg);
      }
    } finally {
      setIsMutating(false);
    }
  };

  const handleRemoveContact = async (contact: AddressBookContact) => {
    if (!wallet || isMutating) return;
    if (usdcBalanceRaw <= ZERO) {
      onShowMessage("Insufficient native USDC to pay Arc Mainnet gas.");
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

    setIsMutating(true);
    onResetReceiptDismissed();
    const opId = `ab-remove-${Date.now()}`;

    try {
      const ethereum = getEthereum();
      if (!ethereum) throw new Error("Wallet provider not found.");
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();

      const iface = new ethers.Interface(ADDRESS_BOOK_ABI);
      const callData = iface.encodeFunctionData("removeContact", [contact.recipient]);

      const steps: TxStepItem[] = [
        {
          id: "ab-remove",
          title: `Remove "${contact.label}"`,
          subtitle: contact.domain || `${contact.recipient.slice(0, 8)}…${contact.recipient.slice(-6)}`,
          status: "simulating",
        },
      ];

      const syncState = (extra?: Partial<TxLifecycleState>) => {
        onSetTxLifecycle({
          id: opId,
          operationTitle: "Remove On-Chain Contact",
          amountSummary: contact.label,
          steps: [...steps],
          explorerUrl: ARC_EXPLORER,
          chainId: ARC_CHAIN_ID,
          ...extra,
        });
      };

      syncState();

      const { hash, receipt } = await prepareAndSendTx(
        signer,
        { to: ADDRESS_BOOK_ADDRESS, data: callData, value: ZERO },
        {
          label: "Nexio Address Book",
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

      invalidateAddressBookCache(wallet);
      await onRefreshContacts(true);
      onHistoryRefresh?.();

      setConfirmDeleteAddr(null);
      onShowMessage(`Removed "${contact.label}" from your on-chain Address Book.`);
    } catch (error) {
      if (isUserWalletRejection(error)) {
        onSetTxLifecycle(null);
        onShowMessage("Transaction rejected in wallet.");
      } else {
        const msg = getTxErrorMessage(error);
        onSetTxLifecycle((prev) =>
          prev
            ? {
                ...prev,
                failed: true,
                errorMessage: msg,
                steps: prev.steps.map((s) => ({ ...s, status: "failed" })),
              }
            : null
        );
        onShowMessage(msg);
      }
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="address-book-title"
      onClick={() => {
        if (!isMutating) onClose();
      }}
      className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="nx-enter w-full max-w-lg max-h-[min(88dvh,720px)] flex flex-col rounded-[2rem] border border-slate-300 bg-white shadow-2xl text-slate-900 dark:border-white/12 dark:bg-[#071326] dark:text-white overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-4 border-b border-slate-200 dark:border-white/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                id="address-book-title"
                className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white"
              >
                On-Chain Address Book
              </h3>
              <span className="nx-num rounded-full border border-sky-600/35 dark:border-cyan-500/35 bg-sky-100 dark:bg-cyan-500/12 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-sky-900 dark:text-cyan-300">
                {contacts.length} / {MAX_CONTACTS}
              </span>
            </div>
            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mt-0.5">
              Wallet-scoped whitelisted recipients stored permanently on Arc Mainnet
            </p>
          </div>

          <button
            type="button"
            disabled={isMutating}
            onClick={onClose}
            aria-label="Close address book"
            className="rounded-full p-2 text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 transition disabled:opacity-50"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Action Toolbar & Add/Edit Form */}
        <div className="px-6 py-4 border-b border-slate-200/80 dark:border-white/[0.08] space-y-3">
          {!showForm ? (
            <div className="flex items-center gap-2.5">
              <div className="flex-1 flex items-center gap-2 rounded-2xl border border-slate-300 dark:border-white/12 bg-slate-50 dark:bg-black/45 px-3.5 py-2.5 focus-within:border-sky-700 dark:focus-within:border-cyan-400 transition">
                <SearchIcon size={15} className="text-slate-500 dark:text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by label, .nex, or 0x address..."
                  className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>

              <button
                type="button"
                disabled={isMutating || contacts.length >= MAX_CONTACTS}
                onClick={openAddForm}
                className="nx-btn-primary inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-xs font-black shrink-0"
              >
                <PlusIcon size={14} />
                <span>Add</span>
              </button>

              <button
                type="button"
                disabled={loading || isMutating}
                onClick={() => void onRefreshContacts(true)}
                aria-label="Refresh on-chain contacts"
                className="rounded-2xl p-2.5 border border-slate-300 dark:border-white/12 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition disabled:opacity-50"
              >
                {loading ? <RadarSpinner size={15} /> : <RefreshCwIcon size={15} />}
              </button>
            </div>
          ) : (
            <div className="nx-enter rounded-2xl border border-slate-300 dark:border-cyan-500/30 bg-[#eef2f6] dark:bg-black/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  {editingRecipient ? "Edit On-Chain Contact" : "New Whitelisted Contact"}
                </span>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => {
                    setShowForm(false);
                    setEditingRecipient(null);
                  }}
                  className="text-xs font-bold text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-1 block">
                  Contact Label (1–64 chars)
                </label>
                <input
                  type="text"
                  maxLength={64}
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  placeholder="e.g. Treasury Vault, Alice Payroll, Vendor Desk"
                  className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-sky-700 dark:border-white/12 dark:bg-black/50 dark:text-white dark:focus:border-cyan-400 px-3.5 py-2.5 text-sm font-semibold focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-400 mb-1 block">
                  Recipient (0x Address or .nex Domain)
                </label>
                <input
                  type="text"
                  value={recipientInput}
                  disabled={Boolean(editingRecipient)}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  placeholder="0x... or name.nex"
                  className="w-full rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-sky-700 dark:border-white/12 dark:bg-black/50 dark:text-white dark:focus:border-cyan-400 px-3.5 py-2.5 font-mono text-xs sm:text-sm focus:outline-none disabled:opacity-65"
                />

                {/* Live Forward/Reverse Verification Preview */}
                {recipientInput.trim() && (
                  <div className="mt-2">
                    {resolvingTarget ? (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-800 dark:text-cyan-300">
                        <RadarSpinner size={12} />
                        <span>Verifying address &amp; .nex record on Arc Mainnet...</span>
                      </div>
                    ) : resolvedTarget?.valid && resolvedTarget.address ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-600/35 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-950 dark:text-emerald-200">
                        <ShieldCheckIcon size={13} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                        <span className="font-mono">
                          {resolvedTarget.address.slice(0, 10)}…{resolvedTarget.address.slice(-8)}
                        </span>
                        {resolvedTarget.domain && (
                          <span className="rounded bg-emerald-200/80 dark:bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-black text-emerald-900 dark:text-emerald-200">
                            {resolvedTarget.domain}
                          </span>
                        )}
                      </div>
                    ) : resolvedTarget && !resolvedTarget.valid ? (
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-400">
                        <AlertTriangleIcon size={13} />
                        <span>{resolvedTarget.error ?? "Invalid recipient."}</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => void handleSaveContact()}
                disabled={
                  chainLocked ||
                  isMutating ||
                  resolvingTarget ||
                  !labelInput.trim() ||
                  !recipientInput.trim() ||
                  Boolean(resolvedTarget && !resolvedTarget.valid)
                }
                className="nx-btn-primary inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs sm:text-sm font-black"
              >
                {isMutating ? (
                  <>
                    <RadarSpinner size={15} />
                    <span>Saving On-Chain...</span>
                  </>
                ) : chainLocked ? (
                  "Wrong Network (Switch to 5042)"
                ) : (
                  <>
                    <CheckIcon size={15} />
                    <span>{editingRecipient ? "Update Contact On-Chain" : "Save Contact On-Chain"}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {isMutating && txLifecycle && (
            <TxLifecycleStepper
              steps={txLifecycle.steps}
              explorerUrl={ARC_EXPLORER}
              compact
            />
          )}
        </div>

        {/* Saved Contacts List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && contacts.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-slate-600 dark:text-slate-400">
              <RadarSpinner size={22} />
              <span className="text-xs font-bold">Loading on-chain contacts...</span>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="py-10 px-4 text-center flex flex-col items-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400">
                <BookUserIcon size={22} />
              </div>
              <div className="text-sm font-black text-slate-900 dark:text-white">
                {contacts.length === 0 ? "No Saved Contacts Yet" : "No Contacts Match Filter"}
              </div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mt-1 max-w-xs">
                {contacts.length === 0
                  ? "Whitelist trusted treasury recipients and .nex domains on-chain for instant autocomplete in Single and Batch transfers."
                  : "Adjust your search query to find another whitelisted contact."}
              </p>
              {contacts.length === 0 && !showForm && (
                <button
                  type="button"
                  onClick={openAddForm}
                  className="nx-btn-primary mt-4 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-black"
                >
                  <PlusIcon size={14} />
                  <span>Add First Contact</span>
                </button>
              )}
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const isConfirmingDel =
                confirmDeleteAddr?.toLowerCase() === contact.recipient.toLowerCase();
              const initials =
                contact.label
                  .split(/\s+/)
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "NX";

              return (
                <div
                  key={contact.recipient}
                  className="rounded-2xl border border-slate-300 dark:border-white/[0.08] bg-slate-50/90 dark:bg-[#0B192E]/75 p-3.5 transition hover:border-sky-600/45 dark:hover:border-cyan-400/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-600 to-cyan-500 text-xs font-black text-white shadow-xs">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                            {contact.label}
                          </span>
                          <span className="inline-flex items-center gap-0.5 rounded-md border border-emerald-600/35 bg-emerald-100/90 dark:border-emerald-500/30 dark:bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                            <ShieldCheckIcon size={10} />
                            <span>Whitelisted</span>
                          </span>
                        </div>

                        {contact.domain && (
                          <div className="text-xs font-extrabold text-sky-800 dark:text-cyan-300 mt-0.5 truncate">
                            {contact.domain}
                          </div>
                        )}

                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="nx-num font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            {contact.recipient.slice(0, 10)}…{contact.recipient.slice(-8)}
                          </span>
                          <CopyButton
                            value={contact.recipient}
                            size="xs"
                            variant="ghost"
                            ariaLabel={`Copy ${contact.label} address`}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onSelectContact && !isConfirmingDel && (
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => {
                            onSelectContact(contact);
                            onClose();
                          }}
                          className="nx-btn-primary rounded-xl px-3 py-1.5 text-[11px] font-black"
                        >
                          Use
                        </button>
                      )}

                      {!isConfirmingDel ? (
                        <>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => openEditForm(contact)}
                            aria-label={`Edit ${contact.label}`}
                            className="rounded-xl p-2 border border-slate-300 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition disabled:opacity-45"
                          >
                            <EditIcon size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => setConfirmDeleteAddr(contact.recipient)}
                            aria-label={`Delete ${contact.label}`}
                            className="rounded-xl p-2 border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-600 hover:text-white dark:hover:bg-rose-500 dark:hover:text-white transition disabled:opacity-45"
                          >
                            <TrashIcon size={13} />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => void handleRemoveContact(contact)}
                            className="rounded-xl bg-rose-600 hover:bg-rose-700 px-2.5 py-1.5 text-[11px] font-black text-white transition"
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => setConfirmDeleteAddr(null)}
                            className="rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300"
                          >
                            Keep
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
