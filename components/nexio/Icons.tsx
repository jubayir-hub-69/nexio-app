"use client";

import React, { useEffect, useRef, useState } from "react";

export type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: number;
};

function baseProps(size = 18, props?: React.SVGProps<SVGSVGElement>): React.SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

export function ShieldCheckIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M12 2.75 4.75 5.75v5.6c0 4.65 3.08 8.94 7.25 10.15 4.17-1.21 7.25-5.5 7.25-10.15v-5.6L12 2.75Z" />
      <path d="m9 12.25 2.1 2.1 4.15-4.35" />
    </svg>
  );
}

export function SunIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.25M12 19.25v2.25M4.93 4.93l1.6 1.6M17.47 17.47l1.6 1.6M2.5 12h2.25M19.25 12h2.25M4.93 19.07l1.6-1.6M17.47 6.53l1.6-1.6" />
    </svg>
  );
}

export function MoonIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M20.25 14.35A8.25 8.25 0 0 1 9.65 3.75a8.25 8.25 0 1 0 10.6 10.6Z" />
    </svg>
  );
}

export function ArrowUpRightIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M7 17 17 7" />
      <path d="M8.5 7H17v8.5" />
    </svg>
  );
}

export function ExternalLinkIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M14 4.75h5.25V10" />
      <path d="M19.25 4.75 11 13" />
      <path d="M10.5 6.25H6.75a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V13.5" />
    </svg>
  );
}

export function RadarSpinner({ size = 16, className = "", ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`animate-spin shrink-0 ${className}`.trim()}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.4"
        className="opacity-20"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.1" fill="currentColor" className="opacity-65" />
    </svg>
  );
}

export function CloseIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M6.5 6.5 17.5 17.5" />
      <path d="M17.5 6.5 6.5 17.5" />
    </svg>
  );
}

export function SwapFlipIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M8.5 4.75v13.5" />
      <path d="m5.25 8 3.25-3.25L11.75 8" />
      <path d="M15.5 19.25V5.75" />
      <path d="m12.25 16 3.25 3.25L18.75 16" />
    </svg>
  );
}

export function AlertTriangleIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M10.34 4.18a1.92 1.92 0 0 1 3.32 0l7.2 12.66a1.9 1.9 0 0 1-1.66 2.84H4.8a1.9 1.9 0 0 1-1.66-2.84l7.2-12.66Z" />
      <path d="M12 9.25v4.25" />
      <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function LockIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <rect x="4.75" y="10.75" width="14.5" height="9.5" rx="2.25" />
      <path d="M8 10.75V7.5a4 4 0 0 1 8 0v3.25" />
    </svg>
  );
}

export function CheckIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="m5.25 12.5 4.35 4.35 9.15-9.35" />
    </svg>
  );
}

export function CopyIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <rect x="8.75" y="8.75" width="10.5" height="10.5" rx="2" />
      <path d="M6 15.25H5.5a1.75 1.75 0 0 1-1.75-1.75v-8A1.75 1.75 0 0 1 5.5 3.75h8A1.75 1.75 0 0 1 15.25 5.5V6" />
    </svg>
  );
}

export function QrCodeIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <rect x="3.75" y="3.75" width="6.5" height="6.5" rx="1.25" />
      <rect x="13.75" y="3.75" width="6.5" height="6.5" rx="1.25" />
      <rect x="3.75" y="13.75" width="6.5" height="6.5" rx="1.25" />
      <path d="M14 14h2.5v2.5H14zM17.75 14h2.5v2.5h-2.5zM14 17.75h2.5v2.5H14zM17.75 17.75h2.5v2.5h-2.5z" />
    </svg>
  );
}

export function SparklesSealIcon({ size = 20, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M12 2.75 14.8 4.6l3.3-.2.95 3.15 2.7 1.95-1.15 3.1 1.15 3.1-2.7 1.95-.95 3.15-3.3-.2L12 21.25l-2.8-1.85-3.3.2-.95-3.15-2.7-1.95 1.15-3.1-1.15-3.1 2.7-1.95.95-3.15 3.3.2L12 2.75Z" />
      <path d="m9.25 12.2 1.95 1.95 3.8-3.95" />
    </svg>
  );
}

export function HistoryEmptyIcon({ size = 28, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v4.75l3 1.75" />
      <path d="M3.5 12h1.5M19 12h1.5" />
    </svg>
  );
}

export function PassBadgeIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <rect x="3.25" y="5.25" width="17.5" height="13.5" rx="2.75" />
      <circle cx="8.75" cy="11.25" r="2" />
      <path d="M6.25 15.75c.6-1.35 1.5-2 2.5-2s1.9.65 2.5 2" />
      <path d="M13.75 9.75h4M13.75 12.75h3" />
    </svg>
  );
}

export function SearchIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <circle cx="11" cy="11" r="6.75" />
      <path d="m16 16 4.25 4.25" />
    </svg>
  );
}

export function RefreshCwIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M20.25 11A8.25 8.25 0 0 0 5.9 6.4L3.75 8.5" />
      <path d="M3.75 4.25V8.5H8" />
      <path d="M3.75 13a8.25 8.25 0 0 0 14.35 4.6l2.15-2.1" />
      <path d="M20.25 19.75V15.5H16" />
    </svg>
  );
}

