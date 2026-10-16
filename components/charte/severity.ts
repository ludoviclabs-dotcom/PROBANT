import type { FindingFamily, Severity } from "@/lib/canonical-model/finding";
import { SEVERITY_LABEL } from "@/lib/canonical-model/finding";
import { FAMILY_ORDER, FAMILY_TEXT, SEVERITIES } from "@/lib/synthese-view/common";

/**
 * Gravité et famille selon la charte : la gravité n'est jamais portée par la seule teinte.
 * Elle est codée par la luminosité, la FORME (carré plein, triangle plein, losange contour, cercle
 * contour) et le libellé ; la famille par le TRAIT (plein, tirets, pointillé). Les mots viennent du
 * modèle (`SEVERITY_LABEL`, `FAMILY_TEXT`) ; ce module n'ajoute que le dessin.
 */

export { SEVERITY_LABEL, FAMILY_ORDER };
export const SEVERITY_ORDER = SEVERITIES;

/** Forme du glyphe dans une boîte de 10 × 10 : plein (`fill`) ou contour (`stroke`). */
export interface SeverityGlyph {
  path: string;
  paint: "fill" | "stroke";
  /** Variable de couleur de l'ambiance courante. */
  color: string;
}

export const SEVERITY_GLYPH: Record<Severity, SeverityGlyph> = {
  bloquant: { path: "M1.5 1.5h7v7h-7z", paint: "fill", color: "var(--pb-sev-bloquant)" },
  majeur: { path: "M5 1.2 9.2 8.8H.8z", paint: "fill", color: "var(--pb-sev-majeur)" },
  mineur: { path: "M5 1.4 8.6 5 5 8.6 1.4 5z", paint: "stroke", color: "var(--pb-sev-mineur)" },
  informatif: { path: "M1.7 5a3.3 3.3 0 1 0 6.6 0a3.3 3.3 0 1 0-6.6 0", paint: "stroke", color: "var(--pb-sev-informatif)" },
};

export type FamilyKey = "dd" | "pa" | "pi";

export interface FamilySpec {
  key: FamilyKey;
  /** Libellé court (journal, légendes). */
  label: string;
  /** Libellé de strate normative. */
  long: string;
  /** Épaisseur du trait (px). */
  width: number;
  /** `stroke-dasharray` ; `none` pour le trait plein. */
  dash: string;
  /** Variable de couleur du trait. */
  color: string;
}

export const FAMILY: Record<FindingFamily, FamilySpec> = {
  hardLaw: { key: "dd", label: FAMILY_TEXT.hardLaw.label, long: FAMILY_TEXT.hardLaw.long, width: 2, dash: "none", color: "var(--pb-ink)" },
  methodology: { key: "pa", label: FAMILY_TEXT.methodology.label, long: FAMILY_TEXT.methodology.long, width: 1.5, dash: "4 3", color: "var(--pb-ink-2)" },
  internal: { key: "pi", label: FAMILY_TEXT.internal.label, long: FAMILY_TEXT.internal.long, width: 1.2, dash: "1 3", color: "var(--pb-ink-3)" },
};

/** Libellé de gravité en minuscules (phrases, filtres). */
export function severityWord(severity: Severity): string {
  return SEVERITY_LABEL[severity].toLowerCase();
}
