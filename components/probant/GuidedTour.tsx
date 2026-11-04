"use client";

/**
 * Point d'entrée de la « Visite guidée », monté une seule fois dans le layout racine.
 *
 * Il ne fait que lire `?guide=1` : le moteur de mise en scène (`components/demo/TourStage.tsx`), le script et le
 * jeu de données démo ne sont chargés qu'à ce moment-là — aucune page ne les télécharge hors visite.
 * Raccourcis : Échap quitte, ← → changent d'étape, Espace met en pause, Début rejoue, 1 à 5 ouvrent un chapitre.
 */

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const TourStage = dynamic(() => import("@/components/demo/TourStage"), { ssr: false, loading: () => null });

function GuidedTourGate() {
  const sp = useSearchParams();
  if (sp.get("guide") !== "1") return null;
  return <TourStage />;
}

export function GuidedTour() {
  return (
    <Suspense fallback={null}>
      <GuidedTourGate />
    </Suspense>
  );
}
