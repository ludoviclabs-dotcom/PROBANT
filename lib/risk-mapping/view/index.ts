/**
 * Cartographie des risques — modèles de vue (mise en forme pure, aucun calcul faisant autorité).
 *
 * Le moteur (`scoring.ts`) produit le composite brut et sa bande ; ce module ne fait que préparer ce que la page
 * affiche : valeur entière du composite, plages des bandes, répartition, écart avec un exercice simulé, filtres et
 * tri du registre. Il ne modifie aucune formule de scoring.
 *
 * Affichage du composite — partie entière (troncature), jamais l'arrondi au plus proche. Les bandes sont des
 * intervalles semi-ouverts à bornes entières (faible [0,25[, modéré [25,55[, élevé [55,75[, critique [75,100]) :
 * pour toute borne entière t, `floor(x) ≥ t ⇔ x ≥ t`. L'entier affiché tombe donc TOUJOURS dans la bande calculée
 * par le moteur sur la valeur brute. L'arrondi au plus proche cassait cette égalité près d'une borne (24,54 affiché
 * « 25 » avec la bande « Faible », alors que la légende dit Modéré = 25-54). L'écart d'affichage reste inférieur à
 * un point sur une heuristique interne 0-100 ; la valeur à une décimale (tronquée elle aussi) reste lisible au survol.
 */

import type { CriticityBand, CycleRiskScore, EvaluationState } from "../types";
import { criticityBand } from "../scoring";
import { CURRENT_EXERCISE, simulateHistoricalComposite, type HistoricalExercise } from "../historical";

/** Bandes de la plus grave à la moins grave, « non évalué » en dernier (jamais assimilé à « faible »). */
export const BAND_ORDER: readonly CriticityBand[] = ["critique", "élevé", "modéré", "faible", "non_évalué"];

export const BAND_LABEL: Record<CriticityBand, string> = {
  critique: "Critique",
  élevé: "Élevé",
  modéré: "Modéré",
  faible: "Faible",
  non_évalué: "Non évalué",
};

export type ScoredBand = Exclude<CriticityBand, "non_évalué">;

/**
 * Plages entières affichées, lues sur la partie entière du composite. Elles reprennent les bornes de
 * `criticityBand` (la cohérence est vérifiée par les tests, pas recopiée ici comme une seconde vérité).
 */
export const BAND_RANGE: Record<ScoredBand, { min: number; max: number }> = {
  faible: { min: 0, max: 24 },
  modéré: { min: 25, max: 54 },
  élevé: { min: 55, max: 74 },
  critique: { min: 75, max: 100 },
};

/** « 25-54 » ; `null` pour « non évalué », qui n'a pas de plage (ce n'est pas une valeur basse). */
export function bandRangeText(band: CriticityBand): string | null {
  if (band === "non_évalué") return null;
  const r = BAND_RANGE[band];
  return `${r.min}-${r.max}`;
}

/** Composite affiché : partie entière, bornée à [0,100]. `null` (non évalué) reste `null`, jamais 0. */
export function displayComposite(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.floor(Math.min(100, Math.max(0, value)));
}

/** Texte du composite : entier, ou « — » quand il n'existe pas. */
export function compositeText(value: number | null): string {
  const shown = displayComposite(value);
  return shown === null ? "—" : String(shown);
}

/**
 * Valeur à une décimale, TRONQUÉE elle aussi (24,96 → « 24,9 », jamais « 25,0 ») pour rester dans la bande du
 * moteur. Sert au survol et au panneau de détail.
 */
export function compositePreciseText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "non évalué";
  const tenth = Math.floor(Math.min(100, Math.max(0, value)) * 10) / 10;
  return tenth.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Valeur d'axe affichée (0-100, arrondie : un axe n'est pas découpé en bandes). */
export function axisText(value: number): string {
  return String(Math.round(Math.min(100, Math.max(0, value))));
}

