import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formate un montant en euros, police tabulaire côté UI. */
export function formatEUR(value: number, opts?: { sign?: boolean }): string {
  const formatted = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
  if (opts?.sign && value < 0) return `(${formatted})`;
  return value < 0 ? `-${formatted}` : formatted;
}

/** Formate un pourcentage. */
export function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)} %`;
}

/** Convertit une date FEC AAAAMMJJ en JJ/MM/AAAA pour affichage. */
export function formatFecDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}

// ---------------------------------------------------------------------------
// Contraste WCAG pour cellules/badges colorés par `color-mix(..., transparent)`
// ---------------------------------------------------------------------------
// Plusieurs vues (matrice de risques, badges de bande) posent un texte par-
// dessus un fond `color-mix(in srgb, <hex> X%, transparent)` rendu sur la
// surface sombre `--pb-surface`. À forte opacité, ce fond peut devenir clair
// (jaune/orange), rendant un texte blanc illisible (échec WCAG AA, ratio
// < 4.5:1). Ces fonctions calculent le contraste RÉEL du fond composité et
// choisissent la couleur de texte adéquate, cellule par cellule — jamais un
// changement global qui casserait les fonds sombres où le blanc est correct.

/** Fond réel derrière les cellules colorées (`--pb-surface`, voir app/globals.css). */
export const WCAG_CELL_BASE_BG = "#111722";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Composite `color-mix(in srgb, hex pct%, transparent)` par-dessus `bg` (alpha blending simple, sRGB). */
function mixOverBg(hex: string, pct: number, bg: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const [br, bgc, bb] = hexToRgb(bg);
  const a = Math.max(0, Math.min(100, pct)) / 100;
  return [r * a + br * (1 - a), g * a + bgc * (1 - a), b * a + bb * (1 - a)];
}

/** Luminance relative WCAG d'une couleur sRGB (0-255 par canal). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [channel(r), channel(g), channel(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** Ratio de contraste WCAG entre deux couleurs sRGB. */
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Choisit blanc (`#fff`) ou sombre (`#0b0f16`) pour un texte posé sur
 * `color-mix(in srgb, hex pct%, transparent)` par-dessus `bg` (par défaut
 * `WCAG_CELL_BASE_BG`). Calcule le contraste WCAG réel des deux options et
 * retient celle qui atteint AA (≥ 4.5:1) ; si aucune n'atteint le seuil,
 * retient celle du meilleur ratio.
 */
export function wcagTextOnMix(hex: string, pct: number, bg: string = WCAG_CELL_BASE_BG): string {
  const mixed = mixOverBg(hex, pct, bg);
  const white: [number, number, number] = [255, 255, 255];
  const dark: [number, number, number] = [11, 15, 22];
  const contrastWhite = contrastRatio(mixed, white);
  const contrastDark = contrastRatio(mixed, dark);
  if (contrastWhite >= 4.5) return "#fff";
  if (contrastDark >= 4.5) return "#0b0f16";
  return contrastWhite >= contrastDark ? "#fff" : "#0b0f16";
}

/**
 * Variante retournant soit `hex` tel quel (texte coloré, si son contraste sur
 * le fond composité atteint AA), soit `fallback` (par défaut le token clair
 * `--pb-text`, `#e6edf6`) sinon. Utile pour les badges qui préfèrent garder
 * un texte teinté quand c'est lisible, plutôt que de toujours basculer en
 * blanc/sombre pur.
 */
export function wcagColoredTextOrFallback(
  hex: string,
  pct: number,
  bg: string = WCAG_CELL_BASE_BG,
  fallback = "#e6edf6",
): string {
  const mixed = mixOverBg(hex, pct, bg);
  const contrastHex = contrastRatio(mixed, hexToRgb(hex));
  return contrastHex >= 4.5 ? hex : fallback;
}
