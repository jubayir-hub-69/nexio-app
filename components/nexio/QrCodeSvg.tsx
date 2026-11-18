"use client";

import React, { useMemo } from "react";

/**
 * Pure, self-contained ISO/IEC 18004 QR Code encoder (Byte mode + GF(256) Reed-Solomon ECC)
 * Renders a crisp single-<path> SVG locally on-device with zero external network calls.
 */

type EccLevel = "L" | "M";

type VersionSpec = {
  version: number;
  ecCodewordsPerBlock: number;
  blocks: Array<{ count: number; dataCodewords: number }>;
};

// ISO/IEC 18004 Table 9 — ECC Level M (15% error recovery, versions 1..14, up to 362 UTF-8 bytes)
const VERSION_SPECS_M: readonly VersionSpec[] = [
  { version: 1, ecCodewordsPerBlock: 10, blocks: [{ count: 1, dataCodewords: 16 }] },
  { version: 2, ecCodewordsPerBlock: 16, blocks: [{ count: 1, dataCodewords: 28 }] },
  { version: 3, ecCodewordsPerBlock: 26, blocks: [{ count: 1, dataCodewords: 44 }] },
  { version: 4, ecCodewordsPerBlock: 18, blocks: [{ count: 2, dataCodewords: 32 }] },
  { version: 5, ecCodewordsPerBlock: 24, blocks: [{ count: 2, dataCodewords: 43 }] },
  { version: 6, ecCodewordsPerBlock: 16, blocks: [{ count: 4, dataCodewords: 27 }] },
  { version: 7, ecCodewordsPerBlock: 18, blocks: [{ count: 4, dataCodewords: 31 }] },
  {
    version: 8,
    ecCodewordsPerBlock: 22,
    blocks: [
      { count: 2, dataCodewords: 38 },
      { count: 2, dataCodewords: 39 },
    ],
  },
  {
    version: 9,
    ecCodewordsPerBlock: 22,
    blocks: [
      { count: 3, dataCodewords: 36 },
      { count: 2, dataCodewords: 37 },
    ],
  },
  {
    version: 10,
    ecCodewordsPerBlock: 26,
    blocks: [
      { count: 4, dataCodewords: 43 },
      { count: 1, dataCodewords: 44 },
    ],
  },
  {
    version: 11,
    ecCodewordsPerBlock: 30,
    blocks: [
      { count: 1, dataCodewords: 50 },
      { count: 4, dataCodewords: 51 },
    ],
  },
  {
    version: 12,
    ecCodewordsPerBlock: 22,
    blocks: [
      { count: 6, dataCodewords: 36 },
      { count: 2, dataCodewords: 37 },
    ],
  },
  {
    version: 13,
    ecCodewordsPerBlock: 22,
    blocks: [
      { count: 8, dataCodewords: 37 },
      { count: 1, dataCodewords: 38 },
    ],
  },
  {
    version: 14,
    ecCodewordsPerBlock: 24,
    blocks: [
      { count: 4, dataCodewords: 40 },
      { count: 5, dataCodewords: 41 },
    ],
  },
];

