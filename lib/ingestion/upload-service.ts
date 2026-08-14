import { ApiError } from "@/lib/api/errors";
import { extensionOf, neutralizeFileName } from "@/lib/security/filename";
import type { ObjectStorage, StoredObjectRef } from "@/lib/storage/types";
import type { IngestionLimits } from "./limits";
import type { IngestionJobQueue } from "./queue";
import type { UploadQuotaService } from "./quota";
import type { DrizzleIngestionRepository, UploadIntentRecord } from "./repository";

export interface StartDirectUploadInput {
  organizationId: string;
  dossierId: string;
  fileName: string;
  documentType: "fec" | "balance" | "pdf" | "cycle_document";
  contentType: string;
  contentLength: number;
  checksumSha256Base64?: string;
  idempotencyKey: string;
  parserVersion: string;
  requestId: string;
  expiresInSeconds: number;
}

const MIME_BY_EXTENSION: Record<string, readonly string[]> = {
  txt: ["text/plain", "text/tab-separated-values", "application/octet-stream"],
  csv: ["text/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream"],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ],
  pdf: ["application/pdf"],
};

const EXTENSIONS_BY_DOCUMENT_TYPE: Record<StartDirectUploadInput["documentType"], readonly string[]> = {
  fec: ["txt", "csv"],
  balance: ["xlsx", "csv"],
  pdf: ["pdf"],
  cycle_document: ["xlsx", "csv", "pdf"],
};

/**
 * Contrat de fichier vérifié **avant** toute signature d'URL.
 *
 * L'extension est lue sur le nom neutralisé : `rapport.txt‮xslx.exe` ne
 * doit pas passer pour un `.txt`, et `../../etc/passwd` n'a pas d'extension.
 */
export function validateFileContract(input: StartDirectUploadInput): void {
  const extension = extensionOf(input.fileName);
  if (extension === "xls") {
    throw new ApiError(
      "XLS_LEGACY_NOT_SUPPORTED",
      "Le format XLS historique doit être converti en XLSX.",
      415,
    );
  }
  if (!EXTENSIONS_BY_DOCUMENT_TYPE[input.documentType].includes(extension)) {
    throw new ApiError("FILE_EXTENSION_MISMATCH", "Extension incompatible avec le document.", 415);
  }
  if (!MIME_BY_EXTENSION[extension]?.includes(input.contentType.toLowerCase())) {
    throw new ApiError("FILE_MIME_MISMATCH", "Type MIME incompatible avec l'extension.", 415);
  }
}

function objectRef(storage: ObjectStorage, record: UploadIntentRecord): StoredObjectRef {
  return {
    provider: storage.provider,
    bucket: record.document.storageBucket,
    key: record.document.storageKey,
    versionId: record.document.storageVersionId ?? undefined,
  };
}

export class DirectUploadService {
  constructor(
    private readonly repository: DrizzleIngestionRepository,
    private readonly storage: ObjectStorage,
    private readonly queue: IngestionJobQueue,
    private readonly limits: IngestionLimits,
    private readonly quota: UploadQuotaService | null = null,
  ) {}

