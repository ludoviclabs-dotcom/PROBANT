import { NextResponse } from "next/server";
import { apiErrorResponse, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import { AuthorizationDenied } from "@/lib/auth/principal";
import { assertRowBelongsToPrincipal } from "@/lib/auth/dossier-scope";
import { getIngestionJobRepository, jsonError } from "@/lib/ingestion";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdFrom(req);
  try {
    const caller = await authorizeRequest(req, { permission: "dossier:read" });
    const { id } = await params;
    const job = await getIngestionJobRepository().get(id);
    if (!job || job.organizationId !== caller.organizationId) {
      return jsonError("INGESTION_NOT_FOUND", "Job d'ingestion introuvable.", 404);
    }
    let principal;
    try {
      principal = await authorizeRequest(req, { permission: "dossier:read", dossierId: job.dossierId });
    } catch (error) {
      if (error instanceof AuthorizationDenied && error.status === 403) {
        return jsonError("INGESTION_NOT_FOUND", "Job d'ingestion introuvable.", 404);
      }
      throw error;
    }
    assertRowBelongsToPrincipal(principal, job.organizationId, "ingestion");
    return NextResponse.json(
      { job },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

