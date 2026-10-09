import type { ImportBatch } from "./imports";
import type { EvidenceLink } from "./model";
import { vatResultEvidence, vatResultSchema, vatWorkSchema, VAT_PROCEDURE, type VatResult, type VatWork } from "./fiscal-vat-contract";
import { citResultEvidence, citResultSchema, citWorkSchema, CIT_PROCEDURE, type CitResult, type CitWork } from "./fiscal-cit-contract";

/**
 * Dispatch of the fiscal sheets by tax (Mission 13). The shared workpaper service only knows « fiscalWork » and a
 * fiscal result; each tax keeps its own schema, engine and evidence. VAT is the first sub-lot.
 */
export type FiscalWork = VatWork | CitWork;
export type FiscalResult = VatResult | CitResult;
export const FISCAL_PROCEDURES = [VAT_PROCEDURE, CIT_PROCEDURE] as const;
export type FiscalProcedure = typeof FISCAL_PROCEDURES[number];
export const isFiscalProcedure = (id: string | undefined): id is FiscalProcedure => (FISCAL_PROCEDURES as readonly string[]).includes(id ?? "");
export function procedureOf(work: FiscalWork): FiscalProcedure { return work.tax === "vat" ? VAT_PROCEDURE : CIT_PROCEDURE; }
export function parseFiscalWork(work: unknown): FiscalWork {
  const tax = (work as { tax?: unknown } | null)?.tax;
  if (tax === "vat") return vatWorkSchema.parse(work);
  if (tax === "cit") return citWorkSchema.parse(work);
  throw new Error("FISCAL_WORK_INVALID");
}
export function parseFiscalResult(result: unknown): FiscalResult {
  const tax = (result as { tax?: unknown } | null)?.tax;
  if (tax === "vat") return vatResultSchema.parse(result);
  if (tax === "cit") return citResultSchema.parse(result);
  throw new Error("FISCAL_RESULT_INVALID");
}
export function fiscalResultEvidence(result: FiscalResult, imports: ImportBatch[]): EvidenceLink[] {
  return result.tax === "vat" ? vatResultEvidence(result, imports) : citResultEvidence(result, imports);
}
