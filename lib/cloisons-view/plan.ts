/**
 * Revue par cloison — projection d'affichage pure (aucun calcul comptable, aucun montant inféré).
 *
 * Les silos du dossier sont rangés par cloison dans l'ordre canonique de la taxonomie, puis disposés comme
 * les états financiers pour le « Plan des cloisons » : actif | passif, puis résultat | annexe et fiscalité.
 * Chaque silo porte sa gravité la plus haute, son nombre de constats et ses effets lus dans la projection
 * PARTAGÉE avec la Synthèse (`restrictExposure`, `scopedEffectItems`) : exposition initiale par poste et sens,
 * groupes indéterminés, signaux EUR sans effet. Un montant inconnu reste inconnu, jamais zéro.
 *
 * Les formats d'affichage (euros pleins, espaces simples) sont ceux de la revue par cloison depuis C05 :
 * les tests de la page lisent « Résultat − 145 000 € ».
 */

import type { CloisonId, Finding, Severity, SiloView, StatutRevue } from "@/lib/canonical-model";
import { CLOISONS, SEVERITY_ORDER, siloById } from "@/lib/canonical-model";
import { isEurSignalWithoutEffect, restrictExposure } from "@/lib/synthesis/exposure";
import { EFFECT_TARGET_LABEL, scopedEffectItems, type ScopedEffectItem } from "@/lib/synthesis/effect-labels";
import type { ExposureDimension } from "@/lib/synthesis/types";

/* ── Formats ─────────────────────────────────────────────────────────────── */

/** Euros pleins, valeur absolue : « 85 000 € » (jamais compacté en k€). */
export function formatEur(n: number): string {
  const v = Math.round(Math.abs(n));
  return `${v.toLocaleString("fr-FR").replace(/[  ]/g, " ")} €`;
}

/** Ligne d'état : négatif entre parenthèses « (55 000 €) », zéro « — ». */
export function eurRow(n: number): string {
  if (Math.round(n) === 0) return "—";
  return n < 0 ? `(${formatEur(n)})` : formatEur(n);
}

