import { z } from "zod";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { ApiError } from "@/lib/api/errors";
import { durableChainEnabled } from "@/lib/runtime/profile";
import { ClientsConflict } from "./clients-persistence";
import { clientsApprovalSchema, clientsPeriodSchema, loanCommandSchema } from "./loan-commands";
import { LOAN_TYPES, loanMappingSchema } from "./loan-review";
import type { LoanRuntime } from "./loan-runtime";
import { periodId } from "./model";

const headers = { "Cache-Control": "private, no-store" };
const query = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1).max(100), operation: z.enum(["list", "history", "version", "download"]).optional(),
  id: z.string().min(1).max(200).optional(), version: z.coerce.number().int().positive().optional() }).strict();

/** Chain opened only by the disposable recipe or the personal local profile (C07); always closed on Vercel production. */
export function requireLoansChain(env: Record<string, string | undefined> = process.env) {
  if (!durableChainEnabled(env, "PROBANT_LOANS_DURABLE")) throw new ApiError("LOAN_DURABLE_DISABLED", "Cycle réservé à la recette jetable ou au profil personnel local.", 503);
}
function failure(e: unknown) {
  if (e instanceof ClientsConflict) return Response.json({ error: e.message, current: e.current, expectedVersion: e.expectedVersion }, { status: 409, headers });
  if (e instanceof SyntaxError || e instanceof z.ZodError) return Response.json({ error: "LOAN_REQUEST_INVALID" }, { status: 400, headers });
  if (e instanceof ApiError) return Response.json({ error: e.code }, { status: e.status, headers });
  if (e instanceof DrizzleQueryError) return Response.json({ error: "LOAN_DURABLE_UNAVAILABLE" }, { status: 503, headers });
  const code = e instanceof Error && /^[A-Z][A-Z0-9_]*$/.test(e.message) ? e.message : "LOAN_DURABLE_UNAVAILABLE";
  const status = /SESSION_INVALID/.test(code) ? 401 : /FORBIDDEN|SELF_APPROVAL/.test(code) ? 403 : /NOT_FOUND/.test(code) ? 404 : /CONFLICT|STALE|REPLACED|IDEMPOTENCY/.test(code) ? 409
    : /LIMIT/.test(code) ? 413 : /INVALID|REQUIRED|UNAPPROVED|MISMATCH|DISABLED|UNRESOLVED|NOT_READY|FROZEN|IMMUTABLE|AFTER_REVIEW|NOT_APPLICABLE/.test(code) ? 422 : 503;
  return Response.json({ error: status === 503 ? "LOAN_DURABLE_UNAVAILABLE" : code }, { status, headers });
}
async function bounded(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("LOAN_BODY_REQUIRED");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new ApiError("LOAN_BODY_LIMIT", "Requête trop volumineuse.", 413); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
}
function scope(request: Request) {
  const p = new URL(request.url).searchParams;
  if (new Set(p.keys()).size !== [...p.keys()].length) throw new Error("LOAN_QUERY_INVALID");
  const q = query.parse(Object.fromEntries(p));
  if (q.version !== undefined && (!q.id || q.operation !== "version")) throw new Error("LOAN_QUERY_INVALID");
  return q;
}

export function loanHandlers(create: () => LoanRuntime, enabled: () => void = requireLoansChain, report: (error: unknown) => void = () => {}) {
  return {
    exportPOST: async (request: Request) => {
      try {
        enabled();
        const b = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1), id: z.string().min(1), version: z.number().int().positive(), expectedHash: z.string().regex(/^[a-f0-9]{64}$/), format: z.enum(["json", "html"]) }).strict()
          .parse(await (await bounded(request, 4096)).json());
        const pack = await create().loanExport(request, b.dossierId, b.periodId, b.id, b.version, b.expectedHash);
        return new Response(pack[b.format], { headers: { ...headers, "Content-Type": b.format === "html" ? "text/html;charset=utf-8" : "application/json", "Content-Disposition": "attachment; filename=\"emprunts-diagnostic." + b.format + "\"",
          "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } });
      } catch (e) { report(e); return failure(e); }
    },
    GET: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        if (q.operation === "download") {
          if (!q.id) throw new Error("DOCUMENT_ID_REQUIRED");
          const bytes = await runtime.download(request, q.dossierId, q.periodId, q.id);
          if (!bytes) return Response.json({ error: "SOURCE_NOT_FOUND" }, { status: 404, headers });
          return new Response(Uint8Array.from(bytes).buffer, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Disposition": "attachment; filename=\"source-emprunts\"", "X-Content-Type-Options": "nosniff" } });
        }
        return Response.json(await runtime.loanRead(request, q.dossierId, q.periodId, q.id, q.operation === "history", q.version), { headers });
      } catch (e) { report(e); return failure(e); }
    },
    POST: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        await runtime.check(request, q.dossierId, "read");
        const command = loanCommandSchema.parse(await (await bounded(request, 500_000)).json());
        return Response.json(await runtime.loanCommand(request, q.dossierId, q.periodId, command, request.headers.get("Idempotency-Key") ?? ""), { headers });
      } catch (e) { report(e); return failure(e); }
    },
    importsPOST: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        await runtime.check(request, q.dossierId, "prepare");
        const body = await bounded(request, 3.25 * 1024 * 1024), key = request.headers.get("Idempotency-Key") ?? "";
        if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
          const form = await body.formData();
          if ([...form.keys()].some(k => !["file", "mapping", "period", "documentType"].includes(k)) || [...form.keys()].length !== 4) throw new Error("LOAN_IMPORT_FIELDS_INVALID");
          const file = form.get("file");
          if (!(file instanceof File)) throw new Error("LOAN_FILE_REQUIRED");
          const period = clientsPeriodSchema.parse(JSON.parse(String(form.get("period"))));
          if (periodId(period) !== q.periodId) throw new Error("WORKPAPER_PERIOD_INVALID");
          const type = z.enum(LOAN_TYPES).parse(form.get("documentType")), mapping = loanMappingSchema.parse(JSON.parse(String(form.get("mapping"))));
          return Response.json(await runtime.previewLoan(request, q.dossierId, period, file, mapping, type, key), { headers });
        }
        return Response.json(await runtime.approveImport(request, q.dossierId, q.periodId, clientsApprovalSchema.parse(await body.json()), key), { headers });
      } catch (e) { report(e); return failure(e); }
    },
  };
}
