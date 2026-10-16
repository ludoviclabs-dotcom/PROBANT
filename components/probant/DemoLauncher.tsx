"use client";

/**
 * Bouton de lancement de la « Visite guidée ». Pose `?guide=1&etape=0` sur la
 * route de la 1ʳᵉ étape ; le moteur <GuidedTour/> (monté dans le layout racine)
 * prend alors la main. L'habillage est celui de l'appelant (landing, rail du
 * tableau de bord) : ce composant ne porte que le comportement.
 */

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TOUR_STEPS } from "@/lib/demo/tour";
import { useDossierHref } from "./DossierContextLink";

export function DemoLauncher({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  const contextual = useDossierHref();
  const start = () => router.push(contextual(`${TOUR_STEPS[0].route}?guide=1&etape=0`));

  return (
    <button type="button" onClick={start} className={className}>
      {children}
    </button>
  );
}
