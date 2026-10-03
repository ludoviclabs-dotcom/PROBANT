import { IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import { plexMono } from "@/components/referentiel/fonts";

/**
 * Langage visuel de la refonte « cabinet d'audit » du cockpit fiscalité
 * (maquette Claude Design `Fiscalite Refonte`) : serif éditorial pour les
 * titres d'actes, IBM Plex Sans pour les libellés, IBM Plex Mono tabulaire
 * pour tous les chiffres financiers.
 */
export const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument-serif",
});

export const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex-sans",
});

export { plexMono };

export const FONT_CLASSES = `${instrumentSerif.variable} ${plexSans.variable} ${plexMono.variable}`;

export const SERIF = "var(--font-instrument-serif), 'Instrument Serif', Georgia, serif";
export const SANS = "var(--font-plex-sans), 'IBM Plex Sans', sans-serif";
export const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";
export const BODY = "var(--font-sans), Inter, system-ui, sans-serif";

/** Palette de la maquette. Une seule couleur d'accent à la fois (ambre sauf incohérence). */
export const C = {
  bg: "#0A0B0F",
  text: "#E6EDF6",
  textSoft: "#C7D3E4",
  body: "#9CA7B8",
  muted: "#8A99AF",
  // La maquette utilise #5C6B82 (3,6:1 sur le fond) : relevé à ≥ 4,8:1 pour tenir l'AA
  // sur le texte secondaire (exigence du prompt de refonte, vérifiée par axe-core).
  faint: "#76859B",
  accent: "#5B9DFF",
  accentHover: "#7FB2FF",
  violet: "#A78BFA",
  teal: "#2DD4BF",
  green: "#22C55E",
  amber: "#EAB308",
  amberSoft: "#F5D76B",
  orange: "#F97316",
  red: "#EF4444",
  panel: "#13161D",
  drawer: "#14171E",
  line: "rgba(255,255,255,.07)",
  lineSoft: "rgba(255,255,255,.06)",
  lineStrong: "rgba(255,255,255,.1)",
  fill: "rgba(255,255,255,.03)",
  track: "rgba(255,255,255,.04)",
} as const;

export type Tone = "critical" | "warning" | "positive" | "neutral";

/** Couleur de statut — toujours doublée d'un libellé texte, jamais couleur seule. */
export const TONE: Readonly<Record<Tone, string>> = {
  critical: C.red,
  warning: C.amber,
  positive: C.green,
  neutral: C.accent,
};

export const TONE_MARK: Readonly<Record<Tone, string>> = {
  critical: "✖",
  warning: "⚠",
  positive: "✓",
  neutral: "•",
};

/** Sorties de contrôle → couleur (le risque potentiel garde l'orange de la légende). */
export const OUTCOME_COLOR: Readonly<Record<string, string>> = {
  passed: C.green,
  confirmed_non_compliance: C.red,
  reconciliation_difference: C.red,
  potential_tax_risk: C.orange,
  missing_information: C.amber,
  inconclusive: C.accent,
  review_recommendation: C.accent,
};

export const OUTCOME_MARK: Readonly<Record<string, string>> = {
  passed: "✓",
  confirmed_non_compliance: "✖",
  reconciliation_difference: "✖",
  potential_tax_risk: "⚠",
  missing_information: "⚠",
  inconclusive: "•",
  review_recommendation: "•",
};
