import { ethers } from "ethers";
import type { OnChainHistoryEntry, OnChainHistoryKind } from "@/lib/history";

export const TREASURY_CSV_HEADERS = [
  "Date (UTC)",
  "Transaction Hash",
  "Type",
  "Asset",
  "Amount",
  "Status",
] as const;

function formatUtcTimestamp(timestampSec: number | null, blockNumber: number): string {
  if (typeof timestampSec === "number" && Number.isFinite(timestampSec) && timestampSec > 0) {
    return new Date(timestampSec * 1000)
      .toISOString()
      .replace("T", " ")
      .replace(/\.\d{3}Z$/, " UTC");
  }
  return `Block #${blockNumber} (UTC)`;
}

function mapAccountingType(kind: OnChainHistoryKind): string {
  switch (kind) {
    case "send":
      return "Send";
    case "receive":
      return "Receive";
    case "swap":
      return "Swap";
    case "vault_stake":
      return "Stake";
    case "vault_withdraw":
      return "Withdraw";
    case "nlp_claim":
      return "Claim NLP";
    case "lp_add":
      return "Add Liquidity";
    case "lp_remove":
      return "Remove Liquidity";
    case "gm_checkin":
      return "Daily GM";
    case "domain_register":
      return "Domain Register";
    case "contact_saved":
      return "Address Book (Save)";
    case "contact_removed":
      return "Address Book (Remove)";
  }
}

/**
 * Formats an exact on-chain BigInt token amount with ZERO decimal truncation.
 * Preserves every non-zero fractional digit down to the asset's full precision,
 * while padding to at least 2 decimal places for institutional ledger alignment.
 */
export function formatExactCsvAmount(entry: OnChainHistoryEntry): string {
  if (entry.amountRaw === null || entry.decimals === null) {
    return "0.00";
  }

  const rawExact =
    entry.amountExact && entry.amountExact.length > 0
      ? entry.amountExact
      : ethers.formatUnits(entry.amountRaw, entry.decimals);

  const [whole, fracRaw = ""] = rawExact.split(".");
  const trimmedFrac = fracRaw.replace(/0+$/, "");
  const paddedFrac = trimmedFrac.length >= 2 ? trimmedFrac : trimmedFrac.padEnd(2, "0");
  const unsigned = `${whole}.${paddedFrac}`;

  if (entry.amountRaw === 0n) return "0.00";
  return entry.direction === "out" ? `-${unsigned}` : unsigned;
}

/**
 * RFC 4180 CSV cell escaping with spreadsheet formula-injection protection.
 * Signed numeric cells (e.g. `-12.50`) remain pure numeric values for Excel / QuickBooks.
 */
function escapeCsvCell(value: string, isNumeric = false): string {
  let safe = value;
  if (!isNumeric && /^[=+\-@\t\r]/.test(safe)) {
    safe = `'${safe}`;
  }
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/**
 * Converts verified on-chain history entries into an accountant-ready RFC 4180 CSV string
 * with UTF-8 BOM and exact columns: Date (UTC), Transaction Hash, Type, Asset, Amount, Status.
 */
export function buildTreasuryHistoryCsv(entries: OnChainHistoryEntry[]): string {
  const rows: string[] = [
    TREASURY_CSV_HEADERS.map((h) => escapeCsvCell(h, false)).join(","),
  ];

  for (const entry of entries) {
    const dateUtc = formatUtcTimestamp(entry.timestamp, entry.blockNumber);
    const txHash = entry.txHash;
    const typeLabel = mapAccountingType(entry.kind);
    const asset = entry.tokenSymbol ?? "N/A";
    const exactAmount = formatExactCsvAmount(entry);
    const status = "Confirmed";

    rows.push(
      [
        escapeCsvCell(dateUtc, false),
        escapeCsvCell(txHash, false),
        escapeCsvCell(typeLabel, false),
        escapeCsvCell(asset, false),
        escapeCsvCell(exactAmount, true),
        escapeCsvCell(status, false),
      ].join(",")
    );
  }

  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

/**
 * Generates and instantly triggers a secure, 100% client-side CSV download for treasury accountants.
 */
export function downloadTreasuryHistoryCsv(
  entries: OnChainHistoryEntry[],
  wallet: string
): { rowCount: number; filename: string } {
  const csv = buildTreasuryHistoryCsv(entries);
  const utcDate = new Date().toISOString().slice(0, 10);
  const shortWallet = wallet ? wallet.slice(0, 8).toLowerCase() : "wallet";
  const filename = `nexio-treasury-ledger-${shortWallet}-${utcDate}-utc.csv`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1_000);

  return { rowCount: entries.length, filename };
}
