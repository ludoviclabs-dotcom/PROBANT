import { sha256 } from "@/lib/evidence/hash";
import { getTaxFormVintage } from "@/lib/knowledge/tax-registry";
import type { TaxDocumentSnapshot, TaxPeriod } from "@/lib/canonical-model";
import { PostgresTaxRepository } from "@/lib/tax";
import {
  getIngestionJobRepository,
  updatePersistedSourceDocument,
} from "./job-repository";
import { getPrivateObjectStore, isPersistentIngestionConfigured } from "./object-store";
import { readStructuredTaxDocument } from "./tax-document-input";
import { extractPdfTaxFields } from "./tax-pdf-extraction";
import {
  buildTaxDocumentSnapshot,
  emptyParsedTaxDocument,
  rawTaxFieldTraces,
  TAX_DOCUMENT_PARSER_VERSION,
  TAX_DOCUMENT_SPECS,
  tracesFromFields,
  type TaxFieldImportTrace,
} from "./tax-document-snapshot";
import type { IngestionDocumentType, IngestionJob } from "./types";

// La normalisation est partagée avec les feuilles fiscales : ce module garde
// seulement les entrées/sorties du job (stockage objet, suivi, persistance).
export { TAX_DOCUMENT_PARSER_VERSION, TAX_DOCUMENT_SPECS };
export type { TaxFieldImportTrace };

export interface TaxDocumentProcessingResult {
  kind: "tax_document";
  disposition: "completed" | "needs_manual_review";
  job: IngestionJob;
  period: TaxPeriod | null;
  snapshot: TaxDocumentSnapshot | null;
  fieldTraces: readonly TaxFieldImportTrace[];
  warnings: readonly string[];
  parserVersion: string;
  documentHash: string;
  calculationExecuted: false;
}

export async function processTaxDocument(job: IngestionJob): Promise<TaxDocumentProcessingResult> {
  const repository = getIngestionJobRepository();
  await repository.update(job.id, { status: "fingerprinting", progress: 30 });
  const stream = await getPrivateObjectStore().get(job.privateObjectPath);
  if (!stream) throw new Error("INGESTION_PAYLOAD_MISSING");
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const documentHash = sha256(Buffer.from(bytes));
  const file = new File([bytes], job.fileName, { type: job.mimeType });
  await repository.update(job.id, { status: "parsing", progress: 50 });

  let parsed = emptyParsedTaxDocument();
  const parserWarnings: string[] = [];
  const spec = TAX_DOCUMENT_SPECS[job.documentType as IngestionDocumentType];
  if (!spec) throw new Error(`TAX_PROCESSOR_NOT_CONFIGURED:${job.documentType}`);
  if (job.fileFormat === "pdf") {
    const vintage = job.metadata.formVintage;
    const formNumber = job.metadata.formNumber ?? spec.formNumbers[0];
    const form = vintage && formNumber ? getTaxFormVintage(formNumber, vintage) : undefined;
    const extraction = await extractPdfTaxFields(file, form?.boxes.map((box) => box.code) ?? []);
    parsed = {
      ...emptyParsedTaxDocument(),
      formNumber,
      formVintage: vintage ?? null,
      siren: extraction.siren,
      periodStart: job.metadata.periodStart ?? null,
      periodEnd: job.metadata.periodEnd ?? null,
      fiscalYear: job.metadata.fiscalYear ?? null,
      fields: extraction.fields,
      warnings: extraction.warnings,
    };
  } else {
    try {
      parsed = await readStructuredTaxDocument(file, job.fileFormat);
    } catch (error) {
      parserWarnings.push(error instanceof Error ? error.message : "TAX_DOCUMENT_PARSE_FAILED");
    }
  }

  await repository.update(job.id, { status: "validating", progress: 70 });
  const built = buildTaxDocumentSnapshot({
    organizationId: job.organizationId,
    dossierId: job.dossierId,
    entityId: job.entityId,
    documentId: job.documentId,
    documentType: job.documentType as IngestionDocumentType,
    parsed,
    parserWarnings,
    metadata: job.metadata,
    documentHash,
    createdAt: job.startedAt,
  });
  if (built.kind === "metadata_incomplete") {
    const completed = await repository.update(job.id, {
      status: "needs_manual_review",
      progress: 100,
      completedAt: new Date().toISOString(),
      parserVersion: TAX_DOCUMENT_PARSER_VERSION,
      warningCount: built.warnings.length,
      lineCount: parsed.fields.length,
    });
    return {
      kind: "tax_document",
      disposition: "needs_manual_review",
      job: completed ?? job,
      period: null,
      snapshot: null,
      fieldTraces: rawTaxFieldTraces(job.documentId, parsed.fields, documentHash),
      warnings: built.warnings,
      parserVersion: TAX_DOCUMENT_PARSER_VERSION,
      documentHash,
      calculationExecuted: false,
    };
  }

  const { period, snapshot, requiresReview, warnings: uniqueWarnings } = built;
  if (isPersistentIngestionConfigured()) {
    const taxRepository = new PostgresTaxRepository();
    const scope = { organizationId: job.organizationId, dossierId: job.dossierId };
    if (!await taxRepository.getPeriod(scope, period.id)) await taxRepository.savePeriod(scope, period);
    if (!await taxRepository.getDocument(scope, snapshot.id)) await taxRepository.saveDocument(scope, snapshot);
    await updatePersistedSourceDocument({
      documentId: job.documentId,
      fingerprint: documentHash,
      lineCount: snapshot.fields.length,
    });
  }
  const completed = await repository.update(job.id, {
    status: requiresReview ? "needs_manual_review" : "completed",
    progress: 100,
    completedAt: new Date().toISOString(),
    parserVersion: TAX_DOCUMENT_PARSER_VERSION,
    warningCount: uniqueWarnings.length,
    lineCount: snapshot.fields.length,
  });
  return {
    kind: "tax_document",
    disposition: requiresReview ? "needs_manual_review" : "completed",
    job: completed ?? job,
    period,
    snapshot,
    fieldTraces: tracesFromFields(job.documentId, snapshot.fields),
    warnings: uniqueWarnings,
    parserVersion: TAX_DOCUMENT_PARSER_VERSION,
    documentHash,
    calculationExecuted: false,
  };
}

export function supportedTaxDocumentTypes(): IngestionDocumentType[] {
  return Object.keys(TAX_DOCUMENT_SPECS) as IngestionDocumentType[];
}

