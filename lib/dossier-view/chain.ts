import type { DossierSnapshot } from "@/lib/canonical-model";
import type { Finding, FindingFamily, Severity } from "@/lib/canonical-model/finding";
import { orderForSelector } from "@/lib/synthese-view/chain";
import { SEVERITIES, plural } from "@/lib/synthese-view/common";
import { REVIEW_WORD, reviewStageByFinding, type ReviewStage } from "@/lib/synthese-view/review";

/**
 * Vue « Dossier & preuve » : la chaîne source → transformation → règle → résultat → décision de chaque constat, telle
 * que la règle l'a écrite. Les quatre premiers maillons viennent des étapes `preuve` du constat, classées par leur
 * libellé ; un libellé inconnu reste visible comme « autre étape », il n'est jamais rattaché par défaut à un maillon
 * ni écarté. La décision vient du journal de revue (sinon du statut porté) par la même fonction que la Synthèse.
 * Un maillon absent est dit absent : ce n'est pas une erreur, et rien n'est reconstitué à sa place.
 */

/** Maillon auquel une étape de preuve est rattachée d'après son libellé. */
export type StepCategory = "source" | "transformation" | "rule" | "result" | "other";

/** Les quatre maillons portés par les étapes de preuve (la décision vient de la revue). */
export const EVIDENCE_LINKS = ["source", "transformation", "rule", "result"] as const;
export type EvidenceLink = (typeof EVIDENCE_LINKS)[number];

export const LINK_LABEL: Record<EvidenceLink | "decision", string> = {
  source: "Source",
  transformation: "Transformation",
  rule: "Règle",
  result: "Résultat",
  decision: "Décision",
};

/** Nombre de maillons d'une chaîne complète : les quatre étapes et la décision. */
export const CHAIN_LENGTH = EVIDENCE_LINKS.length + 1;

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Libellés connus, relevés dans les règles du moteur, les scénarios et le rapprochement. Seuls les libellés dont le
 * sens est univoque sont rattachés : une origine lue (source, échantillon, en-tête, nom ou première ligne du fichier),
 * un calcul déclaré, une règle, un résultat. « Contrôle », « Analyse », « Parsing », les totaux intermédiaires… restent
 * des « autres étapes », affichées telles quelles.
 */
const LABEL_CATEGORY: Readonly<Record<string, Exclude<StepCategory, "other">>> = {
  source: "source",
  echantillon: "source",
  "en-tete lu": "source",
  "en-tete": "source",
  "lecture nom fichier": "source",
  "premiere ligne": "source",
  transformation: "transformation",
  calcul: "transformation",
  "base de calcul": "transformation",
  regle: "rule",
  "regle appliquee": "rule",
  resultat: "result",
  "resultat de feuille": "result",
};

export function stepCategory(label: string): StepCategory {
  return LABEL_CATEGORY[norm(label)] ?? "other";
}

/** Décision lue dans la revue ; `unknown` quand le journal de revue ne se vérifie pas (jamais assimilé à « en attente »). */
export type DecisionState = ReviewStage | "unknown";

export const DECISION_WORD: Record<DecisionState, string> = { ...REVIEW_WORD, unknown: "indéterminée" };

/** Repère dessiné sur la ligne de preuve : carré = origine, trait = étape, cercle = résultat, losange = décision, pointillé = absent. */
export type ChainMarker = "source" | "step" | "result" | "decision" | "missing";

export interface ChainNode {
  /** Libellé affiché : celui de l'étape telle qu'écrite, ou le nom du maillon absent. */
  label: string;
  detail: string;
  marker: ChainMarker;
  category: StepCategory | "decision";
}

