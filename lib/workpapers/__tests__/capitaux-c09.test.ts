import { describe, expect, it } from "vitest";
import { equityResultSchema, evaluateEquity, stampEquityWork, type EquityResult } from "../capitaux-review";
import { buildParcours, type ParcoursInput } from "../capitaux-parcours";
import type { WorkpaperRun } from "../model";
import { createEquityHarness } from "./capitaux-harness";
import { asCapitauxRule100, C09_CSV, C09_READ_LINES, c09CapitauxRun, c09LegacyRun, c09Period, c09Preparer, c09Scope, c09Sources } from "./capitaux-c09-fixtures";

const asRule100 = (result: EquityResult) => asCapitauxRule100(result);

/**
 * Recette C09 — attendus posés à la main dans docs/recette/c09/RECETTE.md avant toute lecture du moteur.
 * Cas du prompt : affectation sans mouvement global, distribution votée non payée, pièce absente, même PV dans deux parcours,
 * décision amendée, classe d’instrument incertaine.
 */
const eur = (amount: string) => ({ kind: "known", value: { amount, currency: "EUR" } });
const decision = (r: Awaited<ReturnType<typeof c09CapitauxRun>>["result"], lineId: string) => r.decisions!.find(d => d.lineId === lineId)!;
function parcours(cap: Awaited<ReturnType<typeof c09CapitauxRun>> | null, leg: Awaited<ReturnType<typeof c09LegacyRun>> | null): ParcoursInput {
  return { scope: { dossierId: c09Scope.dossierId, periodId: c09Scope.periodId }, journeys: {
    "capitaux_propres.review": { availability: "ready", runs: cap ? [{ run: cap.run, sourcesCurrent: true, lineageCurrent: true }] : [] },
    "equity.review": { availability: "ready", runs: leg ? [{ run: leg.run, sourcesCurrent: true, lineageCurrent: true, pvIndex: leg.pvIndex, paymentsSourcePresent: true }] : [] } } };
}

