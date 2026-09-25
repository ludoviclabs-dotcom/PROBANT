import { NextResponse } from "next/server";
import { apiErrorResponse, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import { assertRowBelongsToPrincipal } from "@/lib/auth/dossier-scope";
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
  const { id } = await params;
  const repository = getIngestionJobRepository();
  const job = await repository.get(id);
  if (!job) return jsonError("INGESTION_NOT_FOUND", "Job d'ingestion introuvable.", 404);
  const principal = await authorizeRequest(req, { permission: "dossier:upload", dossierId: job.dossierId });
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
    await repository.update(id, {
      status: "failed",
      errorCode: "INGESTION_PROCESSING_FAILED",
      errorMessage: error instanceof Error ? error.message : "Echec du traitement.",
    });
    return jsonError(
      "INGESTION_PROCESSING_FAILED",
      "Le traitement du fichier a echoue.",
      422,
    );
  }
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

