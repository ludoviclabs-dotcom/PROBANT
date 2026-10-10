import { describe, expect, it } from "vitest";
import { previewImport, type ImportBatch } from "../imports";
import type { Principal } from "../policy";
import { evaluateProvisions, formatCents, provisionOutcome, stampProvisionWork, type ProvisionDraft, type ProvisionResult } from "../provision-review";
import { assertProvisionBatch, ProvisionSourceError, type ProvisionSourceType } from "../provision-sources";
import { redactProvisionResult } from "../provision-redaction";
import { annexCsv, ANNEX_ROWS, estimateCsv, ESTIMATE_ROWS, ledgerCsv, LEDGER_ROWS, movementCsv, MOVEMENT_ROWS, PV_CSV, pvMapping, pvPeriod, pvScope, registerCsv, REGISTER_ROWS } from "./provision-fixtures";

const actor: Principal = { id: "preparer-pv", grants: [{ scope: pvScope, permissions: ["read", "prepare", "review", "download"] }] };
/** Approved batches built through the real tabular parser and the provisions row qualification. */
async function sources(texts: Partial<Record<ProvisionSourceType, string>>, coverage?: { from: string; to: string }) {
  const batches: ImportBatch[] = [];
  for (const type of ["pv_register", "pv_movements", "pv_estimates", "pv_ledger", "pv_annex", "pv_support"] as ProvisionSourceType[]) {
    const text = texts[type];
    if (text === undefined) continue;
    const batch = await previewImport(new File([text], type + ".csv", { type: "text/csv" }), pvScope, pvMapping(type, coverage), actor, type, "provisions.register");
    assertProvisionBatch(batch, pvPeriod);
    expect(batch.report.blocking).toEqual([]);
    batches.push({ ...batch, approval: { actorId: "preparer-pv", at: "2027-03-15T09:00:00.000Z", previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } });
  }
  return batches;
}
const all = (over: Partial<Record<ProvisionSourceType, string | undefined>> = {}) => sources({ ...PV_CSV, ...over } as Partial<Record<ProvisionSourceType, string>>);
function run(batches: ImportBatch[], draft?: ProvisionDraft): ProvisionResult {
  const s = batches.find(b => b.document.documentType === "pv_support");
  const d: ProvisionDraft = draft ?? (s ? { lawyers: { status: "obtained", citation: { documentId: s.document.id, rowId: s.rows.find(r => r.original.Piece === "LET-AVOCATS")!.id } } } : { lawyers: { status: "not_obtained", reason: "Réponses non reçues à la date de revue" } });
  return evaluateProvisions(pvScope, pvPeriod, batches, "run-pv", stampProvisionWork({ imports: batches, draft: d, actor, at: "2027-03-15T10:00:00.000Z" }));
}
const ev = (r: ProvisionResult, id: string) => r.events.find(e => e.eventId === id)!;
const codes = (r: ProvisionResult) => r.exceptions.map(e => e.code + (e.eventId ? ":" + e.eventId : "")).sort();

