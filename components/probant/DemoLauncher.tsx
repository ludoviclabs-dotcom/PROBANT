"use client";

/**
 * Bouton de lancement de la « Visite guidée ». Ouvre la première étape (`?guide=1&etape=0`) sur le dossier
 * démo DEMO SA — la narration cite ses chiffres, elle ne se joue jamais sur un autre dossier ; le moteur
 * <GuidedTour/> (monté dans le layout racine) prend alors la main. L'habillage est celui de l'appelant
 * (landing, rail du tableau de bord) : ce composant ne porte que le comportement.
 */

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TOUR_ENTRY_ROUTE, tourHref } from "@/lib/demo/tour-entry";

export function DemoLauncher({ className, children }: { className?: string; children: ReactNode }) {
  const router = useRouter();
  const start = () => router.push(tourHref(TOUR_ENTRY_ROUTE, 0));

  return (
    <button type="button" onClick={start} className={className}>
      {children}
    </button>
  );
}
