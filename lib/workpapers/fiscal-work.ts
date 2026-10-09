import { z } from "zod";
import { isCivilDate } from "@/lib/canonical-model/period";
import type { ImportBatch } from "./imports";
import type { NoteCitation } from "./model";

/**
 * Human inputs of the fiscal sheets (Mission 13): what the browser may send, and what the server stamps.
 * A citation names a frozen document version and, optionally, one of its rows; file name, hash and locator are
 * resolved by the server from the run's frozen sources, never typed by the browser.
 */
const id = z.string().trim().min(1).max(200);
export const fiscalCitationInputSchema = z.object({ documentId: id, rowId: id.optional() }).strict();
export type FiscalCitationInput = z.infer<typeof fiscalCitationInputSchema>;
export const resolvedCitationSchema = z.object({ documentVersionId: id, importId: id, fileName: z.string().min(1).max(300), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  rowId: id.optional(), row: z.number().int().positive().optional(), cell: z.string().max(40).optional(), page: z.number().int().positive().optional(), zone: z.string().max(80).optional() }).strict();
export type ResolvedCitation = z.infer<typeof resolvedCitationSchema>;
export function resolveCitation(batches: ImportBatch[], input: FiscalCitationInput): ResolvedCitation {
  const batch = batches.find(b => b.document.id === input.documentId);
  if (!batch) throw new Error("FX_CITATION_SOURCE_REQUIRED");
  const row = input.rowId ? batch.rows.find(r => r.id === input.rowId) : undefined;
  if (input.rowId && !row) throw new Error("FX_CITATION_ROW_INVALID");
  return { documentVersionId: batch.document.id, importId: batch.id, fileName: batch.document.fileName, sha256: batch.document.byteHash,
    ...(row ? { rowId: row.id, ...(row.locator.row ? { row: row.locator.row } : {}), ...(row.locator.cell ? { cell: row.locator.cell } : {}), ...(row.locator.page ? { page: row.locator.page } : {}), ...(row.locator.zone ? { zone: row.locator.zone } : {}) } : {}) };
}
export const toNoteCitation = (c: ResolvedCitation): NoteCitation => ({ documentVersionId: c.documentVersionId, importId: c.importId, fileName: c.fileName, sha256: c.sha256,
  ...(c.rowId ? { rowId: c.rowId } : {}), ...(c.row ? { row: c.row } : {}), ...(c.page ? { page: c.page } : {}), ...(c.zone ? { zone: c.zone } : {}) });

export const FX_FREQUENCIES = ["monthly", "quarterly", "annual"] as const;
export type FiscalFrequency = typeof FX_FREQUENCIES[number];
export const civilDate = z.string().refine(isCivilDate, "Date civile ISO requise");
export const declarativePeriodSchema = z.object({ startDate: civilDate, endDate: civilDate }).strict();
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** A declarative period is a whole number of calendar months matching its frequency (1, 3 or 12). */
export function periodMatchesFrequency(p: { startDate: string; endDate: string }, frequency: FiscalFrequency) {
  const [sy, sm, sd] = p.startDate.split("-").map(Number), [ey, em, ed] = p.endDate.split("-").map(Number);
  const months = (ey - sy) * 12 + (em - sm) + 1;
  return sd === 1 && ed === lastDay(ey, em) && months === ({ monthly: 1, quarterly: 3, annual: 12 } as const)[frequency];
}
