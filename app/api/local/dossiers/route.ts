import { z } from "zod";
import { ApiError, apiErrorResponse, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db/client";
import { assertLocalSession, createLocalDossier, listLocalDossiers, localDossierInput } from "@/lib/runtime/local-dossiers";
import { executionProfile } from "@/lib/runtime/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const disabled = (requestId: string) => Response.json({ error: "LOCAL_PROFILE_DISABLED" }, { status: 404, headers: { "cache-control": "private, no-store", "x-request-id": requestId } });

/** Dossiers de l'organisation locale (profil personnel, C07). */
export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  if (executionProfile(process.env) !== "personal_local") return disabled(requestId);
  try {
    const principal = await authorizeRequest(request, { permission: "dossier:read" });
    assertLocalSession(principal);
    const dossiers = await listLocalDossiers(getDatabase(), principal.organizationId);
    return Response.json({ dossiers }, { headers: { "cache-control": "private, no-store", "x-request-id": requestId } });
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

/** Crée la ligne de dossier exigée par les chaînes durables ; un double envoi retrouve le même dossier. */
export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  if (executionProfile(process.env) !== "personal_local") return disabled(requestId);
  try {
    const principal = await authorizeRequest(request, { permission: "dossier:upload" });
    assertLocalSession(principal);
    const text = await request.text();
    if (text.length > 4_096) throw new ApiError("REQUEST_TOO_LARGE", "Requête trop volumineuse.", 413);
    const parsed = localDossierInput.safeParse(JSON.parse(text || "null"));
    if (!parsed.success) throw new ApiError("REQUEST_INVALID", "Raison sociale, SIREN (9 chiffres, facultatif) et exercice attendus.", 400);
    const result = await createLocalDossier(getDatabase(), principal.organizationId, parsed.data);
    return Response.json(result, { status: result.created ? 201 : 200, headers: { "cache-control": "private, no-store", "x-request-id": requestId } });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) return apiErrorResponse(new ApiError("REQUEST_INVALID", "Corps JSON invalide.", 400), requestId);
    return apiErrorResponse(error, requestId);
  }
}
