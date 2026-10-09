import { PDFDocument, StandardFonts } from "pdf-lib";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { previewImport, type ImportBatch } from "../imports";
import { periodId, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import type { EquityMapping, EquityMinutesForm, EquityTabularType } from "../capitaux-sources";
import { previewMinutes } from "../capitaux-minutes";
import type { EquityDraft } from "../capitaux-review";

/**
 * Synthetic recipe only (Mission 11). Amounts in EUR, equity direction (credit positive).
 * AGO 30/05/2024 (PV-AGO-2024) : affectation 100 = réserve légale 2 + report à nouveau 68 (transfert T1 neutre) + dividendes 30 votés, 25 comptabilisés, 25 payés ;
 * distribution exceptionnelle 5 votée sans écriture. AGE 16/09/2024 (PV-AGE-2024-09) : incorporation de 20 de réserves au capital (transfert T2 neutre).
 * AGE 12/12/2024 (PV-AGE-2024-12, PV absent) : augmentation 30 + prime 10 à effet du 10/01/2025, comptabilisée en 2024 (effet hors période).
 * E09 : distribution de 4 sur autres réserves sans décision. AGO 20/03/2025 (PV-AGO-2025) : distribution postérieure à la clôture.
 * Tableau fourni : distribution 30 et résultat de clôture 50 (au lieu de 25 et 55 reconstitués).
 */
export const eqPeriod = { startDate: "2024-01-01", closingDate: "2024-12-31", asOfDate: "2025-03-31", currency: "EUR", validation: "provisional" } as const satisfies AccountingPeriod;
export const eqScope: WorkpaperScope = { organizationId: "org-eq-synthetic", dossierId: "55555555-5555-4555-8555-555555555555", periodId: periodId(eqPeriod), mode: "real" };
export const eqPreparer: Principal = { id: "preparer-eq", grants: [{ scope: eqScope, permissions: ["read", "prepare", "download"] }] };
const csv = (rows: string[][]) => rows.map(r => r.join(";")).join("\n");
export const EQ_CSV: Record<EquityTabularType, string> = {
  eq_balances: csv([["ligne", "montant", "date", "compte", "composante", "libelle"],
    ["B01", "100.00", "2024-01-01", "101000", "capital", "Capital social"], ["B02", "20.00", "2024-01-01", "104000", "primes", "Primes d’émission"],
    ["B03", "8.00", "2024-01-01", "106100", "reserve_legale", "Réserve légale"], ["B04", "40.00", "2024-01-01", "106800", "autres_reserves", "Autres réserves"],
    ["B05", "12.00", "2024-01-01", "110000", "report_a_nouveau", "Report à nouveau"], ["B06", "100.00", "2024-01-01", "120000", "resultat", "Résultat de l’exercice"],
    ["B07", "15.00", "2024-01-01", "131000", "subventions_investissement", "Subventions d’équipement"], ["B08", "6.00", "2024-01-01", "145000", "provisions_reglementees", "Amortissements dérogatoires"],
    ["B09", "10.00", "2024-01-01", "167400", "autres_fonds_propres", "Avances conditionnées"],
    ["B11", "150.00", "2024-12-31", "101000", "capital", "Capital social"], ["B12", "30.00", "2024-12-31", "104000", "primes", "Primes d’émission"],
    ["B13", "10.00", "2024-12-31", "106100", "reserve_legale", "Réserve légale"], ["B14", "16.00", "2024-12-31", "106800", "autres_reserves", "Autres réserves"],
    ["B15", "80.00", "2024-12-31", "110000", "report_a_nouveau", "Report à nouveau"], ["B16", "55.00", "2024-12-31", "120000", "resultat", "Résultat de l’exercice"],
    ["B17", "12.00", "2024-12-31", "131000", "subventions_investissement", "Subventions d’équipement"], ["B18", "8.00", "2024-12-31", "145000", "provisions_reglementees", "Amortissements dérogatoires"],
    ["B19", "15.00", "2024-12-31", "167400", "autres_fonds_propres", "Avances conditionnées"]]),
  eq_entries: csv([["ligne", "montant", "date", "compte", "composante", "nature", "effet", "decision", "transfert", "piece", "libelle"],
    ["E01", "-70.00", "2024-06-03", "120000", "resultat", "affectation_resultat", "2024-05-30", "D1-AFF-RES", "T1", "OD-2024-06-01", "Affectation du résultat 2023"],
    ["E02", "2.00", "2024-06-03", "106100", "reserve_legale", "affectation_resultat", "2024-05-30", "D1-AFF-RL", "T1", "OD-2024-06-01", "Dotation à la réserve légale"],
    ["E03", "68.00", "2024-06-03", "110000", "report_a_nouveau", "affectation_resultat", "2024-05-30", "D1-AFF-RAN", "T1", "OD-2024-06-01", "Report à nouveau"],
    ["E04", "-25.00", "2024-06-03", "120000", "resultat", "distribution", "2024-05-30", "D1-DIV", "", "OD-2024-06-01", "Dividendes à payer"],
    ["E05", "20.00", "2024-09-20", "101000", "capital", "incorporation_reserves", "2024-09-16", "D2-CAP", "T2", "OD-2024-09-02", "Incorporation de réserves au capital"],
    ["E06", "-20.00", "2024-09-20", "106800", "autres_reserves", "incorporation_reserves", "2024-09-16", "D2-RES", "T2", "OD-2024-09-02", "Prélèvement sur autres réserves"],
    ["E07", "30.00", "2024-12-20", "101000", "capital", "augmentation_capital", "2025-01-10", "D3-CAP", "", "BQ-2024-12-07", "Souscription en numéraire"],
    ["E08", "10.00", "2024-12-20", "104000", "primes", "augmentation_capital", "2025-01-10", "D3-PRI", "", "BQ-2024-12-07", "Prime d’émission"],
    ["E09", "-4.00", "2024-11-15", "106800", "autres_reserves", "distribution", "2024-11-15", "", "", "OD-2024-11-03", "Distribution sur autres réserves"],
    ["E10", "50.00", "2024-12-31", "120000", "resultat", "resultat_exercice", "2024-12-31", "", "", "OD-2024-12-31", "Résultat de l’exercice 2024"],
    ["E11", "-3.00", "2024-12-31", "131000", "subventions_investissement", "subventions", "2024-12-31", "", "", "OD-2024-12-12", "Quote-part virée au résultat"],
    ["E12", "2.00", "2024-12-31", "145000", "provisions_reglementees", "provisions_reglementees", "2024-12-31", "", "", "OD-2024-12-13", "Dotation aux amortissements dérogatoires"],
    ["E13", "5.00", "2024-10-01", "167400", "autres_fonds_propres", "autre", "2024-10-01", "", "", "BQ-2024-10-01", "Avance conditionnée complémentaire"]]),
  eq_variation: csv([["ligne", "montant", "date", "composante", "colonne"],
    ...([["capital", [["ouverture", "100.00"], ["incorporation_reserves", "20.00"], ["augmentation_capital", "30.00"], ["cloture", "150.00"]]],
      ["primes", [["ouverture", "20.00"], ["augmentation_capital", "10.00"], ["cloture", "30.00"]]],
      ["reserve_legale", [["ouverture", "8.00"], ["affectation_resultat", "2.00"], ["cloture", "10.00"]]],
      ["autres_reserves", [["ouverture", "40.00"], ["incorporation_reserves", "-20.00"], ["distribution", "-4.00"], ["cloture", "16.00"]]],
      ["report_a_nouveau", [["ouverture", "12.00"], ["affectation_resultat", "68.00"], ["cloture", "80.00"]]],
      ["resultat", [["ouverture", "100.00"], ["affectation_resultat", "-70.00"], ["distribution", "-30.00"], ["resultat_exercice", "50.00"], ["cloture", "50.00"]]],
      ["subventions_investissement", [["ouverture", "15.00"], ["subventions", "-3.00"], ["cloture", "12.00"]]],
      ["provisions_reglementees", [["ouverture", "6.00"], ["provisions_reglementees", "2.00"], ["cloture", "8.00"]]]] as [string, string[][]][])
      .flatMap(([component, cells], i) => cells.map(([column, amount], j) => ["V" + String(i + 1).padStart(2, "0") + String(j + 1), amount, column === "ouverture" ? "2024-01-01" : "2024-12-31", component, column]))]),
  eq_decisions: csv([["ligne", "montant", "date", "decision", "type", "composante", "effet", "organe", "pv", "page", "resolution", "extrait", "libelle"],
    ["D1-AFF-RES", "-70.00", "2024-05-30", "AGO-2024", "affectation_resultat", "resultat", "2024-05-30", "AGO", "PV-AGO-2024", "2", "2", "Le résultat de 100,00 est affecté : 2,00 à la réserve légale, 68,00 au report à nouveau, 30,00 en dividendes.", "Affectation — prélèvement sur le résultat"],
    ["D1-AFF-RL", "2.00", "2024-05-30", "AGO-2024", "affectation_resultat", "reserve_legale", "2024-05-30", "AGO", "PV-AGO-2024", "2", "2", "2,00 à la réserve légale.", "Affectation — réserve légale"],
    ["D1-AFF-RAN", "68.00", "2024-05-30", "AGO-2024", "affectation_resultat", "report_a_nouveau", "2024-05-30", "AGO", "PV-AGO-2024", "2", "2", "68,00 au report à nouveau.", "Affectation — report à nouveau"],
    ["D1-DIV", "-30.00", "2024-05-30", "AGO-2024", "distribution", "resultat", "2024-05-30", "AGO", "PV-AGO-2024", "3", "3", "Un dividende de 30,00 est mis en distribution et payé au plus tard le 30 juin 2024.", "Dividende voté"],
    ["D4-DIV", "-5.00", "2024-05-30", "AGO-2024", "distribution", "autres_reserves", "2024-05-30", "AGO", "PV-AGO-2024", "3", "4", "Une distribution exceptionnelle de 5,00 est prélevée sur les autres réserves.", "Distribution exceptionnelle"],
    ["D2-CAP", "20.00", "2024-09-16", "AGE-2024-09", "incorporation_reserves", "capital", "2024-09-16", "AGE", "PV-AGE-2024-09", "1", "1", "Le capital est augmenté de 20,00 par incorporation des autres réserves.", "Incorporation — capital"],
    ["D2-RES", "-20.00", "2024-09-16", "AGE-2024-09", "incorporation_reserves", "autres_reserves", "2024-09-16", "AGE", "PV-AGE-2024-09", "1", "1", "Prélèvement de 20,00 sur les autres réserves.", "Incorporation — autres réserves"],
    ["D3-CAP", "30.00", "2024-12-12", "AGE-2024-12", "augmentation_capital", "capital", "2025-01-10", "AGE", "PV-AGE-2024-12", "1", "1", "Augmentation de capital en numéraire de 30,00, réalisée au certificat du dépositaire.", "Augmentation — nominal"],
    ["D3-PRI", "10.00", "2024-12-12", "AGE-2024-12", "augmentation_capital", "primes", "2025-01-10", "AGE", "PV-AGE-2024-12", "1", "1", "Prime d’émission de 10,00.", "Augmentation — prime"],
    ["D5-DIV", "-20.00", "2025-03-20", "AGO-2025", "distribution", "resultat", "2025-03-20", "AGO", "PV-AGO-2025", "1", "2", "Un dividende de 20,00 est distribué au titre de l’exercice 2024.", "Dividende postérieur à la clôture"]]),
  eq_payments: csv([["ligne", "montant", "date", "decision", "libelle"], ["P01", "25.00", "2024-06-28", "D1-DIV", "Virement des dividendes aux associés"]]),
};
const COLUMNS: Record<EquityTabularType, { key: string; amount: string; date: string; capitaux: Partial<EquityMapping["capitaux"]> }> = {
  eq_balances: { key: "ligne", amount: "montant", date: "date", capitaux: { basis: "balances", accountColumn: "compte", componentColumn: "composante", labelColumn: "libelle" } },
  eq_entries: { key: "ligne", amount: "montant", date: "date", capitaux: { basis: "entries", accountColumn: "compte", componentColumn: "composante", natureColumn: "nature", effectDateColumn: "effet", decisionColumn: "decision", transferColumn: "transfert", pieceColumn: "piece", labelColumn: "libelle" } },
  eq_variation: { key: "ligne", amount: "montant", date: "date", capitaux: { basis: "variation", componentColumn: "composante", columnColumn: "colonne" } },
  eq_decisions: { key: "ligne", amount: "montant", date: "date", capitaux: { basis: "decisions", decisionIdColumn: "decision", typeColumn: "type", componentColumn: "composante", effectDateColumn: "effet", organColumn: "organe", minutesColumn: "pv", pageColumn: "page", resolutionColumn: "resolution", extractColumn: "extrait", labelColumn: "libelle" } },
  eq_payments: { key: "ligne", amount: "montant", date: "date", capitaux: { basis: "payments", decisionColumn: "decision", labelColumn: "libelle" } },
};
export const EQ_TABULAR_ORDER: EquityTabularType[] = ["eq_balances", "eq_entries", "eq_variation", "eq_decisions", "eq_payments"];
export function eqMapping(type: EquityTabularType, overrides: Partial<EquityMapping> & { capitauxOverrides?: Partial<EquityMapping["capitaux"]> } = {}): EquityMapping {
  const c = COLUMNS[type], { capitauxOverrides, ...rest } = overrides;
  return { version: "equity-1", headerRow: 1, columns: { key: c.key, amount: c.amount, date: c.date }, delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1, currency: "EUR", capitaux: { ...c.capitaux, ...capitauxOverrides } as EquityMapping["capitaux"], ...rest };
}
/** Synthetic PV pages, generated deterministically; WinAnsi text only (Helvetica). */
export const EQ_MINUTES: (EquityMinutesForm & { pages: string[][] })[] = [
  { pieceRef: "PV-AGO-2024", title: "PV de l’assemblée générale ordinaire du 30 mai 2024", documentDate: "2024-05-30", pages: [
    ["SOCIÉTÉ SYNTHÉTIQUE — document de recette, aucune valeur juridique", "Procès-verbal de l’assemblée générale ordinaire du 30 mai 2024", "Page 1 — Présences et ordre du jour (données synthétiques)"],
    ["Page 2 — Deuxième résolution : affectation du résultat de l’exercice 2023", "Le résultat de 100,00 est affecté : 2,00 à la réserve légale,", "68,00 au report à nouveau, 30,00 en dividendes."],
    ["Page 3 — Troisième résolution : dividende de 30,00, payé au plus tard le 30 juin 2024.", "Quatrième résolution : distribution exceptionnelle de 5,00", "prélevée sur les autres réserves."]] },
  { pieceRef: "PV-AGE-2024-09", title: "PV de l’assemblée générale extraordinaire du 16 septembre 2024", documentDate: "2024-09-16", pages: [
    ["SOCIÉTÉ SYNTHÉTIQUE — document de recette, aucune valeur juridique", "Page 1 — Première résolution : augmentation du capital de 20,00", "par incorporation des autres réserves."]] },
  { pieceRef: "PV-AGO-2025", title: "PV de l’assemblée générale ordinaire du 20 mars 2025", documentDate: "2025-03-20", pages: [
    ["SOCIÉTÉ SYNTHÉTIQUE — document de recette, aucune valeur juridique", "Page 1 — Deuxième résolution : dividende de 20,00 au titre de l’exercice 2024."]] },
];
export async function minutesPdf(title: string, pages: string[][]) {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), at = new Date("2025-04-01T00:00:00Z");
  doc.setTitle(title); doc.setCreationDate(at); doc.setModificationDate(at); doc.setProducer("PROBANT recette synthétique"); doc.setCreator("PROBANT recette synthétique");
  for (const lines of pages) { const page = doc.addPage([595, 842]); lines.forEach((line, i) => page.drawText(line, { x: 56, y: 780 - i * 22, size: 12, font })); }
  return doc.save({ useObjectStreams: false });
}
export async function minutesFile(m: typeof EQ_MINUTES[number]) { return new File([new Uint8Array(await minutesPdf(m.title, m.pages))], m.pieceRef + ".pdf", { type: "application/pdf" }); }
export async function previewEq(type: EquityTabularType, text = EQ_CSV[type], mapping = eqMapping(type)) {
  return previewImport(new File([text], type + ".csv", { type: "text/csv" }), eqScope, mapping, eqPreparer, type, "capitaux_propres.review");
}
/** Server-side approval shape (as reloaded from PostgreSQL); never produced by a browser. */
export function approveEq(batch: ImportBatch): ImportBatch {
  return { ...batch, document: { ...batch.document, logicalId: batch.document.documentType === "eq_minutes" ? batch.document.logicalId : batch.document.documentType }, approval: { actorId: eqPreparer.id, at: "2025-04-01T09:00:00Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } };
}
export async function eqSources(texts: Partial<Record<EquityTabularType, string>> = {}, types: EquityTabularType[] = EQ_TABULAR_ORDER, minutes = EQ_MINUTES) {
  const tabular = await Promise.all(types.map(async type => approveEq(await previewEq(type, texts[type] ?? EQ_CSV[type]))));
  const pdfs = await Promise.all(minutes.map(async m => approveEq(await previewMinutes(await minutesFile(m), eqScope, { pieceRef: m.pieceRef, title: m.title, documentDate: m.documentDate }, eqPreparer))));
  return [...tabular, ...pdfs];
}
/** Readings validated by the preparer for every decision line whose PV is provided. */
export const EQ_READ_LINES = ["D1-AFF-RES", "D1-AFF-RL", "D1-AFF-RAN", "D1-DIV", "D4-DIV", "D2-CAP", "D2-RES", "D5-DIV"];
export function eqDraft(lines: string[] = EQ_READ_LINES): EquityDraft { return { readings: lines.map(lineId => ({ lineId, text: "Transcription relue sur le PV à la page citée." })) }; }