  async start(input: StartDirectUploadInput) {
    validateFileContract(input);
    if (input.contentLength <= 0 || input.contentLength > this.limits.maxUploadBytes) {
      throw new ApiError("UPLOAD_TOO_LARGE", "Taille de fichier refusée.", 413, false, {
        limitBytes: this.limits.maxUploadBytes,
        observedBytes: input.contentLength,
      });
    }
    if (input.contentLength > this.storage.maxDirectUploadBytes) {
      throw new ApiError("DIRECT_UPLOAD_PROVIDER_LIMIT", "Taille incompatible avec cet upload direct.", 413);
    }
    /**
     * Rate limit et quota **avant** la création de l'intention : une
     * organisation au-delà de son quota ne doit ni écrire en base ni recevoir
     * d'autorisation d'écriture vers le stockage objet.
     *
     * La réservation est rendue plus bas si l'intention existait déjà : la
     * consommation doit suivre les fichiers réellement déposés, pas les
     * requêtes reçues. Sans cela, quelques rejeux légitimes — un client qui
     * perd la réponse HTTP et réessaie avec la même clé d'idempotence —
     * épuiseraient le quota du jour.
     */
    const reservation = await this.quota?.reserve(
      input.organizationId,
      input.contentLength,
    );

    const record = await this.repository.createOrGetUploadIntent({
      organizationId: input.organizationId,
      dossierId: input.dossierId,
      // Le nom d'origine n'est jamais persisté tel quel : il est réaffiché.
      originalName: neutralizeFileName(input.fileName),
      documentType: input.documentType,
      contentType: input.contentType,
      contentLength: input.contentLength,
      checksumSha256Base64: input.checksumSha256Base64,
      idempotencyKey: input.idempotencyKey,
      parserVersion: input.parserVersion,
      requestId: input.requestId,
      storageBucket: this.storage.bucket,
    });

    // Rejeu idempotent : ce fichier a déjà été compté lors du premier appel.
    if (reservation && !record.created) {
      await this.quota?.release(reservation);
    }

    const sameIntent =
      record.document.originalName === neutralizeFileName(input.fileName) &&
      record.document.documentType === input.documentType &&
      record.document.declaredMimeType === input.contentType &&
      record.document.declaredByteSize === input.contentLength &&
      (record.document.declaredChecksumSha256 ?? undefined) === input.checksumSha256Base64;
    if (!sameIntent) {
      throw new ApiError(
        "IDEMPOTENCY_KEY_CONFLICT",
        "Cette clé d'idempotence désigne déjà un autre upload.",
        409,
      );
    }

    if (!['created', 'uploading'].includes(record.job.status)) {
      return {
        jobId: record.job.id,
        sourceDocumentId: record.document.id,
        status: record.job.status,
        upload: null,
      };
    }

    const upload = await this.storage.createDirectUpload({
      object: objectRef(this.storage, record),
      contentType: input.contentType,
      contentLength: input.contentLength,
      checksumSha256Base64: input.checksumSha256Base64,
      metadata: {
        organizationId: input.organizationId,
        dossierId: input.dossierId,
        sourceDocumentId: record.document.id,
        ingestionJobId: record.job.id,
      },
      expiresInSeconds: input.expiresInSeconds,
    });
    return {
      jobId: record.job.id,
      sourceDocumentId: record.document.id,
      status: record.job.status,
      upload,
    };
  }

  async complete(input: {
    organizationId: string;
    dossierId: string;
    jobId: string;
  }) {
    const record = await this.repository.getUploadIntent(
      input.organizationId,
      input.dossierId,
      input.jobId,
    );
    if (!record) throw new ApiError("INGESTION_JOB_NOT_FOUND", "Job d'ingestion introuvable.", 404);
    if (!["uploading", "uploaded"].includes(record.job.status)) {
      return { jobId: record.job.id, status: record.job.status };
    }

    const metadata = await this.storage.head(objectRef(this.storage, record));
    const expectedMetadata = {
      organizationid: input.organizationId,
      dossierid: input.dossierId,
      sourcedocumentid: record.document.id,
      ingestionjobid: record.job.id,
    };
    const metadataMismatch = Object.entries(expectedMetadata).some(
      ([key, value]) => metadata.metadata[key] !== value,
    );
    if (
      metadataMismatch ||
      metadata.contentLength !== record.document.declaredByteSize ||
      (metadata.contentType && metadata.contentType !== record.document.declaredMimeType) ||
      (record.document.declaredChecksumSha256 &&
        metadata.checksumSha256Base64 !== record.document.declaredChecksumSha256)
    ) {
      await this.repository.markTerminal(record.job.id, "quarantined", "UPLOAD_METADATA_MISMATCH");
      throw new ApiError("UPLOAD_METADATA_MISMATCH", "Métadonnées d'upload incohérentes.", 422);
    }

    await this.repository.markUploaded(record, {
      byteSize: metadata.contentLength,
      contentType: metadata.contentType,
      versionId: metadata.versionId,
    });
    if (!record.job.queuePublishedAt) {
      try {
        await this.queue.publish({
          schemaVersion: 1,
          jobId: record.job.id,
          organizationId: input.organizationId,
          sourceDocumentId: record.document.id,
        });
        await this.repository.markQueuePublished(record.job.id);
      } catch {
        throw new ApiError(
          "INGESTION_QUEUE_UNAVAILABLE",
          "Le fichier est stocké ; la mise en file doit être réessayée.",
          503,
          true,
        );
      }
    }
    return { jobId: record.job.id, status: "uploaded" as const };
  }
}
