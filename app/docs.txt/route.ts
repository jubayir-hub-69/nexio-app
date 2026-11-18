import { buildDocsTxt } from "@/lib/protocol-spec";

export const dynamic = "force-static";

export function GET() {
  return new Response(buildDocsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
