import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { closingCommandSchema, pieceUploadSchema } from "./closing-contract";
import type { ClosingRuntime } from "./closing-runtime";
import { ClosingConflict } from "./closing-store";

const query = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1).max(100), operation: z.literal("download").optional(), id: z.string().regex(/^PC-\d{1,4}-v\d{1,3}$/).optional() }).strict();
const headers = { "Cache-Control": "private, no-store" };
/** Disposable recipe infrastructure only; production stays closed even with the flag. */
export function requireDisposableClosing(env: Record<string, string | undefined> = process.env) {
  if (env.VERCEL_ENV === "production" || env.PROBANT_CLOSING_DURABLE !== "disposable") throw new ApiError("CL_DURABLE_DISABLED", "Le dossier de clôture durable est réservé à la recette jetable.", 503);
}
export function closingFailureStatus(code: string) {
  // An altered journal or piece is an integrity failure of the server, never a user input error.
  return /CL_JOURNAL_CORRUPTED|CL_PIECE_BYTES_CHANGED/.test(code) ? 500 : /SESSION_INVALID|AUTHENTICATION_REQUIRED/.test(code) ? 401 : /FORBIDDEN/.test(code) ? 403 : /NOT_FOUND/.test(code) ? 404
    : /STALE|CONFLICT|IDEMPOTENCY_KEY_REUSED/.test(code) ? 409
    : /^(CL_|WORKPAPER_|IDEMPOTENCY_)/.test(code) ? 422 : 503;
}
function failure(error: unknown) {
  if (error instanceof ClosingConflict) return Response.json({ error: error.message, currentSeq: error.currentSeq, expectedSeq: error.expectedSeq }, { status: 409, headers });
  if (error instanceof SyntaxError || error instanceof z.ZodError) return Response.json({ error: "CL_REQUEST_INVALID" }, { status: 400, headers });
  if (error instanceof ApiError) return Response.json({ error: error.code }, { status: error.status, headers });
  const code = error instanceof Error ? error.message : "", status = closingFailureStatus(code);
  return Response.json({ error: status === 503 ? "CL_DURABLE_UNAVAILABLE" : code.split(":")[0] }, { status, headers });
}
function scope(request: Request) {
  const params = new URL(request.url).searchParams;
  if (new Set(params.keys()).size !== [...params.keys()].length) throw new Error("CL_QUERY_INVALID");
  const parsed = query.parse(Object.fromEntries(params));
  if ((parsed.operation === "download") !== !!parsed.id) throw new Error("CL_QUERY_INVALID");
  return parsed;
}
async function bounded(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("CL_BODY_REQUIRED");
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new ApiError("CL_BODY_LIMIT", "Corps de requête trop volumineux pour le dossier de clôture.", 413); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const p of parts) { bytes.set(p, offset); offset += p.length; }
  return new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
}
const FORM_FIELDS = ["file", "meta"];
/** The stored (already neutralized) file name, with an ASCII fallback and its RFC 5987 UTF-8 form: versions stay distinguishable once saved. */
export function attachmentName(fileName: string) {
  const name = fileName.replace(/[\r\n]/g, "").trim() || "piece-dossier";
  const ascii = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]|["\\]/g, "_");
  return "attachment; filename=\"" + ascii + "\"; filename*=UTF-8''" + encodeURIComponent(name).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
export function closingHandlers(create: () => ClosingRuntime, enabled: () => void = requireDisposableClosing, observeError?: (error: unknown) => void) {
  const fail = (error: unknown) => { observeError?.(error); return failure(error); };
  return {
    GET: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        if (q.operation === "download") {
          const found = await runtime.download(request, q.dossierId, q.periodId, q.id!);
          if (!found) return Response.json({ error: "CL_PIECE_NOT_FOUND" }, { status: 404, headers });
          return new Response(Uint8Array.from(found.bytes).buffer, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Disposition": attachmentName(found.fileName), "X-Content-Type-Options": "nosniff" } });
        }
        return Response.json(await runtime.read(request, q.dossierId, q.periodId), { headers });
      } catch (error) { return fail(error); }
    },
    POST: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        if (q.operation) throw new Error("CL_QUERY_INVALID");
        await runtime.check(request, q.dossierId, "read");
        const command = closingCommandSchema.parse(await (await bounded(request, 200_000)).json());
        return Response.json(await runtime.command(request, q.dossierId, q.periodId, command, request.headers.get("Idempotency-Key") ?? ""), { headers });
      } catch (error) { return fail(error); }
    },
    piecesPOST: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        if (q.operation) throw new Error("CL_QUERY_INVALID");
        await runtime.check(request, q.dossierId, "prepare");
        if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new Error("CL_MULTIPART_REQUIRED");
        const form = await (await bounded(request, 3.25 * 1024 * 1024)).formData();
        // A piece is exactly a file and its description (expected journal head, label, kind, optional piece to version). Never more fields.
        if ([...form.keys()].some(k => !FORM_FIELDS.includes(k)) || [...form.keys()].length !== FORM_FIELDS.length) throw new Error("CL_UPLOAD_FIELDS_INVALID");
        const file = form.get("file");
        if (!(file instanceof File)) throw new Error("CL_FILE_REQUIRED");
        const meta = pieceUploadSchema.parse(JSON.parse(String(form.get("meta"))));
        return Response.json(await runtime.upload(request, q.dossierId, q.periodId, file, meta, request.headers.get("Idempotency-Key") ?? ""), { headers });
      } catch (error) { return fail(error); }
    },
  };
}
