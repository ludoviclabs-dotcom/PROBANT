import { apiErrorResponse, ApiError, requestIdFrom } from "@/lib/api/errors";
import {
  assertDossierAccessForAnyRole,
  SignedHeaderContextResolver,
} from "@/lib/auth/persistent-context";
import { getDatabase } from "@/lib/db/client";
import { DrizzleDossierRepository } from "@/lib/dossier/postgres-repository";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ dossierId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { dossierId } = await context.params;
    const auth = await new SignedHeaderContextResolver().resolve(request);
    assertDossierAccessForAnyRole(auth, dossierId, ["reviewer", "uploader"]);
    const snapshot = await new DrizzleDossierRepository(getDatabase()).get({
      organizationId: auth.organizationId,
      dossierId,
    });
    if (!snapshot) throw new ApiError("SNAPSHOT_NOT_FOUND", "Snapshot introuvable.", 404);
    return Response.json(snapshot, {
      headers: { "x-request-id": requestId, "cache-control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
