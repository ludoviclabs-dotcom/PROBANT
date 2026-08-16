import { randomUUID } from "node:crypto";
import { parseFecStream } from "@/lib/fec/stream-parser";
import {
  HARD_LAW_RULES,
  INTERNAL_RULES,
  METHODOLOGY_RULES,
  hasBlockingIngestionFinding,
  runRules,
  splitAdmissibilite,
} from "@/lib/rules-engine";
import { sha256Stream } from "@/lib/evidence/hash";
import { REFERENTIEL_VERSION } from "@/lib/referentiel/sources";
import { buildSnapshotFromFecDepot } from "@/lib/dossier";
import {
  PostgresDossierRepository,
  saveLedgerEntries,
} from "@/lib/dossier/postgres-repository";
import {
  detectFileFormat,
  isIngestionDocumentType,
  neutralizeFileName,
  validateFileSignature,
  validateIncomingFile,
} from "./file-validation";
import { readStructuredTaxDocument } from "./tax-document-input";
import {
  getIngestionJobRepository,
  updatePersistedSourceDocument,
} from "./job-repository";
import {
  getPrivateObjectStore,
  isPersistentIngestionConfigured,
} from "./object-store";
import type {
  FileValidationResult,
  IngestionDocumentMetadata,
  IngestionDocumentType,
  IngestionJob,
} from "./types";

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function inferStructuredDocumentType(input: {
  file: Blob;
  fileName: string;
  mimeType: string;
}): Promise<IngestionDocumentType | undefined> {
  const fileFormat = detectFileFormat(input.fileName, input.mimeType);
  if (!["json", "csv", "xlsx"].includes(fileFormat)) return undefined;
  try {
    const parsed = await readStructuredTaxDocument(
      new File([input.file], input.fileName, { type: input.mimeType }),
      fileFormat,
    );
    return parsed.documentType && isIngestionDocumentType(parsed.documentType)
      ? parsed.documentType
      : undefined;
  } catch {
    return undefined;
  }
}

export async function createIngestionJob(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  file: Blob;
  dossierId?: string;
  organizationId?: string;
  entityId?: string;
  documentType?: IngestionDocumentType;
  metadata?: IngestionDocumentMetadata;
}): Promise<{ job: IngestionJob; validation: FileValidationResult }> {
  const embeddedDocumentType = input.documentType ?? await inferStructuredDocumentType(input);
  const baseValidation = validateIncomingFile({
    ...input,
    requestedDocumentType: embeddedDocumentType,
  });
  const signatureIssues = baseValidation.ok
    ? await validateFileSignature({
        file: input.file,
        documentKind: baseValidation.documentKind,
        fileFormat: baseValidation.fileFormat,
      })
    : [];
  const validation: FileValidationResult = {
    ...baseValidation,
    ok: baseValidation.ok && signatureIssues.every((issue) => issue.severity !== "error"),
    issues: [...baseValidation.issues, ...signatureIssues],
  };
  const documentId = id("doc");
  const dossierId = input.dossierId ?? id("dos");
  const entityId = input.entityId ?? input.metadata?.entityId ?? dossierId;
  const safeFileName = neutralizeFileName(input.fileName);
  const objectStore = getPrivateObjectStore();
  const privateObjectPath = validation.ok
    ? await objectStore.put(
        `dossiers/${dossierId}/sources/${documentId}/${safeFileName}`,
        input.file,
        input.mimeType,
      )
    : `quarantine://${dossierId}/${documentId}/${safeFileName}`;
  const job: IngestionJob = {
    id: id("job"),
    organizationId: input.organizationId ?? "persistent",
    dossierId,
    entityId,
    documentId,
    status: validation.ok ? "uploaded" : "quarantined",
    progress: validation.ok ? 20 : 0,
    startedAt: new Date().toISOString(),
    parserVersion: "ingestion-service-1.0.0",
    errorCode: validation.ok ? undefined : validation.issues.find((issue) => issue.severity === "error")?.code,
    errorMessage: validation.ok
      ? undefined
      : validation.issues
          .filter((issue) => issue.severity === "error")
          .map((issue) => issue.message)
          .join(" "),
    warningCount: validation.issues.filter((issue) => issue.severity === "warning").length,
    fileName: safeFileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    documentType: validation.documentType,
    documentKind: validation.documentType,
    fileFormat: validation.fileFormat,
    metadata: { ...input.metadata, entityId, fileFormat: validation.fileFormat },
    privateObjectPath,
  };
  await getIngestionJobRepository().save(job);
  return { job, validation };
}

