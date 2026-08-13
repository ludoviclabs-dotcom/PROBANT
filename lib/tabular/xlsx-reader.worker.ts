/// <reference lib="webworker" />

import { readSheet } from "read-excel-file/web-worker";
import {
  inspectXlsxContainer,
  validateXlsxRows,
  XlsxSafetyError,
  type XlsxSafetyLimits,
} from "./xlsx-safety";

interface XlsxWorkerRequest {
  buffer: ArrayBuffer;
  limits: XlsxSafetyLimits;
}

self.onmessage = async (event: MessageEvent<XlsxWorkerRequest>) => {
  try {
    inspectXlsxContainer(event.data.buffer, event.data.limits);
    const rows = (await readSheet(event.data.buffer)) as unknown[][];
    validateXlsxRows(rows, event.data.limits);
    self.postMessage({ ok: true, rows });
  } catch (error) {
    self.postMessage({
      ok: false,
      code: error instanceof XlsxSafetyError ? error.code : "XLSX_MALFORMED",
    });
  }
};

export {};
