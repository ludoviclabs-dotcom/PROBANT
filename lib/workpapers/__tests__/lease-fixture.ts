import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { previewImport, type ImportBatch } from "../imports";
import { LEASE_MAPPING, type LeaseType } from "../lease-sources";
import type { WorkpaperScope } from "../model";
import type { Principal } from "../policy";

/**
 * Sources synthétiques du socle C01 (montants des contrats F01 et F03 de l'oracle C00), au format du mapping fermé `ifrs16-leases-1`.
 * Exercice 2026, celui de la recette Emprunts : les deux feuilles partagent le même dossier, le même exercice et le même store.
 */
export const LEASE_PERIOD = { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-02-15", currency: "EUR" as const, validation: "provisional" as const } satisfies AccountingPeriod;
export type LeaseRow = { key: string; amount: string; date: string; details: Record<string, unknown> };
const src = (title: string, page: number | null = 1) => ({ title, pack: "Pack synthétique IFRS 16 C01", date: "2026-01-02", page, clause: "Article 3 — loyers" });
export function leaseRows(): Record<LeaseType, LeaseRow[]> {
  return {
    lease_contracts: [
      { key: "F01", amount: "3000.00", date: "2026-01-01", details: { contractId: "F01", source: src("Contrat F01 (exemple synthétique)"), fields: { asset: "Matériel de bureau", termMonths: "3", payment: "1000.00" } } },
      { key: "F03", amount: "36000.00", date: "2026-01-01", details: { contractId: "F03", source: src("Contrat F03 (exemple synthétique)"), fields: { asset: "Véhicule utilitaire", termMonths: "36", payment: "1000.00" } } },
    ],
    lease_assumptions: [
      { key: "F01-rate", amount: "0.00", date: "2026-01-01", details: { contractId: "F01", source: src("Note de taux F01"), fields: { annualEffectiveRate: "0.126825030131969720661201", rateNature: "taux implicite" } } },
      { key: "F03-rate", amount: "0.00", date: "2026-01-01", details: { contractId: "F03", source: src("Note de taux F03"), fields: { annualEffectiveRate: "0.05", rateNature: "taux marginal d'endettement" } } },
    ],
    lease_schedule: [
      { key: "F01-E1", amount: "1000.00", date: "2026-01-31", details: { contractId: "F01", source: src("Échéancier F01", 2) } },
      { key: "F03-E1", amount: "1000.00", date: "2026-01-31", details: { contractId: "F03", source: src("Échéancier F03", 2) } },
    ],
    lease_ledger: [{ key: "GL-613-01", amount: "2000.00", date: "2026-01-31", details: { source: src("Grand livre 613 (exemple synthétique)", null), fields: { account: "613200" } } }],
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
