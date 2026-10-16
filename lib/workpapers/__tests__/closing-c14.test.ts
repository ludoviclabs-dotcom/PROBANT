import { describe, expect, it } from "vitest";
import type { ProcedureView } from "../closing-evaluate";
import { buildRecipe } from "./closing-fixtures";
import { addSolo, euro, sheet, small, source } from "./closing-c14-fixtures";
import { fingerprintChanged, type CycleObservation } from "../closing-cycles";
import { createClosingHarness, lockedProvisionSource, type ClosingViewBody } from "./closing-harness";
import { PV_CSV } from "./provision-fixtures";

/**
 * C14 recipe — unified view of the file. Expected values are written by hand from docs/mission19/RECETTE.md and docs/mission-c14/RECETTE.md
 * (programme of 8 procedures, 7 risks, 15 risk × assertion couples of which 2 are excluded), never read back from the engine.
 */
const proc = (v: ClosingViewBody, id: string) => v.evaluation.procedures.find(p => p.procedureId === id) as ProcedureView;
const indicator = (v: ClosingViewBody, id: string) => { const i = v.evaluation.indicators.find(x => x.id === id)!; return [i.numerator, i.denominator]; };
const codes = (v: ClosingViewBody) => v.evaluation.blockers.map(b => b.code + ":" + b.ref.id);
async function recipe() { const h = createClosingHarness({ cycles: [await lockedProvisionSource()] }); const pc = await buildRecipe(h); return { h, pc, v: await h.view() }; }
describe("C14 — vue unifiée du dossier : projection, rattachement des feuilles, mêmes dénominateurs", { timeout: 60_000 }, () => {
  it("cycle verrouillé mais programme incomplet ; 2/7 procédures revues ; mêmes dénominateurs dans la matrice, le cockpit et l’export", async () => {
    const { h, v } = await recipe();
    // Hand-computed: 8 procedures, P-08 not applicable → 7; P-01 (locked sheet) and P-05 (reviewed) done; 15 couples, R-07's 2 excluded → 13,
    // 4 reviewed (R-01 ×2 through P-01, R-04 ×2 through P-05), 1 uncovered (R-03 · évaluation), 8 in progress.
    const expected = { procedures: { declared: 8, applicable: 7, notApplicable: 1, done: 2, donePersonal: 2, concluded: 2 },
      pairs: { declared: 15, counted: 13, excludedNotApplicable: 2, reviewed: 4, reviewedPersonal: 0, inProgress: 8, uncovered: 1 },
      engines: { applicable: 1, locked: 1, lockedPersonal: 0, toBind: 0 },
      sheets: { lineages: 1, retained: 1, toAssign: 0, excluded: 0, outsideProgram: 0, previousRevisions: 0, inconclusiveRetained: 0, sourcesReplaced: 0 } };
    expect(v.evaluation.denominators).toEqual(expected);
    expect(v.projection.denominators).toEqual(expected);
    expect(proc(v, "P-01")).toMatchObject({ status: "cycle_verrouille", done: true, engine: { binding: { mode: "implicite", drift: null }, retained: { state: "locked", sourcesCurrent: true } } });
    expect(v.evaluation.closable).toBe(false);
    // Cockpit = indicators: same numbers as the denominators.
    expect([indicator(v, "revues"), indicator(v, "paires"), indicator(v, "cycles")]).toEqual([[2, 7], [4, 13], [1, 1]]);
    // Matrix: recounted from the coverage cells.
    const cells = v.evaluation.risks.flatMap(r => r.pairs);
    expect({ reviewed: cells.filter(c => c.status === "revue").length, counted: cells.filter(c => c.status !== "non_applicable").length, uncovered: cells.filter(c => c.status === "aucune").length }).toEqual({ reviewed: 4, counted: 13, uncovered: 1 });
    // Synthesis rows: two done procedures, one row per programme procedure, grouped by cycle in registry order.
    expect(v.projection.cycles.map(c => [c.cycle, c.rows.map(r => r.procedureId)])).toEqual([["clients", ["P-03"]], ["tresorerie", ["P-05"]], ["stocks", ["P-04"]], ["provisions", ["P-01", "P-02"]], ["transversal", ["P-06", "P-08"]], ["informatique", ["P-07"]]]);
    expect(v.projection.cycles.flatMap(c => c.rows).filter(r => r.done).map(r => r.procedureId)).toEqual(["P-05", "P-01"]);
    // Export: the same projection, refused when the browser read an older one.
    const json = await h.handlers.GET(h.request("reviewer", "GET", undefined, undefined, "&operation=export&format=json&snapshot=" + v.projection.hash));
    expect(json.status).toBe(200);
    const exported = JSON.parse(await json.text());
    expect(exported.projection.denominators).toEqual(expected);
    expect(exported.projection.hash).toBe(v.projection.hash);
    expect(exported.journal).toHaveLength(53);
    const html = await (await h.handlers.GET(h.request("reviewer", "GET", undefined, undefined, "&operation=export&format=html&snapshot=" + v.projection.hash))).text();
    expect(html).toContain("Procédures conclues et revues</td><td>2 / 7");
    expect(html).toContain("Couples risque × assertion avec une procédure revue</td><td>4 / 13");
    expect(html).not.toMatch(/(?<!non )certifi|sans réserve|opinion favorable/i);
    const csv = await (await h.handlers.GET(h.request("reviewer", "GET", undefined, undefined, "&operation=export&format=procedures_csv&snapshot=" + v.projection.hash))).text();
    expect(csv.trim().split("\n")).toHaveLength(9);
    expect((await h.handlers.GET(h.request("reviewer", "GET", undefined, undefined, "&operation=export&format=json&snapshot=" + "0".repeat(64)))).status).toBe(409);
    expect((await h.handlers.GET(h.request("outsider", "GET", undefined, undefined, "&operation=export&format=json&snapshot=" + v.projection.hash))).status).toBe(403);
    expect((await h.handlers.GET(h.request("reviewer", "GET", undefined, undefined, "&operation=export&format=json"))).status).toBe(422);
  });

  it("procédure non applicable motivée et population absente : exclusions encore pertinentes listées, montant inconnu conservé", async () => {
    const { v } = await recipe();
    const x = v.projection.exclusions;
    expect(x.filter(e => e.kind === "procedure_non_applicable")).toEqual([{ kind: "procedure_non_applicable", id: "P-08", label: "P-08 · Confirmation des emprunts", reason: "Aucun emprunt à la clôture : compte 164 soldé au 31/12/2026" }]);
    expect(x.filter(e => e.kind === "couple_non_applicable").map(e => e.id)).toEqual(["R-07:solde_existence", "R-07:solde_droits"]);
    // Capability exclusions of the 6 cycles present (provisions 2, clients 1, stocks 4, trésorerie 1, transversal 2, SI 2) = 12; total 1 + 2 + 12.
    expect(x.filter(e => e.kind === "capacite_cycle")).toHaveLength(12);
    expect(x).toHaveLength(15);
    const p4 = v.projection.cycles.find(c => c.cycle === "stocks")!.rows[0];
    expect(p4).toMatchObject({ procedureId: "P-04", status: "population_absente", manual: { population: "Absente : Liste des sites de stockage au 31/12/2026 non transmise : le site B n’est pas identifié" } });
    expect(v.projection.findings.misstatements.find(m => m.id === "A-03")).toMatchObject({ amount: "Montant inconnu — Site B non observé : population absente", stage: "en_attente", residual: "Inconnu", corrected: null });
  });

  it("correction avec preuve nouvelle : corrigée, partielle avec reste résiduel (C05) ; la déclaration de la direction ne clôt pas une contradiction", async () => {
    const { h, v, pc } = await recipe();
    expect(v.evaluation.findings.misstatements.find(m => m.misstatementId === "A-01")).toMatchObject({ stage: "corrigee", corrected: { amount: "1240.00" }, residual: null,
      freshEvidence: [{ label: "Écriture de correction OD-2027-014", version: 1 }], originalEvidence: [{ label: "Réponse de la banque B1 — confirmation au 31/12/2026" }] });
    expect(v.evaluation.misstatements).toMatchObject({ knownCorrected: { amount: "1240.00" }, knownUncorrected: { amount: "3000.00" }, knownResidual: { amount: "3000.00" }, partial: 0 });
    await h.ok({ command: "record_misstatement", procedureId: "P-02", cycle: "provisions", description: "Provision pour litige sous-évaluée", amount: { kind: "known", value: euro("500.00") }, citations: [{ pieceVersionId: pc.lawyer }] });
    const credit = await h.piece("Écriture complémentaire OD-2027-030 (partielle)");
    expect(await h.error({ command: "correct_misstatement", misstatementId: "A-04", text: "x", citations: [{ pieceVersionId: credit }], correctedAmount: euro("500.00") })).toEqual({ status: 422, error: "CL_CORRECTED_AMOUNT_INVALID" });
    expect(await h.error({ command: "correct_misstatement", misstatementId: "A-04", text: "x", citations: [{ pieceVersionId: credit }], correctedAmount: euro("-100.00") })).toEqual({ status: 422, error: "CL_CORRECTED_AMOUNT_INVALID" });
    expect(await h.error({ command: "correct_misstatement", misstatementId: "A-03", text: "x", citations: [{ pieceVersionId: credit }], correctedAmount: euro("100.00") })).toEqual({ status: 422, error: "CL_PARTIAL_AMOUNT_UNKNOWN" });
    const after = (await h.ok({ command: "correct_misstatement", misstatementId: "A-04", text: "Provision complétée de 200,00 € ; le reste n’est pas comptabilisé.", citations: [{ pieceVersionId: credit }], correctedAmount: euro("200.00") })).view;
    expect(after.evaluation.findings.misstatements.find(m => m.misstatementId === "A-04")).toMatchObject({ stage: "corrigee_partiellement", detected: { amount: "500.00" }, corrected: { amount: "200.00" }, residual: { amount: "300.00" } });
    // Corrected 1 240 + 200; not corrected (known) 3 000 (A-02); residual 3 000 + 300; A-03 unknown counted apart.
    expect(after.evaluation.misstatements).toMatchObject({ total: 4, corrected: 2, uncorrected: 2, partial: 1, knownCorrected: { amount: "1440.00" }, knownUncorrected: { amount: "3000.00" }, knownResidual: { amount: "3300.00" }, unknownUncorrected: 1 });
    expect(indicator(after, "anomalies")).toEqual([2, 4]);
    expect(after.journal.at(-1)!.label.replace(/\s/g, " ")).toContain("A-04 corrigée partiellement (200,00");
    // A later management representation is listed against the contradiction; it neither resolves it nor can resolve it alone.
    const letter = await h.piece("Lettre d’affirmation complémentaire", "declaration_direction", "Seconde lettre synthétique : la direction confirme l’absence de litige.\n");
    const later = await h.view();
    expect(later.evaluation.findings.contradictions[0]).toMatchObject({ contradictionId: "C-01", status: "ouverte", representationSide: true, laterRepresentations: [letter] });
    expect(codes(later)).toContain("CONTRADICTION_OPEN:C-01");
    expect(await h.error({ command: "resolve_contradiction", contradictionId: "C-01", text: "La direction confirme", citations: [{ pieceVersionId: letter }] })).toEqual({ status: 422, error: "CL_REPRESENTATION_ONLY" });
  });

  it("deux feuilles de la même procédure sur des périmètres distincts : l’état le plus avancé ne choisit pas ; rattachement explicite, exclusion motivée", async () => {
    const cash = source("cash", [sheet({ id: "cash-B1", state: "locked", outcome: "no_exception_detected", population: ["512-B1"] }), sheet({ id: "cash-B2", state: "executed", outcome: "exceptions_detected", population: ["512-B2"] })]);
    const h = createClosingHarness({ cycles: [cash] });
    await small(h);
    await h.ok({ command: "set_risk", riskId: "R-02", cycle: "tresorerie", label: "Ponts bancaires", assertions: ["solde_existence"], assessment: { level: "modere", rationale: "Deux banques." } });
    let v = (await h.ok({ command: "set_procedure", procedureId: "P-02", riskIds: ["R-02"], assertions: ["solde_existence"], nature: "engine", engine: "cash.reconciliation", label: "Pont bancaire", owner: "Collaborateur B" })).view;
    // B1 is locked, B2 is not: the most advanced state does not select a population on its own.
    expect(proc(v, "P-02")).toMatchObject({ status: "cycle_a_rattacher", done: false, engine: { retained: null, binding: { mode: "aucun" } } });
    expect(proc(v, "P-02").remaining.map(r => r.code)).toEqual(["SHEET_BINDING_REQUIRED"]);
    expect(v.evaluation.sheets.map(x => [x.rootId, x.assignment])).toEqual([["cash-B1", "a_rattacher"], ["cash-B2", "a_rattacher"]]);
    expect(indicator(v, "cycles")).toEqual([0, 1]);
    v = (await h.ok({ command: "bind_sheet", procedureId: "P-02", rootId: "cash-B1", perimeter: "Compte 512-B1 (banque B1)" })).view;
    expect(proc(v, "P-02")).toMatchObject({ status: "cycle_verrouille", engine: { binding: { mode: "explicite", perimeter: "Compte 512-B1 (banque B1)", recorded: { runId: "cash-B1", revision: 1, version: 4, entity: "BETA SAS (synthétique)", exercise: { startDate: "2026-01-01", closingDate: "2026-12-31" } } } } });
    // B2 is another population: neither bound nor excluded, the lock of B1 does not cover it.
    expect(v.evaluation.coherence.map(c => c.code)).toEqual(["SHEET_UNASSIGNED"]);
    expect(codes(v)).toContain("SHEET_UNASSIGNED:cash-B2");
    expect(v.projection.cycles.find(c => c.cycle === "tresorerie")!.otherSheets.map(s => [s.rootId, s.assignment])).toEqual([["cash-B2", "a_rattacher"]]);
    // Second programme procedure for the second perimeter; a sheet is bound once.
    await h.ok({ command: "set_procedure", procedureId: "P-03", riskIds: ["R-02"], assertions: ["solde_existence"], nature: "engine", engine: "cash.reconciliation", label: "Pont bancaire B2", owner: "Collaborateur B" });
    expect(await h.error({ command: "bind_sheet", procedureId: "P-03", rootId: "cash-B1", perimeter: "x" })).toEqual({ status: 422, error: "CL_SHEET_ALREADY_BOUND" });
    expect(await h.error({ command: "bind_sheet", procedureId: "P-03", rootId: "cash-B9", perimeter: "x" })).toEqual({ status: 422, error: "CL_SHEET_UNKNOWN" });
    v = (await h.ok({ command: "bind_sheet", procedureId: "P-03", rootId: "cash-B2", perimeter: "Compte 512-B2 (banque B2)" })).view;
    expect([proc(v, "P-02").status, proc(v, "P-03").status]).toEqual(["cycle_verrouille", "cycle_en_cours"]);
    expect(v.evaluation.denominators.engines).toEqual({ applicable: 2, locked: 1, lockedPersonal: 0, toBind: 0 });
    expect(v.evaluation.denominators.sheets).toMatchObject({ lineages: 2, retained: 2, toAssign: 0 });
    expect(v.evaluation.coherence).toEqual([]);
    // Alternative: P-03 not applicable and B2 excluded with its reason — listed, out of the denominators, never silently covered.
    await h.ok({ command: "set_procedure", procedureId: "P-03", riskIds: ["R-02"], assertions: ["solde_existence"], nature: "detail", label: "Pont bancaire B2 (manuel)", owner: "Collaborateur B" });
    expect(await h.error({ command: "exclude_sheet", engine: "cash.reconciliation", rootId: "cash-B1", reason: "x" })).toEqual({ status: 422, error: "CL_SHEET_BOUND" });
    v = (await h.ok({ command: "exclude_sheet", engine: "cash.reconciliation", rootId: "cash-B2", reason: "Compte B2 clôturé en mars 2026, solde nul confirmé par la banque" })).view;
    expect(v.evaluation.sheets.find(x => x.rootId === "cash-B2")).toMatchObject({ assignment: "ecartee", exclusion: { reason: "Compte B2 clôturé en mars 2026, solde nul confirmé par la banque" } });
    expect(v.evaluation.indicators.find(i => i.id === "cycles")).toMatchObject({ numerator: 1, denominator: 1, excluded: "1 feuille écartée du programme avec motif" });
    expect(v.projection.exclusions.find(e => e.kind === "feuille_ecartee")).toMatchObject({ id: "cash.reconciliation|cash-B2" });
    expect(v.journal.map(l => l.type)).toEqual(expect.arrayContaining(["bind_sheet", "exclude_sheet"]));
  });

  it("aucun verrouillage ancien ne couvre une nouvelle population ; une feuille verrouillée garde son résultat non concluant", async () => {
    const cash = source("cash", [sheet({ id: "cash-B1", state: "locked", outcome: "inconclusive", population: ["512-B1"] })]);
    const h = createClosingHarness({ cycles: [cash] });
    await small(h);
    await h.ok({ command: "set_risk", riskId: "R-02", cycle: "tresorerie", label: "Ponts bancaires", assertions: ["solde_existence"], assessment: { level: "modere", rationale: "Banque." } });
    let v = (await h.ok({ command: "set_procedure", procedureId: "P-02", riskIds: ["R-02"], assertions: ["solde_existence"], nature: "engine", engine: "cash.reconciliation", label: "Pont bancaire", owner: "Collaborateur B" })).view;
    expect(proc(v, "P-02")).toMatchObject({ status: "cycle_verrouille", engine: { binding: { mode: "implicite" }, resultLabel: "Résultat non concluant" } });
    expect(proc(v, "P-02").limits.join(" ")).toContain("résultat non concluant : le verrouillage ne le rend pas concluant");
    expect(v.evaluation.denominators.sheets.inconclusiveRetained).toBe(1);
    expect(v.projection.cycles.find(c => c.cycle === "tresorerie")!.rows.find(r => r.procedureId === "P-02")!.sheet).toMatchObject({ inconclusive: true, result: "inconclusive" });
    v = (await h.ok({ command: "bind_sheet", procedureId: "P-02", rootId: "cash-B1", perimeter: "Compte 512-B1" })).view;
    expect(proc(v, "P-02")).toMatchObject({ status: "cycle_verrouille", engine: { binding: { mode: "explicite", drift: null, recorded: { runId: "cash-B1", revision: 1 } } } });
    // A revision of the same lineage with a new population: the locked revision 1 stays listed, never counted.
    cash.runs_.push(sheet({ id: "cash-B1:r2", rootId: "cash-B1", revision: 2, version: 1, state: "draft", population: ["512-B1", "512-B1-devise"] }));
    v = await h.view();
    expect(proc(v, "P-02")).toMatchObject({ status: "cycle_a_rattacher", done: false, engine: { retained: null, binding: { drift: "revisee" } } });
    expect(proc(v, "P-02").remaining.map(r => r.code)).toEqual(["SHEET_REVISED"]);
    expect(v.evaluation.sheets[0]).toMatchObject({ rootId: "cash-B1", assignment: "a_rattacher", procedureId: "P-02", current: { runId: "cash-B1:r2", state: "draft" }, previous: [{ runId: "cash-B1", state: "locked" }] });
    // The drifted lineage is pending confirmation by P-02: counted to assign, not retained, flagged once (SHEET_REVISED), listed on the procedure row only.
    expect(v.evaluation.denominators.sheets).toMatchObject({ lineages: 1, retained: 0, toAssign: 1 });
    expect(v.evaluation.coherence.map(c => c.code)).not.toContain("SHEET_UNASSIGNED");
    expect(v.projection.cycles.find(c => c.cycle === "tresorerie")!.otherSheets).toEqual([]);
    expect(indicator(v, "cycles")).toEqual([0, 1]);
    v = (await h.ok({ command: "bind_sheet", procedureId: "P-02", rootId: "cash-B1", perimeter: "Compte 512-B1 et sous-compte devise" })).view;
    expect(proc(v, "P-02")).toMatchObject({ status: "cycle_en_cours", engine: { retained: { runId: "cash-B1:r2" }, binding: { drift: null } } });
    expect(proc(v, "P-02").limits.join(" ")).toContain("révision antérieure verrouillée conservée (r1) : elle ne couvre pas la révision courante");
  });

  it("validation antérieure à C14 (empreinte sans fraîcheur des sources) : une source remplacée depuis compte comme un changement", () => {
    const now = { version: 7, state: "locked", contentHash: "h", sourcesCurrent: false } as CycleObservation;
    const legacy = { procedure: "provisions.register", runId: "pv-1", version: 7, state: "locked" as const, contentHash: "h" };
    expect(fingerprintChanged(legacy, now)).toBe(true);
    expect(fingerprintChanged(legacy, { ...now, sourcesCurrent: true })).toBe(false);
    expect(fingerprintChanged(legacy, { ...now, sourcesCurrent: null })).toBe(false);
    expect(fingerprintChanged({ ...legacy, sourcesCurrent: true }, now)).toBe(true);
    expect(fingerprintChanged({ ...legacy, sourcesCurrent: true }, { ...now, sourcesCurrent: true })).toBe(false);
  });

  it("source remplacée après clôture : la validation devient périmée, la feuille demande une révision dans son cycle", async () => {
    const src = await lockedProvisionSource(), h = createClosingHarness({ cycles: [src] });
    await small(h);
    await h.ok({ command: "set_risk", riskId: "R-02", cycle: "provisions", label: "Provisions", assertions: ["solde_evaluation"], assessment: { level: "modere", rationale: "Litiges." } });
    await h.ok({ command: "set_procedure", procedureId: "P-02", riskIds: ["R-02"], assertions: ["solde_evaluation"], nature: "engine", engine: "provisions.register", label: "Registre des provisions", owner: "Chef de mission" });
    await h.ok({ command: "conclude_procedure", procedureId: "P-01", text: "Solde justifié", citations: [] });
    await h.ok({ command: "review_procedure", procedureId: "P-01", decision: "approved", text: "Revu" }, "reviewer");
    let v = (await h.ok({ command: "validate_closing", text: "Dossier revu ; décision du professionnel habilité." }, "signer")).view;
    expect(v.evaluation.validation.status).toBe("validee");
    // The annex source of the locked provisions sheet is replaced in its own cycle after the validation.
    await src.harness.accept(await src.harness.preview("pv_annex", PV_CSV.pv_annex + "\n"));
    v = await h.view();
    expect(proc(v, "P-02")).toMatchObject({ status: "cycle_source_remplacee", done: false, engine: { retained: { state: "locked", sourcesCurrent: false } } });
    expect(v.evaluation.validation).toMatchObject({ status: "perimee", changed: ["provisions.register (" + src.runId + ", source remplacée)"] });
    expect(codes(v)).toEqual(expect.arrayContaining(["VALIDATION_STALE:validation", "CYCLE_SOURCE_REPLACED:P-02"]));
    expect(v.evaluation.denominators.sheets.sourcesReplaced).toBe(1);
    expect(v.projection.completion.professional.status).toBe("perimee");
  });

  it("mode solo : relecture personnelle nommée et dossier personnel terminé avec limites visibles ; la revue professionnelle reste distincte", async () => {
    const h = createClosingHarness(); addSolo(h);
    const bank = await small(h, "solo");
    await h.ok({ command: "conclude_procedure", procedureId: "P-01", text: "Solde justifié", citations: [] }, "solo");
    let v = (await h.ok({ command: "review_procedure", procedureId: "P-01", decision: "approved", text: "Relu sous mon nom." }, "solo")).view;
    expect(proc(v, "P-01")).toMatchObject({ status: "revue_personnelle", done: false, donePersonal: true, reviewBasis: "personnelle", review: { kind: "personal", reviewerName: "Camille Martin", current: true } });
    expect(indicator(v, "revues")).toEqual([0, 1]);
    expect(indicator(v, "relues")).toEqual([1, 1]);
    expect(v.evaluation.risks[0].pairs[0].status).toBe("relue");
    expect(v.evaluation.blockers).toEqual([]);
    expect(v.evaluation.professionalGaps.map(g => g.code + ":" + g.ref.id)).toEqual(["PERSONAL_REVIEW_ONLY:P-01"]);
    expect(v.evaluation.closable).toBe(false);
    expect(v.journal.find(l => l.type === "review_procedure")!.label).toContain("relecture personnelle nommée : Camille Martin");
    expect((await h.error({ command: "mark_personal_complete", text: "x" }, "preparer")).status).toBe(403);
    expect(await h.error({ command: "mark_personal_complete", text: "x" }, "reviewer")).toEqual({ status: 422, error: "CL_PERSONAL_PROFILE_REQUIRED" });
    v = (await h.ok({ command: "mark_personal_complete", text: "Dossier personnel terminé ; limites relues." }, "solo")).view;
    expect(v.evaluation.personal).toMatchObject({ status: "marque", reviewerName: "Camille Martin", limits: [{ code: "PERSONAL_REVIEW_ONLY" }], changed: [] });
    expect(v.evaluation.validation.status).toBe("absente");
    expect((await h.error({ command: "validate_closing", text: "Clôture" }, "solo")).status).toBe(403);
    // A piece replaced after the personal mark: the mark and the conclusion become stale, the work is to be re-examined.
    await h.piece("Relevé bancaire au 31/12/2026 (corrigé)", "document", "Relevé corrigé — synthétique\n", "PC-01", "solo");
    v = await h.view();
    expect(v.evaluation.personal).toMatchObject({ status: "perime", changed: ["1 événement du journal postérieur au marquage"] });
    expect(proc(v, "P-01")).toMatchObject({ status: "perimee", donePersonal: false });
    void bank;
  });

  it("Paie et congés persistants (C12) observés par leur famille : relecture personnelle de la feuille comptée à part, révision suivie", async () => {
    const hr = source("hr", [sheet({ id: "hr-review", template: "payroll.review", state: "locked", outcome: "exceptions_detected", population: ["2026-09|SOC", "2026-10|SOC"], preparedBy: "proprietaire-local", approval: { actorId: "proprietaire-local", kind: "personal", reviewerName: "Camille Martin" } }),
      sheet({ id: "hr-leave", template: "payroll.leave", state: "executed", outcome: "inconclusive", population: ["CP-2026"], preparedBy: "proprietaire-local" })]);
    const h = createClosingHarness({ cycles: [hr] });
    await small(h);
    await h.ok({ command: "set_risk", riskId: "R-02", cycle: "paie", label: "Charges sociales et congés", assertions: ["solde_exhaustivite"], assessment: { level: "modere", rationale: "Paie interne." } });
    let v = (await h.ok({ command: "set_procedure", procedureId: "P-02", riskIds: ["R-02"], assertions: ["solde_exhaustivite"], nature: "engine", engine: "payroll.review", label: "Paie — rapprochement", owner: "Moi" })).view;
    expect(v.evaluation.observations.map(o => [o.family, o.procedure, o.state])).toEqual([["hr", "payroll.leave", "executed"], ["hr", "payroll.review", "locked"]]);
    expect(proc(v, "P-02")).toMatchObject({ status: "cycle_verrouille", done: false, donePersonal: true, reviewBasis: "personnelle" });
    expect(v.evaluation.professionalGaps.map(g => g.code)).toContain("PERSONAL_REVIEW_ONLY");
    // payroll.leave is observed but not in the programme: listed and flagged, never silently covered.
    expect(v.evaluation.coherence.map(c => c.code)).toEqual(["CYCLE_OUTSIDE_PROGRAM"]);
    expect(v.projection.cycles.find(c => c.cycle === "paie")!.otherSheets.map(s => [s.procedure, s.assignment, s.inconclusive])).toEqual([["payroll.leave", "hors_programme", true]]);
    // After a reprise, a new import revises the payroll sheet (C12 observe): the locked revision no longer counts.
    hr.runs_.push(sheet({ id: "hr-review:r2", rootId: "hr-review", revision: 2, version: 2, template: "payroll.review", state: "executed", outcome: "exceptions_detected", population: ["2026-09|SOC", "2026-10|SOC"], preparedBy: "proprietaire-local" }));
    v = await h.view();
    expect(proc(v, "P-02")).toMatchObject({ status: "cycle_en_cours", engine: { retained: { runId: "hr-review:r2" }, binding: { mode: "implicite" } } });
  });

  it("dates utiles et seuils documentés : définitions NEP 450, aucun barème légal, aucune comparaison automatique", async () => {
    const { h, v: before } = await recipe();
    expect(await h.error({ command: "set_milestone", milestone: "autre", date: "2027-03-15", citations: [] })).toEqual({ status: 422, error: "CL_MILESTONE_LABEL" });
    await h.ok({ command: "set_milestone", milestone: "arrete_comptes", date: "2027-03-20", citations: [] });
    await h.ok({ command: "set_threshold", threshold: "signification", amount: { kind: "known", value: euro("15000.00") }, basis: "Chiffre d’affaires 2026 (750 000 €)", rate: "2", rationale: "Méthode interne du dossier personnel.", citations: [] });
    let v = (await h.ok({ command: "set_threshold", threshold: "planification", amount: { kind: "known", value: euro("20000.00") }, rationale: "Saisie volontairement incohérente.", citations: [] })).view;
    expect(v.evaluation.coherence.map(c => c.code)).toContain("THRESHOLD_ORDER");
    v = (await h.ok({ command: "set_threshold", threshold: "planification", amount: { kind: "known", value: euro("10000.00") }, rationale: "Inférieur au seuil de signification (NEP 450 §07).", citations: [] })).view;
    expect(v.evaluation.coherence.map(c => c.code)).not.toContain("THRESHOLD_ORDER");
    expect(v.projection.thresholds.map(t => [t.label, t.source, t.amount.replace(/\s/g, " "), t.rate])).toEqual([["Seuil de signification", "NEP 450 §06 (définition)", "15 000,00 €", "2"], ["Seuil de planification", "NEP 450 §07 (définition)", "10 000,00 €", null]]);
    expect(v.projection.thresholdNotice).toContain("pas un barème légal");
    // No comparison: the misstatement summary and the blockers are those of the file before the thresholds.
    expect(v.evaluation.misstatements).toEqual(before.evaluation.misstatements);
    expect(v.evaluation.blockers.length).toBe(before.evaluation.blockers.length);
    expect(v.projection.dates.map(d => d.id)).toEqual(["exercice_debut", "exercice_cloture", "date_revue", "ouverture", "premier_travail", "dernier_travail", "derniere_piece", "derniere_approbation_feuille", "jalon_arrete_comptes"]);
    expect(v.projection.dates.find(d => d.id === "jalon_arrete_comptes")).toMatchObject({ date: "2027-03-20", source: "declaree", by: "preparer-cl" });
    expect(v.projection.dates.find(d => d.id === "premier_travail")!.date).toBe("2027-01-08");
  });
});