describe("C09 — règle Capitaux propres 1.1.0 sur le dossier de recette", () => {
  it("affectation sans mouvement global : transfert T1 neutre, capitaux propres 1 520 → 1 630 par la seule variation des autres décisions et du résultat", async () => {
    const { result } = await c09CapitauxRun();
    expect(result.schemaVersion).toBe("capitaux-result-2");
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0]).toMatchObject({ transferRef: "T1", total: { amount: "0.00" } });
    expect(result.totals.transfersEffect.amount).toBe("0.00");
    expect(result.totals.opening).toEqual(eur("1520.00"));
    expect(result.totals.closing).toEqual(eur("1630.00"));
    expect(result.totals.movementsTotal.amount).toBe("110.00");
    expect(result.totals.difference).toEqual(eur("0.00"));
    for (const id of ["D-AFF-RES", "D-AFF-RL", "D-AFF-RAN", "D-AFF-AR"]) expect(decision(result, id)).toMatchObject({ status: "matched", difference: eur("0.00"), paymentState: { status: "not_applicable" } });
  });

  it("distribution votée non payée : 120 votés et comptabilisés, aucun règlement, reste 120 à la clôture comme à la revue", async () => {
    const { result } = await c09CapitauxRun();
    const d = decision(result, "D-DIV");
    expect(d).toMatchObject({ status: "matched", booked: eur("-120.00"), paymentGroup: "AGO-2026 · résolution 3" });
    expect(d.paymentState).toMatchObject({ status: "unpaid", voted: eur("120.00"), paidAtClosing: eur("0.00"), paidAtReview: eur("0.00"), remainingAtClosing: eur("120.00"), remainingAtReview: eur("120.00"), paymentIds: [] });
  });

  it("distribution sans source de règlements : paiement inconnu, jamais réputé nul", async () => {
    const { result } = await c09CapitauxRun({ types: ["eq_balances", "eq_entries", "eq_decisions"] });
    expect(decision(result, "D-DIV").paymentState).toMatchObject({ status: "unknown", paidAtReview: { kind: "unknown", reason: "SOURCE REQUISE : règlements" } });
  });

  it("pièce absente : PV-AGE-2026-11 non fourni → incertitude PV_MISSING, comparaison non faite, libération payée tracée à part", async () => {
    const { result } = await c09CapitauxRun();
    const d = decision(result, "D-CAP");
    expect(d).toMatchObject({ status: "reading_required", pv: { status: "missing", pieceRef: "PV-AGE-2026-11" }, booked: eur("200.00"), difference: { kind: "unknown" } });
    expect(d.paymentState).toMatchObject({ status: "paid", voted: eur("200.00"), paidAtReview: eur("200.00"), remainingAtReview: eur("0.00") });
    expect(result.exceptions.map(e => [e.code, e.targetId])).toEqual([["PV_MISSING", "D-CAP"]]);
  });

  it("décision amendée : D-EXC-1 (50) remplacée par D-EXC-2 (30) → une seule décision en vigueur, écritures −50 + 20 rapprochées, règlement 30 payé", async () => {
    const { result } = await c09CapitauxRun();
    expect(decision(result, "D-EXC-1")).toMatchObject({ status: "superseded", supersededBy: "D-EXC-2", entryIds: [], paymentIds: [], booked: { kind: "not_applicable" }, paymentState: null });
    const d = decision(result, "D-EXC-2");
    expect(d).toMatchObject({ status: "matched", amends: "D-EXC-1", chain: ["D-EXC-1"], entryIds: ["E06", "E07"], booked: eur("-30.00"), difference: eur("0.00"), paymentIds: ["P01"] });
    expect(d.paymentState).toMatchObject({ status: "paid", voted: eur("30.00"), paidAtClosing: eur("30.00"), remainingAtClosing: eur("0.00") });
    // The superseded line is excluded from the decision and minutes controls with its motive: 6 of 7 decisions compared, D-CAP awaiting its PV.
    const control = result.controls.find(c => c.id === "decisions")!;
    expect([control.numerator, control.denominator, control.outcome]).toEqual([6, 7, "inconclusive"]);
    expect(control.exclusions.map(e => e.id)).toEqual(["D:D-EXC-1"]);
    expect(result.entries.find(e => e.entryId === "E06")!.decisionStatus).toBe("matched");
  });

  it("même registre lu sans colonne d’amendement : D-EXC-2 diverge de 50 (20 comptabilisés contre −30 votés) et les deux votes s’additionnent — défaut corrigé par la règle 1.1.0", async () => {
    const { result } = await c09CapitauxRun({ amends: false, readLines: [...C09_READ_LINES, "D-EXC-1"] });
    expect(decision(result, "D-EXC-1")).toMatchObject({ status: "matched", booked: eur("-50.00") });
    expect(decision(result, "D-EXC-2")).toMatchObject({ status: "amount_divergent", booked: eur("20.00"), difference: eur("50.00") });
  });

  it("amendements incohérents refusés avec leur localisation, jamais résolus par le montant", async () => {
    const replace = (row: string) => C09_CSV.eq_decisions.replace(/^D-EXC-2;.*$/m, row);
    const cases: [string, string][] = [
      [replace("D-EXC-2;-30.00;2026-07-10;AGE-2026-07;distribution;autres_reserves;2026-07-10;AGE;PV-AGE-2026-07;1;1;x;y;D-INCONNUE"), "EQ_AMENDMENT_TARGET_UNKNOWN"],
      [replace("D-EXC-2;-30.00;2026-07-10;AGE-2026-07;distribution;resultat;2026-07-10;AGE;PV-AGE-2026-07;1;1;x;y;D-EXC-1"), "EQ_AMENDMENT_TARGET_MISMATCH"],
      [replace("D-EXC-2;-30.00;2026-05-20;AGE-2026-07;distribution;autres_reserves;2026-07-10;AGE;PV-AGE-2026-07;1;1;x;y;D-EXC-1"), "EQ_AMENDMENT_ORDER_INVALID"],
      [replace("D-EXC-2;-30.00;2026-07-10;AGE-2026-07;distribution;autres_reserves;2026-07-10;AGE;PV-AGE-2026-07;1;1;x;y;D-EXC-2"), "EQ_AMENDMENT_INVALID"],
      [C09_CSV.eq_decisions + "\nD-EXC-3;-40.00;2026-08-01;AGE-2026-08;distribution;autres_reserves;2026-08-01;AGE;PV-AGE-2026-08;1;1;x;y;D-EXC-1", "EQ_AMENDMENT_DUPLICATE"],
    ];
    for (const [text, code] of cases) await expect(c09CapitauxRun({ texts: { eq_decisions: text } })).rejects.toMatchObject({ code, name: "EquitySourceError" });
  });

  it("classe d’instrument incertaine : titres participatifs sans termes de remboursement → à qualifier, total des autres fonds propres inconnu ; avance publique qualifiée 80", async () => {
    const { result } = await c09CapitauxRun();
    const p = result.presentation!;
    expect(p.resolution).toMatchObject({ regime: "anc_2024_07", textStatus: "mandatory" });
    expect(p.instruments.map(i => [i.id, i.category, i.status])).toEqual([["AV-PUBLIQUE", "avances_conditionnees", "qualifie"], ["TP-2019", "a_qualifier", "incertain"]]);
    expect(p.instruments.find(i => i.id === "TP-2019")!.amount).toEqual(eur("500.00"));
    expect(p.lines.find(l => l.id === "avances_conditionnees")!.amount).toEqual(eur("80.00"));
    expect(p.lines.find(l => l.id === "fonds_non_remboursables")!.amount.kind).toBe("not_applicable");
    expect(p.otherEquityTotal.kind).toBe("unknown");
    expect(p.toQualify).toBe(1);
    // Other equity funds never enter the equity total: 1 630 excludes the 580 of account 167.
    expect(result.totals.closing).toEqual(eur("1630.00"));
  });

  it("repères légaux SAS 2026 : réserve légale 1/20 de 280 = 14 voté, distribution 150 au-dessus du repère 1 254, rapport 1 630 / 1 200 ; aucun signal ni conclusion", async () => {
    const { result } = await c09CapitauxRun();
    const [rl, dist, half] = result.legal!.items;
    expect(rl.articles[0].label).toContain("version en vigueur depuis le 01/10/2025");
    expect(rl.computed.find(c => c.label.startsWith("Un vingtième"))!.value).toEqual({ kind: "fraction", numerator: "28000", denominator: "20", unit: "cents" });
    expect(rl.signal.kind).toBe("aucun");
    expect(dist.computed.map(c => c.value)).toEqual([eur("150.00"), eur("1630.00"), eur("1254.00")]);
    expect(dist.signal.kind).toBe("aucun");
    expect(half.articles.map(a => a.label.slice(0, 28))).toEqual(["C. com. art. L225-248, versi", "C. com. art. L227-1, version"]);
    expect(half.signal.kind).toBe("aucun");
    expect(result.legalMeaning).toContain("aucune alerte de dissolution");
  });

  it("la règle 1.1.0 n’exécute qu’un travail 1.1.0 et ne produit que le contrat courant", async () => {
    const { run, work, imports } = await c09CapitauxRun();
    const legacyWork = { schemaVersion: "equity-1" as const, convention: work.convention, readings: work.readings };
    expect(() => evaluateEquity(c09Scope, c09Period, imports, run.id, legacyWork)).toThrow();
    expect(equityResultSchema.safeParse({ ...run.result!.result as object, schemaVersion: "equity-result-1" }).success).toBe(false);
  });

  it("une anticipation d’ANC 2024-07 déclarée sans pièce est refusée", async () => {
    const imports = await c09Sources();
    expect(() => stampEquityWork({ scope: c09Scope, period: c09Period, runId: "r", imports, actor: c09Preparer, at: "2027-03-02T09:00:00.000Z",
      draft: { readings: [], framing: { socialForm: "sas", socialFormCitation: null, anticipationAnc202407: true, anticipationCitation: null } } })).toThrow("EQ_ANTICIPATION_CITATION_REQUIRED");
  });
});

