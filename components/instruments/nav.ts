import { WORKFLOW_ROUTES } from "@/lib/capabilities/registry";

/**
 * Écrans du dossier : la navigation dit le travail à faire. La liste vient du registre de capacités
 * (`WORKFLOW_ROUTES`), jamais d'une copie : un écran ajouté au registre apparaît dans le rail et la barre basse.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Précision affichée au survol et lue par les lecteurs d'écran en complément du libellé. */
  description?: string;
}

export const NAV_ITEMS: readonly NavItem[] = WORKFLOW_ROUTES.map((item) => ({
  href: item.href,
  label: item.label,
  description: "description" in item ? item.description : undefined,
}));

/** Les quatre écrans de la barre basse (390 px) ; les autres sont sous « Plus ». */
export const BOTTOM_PRIMARY: readonly { label: string; href: string }[] = [
  { label: "Dépôt", href: "/dashboard/depot" },
  { label: "Synthèse", href: "/dashboard/synthese" },
  { label: "Risques", href: "/dashboard/risques" },
  { label: "Cloisons", href: "/dashboard/cloisons" },
];

export const BOTTOM_MORE: readonly NavItem[] = NAV_ITEMS.filter((item) => !BOTTOM_PRIMARY.some((p) => p.href === item.href));
