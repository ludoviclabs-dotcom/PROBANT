import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertScope, frozen, type EvidenceLink, type SourceDocumentVersion, type SourceLocator, type WorkpaperRun } from "./model";
import type { ImportBatch, MemoryImportRepository } from "./imports";
import { authorize, type Principal } from "./policy";

export function linkImportedEvidence(run: WorkpaperRun, batch: ImportBatch, rowId: string, purpose: string, principal: Principal, cell?: string): EvidenceLink {
  authorize(principal, run.scope, "prepare"); assertScope(run.scope, batch.scope);
  if (!purpose.trim() || !run.importIds.includes(batch.id)) throw new Error("EVIDENCE_IMPORT_OR_PURPOSE_REQUIRED");
  const row = batch.rows.find((r) => r.id === rowId);
  if (!row || row.errors.length || !batch.approval || !batch.report.calculationAllowed) throw new Error("VERIFIED_SOURCE_ROW_REQUIRED");
  let locator: SourceLocator = row.locator;
  if (cell) {
    const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(cell);
    const column = match?.[1].split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
    if (!match || Number(match[2]) !== row.locator.row || !column || column > Object.keys(row.original).length) throw new Error("EVIDENCE_CELL_INVALID");
    locator = { ...locator, cell };
  }
  const content = { scope: run.scope, procedureId: run.id, documentVersionId: batch.document.id, rowId, locator, precision: cell ? "cell" as const : "row" as const, status: "verified" as const, purpose };
  return frozen({ id: `evidence-${stableSha256(content)}`, ...content });
}

/** A PDF reference is not an extraction or a verified financial value. */
export function linkPdfReference(run: WorkpaperRun, document: SourceDocumentVersion, locator: SourceLocator | undefined, purpose: string, principal: Principal): EvidenceLink {
  authorize(principal, run.scope, "prepare"); assertScope(run.scope, document.scope);
  if (document.format !== "pdf" || !purpose.trim()) throw new Error("PDF_REFERENCE_INVALID");
  if (locator && (!Number.isSafeInteger(locator.page) || locator.page! < 1)) throw new Error("PDF_PAGE_REQUIRED");
  const content = { scope: run.scope, procedureId: run.id, documentVersionId: document.id, locator, precision: locator?.zone ? "zone" as const : locator?.page ? "page" as const : "document" as const, status: "suggestion" as const, purpose };
  return frozen({ id: `evidence-${stableSha256(content)}`, ...content });
}
export function resolveEvidence(link: EvidenceLink, principal: Principal, repository: MemoryImportRepository) {
  authorize(principal, link.scope, "read"); authorize(principal, link.scope, "download");
  const bytes = repository.download(link.scope, link.documentVersionId, principal);
  return { link: frozen(link), availability: bytes ? "available" as const : "unavailable" as const, bytes, warning: bytes ? null : "SOURCE_INACCESSIBLE_HISTORY_PRESERVED" };
}