describe("PV-1601 cas de référence — montants calculés à la main", () => {
  it("estimation documentée 80, provision 50 : différence +30 à examiner, montant connu, jamais une anomalie validée ni une correction", async () => {
    const r = run(await all()), e = ev(r, "EV-01");
    expect(e).toMatchObject({ state: "ouvert", status: "difference", retainedEstimateCents: "8000", estimateDifferenceCents: "3000",
      bridge: { opening: "3000", dotations: "2000", utilisations: "0", reprises: "0", computedClosing: "5000", declaredClosing: "5000", difference: "0", journal: true } });
    const x = r.exceptions.find(x => x.id === "ESTIMATE_DIFFERENCE:EV-01")!;
    expect(x).toMatchObject({ code: "ESTIMATE_DIFFERENCE", sensitive: true, amount: { kind: "known", value: { amount: "30.00", currency: "EUR" } } });
    expect(x.message).toContain("Estimation retenue 80,00");
    expect(x.message).toContain("provision de clôture calculée 50,00");
    expect(x.message).toContain("différence +30,00");
    expect(x.message).toContain("Ni anomalie validée ni correction proposée");
    // The three scenarios are shown as documented; no probability × amount is ever computed.
    expect(e.estimates.map(s => [s.scenario, s.amountCents, s.retained])).toEqual([["Bas", "4000", false], ["Central — hypothèse la plus probable", "8000", true], ["Haut", "12000", false]]);
  });
  it("reprise sans justificatif : incertitude au montant connu de 10, pont 25 − 5 − 10 = 10 concordant", async () => {
    const r = run(await all()), e = ev(r, "EV-02");
    expect(e).toMatchObject({ status: "unsupported", bridge: { opening: "2500", utilisations: "500", reprises: "1000", computedClosing: "1000", difference: "0" }, estimateDifferenceCents: "0" });
    expect(e.movements.find(m => m.key === "M03")).toMatchObject({ kind: "reprise", pieceRef: "", supported: false });
    const x = r.exceptions.find(x => x.id === "MOVEMENT_UNSUPPORTED:EV-02:M03")!;
    expect(x).toMatchObject({ label: "Reprise sans justificatif — EV-02 Garanties clients", amount: { kind: "known", value: { amount: "10.00" } } });
    expect(x.message).toContain("aucune pièce référencée");
    expect(x.message).toContain("PCG art. 323-12");
  });
  it("engagement hors grand livre : sans écriture, sans pont, dans la population, rapproché de l’annexe (200 = 200)", async () => {
    const r = run(await all()), e = ev(r, "EV-03");
    expect(e).toMatchObject({ state: "nouveau", status: "no_entry", inScope: true, bridge: null, account: null, commitmentCents: "20000",
      annex: { status: "present", expected: true, lines: [{ rubric: "engagement_donne", publishedCents: "20000", referenceCents: "20000", referenceKind: "commitment", differenceCents: "0" }] } });
    expect(r.totals.noEntry).toBe(2);
  });
  it("risque clôturé : 40 − 35 utilisés − 5 repris = 0, clos pendant l’exercice, aucune estimation requise", async () => {
    const r = run(await all()), e = ev(r, "EV-04");
    expect(e).toMatchObject({ state: "clos", status: "closed", closedDate: "2026-06-30", bridge: { opening: "4000", utilisations: "3500", reprises: "500", computedClosing: "0", difference: "0" }, findings: [] });
    expect(e.chronology.map(c => c.kind)).toEqual(["naissance", "piece", "decision", "mouvement", "mouvement", "cloture"]);
  });
  it("estimation absente : non concluant, jamais réputée égale à la provision de 15", async () => {
    const r = run(await all()), e = ev(r, "EV-05");
    expect(e).toMatchObject({ status: "inconclusive", retainedEstimateCents: null, estimateDifferenceCents: null, bridge: { computedClosing: "1500" } });
    expect(r.exceptions.find(x => x.id === "ESTIMATE_MISSING:EV-05")).toMatchObject({ amount: { kind: "unknown", reason: "Estimation documentée absente" } });
  });
  it("passif éventuel absent de l’annexe : écart événement / annexe à examiner, sans conclusion sur la probabilité", async () => {
    const r = run(await all()), x = r.exceptions.find(x => x.id === "ANNEX_MISSING:EV-06")!;
    expect(ev(r, "EV-06")).toMatchObject({ status: "annex_gap", bridge: null, annex: { status: "missing", expected: true }, retainedEstimateCents: "1200" });
    expect(x.message).toContain("sauf probabilité faible");
    expect(x.message).toContain("appréciation humaine");
  });
  it("événement né après la clôture : hors population avec son motif", async () => {
    expect(ev(run(await all()), "EV-07")).toMatchObject({ state: "exclu", inScope: false, status: "excluded", findings: [] });
  });
  it("cadrage et tableau des provisions : 95 + 35 − 40 − 15 = 75 = grand livre ; comptes cadrés ; décompte et issue", async () => {
    const r = run(await all());
    expect(r.totals).toEqual({ opening: "9500", dotations: "3500", utilisations: "4000", reprises: "1500", computedClosing: "7500", declaredClosing: "7500", ledgerOpening: "9500", ledgerClosing: "7500", events: 7, inScope: 6, excluded: 1, noEntry: 2 });
    expect(r.accounts.map(a => [a.account, a.status, a.registerOpeningCents, a.registerClosingCents, a.ledgerClosingCents, a.ledgerBridgeDifference])).toEqual([["1511", "framed", "7000", "5000", "5000", "0"], ["1512", "framed", "2500", "1000", "1000", "0"], ["1522", "framed", "0", "1500", "1500", "0"]]);
    expect(r.categories).toEqual([{ category: "risques", label: "Provisions pour risques (151)", opening: "9500", dotations: "2000", utilisations: "4000", reprises: "1500", closing: "6000" },
      { category: "charges", label: "Provisions pour charges (152)", opening: "0", dotations: "1500", utilisations: "0", reprises: "0", closing: "1500" }]);
    expect(codes(r)).toEqual(["ANNEX_MISSING:EV-06", "ESTIMATE_DIFFERENCE:EV-01", "ESTIMATE_MISSING:EV-05", "MOVEMENT_UNSUPPORTED:EV-02"]);
    expect(provisionOutcome(r)).toBe("exceptions_detected");
    expect(formatCents("3000", { signed: true })).toBe("+30,00 €");
  });
});

