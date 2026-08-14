import { z } from "zod";
import { apiErrorResponse, ApiError, requestIdFrom } from "@/lib/api/errors";
import { assertDossierAccess, SignedHeaderContextResolver } from "@/lib/auth/persistent-context";
import { getDatabase } from "@/lib/db/client";
import { DrizzleReviewEventRepository } from "@/lib/dossier/review-repository";

export const runtime = "nodejs";

const requestSchema = z.object({
  findingId: z.string().min(1).max(300),
  newStatus: z.enum([
    "pending",
    "needs_evidence",
    "confirmed",
    "dismissed",
    "corrected",
    "superseded",
  ]),
  comment: z.string().max(4_000).optional(),
  relatedEvidenceIds: z.array(z.string().min(1).max(300)).max(100).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ dossierId: string }> },
) {
  const requestId = requestIdFrom(request);
  try {
    const { dossierId } = await context.params;
    const auth = await new SignedHeaderContextResolver().resolve(request);
    assertDossierAccess(auth, dossierId, "reviewer");
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError("REVIEW_EVENT_INVALID", "Décision de revue invalide.", 400);
    }
    const actorRole = auth.roles.includes("reviewer") ? "reviewer" : "admin";
    const snapshot = await new DrizzleReviewEventRepository(getDatabase()).append(
      { organizationId: auth.organizationId, dossierId },
      {
        ...parsed.data,
        actorId: auth.sub,
        actorRole,
      },
    );
    return Response.json(snapshot, {
      status: 201,
      headers: { "x-request-id": requestId, "cache-control": "private, no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

