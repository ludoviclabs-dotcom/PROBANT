import type { XlsxSafetyLimits } from "./xlsx-safety";

/** Limites locales du mode démo, jamais utilisées par le runtime persistant. */
export const DEMO_XLSX_LIMITS: XlsxSafetyLimits = {
  maxExpandedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxZipEntries: 10_000,
  maxRows: 100_000,
  maxCellBytes: 64 * 1024,
};

interface WorkerSuccess {
  ok: true;
  rows: unknown[][];
}

interface WorkerFailure {
  ok: false;
  code: string;
}

export async function readXlsxRowsInWorker(
  file: File,
  limits: XlsxSafetyLimits = DEMO_XLSX_LIMITS,
): Promise<unknown[][]> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("XLS_LEGACY_NOT_SUPPORTED");
  }
  const buffer = await file.arrayBuffer();
  const worker = new Worker(new URL("./xlsx-reader.worker.ts", import.meta.url));
  try {
    return await new Promise<unknown[][]>((resolve, reject) => {
      worker.onerror = () => reject(new Error("XLSX_WORKER_FAILED"));
      worker.onmessage = (event: MessageEvent<WorkerSuccess | WorkerFailure>) => {
        if (event.data.ok) resolve(event.data.rows);
        else reject(new Error(event.data.code));
      };
      worker.postMessage({ buffer, limits }, [buffer]);
    });
  } finally {
    worker.terminate();
  }
}