export interface DossierEntry {
  id: string;
  title: string;
  severity: Severity;
  family: FindingFamily;
  /** Présence de chaque maillon porté par les étapes de preuve. */
  links: Record<EvidenceLink, boolean>;
  /** Maillons absents, dans l'ordre de la chaîne. */
  absent: EvidenceLink[];
  /** Libellés d'étapes non rattachés à un maillon, dans l'ordre d'écriture. */
  otherSteps: string[];
  decision: DecisionState;
  /** Vrai quand un arbitrage est consigné (validé, corrigé ou écarté). */
  decided: boolean;
  /** Maillons présents sur cinq (étapes et décision). */
  present: number;
  nodes: ChainNode[];
  accounts: string[];
  fecLines: number[];
  source: { ref: string; url?: string };
  ruleId: string;
  ruleVersion: string;
}

const ABSENT = "absent";

/** Détail du maillon « Décision » : mêmes mots que la chaîne de preuve de la Synthèse. */
const DECISION_DETAIL: Record<DecisionState, string> = {
  pending: "en attente",
  proposed: "validé par l’auditeur",
  corrected: "corrigé : correction comptabilisée",
  dismissed: "écarté par l’auditeur",
  unknown: "indéterminée : journal de revue non vérifié",
};

function decisionNode(decision: DecisionState): ChainNode {
  const decided = decision !== "pending" && decision !== "unknown";
  return { label: LINK_LABEL.decision, detail: DECISION_DETAIL[decision], marker: decided ? "decision" : "missing", category: "decision" };
}

export function buildEntry(finding: Finding, decision: DecisionState): DossierEntry {
  const steps = finding.preuve.map((p) => ({ label: p.etape, detail: p.detail, category: stepCategory(p.etape) }));
  const links: Record<EvidenceLink, boolean> = {
    source: steps.some((s) => s.category === "source"),
    transformation: steps.some((s) => s.category === "transformation"),
    rule: steps.some((s) => s.category === "rule"),
    result: steps.some((s) => s.category === "result"),
  };
  const absent = EVIDENCE_LINKS.filter((link) => !links[link]);
  const decided = decision !== "pending" && decision !== "unknown";

  const nodes: ChainNode[] = steps.map((s) => ({
    label: s.label,
    detail: s.detail,
    category: s.category,
    marker: s.category === "source" ? "source" : s.category === "result" ? "result" : "step",
  }));
  const missing = (link: EvidenceLink): ChainNode => ({ label: LINK_LABEL[link], detail: ABSENT, marker: "missing", category: link });
  // Une transformation absente n'interrompt pas la ligne : une règle peut s'appliquer sans calcul intermédiaire.
  // L'origine, la règle et le résultat absents sont dessinés à leur place, en pointillé.
  if (!links.source) nodes.unshift(missing("source"));
  if (!links.rule) {
    const firstResult = nodes.findIndex((n) => n.category === "result");
    nodes.splice(firstResult === -1 ? nodes.length : firstResult, 0, missing("rule"));
  }
  if (!links.result) nodes.push(missing("result"));
  nodes.push(decisionNode(decision));

  return {
    id: finding.id,
    title: finding.titre,
    severity: finding.severity,
    family: finding.family,
    links,
    absent,
    otherSteps: steps.filter((s) => s.category === "other").map((s) => s.label),
    decision,
    decided,
    present: EVIDENCE_LINKS.length - absent.length + (decided ? 1 : 0),
    nodes,
    accounts: finding.comptesConcernes,
    fecLines: finding.lignesSource,
    source: { ref: finding.source.ref, url: finding.source.url },
    ruleId: finding.ruleId,
    ruleVersion: finding.ruleVersion,
  };
}

/**
 * Décision de chaque constat d'après le journal de revue. Un journal dont la chaîne de hachage ne se vérifie pas ne
 * donne aucune décision : chaque constat passe à `unknown`, jamais à « en attente ».
 */
export function decisionsOf(snapshot: Pick<DossierSnapshot, "findings" | "reviewEvents">): { decisions: Map<string, DecisionState>; journalValid: boolean } {
  try {
    return { decisions: reviewStageByFinding(snapshot), journalValid: true };
  } catch {
    return { decisions: new Map(snapshot.findings.map((f) => [f.id, "unknown" as const])), journalValid: false };
  }
}

