import { Geist, IBM_Plex_Mono, Newsreader } from "next/font/google";

/**
 * Polices de la charte de direction artistique : Newsreader (serif éditorial),
 * Geist (interface) et IBM Plex Mono (chiffres, comptes, repères). Elles sont
 * téléchargées au build et auto-hébergées par Next : aucune requête vers Google
 * à l'exécution, l'outil reste utilisable hors ligne.
 *
 * Déclarées ici, pas dans le layout racine : Next ne précharge alors ces fichiers
 * que pour les routes qui les utilisent (landing et tableau de bord). Les pages
 * non migrées gardent Inter et JetBrains Mono.
 */

export const newsreader = Newsreader({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-newsreader",
});

export const geist = Geist({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-geist",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

/** Classes à poser sur l'élément qui porte `data-ambiance` : elles définissent les trois variables de police. */
export const charteFonts = `${newsreader.variable} ${geist.variable} ${plexMono.variable}`;
