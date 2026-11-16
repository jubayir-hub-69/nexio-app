export const DEFAULT_FEE_RECIPIENT = "0x9AFe5CeF11fC10756faef213f7A30D9873B5d372";

export type GmTier = {
  id: 0 | 1 | 2 | 3 | 4;
  name: string;
  minDays: number;
  feeBps: 0 | 5 | 10 | 15 | 20;
  discountLabel: string;
  batchLimit: number | null;
  benefits: string;
};

export const GM_TIERS: readonly GmTier[] = [
  {
    id: 0,
    name: "Tier 0",
    minDays: 0,
    feeBps: 20,
    discountLabel: "Standard 20 bps",
    batchLimit: 5,
    benefits: "Batch send up to 5 recipients.",
  },
  {
    id: 1,
    name: "Tier 1",
    minDays: 7,
    feeBps: 15,
    discountLabel: "25% swap-fee discount (15 bps)",
    batchLimit: 15,
    benefits: "Batch send up to 15 recipients. Verified Active Sender on Send and Receive.",
  },
  {
    id: 2,
    name: "Tier 2",
    minDays: 30,
    feeBps: 10,
    discountLabel: "50% swap-fee discount (10 bps)",
    batchLimit: 30,
    benefits: "Batch send up to 30 recipients. Priority LP pool analytics.",
  },
  {
    id: 3,
    name: "Tier 3",
    minDays: 90,
    feeBps: 5,
    discountLabel: "75% swap-fee discount (5 bps)",
    batchLimit: 50,
    benefits: "Batch send up to 50 recipients. Priority identity recovery and vault telemetry.",
  },
  {
    id: 4,
    name: "Tier 4",
    minDays: 180,
    feeBps: 0,
    discountLabel: "100% protocol-fee waiver (0 bps)",
    batchLimit: null,
    benefits: "Unlimited batch transfers. VIP status on Swap, Send, Receive, and Liquidity.",
  },
];

export function tierForStreak(streak: number): GmTier {
  const days = Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;
  if (days >= 180) return GM_TIERS[4];
  if (days >= 90) return GM_TIERS[3];
  if (days >= 30) return GM_TIERS[2];
  if (days >= 7) return GM_TIERS[1];
  return GM_TIERS[0];
}

export function feeBpsForStreak(streak: number): 0 | 5 | 10 | 15 | 20 {
  return tierForStreak(streak).feeBps;
}

export function batchLimitForStreak(streak: number): number | null {
  return tierForStreak(streak).batchLimit;
}