/** Montant compact : « 2,50 M€ » au-delà du million, sinon euros pleins. */
export function compactEur(n: number): string {
  const abs = Math.abs(n);
  if (abs === 0) return "—";
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2).replace(".", ",")} M€`;
  return formatEur(n);
}

/** Pourcentage déjà exprimé en points (40 = 40 %), comme le moteur de règles et le visualiseur de document. */
function pct(v: number): string {
  return `${v.toFixed(1).replace(".", ",")} %`;
}

/** Valeur constatée d'une mesure, dans son unité. */
export function formatMesure(f: Pick<Finding, "mesure">): string {
  const { constate, unite } = f.mesure;
  if (unite === "EUR") return formatEur(constate);
  if (unite === "%") return pct(constate);
  if (unite === "jours") return `${constate} j`;
  return String(constate);
}

/** Valeur attendue (seuil) d'une mesure, dans son unité. */
export function formatSeuil(f: Pick<Finding, "mesure">): string {
  const { seuil, unite } = f.mesure;
  if (unite === "EUR") return formatEur(seuil);
  if (unite === "%") return pct(seuil);
  if (unite === "jours") return `${seuil} j`;
  return String(seuil);
}

/** Écart constaté − attendu, signé (« − » typographique pour une baisse). */
export function formatEcart(f: Pick<Finding, "mesure">): string {
  const { constate, seuil, unite } = f.mesure;
  const e = constate - seuil;
  const sign = e > 0 ? "+" : e < 0 ? "−" : "";
  if (unite === "EUR") return `${sign}${formatEur(e)}`;
  if (unite === "%") return `${sign}${Math.abs(e).toFixed(1).replace(".", ",")} pp`;
  if (unite === "jours") return `${sign}${Math.abs(e)} j`;
  return `${sign}${Math.abs(e).toFixed(2).replace(".", ",")}`;
}

/* ── Gravité ─────────────────────────────────────────────────────────────── */

/** Gravité la plus haute d'un ensemble de constats ; `null` s'il est vide. */
export function worstSeverity(findings: readonly Pick<Finding, "severity">[]): Severity | null {
  let worst: Severity | null = null;
  for (const f of findings) if (worst === null || SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[worst]) worst = f.severity;
  return worst;
}

const SCORE: Record<Severity, number> = { bloquant: 96, majeur: 72, mineur: 44, informatif: 20 };

/** Score d'exposition fixe selon la gravité dominante du silo (repère de lecture, pas une mesure). */
export function exposureScore(worst: Severity | null): number {
  return worst ? SCORE[worst] : 0;
}

export function severityCounts(findings: readonly Pick<Finding, "severity">[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { bloquant: 0, majeur: 0, mineur: 0, informatif: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

/* ── Effets (projection partagée avec la Synthèse) ───────────────────────── */

export interface SiloEffects {
  /** Exposition initiale non nulle, une ligne par poste et sens. */
  items: ScopedEffectItem[];
  /** Groupes d'effets indéterminés touchant le périmètre. */
  indeterminate: number;
  /** Constats mesurés en euros sans effet financier explicite : effet inconnu. */
  eurSignals: number;
}

export function siloEffects(exposure: Pick<ExposureDimension, "clusters">, findings: readonly Finding[]): SiloEffects {
  const scoped = restrictExposure(exposure, findings.map((f) => f.id));
  return {
    items: scopedEffectItems(scoped),
    indeterminate: scoped.indeterminateClusters.length,
    eurSignals: findings.filter(isEurSignalWithoutEffect).length,
  };
}

/** « Résultat − 312 000 € » : le poste, le sens, le montant — jamais une somme de postes. */
export function effectItemLabel(it: ScopedEffectItem, short = false): string {
  const target = short && it.target !== "resultat" ? EFFECT_TARGET_LABEL[it.target].replace("Bilan — ", "") : EFFECT_TARGET_LABEL[it.target];
  return `${target} ${it.sign} ${compactEur(it.initialCents / 100)}`;
}

/** Montant signé seul : « − 145 000 € ». */
export function effectAmountLabel(it: Pick<ScopedEffectItem, "sign" | "initialCents">): string {
  return `${it.sign} ${compactEur(it.initialCents / 100)}`;
}

/** Une diminution du résultat est mise en évidence (accent « signal ») ; le texte porte toujours le sens. */
export function isResultDecrease(it: Pick<ScopedEffectItem, "target" | "direction">): boolean {
  return it.target === "resultat" && it.direction === "decrease";
}

export interface EffectNoteItem {
  key: string;
  text: string;
  emphasis: boolean;
}

/**
 * Ce que la ligne d'un silo dit de ses effets, du plus informatif au plus prudent :
 * montants par poste et sens (deux au plus, puis « +N »), sinon montant indéterminé, sinon effet non chiffré
 * (signal EUR sans effet), sinon rien — aucun zéro n'est jamais affiché à la place d'un inconnu.
 */
export type EffectNote =
  | { kind: "quantified"; items: EffectNoteItem[]; more: number; indeterminate: boolean }
  | { kind: "indeterminate" }
  | { kind: "unquantified"; signals: number }
  | { kind: "none" };

export function effectNote(effects: SiloEffects, max = 2): EffectNote {
  if (effects.items.length > 0) {
    return {
      kind: "quantified",
      items: effects.items.slice(0, max).map((it) => ({ key: it.key, text: effectItemLabel(it, true), emphasis: isResultDecrease(it) })),
      more: Math.max(0, effects.items.length - max),
      indeterminate: effects.indeterminate > 0,
    };
  }
  if (effects.indeterminate > 0) return { kind: "indeterminate" };
  if (effects.eurSignals > 0) return { kind: "unquantified", signals: effects.eurSignals };
  return { kind: "none" };
}

/* ── Plan des cloisons ───────────────────────────────────────────────────── */

export interface PlanCell {
  siloId: string;
  label: string;
  comptes: readonly string[];
  cloisonId: CloisonId;
  worst: Severity | null;
  score: number;
  count: number;
  effects: SiloEffects;
  note: EffectNote;
}

export interface PlanGroup {
  cloisonId: CloisonId;
  label: string;
  cells: PlanCell[];
  findingCount: number;
}

export interface PlanColumn {
  key: string;
  /** Libellés des cloisons présentes, joints par « · » (« Annexe · TVA & fiscalité »). */
  title: string;
  groups: PlanGroup[];
  siloCount: number;
  findingCount: number;
}

export interface PlanBoard {
  key: string;
  columns: PlanColumn[];
}

export interface CloisonsPlan {
  /** Cloisons non vides dans l'ordre canonique : la liste des silos de la page. */
  groups: PlanGroup[];
  /** Disposition des états : bilan (actif | passif), puis résultat | annexe et fiscalité. */
  boards: PlanBoard[];
  siloCount: number;
  findingCount: number;
}

/**
 * Disposition des états financiers. Toute cloison de la taxonomie y figure une fois : un test le garantit,
 * pour qu'une cloison ajoutée plus tard ne disparaisse pas silencieusement du plan.
 */
export const PLAN_LAYOUT: readonly { key: string; columns: readonly (readonly CloisonId[])[] }[] = [
  { key: "bilan", columns: [["bilan-actif"], ["bilan-passif"]] },
  { key: "resultat-annexes", columns: [["resultat"], ["flux", "annexe", "journaux", "tva-fiscalite"]] },
];

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Range les silos par cloison (ordre de la taxonomie, ordre des silos du dossier conservé à l'intérieur) et
 * les dispose en plan. Un silo absent de la taxonomie est ignoré, comme dans la liste historique.
 */
export function buildCloisonsPlan(silos: readonly SiloView[], exposure: Pick<ExposureDimension, "clusters">): CloisonsPlan {
  const byCloison = new Map<CloisonId, PlanCell[]>();
  for (const s of silos) {
    const meta = siloById(s.siloId);
    if (!meta) continue;
    const worst = worstSeverity(s.findings);
    const effects = siloEffects(exposure, s.findings);
    const cell: PlanCell = {
      siloId: s.siloId,
      label: meta.label,
      comptes: meta.comptes,
      cloisonId: meta.cloison,
      worst,
      score: exposureScore(worst),
      count: s.findings.length,
      effects,
      note: effectNote(effects),
    };
    const list = byCloison.get(meta.cloison) ?? [];
    list.push(cell);
    byCloison.set(meta.cloison, list);
  }

  const groups: PlanGroup[] = CLOISONS.filter((c) => byCloison.has(c.id)).map((c) => {
    const cells = byCloison.get(c.id)!;
    return { cloisonId: c.id, label: c.label, cells, findingCount: sum(cells.map((x) => x.count)) };
  });
  const groupOf = new Map(groups.map((g) => [g.cloisonId, g] as const));

  const boards: PlanBoard[] = PLAN_LAYOUT.map((board) => ({
    key: board.key,
    columns: board.columns
      .map((ids) => {
        const colGroups = ids.map((id) => groupOf.get(id)).filter((g): g is PlanGroup => Boolean(g));
        return {
          key: ids.join("+"),
          title: colGroups.map((g) => g.label).join(" · "),
          groups: colGroups,
          siloCount: sum(colGroups.map((g) => g.cells.length)),
          findingCount: sum(colGroups.map((g) => g.findingCount)),
        };
      })
      .filter((col) => col.groups.length > 0),
  })).filter((board) => board.columns.length > 0);

  return {
    groups,
    boards,
    siloCount: sum(groups.map((g) => g.cells.length)),
    findingCount: sum(groups.map((g) => g.findingCount)),
  };
}

/* ── Mesure « exposition initiale » de l'en-tête ─────────────────────────── */

export interface ExposureContributor {
  siloId: string;
  label: string;
  /** Montant signé du silo pour ce poste et ce sens (« − 145 000 € »). */
  amount: string;
}

export interface ExposureLine {
  key: string;
  /** « Résultat » */
  target: string;
  /** « − 457 000 € » */
  amount: string;
  /** « Résultat − 457 000 € » */
  text: string;
  emphasis: boolean;
  /** Silos qui portent ce poste et ce sens, dans l'ordre du plan (lecture, pas une addition). */
  contributors: ExposureContributor[];
}

export interface ExposureMeasure {
  lines: ExposureLine[];
  indeterminate: number;
  eurSignals: number;
}

/** Effets de l'ensemble des silos, poste par poste et sens par sens, avec les silos qui les portent. */
export function exposureMeasure(plan: CloisonsPlan, total: SiloEffects): ExposureMeasure {
  const cells = plan.groups.flatMap((g) => g.cells);
  return {
    lines: total.items.map((it) => ({
      key: it.key,
      target: EFFECT_TARGET_LABEL[it.target],
      amount: effectAmountLabel(it),
      text: effectItemLabel(it),
      emphasis: isResultDecrease(it),
      contributors: cells.flatMap((cell) =>
        cell.effects.items.filter((x) => x.key === it.key).map((x) => ({ siloId: cell.siloId, label: cell.label, amount: effectAmountLabel(x) })),
      ),
    })),
    indeterminate: total.indeterminate,
    eurSignals: total.eurSignals,
  };
}

/* ── Revue ───────────────────────────────────────────────────────────────── */

/** Décision locale de la page (non persistée) : « accepté » n'existe pas dans le modèle de revue. */
export type UserDecision = "valide" | "ecarte" | "accepte";

export const STATUT_WORD: Record<StatutRevue | UserDecision, string> = {
  en_attente: "en attente",
  valide: "validé",
  accepte: "accepté",
  ecarte: "écarté",
};
