import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { eventDenominatorText, eventMapRead } from "../closing-events";
import { CL_DOSSIER, createClosingHarness } from "./closing-harness";
import { sheet } from "./closing-c14-fixtures";
import { facts, RPNE, SPEC } from "./c11-fixtures";
import { dossierMap, eventSheets, eventsHarness, eventsProgramme, EV_PERIOD, EV_PERIOD_ID, evScope, read } from "./closing-events-fixtures";

/**
 * C14 suite — effets des événements transversaux (carte C11, projection C05) versés dans le dossier de clôture, en lecture seule.
 * Attendus posés à la main avant exécution, à partir de docs/recette/c11/RECETTE.md (pont C05 : hausse 1 000,00 ; baisse 3 500,00 ;
 * 7 observations porteuses pour 4 effets) et de son cas 8 (FS-203 : candidat FNP 400,00 suspendu par la RPNE non concluante, aucun effet).
 */
const NONE = { status: "non_lue", mapHash: null, events: null, observations: null, candidateObservations: null, countedEffects: null, withoutEffect: null, divergentEvents: null, staleObservations: null, byStage: null, outsideProgramme: null, discordantSources: null };

describe("C11 1.1.0 — lecture C05 de chaque effet dans la carte", () => {
  it("un effet par événement retenu, ses constats porteurs à leur version de feuille, son groupe et son pont C05 lus dans la projection partagée", () => {
    const map = dossierMap(), f101 = map.events.find(e => e.invoiceId === "F-101")!;
    expect(map.version).toBe("1.1.0");
    // Cas 1 : FAE 1 000,00 HT observé par Achats et RPNE (même identité) → un groupe déterminé, deux constats, compté une fois, en attente.
    expect(f101.effect!.contributions.map(c => [c.procedureId, c.runId, c.version])).toEqual([["payables.purchases", "RUN-ACH", 1], ["payables.rpne", "RUN-RPNE", 1]]);
    expect(f101.effect!.exposure.clusters).toMatchObject([{ status: "determined", retainedCents: 100000, reviewStage: "pending", correctedCents: null }]);
    expect(f101.effect!.exposure.stages).toMatchObject([{ target: "resultat", direction: "increase", detectedCents: 200000, exactRepeatsCents: 100000, initialCents: 100000, pendingCents: 100000, correctedCents: 0, residualCents: 0 }]);
    // Aucun effet pour le cas 8 : rien à lire en C05.
    expect(map.events.find(e => e.invoiceId === "FS-203")!.effect).toBeNull();
  });
});

