import type { FindingFamily, Severity } from "@/lib/canonical-model";

/** Styles sémantiques de gravité : couleur d'accent, fond, bordure, anneau. */
export const SEVERITY_STYLE: Record<
  Severity,
  { label: string; hex: string; text: string; bg: string; border: string; dot: string }
> = {
  bloquant: {
    label: "Bloquant",
    hex: "#ef4444",
    text: "text-[#ef4444]",
    bg: "bg-[#2a1416]",
    border: "border-[#ef4444]",
    dot: "bg-[#ef4444]",
  },
  majeur: {
    label: "Majeur",
    hex: "#f97316",
    text: "text-[#f97316]",
    bg: "bg-[#2a1a0e]",
    border: "border-[#f97316]",
    dot: "bg-[#f97316]",
  },
  mineur: {
    label: "Mineur",
    hex: "#eab308",
    text: "text-[#eab308]",
    bg: "bg-[#292207]",
    border: "border-[#eab308]",
    dot: "bg-[#eab308]",
  },
  informatif: {
    label: "Informatif",
    hex: "#3b82f6",
    text: "text-[#3b82f6]",
    bg: "bg-[#11203a]",
    border: "border-[#3b82f6]",
    dot: "bg-[#3b82f6]",
  },
};

/** Styles par famille de règle (nature de la règle). */
export const FAMILY_STYLE: Record<
  FindingFamily,
  { label: string; hex: string; text: string; border: string; help: string }
> = {
  hardLaw: {
    label: "Obligatoire",
    hex: "#ef4444",
    text: "text-[#f87171]",
    border: "border-[#7f1d1d]",
    help: "Contrainte réglementaire opposable (LPF, PCG).",
  },
  methodology: {
    label: "Présomption d'audit",
    hex: "#a78bfa",
    text: "text-[#a78bfa]",
    border: "border-[#4c1d95]",
    help: "Procédure / présomption issue des normes d'audit-révision (ISA, ISRE).",
  },
  internal: {
    label: "Paramètre interne",
    hex: "#38bdf8",
    text: "text-[#38bdf8]",
    border: "border-[#075985]",
    help: "Heuristique ou seuil propre à PROBANT, non opposable.",
  },
};
