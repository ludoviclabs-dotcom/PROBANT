import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { eventDenominatorText } from "../closing-events";
import { CL_DOSSIER, type ClosingHarness, type ClosingViewBody } from "./closing-harness";
import { addSolo } from "./closing-c14-fixtures";
import { dossierMap, eventsHarness, eventsProgramme, read } from "./closing-events-fixtures";
import type { EventMapInput } from "../transversal-events";

/**
 * C14 suite — décisions de revue sur les effets des événements transversaux, journalisées dans le dossier de clôture.
 * Attendus posés à la main avant exécution, sur la recette C11 (docs/recette/c11/RECETTE.md) : F-101 FAE +1 000,00 ; F-102 PCA −2 000,00 ;
 * AV-106 avoir à établir −500,00 ; FS-202 FNP −1 000,00 ; pont initial : hausse 1 000,00, baisse 3 500,00, tout « en attente ».
 */
const effectOf = (v: ClosingViewBody, invoice: string) => v.projection.findings.events.effects.find(x => x.invoiceId === invoice)!;
const stage = (v: ClosingViewBody, direction: "increase" | "decrease") => v.projection.findings.events.stages.find(st => st.direction === direction)!;
const eventCodes = (v: ClosingViewBody) => v.evaluation.blockers.filter(b => b.code.startsWith("EVENT_")).map(b => b.code + ":" + v.projection.findings.events.effects.find(x => x.eventId === b.ref.id)?.invoiceId);
const money = (amount: string) => ({ amount, currency: "EUR" as const });
async function decide(h: ClosingHarness, command: "correct_event_effect" | "assess_event_effect", invoice: string, extra: Record<string, unknown> = {}, session = "preparer") {
  const x = effectOf(await h.view(session), invoice);
  return h.command({ command, eventId: x.eventId, basisHash: x.basisHash, text: command === "correct_event_effect" ? "Écriture d’inventaire passée par l’entité" : "Effet non corrigé apprécié au regard du résultat", ...extra } as never, session);
}
const without = (invoice: string, runId?: string) => (input: EventMapInput): EventMapInput => ({ ...input, cutoffEvents: input.cutoffEvents.filter(f => !(f.invoiceId === invoice && (!runId || f.run.runId === runId))) });

