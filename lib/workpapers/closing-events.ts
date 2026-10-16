import type { KnownAmount } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { reviewedCluster, summarizeStages } from "@/lib/synthesis/exposure";
import type { EffectReviewStage, EffectStage, ExposureClusterView } from "@/lib/synthesis/types";
import type { CutoffCandidate } from "./cutoff";
import type { ResolvedCitation } from "./closing-contract";
import type { EventObservation, TransversalEvent, TransversalEventMap } from "./transversal-events";
import type { LineageAssignment, LineageView, RemainingItem, ReviewBasis } from "./closing-evaluate";
import { isSuperseded, type ClosingState, type EventEffectBasis, type EventTreatment } from "./closing-journal";
import { sheetLineages, type CycleObservation } from "./closing-cycles";

/**
 * Effets des événements transversaux (carte C11) versés dans le dossier de clôture.
 * Le dossier lit la carte servie par GET /api/workpapers/payables?operation=events. L'effet compté une fois et son groupe viennent
 * de la projection C05 de la carte (lecture par événement, `restrictExposure`) : rien n'est recalculé ici. Chaque feuille qui observe
 * l'événement est replacée dans sa lignée du dossier (une lignée par racine), avec la fraîcheur de ses sources lue par l'adaptateur
 * de sa famille (closing-adapters). Catégorie distincte des anomalies journalisées : aucun total commun, aucun total entre postes ou sens.
 * Le journal du dossier porte la décision de revue de chaque effet (correction ou appréciation) ; l'étape C05 en découle par la règle
 * C05 elle-même (`reviewedCluster`, `summarizeStages`), appliquée au groupe de la carte. Une décision repose sur l'effet vu à son
 * enregistrement : un effet changé depuis, ou une pièce citée remplacée, la rend « à réexaminer », sans l'effacer.
 * Seuls des types sont importés de la carte : son moteur n'entre pas dans le paquet du navigateur.
 */
export type EventMapRead = { status: "lue"; map: TransversalEventMap; reason: string | null } | { status: "aucune_feuille" | "non_lue"; reason: string };
/** Lecteur de la carte fourni par le serveur (même runtime et mêmes règles que operation=events). */
export type EventMapReader = (request: Request, dossierId: string, periodId: string) => Promise<EventMapRead>;
export const EVENT_MAP_NOT_READ: EventMapRead = { status: "non_lue", reason: "Carte des événements transversaux non lue par ce serveur" };
/** Réponse de operation=events lue par le dossier : sans feuille exécutée, la carte est absente et son motif conservé. */
export function eventMapRead(response: { map: TransversalEventMap | null; reason: string | null }): EventMapRead {
  return response.map ? { status: "lue", map: response.map, reason: response.reason } : { status: "aucune_feuille", reason: response.reason ?? "Aucune feuille Clients et ventes ni Achats exécutée pour cette période" };
}
/** Motifs d'une carte illisible, par code d'erreur de la chaîne Achats ; tout autre code est cité tel quel. */
export const EVENT_MAP_FAILURES: Record<string, string> = {
  PAYABLES_DURABLE_DISABLED: "Chaîne Achats non activée sur ce serveur : carte des événements non lue",
  PAYABLE_STATE_LIMIT: "Historique Achats et Clients trop volumineux pour la carte",
  SESSION_INVALID: "Session expirée pendant la lecture de la carte", WORKPAPER_FORBIDDEN: "Lecture de la carte refusée pour ce dossier",
};
export const EVENT_EFFECTS_NOTICE = "Effets lus dans la carte des événements transversaux (projection C05) : catégorie distincte des anomalies journalisées du dossier, sans total commun ni addition entre postes et sens. Le dossier ne recalcule aucun effet : il journalise la correction ou l’appréciation de chacun, et l’étape C05 en découle.";
/** Feuilles dont l'exécution alimente la carte : observées par le dossier alors que la carte n'est pas lue, leurs effets sont inconnus. */
export const EVENT_MAP_PROCEDURES = ["payables.purchases", "payables.rpne", "clients.sales"] as const;

