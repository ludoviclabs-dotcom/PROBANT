import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { monthEnd } from "@/lib/ifrs/leases/qualification";
import { previewImport, type ImportBatch } from "../imports";
import { LEASE_MAPPING, type LeaseType } from "../lease-sources";
import type { WorkpaperScope } from "../model";
import type { Principal } from "../policy";

/**
 * Sources synthétiques (mapping `ifrs16-leases-2`) : contrats F01 et F03 de l'oracle C00, mêmes montants, décalés sur l'exercice 2026,
 * celui de la recette Emprunts, pour partager dossier, exercice et store. Les deux mois de février (2026, 2027) ont 28 jours : l'échéancier
 * est identique à celui de l'oracle.
 */
export const LEASE_PERIOD = { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-02-15", currency: "EUR" as const, validation: "provisional" as const } satisfies AccountingPeriod;
export type LeaseRow = { key: string; amount: string; date: string; details: Record<string, unknown> };
const src = (title: string, page: number | null = 1) => ({ title, pack: "Pack synthétique IFRS 16", date: "2026-01-02", page, clause: "Article 3 — loyers" });
export const CONTRACT_FIELDS = (months: number, payment: string, category: string) => ({ lessor: "Bailleur synthétique", assetCategory: category, contractVersion: "v1", versionNature: "initial", role: "lessee",
  contractCurrency: "EUR", signatureDate: "2025-12-15", endDate: monthEnd(2026 * 12 + months - 1), termMonths: String(months), payment, paymentFrequency: "monthly", paymentTiming: "arrears",
  vatTreatment: "excluded_recoverable", identifiedAsset: "yes", controlOfUse: "yes", identificationEvidence: "Actif désigné au contrat, sans droit de substitution substantiel (B14) ; preneur seul utilisateur",
  serviceComponents: "none", usefulLifeMonths: String(months), depreciationMethod: "straight_line", depreciationJustification: "Durée d'utilité au moins égale à la durée du contrat ; pas d'option d'achat" });
export const ASSUMPTION_FIELDS = (rate: string) => ({ rateKind: "incremental_borrowing", rateBasis: "annual_effective", annualEffectiveRate: rate, rateDate: "2025-12-31",
  rateJustification: "Taux d'un emprunt de même durée et sûreté (IFRIC 09/2019), note de trésorerie", termJudgement: "Aucune option de prolongation ni de résiliation ; période non résiliable retenue",
  lowValueExemption: "not_elected", lowValueNewValue: "non_applicable", lowValueJudgement: "non_applicable", variablePayments: "none", prepaidPayments: "0.00", leaseIncentives: "0.00", initialDirectCosts: "0.00",
  restorationCosts: "0.00", deposit: "none", residualValueGuarantee: "none", purchaseOption: "none", ownershipTransfer: "none", terminationPenalty: "none", modification: "none", impairmentIndicator: "none", capitalizedInOtherAsset: "none" });
export const dueRows = (id: string, months: number, payment: string, asOf: string = LEASE_PERIOD.asOfDate, startIndex = 2026 * 12): LeaseRow[] => Array.from({ length: months }, (_, t) => {
  const date = monthEnd(startIndex + t), payable = date <= asOf;
  return { key: id + "-" + date, amount: payment, date, details: { contractId: id, source: src("Échéancier " + id, 2), fields: { contractVersion: "v1", ...(payable ? { paidDate: date, paidAmount: payment } : { paidDate: "non_applicable", paidAmount: "non_applicable" }) } } };
});
export function leaseRows(): Record<LeaseType, LeaseRow[]> {
  return {
    lease_contracts: [
      { key: "F01", amount: "3000.00", date: "2026-01-01", details: { contractId: "F01", source: src("Contrat F01 (exemple synthétique)"), fields: CONTRACT_FIELDS(3, "1000.00", "Matériel de bureau") } },
      { key: "F03", amount: "36000.00", date: "2026-01-01", details: { contractId: "F03", source: src("Contrat F03 (exemple synthétique)"), fields: CONTRACT_FIELDS(36, "1000.00", "Véhicules utilitaires") } },
    ],
    lease_assumptions: [
      { key: "F01", amount: "0.00", date: "2026-01-01", details: { contractId: "F01", source: src("Note de taux F01"), fields: ASSUMPTION_FIELDS("0.126825030131969720661201") } },
      { key: "F03", amount: "0.00", date: "2026-01-01", details: { contractId: "F03", source: src("Note de taux F03"), fields: ASSUMPTION_FIELDS("0.05") } },
    ],
    lease_schedule: [...dueRows("F01", 3, "1000.00"), ...dueRows("F03", 36, "1000.00")],
    lease_ledger: [{ key: "GL-613-2026", amount: "15000.00", date: "2026-12-31", details: { contractId: "F03", source: src("Grand livre 613 (exemple synthétique)", null), fields: { account: "613500", periodStart: "2026-01-01", periodEnd: "2026-12-31", piece: "OD-2026-12" } } }],
    lease_opening: [],
  };
}
const csv = (rows: LeaseRow[]) => "Key;Amount;Date;Details\n" + rows.map(r => [r.key, r.amount, r.date, JSON.stringify(r.details)].map(v => "\"" + v.replaceAll("\"", "\"\"") + "\"").join(";")).join("\n");
export const leaseFile = (type: LeaseType, rows: LeaseRow[], name = "EXEMPLE-" + type + ".csv") => new File([csv(rows)], name, { type: "text/csv" });
export function leaseFiles(edit?: (rows: Record<LeaseType, LeaseRow[]>) => void): Partial<Record<LeaseType, File>> {
  const rows = leaseRows(); edit?.(rows);
  return Object.fromEntries(Object.entries(rows).filter(([, rs]) => rs.length).map(([type, rs]) => [type, leaseFile(type as LeaseType, rs)]));
}
/** Lots approuvés en mémoire (tests unitaires) : même lecteur et même porte d'import que le serveur. */
export async function approvedLeaseBatches(scope: WorkpaperScope, actor: Principal, edit?: (rows: Record<LeaseType, LeaseRow[]>) => void): Promise<ImportBatch[]> {
  const out: ImportBatch[] = [];
  for (const [type, file] of Object.entries(leaseFiles(edit))) {
    const batch = await previewImport(file!, scope, LEASE_MAPPING, actor, type, "ifrs16.leases");
    out.push({ ...batch, approval: { actorId: actor.id, at: "2027-02-01T09:00:00.000Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } });
  }
  return out;
}
