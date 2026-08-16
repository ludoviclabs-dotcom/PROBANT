import { NextResponse } from "next/server";
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

export async function GET() {
  const repository = getIngestionJobRepository();
  return NextResponse.json(
    {
      jobs: await repository.list(),
      storageMode: repository.kind,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(req: Request) {
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
    dossierId: form.get("dossierId")?.toString(),
    organizationId: form.get("organizationId")?.toString(),
    entityId: form.get("entityId")?.toString(),
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
}

