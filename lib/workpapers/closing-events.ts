import type { KnownAmount } from "@/lib/canonical-model/money";
import type { EffectReviewStage, EffectStage } from "@/lib/synthesis/types";
import type { CutoffCandidate } from "./cutoff";
import type { EventObservation, TransversalEvent, TransversalEventMap } from "./transversal-events";
import type { LineageAssignment, LineageView } from "./closing-evaluate";

/**
 * Effets des événements transversaux (carte C11) versés dans le dossier de clôture, en lecture seule.
 * Le dossier lit la carte servie par GET /api/workpapers/payables?operation=events. L'effet compté une fois et son étape viennent
 * de la projection C05 de la carte (lecture par événement, `restrictExposure`) : rien n'est recalculé ici. Chaque feuille qui observe
 * l'événement est replacée dans sa lignée du dossier (une lignée par racine), avec la fraîcheur de ses sources lue par l'adaptateur
 * de sa famille (closing-adapters). Catégorie distincte des anomalies journalisées : aucun total commun, aucun total entre postes ou sens.
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
export const EVENT_EFFECTS_NOTICE = "Effets lus dans la carte des événements transversaux (projection C05) : catégorie distincte des anomalies journalisées du dossier, sans total commun ni addition entre postes et sens. Aucune décision de revue n’est portée par la carte ; le dossier ne la recalcule pas.";

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
export interface DossierEventEffect {
  eventId: string; flow: "purchase" | "sale"; party: string; invoiceId: string; documentKind: "invoice" | "credit_note";
  candidate: CutoffCandidate | null; account: string | null; amountHt: KnownAmount; procedureTitle: string | null; rule: string;
  target: "resultat"; direction: "increase" | "decrease"; contributors: number; findingIds: string[];
  /** Groupe C05 de l'événement : déterminé, en conflit ou indéterminé ; jamais un maximum présenté comme une somme. */
  status: "determined" | "conflict" | "indeterminate" | "absent"; countedCents: number | null; boundsCents: { minCents: number; maxCents: number } | null;
  stage: EffectReviewStage | null;
  /** Pont C05 de l'événement pour son poste et son sens (en attente, proposé, corrigé, résiduel, écarté). */
  bridge: EffectStage | null;
  sources: DossierEventSource[]; inProgramme: boolean; information: string[];
}
export interface DossierEventWithoutEffect {
  eventId: string; flow: "purchase" | "sale"; party: string; invoiceId: string; accounting: TransversalEvent["accounting"]["status"];
  candidates: CutoffCandidate[]; reason: string; sources: DossierEventSource[]; information: string[];
}
/** Dénominateurs des effets d'événements : null quand la carte n'est pas lue (inconnu, jamais zéro). */
export interface EventDenominators {
  status: EventMapRead["status"]; mapHash: string | null; events: number | null; observations: number | null; candidateObservations: number | null; countedEffects: number | null;
  withoutEffect: number | null; divergentEvents: number | null; staleObservations: number | null;
  byStage: { pending: number; proposed: number; corrected: number; dismissed: number; undetermined: number } | null;
  outsideProgramme: number | null; discordantSources: number | null;
}
export interface ClosingEventEffects {
  status: EventMapRead["status"]; reason: string | null;
  map: { schemaVersion: string; version: string; hash: string; period: TransversalEventMap["period"]; vatChain: TransversalEventMap["vatChain"]; aggregationStatus: string } | null;
  effects: DossierEventEffect[]; withoutEffect: DossierEventWithoutEffect[];
  /** Pont C05 de la carte par poste et sens, lu tel quel. */
  stages: EffectStage[]; notice: string;
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

/** Projection des effets de la carte dans le dossier : lecture seule, aucun montant recalculé. */
export function projectEventEffects(read: EventMapRead, sheets: LineageView[]): { block: ClosingEventEffects; denominators: EventDenominators } {
  if (read.status !== "lue") return {
    block: { status: read.status, reason: read.reason, map: null, effects: [], withoutEffect: [], stages: [], notice: EVENT_EFFECTS_NOTICE },
    denominators: { status: read.status, mapHash: null, events: null, observations: null, candidateObservations: null, countedEffects: null, withoutEffect: null, divergentEvents: null, staleObservations: null, byStage: null, outsideProgramme: null, discordantSources: null },
  };
  const map = read.map;
  const effects: DossierEventEffect[] = map.events.filter(e => e.effect).map(e => {
    const effect = e.effect!, cluster = effect.exposure.clusters.length === 1 ? effect.exposure.clusters[0] : null;
    const sources = e.observations.map(o => sourceOf(o, effect.contributions, sheets));
    return { eventId: e.eventId, flow: e.flow, party: e.party, invoiceId: e.invoiceId, documentKind: e.documentKind, candidate: e.accounting.candidate, account: e.accounting.balanceSheet?.account ?? null,
      amountHt: e.accounting.amountHt, procedureTitle: e.procedure?.title ?? null, rule: e.rule.status === "resolved" ? e.rule.label + " — " + e.rule.articles : "Texte applicable à déterminer",
      target: effect.target, direction: effect.direction, contributors: effect.contributors, findingIds: effect.contributions.map(c => c.findingId),
      // Plusieurs groupes pour un même événement : aucun montant retenu (C05 ne fusionne pas des groupes distincts).
      status: cluster ? cluster.status : effect.exposure.clusters.length ? "indeterminate" : "absent", countedCents: cluster?.status === "determined" ? cluster.retainedCents : null,
      boundsCents: cluster ? cluster.boundsCents : null, stage: cluster?.reviewStage ?? null,
      bridge: effect.exposure.stages.find(st => st.target === effect.target && st.direction === effect.direction) ?? null,
      sources, inProgramme: sources.some(x => x.counted && x.lineage?.assignment === "retenue"), information: e.information };
  });
  // Candidats non comptés : suspendus par une procédure non concluante, divergents, ou lus seulement dans des feuilles périmées.
  const withoutEffect: DossierEventWithoutEffect[] = map.events.filter(e => !e.effect && e.observations.some(o => o.status === "candidate")).map(e => ({
    eventId: e.eventId, flow: e.flow, party: e.party, invoiceId: e.invoiceId, accounting: e.accounting.status,
    candidates: [...new Set(e.observations.flatMap(o => o.candidate ? [o.candidate] : []))].sort(), reason: e.accounting.amountHt.kind === "known" ? "Aucun effet compté" : e.accounting.amountHt.reason,
    sources: e.observations.map(o => sourceOf(o, [], sheets)), information: e.information }));
  const allSources = [...effects.flatMap(x => x.sources), ...withoutEffect.flatMap(x => x.sources)];
  const count = (stage: EffectReviewStage) => effects.filter(x => x.status === "determined" && x.stage === stage).length;
  return {
    block: { status: "lue", reason: read.reason, map: { schemaVersion: map.schemaVersion, version: map.version, hash: map.hash, period: map.period, vatChain: map.vatChain, aggregationStatus: map.bridge.aggregationStatus },
      effects, withoutEffect, stages: map.bridge.stages, notice: EVENT_EFFECTS_NOTICE },
    denominators: { status: "lue", mapHash: map.hash, events: map.events.length, observations: map.bridge.observations, candidateObservations: map.bridge.candidateObservations, countedEffects: map.bridge.countedEffects,
      withoutEffect: withoutEffect.length, divergentEvents: map.bridge.divergentEvents, staleObservations: map.bridge.staleObservations,
      byStage: { pending: count("pending"), proposed: count("proposed"), corrected: count("corrected"), dismissed: count("dismissed"), undetermined: effects.filter(x => x.status !== "determined").length },
      outsideProgramme: effects.filter(x => !x.inProgramme).length, discordantSources: allSources.filter(x => x.freshness === "discordante").length },
  };
}

const n = (value: number, one: string, many: string) => value + " " + (value > 1 ? many : one);
/** Phrase unique des dénominateurs d'effets : le bandeau, la carte de couverture, la synthèse et l'export la reprennent telle quelle. */
export function eventDenominatorText(d: EventDenominators, reason: string | null): string {
  if (d.status !== "lue") return "Effets d’événements transversaux " + (d.status === "aucune_feuille" ? "non établis" : "non lus") + " : " + (reason ?? "carte absente") + " — inconnus, jamais comptés pour zéro";
  const st = d.byStage!;
  return n(d.countedEffects!, "effet d’événement transversal compté une fois", "effets d’événements transversaux comptés une fois") + " (" + n(d.candidateObservations!, "observation avec candidat", "observations avec candidat") + ", " + n(d.events!, "événement", "événements") + ")"
    + " · étape C05 : " + st.pending + " en attente, " + st.proposed + " proposé(s), " + st.corrected + " corrigé(s)" + (st.dismissed ? ", " + st.dismissed + " écarté(s)" : "") + (st.undetermined ? ", " + st.undetermined + " indéterminé(s)" : "")
    + " · " + n(d.withoutEffect!, "candidat sans effet compté", "candidats sans effet compté")
    + (d.outsideProgramme ? " · " + d.outsideProgramme + " effet(s) observé(s) hors programme du dossier" : "") + (d.discordantSources ? " · " + d.discordantSources + " lecture(s) discordante(s) à relire" : "")
    + " — catégorie distincte des anomalies journalisées";
}
