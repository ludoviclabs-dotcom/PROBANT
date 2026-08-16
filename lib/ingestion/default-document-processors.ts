import { sha256 } from "@/lib/evidence/hash";
import { DocumentProcessorRegistry, type DocumentProcessor } from "./document-processor-registry";
import { getIngestionJobRepository } from "./job-repository";
import { getPrivateObjectStore } from "./object-store";
import { processFecIngestion } from "./service";
import {
  processTaxDocument,
  TAX_DOCUMENT_PARSER_VERSION,
  type TaxDocumentProcessingResult,
} from "./tax-document-processor";
import { extractPdfTaxFields } from "./tax-pdf-extraction";
import type { IngestionDocumentType, IngestionJob } from "./types";

export interface ReviewOnlyDocumentResult {
  kind: "review_only_document";
  disposition: "needs_manual_review";
  job: IngestionJob;
  documentHash: string;
  fieldTraces: readonly [];
  warnings: readonly string[];
  calculationExecuted: false;
}

async function processReviewOnlyDocument(job: IngestionJob): Promise<ReviewOnlyDocumentResult> {
  const repository = getIngestionJobRepository();
  await repository.update(job.id, { status: "fingerprinting", progress: 35 });
  const stream = await getPrivateObjectStore().get(job.privateObjectPath);
  if (!stream) throw new Error("INGESTION_PAYLOAD_MISSING");
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const documentHash = sha256(Buffer.from(bytes));
  const warnings = ["DOCUMENT_PROCESSOR_REVIEW_ONLY", "NEEDS_MANUAL_REVIEW"];
  if (job.fileFormat === "pdf") {
    const extracted = await extractPdfTaxFields(
      new File([bytes], job.fileName, { type: job.mimeType }),
      [],
    );
    warnings.push(...extracted.warnings);
  }
  const completed = await repository.update(job.id, {
    status: "needs_manual_review",
    progress: 100,
    completedAt: new Date().toISOString(),
    parserVersion: TAX_DOCUMENT_PARSER_VERSION,
    lineCount: 0,
    warningCount: new Set(warnings).size,
  });
  return {
    kind: "review_only_document",
    disposition: "needs_manual_review",
    job: completed ?? job,
    documentHash,
    fieldTraces: [],
    warnings: [...new Set(warnings)],
    calculationExecuted: false,
  };
}

function taxProcessor(
  documentType: IngestionDocumentType,
  priority: number,
): DocumentProcessor<TaxDocumentProcessingResult> {
  return {
    documentType,
    priority,
    processorId: `${TAX_DOCUMENT_PARSER_VERSION}:${documentType}`,
    process: processTaxDocument,
  };
}

function reviewOnlyProcessor(
  documentType: IngestionDocumentType,
  priority: number,
): DocumentProcessor<ReviewOnlyDocumentResult> {
  return {
    documentType,
    priority,
    processorId: `review-only-1.0.0:${documentType}`,
    process: processReviewOnlyDocument,
  };
}

export function createDefaultDocumentProcessorRegistry(): DocumentProcessorRegistry {
  return new DocumentProcessorRegistry()
    .register({
      documentType: "fec",
      priority: 1,
      processorId: "fec-existing-pipeline",
      process: processFecIngestion,
    })
    .register(taxProcessor("liasse_2050_2059", 2))
    .register(taxProcessor("liasse_2033", 3))
    .register(taxProcessor("declaration_2065", 4))
    .register(taxProcessor("declaration_tva_ca3", 5))
    .register(taxProcessor("declaration_tva_ca12", 6))
    .register(reviewOnlyProcessor("balance", 20))
    .register(reviewOnlyProcessor("tax_notice", 30))
    .register(reviewOnlyProcessor("payroll_summary", 40));
}

const defaultRegistry = createDefaultDocumentProcessorRegistry();

export function getDocumentProcessorRegistry(): DocumentProcessorRegistry {
  return defaultRegistry;
}

export async function processIngestionJob(job: IngestionJob): Promise<unknown> {
  return defaultRegistry.process(job);
}


