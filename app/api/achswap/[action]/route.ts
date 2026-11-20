import { NextResponse } from "next/server";
import {
  checkAchswapRateLimit,
  fetchAchswapTokenList,
  isPartnerFeeRejection,
  isRequestAbort,
  parseQuoteBody,
  parseSwapBody,
  postAchswapQuote,
  postAchswapSwap,
  withProtocolFee,
} from "@/lib/achswap-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;
  if (action !== "tokens") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Unknown swap routing path." } },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rateCheck = checkAchswapRateLimit(request);
  if (!rateCheck.ok) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Rate limit exceeded. Wait a moment and try again.",
        },
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateCheck.retryAfterSeconds),
        },
      }
    );
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const chainParam = url.searchParams.get("chainId");
  if (chainParam !== null && chainParam !== "" && chainParam !== "5042") {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "chainId must be 5042." } },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await fetchAchswapTokenList(query, request.signal);
    return NextResponse.json(
      { chainId: 5042, tokens: result.tokens, source: result.source },
      {
        status: 200,
        headers: {
          "Cache-Control": query ? "no-store" : "public, max-age=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    if (isRequestAbort(error)) return new NextResponse(null, { status: 499 });
    console.error("Token discovery proxy error:", error);
    return NextResponse.json(
      { error: { code: "UNAVAILABLE", message: "Could not load live Arc Mainnet token list." } },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;
  if (action !== "quote" && action !== "swap") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Unknown swap routing path." } },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const rateCheck = checkAchswapRateLimit(request);
  if (!rateCheck.ok) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Rate limit exceeded. Wait a moment and try again.",
        },
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateCheck.retryAfterSeconds),
        },
      }
    );
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: "Expected JSON." } },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (action === "quote") {
    const parsed = parseQuoteBody(input);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: parsed.message } },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    try {
      const priced = await withProtocolFee(parsed.value);
      let result = await postAchswapQuote(priced, request.signal);
      if (priced.feeBps > 0 && isPartnerFeeRejection(result)) {
        const fallback = { ...priced, feeBps: 0 as const };
        delete fallback.feeRecipient;
        result = await postAchswapQuote(fallback, request.signal);
      }
      return NextResponse.json(result.body, {
        status: result.status,
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (isRequestAbort(error)) return new NextResponse(null, { status: 499 });
      console.error("Swap quote proxy error:", error);
      return NextResponse.json(
        { error: { code: "UNAVAILABLE", message: "Could not reach swap routing service. Try again." } },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  const parsedSwap = parseSwapBody(input);
  if (!parsedSwap.ok) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: parsedSwap.message } },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const priced = await withProtocolFee(parsedSwap.value);
    const upstream = {
      ...priced,
      sender: parsedSwap.value.sender,
      recipient: parsedSwap.value.recipient,
    };
    let result = await postAchswapSwap(upstream, request.signal);
    if (upstream.feeBps > 0 && isPartnerFeeRejection(result)) {
      const fallback = { ...upstream, feeBps: 0 as const };
      delete fallback.feeRecipient;
      result = await postAchswapSwap(fallback, request.signal);
    }
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (isRequestAbort(error)) return new NextResponse(null, { status: 499 });
    console.error("Swap execution proxy error:", error);
    return NextResponse.json(
      { error: { code: "UNAVAILABLE", message: "Could not reach swap routing service. Try again." } },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
