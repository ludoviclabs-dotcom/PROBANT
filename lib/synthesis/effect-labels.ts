/**
 * Libellés des effets par poste et par sens (C05) — partagés par la note, les vues de la
 * Synthèse, la cartographie des risques et la revue par cloison. Aucun calcul : la lecture
 * d'un périmètre vient de `restrictExposure`.
 */

import type { ScopedExposure } from "./exposure";
import type { EffectDirection, EffectStage, EffectTarget } from "./types";

export const EFFECT_TARGET_LABEL: Record<EffectTarget, string> = {
  resultat: "Résultat",
  bilan_actif: "Bilan — actif",
  bilan_passif: "Bilan — passif",
  capitaux_propres: "Capitaux propres",
  presentation: "Présentation",
};

const DIRECTION_LABEL: Record<EffectDirection, string> = { increase: "augmentation", decrease: "diminution" };

/** « Résultat · diminution » : un poste et un sens, jamais additionnés à un autre. */
export function effectStageLabel(st: Pick<EffectStage, "target" | "direction">): string {
  return `${EFFECT_TARGET_LABEL[st.target]} · ${DIRECTION_LABEL[st.direction]}`;
}

export interface ScopedEffectItem {
  key: string;
  target: EffectTarget;
  direction: EffectDirection;
  label: string;
  /** « + » augmentation, « − » diminution : le sens, pas une compensation. */
  sign: "+" | "−";
  /** Exposition initiale (groupes déterminés, hors constats écartés), en centimes. */
  initialCents: number;
}

/** Exposition initiale non nulle d'un périmètre, une ligne par poste et sens (ordre canonique). */
export function scopedEffectItems(scoped: Pick<ScopedExposure, "stages">): ScopedEffectItem[] {
  return scoped.stages
    .filter((st) => st.initialCents > 0)
    .map((st) => ({
      key: `${st.target}|${st.direction}`,
      target: st.target,
      direction: st.direction,
      label: effectStageLabel(st),
      sign: st.direction === "increase" ? "+" : "−",
      initialCents: st.initialCents,
    }));
}
