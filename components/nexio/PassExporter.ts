/**
 * Deterministic high-DPI HTML5 <canvas> 2D Nexio Pass PNG renderer.
 * Eliminates runtime third-party CDN script injection (`dom-to-image`) and
 * avoids Tailwind v4 oklch() / backdrop-filter serialization bugs.
 */

export type ExportNexioPassOptions = {
  domain: string;
  wallet: string;
  streak: number;
  tierName?: string;
  chainId?: number;
  networkLabel?: string;
  contractAddress?: string;
  logoSrc?: string;
  scale?: number;
  filename?: string;
};

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

function drawNexioVectorMark(ctx: CanvasRenderingContext2D, x: number, y: number, boxSize: number) {
  const grad = ctx.createLinearGradient(x, y, x + boxSize, y + boxSize);
  grad.addColorStop(0, "#22d3ee");
  grad.addColorStop(0.55, "#3b82f6");
  grad.addColorStop(1, "#a855f7");

  ctx.save();
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(2, boxSize * 0.095);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pad = boxSize * 0.27;
  ctx.beginPath();
  ctx.moveTo(x + pad, y + boxSize - pad);
  ctx.lineTo(x + pad, y + pad);
  ctx.lineTo(x + boxSize - pad, y + boxSize - pad);
  ctx.lineTo(x + boxSize - pad, y + pad);
  ctx.stroke();
  ctx.restore();
}

