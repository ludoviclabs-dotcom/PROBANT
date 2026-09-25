import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiErrorResponse, requestIdFrom } from "@/lib/api/errors";
import { authorizeRequest } from "@/lib/auth/server";
import {
  createIngestionJob,
  getIngestionJobRepository,
  isIngestionDocumentType,
  isPersistentIngestionConfigured,
  jsonError,
  processIngestionJob,
} from "@/lib/ingestion";
import {
  clientIdentifier,
  consumeRateLimit,
  requestBodyTooLarge,
} from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const dossierIdSchema = z.string().uuid();

export async function GET(req: Request) {
  const requestId = requestIdFrom(req);
  try {
    const dossierId = dossierIdSchema.parse(new URL(req.url).searchParams.get("dossierId"));
    const principal = await authorizeRequest(req, { permission: "dossier:read", dossierId });
  const repository = getIngestionJobRepository();
  return NextResponse.json(
    {
      jobs: (await repository.list()).filter((job) =>
        job.organizationId === principal.organizationId && job.dossierId === dossierId),
      storageMode: repository.kind,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  } catch (error) {
    return apiErrorResponse(error instanceof z.ZodError
      ? new ApiError("DOSSIER_ID_INVALID", "Identifiant de dossier invalide.", 400)
      : error, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = requestIdFrom(req);
  try {
  if (requestBodyTooLarge(req)) {
    return jsonError(
      "UPLOAD_REQUEST_TOO_LARGE",
      "La requête dépasse la taille maximale autorisée.",
      413,
    );
  }
  const rateLimit = consumeRateLimit({
    key: `upload:${clientIdentifier(req)}`,
    limit: 10,
    windowMs: 5 * 60 * 1_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "UPLOAD_RATE_LIMITED",
          message: "Trop de dépôts. Réessayez après le délai indiqué.",
        },
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  const form = await req.formData().catch(() => null);
  if (!form) {
    return jsonError("INVALID_FORM_DATA", "Corps de requete multipart invalide.", 400);
  }
  // Le dossier est seulement un sélecteur : son appartenance est vérifiée par
  // le serveur avant tout dépôt. L'organisation n'est jamais fournie au service
  // par le client, et les autres identifiants de périmètre sont refusés.
  const dossierId = dossierIdSchema.safeParse(form.get("dossierId")?.toString());
  if (!dossierId.success) throw new ApiError("DOSSIER_ID_INVALID", "Identifiant de dossier invalide.", 400);
  if (form.has("organizationId") || form.has("entityId")) {
    throw new ApiError("CLIENT_SCOPE_FORBIDDEN", "Périmètre client non accepté.", 400);
  }
  const principal = await authorizeRequest(req, { permission: "dossier:upload", dossierId: dossierId.data });
  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("FILE_REQUIRED", "Aucun fichier recu.", 400);
  }
  if (process.env.VERCEL && !isPersistentIngestionConfigured()) {
    return jsonError(
      "PERSISTENT_INGESTION_NOT_CONFIGURED",
      "Le traitement de fichiers sur Vercel requiert DATABASE_URL et un Blob prive.",
      503,
    );
  }

  const documentTypeValue = form.get("documentType")?.toString();
  if (documentTypeValue && !isIngestionDocumentType(documentTypeValue)) {
    return jsonError(
      "DOCUMENT_TYPE_UNSUPPORTED",
      `Type de document non supporte : ${documentTypeValue}.`,
      400,
    );
  }
  const documentType = documentTypeValue && isIngestionDocumentType(documentTypeValue)
    ? documentTypeValue
    : undefined;
  const numberValue = (name: string) => {
    const value = form.get(name)?.toString();
    return value && /^\d{4}$/u.test(value) ? Number(value) : undefined;
  };

  const { job, validation } = await createIngestionJob({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    file,
    dossierId: dossierId.data,
    organizationId: principal.organizationId,
    entityId: dossierId.data,
    documentType,
    metadata: {
      formNumber: form.get("formNumber")?.toString(),
      formVintage: numberValue("formVintage"),
      siren: form.get("siren")?.toString(),
      expectedSiren: form.get("expectedSiren")?.toString(),
      periodStart: form.get("periodStart")?.toString(),
      periodEnd: form.get("periodEnd")?.toString(),
      expectedPeriodStart: form.get("expectedPeriodStart")?.toString(),
      expectedPeriodEnd: form.get("expectedPeriodEnd")?.toString(),
      fiscalYear: numberValue("fiscalYear"),
    },
  });
  const persistent = isPersistentIngestionConfigured();
  let processed = null;
  if (validation.ok && validation.documentType !== "unknown" && !persistent) {
    try {
      processed = await processIngestionJob(job);
    } catch {
      return jsonError(
        "INGESTION_PROCESSING_FAILED",
        "Le traitement local du fichier a échoué.",
        422,
      );
    }
  }

  return NextResponse.json(
    {
      job,
      validation,
      storageMode: persistent ? "persistent" : "memory",
      processed,
    },
    { status: validation.ok ? 201 : 202 },
  );
  } catch (error) {
    return apiErrorResponse(error, requestId);
  }
}

