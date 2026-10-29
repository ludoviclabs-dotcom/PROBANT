import { z } from "zod";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { ApiError } from "@/lib/api/errors";
import { durableChainEnabled } from "@/lib/runtime/profile";
import { ClientsConflict } from "./clients-persistence";
import { clientsApprovalSchema, clientsPeriodSchema, leaseCommandSchema } from "./lease-commands";
import { LEASE_TYPES, leaseMappingSchema } from "./lease-sources";
import { LeaseError, LeaseImportError, type LeaseRuntime } from "./lease-runtime";
import { periodId } from "./model";

const headers = { "Cache-Control": "private, no-store" };
const query = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1).max(100), operation: z.enum(["list", "history", "version", "download"]).optional(),
  id: z.string().min(1).max(200).optional(), version: z.coerce.number().int().positive().optional() }).strict();

/**
 * Table explicite des codes (C00, D21), étendue en C01 aux codes des couches partagées que la chaîne Locations peut lever.
 * Un code métier a toujours son statut ; seul un code absent de la table, une erreur de base ou une exception non prévue sort en 503 `L16_DURABLE_UNAVAILABLE`.
 */
export const LEASE_ERROR_STATUS: Readonly<Record<string, number>> = Object.freeze(Object.fromEntries(Object.entries({
  400: ["L16_REQUEST_INVALID", "L16_QUERY_INVALID", "IDEMPOTENCY_KEY_REQUIRED", "DOCUMENT_ID_REQUIRED"],
  401: ["AUTHENTICATION_REQUIRED", "SESSION_INVALID"],
  403: ["CSRF_TOKEN_INVALID", "ORIGIN_FORBIDDEN", "DOSSIER_FORBIDDEN", "WORKPAPER_FORBIDDEN", "PREPARATION_EDIT_FORBIDDEN", "SELF_APPROVAL_FORBIDDEN", "WORKPAPER_TRANSITION_FORBIDDEN", "PREPARER_REQUIRED", "L16_AUTHOR_MISMATCH"],
  404: ["L16_NOT_FOUND", "WORKPAPER_NOT_FOUND", "WORKPAPER_VERSION_NOT_FOUND", "IMPORT_NOT_FOUND", "SOURCE_NOT_FOUND"],
  409: ["STALE_WORKPAPER_VERSION", "IDEMPOTENCY_KEY_REUSED", "L16_SOURCE_REPLACED_REVISION_REQUIRED", "L16_RULE_REPLACED_REVISION_REQUIRED", "L16_REVISION_REPLACED", "CLIENT_SOURCE_HEAD_CONFLICT",
    "CLIENT_SOURCE_REPLACED_REVISION_REQUIRED", "EXPORT_SNAPSHOT_CONFLICT", "STALE_REVIEW", "STALE_APPROVAL", "L16_BUNDLE_STALE", "L16_BUNDLE_CONTENT_CONFLICT", "WORKPAPER_ALREADY_EXISTS", "REVISION_NOT_ALLOWED",
    "LOCKED_WORKPAPER_IMMUTABLE", "IMPORT_REJECTED_OR_STALE", "INPUTS_ALREADY_FROZEN"],
  413: ["L16_LIMIT_EXCEEDED"],
  422: ["L16_CONTRACT_INVALID", "L16_IMPORT_SCHEMA_INVALID", "L16_DUPLICATE_CONTRACT", "L16_CITATION_INVALID", "L16_CURRENT_SOURCES_REQUIRED", "L16_PERIOD_MISMATCH", "L16_BASE_UNKNOWN", "L16_BASE_MISMATCH",
    "L16_BUNDLE_ALREADY_INCLUDED", "L16_BUNDLE_NOT_REVIEWED", "L16_BUNDLE_UNBALANCED", "L16_BUNDLE_INVALID", "L16_WORK_REQUIRED", "L16_WORK_INVALID", "L16_POPULATION_MAPPING_INVALID", "L16_RATE_INVALID",
    "CALCULATION_NOT_READY", "UNRESOLVED_BLOCKING_NOTE", "PREPARATION_INCOMPLETE", "USE_DEDICATED_COMMAND", "WORKPAPER_PERIOD_INVALID", "WORKPAPER_SCOPE_MISMATCH", "WORKPAPER_INPUTS_REQUIRED",
    "REQUIRED_DOCUMENT_MISSING", "CONCLUSION_REQUIRED", "REVIEW_NOTE_REQUIRED", "NOTE_RESOLUTION_INVALID", "NOTE_ID_INVALID", "INSTANCE_KEY_REQUIRED", "PERSONAL_REVIEWER_NAME_REQUIRED",
    "DOCUMENT_TYPE_OUT_OF_SCOPE", "REAL_IMPORT_STORAGE_DISABLED", "POPULATION_EMPTY_OR_DUPLICATE", "POPULATION_IMPORT_UNAPPROVED", "POPULATION_IMPORTS_INVALID", "POPULATION_ROW_INVALID"],
  503: ["L16_DURABLE_DISABLED", "AUTH_SESSION_NOT_CONFIGURED", "DEMONSTRATION_DISABLED", "L16_ENGINE_NOT_AVAILABLE", "L16_DURABLE_UNAVAILABLE"],
}).flatMap(([status, codes]) => codes.map(code => [code, Number(status)]))));