// ECC Level L fallback for extra-long payloads (versions 1..14, up to 458 UTF-8 bytes)
const VERSION_SPECS_L: readonly VersionSpec[] = [
  { version: 1, ecCodewordsPerBlock: 7, blocks: [{ count: 1, dataCodewords: 19 }] },
  { version: 2, ecCodewordsPerBlock: 10, blocks: [{ count: 1, dataCodewords: 34 }] },
  { version: 3, ecCodewordsPerBlock: 15, blocks: [{ count: 1, dataCodewords: 55 }] },
  { version: 4, ecCodewordsPerBlock: 20, blocks: [{ count: 1, dataCodewords: 80 }] },
  { version: 5, ecCodewordsPerBlock: 26, blocks: [{ count: 1, dataCodewords: 108 }] },
  { version: 6, ecCodewordsPerBlock: 18, blocks: [{ count: 2, dataCodewords: 68 }] },
  { version: 7, ecCodewordsPerBlock: 20, blocks: [{ count: 2, dataCodewords: 78 }] },
  { version: 8, ecCodewordsPerBlock: 24, blocks: [{ count: 2, dataCodewords: 97 }] },
  { version: 9, ecCodewordsPerBlock: 30, blocks: [{ count: 2, dataCodewords: 116 }] },
  {
    version: 10,
    ecCodewordsPerBlock: 18,
    blocks: [
      { count: 2, dataCodewords: 68 },
      { count: 2, dataCodewords: 69 },
    ],
  },
  { version: 11, ecCodewordsPerBlock: 20, blocks: [{ count: 4, dataCodewords: 81 }] },
  {
    version: 12,
    ecCodewordsPerBlock: 24,
    blocks: [
      { count: 2, dataCodewords: 92 },
      { count: 2, dataCodewords: 93 },
    ],
  },
  { version: 13, ecCodewordsPerBlock: 26, blocks: [{ count: 4, dataCodewords: 107 }] },
  {
    version: 14,
    ecCodewordsPerBlock: 30,
    blocks: [
      { count: 3, dataCodewords: 115 },
      { count: 1, dataCodewords: 116 },
    ],
  },
];

const ALIGNMENT_CENTERS: Readonly<Record<number, readonly number[]>> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
  13: [6, 34, 62],
  14: [6, 26, 46, 66],
};

// Precompute GF(256) log/antilog tables with primitive polynomial 0x11d
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomon(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = buildGeneratorPoly(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

function totalDataCodewords(spec: VersionSpec): number {
  return spec.blocks.reduce((sum, b) => sum + b.count * b.dataCodewords, 0);
}

function selectSpec(byteLength: number, preferredEcc: EccLevel): { spec: VersionSpec; ecc: EccLevel } {
  const tryTable = (table: readonly VersionSpec[]) => {
    for (const spec of table) {
      const countBits = spec.version <= 9 ? 8 : 16;
      const availableBits = totalDataCodewords(spec) * 8;
      if (4 + countBits + byteLength * 8 <= availableBits) {
        return spec;
      }
    }
    return null;
  };

  if (preferredEcc === "M") {
    const foundM = tryTable(VERSION_SPECS_M);
    if (foundM) return { spec: foundM, ecc: "M" };
  }
  const foundL = tryTable(VERSION_SPECS_L);
  if (foundL) return { spec: foundL, ecc: "L" };

  throw new Error("QR payload exceeds maximum supported capacity (458 bytes).");
}

function encodeCodewords(bytes: Uint8Array, spec: VersionSpec): Uint8Array {
  const dataCapacity = totalDataCodewords(spec);
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // Byte mode indicator = 0100
  pushBits(0b0100, 4);
  pushBits(bytes.length, spec.version <= 9 ? 8 : 16);
  for (let i = 0; i < bytes.length; i++) {
    pushBits(bytes[i], 8);
  }

  const maxBits = dataCapacity * 8;
  const terminator = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < terminator; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = new Uint8Array(dataCapacity);
  const filledBytes = bits.length >>> 3;
  for (let i = 0; i < filledBytes; i++) {
    let b = 0;
    for (let bit = 0; bit < 8; bit++) {
      b = (b << 1) | bits[i * 8 + bit];
    }
    dataBytes[i] = b;
  }

  const padBytes = [0xec, 0x11];
  for (let i = filledBytes; i < dataCapacity; i++) {
    dataBytes[i] = padBytes[(i - filledBytes) & 1];
  }

  // Split into RS blocks & compute ECC
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const group of spec.blocks) {
    for (let i = 0; i < group.count; i++) {
      const slice = dataBytes.slice(offset, offset + group.dataCodewords);
      offset += group.dataCodewords;
      dataBlocks.push(slice);
      ecBlocks.push(computeReedSolomon(slice, spec.ecCodewordsPerBlock));
    }
  }

  const totalEc = dataBlocks.length * spec.ecCodewordsPerBlock;
  const interleaved = new Uint8Array(dataCapacity + totalEc);
  let outIdx = 0;
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let col = 0; col < maxDataLen; col++) {
    for (const block of dataBlocks) {
      if (col < block.length) interleaved[outIdx++] = block[col];
    }
  }
  for (let col = 0; col < spec.ecCodewordsPerBlock; col++) {
    for (const ec of ecBlocks) {
      interleaved[outIdx++] = ec[col];
    }
  }
  return interleaved;
}

