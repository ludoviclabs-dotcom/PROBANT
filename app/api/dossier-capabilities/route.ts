import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { getRequestAuthorizer } from "@/lib/auth/server";
import { assertDossierPermission, isExpired } from "@/lib/auth/principal";
import { getDatabase } from "@/lib/db/client";
import { capabilityReadModel } from "@/lib/capabilities/read-model";
import { ENGINE_PROCEDURES } from "@/lib/capabilities/registry";
import { readStoreHeads } from "@/lib/capabilities/store-readers";
import type { WorkpaperScope } from "@/lib/workpapers/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const query = z.object({ dossierId: z.string().uuid(), periodId: z.string().min(1).max(100) }).strict();
/** Read-only configuration and optional authorized observation; no initialization or engine execution. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(k => params.getAll(k).length !== 1)) return Response.json({ error: "CAPABILITY_QUERY_INVALID" }, { status: 400, headers });
    const configuration = capabilityReadModel(process.env);
    if (!params.size) return Response.json(configuration, { headers });
    const q = query.parse(Object.fromEntries(params));
    const enabled = ENGINE_PROCEDURES.filter(p => configuration.configuration[p.id].activated && configuration.configuration[p.id].databaseConfigured);
    // The same public configuration is returned without constructing an identity/database service when no sheet can be read.
    if (!enabled.length) return Response.json(configuration, { headers });
    const identity = await getRequestAuthorizer().authorize(request, { dossierId: q.dossierId, permission: "dossier:read" });
    assertDossierPermission(identity, q.dossierId, "dossier:read");
    if (isExpired(identity, Math.floor(Date.now() / 1000))) throw new Error("SESSION_INVALID");
    const scope: WorkpaperScope = { organizationId: identity.organizationId, dossierId: q.dossierId, periodId: q.periodId, mode: "real" };
    const response = await getDatabase().transaction(async tx => capabilityReadModel(process.env, { scope,
      rows: await readStoreHeads(tx, scope, [...new Set(enabled.map(p => p.family))]), procedures: enabled.map(p => p.id) }));
    if (isExpired(identity, Math.floor(Date.now() / 1000))) throw new Error("SESSION_INVALID");
    if (Buffer.byteLength(JSON.stringify(response)) > 10 * 1024 * 1024) return Response.json({ error: "CAPABILITY_STATE_LIMIT" }, { status: 413, headers });
    return Response.json(response, { headers });
  } catch (error) {
    const code = error instanceof ApiError ? error.code : error instanceof Error ? error.message : "CAPABILITY_UNAVAILABLE";
    const status = error instanceof z.ZodError ? 400 : error instanceof ApiError ? error.status : /SESSION_INVALID|AUTHENTICATION_REQUIRED/.test(code) ? 401 : /FORBIDDEN/.test(code) ? 403 : 503;
    return Response.json({ error: status === 503 ? "CAPABILITY_UNAVAILABLE" : status === 400 ? "CAPABILITY_QUERY_INVALID" : code }, { status, headers });
  }
}
