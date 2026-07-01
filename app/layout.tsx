import type { Metadata } from "next";
import "./globals.css";
import { GuidedTour } from "@/components/probant/GuidedTour";
import { AxeCoreDevTools } from "@/components/probant/AxeCoreDevTools";

export const metadata: Metadata = {
  title: "PROBANT — Revue analytique des états financiers",
  description:
    "Orchestrateur de conformité analytique : ingestion FEC, détection d'anomalies par cloison, dossier de preuve opposable.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className="dark">
      <body>
        {children}
        <GuidedTour />
        <AxeCoreDevTools />
      </body>
    </html>
  );
}
