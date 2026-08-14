import { apiErrorResponse, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import { createPersistentIngestionRuntime } from "@/lib/ingestion/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ dossierId: string; jobId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { dossierId, jobId } = await context.params;
    const principal = await authorizeRequest(request, {
      permission: "dossier:upload",
      dossierId,
    });
    const result = await createPersistentIngestionRuntime().uploadService.complete({
      organizationId: principal.organizationId,
      dossierId,
      jobId,
    });
    return Response.json(result, {
      headers: { "x-request-id": requestId, "cache-control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
