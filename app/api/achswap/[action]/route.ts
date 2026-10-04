import { NextResponse } from "next/server";
import { isRequestAbort, parseQuoteBody, parseSwapBody, postAchswap } from "@/lib/achswap-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;
  if (action !== "quote" && action !== "swap") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Unknown Achswap path." } },
      { status: 404, headers: { "Cache-Control": "no-store" } }
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

  const parsed = action === "quote" ? parseQuoteBody(input) : parseSwapBody(input);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: { code: "INVALID_REQUEST", message: parsed.message } },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const result = await postAchswap(action, parsed.value, request.signal);
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (isRequestAbort(error)) return new NextResponse(null, { status: 499 });
    console.error("Achswap proxy error:", error);
    return NextResponse.json(
      { error: { code: "UNAVAILABLE", message: "Could not reach Achswap. Try again." } },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
