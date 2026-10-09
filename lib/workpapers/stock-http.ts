import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { stockApprovalSchema, stockCommandSchema, stockPeriodSchema } from "./stock-commands";
import type { StockRuntime } from "./stock-runtime";
import { ST_TYPES, StockSourceError, stockMappingSchema } from "./stock-sources";
import { StockConflict } from "./stock-store";
import { periodId } from "./model";

const query = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1).max(100), operation: z.enum(["list", "history", "download", "version"]).optional(),
  id: z.string().min(1).max(200).optional(), version: z.coerce.number().int().min(1).max(100000).optional() }).strict();
const headers = { "Cache-Control": "private, no-store" };
/** Disposable recipe infrastructure only; production stays closed even with the flag. */
export function requireDisposableStocks(env: Record<string, string | undefined> = process.env) {
  if (env.VERCEL_ENV === "production" || env.PROBANT_STOCKS_DURABLE !== "disposable") throw new ApiError("ST_DURABLE_DISABLED", "Le parcours Stocks durable est réservé à la recette jetable.", 503);
}
export function stockFailureStatus(code: string) {
  return /SESSION_INVALID|AUTHENTICATION_REQUIRED/.test(code) ? 401 : /FORBIDDEN|SELF_APPROVAL/.test(code) ? 403 : /NOT_FOUND/.test(code) ? 404
    : /STALE|CONFLICT|REPLACED|ALREADY_EXISTS|IDEMPOTENCY_KEY_REUSED/.test(code) ? 409
    : /^(ST_|STOCK_|IMPORT_|MAPPING_|PREPARATION_|WORKPAPER_|UNRESOLVED_|REVIEW_|CONCLUSION_|NOTE_|CALCULATION_|COMPLETED_|INPUTS_|REQUIRED_|AMOUNT_|DATE_|CSV_|XLSX_|ZIP_|UPLOAD_|FILE_|MIME_|STRING_|EMPTY_|POPULATION_|SELECTION_|REVISION_|LOCKED_|APPROVAL_|STALE_|EXPLICIT_|SHEET_|WORKSHEET_|EXCLUSIONS_)/.test(code)
      || /REQUIRED|INVALID|INCOMPLETE|NOT_ALLOWED|MISMATCH|DUPLICATE|UNKNOWN|UNSUPPORTED|OUTSIDE|IMMUTABLE/.test(code) ? 422 : 503;
}
function failure(error: unknown) {
  if (error instanceof StockConflict) return Response.json({ error: error.message, expectedVersion: error.expectedVersion, current: error.current }, { status: 409, headers });
  if (error instanceof SyntaxError || error instanceof z.ZodError) return Response.json({ error: "ST_REQUEST_INVALID" }, { status: 400, headers });
  if (error instanceof ApiError) return Response.json({ error: error.code }, { status: error.status, headers });
  if (error instanceof StockSourceError) return Response.json({ error: error.code, ...(error.locator ? { locator: error.locator } : {}) }, { status: 422, headers });
  const code = error instanceof Error ? error.message : "", status = stockFailureStatus(code);
  return Response.json({ error: status === 503 ? "ST_DURABLE_UNAVAILABLE" : code.split(":")[0] }, { status, headers });
}
function scope(request: Request) {
  const params = new URL(request.url).searchParams;
  if (new Set(params.keys()).size !== [...params.keys()].length) throw new Error("ST_QUERY_INVALID");
  const parsed = query.parse(Object.fromEntries(params));
  if (parsed.version !== undefined && !parsed.id) throw new Error("ST_QUERY_INVALID");
  return parsed;
}
async function bounded(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("ST_BODY_REQUIRED");
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new ApiError("ST_BODY_LIMIT", "Corps de requête trop volumineux pour la recette Stocks.", 413); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const p of parts) { bytes.set(p, offset); offset += p.length; }
  return new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
}
const FORM_FIELDS = ["file", "period", "documentType", "mapping"];
export function stockHandlers(create: () => StockRuntime, enabled: () => void = requireDisposableStocks, observeError?: (error: unknown) => void) {
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
          return new Response(Uint8Array.from(bytes).buffer, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Disposition": "attachment; filename=\"source-stocks\"", "X-Content-Type-Options": "nosniff" } });
        }
        if (q.operation === "version" && (!q.id || q.version === undefined)) throw new Error("WORKPAPER_VERSION_REQUIRED");
        if (q.version !== undefined && q.operation !== "version") throw new Error("ST_QUERY_INVALID");
        return Response.json(await runtime.read(request, q.dossierId, q.periodId, q.id, q.operation === "history", q.version), { headers });
      } catch (error) { return fail(error); }
    },
    POST: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        await runtime.check(request, q.dossierId, "read");
        const command = stockCommandSchema.parse(await (await bounded(request, 400_000)).json());
        return Response.json(await runtime.command(request, q.dossierId, q.periodId, command, request.headers.get("Idempotency-Key") ?? ""), { headers });
      } catch (error) { return fail(error); }
    },
    importsPOST: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        await runtime.check(request, q.dossierId, "prepare");
        const body = await bounded(request, 3.25 * 1024 * 1024), key = request.headers.get("Idempotency-Key") ?? "";
        if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
          const form = await body.formData();
          // Every stock source is a table: a file, the exercise, its type and its explicit mapping. Never more fields.
          if ([...form.keys()].some(k => !FORM_FIELDS.includes(k)) || [...form.keys()].length !== FORM_FIELDS.length) throw new Error("ST_IMPORT_FIELDS_INVALID");
          const file = form.get("file");
          if (!(file instanceof File)) throw new Error("ST_FILE_REQUIRED");
          const period = stockPeriodSchema.parse(JSON.parse(String(form.get("period"))));
          if (periodId(period) !== q.periodId) throw new Error("WORKPAPER_PERIOD_INVALID");
          const type = z.enum(ST_TYPES).parse(String(form.get("documentType")));
          return Response.json(await runtime.preview(request, q.dossierId, period, file, stockMappingSchema.parse(JSON.parse(String(form.get("mapping")))), type, key), { headers });
        }
        return Response.json(await runtime.approveImport(request, q.dossierId, q.periodId, stockApprovalSchema.parse(await body.json()), key), { headers });
      } catch (error) { return fail(error); }
    },
  };
}
