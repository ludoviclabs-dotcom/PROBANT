import { apiErrorResponse, ApiError, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
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
    const principal = await authorizeRequest(request, {
      permission: "dossier:read",
      dossierId,
    });
    const snapshot = await new DrizzleDossierRepository(getDatabase()).get({
      organizationId: principal.organizationId,
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
