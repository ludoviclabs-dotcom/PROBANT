import { apiErrorResponse, ApiError, requestIdFrom } from "@/lib/api/errors";
import { createLocalObjectStorage } from "@/lib/ingestion/local-runtime";
import { executionProfile } from "@/lib/runtime/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Envoi direct d'une pièce vers le stockage local (C07), équivalent de l'URL
 * pré-signée S3 : l'autorisation scellée et éphémère porte la clé, la taille,
 * le type et l'empreinte ; la pièce est écrite une seule fois sur le PC.
 */
export async function PUT(request: Request) {
  const requestId = requestIdFrom(request);
  const headers = { "cache-control": "no-store", "x-request-id": requestId } as const;
  if (executionProfile(process.env) !== "personal_local") return Response.json({ error: "LOCAL_PROFILE_DISABLED" }, { status: 404, headers });
  try {
    const grant = new URL(request.url).searchParams.get("grant");
    if (!grant) throw new ApiError("LOCAL_UPLOAD_GRANT_INVALID", "Autorisation d'envoi absente.", 403);
    const stored = await createLocalObjectStorage().receive(grant, request.headers.get("content-type"), request.body);
    return Response.json({ stored: true, contentLength: stored.contentLength }, { headers });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}
