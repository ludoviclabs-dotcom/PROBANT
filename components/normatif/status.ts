import type { NormativeStatus } from "@/lib/audit-cycles/types";

/**
 * Styles sémantiques du statut normatif. Distincts des styles de gravité
 * (severity.ts) : ici on qualifie la force normative d'une information, pas la
 * criticité d'un constat FEC.
 */
export const STATUS_STYLE: Record<
  NormativeStatus,
  { label: string; short: string; hex: string; bg: string; help: string }
> = {
  OBLIGATOIRE: {
    label: "Obligatoire",
    short: "Oblig.",
    hex: "#ef4444",
    bg: "#2a1416",
    help: "Exigence issue d'une norme, loi ou règlement officiel.",
  },
  RECOMMANDE: {
    label: "Recommandé",
    short: "Recomm.",
    hex: "#a78bfa",
    bg: "#1e1538",
    help: "Guide professionnel ou doctrine reconnue, non obligatoire.",
  },
  BONNE_PRATIQUE: {
    label: "Bonne pratique",
    short: "B. prat.",
    hex: "#eab308",
    bg: "#292207",
    help: "Pratique d'audit usuelle (Big Four), sans force normative.",
  },
  PARAMETRABLE: {
    label: "Paramétrable",
    short: "Param.",
    hex: "#38bdf8",
    bg: "#0c2233",
    help: "Seuil ou borne dépendant du jugement, du secteur ou du risque.",
  },
  A_VALIDER: {
    label: "À valider",
    short: "À valider",
    hex: "#9ca3af",
    bg: "#1a1d23",
    help: "Information présente nécessitant une revue humaine / source manquante.",
  },
};
