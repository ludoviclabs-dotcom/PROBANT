import type { IngestionJobStatus } from "@/lib/db/schema";

export type TerminalIngestionStatus = "completed" | "failed" | "quarantined";

const RETRYABLE_FAILURE_CODES = new Set([
  "INGESTION_TRANSIENT_FAILURE",
  "WORKER_LEASE_EXPIRED",
]);

/** Returns a reusable terminal result, or null when the job may be acquired/retried. */
export function reusableTerminalStatus(
  status: IngestionJobStatus,
  errorCode: string | null,
): TerminalIngestionStatus | null {
  if (status === "completed" || status === "quarantined") return status;
  if (status === "failed" && !RETRYABLE_FAILURE_CODES.has(errorCode ?? "")) return "failed";
  return null;
}
