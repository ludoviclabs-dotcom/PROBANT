import { IBM_Plex_Mono } from "next/font/google";

/** Chiffres, versions et références de la page Référentiel (maquette Claude Design). */
export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";
export const DD = "#8b9cff";
export const ME = "#d19a4a";
