/**
 * Langue visuelle « cabinet d'audit » du cockpit fiscalité (refonte TAX-08).
 *
 * Complète les jetons de Synthèse sans les redéfinir : les couleurs
 * sémantiques restent celles de `T`. Ce module ajoute la typographie
 * éditoriale, l'élévation par luminosité (zones teintées sans bordure) et les
 * animations — toutes désactivées sous `prefers-reduced-motion`.
 */

import { T } from "@/components/synthesis/tokens";

export const FAMILY = {
  editorial: "var(--font-editorial), 'Instrument Serif', Georgia, serif",
  sans: "var(--font-plex-sans), 'IBM Plex Sans', var(--font-inter), system-ui, sans-serif",
  mono: "var(--font-plex-mono), 'IBM Plex Mono', var(--font-jetbrains-mono), ui-monospace, monospace",
} as const;

/** Élévation par luminosité : +2 % / +4 % / +6 % au-dessus du fond. */
export const ELEVATION = {
  1: "rgba(255,255,255,.02)",
  2: "rgba(255,255,255,.035)",
  3: "rgba(255,255,255,.06)",
} as const;

/**
 * Texte secondaire discret. `T.faint` (#5c6b82) plafonne à ~3,6:1 sur les
 * fonds du cockpit ; cette teinte tient ≥ 4,6:1 (AA) sur toutes les zones.
 */
export const INK_FAINT = "#7a89a0";

/** Filet discret — utilisé seulement là où il porte une information. */
export const HAIRLINE = "rgba(255,255,255,.08)";

export const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".16em",
  color: INK_FAINT,
};

export const ACT_TITLE: React.CSSProperties = {
  margin: "12px 0 0",
  fontFamily: FAMILY.editorial,
  fontSize: 32,
  fontWeight: 400,
  lineHeight: 1.2,
  color: T.text,
};

export const BLOCK_TITLE: React.CSSProperties = {
  margin: 0,
  fontFamily: FAMILY.sans,
  fontSize: 15,
  fontWeight: 600,
  color: T.text,
};

/** Phrase de lecture placée au-dessus d'un graphique. */
export const READING: React.CSSProperties = {
  margin: "6px 0 0",
  maxWidth: "62ch",
  fontSize: 13,
  lineHeight: 1.65,
  color: T.muted,
  textWrap: "pretty",
};

export const AMOUNT: React.CSSProperties = {
  fontFamily: FAMILY.mono,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

/** Lien discret « Sources et méthodologie ↓ ». */
export const QUIET_BUTTON: React.CSSProperties = {
  border: 0,
  background: "transparent",
  padding: "2px 0",
  fontSize: 12,
  color: T.muted,
  cursor: "pointer",
};

export const SECTION: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "72px 24px 0",
};

/**
 * Keyframes et classes utilitaires. Règle : aucune animation > 500 ms, rien en
 * boucle hors le point de statut et la scène de la chaîne de preuve.
 */
export const cockpitCss = `
@keyframes pbzRiseIn { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
@keyframes pbzFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes pbzBarIn { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes pbzPulseDot { 0%,100% { transform: scale(1); opacity: .45; } 50% { transform: scale(1.15); opacity: .9; } }
@keyframes pbzTilt { 0%,100% { transform: rotateX(58deg) rotateZ(-42deg); } 50% { transform: rotateX(58deg) rotateZ(-34deg); } }
@keyframes pbzFlow { 0% { transform: translateZ(-60px); opacity: 0; } 30% { opacity: .9; } 100% { transform: translateZ(110px); opacity: 0; } }
@keyframes pbzLayerPulse { from { opacity: .55; } to { opacity: 1; } }
@keyframes pbzSlideIn { from { transform: translateX(100%); } to { transform: none; } }
.pbz-reveal-pre { opacity: 0; }
.pbz-reveal-in { animation: pbzRiseIn .4s ease-out both; }
.pbz-bar { transform-origin: left; animation: pbzBarIn .45s cubic-bezier(.2,.7,.3,1) both; }
.pbz-fade { animation: pbzFadeIn .25s ease-out both; }
.pbz-hoverable { transition: background .2s ease, transform .2s ease, box-shadow .2s ease; }
.pbz-hoverable:hover { background: ${ELEVATION[3]} !important; transform: translateY(-2px); box-shadow: 0 10px 24px rgba(0,0,0,.35); }
.pbz-row { transition: background .18s ease; }
.pbz-row:hover { background: rgba(255,255,255,.04); }
.pbz-quiet:hover { color: ${T.text} !important; }
.pbz-filepick:focus-within { outline: 2px solid ${T.accent}; outline-offset: 2px; }
.pbz-decision-bar { position: sticky; bottom: 0; }
@media (max-width: 720px) { .pbz-decision-bar { position: static; } }
.pbz-comment { transition: flex-grow .25s ease; }
.pbz-comment:focus { flex-grow: 3 !important; }
@media (prefers-reduced-motion: reduce) {
  .pbz-reveal-pre { opacity: 1; }
  .pbz-reveal-in, .pbz-bar, .pbz-fade, .pbz-motion, .pbz-motion * { animation: none !important; }
  .pbz-hoverable, .pbz-row { transition: none !important; }
  .pbz-hoverable:hover { transform: none; }
}
`;
