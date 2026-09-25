import { NextResponse } from "next/server";
import { apiErrorResponse, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import { assertRowBelongsToPrincipal } from "@/lib/auth/dossier-scope";
import { getIngestionJobRepository, jsonError } from "@/lib/ingestion";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = requestIdFrom(req);
  try {
  const { id } = await params;
  const job = await getIngestionJobRepository().get(id);
  if (!job) return jsonError("INGESTION_NOT_FOUND", "Job d'ingestion introuvable.", 404);
  const principal = await authorizeRequest(req, { permission: "dossier:read", dossierId: job.dossierId });
  assertRowBelongsToPrincipal(principal, job.organizationId, "ingestion");
  return NextResponse.json(
    { job },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

