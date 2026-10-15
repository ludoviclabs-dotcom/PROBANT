import { NextRequest } from "next/server";
import { loanFixture } from "@/lib/workpapers/loan-fixture";
import { loanDiagnostic } from "@/lib/workpapers/loan-package";
import { LOAN_TYPES, type LoanType } from "@/lib/workpapers/loan-review";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const CASES = ["", "simple", "long", "empty"] as const;
const cache = new Map<string, ReturnType<typeof loanFixture>>();

/** Read-only synthetic example, computed server-side by the same engine; never a saved sheet, closed in production. */
function allowed(request: NextRequest) {
  const origin = process.env.PROBANT_DEMONSTRATION_ORIGIN;
  if (process.env.VERCEL_ENV === "production" || process.env.PROBANT_DEMONSTRATION_ENABLED !== "true" || !origin || new URL(origin).host !== request.headers.get("host") || new URL(origin).protocol !== request.nextUrl.protocol)
    throw new Error("DEMONSTRATION_DISABLED");
}
function fixture(scenario: typeof CASES[number]) {
  const key = scenario === "simple" ? "simple" : scenario === "long" ? "long" : "complete";
  if (!cache.has(key)) cache.set(key, loanFixture({ scenario: key === "simple" ? "simple" : "complete", long: key === "long" }));
  return cache.get(key)!;
}

export async function GET(request: NextRequest) {
  try {
    allowed(request);
    const scenario = request.nextUrl.searchParams.get("case") ?? "";
    if (!(CASES as readonly string[]).includes(scenario)) throw new Error("DEMONSTRATION_QUERY_INVALID");
    const f = await fixture(scenario as typeof CASES[number]), type = request.nextUrl.searchParams.get("source"), format = request.nextUrl.searchParams.get("format");
    if (type) {
      if (!(LOAN_TYPES as readonly string[]).includes(type) || !f.files[type as LoanType]) throw new Error("SOURCE_NOT_FOUND");
      const file = f.files[type as LoanType];
      return new Response(await file.arrayBuffer(), { headers: { ...headers, "Content-Type": "text/csv;charset=utf-8", "Content-Disposition": "attachment; filename=\"" + file.name + "\"" } });
    }
    if (format === "html" || format === "json") {
      const pack = loanDiagnostic(f.run, f.facts);
      return new Response(pack[format], { headers: { ...headers, "Content-Type": format === "html" ? "text/html;charset=utf-8" : "application/json", "Content-Disposition": "attachment; filename=\"EXEMPLE-emprunts-diagnostic." + format + "\"",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } });
    }
    const empty = scenario === "empty";
    return Response.json({ actorId: f.actor.id, permissions: [], synthetic: true, executionProfile: null, runs: empty ? [] : [f.run], facts: empty ? {} : { [f.run.id]: f.facts },
      imports: empty ? [] : f.imports.map(b => ({ ...b, rows: b.rows.slice(0, 5), rowCount: b.rows.length })), sourceHeads: empty ? [] : f.imports.map(b => ({ document_type: b.document.documentType, import_id: b.id })),
      sourcesCurrent: empty ? {} : { [f.run.id]: true } }, { headers });
  } catch (e) {
    const error = e instanceof Error && /^[A-Z0-9_]+$/.test(e.message) ? e.message : "DEMONSTRATION_REQUEST_INVALID";
    return Response.json({ error }, { status: error === "DEMONSTRATION_DISABLED" ? 503 : error === "SOURCE_NOT_FOUND" ? 404 : 422, headers });
  }
}