export function SendArrowIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M4.5 19.5 19.5 4.5" />
      <path d="M8.25 4.5H19.5v11.25" />
    </svg>
  );
}

export function ReceiveArrowIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M19.5 4.5 4.5 19.5" />
      <path d="M15.75 19.5H4.5V8.25" />
    </svg>
  );
}

export function LinkIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M10 13a4.5 4.5 0 0 0 6.36 0l2.47-2.47a4.5 4.5 0 0 0-6.36-6.36L11 5.64" />
      <path d="M14 11a4.5 4.5 0 0 0-6.36 0l-2.47 2.47a4.5 4.5 0 0 0 6.36 6.36L13 18.36" />
    </svg>
  );
}

export function BookUserIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M4.75 4.5A2.25 2.25 0 0 1 7 2.25h11.25a1.5 1.5 0 0 1 1.5 1.5v16.5a1.5 1.5 0 0 1-1.5 1.5H7a2.25 2.25 0 0 1-2.25-2.25V4.5Z" />
      <circle cx="12.5" cy="9.75" r="2.25" />
      <path d="M8.75 16.5c.75-1.75 2.15-2.75 3.75-2.75s3 1 3.75 2.75" />
      <path d="M2.75 7.5h2M2.75 12h2M2.75 16.5h2" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="m6.5 9.25 5.5 5.5 5.5-5.5" />
    </svg>
  );
}

export function PlusIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function TrashIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M4.25 6.5h15.5" />
      <path d="M9.5 6.5V4.75a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V6.5" />
      <path d="M6.25 6.5 7.2 19a1.75 1.75 0 0 0 1.75 1.62h6.1A1.75 1.75 0 0 0 16.8 19l.95-12.5" />
      <path d="M10.25 10.5v5.5M13.75 10.5v5.5" />
    </svg>
  );
}

export function EditIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M14.5 4.75 19.25 9.5 9.25 19.5H4.5v-4.75l10-10Z" />
      <path d="m12.75 6.5 4.75 4.75" />
    </svg>
  );
}

export function DownloadIcon({ size = 15, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M12 4.25v10.5" />
      <path d="m7.75 10.75 4.25 4.25 4.25-4.25" />
      <path d="M4.5 17.25v1.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
    </svg>
  );
}

export function TrendingUpIcon({ size = 16, ...props }: IconProps) {
  return (
    <svg {...baseProps(size, props)}>
      <path d="M3.75 16.75 9.5 11l3.75 3.75 7-7.5" />
      <path d="M15.25 7.25h5v5" />
    </svg>
  );
}

export function NexioMarkIcon({ size = 24, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id="nx-mark-grad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="55%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="#050B14" stroke="url(#nx-mark-grad)" strokeWidth="1.5" />
      <path
        d="M9.5 23V9.5L22.5 22.5V9"
        stroke="url(#nx-mark-grad)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type CopyButtonProps = {
  value: string;
  label?: string;
  copiedLabel?: string;
  onCopied?: (value: string) => void;
  className?: string;
  size?: "xs" | "sm" | "md";
  variant?: "ghost" | "subtle" | "solid";
  ariaLabel?: string;
  theme?: "dark" | "light";
};

export function CopyButton({
  value,
  label,
  copiedLabel = "Copied",
  onCopied,
  className = "",
  size = "sm",
  variant = "subtle",
  ariaLabel,
  theme,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!value) return;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else if (typeof document !== "undefined") {
        const el = document.createElement("textarea");
        el.value = value;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      onCopied?.(value);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard permission denials cleanly
    }
  };

  const sizeClass =
    size === "xs"
      ? "px-2 py-1 text-[11px] rounded-lg gap-1"
      : size === "md"
        ? "px-4 py-2.5 text-sm rounded-xl gap-2"
        : "px-3 py-1.5 text-xs rounded-xl gap-1.5";

  const iconSize = size === "xs" ? 13 : size === "md" ? 16 : 14;

  const variantClass = copied
    ? "border border-emerald-600/45 dark:border-emerald-500/40 bg-emerald-100 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-300"
    : variant === "solid"
      ? "nx-btn-primary text-white"
      : variant === "ghost"
        ? "border border-transparent hover:bg-slate-200/80 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300"
        : "border border-slate-300 dark:border-white/12 bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/12 text-slate-900 dark:text-slate-200";

  return (
    <button
      type="button"
      data-theme={theme}
      onClick={handleCopy}
      aria-label={ariaLabel ?? (copied ? copiedLabel : label ?? "Copy to clipboard")}
      className={`inline-flex items-center justify-center font-bold tracking-wide transition-all duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-cyan-400 focus-visible:outline-offset-2 ${sizeClass} ${variantClass} ${className}`.trim()}
    >
      {copied ? (
        <>
          <CheckIcon size={iconSize} />
          {label !== undefined ? <span>{copiedLabel} ✓</span> : <span className="sr-only">{copiedLabel}</span>}
        </>
      ) : (
        <>
          <CopyIcon size={iconSize} />
          {label !== undefined && <span>{label}</span>}
        </>
      )}
    </button>
  );
}