describe("PV-1602 ponts, comparaisons et sources", () => {
  it("sans journal des mouvements : provision de clôture inconnue (jamais l’ouverture), estimation non comparée", async () => {
    const r = run(await all({ pv_movements: undefined }));
    expect(ev(r, "EV-01")).toMatchObject({ bridge: { computedClosing: null, dotations: null, journal: false }, estimateDifferenceCents: null, status: "inconclusive" });
    expect(r.totals.computedClosing).toBeNull();
    expect(r.accounts.every(a => a.status === "incomplete" && a.closingDifference === null && a.ledgerBridgeDifference === null)).toBe(true);
    expect(r.exceptions.filter(e => e.code === "BRIDGE_UNKNOWN").map(e => e.eventId)).toEqual(["EV-01", "EV-02", "EV-04", "EV-05"]);
  });
  it("pont ≠ clôture déclarée, et grand livre non cadré : différences connues à expliquer", async () => {
    const reg = REGISTER_ROWS.map(r => r[0] === "EV-01" ? r.map((c, i) => i === 8 ? "55,00" : c) : r);
    const ledger = LEDGER_ROWS.map(l => l[0] === "1511" ? ["1511", "52,00", "2026-12-31", "70,00", "Provisions pour litiges"] : l);
    const r = run(await all({ pv_register: registerCsv(reg), pv_ledger: ledgerCsv([...ledger, ["1518", "8,00", "2026-12-31", "8,00", "Autres provisions pour risques"]]) }));
    expect(r.exceptions.find(x => x.id === "BRIDGE_DIFFERENCE:EV-01")).toMatchObject({ amount: { kind: "known", value: { amount: "5.00" } } });
    expect(r.exceptions.find(x => x.id === "FRAMING_DIFFERENCE:1511")).toMatchObject({ amount: { kind: "known", value: { amount: "2.00" } } });
    expect(r.exceptions.find(x => x.id === "LEDGER_BRIDGE_DIFFERENCE:1511")!.message).toContain("différence +2,00");
    // A ledger account without any event of the register: the register's completeness is to be examined.
    expect(r.exceptions.find(x => x.id === "FRAMING_DIFFERENCE:1518")!.message).toContain("aucun événement du registre sur ce compte");
    expect(r.exceptions.find(x => x.id === "OPENING_FRAMING_DIFFERENCE:1518")).toMatchObject({ amount: { kind: "known", value: { amount: "8.00" } } });
  });
  it("compte du registre absent du grand livre : cadrage incomplet, solde inconnu, jamais nul", async () => {
    const r = run(await all({ pv_ledger: ledgerCsv(LEDGER_ROWS.filter(l => l[0] !== "1522")) }));
    expect(r.accounts.find(a => a.account === "1522")).toMatchObject({ status: "ledger_missing", ledgerClosingCents: null, closingDifference: null });
    expect(r.exceptions.find(x => x.id === "FRAMING_INCOMPLETE:1522")).toMatchObject({ amount: { kind: "unknown" } });
  });
  it("clos avec solde, traitement sans provision avec solde, décision sans pièce", async () => {
    const reg = REGISTER_ROWS.map(r => r[0] === "EV-04" ? r.map((c, i) => i === 15 ? "" : c) : r);
    const moves = MOVEMENT_ROWS.filter(m => m[0] !== "M05");
    const r = run(await all({ pv_register: registerCsv(reg), pv_movements: movementCsv(moves), pv_ledger: ledgerCsv(LEDGER_ROWS.map(l => l[0] === "1511" ? ["1511", "55,00", "2026-12-31", "70,00", "Provisions pour litiges"] : l)) }));
    expect(r.exceptions.find(x => x.id === "CLOSED_WITH_BALANCE:EV-04")).toMatchObject({ amount: { kind: "known", value: { amount: "5.00" } } });
    expect(r.exceptions.find(x => x.id === "BRIDGE_DIFFERENCE:EV-04")).toMatchObject({ amount: { kind: "known", value: { amount: "-5.00" } } });
    expect(r.exceptions.find(x => x.id === "DECISION_UNSUPPORTED:EV-04")!.message).toContain("sans pièce de décision citée");
    const contingent = REGISTER_ROWS.map(r => r[0] === "EV-02" ? r.map((c, i) => i === 5 ? "passif_eventuel" : i === 8 ? "" : c) : r);
    const r2 = run(await all({ pv_register: registerCsv(contingent) }));
    expect(r2.exceptions.find(x => x.id === "TREATMENT_BALANCE_MISMATCH:EV-02")).toMatchObject({ amount: { kind: "known", value: { amount: "10.00" } } });
  });
  it("annexe : montant ≠ référence, rubrique ≠ traitement, préjudice invoqué, ligne sans événement au registre, annexe absente", async () => {
    const annex = [["A01", "45,00", "2027-03-10", "EV-01", "provision", "publie", ""], ["A03", "0,00", "2027-03-10", "EV-03", "passif_eventuel", "non_chiffre", ""],
      ["A06", "0,00", "2027-03-10", "EV-06", "passif_eventuel", "non_fourni_prejudice", ""], ["A09", "7,00", "2027-03-10", "EV-09", "engagement_donne", "publie", ""]];
    const r = run(await all({ pv_annex: annexCsv(annex) }));
    expect(r.exceptions.find(x => x.id === "ANNEX_AMOUNT_DIFFERENCE:EV-01:A01")).toMatchObject({ amount: { kind: "known", value: { amount: "-5.00" } }, sensitive: false });
    expect(r.exceptions.find(x => x.id === "ANNEX_RUBRIC_MISMATCH:EV-03:A03")).toBeDefined();
    expect(r.exceptions.find(x => x.id === "ANNEX_NOT_PROVIDED:EV-06:A06")!.message).toContain("préjudice sérieux");
    expect(r.annexOrphans).toEqual([expect.objectContaining({ eventId: "EV-09", publishedCents: "700" })]);
    expect(r.exceptions.find(x => x.id === "ANNEX_EVENT_UNKNOWN:A09")!.message).toContain("exhaustivité du registre");
    const none = run(await all({ pv_annex: undefined }));
    expect(none.exceptions.find(x => x.code === "ANNEX_SOURCE_MISSING")!.message).toContain("2 événement(s) sans écriture");
    expect(ev(none, "EV-06").annex.status).toBe("not_provided");
  });
  it("informations des avocats non obtenues avec des litiges : incertitude citant NEP 501, sans issue déduite", async () => {
    const batches = await all();
    const r = run(batches, { lawyers: { status: "not_obtained", reason: "Demande adressée, réponses non reçues" } });
    expect(r.exceptions.find(x => x.code === "LAWYERS_INFO_MISSING")!.message).toContain("NEP 501 §§ 07-08");
    expect(r.lawyers).toEqual({ status: "not_obtained", reason: "Demande adressée, réponses non reçues" });
  });
  it("estimations non fournies : comparaison non réalisée ; passif éventuel sans estimation", async () => {
    const r = run(await all({ pv_estimates: undefined }));
    expect(r.exceptions.filter(x => x.code === "ESTIMATE_MISSING").map(x => x.eventId)).toEqual(["EV-01", "EV-02", "EV-05"]);
    expect(ev(r, "EV-06").retainedEstimateCents).toBeNull();
  });
});

