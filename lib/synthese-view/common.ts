import type { FindingFamily, Severity } from "@/lib/canonical-model/finding";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";

/** Les trois familles de règles, jamais mélangées : leur nom, leur strate et leur portée. */
export const FAMILY_TEXT: Record<FindingFamily, { label: string; long: string; sub: string }> = {
  hardLaw: { label: "Droit dur", long: "Droit dur", sub: "opposable" },
  methodology: { label: "Présomption d’audit", long: "Méthode d’audit", sub: "présomption" },
  internal: { label: "Paramètre interne", long: "Heuristique interne", sub: "non opposable" },
};

export const FAMILY_ORDER: readonly FindingFamily[] = ["hardLaw", "methodology", "internal"];

/** Corpus d'une référence normative : « PCG art. 214-13 » → « PCG », « ISA 315 (révisée) » → « ISA 315 ». */
export function corpusLabel(ref: string): string {
  return ref.replace(/\s+\(.*$/, "").replace(/\s+(art\.|cpt\.|A\.).*$/, "").trim();
}

/** Gravités, de la plus forte à la plus faible : l'ordre de lecture de toutes les vues. */
export const SEVERITIES: readonly Severity[] = ["bloquant", "majeur", "mineur", "informatif"];

/** Cloisons présentes dans un snapshot, dans l'ordre canonique de la taxonomie. */
export interface CloisonDef {
  id: CloisonId;
  label: string;
  short: string;
}

export const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);

/** Sujet grammatical de chaque cloison pour les titres-phrases (« L’actif concentre… », « Les journaux concentrent… »). */
export const CLOISON_SUBJECT: Record<CloisonId, { text: string; plural: boolean }> = {
  "bilan-actif": { text: "L’actif", plural: false },
  "bilan-passif": { text: "Le passif", plural: false },
  resultat: { text: "Le compte de résultat", plural: false },
  flux: { text: "Le tableau de flux", plural: false },
  annexe: { text: "L’annexe", plural: false },
  journaux: { text: "Les journaux", plural: true },
  "tva-fiscalite": { text: "La TVA et la fiscalité", plural: false },
};

export type SeverityCounts = Record<Severity, number>;

export function emptyCounts(): SeverityCounts {
  return { bloquant: 0, majeur: 0, mineur: 0, informatif: 0 };
}

/** « Provisions et engagements » → « provisions » ; un sigle (« TVA ») garde ses capitales. */
export function shortCycleLabel(label: string): string {
  const head = label.split(" et ")[0];
  return head === head.toUpperCase() ? head : head.charAt(0).toLowerCase() + head.slice(1);
}
