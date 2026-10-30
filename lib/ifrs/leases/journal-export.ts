import { materializeBundle, type AdjustmentBundle } from "@/lib/ifrs/shared/bundle";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { buildLeaseBundle, LOGICAL_ACCOUNT_CATALOG, LOGICAL_ACCOUNTS_VERSION } from "./adjustment";
import { computeLease } from "./engine";

/**
 * Modèle d'export du journal de retraitement (L16-03), `ifrs16-journal-csv-1` : une ligne par écriture du retraitement matérialisé,
 * séparateur « ; », montants au point décimal en centimes exacts, débit et crédit en colonnes distinctes, preuves citées par identifiant.
 * Un export ne vaut ni sélection ni comptabilisation : le statut dit « proposé » ou « revu », rien d'autre. Aucune écriture dans un FEC.
 */
export const JOURNAL_EXPORT_VERSION = "ifrs16-journal-csv-1";
export const JOURNAL_COLUMNS = ["export_version", "logical_accounts_version", "logical_id", "revision", "run_version", "bundle_hash", "review_status", "period_start", "period_end",
  "contract_id", "contract_version", "logical_account", "logical_account_label", "nature", "debit", "credit", "evidence", "tax_status"] as const;
const cell = (value: string | number) => { const v = String(value); return /[;"\n\r]/.test(v) ? "\"" + v.replaceAll("\"", "\"\"") + "\"" : v; };

export function bundleJournalCsv(bundle: AdjustmentBundle): string {
  const rows = bundle.lines.map(l => [JOURNAL_EXPORT_VERSION, LOGICAL_ACCOUNTS_VERSION, bundle.logicalId, bundle.revision, bundle.runVersion, bundle.bundleHash, bundle.status, bundle.period.startDate, bundle.period.closingDate,
    l.contractId, l.contractVersion, l.account, LOGICAL_ACCOUNT_CATALOG[l.account].label, l.nature, l.side === "debit" ? l.amount.amount : "", l.side === "credit" ? l.amount.amount : "", l.evidence.join(" "), bundle.taxStatus]);
  return [JOURNAL_COLUMNS.join(";"), ...rows.map(r => r.map(cell).join(";"))].join("\n") + "\n";
}

/**
 * Modèle publié dans `docs/ifrs/modeles/journal_retraitement.csv` : contrat F01 de l'oracle, clôture au 31/01/2027, scénario synthétique
 * (charge PCG de janvier de 1 000,00 € cadrée). Données fictives ; les preuves sont des identifiants d'exemple.
 */
export function journalModelCsv(): string {
  const period = { startDate: "2027-01-01", closingDate: "2027-01-31" };
  const r = computeLease({ contractId: "F01", version: "v1", commencement: "2027-01-01", months: 3, payment: { amount: "1000.00", currency: "EUR" }, annualRate: "0.126825030131969720661201", usefulLifeMonths: 3, opening: null }, period);
  if (r.result !== "computed") throw new Error("L16_MODEL_INVALID");
  const scope = { organizationId: "EXEMPLE-ORG", dossierId: "EXEMPLE-DOSSIER", periodId: periodId({ ...period, asOfDate: "2027-02-15", currency: "EUR", validation: "provisional" }), mode: "demo" as const };
  const core = buildLeaseBundle({ runId: "EXEMPLE-FEUILLE", rootId: "EXEMPLE-FEUILLE", revision: 1, scope, period, ledgerRef: { importId: "EXEMPLE-IMPORT-GL", documentVersionId: "EXEMPLE-GL-V1", sha256: "0".repeat(64) },
    contracts: [{ contractId: "F01", version: "v1", closing: r.closing, evidence: { calculation: ["EXEMPLE-FEUILLE:lease:contrat-F01", "EXEMPLE-FEUILLE:lease:hypotheses-F01"], ledger: ["EXEMPLE-FEUILLE:lease:gl-613-2027-01"] } }] })!;
  const run = { id: "EXEMPLE-FEUILLE", rootId: "EXEMPLE-FEUILLE", revision: 1, version: 1, schemaVersion: "1.0.0", scope, period: { ...period, asOfDate: "2027-02-15", currency: "EUR", validation: "provisional" }, state: "executed",
    template: { id: "ifrs16.leases", version: "1.0.0", objective: "Modèle", kind: "calculated", assertions: [], requiredDocumentTypes: [] }, preparedBy: "exemple", importIds: [], evidence: [], findings: [], notes: [], events: [] } as unknown as WorkpaperRun;
  return bundleJournalCsv(materializeBundle(core, run));
}
