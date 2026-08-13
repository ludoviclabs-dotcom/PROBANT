import { apiErrorResponse, requestIdFrom } from "@/lib/api/errors";
import {
  assertDossierAccess,
  SignedHeaderContextResolver,
} from "@/lib/auth/persistent-context";
import { createPersistentIngestionRuntime } from "@/lib/ingestion/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ dossierId: string; jobId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { dossierId, jobId } = await context.params;
    const auth = await new SignedHeaderContextResolver().resolve(request);
    assertDossierAccess(auth, dossierId, "uploader");
    const result = await createPersistentIngestionRuntime().uploadService.complete({
      organizationId: auth.organizationId,
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
