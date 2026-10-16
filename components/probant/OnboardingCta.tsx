"use client";

/**
 * Entrée vers le flow d'onboarding (/onboarding), qui reprend le dépôt FEC
 * existant (DepotView) dans un stepper 3 étapes. Posé à droite du bandeau
 * « Mode démo » du tableau de bord (components/instruments/DemoBanner.tsx) :
 * une ligne de texte soulignée, sans bouton flottant ni pastille. L'habillage
 * est celui de l'appelant ; ce composant ne porte que le lien et son suivi.
 */

import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import { track } from "@/lib/analytics/track";

export function OnboardingCta({ className }: { className?: string }) {
  return (
    <Link
      href="/onboarding"
      onClick={() => track("cta_clicked", { location: "demo_banner", variant: "banner" })}
      className={className}
    >
      Importer mon FEC →
    </Link>
  );
}
