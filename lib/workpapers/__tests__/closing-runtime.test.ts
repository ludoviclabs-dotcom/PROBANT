import { describe, expect, it } from "vitest";
import { closingFailureStatus, requireDisposableClosing } from "../closing-http";
import { fold } from "../closing-journal";
import type { ProcedureView } from "../closing-evaluate";
import { buildRecipe } from "./closing-fixtures";
import { CL_PERIOD, createClosingHarness, lockedProvisionSource, type ClosingHarness, type ClosingViewBody } from "./closing-harness";

const proc = (v: ClosingViewBody, id: string) => v.evaluation.procedures.find(p => p.procedureId === id) as ProcedureView;
const indicator = (v: ClosingViewBody, id: string) => { const i = v.evaluation.indicators.find(x => x.id === id)!; return [i.numerator, i.denominator]; };
const codes = (v: ClosingViewBody) => v.evaluation.blockers.map(b => b.code + ":" + b.ref.id);
async function recipe() { const h = createClosingHarness({ cycles: [await lockedProvisionSource()] }); const pc = await buildRecipe(h); return { h, pc, v: await h.view() }; }
/** Minimal file with one detail procedure, ready to be concluded. */
async function small(h: ClosingHarness) {
  await h.ok({ command: "open", period: CL_PERIOD, entity: "BETA SAS (synthétique)" });
  await h.ok({ command: "set_risk", riskId: "R-01", cycle: "tresorerie", label: "Soldes bancaires", assertions: ["solde_existence"], assessment: { level: "faible", rationale: "Un compte." } });
  await h.ok({ command: "set_procedure", procedureId: "P-01", riskIds: ["R-01"], assertions: ["solde_existence"], nature: "detail", label: "Rapprochement bancaire", owner: "Collaborateur A" });
  const bank = await h.piece("Relevé bancaire au 31/12/2026");
  await h.ok({ command: "set_population", procedureId: "P-01", population: { status: "defined", description: "Compte B1", size: 1, citations: [] } });
  await h.ok({ command: "record_work", procedureId: "P-01", step: "execution", performedOn: "2027-01-10", object: "Compte B1", done: "Rapprochement du relevé et du grand livre", itemsExamined: 1, result: "sans_exception", citations: [{ pieceVersionId: bank }] });
  return bank;
}

