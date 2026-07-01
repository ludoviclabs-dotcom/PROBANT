/**
 * Cartographie des risques — logique de persistance des ajustements, PURE.
 *
 * Aucun accès direct au storage (pas de `sessionStorage` ici), aucun import
 * React ni `fs`, aucun `Date.now()` : l'horodatage `touchedAt` est reçu en
 * argument. Ce module se contente de fusionner, borner et (dé)sérialiser une
 * `RiskAdjustmentMap`. La lecture/écriture réelle du storage est faite par le
 * hook client (`useRiskAdjustments`).
 *
 * Rappel de fiabilité : l'ajustement est une surcouche de jugement, bornée et
 * additive. L'auto reste toujours recalculé depuis les données ; un ajustement
 * n'altère jamais un fait.
 */

import type { RiskAdjustment, RiskAdjustmentMap } from "./types";

/**
 * Clé de session unique des ajustements (famille de clés `probant:*`).
 */
export const RISK_ADJUSTMENTS_KEY = "probant:risk-adjustments";

/** Borne d'un cran d'ajustement manuel. */
export const ADJUSTMENT_MIN = -2;
export const ADJUSTMENT_MAX = 2;

/**
 * Champs numériques ajustables d'un cycle. Un patch peut n'en toucher qu'un.
 */
export type AdjustmentPatch = Partial<Pick<RiskAdjustment, "probabilite" | "detectabilite" | "note">>;

/**
 * Map d'ajustements vide. Fonction (et non constante partagée) pour éviter tout
 * partage de référence mutable entre appelants.
 */
export function emptyAdjustments(): RiskAdjustmentMap {
  return {};
}

/**
 * Borne une valeur d'ajustement dans [-2, +2] et l'arrondit à l'entier le plus
 * proche (les crans sont discrets). Une valeur non finie retombe à 0.
 */
export function clampAdjustment(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round(value);
  return Math.min(ADJUSTMENT_MAX, Math.max(ADJUSTMENT_MIN, rounded));
}

/**
 * Fusionne un patch dans la map pour un cycle donné, sans muter l'entrée : on
 * renvoie une nouvelle map. Les valeurs numériques sont bornées ; `touchedAt`
 * est fourni par l'appelant (jamais `Date.now()` ici).
 */
export function mergeAdjustment(
  map: RiskAdjustmentMap,
  slug: string,
  patch: AdjustmentPatch,
  touchedAt: string,
): RiskAdjustmentMap {
  const current: RiskAdjustment = map[slug] ?? {
    probabilite: 0,
    detectabilite: 0,
    touchedAt,
  };

  const next: RiskAdjustment = {
    probabilite:
      patch.probabilite === undefined
        ? current.probabilite
        : clampAdjustment(patch.probabilite),
    detectabilite:
      patch.detectabilite === undefined
        ? current.detectabilite
        : clampAdjustment(patch.detectabilite),
    touchedAt,
  };

  const note = patch.note === undefined ? current.note : patch.note;
  if (note !== undefined && note !== "") {
    next.note = note;
  }

  return { ...map, [slug]: next };
}

/**
 * Sérialise la map en chaîne JSON stable pour le storage.
 */
export function serializeAdjustments(map: RiskAdjustmentMap): string {
  return JSON.stringify(map);
}

/**
 * Parse tolérant : toute entrée invalide (JSON illisible, structure inattendue,
 * valeurs hors bornes) est ignorée. En cas d'erreur globale → map vide. Aucune
 * exception ne remonte à l'appelant.
 */
export function parseAdjustments(raw: string | null | undefined): RiskAdjustmentMap {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return {};
    }
    const result: RiskAdjustmentMap = {};
    for (const [slug, value] of Object.entries(parsed)) {
      const adjustment = coerceAdjustment(value);
      if (adjustment) {
        result[slug] = adjustment;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Convertit une valeur brute en `RiskAdjustment` en bornant les crans et en ne
 * conservant que les champs reconnus. Renvoie `null` si rien d'exploitable.
 */
function coerceAdjustment(value: unknown): RiskAdjustment | null {
  if (!isRecord(value)) {
    return null;
  }

  const probabilite = clampAdjustment(toNumber(value.probabilite));
  const detectabilite = clampAdjustment(toNumber(value.detectabilite));
  const touchedAt = typeof value.touchedAt === "string" ? value.touchedAt : "";

  const adjustment: RiskAdjustment = { probabilite, detectabilite, touchedAt };
  if (typeof value.note === "string" && value.note !== "") {
    adjustment.note = value.note;
  }
  return adjustment;
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
