import type { IngestionDocumentType, IngestionJob } from "./types";

export interface DocumentProcessor<TResult = unknown> {
  readonly documentType: IngestionDocumentType;
  readonly processorId: string;
  readonly priority: number;
  process(job: IngestionJob): Promise<TResult>;
}

const registryState = globalThis as typeof globalThis & {
  __probantDocumentProcessorResults?: Map<string, unknown>;
  __probantDocumentProcessorPending?: Map<string, Promise<unknown>>;
};
const results = registryState.__probantDocumentProcessorResults ??
  (registryState.__probantDocumentProcessorResults = new Map());
const pending = registryState.__probantDocumentProcessorPending ??
  (registryState.__probantDocumentProcessorPending = new Map());

export class DocumentProcessorRegistry {
  private readonly processors = new Map<IngestionDocumentType, DocumentProcessor>();

  register(processor: DocumentProcessor): this {
    if (this.processors.has(processor.documentType)) {
      throw new Error(`DOCUMENT_PROCESSOR_ALREADY_REGISTERED:${processor.documentType}`);
    }
    this.processors.set(processor.documentType, processor);
    return this;
  }

  get(documentType: IngestionDocumentType): DocumentProcessor | undefined {
    return this.processors.get(documentType);
  }

  list(): readonly DocumentProcessor[] {
    return [...this.processors.values()].sort((left, right) => left.priority - right.priority);
  }

  async process<TResult = unknown>(job: IngestionJob): Promise<TResult> {
    if (job.documentType === "unknown") {
      throw new Error("DOCUMENT_TYPE_UNKNOWN");
    }
    const cached = results.get(job.id);
    if (cached !== undefined) return cached as TResult;
    const inFlight = pending.get(job.id);
    if (inFlight) return inFlight as Promise<TResult>;
    const processor = this.processors.get(job.documentType);
    if (!processor) throw new Error(`DOCUMENT_PROCESSOR_NOT_REGISTERED:${job.documentType}`);
    const work = processor.process(job)
      .then((result) => {
        results.set(job.id, result);
        return result;
      })
      .finally(() => pending.delete(job.id));
    pending.set(job.id, work);
    return work as Promise<TResult>;
  }
}

export function clearDocumentProcessorResultCache(): void {
  results.clear();
  pending.clear();
}


