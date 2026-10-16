import { CYCLE_FAMILIES, type AuditCycle, type CycleFamily } from "@/lib/audit-cycles/types";

/**
 * Index typographique des cycles d'audit (Audit Normatif 360) : sept familles, une numérotation continue.
 * Les titres viennent des fichiers `data/cycles/*.yml`, pas d'une liste recopiée dans la page ; l'ordre des
 * familles est celui de `CYCLE_FAMILIES`. Seuls les libellés de famille sont abrégés pour la lecture éditoriale.
 */

const FAMILY_TITLE: Record<CycleFamily, string> = {
  ACTIF_IMMOBILISE: "Actif immobilisé",
  ACTIF_CIRCULANT: "Actif circulant",
  TRESORERIE: "Trésorerie",
  CAPITAUX_PROPRES_FINANCEMENT: "Capitaux propres et financement",
  PASSIF_ENGAGEMENTS: "Passif et engagements",
  COMPTE_RESULTAT: "Compte de résultat",
  TRANSVERSAL: "Transversal",
};

export interface NormativeItem {
  /** Numéro continu sur deux chiffres, d'une famille à l'autre. */
  n: string;
  title: string;
  slug: string;
}

export interface NormativeFamily {
  id: CycleFamily;
  title: string;
  /** Nombre de cycles de la famille, sur deux chiffres. */
  count: string;
  items: NormativeItem[];
}

const two = (value: number) => String(value).padStart(2, "0");

export function buildNormativeIndex(cycles: readonly Pick<AuditCycle, "slug" | "title" | "family">[]): NormativeFamily[] {
  let counter = 0;
  const families: NormativeFamily[] = [];
  for (const family of CYCLE_FAMILIES) {
    const members = cycles.filter((cycle) => cycle.family === family.id);
    if (members.length === 0) continue;
    families.push({
      id: family.id,
      title: FAMILY_TITLE[family.id],
      count: two(members.length),
      items: members.map((cycle) => ({ n: two(++counter), title: cycle.title, slug: cycle.slug })),
    });
  }
  return families;
}
