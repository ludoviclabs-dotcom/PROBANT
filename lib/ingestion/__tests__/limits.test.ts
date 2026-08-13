import { describe, expect, it } from "vitest";
import { readIngestionLimits } from "../limits";

describe("limites persistantes", () => {
  it("échoue fermé si une limite manque", () => {
    expect(() => readIngestionLimits({})).toThrow("INGESTION_LIMITS_NOT_CONFIGURED");
  });

  it("lit les six limites sans valeur implicite", () => {
    expect(
      readIngestionLimits({
        MAX_UPLOAD_BYTES: "100",
        MAX_FEC_LINES: "10",
        MAX_LINE_BYTES: "20",
        MAX_FIELD_BYTES: "15",
        MAX_PARSE_DURATION_MS: "1000",
        MAX_CONCURRENT_JOBS_PER_ORG: "2",
      }),
    ).toEqual({
      maxUploadBytes: 100,
      maxFecLines: 10,
      maxLineBytes: 20,
      maxFieldBytes: 15,
      maxParseDurationMs: 1000,
      maxConcurrentJobsPerOrg: 2,
    });
  });
});