describe("CL-1901 recette synthétique : programme, travaux manuels, clôture", { timeout: 30_000 }, () => {
  it("cycle verrouillé mais dossier incomplet : la feuille Provisions verrouillée ne rend pas le dossier clôturable", async () => {
    const { h, v } = await recipe();
    expect(v.evaluation.entity).toBe("ALPHA SAS (synthétique)");
    expect(Object.fromEntries(v.evaluation.procedures.map(p => [p.procedureId, p.status]))).toEqual({
      "P-01": "cycle_verrouille", "P-02": "en_cours", "P-03": "en_cours", "P-04": "population_absente", "P-05": "revue", "P-06": "en_cours", "P-07": "perimetre_requis", "P-08": "non_applicable" });
    expect(proc(v, "P-01").engine!.best).toMatchObject({ procedure: "provisions.register", state: "locked", family: "pv" });
    expect(indicator(v, "cycles")).toEqual([1, 1]);
    expect(indicator(v, "revues")).toEqual([2, 7]);
    expect(indicator(v, "conclues")).toEqual([2, 7]);
    expect(v.evaluation.indicators.find(i => i.id === "revues")!.excluded).toBe("1 procédure non applicable motivée exclue");
    expect(indicator(v, "paires")).toEqual([4, 13]);
    // Hand-computed in docs/mission19/RECETTE.md.
    expect(Object.fromEntries(v.evaluation.indicators.map(i => [i.id, i.numerator + "/" + i.denominator]))).toEqual({ revues: "2/7", conclues: "2/7", paires: "4/13", controles_description: "1/2", controles_mise_en_oeuvre: "1/2",
      controles_test_fonctionnement: "0/2", itgc: "0/1", cycles: "1/1", pieces: "1/3", points: "1/2", contradictions: "0/1", anomalies: "1/3", limites: "0/1" });
    expect(v.evaluation.blockers).toHaveLength(19);
    expect(v.seq).toBe(53);
    expect(v.journal).toHaveLength(53);
    expect(v.evaluation.closable).toBe(false);
    expect(codes(v)).toEqual(expect.arrayContaining(["PAIR_UNCOVERED:R-03:solde_evaluation", "CONTRADICTION_OPEN:C-01", "REVIEW_POINT_OPEN:RP-02", "MISSTATEMENT_UNASSESSED:A-03", "LIMITATION_UNASSESSED:L-01"]));
    // No opinion is ever generated; the authorised professional cannot validate an incomplete file either.
    expect(v.evaluation.noOpinion).toContain("aucune opinion");
    expect(JSON.stringify(v)).not.toMatch(/certifi|sans réserve|opinion favorable/i);
    expect(await h.error({ command: "validate_closing", text: "Clôture" }, "signer")).toEqual({ status: 422, error: "CL_CLOSING_BLOCKED" });
    expect(await h.error({ command: "validate_closing", text: "Clôture" }, "signer-nocap")).toEqual({ status: 403, error: "CL_CLOSING_AUTHORITY_FORBIDDEN" });
    expect((await h.error({ command: "validate_closing", text: "Clôture" }, "preparer")).status).toBe(403);
  });
  it("contrôle décrit mais non testé : trois étapes séparées, le fonctionnement n’est jamais déduit", async () => {
    const { h, v } = await recipe(), p3 = proc(v, "P-03");
    expect(p3.steps.map(s => [s.step, s.state])).toEqual([["description", "documente"], ["mise_en_oeuvre", "documente"], ["test_fonctionnement", "absent"]]);
    expect(p3.remaining.map(r => r.code)).toEqual(["STEP_MISSING", "REQUEST_OPEN", "NOT_CONCLUDED", "REVIEW_POINT_OPEN"]);
    expect(p3.limits.join(" ")).toContain("Contrôle décrit, non testé");
    expect(indicator(v, "controles_description")).toEqual([1, 2]);
    expect(indicator(v, "controles_mise_en_oeuvre")).toEqual([1, 2]);
    expect(indicator(v, "controles_test_fonctionnement")).toEqual([0, 2]);
    expect(await h.error({ command: "conclude_procedure", procedureId: "P-03", text: "Contrôle efficace", reach: "fonctionnement", citations: [] })).toEqual({ status: 422, error: "CL_WORK_INCOMPLETE" });
    expect(await h.error({ command: "conclude_procedure", procedureId: "P-03", text: "Conception seulement", citations: [] })).toEqual({ status: 422, error: "CL_REACH_REQUIRED" });
    expect(await h.error({ command: "conclude_procedure", procedureId: "P-03", text: "Conception seulement", reach: "conception_mise_en_oeuvre", citations: [] })).toEqual({ status: 422, error: "CL_PIECE_REQUEST_OPEN" });
    await h.ok({ command: "close_piece_request", requestId: "D-01", outcome: "cancelled", reason: "Aucune confiance prévue dans le contrôle : test non nécessaire au programme." });
    const after = (await h.ok({ command: "conclude_procedure", procedureId: "P-03", text: "Conception et mise en œuvre appréciées ; aucune confiance dans le fonctionnement.", reach: "conception_mise_en_oeuvre", citations: [] })).view;
    expect(proc(after, "P-03")).toMatchObject({ status: "conclue", concluded: true });
    expect(proc(after, "P-03").limits.join(" ")).toContain("Fonctionnement non testé");
    expect(proc(after, "P-03").remaining.map(r => r.code)).not.toContain("STEP_MISSING");
    expect(after.evaluation.indicators.find(i => i.id === "pieces")!.excluded).toBe("1 demande annulée motivée exclue");
  });
  it("un test de fonctionnement exige description et mise en œuvre ; un ITGC exige périmètre et méthode, pas une checklist", async () => {
    const { h } = await recipe();
    await h.ok({ command: "set_procedure", procedureId: "P-09", riskIds: ["R-02"], assertions: ["flux_separation"], nature: "controle_interne", label: "Contrôle de séquence des factures", owner: "Collaborateur B" });
    await h.ok({ command: "set_population", procedureId: "P-09", population: { status: "defined", description: "Factures de décembre", size: 40, citations: [] } });
    expect(await h.error({ command: "record_work", procedureId: "P-09", step: "test_fonctionnement", performedOn: "2027-01-10", object: "25 factures", done: "Test", itemsExamined: 25, result: "sans_exception", citations: [] })).toEqual({ status: 422, error: "CL_CONTROL_DESIGN_REQUIRED" });
    expect(await h.error({ command: "record_work", procedureId: "P-09", step: "execution", performedOn: "2027-01-10", object: "x", done: "x", itemsExamined: null, result: "sans_exception", citations: [] })).toEqual({ status: 422, error: "CL_STEP_INVALID" });
    const checklist = { command: "record_work" as const, procedureId: "P-07", step: "description" as const, performedOn: "2027-01-10", object: "Checklist ITGC", done: "Questionnaire coché", itemsExamined: null, result: "sans_exception" as const, citations: [] };
    expect(await h.error(checklist)).toEqual({ status: 422, error: "CL_ITGC_SCOPE_REQUIRED" });
    expect(await h.error({ command: "set_itgc_scope", procedureId: "P-03", systems: ["ERP"], processes: ["Accès"], from: "2026-01-01", to: "2026-12-31", method: "m", citations: [] })).toEqual({ status: 422, error: "CL_ITGC_ONLY" });
    const v = (await h.ok({ command: "set_itgc_scope", procedureId: "P-07", systems: ["ERP synthétique v2"], processes: ["Gestion des accès", "Gestion des changements"], from: "2026-01-01", to: "2026-12-31",
      method: "Revue des habilitations au 31/12 et test de 25 créations de comptes sur la période", citations: [] })).view;
    expect(proc(v, "P-07").status).toBe("a_faire");
    expect(proc(v, "P-07").limits.join(" ")).toContain("ITGC couverts uniquement sur le périmètre déclaré : ERP synthétique v2");
    expect(indicator(v, "itgc")).toEqual([1, 1]);
    expect((await h.command(checklist)).status).toBe(200);
  });
  it("procédure non applicable motivée : exclue des dénominateurs avec son motif ; travaux existants = incohérence", async () => {
    const { h, v } = await recipe();
    expect(proc(v, "P-08")).toMatchObject({ applicable: false, remaining: [], applicability: { reason: "Aucun emprunt à la clôture : compte 164 soldé au 31/12/2026" } });
    expect(proc(v, "P-08").applicability!.citations[0]).toMatchObject({ label: "Grand livre 164 au 31/12/2026", version: 1 });
    expect(v.evaluation.risks.find(r => r.riskId === "R-07")!.pairs.map(p => p.status)).toEqual(["non_applicable", "non_applicable"]);
    expect(v.evaluation.indicators.find(i => i.id === "paires")!.excluded).toContain("2 couples");
    expect(await h.error({ command: "set_applicability", procedureId: "P-02", applicable: false, citations: [] })).toEqual({ status: 422, error: "CL_NA_REASON_REQUIRED" });
    expect(await h.error({ command: "record_work", procedureId: "P-08", step: "execution", performedOn: "2027-01-10", object: "x", done: "x", itemsExamined: null, result: "sans_exception", citations: [] })).toEqual({ status: 422, error: "CL_PROCEDURE_NOT_APPLICABLE" });
    const after = (await h.ok({ command: "set_applicability", procedureId: "P-02", applicable: false, reason: "Changement d’avis", citations: [] })).view;
    expect(after.evaluation.coherence.map(c => c.code)).toContain("NA_WITH_WORK");
  });
  it("population absente : aucun travail d’exécution ni conclusion ; la file des pièces la porte ; un montant inconnu reste inconnu", async () => {
    const { h, v } = await recipe();
    expect(proc(v, "P-04").remaining.map(r => r.code)).toEqual(["POPULATION_ABSENT", "NO_WORK", "NOT_CONCLUDED"]);
    expect(await h.error({ command: "record_work", procedureId: "P-04", step: "execution", performedOn: "2027-01-10", object: "Site A", done: "Comptages", itemsExamined: 30, result: "sans_exception", citations: [] })).toEqual({ status: 422, error: "CL_POPULATION_ABSENT" });
    expect(await h.error({ command: "conclude_procedure", procedureId: "P-04", text: "Stocks existants", citations: [] })).toEqual({ status: 422, error: "CL_POPULATION_ABSENT" });
    expect(v.evaluation.missing.map(m => [m.kind, m.procedureId])).toEqual(expect.arrayContaining([["population_absente", "P-04"], ["request", "P-03"], ["request", "P-02"], ["declaration_seule", "P-06"]]));
    expect(v.evaluation.missing).toHaveLength(4);
    expect(v.evaluation.misstatements).toMatchObject({ total: 3, corrected: 1, uncorrected: 2, knownCorrected: { amount: "1240.00" }, knownUncorrected: { amount: "3000.00" }, unknownUncorrected: 1 });
    expect(v.journal.find(l => l.label.startsWith("A-03"))!.label).toContain("Montant inconnu — Site B non observé");
  });
  it("anomalie corrigée avec nouvelle preuve : ni la pièce d’origine, ni une déclaration seule", async () => {
    const h = createClosingHarness(), bank = await small(h);
    await h.ok({ command: "record_misstatement", procedureId: "P-01", cycle: "tresorerie", description: "Frais non comptabilisés", amount: { kind: "known", value: { amount: "80.00", currency: "EUR" } }, citations: [{ pieceVersionId: bank }] });
    expect(await h.error({ command: "correct_misstatement", misstatementId: "A-01", text: "Corrigé", citations: [{ pieceVersionId: bank }] })).toEqual({ status: 422, error: "CL_NEW_EVIDENCE_REQUIRED" });
    const said = await h.piece("Courriel de la direction", "declaration_direction");
    expect(await h.error({ command: "correct_misstatement", misstatementId: "A-01", text: "Corrigé selon la direction", citations: [{ pieceVersionId: said }] })).toEqual({ status: 422, error: "CL_REPRESENTATION_ONLY" });
    const od = await h.piece("Écriture de correction OD-12");
    const v = (await h.ok({ command: "correct_misstatement", misstatementId: "A-01", text: "Écriture passée", citations: [{ pieceVersionId: od }] })).view;
    expect(v.evaluation.misstatements).toMatchObject({ corrected: 1, knownCorrected: { amount: "80.00" } });
    expect(await h.error({ command: "assess_misstatement", misstatementId: "A-01", text: "x" }, "reviewer")).toEqual({ status: 422, error: "CL_MISSTATEMENT_ALREADY_CORRECTED" });
    // A conclusion resting on clean work while a misstatement is attached is flagged, never silently accepted.
    const concluded = (await h.ok({ command: "conclude_procedure", procedureId: "P-01", text: "Solde justifié", citations: [] })).view;
    expect(concluded.evaluation.coherence.map(c => c.code)).toEqual(["MISSTATEMENT_IN_CLEAN_PROCEDURE"]);
  });
  it("contradiction non résolue : bloque la clôture ; la résolution cite une pièce corroborante", async () => {
    const { h, v, pc } = await recipe();
    expect(v.evaluation.indicators.find(i => i.id === "contradictions")).toMatchObject({ numerator: 0, denominator: 1 });
    expect(await h.error({ command: "resolve_contradiction", contradictionId: "C-01", text: "La direction confirme", citations: [{ pieceVersionId: pc.representation }] })).toEqual({ status: 422, error: "CL_REPRESENTATION_ONLY" });
    expect(await h.error({ command: "record_contradiction", left: { pieceVersionId: pc.lawyer }, right: { pieceVersionId: pc.lawyer, page: 2 }, description: "x", procedureIds: [] })).toEqual({ status: 422, error: "CL_CONTRADICTION_SAME_PIECE" });
    const after = (await h.ok({ command: "resolve_contradiction", contradictionId: "C-01", text: "Lettre d’affirmation complétée après la réponse de l’avocat.", citations: [{ pieceVersionId: pc.lawyer }] })).view;
    expect(codes(after)).not.toContain("CONTRADICTION_OPEN:C-01");
  });
  it("déclaration de la direction : une pièce parmi d’autres, jamais une preuve suffisante seule", async () => {
    const { h, v } = await recipe();
    expect(proc(v, "P-06")).toMatchObject({ evidence: { representationOnly: true } });
    expect(proc(v, "P-06").records[0].flags).toEqual(["declaration_seule"]);
    expect(await h.error({ command: "conclude_procedure", procedureId: "P-06", text: "Aucun événement postérieur", citations: [] })).toEqual({ status: 422, error: "CL_REPRESENTATION_ONLY" });
  });
  it("qui a fait quoi, quand, sur quoi et avec quelle preuve : journal signé par le serveur, revue par une autre personne", async () => {
    const { h, v } = await recipe(), p5 = proc(v, "P-05");
    expect(p5.records[0]).toMatchObject({ by: "preparer-cl", performedOn: "2027-01-12", object: "Compte B1, solde et frais au 31/12/2026", itemsExamined: 1, result: "exceptions",
      citations: [{ label: "Réponse de la banque B1 — confirmation au 31/12/2026", version: 1, kind: "reponse_tiers", page: 1, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }] });
    expect(p5.review).toMatchObject({ by: "reviewer-cl", decision: "approved", current: true });
    expect(v.journal.every(l => l.actorId && /^\d{4}-\d{2}-\d{2}T/.test(l.at) && /^[a-f0-9]{12}$/.test(l.hash))).toBe(true);
    expect(v.journal.find(l => l.type === "record_work" && l.procedureId === "P-05")!.label).toBe("W-03 · Exécution réalisé le 2027-01-12 sur Compte B1, solde et frais au 31/12/2026 — exceptions relevées — Réponse de la banque B1 — confirmation au 31/12/2026 v1");
    // Separation of duties: nobody reviews their own conclusion, closes a point they answered, or assesses their own finding.
    await h.ok({ command: "raise_review_point", target: { kind: "dossier" }, text: "Vérifier la lettre de mission" }, "reviewer");
    await h.ok({ command: "answer_review_point", pointId: "RP-03", text: "Jointe", citations: [] }, "admin");
    expect(await h.error({ command: "close_review_point", pointId: "RP-03", text: "OK" }, "admin")).toEqual({ status: 403, error: "CL_SELF_CLOSE_FORBIDDEN" });
    await h.ok({ command: "record_limitation", cycle: "transversal", description: "Lettre de mission non signée", procedureIds: [] }, "admin");
    expect(await h.error({ command: "assess_limitation", limitationId: "L-02", text: "Sans incidence" }, "admin")).toEqual({ status: 403, error: "CL_SELF_REVIEW_FORBIDDEN" });
    expect((await h.error({ command: "review_procedure", procedureId: "P-05", decision: "approved", text: "x" }, "preparer")).status).toBe(403);
  });
  it("revue par une autre personne : l’auteur de la conclusion ou d’un travail ne revoit pas", async () => {
    const h = createClosingHarness();
    await small(h);
    await h.ok({ command: "conclude_procedure", procedureId: "P-01", text: "Solde justifié", citations: [] }, "admin");
    expect(await h.error({ command: "review_procedure", procedureId: "P-01", decision: "approved", text: "Auto-revue" }, "admin")).toEqual({ status: 403, error: "CL_SELF_REVIEW_FORBIDDEN" });
    const v = (await h.ok({ command: "review_procedure", procedureId: "P-01", decision: "changes_requested", text: "Préciser la date du relevé." }, "reviewer")).view;
    expect(proc(v, "P-01")).toMatchObject({ status: "changements", done: false });
  });
});

