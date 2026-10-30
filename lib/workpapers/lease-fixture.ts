import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { monthEnd } from "@/lib/ifrs/leases/qualification";
import { previewImport, type ImportBatch } from "./imports";
import { LEASE_MAPPING, type LeaseType } from "./lease-sources";
import type { WorkpaperScope } from "./model";
import type { Principal } from "./policy";

/**
 * Sources synthétiques (mapping `ifrs16-leases-2`), utilisées par les tests et par le scénario de démonstration en lecture seule : contrats F01 et F03 de l'oracle C00, mêmes montants, décalés sur l'exercice 2026,
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
/** Ligne de grand livre 612 / 613 / 614 : compte, période couverte et pièce ; `contractId` absent pour une ligne sans contrat du registre. */
export const ledgerRow = (key: string, contractId: string | null, amount: string, account: string, periodStart: string, periodEnd: string, piece: string, date: string = periodEnd): LeaseRow =>
  ({ key, amount, date, details: { ...(contractId ? { contractId } : {}), source: src("Grand livre " + account.slice(0, 3) + " (exemple synthétique)", null), fields: { account, periodStart, periodEnd, piece } } });
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
    // Base PCG framed to the cent: F01 by monthly invoice, F03 by one annual line covering its twelve dues of 2026.
    lease_ledger: [...[1, 2, 3].map(m => ledgerRow("GL-613-F01-2026-0" + m, "F01", "1000.00", "613200", "2026-0" + m + "-01", monthEnd(2026 * 12 + m - 1), "FA-F01-2026-0" + m)),
      ledgerRow("GL-613-F03-2026", "F03", "12000.00", "613500", "2026-01-01", "2026-12-31", "OD-2026-12")],
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

/**
 * Portefeuille du scénario de démonstration : F01 et F03 calculables et cadrés, plus un contrat par autre statut (taux nominal à convertir,
 * faible valeur documentée, loyers indexés, non-location documentée), D08 calculable avec un écart de cadrage (charge mixte) et une ligne
 * de grand livre sans contrat du registre. Tout est synthétique et étiqueté comme tel.
 */
export function leaseDemoRows(): Record<LeaseType, LeaseRow[]> {
  const rows = leaseRows();
  const add = (id: string, category: string, edit: (contract: Record<string, string>, assumptions: Record<string, string>) => void) => {
    // 24 months: no short-term policy question, so each contract shows only the case it illustrates.
    const contract = CONTRACT_FIELDS(24, "400.00", category) as Record<string, string>, assumptions = ASSUMPTION_FIELDS("0.04") as Record<string, string>;
    edit(contract, assumptions);
    rows.lease_contracts.push({ key: id, amount: "9600.00", date: "2026-01-01", details: { contractId: id, source: src("Contrat " + id + " (exemple synthétique)"), fields: contract } });
    rows.lease_assumptions.push({ key: id, amount: "0.00", date: "2026-01-01", details: { contractId: id, source: src("Note " + id), fields: assumptions } });
    rows.lease_schedule.push(...dueRows(id, 24, "400.00"));
  };
  add("D04", "Locaux", (_c, a) => { a.rateBasis = "nominal"; });
  add("D05", "Matériel informatique", (_c, a) => { Object.assign(a, { lowValueExemption: "elected", lowValueNewValue: "900.00", lowValueJudgement: "Ordinateur portable utilisable seul (B5), valeur à neuf de la facture" }); });
  add("D06", "Locaux", (_c, a) => { a.variablePayments = "index"; });
  add("D07", "Prestations", c => { Object.assign(c, { controlOfUse: "no", identificationEvidence: "Le prestataire choisit et remplace librement les véhicules (B14) : pas d'actif identifié" }); });
  // D08 is computable, but its 2026 charge also carries 600.00 of service charges: a known framing difference, never neutralized.
  add("D08", "Matériel de manutention", () => {});
  rows.lease_ledger.push(ledgerRow("GL-613-D08-2026", "D08", "5400.00", "613500", "2026-01-01", "2026-12-31", "OD-2026-12-D08"),
    ledgerRow("GL-614-2026-SC", null, "1800.00", "614000", "2026-01-01", "2026-12-31", "OD-2026-12-SC"));
  return rows;
}