export async function processFecIngestion(job: IngestionJob) {
  const repository = getIngestionJobRepository();
  const objectStore = getPrivateObjectStore();
  await repository.update(job.id, { status: "fingerprinting", progress: 30 });
  const stream = await objectStore.get(job.privateObjectPath);
  if (!stream) throw new Error("INGESTION_PAYLOAD_MISSING");
  const [hashStream, parseStream] = stream.tee();
  await repository.update(job.id, { status: "parsing", progress: 45 });
  const [fingerprint, parsed] = await Promise.all([
    sha256Stream(hashStream),
    parseFecStream(parseStream),
  ]);
  await repository.update(job.id, {
    status: "validating",
    progress: 60,
    lineCount: parsed.entries.length,
  });
  const sirenMatch = job.fileName.match(/^(\d{9})FEC/iu);
  const siren = sirenMatch ? sirenMatch[1] : null;
  await repository.update(job.id, { status: "running_controls", progress: 75 });
  const ruleContext = {
    parsed,
    entries: parsed.entries,
    nomFichier: job.fileName,
    siren,
    referentielVersion: REFERENTIEL_VERSION,
  };
  const ingestionRules = HARD_LAW_RULES.filter(
    (rule) => rule.controlStage === "ingestion_admissibility",
  );
  const reviewRules = [
    ...HARD_LAW_RULES.filter(
      (rule) => rule.controlStage !== "ingestion_admissibility",
    ),
    ...METHODOLOGY_RULES,
    ...INTERNAL_RULES,
  ];
  const ingestionFindings = runRules(ruleContext, ingestionRules);
  const rejected = hasBlockingIngestionFinding(ingestionFindings);
  const reviewFindings = rejected ? [] : runRules(ruleContext, reviewRules);
  const findings = [...ingestionFindings, ...reviewFindings];
  const { admissibilite, analyse } = splitAdmissibilite(findings);
  await repository.update(job.id, { status: "building_snapshot", progress: 90 });
  const builtSnapshot = buildSnapshotFromFecDepot({
    dossierId: job.dossierId,
    nomFichier: job.fileName,
    fingerprint,
    siren,
    referentielVersion: REFERENTIEL_VERSION,
    admissibilite,
    analyse,
    entries: parsed.entries.slice(0, 1000),
    entriesTruncated: parsed.entries.length > 1000,
    totalEntryCount: parsed.entries.length,
    controlsEligible:
      HARD_LAW_RULES.length +
      METHODOLOGY_RULES.length +
      INTERNAL_RULES.length,
    controlsExecuted:
      ingestionRules.length + (rejected ? 0 : reviewRules.length),
    controlsConcluded:
      ingestionRules.length + (rejected ? 0 : reviewRules.length),
    controlsNotConcluded: 0,
  });
  const snapshot = {
    ...builtSnapshot,
    sourceDocuments: builtSnapshot.sourceDocuments.map((document) => ({
      ...document,
      id: job.documentId,
      dossierId: job.dossierId,
    })),
    sourceKind: isPersistentIngestionConfigured()
      ? ("persistent" as const)
      : ("session" as const),
  };

  if (isPersistentIngestionConfigured()) {
    await updatePersistedSourceDocument({
      documentId: job.documentId,
      fingerprint,
      lineCount: parsed.entries.length,
    });
    await new PostgresDossierRepository(job.dossierId).save(
      { organizationId: job.organizationId, dossierId: job.dossierId },
      snapshot,
    );
    await saveLedgerEntries({
      dossierId: job.dossierId,
      documentId: job.documentId,
      entries: parsed.entries,
    });
  }

  const completed = await repository.update(job.id, {
    status: "completed",
    progress: 100,
    completedAt: new Date().toISOString(),
    lineCount: parsed.entries.length,
    warningCount: parsed.parseErrors.length,
  });
  return {
    job: completed ?? job,
    snapshot,
    parseErrors: parsed.parseErrors,
    depotResult: {
      nomFichier: job.fileName,
      fingerprint,
      siren,
      referentielVersion: REFERENTIEL_VERSION,
      mapping: {
        separateur: parsed.separateurNom,
        variante: parsed.variante,
        nbColonnes: parsed.headerColumns.length,
        colonnes: parsed.headerColumns,
        nbEntries: parsed.entries.length,
      },
      admissibilite,
      analyse,
      parseErrors: parsed.parseErrors,
      entries: parsed.entries.slice(0, 1000),
      entriesTruncated: parsed.entries.length > 1000,
    },
  };
}