function drawFinder(modules: boolean[][], reserved: boolean[][], top: number, left: number, size: number) {
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const r = top + dy;
      const c = left + dx;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const inOuter = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6;
      const onBorder = dy === 0 || dy === 6 || dx === 0 || dx === 6;
      const inCenter = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
      modules[r][c] = inOuter && (onBorder || inCenter);
      reserved[r][c] = true;
    }
  }
}

function drawAlignment(modules: boolean[][], reserved: boolean[][], centerR: number, centerC: number) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dist = Math.max(Math.abs(dy), Math.abs(dx));
      modules[centerR + dy][centerC + dx] = dist !== 1;
      reserved[centerR + dy][centerC + dx] = true;
    }
  }
}

function writeVersionBits(modules: boolean[][], reserved: boolean[][], version: number, size: number) {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) === 1;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    modules[a][b] = bit;
    reserved[a][b] = true;
    modules[b][a] = bit;
    reserved[b][a] = true;
  }
}

function writeFormatBits(modules: boolean[][], ecc: EccLevel, mask: number, size: number) {
  const eccBits = ecc === "L" ? 0b01 : 0b00; // L = 01, M = 00
  const data = (eccBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  // Copy 1: around top-left finder (ISO/IEC 18004 Fig. 25: bit 0 at (0,8) .. bit 14 at (8,0))
  for (let i = 0; i <= 5; i++) modules[i][8] = ((bits >>> i) & 1) === 1;
  modules[7][8] = ((bits >>> 6) & 1) === 1;
  modules[8][8] = ((bits >>> 7) & 1) === 1;
  modules[8][7] = ((bits >>> 8) & 1) === 1;
  for (let i = 9; i < 15; i++) modules[8][14 - i] = ((bits >>> i) & 1) === 1;

  // Copy 2: bottom-left & top-right
  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = ((bits >>> i) & 1) === 1;
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = ((bits >>> i) & 1) === 1;
  modules[size - 8][8] = true; // Dark module
}

function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function computePenalty(grid: boolean[][], size: number): number {
  let penalty = 0;

  // Rule 1: runs of >=5 identical modules in rows & cols
  for (let i = 0; i < size; i++) {
    let rowRun = 1;
    let colRun = 1;
    for (let j = 1; j < size; j++) {
      if (grid[i][j] === grid[i][j - 1]) {
        rowRun++;
        if (rowRun === 5) penalty += 3;
        else if (rowRun > 5) penalty += 1;
      } else {
        rowRun = 1;
      }
      if (grid[j][i] === grid[j - 1][i]) {
        colRun++;
        if (colRun === 5) penalty += 3;
        else if (colRun > 5) penalty += 1;
      } else {
        colRun = 1;
      }
    }
  }

  // Rule 2: 2x2 blocks of identical color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = grid[r][c];
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) {
        penalty += 3;
      }
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns with 4 light modules on either side
  const hasFinderLike = (line: boolean[]) => {
    let score = 0;
    for (let i = 0; i <= line.length - 11; i++) {
      const p1 =
        line[i] &&
        !line[i + 1] &&
        line[i + 2] &&
        line[i + 3] &&
        line[i + 4] &&
        !line[i + 5] &&
        line[i + 6] &&
        !line[i + 7] &&
        !line[i + 8] &&
        !line[i + 9] &&
        !line[i + 10];
      const p2 =
        !line[i] &&
        !line[i + 1] &&
        !line[i + 2] &&
        !line[i + 3] &&
        line[i + 4] &&
        !line[i + 5] &&
        line[i + 6] &&
        line[i + 7] &&
        line[i + 8] &&
        !line[i + 9] &&
        line[i + 10];
      if (p1 || p2) score += 40;
    }
    return score;
  };

  for (let i = 0; i < size; i++) {
    penalty += hasFinderLike(grid[i]);
    const col: boolean[] = new Array(size);
    for (let j = 0; j < size; j++) col[j] = grid[j][i];
    penalty += hasFinderLike(col);
  }

  // Rule 4: dark/light balance
  let dark = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) dark++;
    }
  }
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  if (k > 0) penalty += k * 10;

  return penalty;
}

