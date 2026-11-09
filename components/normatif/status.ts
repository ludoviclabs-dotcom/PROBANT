import type { NormativeStatus } from "@/lib/audit-cycles/types";

/**
 * Force normative d'une information, dessinée selon la charte : jamais par la seule teinte, toujours par un TRAIT
 * et un libellé. Les trois familles de traits de la charte gardent leur sens :
 *  - plein (2 px, encre)      : obligatoire — texte opposable (norme, loi, règlement) ;
 *  - tirets (1,5 px)          : recommandé / bonne pratique — doctrine ou pratique d'audit, sans force normative ;
 *  - pointillé (1,2 px)       : paramétrable — seuil ou borne de jugement ;
 *  - carré de signal contour  : à valider — information présente mais non sourcée ou non revue.
 * Distinct de la gravité d'un constat FEC (components/charte/severity.ts).
 */
export interface StatusSpec {
  label: string;
  short: string;
  help: string;
  /** Trait : épaisseur, `stroke-dasharray` (`none` = plein), variable de couleur. */
  stroke: { width: number; dash: string; color: string } | null;
}

export const STATUS_STYLE: Record<NormativeStatus, StatusSpec> = {
  OBLIGATOIRE: {
    label: "Obligatoire",
    short: "Obligatoire",
    help: "Exigence issue d'une norme, loi ou règlement officiel.",
    stroke: { width: 2, dash: "none", color: "var(--pb-ink)" },
  },
  RECOMMANDE: {
    label: "Recommandé",
    short: "Recommandé",
    help: "Guide professionnel ou doctrine reconnue, non obligatoire.",
    stroke: { width: 1.5, dash: "4 3", color: "var(--pb-ink-2)" },
  },
  BONNE_PRATIQUE: {
    label: "Bonne pratique",
    short: "Bonne pratique",
    help: "Pratique d'audit usuelle, sans force normative.",
    stroke: { width: 1.5, dash: "2 3", color: "var(--pb-ink-3)" },
  },
  PARAMETRABLE: {
    label: "Paramétrable",
    short: "Paramétrable",
    help: "Seuil ou borne dépendant du jugement, du secteur ou du risque.",
    stroke: { width: 1.2, dash: "1 3", color: "var(--pb-ink-3)" },
  },
  A_VALIDER: {
    label: "À valider",
    short: "À valider",
    help: "Information présente nécessitant une revue humaine ou une source.",
    stroke: null,
  },
};