/** Chaîne ouverte seulement par la recette jetable ou le profil personnel local (C07) ; toujours fermée sur Vercel production. */
export function requireLeasesChain(env: Record<string, string | undefined> = process.env) {
  if (!durableChainEnabled(env, "PROBANT_IFRS16_DURABLE")) throw new ApiError("L16_DURABLE_DISABLED", "Atelier réservé à la recette jetable ou au profil personnel local.", 503);
}
export function leaseFailure(e: unknown) {
  if (e instanceof ClientsConflict) return Response.json({ error: e.message, current: e.current, expectedVersion: e.expectedVersion }, { status: 409, headers });
  if (e instanceof SyntaxError || e instanceof z.ZodError) return Response.json({ error: "L16_REQUEST_INVALID" }, { status: 400, headers });
  if (e instanceof ApiError) return Response.json({ error: e.code }, { status: e.status, headers });
  if (e instanceof LeaseImportError) return Response.json({ error: e.message }, { status: 422, headers });
  if (e instanceof DrizzleQueryError || !(e instanceof Error)) return Response.json({ error: "L16_DURABLE_UNAVAILABLE" }, { status: 503, headers });
  const status = LEASE_ERROR_STATUS[e.message];
  if (!status) return Response.json({ error: "L16_DURABLE_UNAVAILABLE" }, { status: 503, headers });
  return Response.json({ error: e.message, ...(e instanceof LeaseError && e.missing?.length ? { missing: e.missing } : {}) }, { status, headers });
}
async function bounded(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("L16_REQUEST_INVALID");
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel(); throw new ApiError("L16_LIMIT_EXCEEDED", "Requête trop volumineuse.", 413); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return new Request(request.url, { method: request.method, headers: request.headers, body: bytes });
}
function scope(request: Request) {
  const p = new URL(request.url).searchParams;
  if (new Set(p.keys()).size !== [...p.keys()].length) throw new Error("L16_QUERY_INVALID");
  const q = query.safeParse(Object.fromEntries(p));
  if (!q.success || (q.data.version !== undefined && (!q.data.id || q.data.operation !== "version")) || (q.data.operation === "version" && q.data.version === undefined)) throw new Error("L16_QUERY_INVALID");
  return q.data;
}

/** Commandes HTTP de l'atelier (C00 § 8). L'export et le scénario de démonstration arrivent avec le moteur et la revue (L16-02, L16-05). */
export function leaseHandlers(create: () => LeaseRuntime, enabled: () => void = requireLeasesChain, report: (error: unknown) => void = () => {}) {
  return {
    GET: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        if (q.operation === "download") {
          if (!q.id) throw new Error("DOCUMENT_ID_REQUIRED");
          const bytes = await runtime.download(request, q.dossierId, q.periodId, q.id);
          if (!bytes) throw new Error("SOURCE_NOT_FOUND");
          return new Response(Uint8Array.from(bytes).buffer, { headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Disposition": "attachment; filename=\"source-locations-ifrs16\"", "X-Content-Type-Options": "nosniff" } });
        }
        return Response.json(await runtime.leaseRead(request, q.dossierId, q.periodId, q.id, q.operation === "history", q.version), { headers });
      } catch (e) { report(e); return leaseFailure(e); }
    },
    POST: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        await runtime.check(request, q.dossierId, "read");
        const command = leaseCommandSchema.parse(await (await bounded(request, 500_000)).json());
        return Response.json(await runtime.leaseCommand(request, q.dossierId, q.periodId, command, request.headers.get("Idempotency-Key") ?? ""), { headers });
      } catch (e) { report(e); return leaseFailure(e); }
    },
    importsPOST: async (request: Request) => {
      try {
        enabled();
        const q = scope(request), runtime = create();
        await runtime.check(request, q.dossierId, "prepare");
        const body = await bounded(request, 3.25 * 1024 * 1024), key = request.headers.get("Idempotency-Key") ?? "";
        if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
          const form = await body.formData();
          if ([...form.keys()].some(k => !["file", "mapping", "period", "documentType"].includes(k)) || [...form.keys()].length !== 4) throw new Error("L16_REQUEST_INVALID");
          const file = form.get("file");
          if (!(file instanceof File)) throw new Error("L16_REQUEST_INVALID");
          const period = clientsPeriodSchema.parse(JSON.parse(String(form.get("period"))));
          if (periodId(period) !== q.periodId) throw new Error("WORKPAPER_PERIOD_INVALID");
          const type = z.enum(LEASE_TYPES).parse(form.get("documentType")), mapping = leaseMappingSchema.parse(JSON.parse(String(form.get("mapping"))));
          return Response.json(await runtime.previewLease(request, q.dossierId, period, file, mapping, type, key), { headers });
        }
        return Response.json(await runtime.approveImport(request, q.dossierId, q.periodId, clientsApprovalSchema.parse(await body.json()), key), { headers });
      } catch (e) { report(e); return leaseFailure(e); }
    },
  };
}
