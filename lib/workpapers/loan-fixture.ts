import { previewImport, type ImportBatch } from "./imports";
import { LoanRegistry, LOAN_TEMPLATE } from "./loan-adapter";
import { LOAN_PERIOD } from "./loan-period";
import { evaluateLoans, initialLoanDraft, loanFacts, loanReviewPoints, LOAN_MAPPING, LOAN_TYPES, stampLoanWork, type LoanType } from "./loan-review";
import { INTERVAL_CONVENTION } from "./loan-rules";
import { periodId, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { Principal } from "./policy";
import { freezePopulation, selectPopulation } from "./selection";
export { LOAN_PERIOD } from "./loan-period";

/**
 * Synthetic loans packs of the C13 recipe. Every amount below is a client input (schedule, ledger, payments,
 * confirmations, balance) or a contract parameter of the EXAMPLE — never a general rate, convention or threshold.
 * Expected recalculations are established independently in docs/recette/c13/attendus.py.
 */
export type LoanRow = { key: string; amount: string; date: string; details: Record<string, unknown> };
export type LoanRows = Record<LoanType, LoanRow[]>;
export type LoanScenario = "complete" | "simple";
const PACK = "EXEMPLE-EMPRUNTS-2026";
const src = (title: string, date: string, page: number | null, clause: string, excerpt: string) => ({ title, pack: PACK, date, page, clause, excerpt });
const eur = (amount: string) => ({ amount, currency: "EUR" });

interface DueSpec { due: string; start: string; end: string; principal: string; interest: string; fees: string; version: string; kind?: "scheduled" | "early"; explanation?: string; gl?: { interest?: string; fee?: boolean } }
interface LoanSpec {
  id: string; nominal: string; contract: Record<string, unknown>[]; principalAccount: string; accruedAccount: string | null; opening: string; openingAccrued: string | null;
  closing: string; accrued: string | null; confirmation: string | null; dues: DueSpec[]; clauses?: Record<string, unknown>[]; rates?: { revision: string; fixing: string; value: string }[];
}

function contract(id: string, extra: Record<string, unknown>) {
  return { contractId: id, version: "1", lender: "Banque exemple (synthétique)", nature: "emprunt_bancaire", currency: "EUR", dayCount: "ACT/360", rateKind: "fixed", fixedRatePercent: null, indexName: null, spreadPercent: null,
    revisionDates: null, indexBounds: null, feesTreatment: "separate_cash", movementsComplete: true, scheduleComplete: true, intervalConvention: INTERVAL_CONVENTION, terms: null, accruedAccount: null, ...extra };
}
const quarterly = (from: number, to: number) => Array.from({ length: (to - from + 1) * 4 }, (_, i) => `${from + Math.floor(i / 4)}-${String((i % 4) * 3 + 1).padStart(2, "0")}-01`);

function specs(scenario: LoanScenario, long: boolean): LoanSpec[] {
  const monthly = Array.from({ length: 10 }, (_, i) => i + 2).map(m => ({ due: `2026-${String(m + 1).padStart(2, "0")}-01`, start: `2026-${String(m).padStart(2, "0")}-01`, end: `2026-${String(m + 1).padStart(2, "0")}-01`, principal: "0.00", interest: "225.00", fees: "0.00", version: "1" }));
  const simple: LoanSpec = {
    id: "C13-SIMPLE", nominal: "100000.00", principalAccount: "164100", accruedAccount: "164800", opening: "100000.00", openingAccrued: null, closing: "90000.00", accrued: "225.00", confirmation: "90000.00",
    contract: [contract("C13-SIMPLE", { name: long ? "Prêt d’équipement de l’atelier régional — recette simple C13, libellé contractuel volontairement long pour vérifier sa restitution dans les tableaux et le panneau" : "Prêt d’équipement — recette simple C13",
      principalAccount: "164100", accruedAccount: "164800", startDate: "2026-01-01", maturity: "2035-12-31", effectiveFrom: "2026-01-01", effectiveTo: "2035-12-31", dayCount: "30/360", fixedRatePercent: "3", lastInterestPaidThrough: "2026-12-01",
      source: src("Contrat de prêt C13-SIMPLE (exemple synthétique)", "2025-12-20", 2, "Art. 4 — Intérêts et remboursement", "Taux fixe de 3 % l’an, base 30/360 (mois de 30 jours, année de 360 jours) ; intérêts payables le 1er de chaque mois pour le mois écoulé ; fonds versés le 31/12/2025, intérêts courant à compter du 1er janvier 2026 ; remboursement de 10 000 EUR le 1er février de chaque année.") })],
    dues: [{ due: "2026-02-01", start: "2026-01-01", end: "2026-02-01", principal: "10000.00", interest: "250.00", fees: "0.00", version: "1" }, ...monthly,
      { due: "2027-01-01", start: "2026-12-01", end: "2027-01-01", principal: "0.00", interest: "225.00", fees: "0.00", version: "1" }],
  };
  if (scenario === "simple") return [simple];
  return [simple, {
    id: "C13-VARIABLE", nominal: "200000.00", principalAccount: "164200", accruedAccount: "164800", opening: "200000.00", openingAccrued: "1661.11", closing: "185000.00", accrued: "1640.00", confirmation: "185000.00",
    contract: [contract("C13-VARIABLE", { name: "Prêt à taux variable Euribor 3 mois", principalAccount: "164200", accruedAccount: "164800", startDate: "2025-10-01", maturity: "2032-10-01", effectiveFrom: "2025-10-01", effectiveTo: "2032-10-01",
      rateKind: "variable", indexName: "Euribor 3 mois", spreadPercent: "1.2", revisionDates: quarterly(2025, 2032).filter(d => d >= "2025-10-01" && d <= "2032-10-01"), indexBounds: false, lastInterestPaidThrough: "2026-10-01",
      source: src("Contrat de prêt C13-VARIABLE (exemple synthétique)", "2025-09-15", 3, "Art. 5 — Taux variable", "Euribor 3 mois constaté deux jours ouvrés avant chaque date de révision (1er janvier, avril, juillet, octobre), majoré d’une marge de 1,20 % ; base exact/360 ; sans plancher ni plafond ; amortissement de 5 000 EUR par trimestre à compter du 1er avril 2026.") })],
    rates: [{ revision: "2025-10-01", fixing: "2025-09-29", value: "2.05" }, { revision: "2026-01-01", fixing: "2025-12-30", value: "2" }, { revision: "2026-04-01", fixing: "2026-03-30", value: "2.1" }, { revision: "2026-07-01", fixing: "2026-06-29", value: "2.15" }],
    dues: [
      { due: "2026-01-01", start: "2025-10-01", end: "2026-01-01", principal: "0.00", interest: "1661.11", fees: "0.00", version: "1" },
      { due: "2026-04-01", start: "2026-01-01", end: "2026-04-01", principal: "5000.00", interest: "1600.00", fees: "0.00", version: "1" },
      { due: "2026-07-01", start: "2026-04-01", end: "2026-07-01", principal: "5000.00", interest: "1626.63", fees: "0.00", version: "1" },
      { due: "2026-10-01", start: "2026-07-01", end: "2026-10-01", principal: "5000.00", interest: "1626.61", fees: "0.00", version: "1" },
    ],
    clauses: [{ key: "C13-VARIABLE-COV", contractId: "C13-VARIABLE", kind: "covenant", reading: "unread", reader: null, qualification: null, definition: null, threshold: null, testDate: null,
      source: src("Contrat de prêt C13-VARIABLE (exemple synthétique)", "2025-09-15", 7, "Art. 11 — Information financière", "L’emprunteur transmet ses comptes annuels et respecte le ratio défini en annexe 2 (annexe non fournie dans le pack).") }],
  }, {
    id: "C13-FRAIS", nominal: "120000.00", principalAccount: "164300", accruedAccount: "164800", opening: "120000.00", openingAccrued: "1451.84", closing: "100000.00", accrued: "1209.86", confirmation: "100000.00",
    contract: [contract("C13-FRAIS", { name: "Prêt avec frais de gestion semestriels", principalAccount: "164300", accruedAccount: "164800", startDate: "2025-01-01", maturity: "2029-12-31", effectiveFrom: "2025-01-01", effectiveTo: "2029-12-31",
      dayCount: "ACT/365F", fixedRatePercent: "2.4", lastInterestPaidThrough: "2026-07-01",
      source: src("Contrat de prêt C13-FRAIS (exemple synthétique)", "2024-12-10", 2, "Art. 4 et 6 — Intérêts et frais", "Taux fixe de 2,40 % l’an, base exact/365 ; intérêts semestriels les 1er janvier et 1er juillet ; frais de gestion de 120 EUR par semestre, prélevés séparément, non capitalisés ; amortissement semestriel de 20 000 EUR à compter du 1er juillet 2026.") })],
    dues: [
      { due: "2026-01-01", start: "2025-07-01", end: "2026-01-01", principal: "0.00", interest: "1451.84", fees: "120.00", version: "1", gl: { fee: true } },
      { due: "2026-07-01", start: "2026-01-01", end: "2026-07-01", principal: "20000.00", interest: "1428.16", fees: "120.00", version: "1", gl: { interest: "1548.16", fee: false } },
      { due: "2027-01-01", start: "2026-07-01", end: "2027-01-01", principal: "20000.00", interest: "1209.86", fees: "120.00", version: "1" },
    ],
  }, {
    id: "C13-ATLAS", nominal: "530000.00", principalAccount: "164400", accruedAccount: "164800", opening: "500000.00", openingAccrued: "2555.56", closing: "470000.00", accrued: "2938.89", confirmation: "460000.00",
    contract: [
      contract("C13-ATLAS", { name: "Atlas — avenant de taux (recette Mission 14)", principalAccount: "164400", accruedAccount: "164800", startDate: "2025-01-01", maturity: "2037-12-31", effectiveFrom: "2025-01-01", effectiveTo: "2026-06-30",
        fixedRatePercent: "2", lastInterestPaidThrough: "2026-10-01",
        source: src("Contrat de prêt C13-ATLAS (exemple synthétique)", "2024-12-15", 3, "Art. 4 — Intérêts", "Taux fixe de 2 % l’an, base exact/360 ; échéances trimestrielles les 1er janvier, avril, juillet et octobre ; amortissement de 10 000 EUR par échéance à compter du 1er avril 2025.") }),
      contract("C13-ATLAS", { version: "2", name: "Atlas — avenant de taux (recette Mission 14)", principalAccount: "164400", accruedAccount: "164800", startDate: "2025-01-01", maturity: "2037-12-31", effectiveFrom: "2026-07-01", effectiveTo: "2037-12-31",
        fixedRatePercent: "2.5", lastInterestPaidThrough: "2026-10-01",
        source: src("Avenant n° 1 au contrat C13-ATLAS (exemple synthétique)", "2026-06-15", 1, "Avenant, art. 2 — Taux et échéancier", "À compter du 1er juillet 2026, le taux est porté à 2,50 % l’an ; l’échéancier joint au présent avenant remplace le précédent pour les échéances postérieures.") }),
    ],
    dues: [
      { due: "2026-01-01", start: "2025-10-01", end: "2026-01-01", principal: "10000.00", interest: "2555.56", fees: "0.00", version: "1" },
      { due: "2026-04-01", start: "2026-01-01", end: "2026-04-01", principal: "10000.00", interest: "2450.00", fees: "0.00", version: "1" },
      { due: "2026-07-01", start: "2026-04-01", end: "2026-07-01", principal: "10000.00", interest: "2426.67", fees: "0.00", version: "1" },
      { due: "2026-10-01", start: "2026-07-01", end: "2026-10-01", principal: "10000.00", interest: "3002.78", fees: "0.00", version: "2" },
      { due: "2027-01-01", start: "2026-10-01", end: "2027-01-01", principal: "10000.00", interest: "2938.89", fees: "0.00", version: "2" },
    ],
    clauses: [
      { key: "C13-ATLAS-COV", contractId: "C13-ATLAS", kind: "covenant", reading: "read", reader: "Préparateur (exemple)", qualification: "Définition et date de test lues ; ratio non calculé par PROBANT.",
        definition: "Dettes financières nettes / excédent brut d’exploitation consolidé, tels que définis à l’article 1.1 « Définitions » du contrat.", threshold: "Inférieur ou égal à 3,0 (texte du contrat)", testDate: "2026-12-31",
        source: src("Contrat de prêt C13-ATLAS (exemple synthétique)", "2024-12-15", 9, "Art. 12 — Engagement financier", "Le ratio défini à l’article 1.1 est apprécié sur les comptes consolidés au 31 décembre de chaque exercice.") },
      { key: "C13-ATLAS-GAR", contractId: "C13-ATLAS", kind: "guarantee", reading: "unread", reader: null, qualification: null, definition: null, threshold: null, testDate: null,
        source: src("Contrat de prêt C13-ATLAS (exemple synthétique)", "2024-12-15", 8, "Art. 9 — Sûretés", "Nantissement du fonds de commerce ; mainlevée à la complète extinction de la dette.") },
    ],
  }, {
    id: "C13-REMBOURSE", nominal: "50000.00", principalAccount: "168100", accruedAccount: "168800", opening: "50000.00", openingAccrued: "1500.00", closing: "0.00", accrued: null, confirmation: "0.00",
    contract: [contract("C13-REMBOURSE", { name: "Prêt d’une société de financement — remboursé par anticipation", lender: "Société de financement (synthétique)", nature: "autre_emprunt", principalAccount: "168100", accruedAccount: "168800",
      startDate: "2024-07-01", maturity: "2030-06-30", effectiveFrom: "2024-07-01", effectiveTo: "2030-06-30", dayCount: "30E/360", fixedRatePercent: "3", lastInterestPaidThrough: "2026-09-01",
      source: src("Contrat de prêt C13-REMBOURSE (exemple synthétique)", "2024-06-20", 2, "Art. 4 et 7 — Intérêts et remboursement anticipé", "Taux fixe de 3 % l’an, base 30E/360 ; intérêts annuels le 1er janvier ; remboursement anticipé total possible à toute date, intérêts courus réglés, sans indemnité.") })],
    dues: [
      { due: "2026-01-01", start: "2025-01-01", end: "2026-01-01", principal: "0.00", interest: "1500.00", fees: "0.00", version: "1" },
      { due: "2026-09-01", start: "2026-01-01", end: "2026-09-01", principal: "50000.00", interest: "1000.00", fees: "0.00", version: "1", kind: "early", explanation: "Remboursement anticipé total au 1er septembre 2026 (art. 7) ; aucune indemnité prévue." },
    ],
  }, {
    id: "C13-AVANCE", nominal: "80000.00", principalAccount: "167300", accruedAccount: null, opening: "80000.00", openingAccrued: null, closing: "80000.00", accrued: null, confirmation: null,
    contract: [contract("C13-AVANCE", { name: "Avance remboursable en cas de succès (organisme public, exemple)", lender: "Organisme public de financement (synthétique)", nature: "avance_conditionnee", principalAccount: "167300",
      startDate: "2025-03-01", maturity: "2030-12-31", effectiveFrom: "2025-03-01", effectiveTo: "2030-12-31", dayCount: null, rateKind: null, feesTreatment: null, scheduleComplete: null, intervalConvention: null, lastInterestPaidThrough: null,
      terms: { capitauxPropres: "non", remboursementImposable: "inconnu", partsFixes: "sans_objet", partNonRemboursable: null, avanceFondsPublics: "oui", remboursementConditionneSucces: "oui", abandonEnCasEchec: "oui", interetsConditionnes: "sans_objet", presentationDeclaree: null },
      source: src("Convention d’aide C13-AVANCE (exemple synthétique)", "2025-02-10", 4, "Art. 6 — Remboursement", "Avance de l’organisme public remboursable uniquement en cas de succès technique et commercial du programme ; abandon de la créance en cas d’échec constaté ; avance ne portant pas intérêt.") })],
    dues: [],
  }];
}

/** Rows of the eight closed source types; `edit` lets a test alter one input without touching the engine. */
export function loanFixtureRows(scenario: LoanScenario = "complete", long = false): LoanRows {
  const out = Object.fromEntries(LOAN_TYPES.map(t => [t, [] as LoanRow[]])) as LoanRows;
  const add = (type: LoanType, key: string, amount: string, date: string, details: Record<string, unknown>) => out[type].push({ key, amount, date, details });
  const gl = (title: string) => src(title, "2027-01-20", null, "Extrait du grand livre", "Écriture de l’exercice 2026, journal de banque ou d’opérations diverses.");
  for (const s of specs(scenario, long)) {
    for (const c of s.contract) add("loan_contracts", s.id + "-V" + c.version, s.nominal, String(c.effectiveFrom), c);
    const ledger = (basis: string, amount: string, date: string, account: string, dueId: string | null, key = basis) =>
      add("loan_ledger", s.id + "-GL-" + key, amount, date, { contractId: s.id, account, basis, dueId, source: { ...gl("Grand livre 2026 (exemple synthétique)"), excerpt: basis + " · " + date + " · " + amount + " EUR · compte " + account + " · contrat " + s.id } });
    ledger("opening_principal", s.opening, "2026-01-01", s.principalAccount, null);
    if (s.openingAccrued) ledger("opening_accrued_interest", s.openingAccrued, "2026-01-01", s.accruedAccount!, null);
    ledger("closing_principal", s.closing, "2026-12-31", s.principalAccount, null);
    if (s.accrued) ledger("accrued_interest", s.accrued, "2026-12-31", s.accruedAccount!, null);
    for (const d of s.dues) {
      const dueId = s.id + "-E" + d.due.replaceAll("-", "");
      add("loan_schedule", dueId, d.principal, d.due, { contractId: s.id, contractVersion: d.version, start: d.start, end: d.end, dueDate: d.due, kind: d.kind ?? "scheduled", interest: eur(d.interest), fees: eur(d.fees), explanation: d.explanation ?? null,
        source: src("Tableau d’amortissement " + s.id + " (exemple synthétique)", d.version === "2" ? "2026-06-15" : "2025-12-20", 1, "Échéance du " + d.due, "Principal " + d.principal + " EUR ; intérêts " + d.interest + " EUR ; frais " + d.fees + " EUR ; période du " + d.start + " au " + d.end + " exclu.") });
      if (d.due > "2026-12-31") continue;
      const tag = d.due.replaceAll("-", "");
      if (d.principal !== "0.00") ledger("principal_repayment", d.principal, d.due, s.principalAccount, dueId, "principal_repayment-" + tag);
      ledger("interest", d.gl?.interest ?? d.interest, d.due, "661100", dueId, "interest-" + tag);
      if (d.fees !== "0.00" && d.gl?.fee !== false) ledger("fee", d.fees, d.due, "627000", dueId, "fee-" + tag);
      const pay = (basis: string, amount: string) => add("loan_payments", s.id + "-PAY-" + basis + "-" + tag, amount, d.due, { contractId: s.id, basis, dueId,
        source: src("Relevé bancaire 2026 (exemple synthétique)", "2027-01-05", null, "Prélèvement " + dueId, "Prélèvement " + basis + " du " + d.due + " : " + amount + " EUR ; référence " + dueId + ".") });
      if (d.principal !== "0.00") pay("principal", d.principal);
      pay("interest", d.interest);
      if (d.fees !== "0.00") pay("fee", d.fees);
    }
    for (const r of s.rates ?? []) add("loan_rates", s.id + "-IDX-" + r.revision.replaceAll("-", ""), "0.00", r.revision, { contractId: s.id, indexName: "Euribor 3 mois", indexPercent: r.value, fixingDate: r.fixing,
      source: src("Avis de révision de taux " + s.id + " (exemple synthétique)", r.fixing, 1, "Révision du " + r.revision, "Euribor 3 mois constaté le " + r.fixing + " : " + r.value.replace(".", ",") + " % (valeur synthétique de l’exemple).") });
    if (s.confirmation !== null) add("loan_confirmations", s.id + "-CONF", s.confirmation, "2026-12-31", { contractId: s.id, basis: "closing_principal",
      source: src("Confirmation du prêteur " + s.id + " (exemple synthétique)", "2027-01-12", 1, "Solde au 31 décembre 2026", "Capital restant dû au 31/12/2026 : " + s.confirmation + " EUR.") });
    for (const c of s.clauses ?? []) { const { key, ...details } = c; add("loan_clauses", String(key), "0.00", (details.source as { date: string }).date, details); }
  }
  if (scenario === "complete") {
    // GL lines citing a reference absent from the contracts pack: kept, never given parameters.
    for (const [basis, amount, date] of [["opening_principal", "75000.00", "2026-01-01"], ["closing_principal", "80000.00", "2026-12-31"]] as const)
      add("loan_ledger", "REF-INCONNUE-GL-" + basis, amount, date, { contractId: "REF-INCONNUE", account: "168100", basis, dueId: null, source: src("Grand livre 2026 (exemple synthétique)", "2027-01-20", null, "Ligne sans contrat", "Référence REF-INCONNUE absente du pack de contrats fourni.") });
  }
  const balance: [string, string, string][] = scenario === "simple" ? [["164100", "Emprunts auprès des établissements de crédit", "90000.00"], ["164800", "Intérêts courus sur emprunts auprès des établissements de crédit", "225.00"]]
    : [["164100", "Emprunt C13-SIMPLE", "90000.00"], ["164200", "Emprunt C13-VARIABLE", "185000.00"], ["164300", "Emprunt C13-FRAIS", "100000.00"], ["164400", "Emprunt C13-ATLAS", "470000.00"],
      ["164800", "Intérêts courus sur emprunts auprès des établissements de crédit", "6013.75"], ["167300", "Avances conditionnées montant principal", "80000.00"], ["168100", "Autres emprunts", "95000.00"]];
  for (const [account, label, amount] of balance) add("loan_balance", account, amount, "2026-12-31", { account, label, basis: "account_closing",
    source: src("Balance générale au 31/12/2026 (exemple synthétique)", "2027-01-20", 1, "Classe 16", "Solde créditeur du compte " + account + " : " + amount + " EUR.") });
  return out;
}

const csv = (rows: LoanRow[]) => "Key;Amount;Date;Details\n" + rows.map(r => [r.key, r.amount, r.date, JSON.stringify(r.details)].map(v => "\"" + v.replaceAll("\"", "\"\"") + "\"").join(";")).join("\n");
export function loanFilesFromRows(rows: LoanRows): Record<string, File> {
  return Object.fromEntries(Object.entries(rows).filter(([, rs]) => rs.length).map(([type, rs]) => [type, new File([csv(rs)], "EXEMPLE-" + type + ".csv", { type: "text/csv" })]));
}
export function loanSyntheticFiles(scenario: LoanScenario = "complete", long = false) { return loanFilesFromRows(loanFixtureRows(scenario, long)); }

/** Read-only synthetic sheet, computed server-side by the same engine (demonstration and tests). */
export async function loanFixture(options: { scenario?: LoanScenario; long?: boolean; scope?: WorkpaperScope; edit?: (rows: LoanRows) => void } = {}) {
  const scope = options.scope ?? { organizationId: "SYN-ORG", dossierId: "SYN-LOANS", periodId: periodId(LOAN_PERIOD), mode: "demo" as const };
  const actor: Principal = { id: "Préparateur synthétique", grants: [{ scope, permissions: ["read", "prepare", "download"] }] };
  const rows = loanFixtureRows(options.scenario ?? "complete", options.long ?? false);
  options.edit?.(rows);
  const files = loanFilesFromRows(rows), imports: ImportBatch[] = [];
  for (const [type, file] of Object.entries(files)) {
    const batch = await previewImport(file, scope, LOAN_MAPPING, actor, type, "loans.review");
    imports.push({ ...batch, approval: { actorId: actor.id, at: "2027-02-15T12:00:00.000Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } });
  }
  const runId = "SYN-LOANS-RUN", facts = loanFacts(scope, LOAN_PERIOD, imports, runId), draft = initialLoanDraft(facts);
  const work = stampLoanWork(draft, imports, scope, LOAN_PERIOD, runId, actor.id, "2027-02-15T12:00:00.000Z");
  const population = freezePopulation(scope, imports, "loan_contract_due", actor, LOAN_PERIOD);
  const selection = selectPopulation(population, { method: "targeted", criteria: "Tous les contrats du pack et toutes les échéances exigibles pendant l’exercice, y compris remboursés", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
  const calculation = new LoanRegistry().execute({ scope, period: LOAN_PERIOD, rule: LOAN_TEMPLATE.rule!, imports, population, selection, parameters: { work, runId } });
  const result = evaluateLoans(scope, LOAN_PERIOD, imports, runId, population, selection, work);
  const run: WorkpaperRun = { id: runId, rootId: runId, revision: 1, version: 1, schemaVersion: "1.0.0", scope, period: LOAN_PERIOD, template: LOAN_TEMPLATE, state: "executed", preparedBy: actor.id,
    importIds: imports.map(b => b.id), population, selection, loanWork: work, result: calculation, evidence: facts.map(f => f.proof), findings: [],
    notes: loanReviewPoints(result).map(p => ({ id: "loan:" + p.key, kind: "observation" as const, text: p.issue.text, amount: p.issue.amount ?? { kind: "unknown" as const, reason: "Point à documenter, sans montant attribué" }, authorId: actor.id, blocking: true })),
    events: [{ id: "synthetic:1", action: "synthetic_calculation", actorId: actor.id, at: "2027-02-15T12:00:00.000Z", version: 1 }] };
  return { scope, actor, rows, files, imports, draft, facts, work, population, selection, calculation, run, result };
}
