import { z } from "zod";
import { apiErrorResponse, ApiError, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import { actingRoleFor } from "@/lib/auth/roles";
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
    const principal = await authorizeRequest(request, {
      permission: "dossier:review",
      dossierId,
    });
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError("REVIEW_EVENT_INVALID", "Décision de revue invalide.", 400);
    }
    const snapshot = await new DrizzleReviewEventRepository(getDatabase()).append(
      { organizationId: principal.organizationId, dossierId },
      {
        ...parsed.data,
        actorId: principal.subject,
        actorRole: actingRoleFor(principal.roles, "dossier:review"),
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

