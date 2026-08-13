import { parseFecStream } from "../lib/fec/stream-parser";
import { syntheticFecStream } from "../lib/ingestion/__fixtures__/fec";

const linesArgument = process.argv.find((argument) => argument.startsWith("--lines="));
const lineCount = Number(linesArgument?.split("=")[1] ?? "250000");
const materialize = process.argv.includes("--materialize");
if (!Number.isInteger(lineCount) || lineCount <= 0) throw new Error("--lines doit être positif");

async function main(): Promise<void> {
  const retained: unknown[] = [];
  const startedAt = performance.now();
  const result = await parseFecStream(syntheticFecStream(lineCount), {
    limits: {
      maxUploadBytes: Number.MAX_SAFE_INTEGER,
      maxFecLines: lineCount,
      maxLineBytes: 1024 * 1024,
      maxFieldBytes: 256 * 1024,
      maxParseDurationMs: 60 * 60 * 1000,
      maxConcurrentJobsPerOrg: 1,
    },
    onBatch: async (entries) => {
      if (materialize) retained.push(...entries);
    },
  });

  const elapsedMs = Math.round(performance.now() - startedAt);
  console.log(
    JSON.stringify({
      node: process.version,
      lineCount: result.lineCount,
      byteCount: result.byteCount,
      materialize,
      elapsedMs,
      linesPerSecond: Math.round(result.lineCount / (elapsedMs / 1000)),
      maxRssMiB: Math.round(process.resourceUsage().maxRSS / 1024),
      sha256Length: result.sha256.length,
    }),
  );
}

void main();
