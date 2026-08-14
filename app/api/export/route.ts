import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import { assertRowBelongsToPrincipal } from "@/lib/auth/dossier-scope";
import type { DossierSnapshot } from "@/lib/dossier";
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
  organizationId: z.string().min(1).max(200),
  dossierId: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const startedAt = performance.now();
  try {
    const body = (await request.json().catch(() => null)) as
      | { snapshot?: DossierSnapshot; activeContext?: unknown }
      | null;
    const activeContext = activeContextSchema.safeParse(body?.activeContext);
    if (!body?.snapshot?.dossier || !activeContext.success) {
      throw new ApiError("EXPORT_CONTEXT_INVALID", "Snapshot ou contexte actif invalide.", 400);
    }

    /**
     * Un dossier persistant ne s'exporte jamais depuis le corps de la requête :
     * le client pourrait fabriquer un snapshot ou réclamer celui d'une autre
     * organisation. On autorise, puis on relit la source de vérité.
     */
    let snapshot = body.snapshot;
    if (snapshot.sourceKind === "persistent") {
      const principal = await authorizeRequest(request, {
        permission: "dossier:export",
        dossierId: activeContext.data.dossierId,
      });
      assertRowBelongsToPrincipal(
        principal,
        activeContext.data.organizationId,
        "contexte d'export",
      );
      const stored = await new DrizzleDossierRepository(getDatabase()).get({
        organizationId: principal.organizationId,
        dossierId: activeContext.data.dossierId,
      });
      if (!stored) throw new ApiError("SNAPSHOT_NOT_FOUND", "Snapshot introuvable.", 404);
      snapshot = stored;
    }

    const synthesis = buildSynthesisSnapshot(snapshot, {
      clock: () => snapshot.dossier.createdAt ?? new Date(0).toISOString(),
    });
    const pack = await buildEvidenceExportPackage(snapshot, synthesis, {
      applicationVersion: process.env.npm_package_version ?? "0.1.0",
      activeContext: activeContext.data,
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
    if (error instanceof ApiError) return apiErrorResponse(error, requestId);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export impossible." },
      { status: 409, headers: { "x-request-id": requestId } },
    );
  }
}
