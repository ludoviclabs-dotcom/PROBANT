import { NextRequest } from "next/server";
import { z } from "zod";
import { leaseDemoExport } from "@/lib/workpapers/lease-demo";
import { assertLeaseDemoAllowed } from "@/lib/workpapers/lease-demo-guard";
import { LEASE_EXPORT_FORMATS } from "@/lib/workpapers/lease-export";
import { exportResponse } from "@/lib/workpapers/lease-http";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

/** Export diagnostic du scénario synthétique (L16-05) : « simulation non revue », jamais un export revu ; fermé en production. */
export async function GET(request: NextRequest) {
  try {
    assertLeaseDemoAllowed(request);
    const params = [...request.nextUrl.searchParams.keys()];
    if (params.length !== 1 || params[0] !== "format") throw new Error("DEMONSTRATION_QUERY_INVALID");
    return exportResponse(await leaseDemoExport(z.enum(LEASE_EXPORT_FORMATS).parse(request.nextUrl.searchParams.get("format"))));
  } catch (e) {
    const error = e instanceof z.ZodError ? "DEMONSTRATION_QUERY_INVALID" : e instanceof Error && /^[A-Z0-9_]+$/.test(e.message) ? e.message : "DEMONSTRATION_REQUEST_INVALID";
    return Response.json({ error }, { status: error === "DEMONSTRATION_DISABLED" ? 503 : 422, headers });
  }
}