describe("C09 — garde de règle au runtime /capitaux-propres", () => {
  it("feuille établie en 1.0.0 : lecture permise, toute commande sauf la révision refusée (409), révision adoptant la règle 1.1.0", async () => {
    const h = createEquityHarness(); const { run } = await h.executed();
    const list = Object.values(h.db.state.versions).map(v => (v as Record<string, WorkpaperRun[]>)[run.id]).find(Boolean)!;
    const index = list.findIndex(v => v.version === run.version), stored = list[index];
    list[index] = { ...stored, template: { ...stored.template, version: "1.0.0", rule: { ...stored.template.rule!, version: "1.0.0" } },
      capitauxWork: { schemaVersion: "equity-1", convention: stored.capitauxWork!.convention, readings: stored.capitauxWork!.readings },
      result: { ...stored.result!, ruleVersion: "1.0.0", result: asCapitauxRule100(stored.result!.result as EquityResult) } } as WorkpaperRun;
    expect((await h.read()).status).toBe(200);
    const refused = await h.command({ command: "execute", id: run.id, expectedVersion: run.version });
    expect([refused.status, refused.body.error]).toEqual([409, "EQ_RULE_REPLACED_REVISION_REQUIRED"]);
    const revised = await h.ok({ command: "revise", id: run.id, expectedVersion: run.version });
    expect([revised.revision, revised.template.version, revised.template.rule?.version]).toEqual([2, "1.1.0", "1.1.0"]);
    // The 1.0.0 version stays as recorded.
    expect(list[index].template.rule?.version).toBe("1.0.0");
  });
});

