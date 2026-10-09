import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { fiscalApprovalSchema, fiscalCommandSchema, fiscalPeriodSchema } from "./fiscal-commands";
import type { FiscalRuntime } from "./fiscal-runtime";
import { declarationFormSchema, FiscalSourceError, fiscalMappingSchema, FX_TABULAR_TYPES } from "./fiscal-sources";
import { FiscalConflict } from "./fiscal-store";
import { periodId } from "./model";
import type { FiscalExportKind } from "@/lib/evidence/fiscal-mission-package";

const query = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1).max(100), operation: z.enum(["list", "history", "download", "mission", "version"]).optional(),
  id: z.string().min(1).max(200).optional(), rootId: z.string().min(1).max(200).optional(), version: z.coerce.number().int().min(1).max(100000).optional() }).strict();
const exportBody = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1).max(100), rootId: z.string().min(1).max(200).optional(), id: z.string().min(1).max(200).optional(), version: z.number().int().min(1).max(100000).optional(),
  kind: z.enum(["diagnostic", "approved"]), format: z.enum(["json", "html", "pdf", "manifest", "exceptions_csv", "decisions_csv", "procedures_csv", "sources_csv"]), expectedSnapshotHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
const headers = { "Cache-Control": "private, no-store" };
/** Disposable recipe infrastructure only; production stays closed even with the flag. */
export function requireDisposableFiscal(env: Record<string, string | undefined> = process.env) {
  if (env.VERCEL_ENV === "production" || env.PROBANT_FISCAL_DURABLE !== "disposable") throw new ApiError("FX_DURABLE_DISABLED", "Le parcours fiscal durable (TVA, IS) est réservé à la recette jetable.", 503);
}
export function fiscalFailureStatus(code: string) {
  return /SESSION_INVALID|AUTHENTICATION_REQUIRED/.test(code) ? 401 : /FORBIDDEN|SELF_APPROVAL/.test(code) ? 403 : /NOT_FOUND/.test(code) ? 404
    : /STALE|CONFLICT|REPLACED|ALREADY_EXISTS|IDEMPOTENCY_KEY_REUSED/.test(code) ? 409
    : /^(FX_|FISCAL_|IMPORT_|MAPPING_|PREPARATION_|WORKPAPER_|UNRESOLVED_|REVIEW_|CONCLUSION_|NOTE_|CALCULATION_|COMPLETED_|INPUTS_|REQUIRED_|EXPORT_|AMOUNT_|DATE_|CSV_|XLSX_|ZIP_|UPLOAD_|FILE_|MIME_|STRING_|EMPTY_|POPULATION_|SELECTION_|REVISION_|LOCKED_|APPROVAL_|STALE_|TAX_)/.test(code)
      || /REQUIRED|INVALID|INCOMPLETE|NOT_ALLOWED|MISMATCH|DUPLICATE|UNKNOWN|UNSUPPORTED|OUTSIDE|IMMUTABLE/.test(code) ? 422 : 503;
}
function failure(error: unknown) {
  if (error instanceof FiscalConflict) return Response.json({ error: error.message, expectedVersion: error.expectedVersion, current: error.current }, { status: 409, headers });
  if (error instanceof SyntaxError || error instanceof z.ZodError) return Response.json({ error: "FX_REQUEST_INVALID" }, { status: 400, headers });
  if (error instanceof ApiError) return Response.json({ error: error.code }, { status: error.status, headers });
  if (error instanceof FiscalSourceError) return Response.json({ error: error.code, ...(error.locator ? { locator: error.locator } : {}) }, { status: 422, headers });
  const code = error instanceof Error ? error.message : "", status = fiscalFailureStatus(code);
  return Response.json({ error: status === 503 ? "FX_DURABLE_UNAVAILABLE" : code.split(":")[0] }, { status, headers });
}
function scope(request: Request) {
  const params = new URL(request.url).searchParams;
  if (new Set(params.keys()).size !== [...params.keys()].length) throw new Error("FX_QUERY_INVALID");
  const parsed = query.parse(Object.fromEntries(params));
  if (parsed.version !== undefined && !parsed.id) throw new Error("FX_QUERY_INVALID");
  return parsed;
}
async function bounded(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("FX_BODY_REQUIRED");
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new ApiError("FX_BODY_LIMIT", "Corps de requête trop volumineux pour la recette fiscale.", 413); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const p of parts) { bytes.set(p, offset); offset += p.length; }
  return new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
}
const FORM_FIELDS: Record<string, string[]> = { fx_fec: ["file", "period", "documentType"], fx_vat_return: ["file", "period", "documentType", "declaration"] };
export function fiscalHandlers(create: () => FiscalRuntime, enabled: () => void = requireDisposableFiscal, observeError?: (error: unknown) => void) {
  const fail = (error: unknown) => { observeError?.(error); return failure(error); };
  return {
    GET: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        if (q.operation === "download") {
          if (!q.id) throw new Error("DOCUMENT_ID_REQUIRED");
          const bytes = await runtime.download(request, q.dossierId, q.periodId, q.id);
          if (!bytes) return Response.json({ error: "SOURCE_NOT_FOUND" }, { status: 404, headers });
          return new Response(Uint8Array.from(bytes).buffer, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="source-fiscale"', "X-Content-Type-Options": "nosniff" } });
        }
        if (q.operation === "mission") return Response.json(await runtime.mission(request, q.dossierId, q.periodId, { rootId: q.rootId, id: q.id, version: q.version }), { headers });
        if (q.operation === "version" && (!q.id || q.version === undefined)) throw new Error("WORKPAPER_VERSION_REQUIRED");
        if (q.version !== undefined && q.operation !== "version") throw new Error("FX_QUERY_INVALID");
        return Response.json(await runtime.read(request, q.dossierId, q.periodId, q.id, q.operation === "history", q.version), { headers });
      } catch (error) { return fail(error); }
    },
    POST: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        await runtime.check(request, q.dossierId, "read");
        const command = fiscalCommandSchema.parse(await (await bounded(request, 400_000)).json());
        return Response.json(await runtime.command(request, q.dossierId, q.periodId, command, request.headers.get("Idempotency-Key") ?? ""), { headers });
      } catch (error) { return fail(error); }
    },
    exportPOST: async (request: Request) => {
      try {
        enabled();
        const input = exportBody.parse(await (await bounded(request, 4096)).json()), runtime = create();
        const pack = await runtime.missionExport(request, input.dossierId, input.periodId, { rootId: input.rootId, id: input.id, version: input.version }, input.kind as FiscalExportKind, input.expectedSnapshotHash);
        const format = ({ json: "canonical_json", html: "accessible_html", pdf: "pdf", manifest: "manifest", exceptions_csv: "findings_csv", decisions_csv: "review_events_csv", procedures_csv: "controls_csv", sources_csv: "sources_csv" } as const)[input.format];
        const entry = pack.manifest.artifacts.find(a => a.format === format);
        const content = input.format === "json" ? pack.canonicalJson : input.format === "manifest" ? pack.manifestJson : input.format === "html" ? pack.html : input.format === "exceptions_csv" ? pack.csv.findings : input.format === "decisions_csv" ? pack.csv.reviewEvents : input.format === "procedures_csv" ? pack.csv.controls : input.format === "sources_csv" ? pack.csv.sources : Uint8Array.from(pack.pdf).buffer;
        return new Response(content, { headers: { ...headers, "Content-Type": entry?.mediaType ?? "application/json", "Content-Disposition": 'attachment; filename="' + (entry?.fileName ?? "probant-fiscal-" + input.kind + "-manifest.json") + '"', "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'", "X-Probant-Snapshot": pack.manifest.snapshotSha256 } });
      } catch (error) { return fail(error); }
    },
    importsPOST: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        await runtime.check(request, q.dossierId, "prepare");
        const body = await bounded(request, 3.25 * 1024 * 1024), key = request.headers.get("Idempotency-Key") ?? "";
        if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
          const form = await body.formData(), type = String(form.get("documentType"));
          // The FEC names nothing; a return names its document type; a table names its mapping. Never more fields.
          const allowed = FORM_FIELDS[type] ?? ["file", "period", "documentType", "mapping"];
          if ([...form.keys()].some(k => !allowed.includes(k)) || [...form.keys()].length !== allowed.length) throw new Error("FX_IMPORT_FIELDS_INVALID");
          const file = form.get("file");
          if (!(file instanceof File)) throw new Error("FX_FILE_REQUIRED");
          const period = fiscalPeriodSchema.parse(JSON.parse(String(form.get("period"))));
          if (periodId(period) !== q.periodId) throw new Error("WORKPAPER_PERIOD_INVALID");
          if (type === "fx_fec") return Response.json(await runtime.previewFec(request, q.dossierId, period, file, key), { headers });
          if (type === "fx_vat_return") return Response.json(await runtime.previewDeclaration(request, q.dossierId, period, file, declarationFormSchema.parse(JSON.parse(String(form.get("declaration")))), key), { headers });
          const tabular = z.enum(FX_TABULAR_TYPES).parse(type);
          return Response.json(await runtime.preview(request, q.dossierId, period, file, fiscalMappingSchema.parse(JSON.parse(String(form.get("mapping")))), tabular, key), { headers });
        }
        return Response.json(await runtime.approveImport(request, q.dossierId, q.periodId, fiscalApprovalSchema.parse(await body.json()), key), { headers });
      } catch (error) { return fail(error); }
    },
  };
}