describe("CL-1902 péremption, validation de clôture, concurrence et accès", { timeout: 30_000 }, () => {
  it("toute modification pertinente rend périmés les travaux dépendants : nouvelle version d’une pièce citée", async () => {
    const h = createClosingHarness(), bank = await small(h);
    await h.ok({ command: "conclude_procedure", procedureId: "P-01", text: "Solde justifié", citations: [] });
    let v = (await h.ok({ command: "review_procedure", procedureId: "P-01", decision: "approved", text: "Revu" }, "reviewer")).view;
    expect(proc(v, "P-01").status).toBe("revue");
    expect((await h.upload("Pièce synthétique — Relevé bancaire au 31/12/2026\nAucune donnée réelle.\n", "releve.txt", { label: "Relevé", kind: "document", pieceId: "PC-01" })).body.error).toBe("CL_PIECE_UNCHANGED");
    const v2 = await h.piece("Relevé bancaire au 31/12/2026 (corrigé par la banque)", "document", "Relevé corrigé — synthétique\n", "PC-01");
    expect(v2).toBe("PC-01-v2");
    v = await h.view();
    expect(proc(v, "P-01")).toMatchObject({ status: "perimee", done: false, conclusion: { stale: true }, review: { current: false } });
    expect(proc(v, "P-01").records[0].flags).toEqual(["preuve_remplacee"]);
    expect(v.evaluation.missing.map(m => m.kind)).toEqual(["preuve_remplacee"]);
    expect(await h.error({ command: "record_work", procedureId: "P-01", step: "execution", performedOn: "2027-01-11", object: "Compte B1", done: "x", itemsExamined: 1, result: "sans_exception", citations: [{ pieceVersionId: bank }] })).toEqual({ status: 422, error: "CL_PIECE_VERSION_SUPERSEDED" });
  });
  it("validation de clôture : professionnel habilité seulement, dossier figé, périmée si une feuille de cycle change, réouverture tracée", async () => {
    const src = await lockedProvisionSource(), h = createClosingHarness({ cycles: [src] });
    await small(h);
    expect((await h.view()).evaluation.coherence.map(c => c.code)).toEqual(["CYCLE_OUTSIDE_PROGRAM"]);
    await h.ok({ command: "set_risk", riskId: "R-02", cycle: "provisions", label: "Provisions", assertions: ["solde_evaluation"], assessment: null });
    expect(codes(await h.view())).toContain("RISK_UNASSESSED:R-02");
    await h.ok({ command: "set_risk", riskId: "R-02", cycle: "provisions", label: "Provisions", assertions: ["solde_evaluation"], assessment: { level: "modere", rationale: "Litiges." } });
    await h.ok({ command: "set_procedure", procedureId: "P-02", riskIds: ["R-02"], assertions: ["solde_evaluation"], nature: "engine", engine: "provisions.register", label: "Registre des provisions", owner: "Chef de mission" });
    await h.ok({ command: "conclude_procedure", procedureId: "P-01", text: "Solde justifié", citations: [] });
    let v = (await h.ok({ command: "review_procedure", procedureId: "P-01", decision: "approved", text: "Revu" }, "reviewer")).view;
    expect(v.evaluation).toMatchObject({ closable: true, blockers: [], coherence: [] });
    expect(await h.error({ command: "validate_closing", text: "Clôture" }, "signer-nocap")).toEqual({ status: 403, error: "CL_CLOSING_AUTHORITY_FORBIDDEN" });
    expect((await h.error({ command: "validate_closing", text: "Clôture" }, "reviewer")).status).toBe(403);
    v = (await h.ok({ command: "validate_closing", text: "Dossier de travail revu ; décision de clôture du professionnel habilité." }, "signer")).view;
    expect(v.evaluation.validation).toMatchObject({ status: "validee", by: "signer-cl", changed: [] });
    expect(await h.error({ command: "set_risk", riskId: "R-03", cycle: "stocks", label: "x", assertions: ["solde_existence"], assessment: null })).toEqual({ status: 422, error: "CL_FILE_CLOSED" });
    expect((await h.upload("x\n", "x.txt", { label: "x", kind: "document" })).body.error).toBe("CL_FILE_CLOSED");
    // The provisions sheet is revised in its own cycle: the recorded validation no longer matches what it rested on.
    await src.harness.ok({ command: "revise", id: src.runId, expectedVersion: src.version });
    v = await h.view();
    expect(v.evaluation.validation.status).toBe("perimee");
    expect(v.evaluation.validation.changed.join(" ")).toContain("provisions.register");
    expect(codes(v)).toContain("VALIDATION_STALE:validation");
    expect(await h.error({ command: "reopen", reason: "x" }, "signer-nocap")).toEqual({ status: 403, error: "CL_CLOSING_AUTHORITY_FORBIDDEN" });
    v = (await h.ok({ command: "reopen", reason: "Feuille Provisions révisée après la validation." }, "signer")).view;
    expect(v.evaluation.validation).toMatchObject({ status: "reouverte", reopened: { by: "signer-cl", reason: "Feuille Provisions révisée après la validation." } });
    expect(v.journal.map(l => l.type).slice(-2)).toEqual(["validate_closing", "reopen"]);
  });
  it("concurrence optimiste et idempotence : un seul écrivain par position du journal, jamais de fusion", async () => {
    const h = createClosingHarness();
    await h.ok({ command: "open", period: CL_PERIOD, entity: "GAMMA SAS (synthétique)" });
    const seq = (await h.view()).seq, risk = { command: "set_risk" as const, riskId: "R-01", cycle: "stocks" as const, label: "Stocks", assertions: ["solde_existence"], assessment: null, expectedSeq: seq };
    const first = await h.command(risk, "preparer", "key-risk-0001");
    expect(first.status).toBe(200);
    expect((await h.command(risk, "preparer", "key-risk-0001")).body.applied).toEqual(first.body.applied);
    expect((await h.command({ ...risk, label: "Autre" }, "preparer", "key-risk-0001")).body.error).toBe("IDEMPOTENCY_KEY_REUSED");
    expect((await h.command({ ...risk, riskId: "R-02" }, "preparer2")).body).toEqual({ error: "CL_STALE_SEQ", currentSeq: seq + 1, expectedSeq: seq });
    expect((await h.command({ command: "open", period: CL_PERIOD, entity: "x" })).body.error).toBe("CL_FILE_ALREADY_OPENED");
  });
  it("accès : périmètre organisation/dossier, sessions expirées, permissions par commande, garde de production", async () => {
    const h = createClosingHarness();
    await h.ok({ command: "open", period: CL_PERIOD, entity: "DELTA SAS (synthétique)" });
    expect((await h.read("outsider")).status).toBe(403);
    expect((await h.read("expired")).status).toBe(401);
    expect((await h.error({ command: "set_risk", riskId: "R-01", cycle: "stocks", label: "x", assertions: ["solde_existence"], assessment: null }, "reviewer")).status).toBe(403);
    expect((await h.error({ command: "raise_review_point", target: { kind: "dossier" }, text: "x" }, "preparer")).status).toBe(403);
    const view = await h.view("reviewer");
    expect(view).toMatchObject({ actorId: "reviewer-cl", permissions: ["read", "review", "download"], closingAuthority: false });
    expect((await h.view("signer")).closingAuthority).toBe(true);
    expect(() => requireDisposableClosing({ PROBANT_CLOSING_DURABLE: "disposable", VERCEL_ENV: "production" })).toThrow();
    expect(() => requireDisposableClosing({})).toThrow();
    expect(() => requireDisposableClosing({ PROBANT_CLOSING_DURABLE: "disposable", VERCEL_ENV: "preview" })).not.toThrow();
    expect([closingFailureStatus("CL_STALE_SEQ"), closingFailureStatus("CL_SELF_REVIEW_FORBIDDEN"), closingFailureStatus("CL_POPULATION_ABSENT"), closingFailureStatus("CL_JOURNAL_CORRUPTED"), closingFailureStatus("ECONNRESET")]).toEqual([409, 403, 422, 500, 503]);
  });
  it("journal et pièces : un journal altéré est refusé ; une pièce est vérifiée par son contenu et son empreinte", async () => {
    const h = createClosingHarness(), bank = await small(h);
    expect((await h.upload(new Uint8Array([0x00, 0x01, 0x02, 0x03]), "binaire.bin", { label: "Binaire", kind: "document" })).body.error).toBe("CL_FILE_TYPE_UNSUPPORTED");
    const pdf = new TextEncoder().encode("%PDF-1.4\n% synthétique\n");
    const up = await h.upload(pdf, "pv.pdf", { label: "PV synthétique", kind: "document" });
    expect(up.status).toBe(200);
    const id = up.body.view.pieces.at(-1).pieceVersionId;
    const download = await h.handlers.GET(h.request("reviewer", "GET", undefined, undefined, "&operation=download&id=" + id));
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(pdf);
    expect((await h.handlers.GET(h.request("outsider", "GET", undefined, undefined, "&operation=download&id=" + bank))).status).toBe(403);
    const events = Object.values(h.db.state.events)[0];
    expect(() => fold(events)).not.toThrow();
    (events[2].payload as { label: string }).label = "Risque falsifié";
    expect(await h.read()).toEqual({ status: 500, body: { error: "CL_JOURNAL_CORRUPTED" } });
  });
  it("feuilles outillées : observées seulement, ni travail ni population ni conclusion dans le dossier", async () => {
    const { h } = await recipe();
    expect(await h.error({ command: "record_work", procedureId: "P-01", step: "execution", performedOn: "2027-01-10", object: "x", done: "x", itemsExamined: null, result: "sans_exception", citations: [] })).toEqual({ status: 422, error: "CL_ENGINE_WORK_IN_CYCLE" });
    expect(await h.error({ command: "set_population", procedureId: "P-01", population: { status: "absent", reason: "x" } })).toEqual({ status: 422, error: "CL_ENGINE_POPULATION_FROM_CYCLE" });
    expect(await h.error({ command: "conclude_procedure", procedureId: "P-01", text: "x", citations: [] })).toEqual({ status: 422, error: "CL_ENGINE_CONCLUDED_IN_CYCLE" });
    expect(await h.error({ command: "set_procedure", procedureId: "P-10", riskIds: ["R-01"], assertions: ["solde_evaluation"], nature: "engine", engine: "provisions.register", label: "x", owner: "x" })).toEqual({ status: 422, error: "CL_ENGINE_ALREADY_LINKED" });
    expect(await h.error({ command: "set_procedure", procedureId: "P-10", riskIds: ["R-01"], assertions: ["solde_evaluation"], nature: "engine", label: "x", owner: "x" })).toEqual({ status: 422, error: "CL_ENGINE_REQUIRED" });
    expect(await h.error({ command: "set_procedure", procedureId: "P-10", riskIds: ["R-04"], assertions: ["flux_classification"], nature: "detail", label: "x", owner: "x" })).toEqual({ status: 422, error: "CL_ASSERTION_NOT_IN_RISK" });
    expect(await h.error({ command: "set_risk", riskId: "R-04", cycle: "tresorerie", label: "x", assertions: ["solde_existence"], assessment: null })).toEqual({ status: 422, error: "CL_RISK_ASSERTION_IN_USE" });
  });
});