export async function renderNexioPassCanvas({
  domain,
  wallet,
  streak,
  tierName,
  chainId = 5042,
  networkLabel = "ARC MAINNET",
  contractAddress,
  logoSrc = "/nexio-logo.png",
  scale = 3,
}: ExportNexioPassOptions): Promise<HTMLCanvasElement> {
  if (typeof document === "undefined") {
    throw new Error("Canvas rendering requires a browser environment.");
  }

  const baseW = 480;
  const baseH = 304; // 1.5789:1 ISO ID-1 identity card ratio
  const dpr = Math.max(1, Math.min(4, scale));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(baseW * dpr);
  canvas.height = Math.round(baseH * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable.");

  ctx.scale(dpr, dpr);

  // 1. Card Base Clip & Obsidian-Navy Gradient
  ctx.save();
  drawRoundedRect(ctx, 0, 0, baseW, baseH, 28);
  ctx.clip();

  const bgGrad = ctx.createLinearGradient(0, 0, baseW, baseH);
  bgGrad.addColorStop(0, "#050B16");
  bgGrad.addColorStop(0.52, "#0A1933");
  bgGrad.addColorStop(1, "#062538");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, baseW, baseH);

  // 2. Ambient Specular Orbs
  const cyanOrb = ctx.createRadialGradient(baseW * 0.82, baseH * 0.16, 8, baseW * 0.82, baseH * 0.16, 210);
  cyanOrb.addColorStop(0, "rgba(6, 182, 212, 0.28)");
  cyanOrb.addColorStop(0.55, "rgba(6, 182, 212, 0.08)");
  cyanOrb.addColorStop(1, "rgba(6, 182, 212, 0)");
  ctx.fillStyle = cyanOrb;
  ctx.fillRect(0, 0, baseW, baseH);

  const emeraldOrb = ctx.createRadialGradient(baseW * 0.16, baseH * 0.92, 6, baseW * 0.16, baseH * 0.92, 180);
  emeraldOrb.addColorStop(0, "rgba(16, 185, 129, 0.2)");
  emeraldOrb.addColorStop(1, "rgba(16, 185, 129, 0)");
  ctx.fillStyle = emeraldOrb;
  ctx.fillRect(0, 0, baseW, baseH);

  // 3. Precision Architectural Grid + Subtle Security Foil Band
  ctx.strokeStyle = "rgba(148, 163, 184, 0.055)";
  ctx.lineWidth = 1;
  for (let x = 24; x < baseW; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, baseH);
    ctx.stroke();
  }
  for (let y = 24; y < baseH; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(baseW, y);
    ctx.stroke();
  }

  const foilGrad = ctx.createLinearGradient(60, 0, baseW - 40, baseH);
  foilGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
  foilGrad.addColorStop(0.42, "rgba(34, 211, 238, 0.06)");
  foilGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
  foilGrad.addColorStop(0.58, "rgba(16, 185, 129, 0.06)");
  foilGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = foilGrad;
  ctx.fillRect(0, 0, baseW, baseH);

  // 4. Header: Brand Badge + ANS Verified Cryptographic Seal
  const padX = 32;
  const logoBox = 40;
  drawRoundedRect(ctx, padX, 28, logoBox, logoBox, 11);
  ctx.fillStyle = "#040913";
  ctx.fill();
  ctx.strokeStyle = "rgba(34, 211, 238, 0.38)";
  ctx.lineWidth = 1.25;
  ctx.stroke();

  const logoImg = await loadOptionalImage(logoSrc);
  if (logoImg) {
    ctx.save();
    drawRoundedRect(ctx, padX + 4, 32, logoBox - 8, logoBox - 8, 7);
    ctx.clip();
    ctx.drawImage(logoImg, padX + 4, 32, logoBox - 8, logoBox - 8);
    ctx.restore();
  } else {
    drawNexioVectorMark(ctx, padX, 28, logoBox);
  }

  ctx.fillStyle = "#F8FAFC";
  ctx.font = "900 18px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("NEXIO PASS", padX + logoBox + 12, 48);

  // Verified Pill (Top Right)
  const pillText = "ANS VERIFIED";
  ctx.font = "800 10px system-ui, -apple-system, 'Segoe UI', sans-serif";
  const pillTextW = ctx.measureText(pillText).width;
  const pillW = pillTextW + 32;
  const pillH = 26;
  const pillX = baseW - padX - pillW;
  const pillY = 35;

  drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 13);
  ctx.fillStyle = "rgba(16, 185, 129, 0.16)";
  ctx.fill();
  ctx.strokeStyle = "rgba(52, 211, 153, 0.42)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Emerald dot + checkmark inside Verified Pill
  ctx.beginPath();
  ctx.arc(pillX + 13, pillY + pillH / 2, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = "#34D399";
  ctx.fill();

  ctx.fillStyle = "#6EE7B7";
  ctx.fillText(pillText, pillX + 22, pillY + pillH / 2 + 0.5);

  // 5. Center Identity Block
  ctx.fillStyle = "rgba(165, 243, 252, 0.72)";
  ctx.font = "800 10px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("ON-CHAIN WEB3 IDENTITY", padX, 118);

  const normalizedDomain = domain.trim().toLowerCase().endsWith(".nex")
    ? domain.trim().toLowerCase()
    : `${domain.trim().toLowerCase() || "nexio"}.nex`;

  let domainFontPx = 34;
  ctx.font = `900 ${domainFontPx}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  while (ctx.measureText(normalizedDomain).width > baseW - padX * 2 && domainFontPx > 20) {
    domainFontPx -= 2;
    ctx.font = `900 ${domainFontPx}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(normalizedDomain, padX, 150);

  // Wallet Address Monospace Pill
  const shortWallet =
    wallet && wallet.length >= 12 ? `${wallet.slice(0, 10)}...${wallet.slice(-8)}` : wallet || "0x0000...0000";
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const addrW = ctx.measureText(shortWallet).width + 22;
  drawRoundedRect(ctx, padX, 174, addrW, 28, 8);
  ctx.fillStyle = "rgba(2, 6, 23, 0.58)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#94A3B8";
  ctx.fillText(shortWallet, padX + 11, 188.5);

  // 6. Bottom Telemetry Footer
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.beginPath();
  ctx.moveTo(padX, 228);
  ctx.lineTo(baseW - padX, 228);
  ctx.stroke();

  // Column 1: Network (Strictly ARC MAINNET · 5042)
  ctx.fillStyle = "#94A3B8";
  ctx.font = "700 9.5px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("NETWORK", padX, 248);

  ctx.fillStyle = "#22D3EE";
  ctx.font = "900 13px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(`${networkLabel.toUpperCase()} · ${chainId}`, padX, 268);

  // Column 2: GM Streak + Tier
  const col2X = 222;
  ctx.fillStyle = "#94A3B8";
  ctx.font = "700 9.5px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("DAILY GM STREAK", col2X, 248);

  const safeStreak = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
  const streakLabel = tierName ? `${safeStreak} DAYS · ${tierName.toUpperCase()}` : `${safeStreak} DAYS`;
  ctx.fillStyle = "#FBBF24";
  ctx.font = "900 13px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(streakLabel, col2X, 268);

  // Column 3 (Right-aligned): Registry CA if provided
  if (contractAddress && contractAddress.length >= 10) {
    const caLabel = `${contractAddress.slice(0, 6)}...${contractAddress.slice(-4)}`;
    ctx.textAlign = "right";
    ctx.fillStyle = "#94A3B8";
    ctx.font = "700 9.5px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.fillText("ANS REGISTRY", baseW - padX, 248);

    ctx.fillStyle = "#CBD5E1";
    ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(caLabel, baseW - padX, 268);
    ctx.textAlign = "left";
  }

  // 7. Outer Specular Frame
  drawRoundedRect(ctx, 0.75, 0.75, baseW - 1.5, baseH - 1.5, 27.25);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
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