export function generateQrMatrix(value: string, preferredEcc: EccLevel = "M"): boolean[][] {
  const bytes = new TextEncoder().encode(value);
  const { spec, ecc } = selectSpec(bytes.length, preferredEcc);
  const size = 17 + spec.version * 4;

  const baseModules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  // Function patterns
  drawFinder(baseModules, reserved, 0, 0, size);
  drawFinder(baseModules, reserved, 0, size - 7, size);
  drawFinder(baseModules, reserved, size - 7, 0, size);

  const centers = ALIGNMENT_CENTERS[spec.version] ?? [];
  for (const r of centers) {
    for (const c of centers) {
      const overlapsFinder =
        (r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8);
      if (!overlapsFinder) drawAlignment(baseModules, reserved, r, c);
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) {
      baseModules[6][i] = i % 2 === 0;
      reserved[6][i] = true;
    }
    if (!reserved[i][6]) {
      baseModules[i][6] = i % 2 === 0;
      reserved[i][6] = true;
    }
  }

  // Reserve format info slots + dark module
  for (let i = 0; i <= 8; i++) {
    if (!reserved[8][i]) reserved[8][i] = true;
    if (!reserved[i][8]) reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  baseModules[size - 8][8] = true;
  reserved[size - 8][8] = true;

  writeVersionBits(baseModules, reserved, spec.version, size);

  // Place interleaved data + EC codewords in upward/downward 2-col zig-zag
  const codewords = encodeCodewords(bytes, spec);
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip vertical timing column
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = right - dc;
        if (reserved[r][c]) continue;
        let bit = false;
        if (bitIdx < totalBits) {
          bit = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx++;
        }
        baseModules[r][c] = bit;
      }
    }
    upward = !upward;
  }

  // Pick optimal mask (0..7)
  let bestGrid = baseModules;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseModules.map((row, r) =>
      row.map((cell, c) => (!reserved[r][c] && maskBit(mask, r, c) ? !cell : cell))
    );
    writeFormatBits(candidate, ecc, mask, size);
    const p = computePenalty(candidate, size);
    if (p < bestPenalty) {
      bestPenalty = p;
      bestGrid = candidate;
    }
  }

  return bestGrid;
}

export type QrCodeSvgProps = {
  value: string;
  size?: number;
  quietZone?: number;
  fgColor?: string;
  bgColor?: string;
  ecc?: EccLevel;
  className?: string;
  ariaLabel?: string;
};

export function QrCodeSvg({
  value,
  size = 192,
  quietZone = 3,
  fgColor = "#071120",
  bgColor = "#ffffff",
  ecc = "M",
  className = "",
  ariaLabel = "QR Code",
}: QrCodeSvgProps) {
  const { viewSize, pathData } = useMemo(() => {
    const clean = value.trim();
    if (!clean) return { viewSize: 29, pathData: "" };
    try {
      const matrix = generateQrMatrix(clean, ecc);
      const n = matrix.length;
      const total = n + quietZone * 2;
      const segments: string[] = [];
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (matrix[r][c]) {
            segments.push(`M${c + quietZone} ${r + quietZone}h1v1h-1z`);
          }
        }
      }
      return { viewSize: total, pathData: segments.join("") };
    } catch {
      return { viewSize: 29, pathData: "" };
    }
  }, [value, ecc, quietZone]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewSize} ${viewSize}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={ariaLabel}
      className={className}
    >
      <rect width={viewSize} height={viewSize} rx={1.5} fill={bgColor} />
      {pathData && <path d={pathData} fill={fgColor} />}
    </svg>
  );
}

export default QrCodeSvg;
