import { DrizzleQueryError } from "drizzle-orm/errors";
import { PAYABLE_TYPES, payablesMappingSchema } from "./payables-investigation";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { ClientsConflict } from "./clients-persistence";
import { clientsApprovalSchema, payablesCommandSchema, clientsPeriodSchema } from "./payables-commands";
import { periodId } from "./model";
import type { PayablesRuntime } from "./payables-runtime";
const query = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1).max(100),
    operation: z.enum(["list", "history", "download", "mission", "version"]).optional(), id: z.string().min(1).max(200).optional(), rootId: z.string().min(1).max(200).optional(), version: z.coerce.number().int().min(1).max(100000).optional() }).strict();
const exportBody = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1).max(100), rootId: z.string().min(1).max(200).optional(), id: z.string().min(1).max(200).optional(), version: z.number().int().min(1).max(100000).optional(), kind: z.enum(["diagnostic", "approved"]), format: z.enum(["json", "html", "pdf", "manifest", "exceptions_csv", "decisions_csv", "procedures_csv", "sources_csv"]), expectedSnapshotHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
const headers = { "Cache-Control": "private, no-store" };
export function requireDisposablePayables(env: Record<string, string | undefined> = process.env) {
    if (env.VERCEL_ENV === "production" || env.PROBANT_PAYABLES_DURABLE !== "disposable")
        throw new ApiError("PAYABLES_DURABLE_DISABLED", "Le parcours fournisseurs durable est réservé à la recette jetable.", 503);
}
function failure(error: unknown) {
    if (error instanceof ClientsConflict)
        return Response.json({ error: error.message, expectedVersion: error.expectedVersion, current: error.current }, { status: 409, headers });
    if (error instanceof SyntaxError || error instanceof z.ZodError)
        return Response.json({ error: "CLIENT_REQUEST_INVALID" }, { status: 400, headers });
    if (error instanceof ApiError)
        return Response.json({ error: error.code }, { status: error.status, headers });
    if (error instanceof DrizzleQueryError || (error instanceof Error && error.name === "PostgresError")) {
        return Response.json({ error: "PAYABLES_DURABLE_UNAVAILABLE" }, { status: 503, headers });
    }
    const code = (error instanceof Error && /^[A-Z][A-Z0-9_]*(?::[A-Za-z0-9_]+)?$/.test(error.message)) ? error.message : "";
    const status = /SESSION_INVALID/.test(code) ? 401 : /FORBIDDEN|SELF_APPROVAL/.test(code) ? 403 : /NOT_FOUND/.test(code) ? 404 :
        /STALE|CONFLICT|REPLACED|ALREADY_EXISTS|IDEMPOTENCY_KEY_REUSED/.test(code) ? 409 :
            /REQUIRED|INVALID|INCOMPLETE|NOT_ALLOWED|NOT_READY|IMMUTABLE|UNRESOLVED|CHANGED|UNAPPROVED|FROZEN|OUT_OF_SCOPE|MISMATCH|OVERALLOCATED|DISABLED|UNSUPPORTED|ABSENT/.test(code) ? 422 : 503;
    return Response.json({ error: status === 503 ? "PAYABLES_DURABLE_UNAVAILABLE" : code }, { status, headers });
}
function scope(request: Request) {
    const params = new URL(request.url).searchParams;
    if (new Set(params.keys()).size !== [...params.keys()].length)
        throw new Error("CLIENT_QUERY_INVALID");
    const parsed = query.parse(Object.fromEntries(params));
    if (parsed.version !== undefined && !parsed.id)
        throw new Error("CLIENT_QUERY_INVALID");
    return parsed;
}
async function bounded(request: Request, max: number) {
    const reader = request.body?.getReader();
    if (!reader)
        throw new Error("CLIENT_BODY_REQUIRED");
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        size += value.length;
        if (size > max) {
            await reader.cancel();
            throw new ApiError("CLIENT_BODY_LIMIT", "Corps de requête trop volumineux pour ce cadrage.", 413);
        }
        parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const p of parts) {
        bytes.set(p, offset);
        offset += p.length;
    }
    return new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
}
export function payablesHandlers(create: () => PayablesRuntime, enabled: () => void = requireDisposablePayables, observeError?: (error: unknown) => void) {
    const fail = (error: unknown) => { observeError?.(error); return failure(error); };
    return {
        GET: async (request: Request) => {
            try {
                enabled();
                const q = scope(request), runtime = create();
                if (q.operation === "download") {
                    if (!q.id)
                        throw new Error("DOCUMENT_ID_REQUIRED");
                    const bytes = await runtime.download(request, q.dossierId, q.periodId, q.id);
                    if (!bytes)
                        return Response.json({ error: "SOURCE_NOT_FOUND" }, { status: 404, headers });
                    return new Response(Uint8Array.from(bytes).buffer, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="source-fournisseurs"', "X-Content-Type-Options": "nosniff" } });
                }
                if (q.operation === "mission")
                    return Response.json(await runtime.payablesMission(request, q.dossierId, q.periodId, { rootId: q.rootId, id: q.id, version: q.version }), { headers });
                if (q.operation === "version" && (!q.id || q.version === undefined))
                    throw new Error("WORKPAPER_VERSION_REQUIRED");
                if (q.version !== undefined && q.operation !== "version")
                    throw new Error("CLIENT_QUERY_INVALID");
                return Response.json(await runtime.payablesRead(request, q.dossierId, q.periodId, q.id, q.operation === "history", q.version), { headers });
            }
            catch (error) {
                return fail(error);
            }
        },
        POST: async (request: Request) => {
            try {
                enabled();
                const q = scope(request), runtime = create();
                await runtime.check(request, q.dossierId, "read");
                const input = await (await bounded(request, 200000)).json(), command = payablesCommandSchema.parse(input);
                const result = await runtime.payablesCommand(request, q.dossierId, q.periodId, command, request.headers.get("Idempotency-Key") ?? "");
                return Response.json(result, { headers });
            }
            catch (error) {
                return fail(error);
            }
        },
        exportPOST: async (request: Request) => {
            try {
                enabled();
                const input = exportBody.parse(await (await bounded(request, 4096)).json()), runtime = create();
                const pack = await runtime.payablesExport(request, input.dossierId, input.periodId, { rootId: input.rootId, id: input.id, version: input.version }, input.kind, input.expectedSnapshotHash);
                const format = ({ json: "canonical_json", html: "accessible_html", pdf: "pdf", manifest: "manifest", exceptions_csv: "findings_csv", decisions_csv: "review_events_csv", procedures_csv: "controls_csv", sources_csv: "sources_csv" } as const)[input.format];
                const entry = pack.manifest.artifacts.find(a => a.format === format);
                const content = input.format === "json" ? pack.canonicalJson : input.format === "manifest" ? pack.manifestJson : input.format === "html" ? pack.html : input.format === "exceptions_csv" ? pack.csv.findings : input.format === "decisions_csv" ? pack.csv.reviewEvents : input.format === "procedures_csv" ? pack.csv.controls : input.format === "sources_csv" ? pack.csv.sources : Uint8Array.from(pack.pdf).buffer;
                return new Response(content, { headers: { ...headers, "Content-Type": entry?.mediaType ?? "application/json", "Content-Disposition": 'attachment; filename="' + (entry?.fileName ?? "probant-payables-" + input.kind + "-manifest.json") + '"', "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'", "X-Probant-Snapshot": pack.manifest.snapshotSha256 } });
            }
            catch (error) {
                return fail(error);
            }
        },
        importsPOST: async (request: Request) => {
            try {
                enabled();
                const q = scope(request), runtime = create();
                await runtime.check(request, q.dossierId, "prepare");
                const body = await bounded(request, 3.25 * 1024 * 1024), key = request.headers.get("Idempotency-Key") ?? "";
                if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
                    const form = await body.formData();
                    if ([...form.keys()].some((k) => !["file", "mapping", "period", "documentType"].includes(k)) || [...form.keys()].length !== 4)
                        throw new Error("CLIENT_IMPORT_FIELDS_INVALID");
                    const file = form.get("file");
                    if (!(file instanceof File))
                        throw new Error("CLIENT_FILE_REQUIRED");
                    const period = clientsPeriodSchema.parse(JSON.parse(String(form.get("period"))));
                    if (periodId(period) !== q.periodId)
                        throw new Error("WORKPAPER_PERIOD_INVALID");
                    const type = z.enum(PAYABLE_TYPES).parse(form.get("documentType"));
                    const rawMapping = JSON.parse(String(form.get("mapping")));
                    const mapping = payablesMappingSchema.parse(rawMapping);
                    return Response.json(await runtime.previewPayables(request, q.dossierId, period, file, mapping, type, key), { headers });
                }
                const command = clientsApprovalSchema.parse(await body.json());
                return Response.json(await runtime.approveImport(request, q.dossierId, q.periodId, command, key), { headers });
            }
            catch (error) {
                return fail(error);
            }
        }
    };
}
