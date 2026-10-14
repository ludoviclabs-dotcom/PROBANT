import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { previewImport, type ImportBatch, type ImportMapping } from "../imports";
import { periodId, type WorkpaperRun, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import type { EquityMapping, EquityTabularType } from "../capitaux-sources";
import { previewMinutes } from "../capitaux-minutes";
import { minutesPdf } from "./capitaux-fixtures";
import { EQUITY_FAMILIES, EQUITY_FAMILY_LABELS, previewEquityPdf, stampEquityWork as stampLegacyWork, evaluateEquity as evaluateLegacy } from "../equity-dossier";
import { EQUITY_TEMPLATE as LEGACY_TEMPLATE } from "../equity-adapter";
import { freezePopulation, selectPopulation } from "../selection";
import { stampEquityWork, evaluateEquity } from "../capitaux-review";
import { EQUITY_TEMPLATE, EQUITY_RULE } from "../capitaux-adapter";

/**
 * Recette C09 — dossier synthétique, aucune entité réelle. Exercice 2026 (ANC 2024-07 applicable de plein droit), revue au 31/03/2027.
 * Montants en EUR, sens des capitaux propres (crédit positif). Attendus posés à la main dans docs/recette/c09/RECETTE.md.
 *
 * AGO 20/05/2026 (PV-AGO-2026) : rés. 2 affectation du résultat 2025 de 300 (réserve légale 14, report à nouveau +20, autres réserves 146 :
 * transfert T1 neutre ; 120 restent pour le dividende) ; rés. 3 dividende 120 voté, comptabilisé, NON payé ; rés. 4 distribution exceptionnelle 50
 * sur les autres réserves, AMENDÉE par l’AGE du 10/07/2026 (PV-AGE-2026-07, rés. 1) à 30 : écritures −50 puis +20, règlement 30.
 * AGE 15/11/2026 (PV-AGE-2026-11, PIÈCE ABSENTE) : augmentation de capital de 200, comptabilisée et libérée.
 * Autres fonds propres : titres participatifs 500 (termes incertains) et avance publique 80 (conditions de l’art. 316-1 réunies).
 */
export const c09Period = { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-03-31", currency: "EUR", validation: "provisional" } as const satisfies AccountingPeriod;
export const c09Scope: WorkpaperScope = { organizationId: "org-c09-synthetic", dossierId: "99999999-9999-4999-8999-999999999999", periodId: periodId(c09Period), mode: "real" };
export const c09Preparer: Principal = { id: "preparer-c09", grants: [{ scope: c09Scope, permissions: ["read", "prepare", "review", "download"] }] };
const csv = (rows: string[][]) => rows.map(r => r.join(";")).join("\n");

export const C09_CSV: Record<"eq_balances" | "eq_entries" | "eq_decisions" | "eq_payments", string> = {
  eq_balances: csv([["ligne", "montant", "date", "compte", "composante", "libelle"],
    ["B01", "1000.00", "2026-01-01", "101000", "capital", "Capital social"], ["B02", "40.00", "2026-01-01", "106100", "reserve_legale", "Réserve légale"],
    ["B03", "200.00", "2026-01-01", "106800", "autres_reserves", "Autres réserves"], ["B04", "-20.00", "2026-01-01", "110000", "report_a_nouveau", "Report à nouveau"],
    ["B05", "300.00", "2026-01-01", "120000", "resultat", "Résultat de l’exercice"], ["B06", "500.00", "2026-01-01", "167110", "autres_fonds_propres", "Titres participatifs"],
    ["B07", "80.00", "2026-01-01", "167300", "autres_fonds_propres", "Avance remboursable en cas de succès"],
    ["B11", "1200.00", "2026-12-31", "101000", "capital", "Capital social"], ["B12", "54.00", "2026-12-31", "106100", "reserve_legale", "Réserve légale"],
    ["B13", "316.00", "2026-12-31", "106800", "autres_reserves", "Autres réserves"], ["B14", "0.00", "2026-12-31", "110000", "report_a_nouveau", "Report à nouveau"],
    ["B15", "60.00", "2026-12-31", "120000", "resultat", "Résultat de l’exercice"], ["B16", "500.00", "2026-12-31", "167110", "autres_fonds_propres", "Titres participatifs"],
    ["B17", "80.00", "2026-12-31", "167300", "autres_fonds_propres", "Avance remboursable en cas de succès"]]),
  eq_entries: csv([["ligne", "montant", "date", "compte", "composante", "nature", "effet", "decision", "transfert", "piece", "libelle"],
    ["E01", "-180.00", "2026-05-25", "120000", "resultat", "affectation_resultat", "2026-05-20", "D-AFF-RES", "T1", "OD-2026-05-01", "Affectation du résultat 2025"],
    ["E02", "14.00", "2026-05-25", "106100", "reserve_legale", "affectation_resultat", "2026-05-20", "D-AFF-RL", "T1", "OD-2026-05-01", "Dotation à la réserve légale"],
    ["E03", "20.00", "2026-05-25", "110000", "report_a_nouveau", "affectation_resultat", "2026-05-20", "D-AFF-RAN", "T1", "OD-2026-05-01", "Apurement du report à nouveau"],
    ["E04", "146.00", "2026-05-25", "106800", "autres_reserves", "affectation_resultat", "2026-05-20", "D-AFF-AR", "T1", "OD-2026-05-01", "Dotation aux autres réserves"],
    ["E05", "-120.00", "2026-05-25", "120000", "resultat", "distribution", "2026-05-20", "D-DIV", "", "OD-2026-05-02", "Dividende à payer"],
    ["E06", "-50.00", "2026-05-25", "106800", "autres_reserves", "distribution", "2026-05-20", "D-EXC-1", "", "OD-2026-05-03", "Distribution exceptionnelle"],
    ["E07", "20.00", "2026-07-15", "106800", "autres_reserves", "distribution", "2026-07-10", "D-EXC-2", "", "OD-2026-07-01", "Reprise partielle — décision rectificative"],
    ["E08", "200.00", "2026-11-20", "101000", "capital", "augmentation_capital", "2026-11-15", "D-CAP", "", "BQ-2026-11-02", "Augmentation de capital en numéraire"],
    ["E09", "60.00", "2026-12-31", "120000", "resultat", "resultat_exercice", "2026-12-31", "", "", "OD-2026-12-31", "Résultat de l’exercice 2026"]]),
  eq_decisions: csv([["ligne", "montant", "date", "decision", "type", "composante", "effet", "organe", "pv", "page", "resolution", "extrait", "libelle", "remplace"],
    ["D-AFF-RES", "-180.00", "2026-05-20", "AGO-2026", "affectation_resultat", "resultat", "2026-05-20", "AGO", "PV-AGO-2026", "2", "2", "Le résultat de 300,00 est affecté.", "Affectation — prélèvement sur le résultat", ""],
    ["D-AFF-RL", "14.00", "2026-05-20", "AGO-2026", "affectation_resultat", "reserve_legale", "2026-05-20", "AGO", "PV-AGO-2026", "2", "2", "14,00 à la réserve légale.", "Affectation — réserve légale", ""],
    ["D-AFF-RAN", "20.00", "2026-05-20", "AGO-2026", "affectation_resultat", "report_a_nouveau", "2026-05-20", "AGO", "PV-AGO-2026", "2", "2", "20,00 en apurement du report à nouveau.", "Affectation — report à nouveau", ""],
    ["D-AFF-AR", "146.00", "2026-05-20", "AGO-2026", "affectation_resultat", "autres_reserves", "2026-05-20", "AGO", "PV-AGO-2026", "2", "2", "146,00 aux autres réserves.", "Affectation — autres réserves", ""],
    ["D-DIV", "-120.00", "2026-05-20", "AGO-2026", "distribution", "resultat", "2026-05-20", "AGO", "PV-AGO-2026", "3", "3", "Un dividende de 120,00 est mis en distribution.", "Dividende voté", ""],
    ["D-EXC-1", "-50.00", "2026-05-20", "AGO-2026", "distribution", "autres_reserves", "2026-05-20", "AGO", "PV-AGO-2026", "3", "4", "Distribution exceptionnelle de 50,00 prélevée sur les autres réserves.", "Distribution exceptionnelle (initiale)", ""],
    ["D-EXC-2", "-30.00", "2026-07-10", "AGE-2026-07", "distribution", "autres_reserves", "2026-07-10", "AGE", "PV-AGE-2026-07", "1", "1", "La distribution exceptionnelle est ramenée à 30,00.", "Distribution exceptionnelle (rectifiée)", "D-EXC-1"],
    ["D-CAP", "200.00", "2026-11-15", "AGE-2026-11", "augmentation_capital", "capital", "2026-11-15", "AGE", "PV-AGE-2026-11", "1", "1", "Augmentation de capital en numéraire de 200,00.", "Augmentation de capital", ""]]),
  eq_payments: csv([["ligne", "montant", "date", "decision", "libelle"], ["P01", "30.00", "2026-07-20", "D-EXC-2", "Virement de la distribution exceptionnelle"], ["P02", "200.00", "2026-11-20", "D-CAP", "Libération des souscriptions"]]),
};
const C09_COLUMNS: Record<keyof typeof C09_CSV, EquityMapping["capitaux"]> = {
  eq_balances: { basis: "balances", accountColumn: "compte", componentColumn: "composante", labelColumn: "libelle" },
  eq_entries: { basis: "entries", accountColumn: "compte", componentColumn: "composante", natureColumn: "nature", effectDateColumn: "effet", decisionColumn: "decision", transferColumn: "transfert", pieceColumn: "piece", labelColumn: "libelle" },
  eq_decisions: { basis: "decisions", decisionIdColumn: "decision", typeColumn: "type", componentColumn: "composante", effectDateColumn: "effet", organColumn: "organe", minutesColumn: "pv", pageColumn: "page", resolutionColumn: "resolution", extractColumn: "extrait", labelColumn: "libelle", amendsColumn: "remplace" },
  eq_payments: { basis: "payments", decisionColumn: "decision", labelColumn: "libelle" },
};
/** `amends: false` drops the amendment column: the same register read as rule 1.0.0 could read it (before / after recipe). */
export function c09Mapping(type: keyof typeof C09_CSV, options: { amends?: boolean } = {}): EquityMapping {
  const { amendsColumn, ...rest } = C09_COLUMNS[type] as EquityMapping["capitaux"] & { amendsColumn?: string };
  return { version: "equity-1", headerRow: 1, columns: { key: "ligne", amount: "montant", date: "date" }, delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1, currency: "EUR",
    capitaux: (options.amends === false || !amendsColumn ? rest : { ...rest, amendsColumn }) as EquityMapping["capitaux"] };
}
export const C09_MINUTES = [
  { pieceRef: "PV-AGO-2026", title: "PV de l’assemblée générale ordinaire du 20 mai 2026", documentDate: "2026-05-20", pages: [
    ["SOCIÉTÉ SYNTHÉTIQUE C09 — document de recette, aucune valeur juridique", "Procès-verbal de l’assemblée générale ordinaire du 20 mai 2026", "Page 1 — Présences et ordre du jour"],
    ["Page 2 — Deuxième résolution : affectation du résultat de l’exercice 2025 de 300,00", "Réserve légale 14,00 ; report à nouveau 20,00 ; autres réserves 146,00 ; dividende 120,00."],
    ["Page 3 — Troisième résolution : dividende de 120,00 mis en paiement à une date fixée ultérieurement.", "Quatrième résolution : distribution exceptionnelle de 50,00 sur les autres réserves."]] },
  { pieceRef: "PV-AGE-2026-07", title: "PV de l’assemblée générale extraordinaire du 10 juillet 2026", documentDate: "2026-07-10", pages: [
    ["SOCIÉTÉ SYNTHÉTIQUE C09 — document de recette, aucune valeur juridique", "Page 1 — Première résolution : la distribution exceptionnelle votée le 20 mai 2026 est ramenée à 30,00."]] },
] as const;
const pdfCache = new Map<string, Uint8Array<ArrayBuffer>>();
/** Deterministic PV bytes: the same PV imported in /capitaux-propres and in /equity has the same SHA-256. */
export async function c09PvBytes(pieceRef: string) {
  if (!pdfCache.has(pieceRef)) { const m = C09_MINUTES.find(x => x.pieceRef === pieceRef)!; pdfCache.set(pieceRef, new Uint8Array(await minutesPdf(m.title, m.pages.map(p => [...p])))); }
  return pdfCache.get(pieceRef)!;
}
export function approveC09(batch: ImportBatch): ImportBatch {
  return { ...batch, document: { ...batch.document, logicalId: batch.document.documentType === "eq_minutes" ? batch.document.logicalId : batch.document.documentType },
    approval: { actorId: c09Preparer.id, at: "2027-03-01T09:00:00Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } };
}
/** Approved /capitaux-propres sources of the C09 dossier; `types` and `texts` let a test drop or alter one source. */
export async function c09Sources(options: { amends?: boolean; texts?: Partial<Record<keyof typeof C09_CSV, string>>; types?: (keyof typeof C09_CSV)[] } = {}) {
  const types = options.types ?? (Object.keys(C09_CSV) as (keyof typeof C09_CSV)[]);
  const tabular = await Promise.all(types.map(async type => approveC09(await previewImport(new File([options.texts?.[type] ?? C09_CSV[type]], type + ".csv", { type: "text/csv" }), c09Scope, c09Mapping(type, options) as ImportMapping, c09Preparer, type as EquityTabularType, "capitaux_propres.review"))));
  const pdfs = await Promise.all(C09_MINUTES.map(async m => approveC09(await previewMinutes(new File([await c09PvBytes(m.pieceRef)], m.pieceRef + ".pdf", { type: "application/pdf" }), c09Scope, { pieceRef: m.pieceRef, title: m.title, documentDate: m.documentDate }, c09Preparer))));
  return [...tabular, ...pdfs];
}
/** Readings validated by the preparer: every line whose PV is provided, except the superseded line (history only). */
export const C09_READ_LINES = ["D-AFF-RES", "D-AFF-RL", "D-AFF-RAN", "D-AFF-AR", "D-DIV", "D-EXC-2"];
export function c09Instruments(pv: ImportBatch) {
  return [
    { id: "TP-2019", label: "Titres participatifs émis en 2019", kind: "titres_participatifs" as const, accounts: ["167110"], note: "Contrat d’émission : clause de remboursement à l’initiative du porteur non lue.",
      terms: { capitauxPropres: "non" as const, remboursementImposable: "inconnu" as const, partsFixes: "sans_objet" as const, partNonRemboursable: null, avanceFondsPublics: "inconnu" as const, remboursementConditionneSucces: "inconnu" as const, abandonEnCasEchec: "inconnu" as const, interetsConditionnes: "sans_objet" as const, presentationDeclaree: null },
      citation: { documentId: pv.document.id, page: 1 } },
    { id: "AV-PUBLIQUE", label: "Avance d’un organisme public pour un projet de recherche", kind: "avance_conditionnee" as const, accounts: ["167300"], note: "Convention : remboursement en cas de succès, abandon en cas d’échec, sans intérêts.",
      terms: { capitauxPropres: "non" as const, remboursementImposable: "inconnu" as const, partsFixes: "sans_objet" as const, partNonRemboursable: null, avanceFondsPublics: "oui" as const, remboursementConditionneSucces: "oui" as const, abandonEnCasEchec: "oui" as const, interetsConditionnes: "sans_objet" as const, presentationDeclaree: null },
      citation: { documentId: pv.document.id, page: 1 } },
  ];
}
export const c09Framing = { socialForm: "sas" as const, socialFormCitation: null, anticipationAnc202407: false, anticipationCitation: null };

/** Legacy /equity sources of the same dossier, same PV bytes; the register carries only the final exceptional distribution (no amendment model). */
export const C09_LEGACY_CSV: Record<string, string> = {
  equity_balances: "id;amount;date;component;account;decision;kind;effective;transfer;currency;description\n" + [
    "OC;1000.00;2026-01-01;capital;101000;;opening;;;EUR;Capital", "CC;1200.00;2026-12-31;capital;101000;;closing;;;EUR;Capital",
    "ORL;40.00;2026-01-01;reserves;106100;;opening;;;EUR;Réserve légale", "CRL;54.00;2026-12-31;reserves;106100;;closing;;;EUR;Réserve légale",
    "OAR;200.00;2026-01-01;reserves;106800;;opening;;;EUR;Autres réserves", "CAR;316.00;2026-12-31;reserves;106800;;closing;;;EUR;Autres réserves",
    "ORAN;-20.00;2026-01-01;report;110000;;opening;;;EUR;Report à nouveau", "CRAN;0.00;2026-12-31;report;110000;;closing;;;EUR;Report à nouveau",
    "ORES;300.00;2026-01-01;result;120000;;opening;;;EUR;Résultat", "CRES;60.00;2026-12-31;result;120000;;closing;;;EUR;Résultat"].join("\n"),
  equity_ledger: "id;amount;date;component;account;decision;kind;effective;transfer;currency;description\n" + [
    "L01;-180.00;2026-05-25;result;120000;AFF;decision;2026-05-20;T1;EUR;Affectation du résultat 2025", "L02;14.00;2026-05-25;reserves;106100;AFF;decision;2026-05-20;T1;EUR;Réserve légale",
    "L03;20.00;2026-05-25;report;110000;AFF;decision;2026-05-20;T1;EUR;Report à nouveau", "L04;146.00;2026-05-25;reserves;106800;AFF;decision;2026-05-20;T1;EUR;Autres réserves",
    "L05;-120.00;2026-05-25;result;120000;DIV;decision;2026-05-20;;EUR;Dividende à payer", "L06;-50.00;2026-05-25;reserves;106800;EXC;decision;2026-05-20;;EUR;Distribution exceptionnelle",
    "L07;20.00;2026-07-15;reserves;106800;EXC;decision;2026-07-10;;EUR;Reprise partielle", "L08;200.00;2026-11-20;capital;101000;CAP;decision;2026-11-15;;EUR;Augmentation de capital",
    "L09;60.00;2026-12-31;result;120000;;other;2026-12-31;;EUR;Résultat 2026"].join("\n"),
  equity_variation: "id;amount;date;component;account;decision;kind;effective;transfer;currency;description\n" + [
    "V01;200.00;2026-12-31;capital;101000;;variation;;;EUR;Capital", "V02;14.00;2026-12-31;reserves;106100;;variation;;;EUR;Réserve légale", "V03;116.00;2026-12-31;reserves;106800;;variation;;;EUR;Autres réserves",
    "V04;20.00;2026-12-31;report;110000;;variation;;;EUR;Report à nouveau", "V05;-240.00;2026-12-31;result;120000;;variation;;;EUR;Résultat"].join("\n"),
  equity_decisions: "id;amount;date;component;account;decision;kind;effective;transfer;currency;description\n" + [
    "AFF;180.00;2026-05-20;reserves;106800;;transfer;2026-05-20;T1;EUR;Affectation du résultat 2025", "DIV;120.00;2026-05-20;result;120000;;decrease;2026-05-20;;EUR;Dividende voté",
    "EXC;30.00;2026-07-10;reserves;106800;;decrease;2026-07-10;;EUR;Distribution exceptionnelle (rectifiée)", "CAP;200.00;2026-11-15;capital;101000;;increase;2026-11-15;;EUR;Augmentation de capital (PV absent)",
    "NO-PV;10.00;2026-08-20;reserves;106800;;increase;2026-09-01;;EUR;Décision annoncée, PV absent"].join("\n"),
  equity_payments: "id;amount;date;component;account;decision;kind;effective;transfer;currency;description\n" + ["PE1;30.00;2026-07-20;;;EXC;payment;;;EUR;Distribution exceptionnelle", "PE2;200.00;2026-11-20;;;CAP;payment;;;EUR;Libération"].join("\n"),
};
export const C09_LEGACY_MAPPING: ImportMapping = { version: "equity-dossier-1", headerRow: 1, columns: { key: "id", amount: "amount", date: "date" }, equity: { componentColumn: "component", accountColumn: "account", decisionColumn: "decision", kindColumn: "kind", effectiveColumn: "effective", transferColumn: "transfer", currencyColumn: "currency", descriptionColumn: "description" }, delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1, currency: "EUR" };

/** A frozen, executed sheet as the runtimes store it: identity, template, result and sources; never produced by a browser. */
export function c09Run(input: { id: string; template: WorkpaperRun["template"]; importIds: string[]; result: unknown; ruleVersion: string; work: Partial<Pick<WorkpaperRun, "capitauxWork" | "equityWork">>; revision?: number; version?: number }): WorkpaperRun {
  const revision = input.revision ?? 1;
  return { id: input.id, rootId: input.id.replace(/:r\d+$/, ""), revision, version: input.version ?? 6, schemaVersion: "1.0.0", scope: c09Scope, period: c09Period, template: input.template, state: "executed", preparedBy: c09Preparer.id, importIds: input.importIds,
    ...input.work, result: { id: "calc-" + input.id, scope: c09Scope, period: c09Period, calculationKey: input.template.id, ruleVersion: input.ruleVersion, inputHash: stableSha256({ id: input.id, ruleVersion: input.ruleVersion }), execution: "completed", outcome: "inconclusive", sourceRefs: [], input: {}, result: input.result, findings: [], warnings: [], blockedControls: [] },
    evidence: [], findings: [], notes: [], events: [{ id: "event-" + input.id, action: "execute", actorId: c09Preparer.id, at: "2027-03-02T10:00:00.000Z", version: input.version ?? 6 }] } as WorkpaperRun;
}

/** Legacy /equity sheet of the same dossier, built and executed with its own rule 1.0.0 functions (equity-dossier). */
export async function c09LegacyRun(options: { decisions?: string; readings?: { decisionId: string; piece: "AGO" | "AGE"; page: number }[]; id?: string } = {}) {
  const approve = (b: ImportBatch): ImportBatch => ({ ...b, approval: { actorId: c09Preparer.id, at: "2027-03-01T09:00:00.000Z", previewHash: b.previewHash }, report: { ...b.report, calculationAllowed: true } });
  const texts = { ...C09_LEGACY_CSV, ...(options.decisions ? { equity_decisions: options.decisions } : {}) };
  const tabular = await Promise.all(Object.entries(texts).map(async ([type, text]) => approve(await previewImport(new File([text], type + ".csv", { type: "text/csv" }), c09Scope, C09_LEGACY_MAPPING, c09Preparer, type, "equity.review"))));
  const ago = approve(await previewEquityPdf(new File([await c09PvBytes("PV-AGO-2026")], "PV-AGO-2026.pdf", { type: "application/pdf" }), c09Scope, C09_LEGACY_MAPPING, c09Preparer, "equity_minutes", c09Period));
  const age = approve(await previewEquityPdf(new File([await c09PvBytes("PV-AGE-2026-07")], "PV-AGE-2026-07.pdf", { type: "application/pdf" }), c09Scope, C09_LEGACY_MAPPING, c09Preparer, "equity_acts", c09Period));
  const imports = [...tabular, ago, age], id = options.id ?? "equity-c09-run";
  const page = (piece: "AGO" | "AGE", n: number) => (piece === "AGO" ? ago : age).rows[n - 1].id;
  const readings = options.readings ?? [{ decisionId: "AFF", piece: "AGO", page: 2 }, { decisionId: "DIV", piece: "AGO", page: 3 }, { decisionId: "EXC", piece: "AGE", page: 1 }];
  const accounts: Record<string, string[]> = { capital: ["101000"], reserves: ["106100", "106800"], report: ["110000"], result: ["120000"] };
  const draft = { schemaVersion: "equity-dossier-1" as const, method: { id: "METHODE-C09", version: "1", note: "Montants par décision et date d’effet ; aucun avis juridique.", proofRowIds: [ago.rows[0].id] }, socialForm: "SAS — déclarée pour la recette",
    completeComponentSet: true, ledgerCoverage: "documented" as const, decisionsCoverage: "documented" as const,
    components: EQUITY_FAMILIES.map(f => ({ id: f, label: EQUITY_FAMILY_LABELS[f], family: f, accounts: accounts[f] ?? [], state: accounts[f] ? "in_scope" as const : "not_applicable" as const, reason: accounts[f] ? "" : "Sans solde dans ce dossier de recette", proofRowId: ago.rows[0].id })),
    interpretations: readings.map(r => ({ decisionId: r.decisionId, proofRowId: page(r.piece, r.page), note: "Lecture de la décision à la page citée." })) };
  const work = stampLegacyWork(draft, imports, c09Scope, c09Period, id, c09Preparer.id, "2027-03-02T09:00:00.000Z");
  const population = freezePopulation(c09Scope, imports, "equity_decision_movement", c09Preparer);
  const selection = selectPopulation(population, { method: "targeted", criteria: "Toutes les décisions et tous les mouvements", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, c09Preparer);
  const result = evaluateLegacy(c09Scope, c09Period, imports, id, population, selection, work);
  const run = c09Run({ id, template: LEGACY_TEMPLATE, importIds: imports.map(b => b.id), result, ruleVersion: "1.0.0", work: { equityWork: work } });
  const pvIndex = Object.fromEntries([ago, age].map(b => [b.document.id, { sha256: b.document.byteHash, fileName: b.document.fileName }]));
  return { run: { ...run, population, selection } as WorkpaperRun, imports, pvIndex, result };
}

/** /capitaux-propres sheet of rule 1.1.0 executed on the C09 sources. */
export async function c09CapitauxRun(options: { amends?: boolean; framing?: typeof c09Framing; instruments?: boolean; readLines?: string[]; id?: string; texts?: Partial<Record<keyof typeof C09_CSV, string>>; types?: (keyof typeof C09_CSV)[] } = {}) {
  const imports = await c09Sources(options), id = options.id ?? "capitaux-c09-run";
  const ago = imports.find(b => b.document.documentType === "eq_minutes" && b.mapping.capitaux?.pieceRef === "PV-AGO-2026")!;
  const work = stampEquityWork({ scope: c09Scope, period: c09Period, runId: id, imports, actor: c09Preparer, at: "2027-03-02T09:00:00.000Z",
    draft: { readings: (options.readLines ?? C09_READ_LINES).map(lineId => ({ lineId, text: "Transcription relue à la page citée." })), framing: options.framing ?? c09Framing, instruments: options.instruments === false ? [] : c09Instruments(ago) } });
  const result = evaluateEquity(c09Scope, c09Period, imports, id, work);
  return { run: c09Run({ id, template: EQUITY_TEMPLATE, importIds: imports.map(b => b.id), result, ruleVersion: EQUITY_RULE.version, work: { capitauxWork: work } }), imports, result, work };
}

/** A rule 1.0.0 result of the shape the old engine stored: no 1.1.0 field, no superseded status (read without the amendment column). */
export function asCapitauxRule100<T extends { schemaVersion: string; decisions: unknown[] | null }>(result: T): T {
  const { framing: _f, presentation: _p, legal: _l, ...rest } = result as T & { framing?: unknown; presentation?: unknown; legal?: unknown }; void _f; void _p; void _l;
  return { ...rest, schemaVersion: "equity-result-1", decisions: result.decisions?.map(d => { const { amends: _a, supersededBy: _s, chain: _c, paymentGroup: _g, paymentState: _ps, ...line } = d as Record<string, unknown>; void _a; void _s; void _c; void _g; void _ps; return line; }) ?? null } as unknown as T;
}
