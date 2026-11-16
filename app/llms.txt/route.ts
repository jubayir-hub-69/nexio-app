import { PROTOCOL_SPEC } from "@/lib/protocol-spec";

export const dynamic = "force-static";

export function GET() {
  return new Response(PROTOCOL_SPEC, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
