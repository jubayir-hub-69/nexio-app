export const DEFAULT_FEE_RECIPIENT = "0x9AFe5CeF11fC10756faef213f7A30D9873B5d372";
export const GM_COOLDOWN_SECONDS = 86_400;
export const GM_EXPIRY_WINDOW_SECONDS = 172_800;

export type GmTier = {
  tier: 1 | 2 | 3;
  id: 1 | 2 | 3;
  name: string;
  label: string;
  rangeLabel: string;
  minStreak: number;
  minDays: number;
  feeBps: 0 | 5 | 10;
  discountPct: 50 | 75 | 100;
  discountLabel: string;
  batchLimit: number | null;
  badge: string;
  perk: string;
  benefits: string;
};

export type UnrankedGmProfile = {
  tier: 0;
  id: 0;
  name: string;
  label: string;
  rangeLabel: string;
  minStreak: 0;
  minDays: 0;
  feeBps: 20;
  discountPct: 0;
  discountLabel: string;
  batchLimit: 5;
  badge: null;
  perk: string;
  benefits: string;
};

export type GmProfile = UnrankedGmProfile | GmTier;

export const UNRANKED_GM_PROFILE: UnrankedGmProfile = {
  tier: 0,
  id: 0,
  name: "Unranked · Building Streak",
  label: "Unranked · Building Streak",
  rangeLabel: "0–29 Days",
  minStreak: 0,
  minDays: 0,
  feeBps: 20,
  discountPct: 0,
  discountLabel: "Standard 20 bps protocol swap fee",
  batchLimit: 5,
  badge: null,
  perk: "Standard 20 bps protocol swap fee & Batch Send up to 5 recipients while building consecutive check-ins toward Tier 1 (30 Days).",
  benefits:
    "Standard 20 bps protocol swap fee & Batch Send up to 5 recipients while building consecutive check-ins toward Tier 1 (30 Days).",
};

/** Strictly the 3 unlockable consecutive Daily GM tiers (30D, 90D, 180D VIP). */
export const GM_TIERS: readonly GmTier[] = [
  {
    tier: 1,
    id: 1,
    name: "Tier 1",
    label: "30 Days Streak",
    rangeLabel: "30–89 Consecutive Days",
    minStreak: 30,
    minDays: 30,
    feeBps: 10,
    discountPct: 50,
    discountLabel: "50% protocol swap fee discount (10 bps)",
    batchLimit: 20,
    badge: "Verified Active Sender",
    perk: "50% protocol swap fee discount (10 bps), Batch Send up to 20 recipients & Verified Active Sender status",
    benefits:
      "50% protocol swap fee discount (10 bps), Batch Send up to 20 recipients & Verified Active Sender status",
  },
  {
    tier: 2,
    id: 2,
    name: "Tier 2",
    label: "90 Days Streak",
    rangeLabel: "90–179 Consecutive Days",
    minStreak: 90,
    minDays: 90,
    feeBps: 5,
    discountPct: 75,
    discountLabel: "75% protocol swap fee discount (5 bps)",
    batchLimit: 50,
    badge: "Priority Telemetry",
    perk: "75% protocol swap fee discount (5 bps), Batch Send up to 50 recipients & Priority LP and Vault telemetry",
    benefits:
      "75% protocol swap fee discount (5 bps), Batch Send up to 50 recipients & Priority LP and Vault telemetry",
  },
  {
    tier: 3,
    id: 3,
    name: "Tier 3 VIP",
    label: "180 Days Streak — Highest VIP Tier",
    rangeLabel: "180+ Consecutive Days",
    minStreak: 180,
    minDays: 180,
    feeBps: 0,
    discountPct: 100,
    discountLabel: "100% protocol fee waiver (0 bps)",
    batchLimit: null,
    badge: "VIP Protocol Status",
    perk: "100% protocol fee waiver (0 bps), Unlimited Batch Transfers & Full VIP status across Swap, Send, Receive, and Liquidity",
    benefits:
      "100% protocol fee waiver (0 bps), Unlimited Batch Transfers & Full VIP status across Swap, Send, Receive, and Liquidity",
  },
];

export function normalizeStreakDays(streak: number): number {
  return Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
}

export function unlockedGmTierForStreak(streak: number): GmTier | null {
  const days = normalizeStreakDays(streak);
  if (days >= 180) return GM_TIERS[2];
  if (days >= 90) return GM_TIERS[1];
  if (days >= 30) return GM_TIERS[0];
  return null;
}

export function gmTierForStreak(streak: number): GmProfile {
  return unlockedGmTierForStreak(streak) ?? UNRANKED_GM_PROFILE;
}

export function tierForStreak(streak: number): GmProfile {
  return gmTierForStreak(streak);
}

export function nextGmTierForStreak(streak: number): GmTier | null {
  const days = normalizeStreakDays(streak);
  if (days < 30) return GM_TIERS[0];
  if (days < 90) return GM_TIERS[1];
  if (days < 180) return GM_TIERS[2];
  return null;
}

export function daysUntilNextGmTier(streak: number): number {
  const days = normalizeStreakDays(streak);
  const next = nextGmTierForStreak(days);
  return next ? Math.max(0, next.minStreak - days) : 0;
}

export function feeBpsForStreak(streak: number): 0 | 5 | 10 | 20 {
  return gmTierForStreak(streak).feeBps;
}

export function batchLimitForStreak(streak: number): number | null {
  return gmTierForStreak(streak).batchLimit;
}
