import { NextResponse } from "next/server";
import { apiErrorResponse, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import { AuthorizationDenied } from "@/lib/auth/principal";
import { assertRowBelongsToPrincipal } from "@/lib/auth/dossier-scope";
import { FecStreamError } from "@/lib/fec/stream-parser";
import {
  getIngestionJobRepository,
  jsonError,
  processIngestionJob,
} from "@/lib/ingestion";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdFrom(req);
  try {
    const caller = await authorizeRequest(req, { permission: "dossier:upload" });
    const { id } = await params;
    const repository = getIngestionJobRepository();
    const job = await repository.get(id);
    if (!job || job.organizationId !== caller.organizationId) {
      return jsonError("INGESTION_NOT_FOUND", "Job d'ingestion introuvable.", 404);
    }
    let principal;
    try {
      principal = await authorizeRequest(req, { permission: "dossier:upload", dossierId: job.dossierId });
    } catch (error) {
      if (error instanceof AuthorizationDenied && error.status === 403) {
        return jsonError("INGESTION_NOT_FOUND", "Job d'ingestion introuvable.", 404);
      }
      throw error;
    }
    assertRowBelongsToPrincipal(principal, job.organizationId, "ingestion");
    if (job.status === "quarantined") {
      return jsonError("INGESTION_QUARANTINED", "Le fichier est en quarantaine.", 409, job);
    }
    try {
      const result = await processIngestionJob(job);
      return NextResponse.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      const limitError = error instanceof FecStreamError && error.code === "FEC_TOO_MANY_LINES";
      const code = limitError ? "FEC_LINE_LIMIT_EXCEEDED" : "INGESTION_PROCESSING_FAILED";
      await repository.update(id, {
        status: "failed",
        errorCode: code,
        errorMessage: limitError ? "Le FEC dépasse le nombre maximal de lignes configuré." : error instanceof Error ? error.message : "Echec du traitement.",
      });
      return jsonError(
        code,
        limitError ? "Le FEC dépasse le nombre maximal de lignes configuré." : "Le traitement du fichier a echoue.",
        422,
      );
    }
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

