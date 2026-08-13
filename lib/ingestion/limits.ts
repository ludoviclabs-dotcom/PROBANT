import { z } from "zod";

const positiveInteger = z.coerce.number().int().positive();

const ingestionLimitsSchema = z.object({
  MAX_UPLOAD_BYTES: positiveInteger,
  MAX_FEC_LINES: positiveInteger,
  MAX_LINE_BYTES: positiveInteger,
  MAX_FIELD_BYTES: positiveInteger,
  MAX_PARSE_DURATION_MS: positiveInteger,
  MAX_CONCURRENT_JOBS_PER_ORG: positiveInteger,
});

export interface IngestionLimits {
  maxUploadBytes: number;
  maxFecLines: number;
  maxLineBytes: number;
  maxFieldBytes: number;
  maxParseDurationMs: number;
  maxConcurrentJobsPerOrg: number;
}

export function readIngestionLimits(
  env: Record<string, string | undefined> = process.env,
): IngestionLimits {
  const parsed = ingestionLimitsSchema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(",");
    throw new Error(`INGESTION_LIMITS_NOT_CONFIGURED:${missing}`);
  }
  return {
    maxUploadBytes: parsed.data.MAX_UPLOAD_BYTES,
    maxFecLines: parsed.data.MAX_FEC_LINES,
    maxLineBytes: parsed.data.MAX_LINE_BYTES,
    maxFieldBytes: parsed.data.MAX_FIELD_BYTES,
    maxParseDurationMs: parsed.data.MAX_PARSE_DURATION_MS,
    maxConcurrentJobsPerOrg: parsed.data.MAX_CONCURRENT_JOBS_PER_ORG,
  };
}
