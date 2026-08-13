import { z } from "zod";
import { IngestionQueueReconciler } from "@/lib/ingestion/reconciler";
import { createPersistentIngestionRuntime } from "@/lib/ingestion/runtime";

const eventSchema = z.object({
  batchSize: z.number().int().min(1).max(500),
});

/** Scheduled Lambda entry point. The scheduler must provide an explicit batchSize. */
export async function handler(event: unknown) {
  const { batchSize } = eventSchema.parse(event);
  const runtime = createPersistentIngestionRuntime();
  const result = await new IngestionQueueReconciler(runtime.repository, runtime.queue).run(batchSize);
  console.info(JSON.stringify({ level: "info", code: "INGESTION_QUEUE_RECONCILED", ...result }));
  if (result.failed > 0) throw new Error("INGESTION_QUEUE_RECONCILIATION_PARTIAL_FAILURE");
  return result;
}
