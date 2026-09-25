import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import { assertRowBelongsToPrincipal } from "@/lib/auth/dossier-scope";
import { DrizzleDossierRepository } from "@/lib/dossier/postgres-repository";
import { getDatabase } from "@/lib/db/client";
import { buildEvidenceExportPackage } from "@/lib/evidence/package";
import { recordMetric } from "@/lib/observability/metrics";
import { buildSynthesisSnapshot } from "@/lib/synthesis";

export const runtime = "nodejs";

/** Aucun GET implicite: il exportait historiquement DEMO quel que soit le dossier actif. */
export async function GET() {
  return NextResponse.json(
    { error: "Un snapshot et son contexte actif explicites sont requis." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

const activeContextSchema = z.object({
  dossierId: z.string().uuid(),
});

async function readBoundedJson(request: Request): Promise<{ activeContext?: unknown } | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) {
      await reader.cancel();
      throw new ApiError("EXPORT_REQUEST_TOO_LARGE", "Requête d'export trop volumineuse.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as { activeContext?: unknown } | null;
  } catch {
    throw new ApiError("EXPORT_CONTEXT_INVALID", "Corps JSON invalide.", 400);
  }
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const startedAt = performance.now();
  try {
    // L'export serveur ne reçoit jamais de snapshot client. Un corps borné
    // évite de charger un dossier entier forgé avant l'autorisation.
    const body = await readBoundedJson(request);
    const activeContext = activeContextSchema.safeParse(body?.activeContext);
    if (!activeContext.success) {
      throw new ApiError("EXPORT_CONTEXT_INVALID", "Contexte actif invalide.", 400);
    }

    // Le client sélectionne le dossier ; le serveur vérifie les droits et
    // recharge le snapshot persistant dans l'organisation authentifiée.
    const principal = await authorizeRequest(request, {
      permission: "dossier:export",
      dossierId: activeContext.data.dossierId,
    });
    const trustedContext = {
      organizationId: principal.organizationId,
      dossierId: activeContext.data.dossierId,
    };
    const snapshot = await new DrizzleDossierRepository(getDatabase()).get(trustedContext);
    if (!snapshot) throw new ApiError("SNAPSHOT_NOT_FOUND", "Snapshot introuvable.", 404);
    assertRowBelongsToPrincipal(principal, trustedContext.organizationId, "contexte d'export");

    const synthesis = buildSynthesisSnapshot(snapshot, {
      clock: () => snapshot.dossier.createdAt ?? new Date(0).toISOString(),
    });
    const pack = await buildEvidenceExportPackage(snapshot, synthesis, {
      applicationVersion: process.env.npm_package_version ?? "0.1.0",
      activeContext: trustedContext,
    });
    const artifact = pack.manifest.artifacts.find((item) => item.format === "canonical_json");
    recordMetric("export_duration_ms", performance.now() - startedAt, { outcome: "success" });
    return new NextResponse(pack.canonicalJson, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${artifact?.fileName ?? "probant-evidence.json"}"`,
        "Cache-Control": "private, no-store",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    recordMetric("export_duration_ms", performance.now() - startedAt, { outcome: "error" });
    // Erreur imprévue (configuration, base, génération) : réponse générique,
    // jamais le message interne renvoyé à un appelant non authentifié.
    return apiErrorResponse(error, requestId);
  }
}
