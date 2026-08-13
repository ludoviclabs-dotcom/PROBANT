import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  badHeaderFec,
  FEC_HEADER,
  fecLine,
  invalidDateFec,
  invalidSeparatorFec,
  syntheticFecStream,
  textStream,
  validFec,
} from "@/lib/ingestion/__fixtures__/fec";
import type { IngestionLimits } from "@/lib/ingestion/limits";
import { FecStreamError, parseFecStream } from "../stream-parser";

const limits: IngestionLimits = {
  maxUploadBytes: 16 * 1024 * 1024,
  maxFecLines: 50_000,
  maxLineBytes: 256 * 1024,
  maxFieldBytes: 64 * 1024,
  maxParseDurationMs: 60_000,
  maxConcurrentJobsPerOrg: 2,
};

async function errorCode(text: string, overrides: Partial<IngestionLimits> = {}) {
  try {
    await parseFecStream(textStream(text, 11), {
      limits: { ...limits, ...overrides },
      onBatch: vi.fn(),
    });
  } catch (error) {
    return error instanceof FecStreamError ? error.code : "UNKNOWN";
  }
  return "NO_ERROR";
}

describe("parseFecStream", () => {
  it("parse par lots et calcule le SHA-256 complet sur des chunks arbitraires", async () => {
    const text = validFec(2_501);
    const batches: number[] = [];
    const result = await parseFecStream(textStream(text, 73), {
      limits,
      onBatch: async (entries) => void batches.push(entries.length),
    });
    expect(result.lineCount).toBe(2_501);
    expect(batches).toEqual([1_000, 1_000, 501]);
    expect(result.sha256).toBe(createHash("sha256").update(text).digest("hex"));
    expect(result.sha256).toHaveLength(64);
  });

  it.each([
    ["mauvais header", badHeaderFec, "FEC_HEADER_INVALID"],
    ["date invalide", invalidDateFec, "FEC_DATE_INVALID"],
    ["séparateur invalide", invalidSeparatorFec, "FEC_SEPARATOR_INVALID"],
  ])("rejette %s", async (_label, text, code) => {
    expect(await errorCode(text)).toBe(code);
  });

  it("met en quarantaine un champ gigantesque", async () => {
    const huge = fecLine(1).replace("Compte de test", "x".repeat(2_000));
    expect(
      await errorCode(`${FEC_HEADER}\n${huge}\n`, { maxFieldBytes: 1_000 }),
    ).toBe("FEC_FIELD_TOO_LARGE");
  });

  it("met en quarantaine une ligne gigantesque", async () => {
    const huge = fecLine(1).replace("Compte de test", "x".repeat(4_000));
    expect(
      await errorCode(`${FEC_HEADER}\n${huge}\n`, {
        maxFieldBytes: 8_000,
        maxLineBytes: 2_000,
      }),
    ).toBe("FEC_LINE_TOO_LARGE");
  });

  it("borne un très gros FEC synthétique sans le matérialiser", async () => {
    let inserted = 0;
    const result = await parseFecStream(syntheticFecStream(25_000), {
      limits,
      onBatch: async (entries) => void (inserted += entries.length),
    });
    expect(result.lineCount).toBe(25_000);
    expect(inserted).toBe(25_000);
  });
});
