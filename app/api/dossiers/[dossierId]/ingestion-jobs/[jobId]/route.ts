import { apiErrorResponse, ApiError, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import { createPersistentIngestionRuntime } from "@/lib/ingestion/runtime";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ dossierId: string; jobId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { dossierId, jobId } = await context.params;
    const principal = await authorizeRequest(request, {
      permission: "dossier:read",
      dossierId,
    });
    const record = await createPersistentIngestionRuntime().repository.getUploadIntent(
      principal.organizationId,
      dossierId,
      jobId,
    );
    if (!record) throw new ApiError("INGESTION_JOB_NOT_FOUND", "Job d'ingestion introuvable.", 404);
    return Response.json(
      {
        id: record.job.id,
        sourceDocumentId: record.document.id,
        status: record.job.status,
        attempt: record.job.attempt,
        parserVersion: record.job.parserVersion,
        startedAt: record.job.startedAt,
        completedAt: record.job.completedAt,
        lineCount: record.job.lineCount,
        warningCount: record.job.warningCount,
        errorCode: record.job.errorCode,
      },
      { headers: { "x-request-id": requestId, "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
