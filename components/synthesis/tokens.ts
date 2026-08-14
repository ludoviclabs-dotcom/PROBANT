/**
 * Jetons visuels partagés des composants de Synthèse.
 *
 * Mêmes valeurs que la page historique — la refonte réorganise la hiérarchie,
 * elle ne change pas la langue visuelle. Les tailles de police appliquent la
 * politique design PROBANT : contenu principal ≥ 14 px, tableaux ≥ 13 px,
 * métadonnées ≥ 12 px (choix produit, pas exigence normative).
 */

export const T = {
  accent: "#5b9dff",
  text: "#e6edf6",
  muted: "#8a99af",
  faint: "#5c6b82",
  border: "#1c2430",
  borderStrong: "#324563",
  surface: "#0b0e13",
  surface2: "#0f1419",
  surface3: "#151c25",
  critical: "#ef4444",
  warning: "#eab308",
  orange: "#f97316",
  positive: "#22c55e",
  violet: "#a78bfa",
} as const;

/** Tailles minimales de la politique typographique PROBANT (px). */
export const FONT = { body: 14, table: 13, meta: 12 } as const;

export const TONE_COLOR: Record<"critical" | "warning" | "positive" | "neutral" | "muted", string> = {
  critical: T.critical,
  warning: T.warning,
  positive: T.positive,
  neutral: T.accent,
  muted: T.faint,
};

/** Préfixe texte doublant la couleur (l'information n'est jamais couleur seule). */
export const TONE_PREFIX: Record<"critical" | "warning" | "positive" | "neutral", string> = {
  critical: "✖",
  warning: "⚠",
  positive: "✓",
  neutral: "•",
};

export const focusStyle = `
.pbz-focusable:focus-visible {
  outline: 2px solid ${T.accent};
  outline-offset: 2px;
  border-radius: 6px;
}
@media (prefers-reduced-motion: reduce) {
  .pbz-anim, .pbz-anim * { transition: none !important; animation: none !important; }
}
`;