/** Où la feuille qui observe l'événement se trouve dans le dossier : sa lignée (racine), la version lue et son affectation au programme. */
export interface EventSourceLineage {
  rootId: string; revision: number; currentRunId: string; currentRevision: number; currentVersion: number;
  read: "courante" | "version_anterieure" | "revision_anterieure"; assignment: LineageAssignment; procedureId: string | null; sourcesCurrent: boolean | null;
}
export interface DossierEventSource {
  procedure: string; runId: string; version: number; href: string; observation: EventObservation["status"]; basis: EventObservation["basis"]; amount: KnownAmount; reasons: string[];
  /** Observation courante porteuse du candidat retenu : un constat C05 de l'effet. */
  counted: boolean; findingId: string | null; stale: boolean; staleReasons: string[];
  /** null : la feuille n'est pas observée par le dossier (aucune lignée). */
  lineage: EventSourceLineage | null;
  /** Fraîcheur de la carte face à celle du dossier (version courante de la lignée, sources de la famille). */
  freshness: "concordante" | "discordante" | "non_verifiee";
}
/**
 * Une décision journalisée sur un effet. « appliquée » : l'effet de la carte est celui vu à la décision et ses pièces sont à jour ;
 * « à réexaminer » : l'effet a changé ou une pièce citée a été remplacée ; « remplacée » : une correction appliquée prime sur une appréciation ;
 * « non appliquée » : la carte porte déjà une étape C05 pour ce groupe ; « non vérifiable » : la carte n'est pas lue.
 */
export interface EventDecisionView {
  kind: "correction" | "assessment"; state: "appliquee" | "a_reexaminer" | "remplacee" | "non_appliquee" | "non_verifiable"; reasons: string[];
  text: string; by: string; at: string; seq: number; basis: EventEffectBasis; basisHash: string; mapHash: string;
  citations: ResolvedCitation[]; correctedCents: number | null; assessedBy: ReviewBasis;
}
export interface DossierEventEffect {
  eventId: string; flow: "purchase" | "sale"; party: string; invoiceId: string; documentKind: "invoice" | "credit_note";
  candidate: CutoffCandidate | null; account: string | null; amountHt: KnownAmount; procedureTitle: string | null; rule: string;
  target: "resultat"; direction: "increase" | "decrease"; contributors: number; findingIds: string[];
  /** Groupe C05 de l'événement : déterminé, en conflit ou indéterminé ; jamais un maximum présenté comme une somme. */
  status: "determined" | "conflict" | "indeterminate" | "absent"; countedCents: number | null; boundsCents: { minCents: number; maxCents: number } | null;
  /** Empreinte de l'effet tel que le serveur le lit : le navigateur la renvoie avec une décision (null si aucun effet déterminé). */
  basisHash: string | null;
  /** Statut de revue C05 issu du journal (en_attente, valide = apprécié non corrigé, corrige) et étape qui en découle. */
  reviewStatus: "en_attente" | "valide" | "corrige"; stage: EffectReviewStage | null;
  /** Pont C05 de l'événement pour son poste et son sens (en attente, apprécié non corrigé, corrigé, résiduel, écarté). */
  bridge: EffectStage | null;
  decisions: EventDecisionView[];
  sources: DossierEventSource[]; inProgramme: boolean; information: string[];
}
export interface DossierEventWithoutEffect {
  eventId: string; flow: "purchase" | "sale"; party: string; invoiceId: string; accounting: TransversalEvent["accounting"]["status"];
  candidates: CutoffCandidate[]; reason: string; sources: DossierEventSource[]; information: string[];
}
/** Décisions dont l'effet n'est plus dans la carte (ou carte non lue) : conservées et listées, jamais appliquées. */
export interface OrphanEventDecision { eventId: string; invoiceId: string; party: string; decisions: EventDecisionView[]; reason: string }
/** Dénominateurs des effets d'événements : null quand la carte n'est pas lue (inconnu, jamais zéro). */
export interface EventDenominators {
  status: EventMapRead["status"]; mapHash: string | null; events: number | null; observations: number | null; candidateObservations: number | null; countedEffects: number | null;
  withoutEffect: number | null; divergentEvents: number | null; staleObservations: number | null;
  byStage: { pending: number; proposed: number; corrected: number; dismissed: number; undetermined: number } | null;
  /** Effets dont une décision du journal s'applique ; décisions à réexaminer (effets présents) ; décisions orphelines. */
  decided: number | null; toReexamine: number | null; orphanDecisions: number;
  outsideProgramme: number | null; discordantSources: number | null;
}
export interface ClosingEventEffects {
  status: EventMapRead["status"]; reason: string | null;
  map: { schemaVersion: string; version: string; hash: string; period: TransversalEventMap["period"]; vatChain: TransversalEventMap["vatChain"]; aggregationStatus: string } | null;
  effects: DossierEventEffect[]; withoutEffect: DossierEventWithoutEffect[]; orphanDecisions: OrphanEventDecision[];
  /** Pont C05 des effets par poste et sens, décisions du journal appliquées par la règle C05. */
  stages: EffectStage[]; notice: string;
}