describe("PV-1603 qualification des sources (refus avec localisation)", () => {
  const refused = async (type: ProvisionSourceType, text: string, code: string, coverage?: { from: string; to: string }) => {
    const batch = await previewImport(new File([text], type + ".csv", { type: "text/csv" }), pvScope, pvMapping(type, coverage), actor, type, "provisions.register");
    try { assertProvisionBatch(batch, pvPeriod); throw new Error("accepted"); } catch (e) { expect(e).toBeInstanceOf(ProvisionSourceError); expect((e as ProvisionSourceError).code).toBe(code); return e as ProvisionSourceError; }
  };
  it("traitement, type, provision sans compte, provision avec traitement hors bilan, drapeau de confidentialité", async () => {
    await refused("pv_register", registerCsv([REGISTER_ROWS[0].map((c, i) => i === 5 ? "probable" : c)]), "PV_TREATMENT_INVALID");
    await refused("pv_register", registerCsv([REGISTER_ROWS[0].map((c, i) => i === 4 ? "inconnu" : c)]), "PV_EVENT_TYPE_INVALID");
    await refused("pv_register", registerCsv([REGISTER_ROWS[0].map((c, i) => i === 7 ? "" : c)]), "PV_ACCOUNT_REQUIRED");
    await refused("pv_register", registerCsv([REGISTER_ROWS[2].map((c, i) => i === 8 ? "5,00" : c)]), "PV_TREATMENT_PROVISION_INCONSISTENT");
    await refused("pv_register", registerCsv([REGISTER_ROWS[0].map((c, i) => i === 17 ? "peut-être" : c)]), "PV_CONFIDENTIAL_FLAG_INVALID");
    await refused("pv_register", registerCsv([REGISTER_ROWS[1].map((c, i) => i === 9 ? "3,00" : c)]), "PV_COMMITMENT_TREATMENT_INVALID");
  });
  it("une valeur confidentielle n’est jamais renvoyée dans la localisation d’un refus", async () => {
    const e = await refused("pv_register", registerCsv([REGISTER_ROWS[0].map((c, i) => i === 10 ? "" : c)]), "PV_OBLIGATION_REQUIRED");
    expect(e.locator).toMatchObject({ row: 2, column: "Obligation" });
    expect(e.locator?.value).toBeUndefined();
  });
  it("mouvements : période de l’exercice entier, sens, compte ; estimations : pièce et estimation retenue unique", async () => {
    await refused("pv_movements", PV_CSV.pv_movements, "PV_COVERAGE_EXERCISE_REQUIRED", { from: "2026-06-01", to: "2026-12-31" });
    await refused("pv_movements", movementCsv([MOVEMENT_ROWS[0].map((c, i) => i === 4 ? "provision" : c)]), "PV_MOVEMENT_KIND_INVALID");
    await refused("pv_movements", movementCsv([MOVEMENT_ROWS[0].map((c, i) => i === 2 ? "2027-01-05" : c)]), "PV_MOVEMENT_OUTSIDE_EXERCISE");
    await refused("pv_estimates", estimateCsv([ESTIMATE_ROWS[0].map((c, i) => i === 8 ? "" : c)]), "PV_ESTIMATE_PIECE_REQUIRED");
    const twice = ESTIMATE_ROWS.map(e => e[0] === "E01" ? e.map((c, i) => i === 5 ? "oui" : c) : e);
    await expect(all({ pv_estimates: estimateCsv(twice) }).then(run)).rejects.toMatchObject({ code: "PV_ESTIMATE_RETAINED_DUPLICATE" });
  });
  it("mouvement ou estimation d’un événement absent du registre : refusé avec sa ligne ; annexe : statut de montant cohérent", async () => {
    await expect(all({ pv_movements: movementCsv([...MOVEMENT_ROWS, ["M99", "1,00", "2026-12-31", "EV-99", "dotation", "1518", "X", ""]]) }).then(run)).rejects.toMatchObject({ code: "PV_EVENT_UNKNOWN", locator: { row: 8, value: "EV-99" } });
    await expect(all({ pv_movements: movementCsv([...MOVEMENT_ROWS, ["M98", "1,00", "2026-12-31", "EV-01", "dotation", "1518", "X", ""]]) }).then(run)).rejects.toMatchObject({ code: "PV_MOVEMENT_ACCOUNT_MISMATCH" });
    await refused("pv_annex", annexCsv([ANNEX_ROWS[0].map((c, i) => i === 5 ? "non_chiffre" : c)]), "PV_ANNEX_AMOUNT_STATUS_INCONSISTENT");
    await refused("pv_ledger", ledgerCsv([["4011", "1,00", "2026-12-31", "0,00", ""]]), "PV_LEDGER_ACCOUNT_INVALID");
  });
});

