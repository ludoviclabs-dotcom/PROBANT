import { describe, expect, it } from "vitest";
import { reusableTerminalStatus } from "../job-idempotency";

describe("idempotence du worker", () => {
  it("réutilise un résultat terminal au lieu de retraiter le document", () => {
    expect(reusableTerminalStatus("completed", null)).toBe("completed");
    expect(reusableTerminalStatus("quarantined", "FEC_LINE_TOO_LARGE")).toBe("quarantined");
    expect(reusableTerminalStatus("failed", "FEC_HEADER_INVALID")).toBe("failed");
  });

  it("autorise uniquement la reprise d'un échec transitoire ou d'un lease expiré", () => {
    expect(reusableTerminalStatus("failed", "INGESTION_TRANSIENT_FAILURE")).toBeNull();
    expect(reusableTerminalStatus("failed", "WORKER_LEASE_EXPIRED")).toBeNull();
    expect(reusableTerminalStatus("uploaded", null)).toBeNull();
  });
});
