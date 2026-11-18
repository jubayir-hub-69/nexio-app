"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  CloseIcon,
  CopyButton,
  ExternalLinkIcon,
  RadarSpinner,
} from "./Icons";

export type TxStepStatus =
  | "upcoming"
  | "simulating"
  | "awaiting_wallet"
  | "confirming_block"
  | "completed"
  | "failed";

export type TxStepItem = {
  id: string;
  title: string;
  subtitle?: string;
  spender?: string;
  txHash?: string;
  status: TxStepStatus;
};

export type TxLifecycleState = {
  id?: string;
  operationTitle: string;
  amountSummary?: string;
  steps: TxStepItem[];
  confirmed?: boolean;
  failed?: boolean;
  errorMessage?: string;
  txHash?: string;
  blockNumber?: number | null;
  chainId?: number;
  explorerUrl?: string;
};

export function FinalityCheckSeal({
  size = 28,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 ${className}`.trim()}
    >
      <circle
        cx="16"
        cy="16"
        r="12"
        stroke="#059669"
        strokeWidth="1.75"
        className="nx-finality-halo"
      />
      <circle
        cx="16"
        cy="16"
        r="12"
        fill="rgba(16, 185, 129, 0.18)"
        stroke="#059669"
        strokeWidth="1.75"
      />
      <path
        d="M10.5 16.4 14.2 20.1 21.8 12.2"
        stroke="#059669"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="nx-check-path dark:stroke-emerald-400"
      />
    </svg>
  );
}

function shortHex(hex?: string, lead = 6, tail = 4): string {
  if (!hex) return "";
  return hex.length > lead + tail + 2 ? `${hex.slice(0, lead)}...${hex.slice(-tail)}` : hex;
}

function statusBadgeLabel(status: TxStepStatus): string {
  switch (status) {
    case "simulating":
      return "Simulating";
    case "awaiting_wallet":
      return "Sign in Wallet";
    case "confirming_block":
      return "1-Block Wait";
    case "completed":
      return "Confirmed";
    case "failed":
      return "Reverted";
    default:
      return "Queued";
  }
}

export type TxLifecycleStepperProps = {
  steps: TxStepItem[];
  explorerUrl?: string;
  compact?: boolean;
  theme?: "dark" | "light";
  className?: string;
};

export function TxLifecycleStepper({
  steps,
  explorerUrl = "https://explorer.arc.io",
  compact = false,
  theme,
  className = "",
}: TxLifecycleStepperProps) {
  if (!steps.length) return null;

  return (
    <ol
      data-theme={theme}
      aria-label="Transaction progress"
      className={`space-y-2.5 ${className}`.trim()}
    >
      {steps.map((step, index) => {
        const isActive =
          step.status === "simulating" ||
          step.status === "awaiting_wallet" ||
          step.status === "confirming_block";
        const isCompleted = step.status === "completed";
        const isFailed = step.status === "failed";

        const rowTone = isFailed
          ? "border-rose-500/45 bg-rose-50 dark:bg-rose-500/[0.08] text-rose-950 dark:text-rose-100"
          : isCompleted
            ? "border-emerald-600/35 dark:border-emerald-500/25 bg-emerald-50/90 dark:bg-emerald-500/[0.07] text-slate-900 dark:text-slate-100"
            : isActive
              ? "border-sky-600/40 dark:border-cyan-500/35 bg-sky-50/90 dark:bg-cyan-500/[0.08] text-slate-900 dark:text-white shadow-[0_0_20px_rgba(2,132,199,0.1)]"
              : "border-slate-300 dark:border-white/[0.08] bg-slate-100 dark:bg-white/[0.02] text-slate-700 dark:text-slate-400";

        return (
          <li
            key={step.id}
            className={`relative flex items-start gap-3 rounded-xl border ${
              compact ? "px-3 py-2" : "px-3.5 py-2.5"
            } transition-colors duration-200 ${rowTone}`}
          >
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
              {isCompleted ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600/15 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400">
                  <CheckIcon size={13} />
                </span>
              ) : isFailed ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-600/15 dark:bg-rose-500/20 text-rose-800 dark:text-rose-400">
                  <AlertTriangleIcon size={14} />
                </span>
              ) : step.status === "awaiting_wallet" ? (
                <span className="relative flex h-5 w-5 items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-sky-500/35 dark:bg-cyan-400/35 animate-ping" />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-sky-700 dark:bg-cyan-400" />
                </span>
              ) : isActive ? (
                <RadarSpinner size={17} className="text-sky-700 dark:text-cyan-400" />
              ) : (
                <span className="nx-num flex h-5 w-5 items-center justify-center rounded-full border border-slate-400 dark:border-white/15 text-[10px] font-black text-slate-700 dark:text-slate-300">
                  {index + 1}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-extrabold tracking-tight">{step.title}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                    isFailed
                      ? "bg-rose-200/90 dark:bg-rose-500/20 text-rose-900 dark:text-rose-300"
                      : isCompleted
                        ? "bg-emerald-200/80 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-300"
                        : isActive
                          ? "bg-sky-200/80 dark:bg-cyan-500/15 text-sky-950 dark:text-cyan-300"
                          : "bg-slate-200 dark:bg-white/5 text-slate-700 dark:text-slate-400"
                  }`}
                >
                  {statusBadgeLabel(step.status)}
                </span>
              </div>

              {(step.subtitle || step.spender || step.txHash) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-700 dark:text-slate-300/85">
                  {step.subtitle && <span>{step.subtitle}</span>}
                  {step.spender && (
                    <span className="font-mono text-[10px] rounded border border-slate-300 dark:border-white/10 bg-white dark:bg-black/40 px-1.5 py-0.5 text-slate-800 dark:text-cyan-300">
                      Spender {shortHex(step.spender)}
                    </span>
                  )}
                  {step.txHash && (
                    <a
                      href={`${explorerUrl.replace(/\/$/, "")}/tx/${step.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-sky-800 dark:text-cyan-300 hover:underline"
                    >
                      <span>{shortHex(step.txHash)}</span>
                      <ExternalLinkIcon size={11} />
                    </a>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export type ExplorerReceiptDrawerProps = {
  state: TxLifecycleState | null;
  onDismiss: () => void;
  autoCollapseMs?: number;
  theme?: "dark" | "light";
};

export function ExplorerReceiptDrawer({
  state,
  onDismiss,
  autoCollapseMs = 8000,
  theme,
}: ExplorerReceiptDrawerProps) {
  const [paused, setPaused] = useState(false);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const elapsedRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const isConfirmed = Boolean(state?.confirmed && !state?.failed);
  const stateKey = state ? `${state.id ?? state.operationTitle}:${state.txHash ?? ""}:${isConfirmed}` : "";

  useEffect(() => {
    elapsedRef.current = 0;
    lastTickRef.current = null;
    if (progressBarRef.current) {
      progressBarRef.current.style.transform = "scaleX(1)";
    }
  }, [stateKey]);

  useEffect(() => {
    if (!state || !isConfirmed || autoCollapseMs <= 0) return;

    let rafId = 0;
    const tick = (now: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = now;
      }
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;

      if (!pausedRef.current) {
        elapsedRef.current += delta;
        const remaining = Math.max(0, 1 - elapsedRef.current / autoCollapseMs);
        if (progressBarRef.current) {
          progressBarRef.current.style.transform = `scaleX(${remaining.toFixed(4)})`;
        }
        if (elapsedRef.current >= autoCollapseMs) {
          onDismissRef.current();
          return;
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [state, isConfirmed, autoCollapseMs, stateKey]);

  if (!state) return null;

  const explorerBase = (state.explorerUrl || "https://explorer.arc.io").replace(/\/$/, "");
  const chainId = state.chainId ?? 5042;

  return (
    <aside
      data-theme={theme}
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="nx-enter fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[24.5rem] rounded-2xl border border-slate-300 dark:border-white/12 bg-white dark:bg-[#071120]/95 backdrop-blur-xl shadow-[0_20px_50px_-12px_rgba(15,23,42,0.28)] dark:shadow-[0_20px_50px_-12px_rgba(2,6,23,0.65)] overflow-hidden text-slate-900 dark:text-slate-100"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {isConfirmed ? (
              <FinalityCheckSeal size={28} />
            ) : state.failed ? (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-500/15 text-rose-800 dark:text-rose-400 border border-rose-400 dark:border-rose-500/30">
                <AlertTriangleIcon size={16} />
              </span>
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 dark:bg-cyan-500/15 text-sky-800 dark:text-cyan-400 border border-sky-400 dark:border-cyan-500/30">
                <RadarSpinner size={16} />
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-black tracking-tight text-slate-900 dark:text-white">
                {state.operationTitle}
              </div>
              <div className="nx-num flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                <span>Arc Mainnet · {chainId}</span>
                {state.blockNumber != null && state.blockNumber > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-emerald-800 dark:text-emerald-300">Block #{state.blockNumber}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss transaction receipt"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition active:scale-95"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {state.amountSummary && (
          <div className="nx-num mt-2.5 rounded-xl border border-slate-300 dark:border-white/[0.07] bg-slate-100 dark:bg-black/35 px-3 py-2 text-xs font-extrabold text-slate-900 dark:text-cyan-100">
            {state.amountSummary}
          </div>
        )}

        <div className="mt-3">
          <TxLifecycleStepper steps={state.steps} explorerUrl={explorerBase} compact theme={theme} />
        </div>

        {state.failed && state.errorMessage && (
          <div className="mt-3 rounded-xl border border-rose-400 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-900 dark:text-rose-200 leading-relaxed">
            {state.errorMessage}
          </div>
        )}

        {state.txHash && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-300/80 dark:border-white/[0.08] pt-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Transaction Hash
              </div>
              <div className="font-mono text-xs font-bold text-slate-900 dark:text-slate-200 truncate">
                {shortHex(state.txHash, 8, 6)}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <CopyButton value={state.txHash} label="Copy" size="xs" theme={theme} />
              <a
                href={`${explorerBase}/tx/${state.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-sky-600/40 dark:border-cyan-500/35 bg-sky-100 dark:bg-cyan-500/12 px-2.5 py-1 text-[11px] font-bold text-sky-900 dark:text-cyan-300 hover:bg-sky-200/80 dark:hover:bg-cyan-500/20 transition active:scale-95"
              >
                <span>Explorer</span>
                <ExternalLinkIcon size={12} />
              </a>
            </div>
          </div>
        )}
      </div>

      {isConfirmed && autoCollapseMs > 0 && (
        <div className="h-1 w-full bg-slate-200 dark:bg-white/[0.06]">
          <div
            ref={progressBarRef}
            className="h-full origin-left bg-emerald-600 dark:bg-emerald-500 transition-none"
            style={{ transform: "scaleX(1)" }}
          />
        </div>
      )}
    </aside>
  );
}

export function TxHeaderStatusPill({
  state,
  onClick,
  theme,
}: {
  state: TxLifecycleState | null;
  onClick?: () => void;
  theme?: "dark" | "light";
}) {
  if (!state) return null;
  const isConfirmed = Boolean(state.confirmed && !state.failed);
  const activeStep = state.steps.find(
    (s) => s.status === "simulating" || s.status === "awaiting_wallet" || s.status === "confirming_block"
  );

  return (
    <button
      type="button"
      data-theme={theme}
      onClick={onClick}
      className={`nx-num inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold tracking-tight transition active:scale-95 ${
        state.failed
          ? "border-rose-500/45 bg-rose-100 dark:bg-rose-500/12 text-rose-900 dark:text-rose-200"
          : isConfirmed
            ? "border-emerald-600/40 dark:border-emerald-500/35 bg-emerald-100 dark:bg-emerald-500/12 text-emerald-900 dark:text-emerald-200"
            : "border-sky-600/40 dark:border-cyan-500/35 bg-sky-100 dark:bg-cyan-500/12 text-sky-950 dark:text-cyan-200"
      }`}
    >
      {state.failed ? (
        <AlertTriangleIcon size={12} />
      ) : isConfirmed ? (
        <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
      ) : (
        <RadarSpinner size={12} />
      )}
      <span className="max-w-[160px] truncate">
        {state.failed ? "Tx Failed" : isConfirmed ? "Finalized" : activeStep?.title ?? state.operationTitle}
      </span>
    </button>
  );
}
