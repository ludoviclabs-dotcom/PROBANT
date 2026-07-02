import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { GuidedTour } from "@/components/probant/GuidedTour";
import { AxeCoreDevTools } from "@/components/probant/AxeCoreDevTools";

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

export const metadata: Metadata = {
  title: "PROBANT — Revue analytique des états financiers",
  description:
    "Orchestrateur de conformité analytique : ingestion FEC, détection d'anomalies par cloison, dossier de preuve opposable.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        {children}
        <GuidedTour />
        <AxeCoreDevTools />
      </body>
    </html>
  );
}