/** Effet d'un événement tel que la carte le compte maintenant ; null sans groupe C05 déterminé unique. */
export function effectBasis(e: TransversalEvent): EventEffectBasis | null {
  const effect = e.effect, cluster = effect && effect.exposure.clusters.length === 1 ? effect.exposure.clusters[0] : null;
  if (!effect || !cluster || cluster.status !== "determined" || cluster.retainedCents === null) return null;
  return { eventId: e.eventId, invoiceId: e.invoiceId, party: e.party, candidate: e.accounting.candidate, target: effect.target, direction: effect.direction, countedCents: cluster.retainedCents,
    contributions: effect.contributions.map(c => ({ procedureId: c.procedureId, runId: c.runId, version: c.version })) };
}
export const effectBasisHash = (b: EventEffectBasis) => stableSha256(b);
/** Effet courant d'un événement dans une carte lue, avec son groupe et son empreinte ; null s'il n'y en a pas. */
export function currentEffect(read: EventMapRead, eventId: string) {
  if (read.status !== "lue") return null;
  const e = read.map.events.find(x => x.eventId === eventId), basis = e ? effectBasis(e) : null;
  return e && basis ? { event: e, basis, basisHash: effectBasisHash(basis), cluster: e.effect!.exposure.clusters[0], mapHash: read.map.hash } : null;
}
/**
 * Concordance of the map, read before the file transaction, with the cycle sheets the transaction observes: each sheet carrying the effect must still be
 * the current head of its lineage, at the version the map read, with its sources current for its family. Returns the discordance, or null.
 */
export function contributionsDiscordance(basis: EventEffectBasis, observations: CycleObservation[]): string | null {
  const lineages = sheetLineages(observations);
  for (const c of basis.contributions) {
    const l = lineages.find(x => x.procedure === c.procedureId && (x.current.runId === c.runId || x.previous.some(p => p.runId === c.runId)));
    if (!l) return c.procedureId + " " + c.runId + " non observée par le dossier";
    if (l.current.runId !== c.runId || l.current.version !== c.version) return c.procedureId + " " + c.runId + " v" + c.version + " lue par la carte, " + l.current.runId + " r" + l.current.revision + " v" + l.current.version + " courante dans le dossier";
    if (l.current.sourcesCurrent === false) return c.procedureId + " " + c.runId + " : source remplacée depuis le gel";
  }
  return null;
}
const basisOf = (kind?: string): ReviewBasis => !kind ? "autre_personne" : kind === "personal" ? "personnelle" : kind === "simulated_second_identity" ? "simulation" : "autre_personne";

/**
 * Décisions d'un effet et statut C05 qui en découle. Une correction appliquée prime ; sinon une appréciation appliquée ; sinon en attente.
 * `currentHash` null : plus d'effet déterminé pour cet événement ; `pending` faux : la carte porte déjà une étape C05 (décision non appliquée).
 */
