import { describe, expect, it } from "vitest";
import { validateIncomingFile } from "../file-validation";
import { createIngestionJob } from "../service";

describe("ingestion file validation", () => {
  it("accepts a bounded FEC file", () => {
    const result = validateIncomingFile({
      fileName: "123456789FEC20261231.txt",
      mimeType: "text/plain",
      sizeBytes: 1024,
    });
    expect(result.ok).toBe(true);
    expect(result.documentKind).toBe("fec");
  });

  it("rejects legacy xls and unsupported files", () => {
    const result = validateIncomingFile({
      fileName: "balance.xls",
      mimeType: "application/vnd.ms-excel",
      sizeBytes: 1024,
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === "FILE_EXTENSION_UNSUPPORTED")).toBe(true);
  });

  it("creates quarantined jobs for invalid files", async () => {
    const { job } = await createIngestionJob({
      fileName: "script.html",
      mimeType: "text/html",
      sizeBytes: 100,
      file: new Blob(["<script />"], { type: "text/html" }),
    });
    expect(job.status).toBe("quarantined");
    expect(job.errorCode).toBe("FILE_EXTENSION_UNSUPPORTED");
  });
});

