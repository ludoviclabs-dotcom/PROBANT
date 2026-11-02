import { NextRequest } from "next/server";
import { leaseDemoView } from "@/lib/workpapers/lease-demo";
import { assertLeaseDemoAllowed } from "@/lib/workpapers/lease-demo-guard";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

/** Read-only synthetic scenario, computed server-side by the same engine; never a saved sheet, closed in production. */
export async function GET(request: NextRequest) {
  try {
    assertLeaseDemoAllowed(request);
    if ([...request.nextUrl.searchParams.keys()].length) throw new Error("DEMONSTRATION_QUERY_INVALID");
    return Response.json(await leaseDemoView(), { headers });
  } catch (e) {
    const error = e instanceof Error && /^[A-Z0-9_]+$/.test(e.message) ? e.message : "DEMONSTRATION_REQUEST_INVALID";
    return Response.json({ error }, { status: error === "DEMONSTRATION_DISABLED" ? 503 : 422, headers });
  }
}
