import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { GuidedTour } from "@/components/probant/GuidedTour";
import { AxeCoreDevTools } from "@/components/probant/AxeCoreDevTools";
import { WebVitalsReporter } from "@/components/probant/WebVitalsReporter";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

// Typographie éditoriale du cockpit fiscalité : titres serif, chiffres tabulaires.
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-editorial",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "PROBANT — Revue analytique des états financiers",
  description:
    "Orchestrateur de conformité analytique : ingestion FEC, détection d'anomalies par cloison, dossier de preuve opposable.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`dark ${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>
        {children}
        <GuidedTour />
        <AxeCoreDevTools />
        <WebVitalsReporter />
      </body>
    </html>
  );
}
