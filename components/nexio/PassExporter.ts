/**
 * Deterministic high-DPI HTML5 <canvas> 2D Nexio Pass PNG renderer.
 * Mirrors HoloPassCard 1:1 with exact ISO/IEC 7810 ID-1 1.586:1 bank-card proportions,
 * 24px corner radius, tier-matched metallic gradients, blue-gradient `.nex` suffix,
 * conditional blue verification checkmark, streak readout, and next-tier progress bar.
 */

export type ExportNexioPassOptions = {
  domain: string;
  wallet: string;
  streak: number;
  verified?: boolean;
  logoSrc?: string;
  scale?: number;
  filename?: string;
};

type PassTierPalette = {
  tierBadge: string;
  bgStops: readonly [string, string, string];
  orbTopRight: string;
  orbBottomLeft: string;
  borderStroke: string;
  pillBg: string;
  pillBorder: string;
  pillText: string;
  barStart: string;
  barEnd: string;
  nextTarget: number | null;
  isVip: boolean;
};

function getPassTierPalette(streak: number): PassTierPalette {
  const days = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
  if (days >= 180) {
    return {
      tierBadge: "VIP",
      bgStops: ["#1a1106", "#422b0e", "#734c16"],
      orbTopRight: "rgba(251, 191, 36, 0.34)",
      orbBottomLeft: "rgba(217, 119, 6, 0.24)",
      borderStroke: "rgba(253, 224, 71, 0.38)",
      pillBg: "rgba(251, 191, 36, 0.18)",
      pillBorder: "rgba(253, 224, 71, 0.45)",
      pillText: "#fde68a",
      barStart: "#fbbf24",
      barEnd: "#f59e0b",
      nextTarget: null,
      isVip: true,
    };
  }
  if (days >= 90) {
    return {
      tierBadge: "TIER 2",
      bgStops: ["#130829", "#2a1359", "#431c85"],
      orbTopRight: "rgba(192, 132, 252, 0.32)",
      orbBottomLeft: "rgba(129, 140, 248, 0.24)",
      borderStroke: "rgba(216, 180, 254, 0.34)",
      pillBg: "rgba(168, 85, 247, 0.2)",
      pillBorder: "rgba(216, 180, 254, 0.42)",
      pillText: "#e9d5ff",
      barStart: "#c084fc",
      barEnd: "#818cf8",
      nextTarget: 180,
      isVip: false,
    };
  }
  if (days >= 30) {
    return {
      tierBadge: "TIER 1",
      bgStops: ["#041a1f", "#093640", "#0d545b"],
      orbTopRight: "rgba(45, 212, 191, 0.30)",
      orbBottomLeft: "rgba(16, 185, 129, 0.22)",
      borderStroke: "rgba(94, 234, 212, 0.32)",
      pillBg: "rgba(20, 184, 166, 0.2)",
      pillBorder: "rgba(94, 234, 212, 0.42)",
      pillText: "#99f6e4",
      barStart: "#2dd4bf",
      barEnd: "#34d399",
      nextTarget: 90,
      isVip: false,
    };
  }
  return {
    tierBadge: "MEMBER",
    bgStops: ["#061229", "#0c2859", "#0b3c82"],
    orbTopRight: "rgba(56, 189, 248, 0.30)",
    orbBottomLeft: "rgba(37, 99, 235, 0.24)",
    borderStroke: "rgba(125, 211, 252, 0.30)",
    pillBg: "rgba(56, 189, 248, 0.16)",
    pillBorder: "rgba(125, 211, 252, 0.38)",
    pillText: "#bae6fd",
    barStart: "#38bdf8",
    barEnd: "#60a5fa",
    nextTarget: 30,
    isVip: false,
  };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function loadOptionalImage(src: string, timeoutMs = 2500): Promise<HTMLImageElement | null> {
  if (typeof window === "undefined" || !src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      finish(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    img.src = src;
  });
}

function drawNexioFallbackMark(ctx: CanvasRenderingContext2D, x: number, y: number, boxSize: number) {
  const grad = ctx.createLinearGradient(x, y, x + boxSize, y + boxSize);
  grad.addColorStop(0, "#f8fafc");
  grad.addColorStop(0.55, "#38bdf8");
  grad.addColorStop(1, "#2563eb");

  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(2, boxSize * 0.1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pad = boxSize * 0.26;
  ctx.beginPath();
  ctx.moveTo(x + pad, y + boxSize - pad);
  ctx.lineTo(x + pad, y + pad);
  ctx.lineTo(x + boxSize - pad, y + boxSize - pad);
  ctx.lineTo(x + boxSize - pad, y + pad);
  ctx.stroke();
  ctx.restore();
}

function drawBlueVerifiedBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  ctx.save();
  const badgeGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  badgeGrad.addColorStop(0, "#38bdf8");
  badgeGrad.addColorStop(1, "#2563eb");
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = badgeGrad;
  ctx.fill();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1.8, radius * 0.2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.42, cy + radius * 0.04);
  ctx.lineTo(cx - radius * 0.1, cy + radius * 0.36);
  ctx.lineTo(cx + radius * 0.46, cy - radius * 0.32);
  ctx.stroke();
  ctx.restore();
}