/** Largeur (en %) d'une jauge d'axe : la valeur brute, bornée. */
export function gaugeWidth(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export const EVALUATION_LABEL: Record<EvaluationState, string> = {
  évalué: "Évalué",
  partiel: "Exposition seule",
  non_évalué: "Non évalué",
};

/** Texte d'une ligne de registre sans composite : jamais présentée comme un risque maîtrisé. */
export function unevaluatedText(evaluation: EvaluationState): string {
  return evaluation === "partiel"
    ? "exposition seule — composite non évalué, jamais assimilé à un risque maîtrisé"
    : "non évalué — jamais assimilé à un risque maîtrisé";
}

// ── Répartition ────────────────────────────────────────────────────────────

export interface DistributionEntry {
  band: CriticityBand;
  label: string;
  range: string | null;
  count: number;
  /** Pourcentage entier du total (affichage). */
  percent: number;
}

/** Répartition par bande dans l'ordre de gravité, « non évalué » compris (compté à part, jamais fondu dans « faible »). */
export function buildDistribution(distribution: Record<CriticityBand, number>, total: number): DistributionEntry[] {
  return BAND_ORDER.map((band) => {
    const count = distribution[band] ?? 0;
    return {
      band,
      label: BAND_LABEL[band],
      range: bandRangeText(band),
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
}

// ── Écart avec un exercice simulé ──────────────────────────────────────────

export interface DeltaView {
  kind: "na" | "stable" | "up" | "down";
  /** Écart en points entre les deux entiers affichés ; `null` si non comparable. */
  points: number | null;
  /** « +3 », « −3 » (signe moins typographique) ou « — ». */
  text: string;
  /** Mot qui accompagne toujours le chiffre (la couleur seule ne porte rien). */
  word: string;
  title: string;
}

/**
 * Écart entre le composite de l'exercice réel et celui, SIMULÉ, d'un exercice antérieur. Les deux termes sont les
 * entiers que la page affiche : composite réel en partie entière, composite simulé tel que produit par
 * `simulateHistoricalComposite` (déjà entier). `current` est le composite de l'exercice réel (jamais une valeur
 * déjà substituée par la simulation d'exercice).
 */
export function exerciseDelta(cycleSlug: string, current: number | null, exercise: HistoricalExercise): DeltaView {
  const shown = displayComposite(current);
  const past = exercise === CURRENT_EXERCISE ? shown : simulateHistoricalComposite(cycleSlug, current, exercise);
  const label = `Vs exercice ${exercise} (simulé)`;
  if (shown === null || past === null) {
    return { kind: "na", points: null, text: "—", word: "non comparable", title: `${label} : non comparable` };
  }
  const points = shown - past;
  if (points === 0) return { kind: "stable", points: 0, text: "—", word: "stable", title: `${label} : stable` };
  const text = points > 0 ? `+${points}` : `−${Math.abs(points)}`;
  return points > 0
    ? { kind: "up", points, text, word: "hausse", title: `${label} : composite en hausse (${text})` }
    : { kind: "down", points, text, word: "baisse", title: `${label} : composite en baisse (${text})` };
}

// ── Filtres du registre ────────────────────────────────────────────────────

export interface RegisterFilter {
  query: string;
  /** Texte saisi dans « Composite > » ; vide = pas de seuil. */
  minComposite: string;
  visibleBands: Record<CriticityBand, boolean>;
  /** Filtre posé par la répartition (une seule bande), `null` = aucun. */
  activeBand: CriticityBand | null;
}

export const ALL_BANDS_VISIBLE: Record<CriticityBand, boolean> = {
  faible: true,
  modéré: true,
  élevé: true,
  critique: true,
  non_évalué: true,
};

export interface RegisterSelection {
  rows: CycleRiskScore[];
  /** Cycles sans composite écartés par un seuil actif : signalés, jamais comptés comme « sous le seuil ». */
  hiddenUnevaluated: number;
  thresholdActive: boolean;
}

/** Seuil « Composite > » interprété : nombre fini strictement positif, sinon inactif. */
export function parseThreshold(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Lignes visibles du registre. Le seuil compare l'entier AFFICHÉ (« Composite > 24 » masque une ligne affichée 24),
 * et un cycle sans composite n'est jamais « au-dessus » ni « au-dessous » d'un seuil : il est écarté et compté à part.
 */
export function filterRegister(scores: readonly CycleRiskScore[], filter: RegisterFilter): RegisterSelection {
  const byBand = scores.filter(
    (s) => filter.visibleBands[s.criticityBand] && (filter.activeBand === null || s.criticityBand === filter.activeBand),
  );
  const threshold = parseThreshold(filter.minComposite);
  const query = filter.query.trim().toLowerCase();
  const rows = byBand.filter((s) => {
    if (query && !s.cycleSlug.toLowerCase().includes(query)) return false;
    if (threshold !== null) {
      const shown = displayComposite(s.composite);
      if (shown === null || shown <= threshold) return false;
    }
    return true;
  });
  return {
    rows,
    hiddenUnevaluated: threshold === null ? 0 : byBand.filter((s) => s.composite === null).length,
    thresholdActive: threshold !== null,
  };
}

/** Nombre de cycles par bande (sur les scores reçus, indépendamment de la recherche). */
export function countByBand(scores: readonly CycleRiskScore[]): Record<CriticityBand, number> {
  const counts: Record<CriticityBand, number> = { faible: 0, modéré: 0, élevé: 0, critique: 0, non_évalué: 0 };
  for (const s of scores) counts[s.criticityBand] += 1;
  return counts;
}

// ── Tri du registre ────────────────────────────────────────────────────────

export interface SortEntry {
  id: string;
  desc: boolean;
}

export const DEFAULT_SORT: SortEntry[] = [{ id: "composite", desc: true }];

/** Cycle d'un en-tête : décroissant → croissant → aucun tri. */
export function nextSort(current: readonly SortEntry[], columnId: string): SortEntry[] {
  const entry = current.find((s) => s.id === columnId);
  if (!entry) return [{ id: columnId, desc: true }];
  if (entry.desc) return [{ id: columnId, desc: false }];
  return [];
}

export function ariaSort(current: readonly SortEntry[], columnId: string): "ascending" | "descending" | "none" {
  const entry = current.find((s) => s.id === columnId);
  if (!entry) return "none";
  return entry.desc ? "descending" : "ascending";
}

/** Tri restauré du stockage local ; `null` si absent, illisible ou mal formé (le rendu ne doit jamais casser). */
export function parseStoredSort(raw: string | null): SortEntry[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.every(
      (e) => !!e && typeof e === "object" && typeof (e as SortEntry).id === "string" && typeof (e as SortEntry).desc === "boolean",
    );
    return valid ? (parsed as SortEntry[]).map((e) => ({ id: e.id, desc: e.desc })) : null;
  } catch {
    return null;
  }
}

/** Bande lue sur l'entier affiché : sert aux tests de cohérence (doit égaler la bande du moteur). */
export function bandOfDisplayed(value: number | null): CriticityBand {
  return criticityBand(displayComposite(value));
}