function decisionsOf(s: ClosingState, t: EventTreatment | undefined, currentHash: string | null, pending: boolean) {
  const views: EventDecisionView[] = [];
  const reasonsOf = (basisHash: string, citations: ResolvedCitation[]) => [
    ...(currentHash === null ? ["plus d’effet déterminé pour cet événement dans la carte"] : basisHash !== currentHash ? ["effet modifié depuis la décision (montant, sens ou feuilles sources)"] : []),
    ...(citations.some(c => isSuperseded(s, c)) ? ["pièce citée remplacée depuis"] : []),
  ];
  let status: DossierEventEffect["reviewStatus"] = "en_attente", correctionCents: number | undefined;
  if (t?.correction) {
    const c = t.correction, reasons = reasonsOf(c.basisHash, c.citations), state = reasons.length ? "a_reexaminer" as const : pending ? "appliquee" as const : "non_appliquee" as const;
    views.push({ kind: "correction", state, reasons: state === "non_appliquee" ? ["la carte porte déjà une étape C05 pour cet effet"] : reasons, text: c.text, by: c.by, at: c.at, seq: c.seq, basis: c.basis, basisHash: c.basisHash, mapHash: c.mapHash,
      citations: c.citations, correctedCents: c.correctedCents ?? null, assessedBy: null });
    if (state === "appliquee") { status = "corrige"; correctionCents = c.correctedCents; }
  }
  if (t?.assessment) {
    const a = t.assessment, reasons = reasonsOf(a.basisHash, []);
    const state = status === "corrige" ? "remplacee" as const : reasons.length ? "a_reexaminer" as const : pending ? "appliquee" as const : "non_appliquee" as const;
    views.push({ kind: "assessment", state, reasons: state === "remplacee" ? ["une correction appliquée la remplace"] : state === "non_appliquee" ? ["la carte porte déjà une étape C05 pour cet effet"] : reasons,
      text: a.text, by: a.by, at: a.at, seq: a.seq, basis: a.basis, basisHash: a.basisHash, mapHash: a.mapHash, citations: [], correctedCents: null, assessedBy: basisOf(a.kind) });
    if (state === "appliquee") status = "valide";
  }
  return { views, status, correctionCents };
}

type Contribution = NonNullable<TransversalEvent["effect"]>["contributions"][number];
function sourceOf(o: EventObservation, contributions: Contribution[], sheets: LineageView[]): DossierEventSource {
  // La carte nomme les observations porteuses de l'effet (constats C05) : le dossier les lit, il ne les redéduit pas.
  const carried = contributions.find(c => c.procedureId === o.procedureId && c.runId === o.runId && c.version === o.version) ?? null;
  const l = sheets.find(x => x.procedure === o.procedureId && (x.current.runId === o.runId || x.previous.some(p => p.runId === o.runId)));
  const seen = l ? (l.current.runId === o.runId ? l.current : l.previous.find(p => p.runId === o.runId)!) : null;
  const lineage: EventSourceLineage | null = l && seen ? { rootId: l.rootId, revision: seen.revision, currentRunId: l.current.runId, currentRevision: l.current.revision, currentVersion: l.current.version,
    read: l.current.runId !== o.runId ? "revision_anterieure" : l.current.version === o.version ? "courante" : "version_anterieure", assignment: l.assignment, procedureId: l.procedureId ?? null, sourcesCurrent: seen.sourcesCurrent } : null;
  // La carte dit « courante » ou « périmée » ; le dossier le dit par sa lignée (une version plus récente la périme), puis par l'adaptateur
  // de la famille pour les sources. Version courante sans têtes de sources lues : rien n'est affirmé.
  const freshness: DossierEventSource["freshness"] = !lineage ? "non_verifiee" : lineage.read !== "courante" ? (o.stale ? "concordante" : "discordante")
    : lineage.sourcesCurrent === null ? "non_verifiee" : (lineage.sourcesCurrent === false) === o.stale ? "concordante" : "discordante";
  return { procedure: o.procedureId, runId: o.runId, version: o.version, href: o.href, observation: o.status, basis: o.basis, amount: o.amount, reasons: o.reasons,
    counted: !!carried, findingId: carried?.findingId ?? null, stale: o.stale, staleReasons: o.staleReasons, lineage, freshness };
}