export async function renderNexioPassCanvas({
  domain,
  wallet,
  streak,
  verified = false,
  logoSrc = "/nexio-logo.jpg",
  scale = 3,
}: ExportNexioPassOptions): Promise<HTMLCanvasElement> {
  if (typeof document === "undefined") {
    throw new Error("Canvas rendering requires a browser environment.");
  }

  // Exact 1.586:1 ISO/IEC 7810 ID-1 fintech bank card ratio with 24px radius
  const baseW = 476;
  const baseH = 300;
  const dpr = Math.max(1, Math.min(4, scale));
  const safeStreak = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
  const palette = getPassTierPalette(safeStreak);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(baseW * dpr);
  canvas.height = Math.round(baseH * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable.");

  ctx.scale(dpr, dpr);

  // 1. Card Base Clip (24px radius) & Tier-Matched Metallic Gradient
  ctx.save();
  drawRoundedRect(ctx, 0, 0, baseW, baseH, 24);
  ctx.clip();

  const bgGrad = ctx.createLinearGradient(0, 0, baseW, baseH);
  bgGrad.addColorStop(0, palette.bgStops[0]);
  bgGrad.addColorStop(0.52, palette.bgStops[1]);
  bgGrad.addColorStop(1, palette.bgStops[2]);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, baseW, baseH);

  // 2. Ambient Fintech Lighting Orbs
  const topOrb = ctx.createRadialGradient(baseW * 0.85, baseH * 0.14, 6, baseW * 0.85, baseH * 0.14, 210);
  topOrb.addColorStop(0, palette.orbTopRight);
  topOrb.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = topOrb;
  ctx.fillRect(0, 0, baseW, baseH);

  const bottomOrb = ctx.createRadialGradient(baseW * 0.12, baseH * 0.92, 6, baseW * 0.12, baseH * 0.92, 185);
  bottomOrb.addColorStop(0, palette.orbBottomLeft);
  bottomOrb.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = bottomOrb;
  ctx.fillRect(0, 0, baseW, baseH);

  // 3. Subtle Metallic Sheen Diagonal Band
  const sheen = ctx.createLinearGradient(40, 0, baseW - 30, baseH);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0)");
  sheen.addColorStop(0.44, "rgba(255, 255, 255, 0.055)");
  sheen.addColorStop(0.5, "rgba(255, 255, 255, 0.09)");
  sheen.addColorStop(0.56, "rgba(255, 255, 255, 0.04)");
  sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, baseW, baseH);

  const padX = 28;

  // 4. Top Row — Official Nexio Logo + Wordmark (Left) & Minimal Tier Pill (Right)
  const logoBox = 38;
  drawRoundedRect(ctx, padX, 24, logoBox, logoBox, 11);
  ctx.fillStyle = "#000000";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const logoImg = await loadOptionalImage(logoSrc);
  if (logoImg) {
    ctx.save();
    drawRoundedRect(ctx, padX + 2, 26, logoBox - 4, logoBox - 4, 9);
    ctx.clip();
    ctx.drawImage(logoImg, padX + 2, 26, logoBox - 4, logoBox - 4);
    ctx.restore();
  } else {
    drawNexioFallbackMark(ctx, padX, 24, logoBox);
  }

  ctx.fillStyle = "#F8FAFC";
  ctx.font = "900 15px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("NEXIO", padX + logoBox + 11, 43);

  ctx.font = "800 10px system-ui, -apple-system, 'Segoe UI', sans-serif";
  const pillW = Math.max(66, ctx.measureText(palette.tierBadge).width + 24);
  const pillH = 24;
  const pillX = baseW - padX - pillW;
  const pillY = 31;
  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 12);
  ctx.fillStyle = palette.pillBg;
  ctx.fill();
  ctx.strokeStyle = palette.pillBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = palette.pillText;
  ctx.textAlign = "center";
  ctx.fillText(palette.tierBadge, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
  ctx.textAlign = "left";

  // 5. Center Identity Block — Domain (White label + Blue-gradient `.nex` + Conditional Blue Check)
  const cleanDomain = (domain || "nexio").trim().toLowerCase();
  const baseLabel = cleanDomain.endsWith(".nex") ? cleanDomain.slice(0, -4) : cleanDomain;
  const suffix = ".nex";

  let fontPx = 32;
  const maxDomainWidth = baseW - padX * 2 - (verified ? 30 : 0);
  ctx.font = `900 ${fontPx}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  while (ctx.measureText(`${baseLabel}${suffix}`).width > maxDomainWidth && fontPx > 18) {
    fontPx -= 2;
    ctx.font = `900 ${fontPx}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  }

  const labelWidth = ctx.measureText(baseLabel).width;
  const suffixWidth = ctx.measureText(suffix).width;
  const centerY = 142;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(baseLabel, padX, centerY);

  const nexGrad = ctx.createLinearGradient(padX + labelWidth, centerY - fontPx * 0.5, padX + labelWidth + suffixWidth, centerY + fontPx * 0.5);
  nexGrad.addColorStop(0, "#38bdf8");
  nexGrad.addColorStop(0.55, "#60a5fa");
  nexGrad.addColorStop(1, "#22d3ee");
  ctx.fillStyle = nexGrad;
  ctx.fillText(suffix, padX + labelWidth, centerY);

  if (verified) {
    drawBlueVerifiedBadge(ctx, padX + labelWidth + suffixWidth + 16, centerY - 1, 9.5);
  }

  // Shortened Wallet Address (`0x9AFe…d372`)
  const shortWallet =
    wallet && wallet.length >= 10
      ? `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`
      : wallet || "0x0000\u20260000";
  ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillStyle = "rgba(226, 232, 240, 0.78)";
  ctx.fillText(shortWallet, padX, 174);

  // 6. Bottom Footer Divider & Dual Metrics
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, 222);
  ctx.lineTo(baseW - padX, 222);
  ctx.stroke();

  // Bottom Left: DAILY STREAK + 🔥 {n} Days
  ctx.fillStyle = "rgba(226, 232, 240, 0.62)";
  ctx.font = "700 9.5px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("DAILY STREAK", padX, 244);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "800 15px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(`\uD83D\uDD25 ${safeStreak} Days`, padX, 267);

  // Bottom Right: NEXT TIER + Progress Bar (Hidden for VIP)
  if (!palette.isVip && palette.nextTarget !== null) {
    const barW = 166;
    const barH = 7;
    const rightX = baseW - padX;
    const barX = rightX - barW;

    ctx.fillStyle = "rgba(226, 232, 240, 0.62)";
    ctx.font = "700 9.5px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText("NEXT TIER", barX, 244);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(241, 245, 249, 0.9)";
    ctx.font = "800 10.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(`${safeStreak}/${palette.nextTarget}D`, rightX, 244);
    ctx.textAlign = "left";

    // Progress Bar Track
    drawRoundedRect(ctx, barX, 262, barW, barH, 3.5);
    ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
    ctx.fill();

    // Progress Bar Fill
    const ratio = Math.min(1, Math.max(0, safeStreak / palette.nextTarget));
    if (ratio > 0) {
      const fillW = Math.max(7, Math.round(barW * ratio));
      drawRoundedRect(ctx, barX, 262, fillW, barH, 3.5);
      const barGrad = ctx.createLinearGradient(barX, 262, barX + fillW, 262);
      barGrad.addColorStop(0, palette.barStart);
      barGrad.addColorStop(1, palette.barEnd);
      ctx.fillStyle = barGrad;
      ctx.fill();
    }
  } else {
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(253, 230, 138, 0.72)";
    ctx.font = "700 9.5px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText("TIER STATUS", baseW - padX, 244);

    ctx.fillStyle = "#fde68a";
    ctx.font = "900 15px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText("VIP", baseW - padX, 267);
    ctx.textAlign = "left";
  }

  // 7. Outer Specular Frame (24px radius)
  drawRoundedRect(ctx, 0.75, 0.75, baseW - 1.5, baseH - 1.5, 23.25);
  ctx.strokeStyle = palette.borderStroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
  return canvas;
}

export async function renderNexioPassDataUrl(opts: ExportNexioPassOptions): Promise<string> {
  const canvas = await renderNexioPassCanvas(opts);
  return canvas.toDataURL("image/png", 1);
}

export async function exportNexioPassPng(opts: ExportNexioPassOptions): Promise<void> {
  const canvas = await renderNexioPassCanvas(opts);
  const safeBase = (opts.domain || "nexio")
    .trim()
    .toLowerCase()
    .replace(/\.nex$/i, "")
    .replace(/[^a-z0-9-]/g, "");
  const downloadName = opts.filename || `${safeBase || "nexio"}-pass.png`;

  const triggerDownload = (href: string, revokeAfter = false) => {
    const link = document.createElement("a");
    link.download = downloadName;
    link.href = href;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (revokeAfter) {
      window.setTimeout(() => URL.revokeObjectURL(href), 1500);
    }
  };

  await new Promise<void>((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to encode Nexio Pass PNG."));
            return;
          }
          triggerDownload(URL.createObjectURL(blob), true);
          resolve();
        },
        "image/png",
        1
      );
    } else {
      triggerDownload(canvas.toDataURL("image/png", 1), false);
      resolve();
    }
  });
}
