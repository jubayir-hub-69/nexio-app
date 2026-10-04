import { ethers } from "ethers";
import { ACHSWAP_API_BASE, ACHSWAP_MAX_SLIPPAGE_BPS } from "@/lib/achswap";

export type AchswapProxyResult = {
  status: number;
  body: unknown;
};

type QuoteFields = {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  feeBps: 0;
  slippageBps: number;
};

type SwapFields = QuoteFields & {
  sender: string;
  recipient: string;
};

export function readAchswapApiKey(): string {
  const serverKey = (process.env.ACHSWAP_API_KEY || "").trim();
  if (serverKey) return serverKey;
  return (process.env.NEXT_PUBLIC_ACHSWAP_API_KEY || "").trim();
}

export async function postAchswap(
  path: "quote" | "swap",
  body: QuoteFields | SwapFields,
  signal?: AbortSignal
): Promise<AchswapProxyResult> {
  const apiKey = readAchswapApiKey();
  if (!apiKey) {
    return {
      status: 401,
      body: {
        error: {
          code: "MISSING_API_KEY",
          message: "Set NEXT_PUBLIC_ACHSWAP_API_KEY before swapping.",
        },
      },
    };
  }

  const response = await fetch(`${ACHSWAP_API_BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = {
        error: {
          code: "INTERNAL",
          message: "Achswap returned an unreadable response.",
        },
      };
    }
  }

  return { status: response.status, body: parsed ?? { error: { code: "INTERNAL", message: "Empty Achswap response." } } };
}

export function parseQuoteBody(input: unknown): { ok: true; value: QuoteFields } | { ok: false; message: string } {
  const body = asRecord(input);
  if (!body) return { ok: false, message: "Expected a JSON object." };

  const chainId = body.chainId === undefined ? 5042 : body.chainId;
  if (chainId !== 5042) return { ok: false, message: "chainId must be 5042." };

  const tokenIn = readAddress(body.tokenIn, "tokenIn");
  if (!tokenIn.ok) return tokenIn;
  const tokenOut = readAddress(body.tokenOut, "tokenOut");
  if (!tokenOut.ok) return tokenOut;
  if (tokenIn.value.toLowerCase() === tokenOut.value.toLowerCase()) {
    return { ok: false, message: "tokenIn and tokenOut must be different." };
  }

  const amountIn = readAmount(body.amountIn);
  if (!amountIn.ok) return amountIn;

  if (body.feeBps !== undefined && body.feeBps !== 0) {
    return { ok: false, message: "feeBps must be 0." };
  }

  const slippageBps = readSlippage(body.slippageBps);
  if (!slippageBps.ok) return slippageBps;

  return {
    ok: true,
    value: {
      chainId: 5042,
      tokenIn: tokenIn.value,
      tokenOut: tokenOut.value,
      amountIn: amountIn.value,
      feeBps: 0,
      slippageBps: slippageBps.value,
    },
  };
}

export function parseSwapBody(input: unknown): { ok: true; value: SwapFields } | { ok: false; message: string } {
  const quote = parseQuoteBody(input);
  if (!quote.ok) return quote;
  const body = asRecord(input);
  if (!body) return { ok: false, message: "Expected a JSON object." };
  const sender = readAddress(body.sender, "sender");
  if (!sender.ok) return sender;
  const recipient = body.recipient === undefined ? sender : readAddress(body.recipient, "recipient");
  if (!recipient.ok) return recipient;
  return {
    ok: true,
    value: {
      ...quote.value,
      sender: sender.value,
      recipient: recipient.value,
    },
  };
}

export function isRequestAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function readAddress(value: unknown, field: string): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== "string" || !ethers.isAddress(value)) {
    return { ok: false, message: `${field} must be an address.` };
  }
  return { ok: true, value: ethers.getAddress(value) };
}

function readAmount(value: unknown): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value) || value === "0") {
    return { ok: false, message: "amountIn must be a positive integer string." };
  }
  return { ok: true, value };
}

function readSlippage(value: unknown): { ok: true; value: number } | { ok: false; message: string } {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > ACHSWAP_MAX_SLIPPAGE_BPS) {
    return { ok: false, message: `slippageBps must be an integer from 0 to ${ACHSWAP_MAX_SLIPPAGE_BPS}.` };
  }
  return { ok: true, value };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