/**
 * Entrées du dossier de preuve : les constats qui portent au moins une étape de preuve, par gravité décroissante puis
 * dans l'ordre du snapshot (l'ordre de la matrice et de la liste).
 */
export function buildDossierEntries(snapshot: Pick<DossierSnapshot, "findings" | "reviewEvents">): { entries: DossierEntry[]; journalValid: boolean } {
  const { decisions, journalValid } = decisionsOf(snapshot);
  const sourced = snapshot.findings.filter((f) => f.preuve.length > 0);
  const entries = orderForSelector(sourced).map((f) => buildEntry(f, decisions.get(f.id) ?? "unknown"));
  return { entries, journalValid };
}

/* ── Matrice de complétude ─────────────────────────────────────────────── */

export type MatrixRowKey = EvidenceLink | "decision" | "fecLines" | "other";

export interface MatrixRow {
  key: MatrixRowKey;
  label: string;
  /** Une case par colonne (constat), dans l'ordre des colonnes. */
  cells: boolean[];
  present: number;
  total: number;
  /** Identifiants des constats où l'étape est présente / absente. */
  presentIds: string[];
  absentIds: string[];
}

export interface MatrixGroup {
  severity: Severity;
  count: number;
}

export interface CompletenessMatrix {
  total: number;
  columns: { id: string; severity: Severity }[];
  groups: MatrixGroup[];
  rows: MatrixRow[];
  decided: number;
  undetermined: number;
  /** Libellés d'« autres étapes » rencontrés, sans doublon, dans l'ordre de rencontre. */
  otherLabels: string[];
}

function row(key: MatrixRowKey, label: string, entries: readonly DossierEntry[], has: (e: DossierEntry) => boolean): MatrixRow {
  const cells = entries.map(has);
  return {
    key,
    label,
    cells,
    present: cells.filter(Boolean).length,
    total: entries.length,
    presentIds: entries.filter((_, i) => cells[i]).map((e) => e.id),
    absentIds: entries.filter((_, i) => !cells[i]).map((e) => e.id),
  };
}

export function buildCompleteness(entries: readonly DossierEntry[]): CompletenessMatrix {
  const groups = SEVERITIES.map((severity) => ({ severity, count: entries.filter((e) => e.severity === severity).length })).filter((g) => g.count > 0);
  const rows: MatrixRow[] = [
    ...EVIDENCE_LINKS.map((link) => row(link, LINK_LABEL[link], entries, (e) => e.links[link])),
    row("decision", LINK_LABEL.decision, entries, (e) => e.decided),
    row("fecLines", "Lignes FEC citées", entries, (e) => e.fecLines.length > 0),
  ];
  const otherLabels = [...new Set(entries.flatMap((e) => e.otherSteps))];
  if (otherLabels.length > 0) rows.push(row("other", "Autre étape", entries, (e) => e.otherSteps.length > 0));
  return {
    total: entries.length,
    columns: entries.map((e) => ({ id: e.id, severity: e.severity })),
    groups,
    rows,
    decided: entries.filter((e) => e.decided).length,
    undetermined: entries.filter((e) => e.decision === "unknown").length,
    otherLabels,
  };
}

/** Compte affiché à droite d'une rangée : « 31/43 », et pour la décision l'état d'ensemble quand il est uniforme. */
export function rowCount(row: MatrixRow, matrix: Pick<CompletenessMatrix, "decided" | "undetermined" | "total">): string {
  const base = `${row.present}/${row.total}`;
  if (row.key !== "decision" || row.total === 0) return base;
  if (matrix.undetermined === matrix.total) return `${base} · indéterminée`;
  if (matrix.decided === 0 && matrix.undetermined === 0) return `${base} · ${row.total > 1 ? "tous en attente" : "en attente"}`;
  return base;
}

/**
 * Lecture de la rangée en une phrase, pour la table accessible : la liste la plus courte est nommée (présente pour… /
 * absente pour…), de sorte que l'information de chaque colonne reste disponible sans parcourir 43 cases.
 */
