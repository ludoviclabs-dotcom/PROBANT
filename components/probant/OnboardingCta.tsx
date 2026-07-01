"use client";

/**
 * CTA d'entrée vers le flow d'onboarding (/onboarding), qui reprend le dépôt
 * FEC existant (DepotView) dans un stepper 3 étapes. Deux habillages :
 *  - `banner` : bouton inline, affiché à côté du badge « Mode démo » dans le
 *    bandeau du dashboard (app/dashboard/layout.tsx).
 *  - `floating` : bouton flottant discret, coin bas-droit, visible sur les
 *    pages du dashboard sauf sur /onboarding lui-même (best-effort via
 *    usePathname — non critique si imparfait).
 *
 * Isolé dans son propre composant client pour ne pas transformer tout
 * `app/dashboard/layout.tsx` (Server Component) en client component.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { track } from "@/lib/analytics/track";

export function OnboardingCta({
  variant = "banner",
}: {
  variant?: "banner" | "floating";
}) {
  const pathname = usePathname();

  if (variant === "floating") {
    if (pathname?.startsWith("/onboarding")) return null;
    return (
      <Link
        href="/onboarding"
        onClick={() => track("cta_clicked", { location: "demo_banner", variant: "floating" })}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[var(--pb-accent)] px-4 py-3 text-[12.5px] font-semibold text-[#06122a] shadow-lg shadow-black/30 transition-opacity hover:opacity-90"
      >
        <UploadCloud className="h-4 w-4" />
        Importer mon FEC
      </Link>
    );
  }

  return (
    <Link
      href="/onboarding"
      onClick={() => track("cta_clicked", { location: "demo_banner", variant: "banner" })}
      className="flex items-center gap-1.5 rounded-md bg-[var(--pb-accent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#06122a] transition-opacity hover:opacity-90"
    >
      <UploadCloud className="h-3 w-3" />
      Importer mon FEC
    </Link>
  );
}