describe("C14 suite — décisions de revue des effets d’événements dans le dossier", { timeout: 60_000 }, () => {
  it("correction partielle de F-101 : 600,00 corrigés sur 1 000,00, reste résiduel 400,00 ; étape et pont lus par la règle C05", async () => {
    const h = eventsHarness(dossierMap());
    await eventsProgramme(h);
    const pc = await h.piece("Écriture FAE F-101 passée au 31/03/2026");
    const r = await decide(h, "correct_event_effect", "F-101", { citations: [{ pieceVersionId: pc }], correctedAmount: money("600.00") });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const v = await h.view(), f101 = effectOf(v, "F-101");
    // Attendu : 1 000,00 − 600,00 = 400,00 résiduel ; rien en attente pour F-101.
    expect([f101.reviewStatus, f101.stage, f101.bridge!.pendingCents, f101.bridge!.correctedCents, f101.bridge!.residualCents, f101.bridge!.proposedCents]).toEqual(["corrige", "corrected", 0, 60000, 40000, 0]);
    expect(f101.decisions).toMatchObject([{ kind: "correction", state: "appliquee", correctedCents: 60000, reasons: [], citations: [{ pieceVersionId: pc }] }]);
    // Pont du dossier : hausse 0 en attente, 600,00 corrigé, 400,00 résiduel ; la baisse reste 3 500,00 en attente.
    expect([stage(v, "increase").pendingCents, stage(v, "increase").correctedCents, stage(v, "increase").residualCents]).toEqual([0, 60000, 40000]);
    expect([stage(v, "decrease").pendingCents, stage(v, "decrease").correctedCents]).toEqual([350000, 0]);
    expect(v.projection.denominators.events).toMatchObject({ byStage: { pending: 3, proposed: 0, corrected: 1 }, decided: 1, toReexamine: 0, orphanDecisions: 0 });
    expect(eventCodes(v)).toEqual(["EVENT_EFFECT_UNTREATED:FS-202", "EVENT_EFFECT_UNTREATED:F-102", "EVENT_EFFECT_UNTREATED:AV-106"]);
    const indicator = v.evaluation.indicators.find(i => i.id === "evenements")!;
    expect([indicator.numerator, indicator.denominator, indicator.segments.find(sg => sg.label.startsWith("F-101"))!.state]).toEqual([1, 4, "partial"]);
    expect(eventDenominatorText(v.projection.denominators.events, null)).toContain("étape C05 : 3 en attente, 0 apprécié(s) non corrigé(s), 1 corrigé(s)");
    expect(v.journal.at(-1)!.label).toMatch(/^Effet d’événement F-101 \(FAE, compté une fois 1 000,00 €\) corrigé partiellement \(600,00 €\) — Écriture FAE F-101 passée au 31\/03\/2026 v1 — carte [a-f0-9]{12}…$/);
    // Catégorie distincte : aucune anomalie journalisée n'est créée ni corrigée.
    expect(v.projection.findings.totals).toMatchObject({ total: 0, knownCorrected: { amount: "0.00" } });
    // Une correction applicable ne se double pas ; l'appréciation d'un effet corrigé est refusée (comme pour une anomalie).
    expect((await decide(h, "correct_event_effect", "F-101", { citations: [{ pieceVersionId: pc }] })).body.error).toBe("CL_EVENT_EFFECT_ALREADY_CORRECTED");
    expect((await decide(h, "assess_event_effect", "F-101", {}, "reviewer")).body.error).toBe("CL_EVENT_EFFECT_ALREADY_CORRECTED");
  });

  it("refus serveur : effet lu périmé (409), montant partiel hors bornes, déclaration seule, événement sans effet, carte non lue, permission", async () => {
    const h = eventsHarness(dossierMap());
    await eventsProgramme(h);
    const pc = await h.piece("Écriture FNP FS-202"), rep = await h.piece("Lettre de la direction", "declaration_direction");
    const f202 = effectOf(await h.view(), "FS-202"), cite = [{ pieceVersionId: pc }];
    const stale = await h.command({ command: "correct_event_effect", eventId: f202.eventId, basisHash: "0".repeat(64), text: "Correction", citations: cite });
    expect([stale.status, stale.body.error]).toEqual([409, "CL_EVENT_EFFECT_STALE"]);
    // Partielle : strictement entre 0 et l'effet compté une fois (1 000,00).
    for (const amount of ["1000.00", "1200.00", "0.00", "-100.00"]) expect((await decide(h, "correct_event_effect", "FS-202", { citations: cite, correctedAmount: money(amount) })).body.error, amount).toBe("CL_CORRECTED_AMOUNT_INVALID");
    expect((await decide(h, "correct_event_effect", "FS-202", { citations: [{ pieceVersionId: rep }] })).body.error).toBe("CL_REPRESENTATION_ONLY");
    const fs203 = (await h.view()).projection.findings.events.withoutEffect[0];
    expect((await h.command({ command: "assess_event_effect", eventId: fs203.eventId, basisHash: "a".repeat(64), text: "Appréciation" }, "reviewer")).body.error).toBe("CL_EVENT_EFFECT_UNKNOWN");
    expect((await decide(h, "assess_event_effect", "FS-202", {}, "preparer")).status).toBe(403);
    const blind = eventsHarness(() => { throw new ApiError("PAYABLES_DURABLE_DISABLED", "fermé", 503); });
    await eventsProgramme(blind);
    expect((await blind.command({ command: "assess_event_effect", eventId: f202.eventId, basisHash: f202.basisHash!, text: "Appréciation" }, "reviewer")).body.error).toBe("CL_EVENT_MAP_UNREAD");
    // Rien n'a été journalisé par ces refus.
    expect((await h.view()).projection.findings.events.effects.every(x => !x.decisions.length)).toBe(true);
  });

  it("appréciation : par une autre personne (non corrigé, apprécié), en relecture personnelle nommée (condition de revue professionnelle), jamais par le préparateur des feuilles", async () => {
    // Profil solo : les feuilles sont préparées par la personne qui relit ; une autre identité (relecteur) reste distincte.
    const h = eventsHarness(dossierMap(), [], { preparedBy: "proprietaire-local" });
    await eventsProgramme(h);
    addSolo(h);
    expect((await decide(h, "assess_event_effect", "FS-202", {}, "reviewer")).status).toBe(200);
    expect((await decide(h, "assess_event_effect", "AV-106", {}, "solo")).status).toBe(200);
    const v = await h.view();
    // Attendu : baisse 3 500,00 = 1 000,00 (FS-202) + 500,00 (AV-106) appréciés non corrigés + 2 000,00 (F-102) en attente.
    expect([stage(v, "decrease").pendingCents, stage(v, "decrease").proposedCents, stage(v, "decrease").correctedCents]).toEqual([200000, 150000, 0]);
    expect(effectOf(v, "FS-202")).toMatchObject({ reviewStatus: "valide", stage: "proposed", decisions: [{ kind: "assessment", state: "appliquee", assessedBy: "autre_personne" }] });
    expect(effectOf(v, "AV-106").decisions).toMatchObject([{ kind: "assessment", state: "appliquee", assessedBy: "personnelle" }]);
    expect(eventCodes(v)).toEqual(["EVENT_EFFECT_UNTREATED:F-101", "EVENT_EFFECT_UNTREATED:F-102"]);
    expect(v.evaluation.professionalGaps.filter(g => g.code === "EVENT_EFFECT_ASSESSED_PERSONALLY").map(g => g.ref.id)).toEqual([effectOf(v, "AV-106").eventId]);
    // Le relecteur a préparé les feuilles qui portent l'effet : il ne peut pas l'apprécier lui-même.
    const own = eventsHarness(dossierMap(), [], { preparedBy: "reviewer-cl" });
    await eventsProgramme(own);
    expect((await decide(own, "assess_event_effect", "FS-202", {}, "reviewer")).body.error).toBe("CL_SELF_REVIEW_FORBIDDEN");
  });

  it("péremption ciblée : pièce citée remplacée ou effet changé → « à réexaminer » sans effacement ; une nouvelle décision s’applique ; les autres effets ne bougent pas", async () => {
    let map = dossierMap();
    const h = eventsHarness(() => read(map));
    await eventsProgramme(h);
    const pc = await h.piece("Écriture FAE F-101");
    expect((await decide(h, "correct_event_effect", "F-101", { citations: [{ pieceVersionId: pc }] })).status).toBe(200);
    expect((await decide(h, "assess_event_effect", "FS-202", {}, "reviewer")).status).toBe(200);
    // 1. La pièce citée est remplacée (v2) : la correction de F-101 est à réexaminer ; l'appréciation de FS-202 tient.
    await h.piece("Écriture FAE F-101", "document", "Version corrigée de l’écriture\n", "PC-01");
    let v = await h.view();
    expect(effectOf(v, "F-101")).toMatchObject({ stage: "pending", decisions: [{ kind: "correction", state: "a_reexaminer", reasons: ["pièce citée remplacée depuis"] }] });
    expect(effectOf(v, "FS-202")).toMatchObject({ stage: "proposed", decisions: [{ state: "appliquee" }] });
    expect(eventCodes(v)).toEqual(["EVENT_EFFECT_DECISION_STALE:F-101", "EVENT_EFFECT_UNTREATED:F-102", "EVENT_EFFECT_UNTREATED:AV-106"]);
    expect(v.projection.denominators.events).toMatchObject({ decided: 1, toReexamine: 1 });
    expect((await decide(h, "correct_event_effect", "F-101", { citations: [{ pieceVersionId: "PC-01-v2" }] })).status).toBe(200);
    expect(effectOf(await h.view(), "F-101")).toMatchObject({ stage: "corrected", decisions: [{ state: "appliquee", citations: [{ pieceVersionId: "PC-01-v2" }] }] });
    // 2. La carte change pour F-101 seulement (RPNE retirée : une seule observation porteuse) : la correction est à réexaminer, FS-202 inchangée.
    const before = effectOf(await h.view(), "F-101").basisHash;
    map = dossierMap(without("F-101", "RUN-RPNE"));
    v = await h.view();
    expect(effectOf(v, "F-101")).toMatchObject({ countedCents: 100000, contributors: 1, stage: "pending", decisions: [{ state: "a_reexaminer", reasons: ["effet modifié depuis la décision (montant, sens ou feuilles sources)"] }] });
    expect(effectOf(v, "F-101").basisHash).not.toBe(before);
    expect(effectOf(v, "FS-202")).toMatchObject({ stage: "proposed", decisions: [{ state: "appliquee" }] });
    // La décision ancienne reste dans le journal ; une décision sur l'effet ancien est refusée (409), sur l'effet courant acceptée.
    expect((await h.command({ command: "correct_event_effect", eventId: effectOf(v, "F-101").eventId, basisHash: before!, text: "Correction", citations: [{ pieceVersionId: "PC-01-v2" }] })).status).toBe(409);
    expect((await decide(h, "correct_event_effect", "F-101", { citations: [{ pieceVersionId: "PC-01-v2" }] })).status).toBe(200);
    expect(v.journal.filter(l => l.type === "correct_event_effect")).toHaveLength(2);
    // 3. L'événement AV-106 apprécié disparaît de la carte : décision orpheline listée, à réexaminer, sans blocage (aucune décision n'est plus possible).
    expect((await decide(h, "assess_event_effect", "AV-106", {}, "reviewer")).status).toBe(200);
    map = dossierMap(input => without("AV-106")(without("F-101", "RUN-RPNE")(input)));
    v = await h.view();
    expect(v.projection.findings.events.orphanDecisions).toMatchObject([{ invoiceId: "AV-106", reason: "Événement absent de la carte ou sans candidat", decisions: [{ kind: "assessment", state: "a_reexaminer", reasons: ["plus d’effet déterminé pour cet événement dans la carte"] }] }]);
    expect(eventCodes(v)).toEqual(["EVENT_EFFECT_UNTREATED:F-102"]);
    expect(v.projection.denominators.events).toMatchObject({ countedEffects: 3, orphanDecisions: 1 });
    expect(eventDenominatorText(v.projection.denominators.events, null)).toContain("1 décision(s) sans effet dans la carte");
  });

  it("carte illisible après décision : décisions conservées, non vérifiables ; feuilles Achats exécutées observées → effets inconnus, travail restant", async () => {
    let fail = false;
    const h = eventsHarness(() => { if (fail) throw new ApiError("PAYABLE_STATE_LIMIT", "volumineux", 413); return read(dossierMap()); });
    await eventsProgramme(h);
    expect((await decide(h, "assess_event_effect", "FS-202", {}, "reviewer")).status).toBe(200);
    fail = true;
    const v = await h.view(), ev = v.projection.findings.events;
    expect(ev).toMatchObject({ status: "non_lue", effects: [], orphanDecisions: [{ invoiceId: "FS-202", decisions: [{ state: "non_verifiable" }] }] });
    expect(v.projection.denominators.events).toMatchObject({ countedEffects: null, decided: null, orphanDecisions: 1 });
    expect(v.evaluation.blockers.find(b => b.code === "EVENT_MAP_UNREAD")!.label).toBe("Carte des événements non lue (Historique Achats et Clients trop volumineux pour la carte) alors que 3 feuille(s) Achats ou Clients et ventes exécutée(s) sont observées : effets inconnus");
    expect(eventDenominatorText(v.projection.denominators.events, ev.reason)).toBe("Effets d’événements transversaux non lus : Historique Achats et Clients trop volumineux pour la carte — inconnus, jamais comptés pour zéro · 1 décision(s) journalisée(s) non vérifiable(s)");
  });

  it("export : décisions, pièces de correction et pont C05 dans le JSON, le HTML et le CSV des constats", async () => {
    const h = eventsHarness(dossierMap());
    await eventsProgramme(h);
    const pc = await h.piece("Écriture PCA F-102");
    expect((await decide(h, "correct_event_effect", "F-102", { citations: [{ pieceVersionId: pc }], correctedAmount: money("1500.00") })).status).toBe(200);
    const v = await h.view(), snapshot = v.projection.hash, get = (format: string) => h.handlers.GET(h.request("preparer", "GET", undefined, CL_DOSSIER, "&operation=export&format=" + format + "&snapshot=" + snapshot));
    const json = await (await get("json")).json();
    expect(json.projection.findings.events.effects.find((x: { invoiceId: string }) => x.invoiceId === "F-102")).toMatchObject({ stage: "corrected", bridge: { correctedCents: 150000, residualCents: 50000 } });
    const html = await (await get("html")).text();
    expect(html).toContain("Correction partielle 1 500,00 € — s’applique");
    expect(html).toContain("Corrigé partiellement — reste résiduel");
    const csv = await (await get("findings_csv")).text();
    expect(csv.split("\n").find(l => l.startsWith("effet_evenement,F-102") || l.startsWith("effet_evenement;F-102"))).toContain("Écriture PCA F-102 v1");
  });
});
