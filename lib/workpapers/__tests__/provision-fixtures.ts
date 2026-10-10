import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId, type WorkpaperScope } from "../model";
import type { ProvisionMapping, ProvisionSourceType } from "../provision-sources";

/**
 * Synthetic provisions and commitments dossier (Mission 16). Every event, counterparty, amount and piece is invented
 * for the recipe; none comes from a real entity or person. Amounts are euros with two decimals.
 */
export const pvPeriod = { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-03-31", currency: "EUR" as const, validation: "provisional" as const } satisfies AccountingPeriod;
export const pvScope: WorkpaperScope = { organizationId: "org-pv-synthetic", dossierId: "66666666-6666-4666-8666-666666666666", periodId: periodId(pvPeriod), mode: "real" };
export const csv = (header: string[], rows: string[][]) => [header, ...rows].map(r => r.join(";")).join("\n") + "\n";
export const REGISTER_HEADER = ["Evenement", "ProvisionOuverture", "DateNaissance", "Libelle", "Type", "Traitement", "DateCloture", "Compte", "ProvisionCloture", "MontantEngagement", "Obligation", "Contrepartie", "Methode", "Auteur", "Decision", "PieceDecision", "DateDecision", "Confidentiel"];
/**
 * EV-01 estimation documentée 80 contre provision 50 (différence +30 à examiner, confidentiel) ; EV-02 reprise sans justificatif ;
 * EV-03 engagement hors grand livre ; EV-04 risque clôturé ; EV-05 estimation absente ; EV-06 passif éventuel absent de l’annexe ;
 * EV-07 né après la clôture (hors population).
 */
export const REGISTER_ROWS = [
  ["EV-01", "30,00", "2025-10-15", "Litige commercial n°1", "litige", "provision", "", "1511", "50,00", "", "Réclamation pour livraison non conforme, assignation devant le tribunal de commerce", "Client Alpha SAS (fictif)", "Hypothèse la plus probable selon la lettre de l’avocat", "Direction juridique (synthétique)", "Provision portée à 50 par le comité des risques", "PV-COMITE-12", "2026-12-20", "oui"],
  ["EV-02", "25,00", "2024-06-30", "Garanties clients", "garantie", "provision", "", "1512", "10,00", "", "Garantie contractuelle de 24 mois sur les ventes", "", "Statistique des retours sous garantie", "Direction financière (synthétique)", "Provision ramenée à 10", "PV-COMITE-12", "2026-12-20", "non"],
  ["EV-03", "0,00", "2026-03-01", "Caution bancaire filiale", "engagement_donne", "engagement_hors_bilan", "", "", "", "200,00", "Caution donnée à la banque pour le prêt de la filiale Gamma", "Banque Delta (fictive)", "", "Direction financière (synthétique)", "Caution autorisée par le conseil", "CA-2026-03", "2026-02-25", "non"],
  ["EV-04", "40,00", "2025-02-10", "Litige fournisseur Beta", "litige", "provision", "2026-06-30", "1511", "0,00", "", "Réclamation d’un fournisseur pour rupture de contrat", "Fournisseur Beta (fictif)", "Protocole transactionnel signé", "Direction juridique (synthétique)", "Dossier soldé par protocole", "PROTO-TRANS-04", "2026-06-30", "non"],
  ["EV-05", "0,00", "2026-11-15", "Restructuration atelier Est", "restructuration", "provision", "", "1522", "15,00", "", "Plan de fermeture de l’atelier Est annoncé au personnel", "", "Coûts directs du plan", "Direction générale (synthétique)", "Provision constituée à 15", "PLAN-RESTRUCT-11", "2026-11-30", "non"],
  ["EV-06", "0,00", "2026-09-01", "Contentieux social n°6", "social", "passif_eventuel", "", "", "", "", "Contestation d’un licenciement devant le conseil de prud’hommes", "Salarié (pseudonyme SYN-06)", "Avis de l’avocat : condamnation possible, non probable", "Direction juridique (synthétique)", "Pas de provision, mention en annexe prévue", "PV-COMITE-12", "2026-12-20", "oui"],
  ["EV-07", "0,00", "2027-01-20", "Sinistre entrepôt janvier 2027", "autre_risque", "aucun", "", "", "", "", "Dégât des eaux survenu après la clôture", "", "", "Direction financière (synthétique)", "", "", "", "non"],
];
export const MOVEMENT_HEADER = ["Ligne", "Montant", "Date", "Evenement", "Nature", "Compte", "Piece", "Justification"];
export const MOVEMENT_ROWS = [
  ["M01", "20,00", "2026-12-31", "EV-01", "dotation", "1511", "OD-1511-12", "Complément au vu de la lettre de l’avocat"],
  ["M02", "5,00", "2026-05-31", "EV-02", "utilisation", "1512", "AV-GAR-05", "Avoirs de garantie émis"],
  ["M03", "10,00", "2026-12-31", "EV-02", "reprise", "1512", "", ""],
  ["M04", "35,00", "2026-06-30", "EV-04", "utilisation", "1511", "PROTO-TRANS-04", "Indemnité versée"],
  ["M05", "5,00", "2026-06-30", "EV-04", "reprise", "1511", "PROTO-TRANS-04", "Solde non utilisé"],
  ["M06", "15,00", "2026-12-31", "EV-05", "dotation", "1522", "OD-1522-12", "Constitution"],
];
export const ESTIMATE_HEADER = ["Ligne", "Montant", "Date", "Evenement", "Scenario", "Retenue", "Methode", "Auteur", "Piece", "Appreciation"];
export const ESTIMATE_ROWS = [
  ["E01", "40,00", "2027-02-15", "EV-01", "Bas", "non", "Fourchette de l’avocat", "Avocat (synthétique)", "LET-AVOCAT-01", "Transaction possible"],
  ["E02", "80,00", "2027-02-15", "EV-01", "Central — hypothèse la plus probable", "oui", "Hypothèse la plus probable (PCG art. 323-2)", "Avocat (synthétique)", "LET-AVOCAT-01", "Issue défavorable plausible"],
  ["E03", "120,00", "2027-02-15", "EV-01", "Haut", "non", "Fourchette de l’avocat", "Avocat (synthétique)", "LET-AVOCAT-01", "Condamnation intégrale peu probable"],
  ["E04", "10,00", "2027-01-10", "EV-02", "Statistique des retours", "oui", "Taux de retour observé sur 24 mois", "Direction financière (synthétique)", "STAT-GAR-26", ""],
  ["E05", "12,00", "2027-02-20", "EV-06", "Effets financiers estimés", "oui", "Avis de l’avocat", "Avocat (synthétique)", "EST-PRUD-06", "Condamnation possible, non probable"],
];
export const LEDGER_HEADER = ["Compte", "SoldeCloture", "Date", "SoldeOuverture", "Libelle"];
export const LEDGER_ROWS = [
  ["1511", "50,00", "2026-12-31", "70,00", "Provisions pour litiges"],
  ["1512", "10,00", "2026-12-31", "25,00", "Provisions pour garanties données aux clients"],
  ["1522", "15,00", "2026-12-31", "0,00", "Provisions pour restructurations"],
];
export const ANNEX_HEADER = ["Ligne", "Montant", "Date", "Evenement", "Rubrique", "StatutMontant", "Libelle"];
export const ANNEX_ROWS = [
  ["A01", "50,00", "2027-03-10", "EV-01", "provision", "publie", "Provision pour litige commercial"],
  ["A02", "10,00", "2027-03-10", "EV-02", "provision", "publie", "Provision pour garanties"],
  ["A03", "200,00", "2027-03-10", "EV-03", "engagement_donne", "publie", "Caution donnée au profit d’une filiale"],
];
export const SUPPORT_HEADER = ["Piece", "Pages", "Date", "Evenement", "Nature", "Confidentiel", "Libelle"];
export const SUPPORT_ROWS = [
  ["PV-COMITE-12", "4", "2026-12-20", "", "decision", "non", "Procès-verbal du comité des risques du 20/12/2026"],
  ["LET-AVOCAT-01", "3", "2027-02-15", "EV-01", "correspondance", "oui", "Lettre de l’avocat — litige Client Alpha"],
  ["OD-1511-12", "1", "2026-12-31", "EV-01", "ecriture", "non", "Écriture de dotation 1511"],
  ["AV-GAR-05", "2", "2026-05-31", "EV-02", "ecriture", "non", "Avoirs de garantie de mai"],
  ["STAT-GAR-26", "2", "2027-01-10", "EV-02", "estimation", "non", "Statistique des retours sous garantie 2025-2026"],
  ["CA-2026-03", "2", "2026-02-25", "EV-03", "decision", "non", "Délibération du conseil autorisant la caution"],
  ["CONTRAT-CAUTION-03", "6", "2026-03-01", "EV-03", "contrat", "non", "Acte de cautionnement — Banque Delta"],
  ["PROTO-TRANS-04", "5", "2026-06-30", "EV-04", "jugement", "non", "Protocole transactionnel avec le fournisseur Beta"],
  ["PLAN-RESTRUCT-11", "8", "2026-11-30", "EV-05", "decision", "non", "Plan de restructuration et annonce au personnel"],
  ["OD-1522-12", "1", "2026-12-31", "EV-05", "ecriture", "non", "Écriture de dotation 1522"],
  ["LET-PRUD-06", "2", "2026-09-01", "EV-06", "correspondance", "oui", "Convocation devant le conseil de prud’hommes"],
  ["EST-PRUD-06", "1", "2027-02-20", "EV-06", "estimation", "oui", "Note de l’avocat sur les effets financiers"],
  ["LET-AVOCATS", "6", "2027-02-28", "", "correspondance", "oui", "Réponses des avocats sur les procès et litiges (NEP 501 § 07)"],
];
export const PV_CSV: Record<ProvisionSourceType, string> = {
  pv_register: csv(REGISTER_HEADER, REGISTER_ROWS), pv_movements: csv(MOVEMENT_HEADER, MOVEMENT_ROWS), pv_estimates: csv(ESTIMATE_HEADER, ESTIMATE_ROWS),
  pv_ledger: csv(LEDGER_HEADER, LEDGER_ROWS), pv_annex: csv(ANNEX_HEADER, ANNEX_ROWS), pv_support: csv(SUPPORT_HEADER, SUPPORT_ROWS),
};
export const registerCsv = (rows: string[][]) => csv(REGISTER_HEADER, rows);
export const movementCsv = (rows: string[][]) => csv(MOVEMENT_HEADER, rows);
export const estimateCsv = (rows: string[][]) => csv(ESTIMATE_HEADER, rows);
export const ledgerCsv = (rows: string[][]) => csv(LEDGER_HEADER, rows);
export const annexCsv = (rows: string[][]) => csv(ANNEX_HEADER, rows);
export const supportCsv = (rows: string[][]) => csv(SUPPORT_HEADER, rows);
/** Explicit mapping of each synthetic source; the movements journal declares that it covers the whole exercise. */
export function pvMapping(type: ProvisionSourceType, coverage = { from: pvPeriod.startDate, to: pvPeriod.closingDate }): ProvisionMapping {
  const base = { version: "provisions-1" as const, headerRow: 1, delimiter: ";" as const, decimal: "," as const, dateFormat: "ISO" as const, sign: 1 as const, currency: "EUR" as const };
  if (type === "pv_register") return { ...base, columns: { key: "Evenement", amount: "ProvisionOuverture", date: "DateNaissance" }, provisions: { basis: "register", labelColumn: "Libelle", typeColumn: "Type", treatmentColumn: "Traitement", closedColumn: "DateCloture",
    accountColumn: "Compte", declaredClosingColumn: "ProvisionCloture", commitmentColumn: "MontantEngagement", obligationColumn: "Obligation", counterpartyColumn: "Contrepartie", methodColumn: "Methode", authorColumn: "Auteur",
    decisionColumn: "Decision", decisionPieceColumn: "PieceDecision", decisionDateColumn: "DateDecision", confidentialColumn: "Confidentiel" } };
  if (type === "pv_movements") return { ...base, columns: { key: "Ligne", amount: "Montant", date: "Date" }, provisions: { basis: "movements", eventColumn: "Evenement", kindColumn: "Nature", accountColumn: "Compte", pieceColumn: "Piece", justificationColumn: "Justification", coverageFrom: coverage.from, coverageTo: coverage.to } };
  if (type === "pv_estimates") return { ...base, columns: { key: "Ligne", amount: "Montant", date: "Date" }, provisions: { basis: "estimates", eventColumn: "Evenement", scenarioColumn: "Scenario", retainedColumn: "Retenue", methodColumn: "Methode", authorColumn: "Auteur", pieceColumn: "Piece", appreciationColumn: "Appreciation" } };
  if (type === "pv_ledger") return { ...base, columns: { key: "Compte", amount: "SoldeCloture", date: "Date" }, provisions: { basis: "ledger", openingColumn: "SoldeOuverture", labelColumn: "Libelle" } };
  if (type === "pv_annex") return { ...base, columns: { key: "Ligne", amount: "Montant", date: "Date" }, provisions: { basis: "annex", eventColumn: "Evenement", rubricColumn: "Rubrique", amountStatusColumn: "StatutMontant", labelColumn: "Libelle" } };
  return { ...base, columns: { key: "Piece", amount: "Pages", date: "Date" }, provisions: { basis: "support", eventColumn: "Evenement", kindColumn: "Nature", confidentialColumn: "Confidentiel", labelColumn: "Libelle" } };
}