describe("PV-1604 masquage confidentiel du résultat (projection serveur)", () => {
  it("événement confidentiel : description, contrepartie, scénarios, estimation et différence retirés ; ponts comptables conservés", async () => {
    const r = run(await all()), m = redactProvisionResult(r), e = ev(m, "EV-01");
    expect(e).toMatchObject({ masked: true, obligation: null, counterparty: null, method: null, decision: null, estimates: [], estimateCount: 3, retainedEstimateCents: null, estimateDifferenceCents: null, bridge: { computedClosing: "5000" } });
    expect(e.pieces.find(p => p.key === "LET-AVOCAT-01")!.label).toBeNull();
    expect(e.chronology.filter(c => c.kind === "estimation").every(c => c.label.includes("Masqué"))).toBe(true);
    expect(JSON.stringify(m)).not.toContain("Client Alpha");
    expect(JSON.stringify(m)).not.toContain("Issue défavorable");
    expect(JSON.stringify(m.exceptions)).not.toContain("80,00");
    expect(m.exceptions.find(x => x.id === "ESTIMATE_DIFFERENCE:EV-01")!.amount).toEqual({ kind: "unknown", reason: "Montant masqué — habilitation confidentielle requise" });
    // A non-confidential event stays readable.
    expect(ev(m, "EV-02")).toMatchObject({ masked: false, obligation: "Garantie contractuelle de 24 mois sur les ventes", retainedEstimateCents: "1000" });
  });
});
