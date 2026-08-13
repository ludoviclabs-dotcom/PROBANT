import { z } from "zod";
import { createPersistentIngestionRuntime } from "@/lib/ingestion/runtime";
import { IngestionConcurrencyError, IngestionProcessor } from "@/lib/ingestion/processor";

const messageSchema = z.object({
  schemaVersion: z.literal(1),
  jobId: z.string().uuid(),
  organizationId: z.string().uuid(),
  sourceDocumentId: z.string().uuid(),
});

interface SqsEvent {
  Records: Array<{ messageId: string; body: string }>;
}

export async function handler(event: SqsEvent) {
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];
  const runtime = createPersistentIngestionRuntime();
  const processor = new IngestionProcessor(runtime.repository, runtime.storage, runtime.limits);

  for (const record of event.Records) {
    let body: unknown;
    try {
      body = JSON.parse(record.body);
    } catch {
      console.error(JSON.stringify({ level: "error", code: "QUEUE_MESSAGE_INVALID", messageId: record.messageId }));
      continue;
    }
    const parsed = messageSchema.safeParse(body);
    if (!parsed.success) {
      console.error(JSON.stringify({ level: "error", code: "QUEUE_MESSAGE_INVALID", messageId: record.messageId }));
      continue;
    }
    const startedAt = Date.now();
    try {
      const status = await processor.process(parsed.data);
      console.info(
        JSON.stringify({
          level: "info",
          code: "INGESTION_FINISHED",
          jobId: parsed.data.jobId,
          organizationId: parsed.data.organizationId,
          status,
          durationMs: Date.now() - startedAt,
        }),
      );
    } catch (error) {
      batchItemFailures.push({ itemIdentifier: record.messageId });
      console.error(
        JSON.stringify({
          level: "error",
          code:
            error instanceof IngestionConcurrencyError
              ? "INGESTION_CONCURRENCY_RETRY"
              : "INGESTION_RETRY",
          jobId: parsed.data.jobId,
          organizationId: parsed.data.organizationId,
          durationMs: Date.now() - startedAt,
        }),
      );
    }
  }
  return { batchItemFailures };
}