describe("C09 — parcours unique sur les deux procédures", () => {
  it("même PV dans deux parcours : affectation, dividende et distribution rectifiée comptés une fois ; augmentation sans PV à rapprocher ; décision propre à /equity comptée", async () => {
    const view = buildParcours(parcours(await c09CapitauxRun(), await c09LegacyRun()));
    const summary = view.decisions.map(d => [d.correspondence, d.counted, d.traces.map(t => t.procedure + ":" + t.decisionRefs.join("+")).join(" | ")]);
    expect(summary).toEqual([
      ["linked_concordant", true, "capitaux_propres.review:D-AFF-AR+D-AFF-RAN+D-AFF-RES+D-AFF-RL | equity.review:AFF"],
      ["linked_concordant", true, "capitaux_propres.review:D-DIV | equity.review:DIV"],
      ["linked_concordant", true, "capitaux_propres.review:D-EXC-2 | equity.review:EXC"],
      ["single", true, "equity.review:NO-PV"],
      ["to_reconcile", false, "capitaux_propres.review:D-CAP | equity.review:CAP"],
    ]);
    expect(view.totals).toMatchObject({ counted: 4, linked: 3, toReconcile: 1, divergent: 0, traces: 9 });
    expect(view.totals.byType).toEqual([
      { type: "affectation_resultat", label: "Affectation du résultat", count: 1, magnitude: eur("180.00") },
      { type: "distribution", label: "Distributions", count: 2, magnitude: eur("150.00") },
      { type: "non_typee", label: "Non typées (parcours historique)", count: 1, magnitude: eur("10.00") }]);
    expect(view.totals.effectsByFamily.map(f => [f.family, f.voted])).toEqual([["reserves", eur("140.00")], ["report", eur("20.00")], ["result", eur("-300.00")]]);
    expect(view.totals.settlements).toEqual({ decisions: 2, voted: eur("150.00"), paidAtReview: eur("30.00"), remainingAtReview: eur("120.00"), unpaid: 1 });
    // The amendment history travels with the decision in force; it is not a second decision.
    expect(view.decisions[2].amendments.map(a => a.lineId)).toEqual(["D-EXC-1"]);
    expect(view.totals.exclusions).toEqual([{ reason: "Lignes remplacées par une décision ultérieure (historique d’amendement, non comptées)", count: 1 }]);
    // Exact-version links to the historical routes.
    expect(view.decisions[1].traces[1].href).toBe(`/equity?dossierId=${c09Scope.dossierId}&periodId=${encodeURIComponent(c09Scope.periodId)}&id=equity-c09-run&version=6&tab=tests&event=decision%3ADIV`);
    expect(view.decisions[1].traces[0].href).toContain("/capitaux-propres?dossierId=");
    expect(view.decisions[1].traces[0].href).toContain("&version=6&item=D%3AD-DIV");
    expect(view.framing?.presentation.toQualify).toBe(1);
  });

  it("la même vue sans /equity compte l’augmentation de capital (aucun doublon possible) et garde le dividende non payé", async () => {
    const view = buildParcours(parcours(await c09CapitauxRun(), null));
    expect(view.decisions.map(d => [d.correspondence, d.type])).toEqual([["single", "affectation_resultat"], ["single", "distribution"], ["single", "distribution"], ["single", "augmentation_capital"]]);
    expect(view.totals.settlements).toEqual({ decisions: 3, voted: eur("350.00"), paidAtReview: eur("230.00"), remainingAtReview: eur("120.00"), unpaid: 1 });
  });

  it("montant divergent entre parcours sur le même PV : comptée une fois, montant inconnu, jamais additionné", async () => {
    const decisions = (await import("./capitaux-c09-fixtures")).C09_LEGACY_CSV.equity_decisions.replace("DIV;120.00", "DIV;100.00");
    const view = buildParcours(parcours(await c09CapitauxRun(), await c09LegacyRun({ decisions })));
    const div = view.decisions.find(d => d.traces.some(t => t.decisionRefs.includes("D-DIV")))!;
    expect(div).toMatchObject({ correspondence: "linked_divergent", counted: true, magnitude: { kind: "unknown" }, payment: null });
    expect(view.totals.byType.find(t => t.type === "distribution")!.magnitude.kind).toBe("unknown");
    expect(view.totals.divergent).toBe(1);
  });

  it("même page de PV citée par deux décisions d’une feuille et par l’autre feuille : correspondance à établir, rien n’est compté deux fois", async () => {
    const view = buildParcours(parcours(await c09CapitauxRun(), await c09LegacyRun({ readings: [{ decisionId: "AFF", piece: "AGO", page: 3 }, { decisionId: "DIV", piece: "AGO", page: 3 }, { decisionId: "EXC", piece: "AGE", page: 1 }] })));
    const page3 = view.decisions.filter(d => d.pv?.page === 3 && d.pv.fileName.startsWith("PV-AGO"));
    expect(page3.map(d => [d.correspondence, d.counted, d.traces.length])).toEqual([["to_reconcile", false, 3]]);
  });

  it("feuille /capitaux-propres de règle 1.0.0 : lue telle quelle, périmée, sans paiement comparé ni cadre réécrit", async () => {
    const cap = await c09CapitauxRun({ amends: false, readLines: [...C09_READ_LINES, "D-EXC-1"] });
    const v1 = asRule100(cap.result);
    expect(equityResultSchema.safeParse(v1).success).toBe(true);
    const run = { ...cap.run, template: { ...cap.run.template, version: "1.0.0", rule: { ...cap.run.template.rule!, version: "1.0.0" } }, result: { ...cap.run.result!, ruleVersion: "1.0.0", result: v1 } };
    const empty = parcours(null, null);
    const view = buildParcours({ ...empty, journeys: { ...empty.journeys, "capitaux_propres.review": { availability: "ready", runs: [{ run, sourcesCurrent: true, lineageCurrent: true }] } } });
    expect(view.journeys[0].runs[0]).toMatchObject({ ruleVersion: "1.0.0", ruleCurrent: false, resultSchema: "equity-result-1" });
    expect(view.decisions.every(d => d.traces.every(t => t.stale && t.staleReasons.some(r => r.startsWith("Règle remplacée"))))).toBe(true);
    expect(view.decisions.find(d => d.traces[0].decisionRefs.includes("D-DIV"))!.payment).toBeNull();
    expect(view.framing).toBeNull();
    // Rule 1.0.0 reading of the amended distribution: two decisions, the second divergent — shown as recorded, never rewritten.
    expect(view.decisions.filter(d => d.type === "distribution").map(d => d.traces[0].decisionRefs.join("+"))).toEqual(["D-DIV", "D-EXC-1", "D-EXC-2"]);
  });
});