describe("C14 suite — effets des événements transversaux dans le dossier de clôture", { timeout: 60_000 }, () => {
  it("recette C11 : 4 effets comptés une fois, étape « en attente », feuilles sources à leur version exacte et dans leur lignée ; le cas 8 reste sans effet", async () => {
    const map = dossierMap(), h = eventsHarness(map);
    await eventsProgramme(h);
    const v = await h.view(), ev = v.projection.findings.events;
    expect(ev.status).toBe("lue");
    expect(ev.map).toMatchObject({ version: "1.1.0", hash: map.hash, vatChain: "read" });
    // Attendus de la recette C11 (pont C05) : chaque effet compté une fois, avec son sens ; rien n'est corrigé ni résiduel. Ordre de la carte : flux, tiers, facture.
    expect(ev.effects.map(x => [x.invoiceId, x.candidate, x.direction, x.countedCents, x.stage, x.contributors])).toEqual([
      ["FS-202", "FNP", "decrease", 100000, "pending", 2], ["F-101", "FAE", "increase", 100000, "pending", 2], ["F-102", "PCA", "decrease", 200000, "pending", 2], ["AV-106", "AAE", "decrease", 50000, "pending", 1],
    ]);
    for (const x of ev.effects) expect(x.bridge).toMatchObject({ pendingCents: x.countedCents, correctedCents: 0, residualCents: 0, proposedCents: 0 });
    expect(ev.stages.map(st => [st.direction, st.pendingCents, st.correctedCents, st.residualCents])).toEqual([["decrease", 350000, 0, 0], ["increase", 100000, 0, 0]]);
    // F-102 : Achats et RPNE portent le candidat (comptés) ; Clients et ventes observe le solde ouvert, sans candidat (non compté). Chaque feuille à r1 v1, version courante de sa lignée.
    const f102 = ev.effects.find(x => x.invoiceId === "F-102")!;
    expect(f102.sources.map(s => [s.procedure, s.runId, s.version, s.observation, s.counted, s.lineage?.read, s.lineage?.assignment, s.lineage?.procedureId, s.freshness])).toEqual([
      ["payables.purchases", "RUN-ACH", 1, "candidate", true, "courante", "retenue", "P-01", "concordante"],
      ["payables.rpne", "RUN-RPNE", 1, "candidate", true, "courante", "retenue", "P-02", "concordante"],
      ["clients.sales", "RUN-CLI", 1, "observed", false, "courante", "hors_programme", null, "concordante"],
    ]);
    expect(f102.inProgramme).toBe(true);
    // Cas 8 : candidat FNP suspendu (RPNE non concluante, fenêtre incomplète) → aucun effet, montant inconnu, jamais zéro.
    expect(ev.withoutEffect).toHaveLength(1);
    const fs203 = ev.withoutEffect[0];
    expect(fs203).toMatchObject({ invoiceId: "FS-203", party: "S3", accounting: "inconclusive", candidates: ["FNP"], reason: "Candidat technique de l’événement suspendu : la procédure qui le teste n’a pas conclu" });
    expect(fs203.sources.map(s => [s.procedure, s.observation, s.counted, s.amount.kind])).toEqual([["payables.purchases", "candidate", false, "known"], ["payables.rpne", "inconclusive", false, "unknown"]]);
    expect(fs203.sources[1].reasons).toContain("FENETRE_NON_COUVERTE");
    // Dénominateurs : 11 événements (9 analysés + F-107, F-108 lus seulement comme soldes ouverts), 19 observations (14 analyses + 5 soldes ouverts), 7 porteuses, 4 effets.
    const expected = { status: "lue", mapHash: map.hash, events: 11, observations: 19, candidateObservations: 7, countedEffects: 4, withoutEffect: 1, divergentEvents: 0, staleObservations: 0,
      byStage: { pending: 4, proposed: 0, corrected: 0, dismissed: 0, undetermined: 0 }, outsideProgramme: 0, discordantSources: 0 };
    expect(v.evaluation.denominators.events).toEqual(expected);
    expect(v.projection.denominators.events).toEqual(expected);
    // Mêmes nombres que la carte C11 elle-même.
    expect([expected.countedEffects, expected.candidateObservations, expected.events]).toEqual([map.bridge.countedEffects, map.bridge.candidateObservations, map.events.length]);
    expect(eventDenominatorText(v.projection.denominators.events, ev.reason)).toBe("4 effets d’événements transversaux comptés une fois (7 observations avec candidat, 11 événements) · étape C05 : 4 en attente, 0 proposé(s), 0 corrigé(s) · 1 candidat sans effet compté — catégorie distincte des anomalies journalisées");
    // Lecture seule : aucun travail restant ni blocage n'est ajouté par la carte.
    expect(v.evaluation.blockers.some(b => /F-10|FS-20|AV-106/.test(b.label))).toBe(false);
  });

  it("à côté des anomalies journalisées, jamais additionnés : les totaux du journal restent ceux du journal", async () => {
    const h = eventsHarness(dossierMap());
    await eventsProgramme(h);
    const pc = await h.piece("Relevé fournisseur S9 au 31/03/2026");
    await h.ok({ command: "record_misstatement", procedureId: "P-02", cycle: "achats", description: "Facture S9 non provisionnée", amount: { kind: "known", value: { amount: "300.00", currency: "EUR" } }, citations: [{ pieceVersionId: pc }] });
    const v = await h.view(), f = v.projection.findings;
    // Attendu à la main : seule l'anomalie journalisée (300,00, non corrigée) entre dans les totaux du dossier ; les effets d'événements (1 000,00 et 3 500,00) n'y figurent pas.
    expect(f.totals).toMatchObject({ total: 1, uncorrected: 1, knownUncorrected: { amount: "300.00" }, knownCorrected: { amount: "0.00" }, knownResidual: { amount: "300.00" } });
    expect(f.events.effects).toHaveLength(4);
    expect(v.projection.limitations.some(l => l.startsWith("Effets des événements transversaux lus dans la carte C11") && l.includes("sans total commun"))).toBe(true);
  });

  it("cas 8 rendu concluant (RPNE : candidat d’omission) : l’effet FNP 400,00 est compté, la baisse passe à 3 900,00", async () => {
    // Attendu à la main : 3 500,00 + 400,00 = 3 900,00 ; 5 effets ; 9 observations porteuses (7 + Achats et RPNE sur FS-203) ; plus aucun candidat sans effet.
    const map = dossierMap(input => ({ ...input, cutoffEvents: input.cutoffEvents.map(f => f.invoiceId === "FS-203" && f.run.runId === "RUN-RPNE" ? facts(SPEC.c8, RPNE, { status: "omission_candidate", reasons: [] }) : f) }));
    const h = eventsHarness(map);
    await eventsProgramme(h);
    const ev = (await h.view()).projection.findings.events;
    expect(ev.effects.find(x => x.invoiceId === "FS-203")).toMatchObject({ candidate: "FNP", direction: "decrease", countedCents: 40000, contributors: 2, stage: "pending" });
    expect(ev.withoutEffect).toEqual([]);
    expect(ev.stages.find(st => st.direction === "decrease")!.pendingCents).toBe(390000);
    expect((await h.view()).projection.denominators.events).toMatchObject({ countedEffects: 5, candidateObservations: 9, withoutEffect: 0 });
  });

  it("l’étape est lue dans la projection C05, jamais redéduite : un effet corrigé partiellement garde son reste résiduel", async () => {
    // Carte modifiée à la main comme le ferait une revue C05 : F-101 corrigé pour 600,00 sur 1 000,00 → reste résiduel 400,00 (attendu : 1 000,00 − 600,00).
    const base = dossierMap(), patched = structuredClone(base) as typeof base;
    const f101 = patched.events.find(e => e.invoiceId === "F-101")!.effect!;
    f101.exposure.clusters[0] = { ...f101.exposure.clusters[0], reviewStage: "corrected", correctedCents: 60000 };
    f101.exposure.stages[0] = { ...f101.exposure.stages[0], pendingCents: 0, correctedCents: 60000, residualCents: 40000 };
    const h = eventsHarness(patched);
    await eventsProgramme(h);
    const v = await h.view(), x = v.projection.findings.events.effects.find(e => e.invoiceId === "F-101")!;
    expect([x.stage, x.countedCents, x.bridge!.pendingCents, x.bridge!.correctedCents, x.bridge!.residualCents]).toEqual(["corrected", 100000, 0, 60000, 40000]);
    expect(v.projection.denominators.events.byStage).toEqual({ pending: 3, proposed: 0, corrected: 1, dismissed: 0, undetermined: 0 });
  });

  it("une lignée par racine : une révision plus récente de la RPNE rend la lecture de la carte discordante ; un effet sans feuille retenue est signalé hors programme", async () => {
    const revised = sheet({ id: "RUN-RPNE-R2", rootId: "RUN-RPNE", revision: 2, version: 1, state: "draft", template: "payables.rpne", period: EV_PERIOD });
    const h = eventsHarness(dossierMap(), [revised]);
    await eventsProgramme(h, { purchases: false });
    const v = await h.view(), ev = v.projection.findings.events;
    const rpne = ev.effects.find(x => x.invoiceId === "F-101")!.sources.find(s => s.procedure === "payables.rpne")!;
    // La carte lit r1 v1 comme courante ; le dossier voit la révision 2 (brouillon) comme feuille courante de la lignée → discordance, rien n'est recalculé.
    expect(rpne.lineage).toMatchObject({ rootId: "RUN-RPNE", revision: 1, currentRunId: "RUN-RPNE-R2", currentRevision: 2, read: "revision_anterieure", assignment: "retenue", procedureId: "P-02" });
    expect(rpne.freshness).toBe("discordante");
    // Sources RPNE listées : F-101, F-102, FS-202 (effets) et FS-203 (sans effet) → 4 lectures discordantes. Achats hors programme (P-01 absente) :
    // AV-106 n'est observé que par Achats → 1 effet hors programme.
    expect(v.projection.denominators.events).toMatchObject({ discordantSources: 4, outsideProgramme: 1 });
    expect(ev.effects.find(x => x.invoiceId === "AV-106")!.inProgramme).toBe(false);
  });

  it("fraîcheur : la carte voit la RPNE périmée ; sans têtes de sources lues le dossier n’affirme rien, avec têtes lues et sources courantes il signale la discordance", async () => {
    const staleRpne = dossierMap(input => ({ ...input, cutoffEvents: input.cutoffEvents.map(f => f.run.runId === "RUN-RPNE" ? { ...f, run: { ...f.run, stale: true, staleReasons: ["Une source approuvée a été remplacée."] } } : f) }));
    const rpneOf = (v: Awaited<ReturnType<ReturnType<typeof eventsHarness>["view"]>>) => v.projection.findings.events.effects.find(x => x.invoiceId === "F-101")!.sources.find(s => s.procedure === "payables.rpne")!;
    // Têtes de la famille non lues (adaptateur sans têtes) : version courante, sources non vérifiables → « non vérifiée », jamais « concordante » par défaut.
    const runs = await eventSheets().runs(evScope);
    const blind = createClosingHarness({ periodId: EV_PERIOD_ID, events: async () => read(staleRpne), cycles: [{ family: "clients", runs: async () => structuredClone(runs) }] });
    await eventsProgramme(blind);
    expect(rpneOf(await blind.view())).toMatchObject({ stale: true, counted: false, freshness: "non_verifiee", lineage: { read: "courante", sourcesCurrent: null } });
    // Têtes lues, sources figées toujours en tête : le dossier dit « courante », la carte « périmée » → discordance signalée, rien n'est recalculé.
    const h = eventsHarness(staleRpne);
    await eventsProgramme(h);
    expect(rpneOf(await h.view())).toMatchObject({ stale: true, freshness: "discordante", lineage: { read: "courante", sourcesCurrent: true } });
  });

  it("carte non lue, absente ou d’un autre dossier : effets inconnus (null), jamais zéro, et la lecture du dossier reste possible", async () => {
    const disabled = eventsHarness(() => { throw new ApiError("PAYABLES_DURABLE_DISABLED", "fermé", 503); });
    await eventsProgramme(disabled);
    const v1 = await disabled.view();
    expect(v1.projection.denominators.events).toEqual(NONE);
    expect(v1.projection.findings.events).toMatchObject({ status: "non_lue", reason: "Chaîne Achats non activée sur ce serveur : carte des événements non lue", effects: [], withoutEffect: [] });
    expect(eventDenominatorText(v1.projection.denominators.events, v1.projection.findings.events.reason)).toBe("Effets d’événements transversaux non lus : Chaîne Achats non activée sur ce serveur : carte des événements non lue — inconnus, jamais comptés pour zéro");
    const empty = eventsHarness(() => eventMapRead({ map: null, reason: "Aucune feuille Clients et ventes ni Achats exécutée pour cette période : la carte n’a aucun événement à projeter." }));
    await eventsProgramme(empty);
    expect((await empty.view()).projection.denominators.events).toEqual({ ...NONE, status: "aucune_feuille" });
    const other = eventsHarness(() => read({ ...dossierMap(), scope: { ...dossierMap().scope, dossierId: "99999999-9999-4999-8999-999999999999" } }));
    await eventsProgramme(other);
    expect((await other.view()).projection.findings.events).toMatchObject({ status: "non_lue", reason: "Carte d’un autre dossier ou d’une autre période, non retenue" });
  });

  it("export : mêmes dénominateurs et mêmes effets que la vue ; une carte changée depuis la lecture est un conflit", async () => {
    let map = dossierMap();
    const h = eventsHarness(() => read(map));
    await eventsProgramme(h);
    const v = await h.view(), snapshot = v.projection.hash;
    const exported = await (await h.handlers.GET(h.request("preparer", "GET", undefined, CL_DOSSIER, "&operation=export&format=json&snapshot=" + snapshot))).json();
    expect(exported.projection.denominators.events).toEqual(v.projection.denominators.events);
    expect(exported.projection.findings.events.effects.map((x: { invoiceId: string; countedCents: number }) => [x.invoiceId, x.countedCents])).toEqual(v.projection.findings.events.effects.map(x => [x.invoiceId, x.countedCents]));
    const csv = await (await h.handlers.GET(h.request("preparer", "GET", undefined, CL_DOSSIER, "&operation=export&format=findings_csv&snapshot=" + snapshot))).text();
    expect(csv).toContain("effet_evenement");
    expect(csv).toContain("candidat_sans_effet");
    const html = await (await h.handlers.GET(h.request("preparer", "GET", undefined, CL_DOSSIER, "&operation=export&format=html&snapshot=" + snapshot))).text();
    expect(html).toContain(eventDenominatorText(v.projection.denominators.events, v.projection.findings.events.reason));
    // La carte change (cas 8 rendu concluant) : la projection change d'empreinte, l'export de l'ancien état est refusé.
    map = dossierMap(input => ({ ...input, cutoffEvents: input.cutoffEvents.map(f => f.invoiceId === "FS-203" && f.run.runId === "RUN-RPNE" ? facts(SPEC.c8, RPNE, { status: "omission_candidate", reasons: [] }) : f) }));
    const conflict = await h.handlers.GET(h.request("preparer", "GET", undefined, CL_DOSSIER, "&operation=export&format=json&snapshot=" + snapshot));
    expect(conflict.status).toBe(409);
    expect((await h.view()).projection.hash).not.toBe(snapshot);
  });
});