export function rowReading(row: MatrixRow): string {
  if (row.total === 0) return "aucun constat";
  if (row.present === row.total) return "présente pour tous les constats";
  if (row.present === 0) return "absente pour tous les constats";
  return row.present <= row.absentIds.length
    ? `présente pour ${row.presentIds.join(", ")}`
    : `absente pour ${row.absentIds.join(", ")}`;
}

/** Phrase sur la décision, sous la matrice : ce que la revue a consigné, sans le présumer. */
export function decisionSentence(matrix: Pick<CompletenessMatrix, "decided" | "undetermined" | "total">): string {
  if (matrix.total === 0) return "";
  if (matrix.undetermined > 0) return "Le journal de revue ne se vérifie pas : la décision est indéterminée, elle n'est pas présumée en attente.";
  if (matrix.decided === 0) return "La décision, elle, manque partout : aucun constat n'a encore été arbitré.";
  if (matrix.decided === matrix.total) return `Chaque constat porte une décision consignée (${matrix.total}).`;
  return `${matrix.decided} ${plural(matrix.decided, "constat arbitré", "constats arbitrés")} sur ${matrix.total} ; les autres restent en attente.`;
}

/* ── Filtres ───────────────────────────────────────────────────────────── */

export type ChainFilter = "all" | "no_result" | "no_transformation" | "no_fec_lines" | "decision_pending";

export const CHAIN_FILTER_LABEL: Record<ChainFilter, string> = {
  all: "toutes",
  no_result: "sans résultat",
  no_transformation: "sans transformation",
  no_fec_lines: "sans ligne FEC",
  decision_pending: "décision en attente",
};

export interface DossierFilter {
  query: string;
  severity: Severity | null;
  family: FindingFamily | null;
  chain: ChainFilter;
}

export const EMPTY_FILTER: DossierFilter = { query: "", severity: null, family: null, chain: "all" };

function matchesChain(entry: DossierEntry, chain: ChainFilter): boolean {
  switch (chain) {
    case "all": return true;
    case "no_result": return !entry.links.result;
    case "no_transformation": return !entry.links.transformation;
    case "no_fec_lines": return entry.fecLines.length === 0;
    case "decision_pending": return entry.decision === "pending";
  }
}

/** Recherche sur l'intitulé, l'identifiant, les comptes, la référence de la source et la règle (accents et casse ignorés). */
export function matchesQuery(entry: DossierEntry, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  return [entry.title, entry.id, entry.source.ref, entry.ruleId, ...entry.accounts].some((field) => norm(field).includes(q));
}

export function filterEntries(entries: readonly DossierEntry[], filter: DossierFilter): DossierEntry[] {
  return entries.filter(
    (e) =>
      (!filter.severity || e.severity === filter.severity) &&
      (!filter.family || e.family === filter.family) &&
      matchesChain(e, filter.chain) &&
      matchesQuery(e, filter.query),
  );
}

export function isFiltered(filter: DossierFilter): boolean {
  return Boolean(filter.query.trim() || filter.severity || filter.family || filter.chain !== "all");
}

/** « chaîne 4/5 · décision en attente », « chaîne 5/5 · constat validé » : la lecture courte de la colonne latérale. */
export function chainSummary(entry: Pick<DossierEntry, "present" | "decision">): string {
  const decision = entry.decision === "pending" || entry.decision === "unknown" ? `décision ${DECISION_WORD[entry.decision]}` : `constat ${DECISION_WORD[entry.decision]}`;
  return `chaîne ${entry.present}/${CHAIN_LENGTH} · ${decision}`;
}

/** « absentes : transformation, résultat » ; chaîne vide quand les quatre étapes sont présentes. */
export function absentSummary(entry: Pick<DossierEntry, "absent">): string {
  if (entry.absent.length === 0) return "";
  const words = entry.absent.map((link) => LINK_LABEL[link].toLowerCase()).join(", ");
  return `${entry.absent.length > 1 ? "absentes" : "absente"} : ${words}`;
}