const SENS = { increase: "hausse", decrease: "baisse" } as const;
const euro = (cents: number) => { const abs = Math.abs(cents), whole = String(Math.trunc(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); return whole + "," + String(abs % 100).padStart(2, "0") + " €"; };
const item = (code: string, label: string, eventId: string): RemainingItem => ({ code, label, ref: { kind: "event", id: eventId } });

/**
 * Projection des effets de la carte dans le dossier, décisions du journal appliquées par la règle C05 ; aucun montant recalculé.
 * Retourne aussi les travaux restants et les conditions de revue professionnelle qu'elles laissent ouverts.
 */
export function projectEventEffects(read: EventMapRead, sheets: LineageView[], s: ClosingState): { block: ClosingEventEffects; denominators: EventDenominators; blockers: RemainingItem[]; professionalGaps: RemainingItem[] } {
  const blockers: RemainingItem[] = [], professionalGaps: RemainingItem[] = [];
  const treated = Object.values(s.eventTreatments);
  if (read.status !== "lue") {
    // Carte non lue ou absente : décisions conservées, non vérifiables ; si le dossier observe des feuilles exécutées qui l'alimentent, leurs effets sont inconnus.
    const orphanDecisions = treated.map(t => ({ eventId: t.eventId, invoiceId: (t.correction ?? t.assessment)!.basis.invoiceId, party: (t.correction ?? t.assessment)!.basis.party,
      decisions: decisionsOf(s, t, null, false).views.map(v => ({ ...v, state: "non_verifiable" as const, reasons: ["carte des événements non lue : décision non vérifiable"] })), reason: read.reason }));
    const fed = sheets.filter(x => (EVENT_MAP_PROCEDURES as readonly string[]).includes(x.procedure) && x.current.execution === "completed");
    if (read.status === "non_lue" && fed.length) blockers.push(item("EVENT_MAP_UNREAD", "Carte des événements non lue (" + read.reason + ") alors que " + fed.length + " feuille(s) Achats ou Clients et ventes exécutée(s) sont observées : effets inconnus", "map"));
    return {
      block: { status: read.status, reason: read.reason, map: null, effects: [], withoutEffect: [], orphanDecisions, stages: [], notice: EVENT_EFFECTS_NOTICE },
      denominators: { status: read.status, mapHash: null, events: null, observations: null, candidateObservations: null, countedEffects: null, withoutEffect: null, divergentEvents: null, staleObservations: null, byStage: null,
        decided: null, toReexamine: null, orphanDecisions: orphanDecisions.length, outsideProgramme: null, discordantSources: null },
      blockers, professionalGaps,
    };
  }
  const map = read.map, reviewedClusters = new Map<string, ExposureClusterView>();
  const effects: DossierEventEffect[] = map.events.filter(e => e.effect).map(e => {
    const effect = e.effect!, cluster = effect.exposure.clusters.length === 1 ? effect.exposure.clusters[0] : null, basis = effectBasis(e), basisHash = basis ? effectBasisHash(basis) : null;
    const sources = e.observations.map(o => sourceOf(o, effect.contributions, sheets));
    // La décision du journal s'applique au groupe de la carte resté « en attente », par la règle C05 ; le groupe lui-même n'est pas recalculé.
    const pending = cluster?.reviewStage === "pending", d = decisionsOf(s, s.eventTreatments[e.eventId], basisHash, pending);
    const reviewed = cluster && pending ? reviewedCluster(cluster, d.status, d.correctionCents) : cluster;
    for (const c of reviewed ? [reviewed] : effect.exposure.clusters) reviewedClusters.set(c.clusterId, c);
    return { eventId: e.eventId, flow: e.flow, party: e.party, invoiceId: e.invoiceId, documentKind: e.documentKind, candidate: e.accounting.candidate, account: e.accounting.balanceSheet?.account ?? null,
      amountHt: e.accounting.amountHt, procedureTitle: e.procedure?.title ?? null, rule: e.rule.status === "resolved" ? e.rule.label + " — " + e.rule.articles : "Texte applicable à déterminer",
      target: effect.target, direction: effect.direction, contributors: effect.contributors, findingIds: effect.contributions.map(c => c.findingId),
      // Plusieurs groupes pour un même événement : aucun montant retenu (C05 ne fusionne pas des groupes distincts).
      status: cluster ? cluster.status : effect.exposure.clusters.length ? "indeterminate" : "absent", countedCents: basis?.countedCents ?? null,
      boundsCents: cluster ? cluster.boundsCents : null, basisHash, reviewStatus: d.status, stage: reviewed?.reviewStage ?? null,
      bridge: reviewed ? summarizeStages([reviewed]).find(st => st.target === effect.target && st.direction === effect.direction) ?? null : null,
      decisions: d.views, sources, inProgramme: sources.some(x => x.counted && x.lineage?.assignment === "retenue"), information: e.information };
  });
  // Candidats non comptés : suspendus par une procédure non concluante, divergents, ou lus seulement dans des feuilles périmées.
  const withoutEffect: DossierEventWithoutEffect[] = map.events.filter(e => !e.effect && e.observations.some(o => o.status === "candidate")).map(e => ({
    eventId: e.eventId, flow: e.flow, party: e.party, invoiceId: e.invoiceId, accounting: e.accounting.status,
    candidates: [...new Set(e.observations.flatMap(o => o.candidate ? [o.candidate] : []))].sort(), reason: e.accounting.amountHt.kind === "known" ? "Aucun effet compté" : e.accounting.amountHt.reason,
    sources: e.observations.map(o => sourceOf(o, [], sheets)), information: e.information }));
  // Décisions dont l'événement n'a plus d'effet dans la carte : listées, à réexaminer, sans blocage (aucune décision nouvelle n'est possible sur un effet absent).
  const listed = new Set(effects.map(x => x.eventId));
  const orphanDecisions: OrphanEventDecision[] = treated.filter(t => !listed.has(t.eventId)).map(t => {
    const b = (t.correction ?? t.assessment)!.basis, without = withoutEffect.some(x => x.eventId === t.eventId);
    return { eventId: t.eventId, invoiceId: b.invoiceId, party: b.party, decisions: decisionsOf(s, t, null, false).views,
      reason: without ? "Événement sans effet compté dans la carte (candidat suspendu, divergent ou périmé)" : "Événement absent de la carte ou sans candidat" };
  });

  for (const x of effects) {
    const what = x.invoiceId + " · effet " + (x.candidate ?? "d’événement") + (x.countedCents !== null ? " " + euro(x.countedCents) : "") + " (" + SENS[x.direction] + " du résultat)";
    // Comme une anomalie journalisée : une correction devenue caduque bloque, même si une appréciation reste valable ; un effet resté « en attente » (étape C05) bloque.
    const stale = x.decisions.filter(v => v.state === "a_reexaminer"), applied = x.decisions.find(v => v.state === "appliquee"), shown = stale.find(v => v.kind === "correction") ?? stale[0];
    if (x.status !== "determined") blockers.push(item("EVENT_EFFECT_UNDETERMINED", what + " : groupe C05 " + (x.status === "absent" ? "absent" : "indéterminé") + ", aucune décision possible avant que les feuilles concordent", x.eventId));
    else if (stale.some(v => v.kind === "correction") || (x.stage === "pending" && stale.length)) blockers.push(item("EVENT_EFFECT_DECISION_STALE", what + " : " + (shown.kind === "correction" ? "correction" : "appréciation") + " à réexaminer — " + shown.reasons.join(" ; "), x.eventId));
    else if (x.stage === "pending") blockers.push(item("EVENT_EFFECT_UNTREATED", what + " en attente : correction ou appréciation à documenter (NEP 450)", x.eventId));
    if (applied?.kind === "assessment" && applied.assessedBy !== "autre_personne")
      (applied.assessedBy === "simulation" ? blockers : professionalGaps).push(item("EVENT_EFFECT_ASSESSED_PERSONALLY", what + " · appréciée " + (applied.assessedBy === "simulation" ? "par une seconde identité simulée : à apprécier" : "sous relecture personnelle nommée"), x.eventId));
  }
  const allSources = [...effects.flatMap(x => x.sources), ...withoutEffect.flatMap(x => x.sources)];
  const count = (stage: EffectReviewStage) => effects.filter(x => x.status === "determined" && x.stage === stage).length;
  return {
    block: { status: "lue", reason: read.reason, map: { schemaVersion: map.schemaVersion, version: map.version, hash: map.hash, period: map.period, vatChain: map.vatChain, aggregationStatus: map.bridge.aggregationStatus },
      effects, withoutEffect, orphanDecisions, stages: summarizeStages([...reviewedClusters.values()]), notice: EVENT_EFFECTS_NOTICE },
    denominators: { status: "lue", mapHash: map.hash, events: map.events.length, observations: map.bridge.observations, candidateObservations: map.bridge.candidateObservations, countedEffects: map.bridge.countedEffects,
      withoutEffect: withoutEffect.length, divergentEvents: map.bridge.divergentEvents, staleObservations: map.bridge.staleObservations,
      byStage: { pending: count("pending"), proposed: count("proposed"), corrected: count("corrected"), dismissed: count("dismissed"), undetermined: effects.filter(x => x.status !== "determined").length },
      decided: effects.filter(x => x.decisions.some(v => v.state === "appliquee")).length, toReexamine: blockers.filter(b => b.code === "EVENT_EFFECT_DECISION_STALE").length,
      orphanDecisions: orphanDecisions.length, outsideProgramme: effects.filter(x => !x.inProgramme).length, discordantSources: allSources.filter(x => x.freshness === "discordante").length },
    blockers, professionalGaps,
  };
}

const n = (value: number, one: string, many: string) => value + " " + (value > 1 ? many : one);
/** Phrase unique des dénominateurs d'effets : le bandeau, la carte de couverture, la synthèse et l'export la reprennent telle quelle. */
export function eventDenominatorText(d: EventDenominators, reason: string | null): string {
  if (d.status !== "lue") return "Effets d’événements transversaux " + (d.status === "aucune_feuille" ? "non établis" : "non lus") + " : " + (reason ?? "carte absente") + " — inconnus, jamais comptés pour zéro"
    + (d.orphanDecisions ? " · " + d.orphanDecisions + " décision(s) journalisée(s) non vérifiable(s)" : "");
  const st = d.byStage!;
  return n(d.countedEffects!, "effet d’événement transversal compté une fois", "effets d’événements transversaux comptés une fois") + " (" + n(d.candidateObservations!, "observation avec candidat", "observations avec candidat") + ", " + n(d.events!, "événement", "événements") + ")"
    + " · étape C05 : " + st.pending + " en attente, " + st.proposed + " apprécié(s) non corrigé(s), " + st.corrected + " corrigé(s)" + (st.dismissed ? ", " + st.dismissed + " écarté(s)" : "") + (st.undetermined ? ", " + st.undetermined + " indéterminé(s)" : "")
    + (d.toReexamine ? " · " + d.toReexamine + " décision(s) à réexaminer" : "") + (d.orphanDecisions ? " · " + d.orphanDecisions + " décision(s) sans effet dans la carte" : "")
    + " · " + n(d.withoutEffect!, "candidat sans effet compté", "candidats sans effet compté")
    + (d.outsideProgramme ? " · " + d.outsideProgramme + " effet(s) observé(s) hors programme du dossier" : "") + (d.discordantSources ? " · " + d.discordantSources + " lecture(s) discordante(s) à relire" : "")
    + " — catégorie distincte des anomalies journalisées";
}
