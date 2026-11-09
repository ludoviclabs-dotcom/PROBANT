/**
 * Modèles de vue d'Audit Normatif 360 (aucun calcul comptable) : index des cycles par famille, matrice de
 * couverture cycles × référentiels, répartition du registre. Fonctions pures, testables, sérialisables vers
 * les composants clients.
 */

import { CYCLE_FAMILIES, type AuditCycle, type CycleFamily, type NormativeSource, type SourceType } from "./types";
import { cycleSourceIds, isOpen, type VeilleReport } from "./veille";

/** Référentiels regroupés pour la lecture (colonnes de la matrice, segments de la répartition). */
export type ReferenceFamily = "isa" | "nep" | "ifrs" | "fr_comptable" | "fr_droit" | "ue" | "afa";

export const REFERENCE_FAMILIES: { id: ReferenceFamily; label: string; short: string; types: SourceType[] }[] = [
  { id: "isa", label: "Normes internationales d'audit", short: "ISA", types: ["ISA"] },
  { id: "nep", label: "Normes d'exercice professionnel (H2A, CNCC)", short: "NEP", types: ["NEP", "H3C_H2A", "CNCC"] },
  { id: "ifrs", label: "IAS / IFRS", short: "IFRS", types: ["IFRS", "IAS"] },
  { id: "fr_comptable", label: "Règles comptables françaises (PCG, ANC)", short: "PCG", types: ["PCG", "ANC"] },
  { id: "fr_droit", label: "Droit français (Code de commerce, CGI, LPF, lois)", short: "Droit FR", types: ["CODE_COMMERCE", "CGI", "OTHER_OFFICIAL"] },
  { id: "ue", label: "Droit de l'Union européenne", short: "UE", types: ["EU_DIRECTIVE", "EU_REGULATION"] },
  { id: "afa", label: "Anticorruption (AFA)", short: "AFA", types: ["AFA"] },
];

const FAMILY_OF_TYPE = new Map<SourceType, ReferenceFamily>(
  REFERENCE_FAMILIES.flatMap((f) => f.types.map((t) => [t, f.id] as const)),
);

export function referenceFamilyOf(type: SourceType | undefined): ReferenceFamily | null {
  return type ? (FAMILY_OF_TYPE.get(type) ?? null) : null;
}

/** Libellés éditoriaux des familles de cycles (mêmes que la section 04 de la landing). */
export const CYCLE_FAMILY_TITLE: Record<CycleFamily, string> = {
  ACTIF_IMMOBILISE: "Actif immobilisé",
  ACTIF_CIRCULANT: "Actif circulant",
  TRESORERIE: "Trésorerie",
  CAPITAUX_PROPRES_FINANCEMENT: "Capitaux propres et financement",
  PASSIF_ENGAGEMENTS: "Passif et engagements",
  COMPTE_RESULTAT: "Compte de résultat",
  TRANSVERSAL: "Transversal",
};

const two = (value: number) => String(value).padStart(2, "0");

export interface CycleIndexItem {
  n: string;
  slug: string;
  title: string;
  summary: string;
  familyTitle: string;
  pcgAccounts: string[];
  reviewStatus: AuditCycle["reviewStatus"];
  counts: { normes: number; ratios: number; procedures: number; tests: number; risques: number; fraude: number };
  /** Évolutions en vigueur non intégrées qui touchent le cycle (repères courts). */
  veilleEnVigueur: string[];
  veilleAVenir: string[];
}

export interface CycleIndexFamily {
  id: CycleFamily;
  title: string;
  count: string;
  items: CycleIndexItem[];
}

/** Index par famille, numérotation continue sur deux chiffres (ordre de CYCLE_FAMILIES, puis titres). */
export function buildCycleIndex(cycles: AuditCycle[], veille: VeilleReport | null): CycleIndexFamily[] {
  const exposure = new Map((veille?.cycles ?? []).map((c) => [c.slug, c]));
  let counter = 0;
  const out: CycleIndexFamily[] = [];
  for (const family of CYCLE_FAMILIES) {
    const members = cycles.filter((c) => c.family === family.id);
    if (members.length === 0) continue;
    out.push({
      id: family.id,
      title: CYCLE_FAMILY_TITLE[family.id],
      count: two(members.length),
      items: members.map((c) => {
        const e = exposure.get(c.slug);
        return {
          n: two(++counter),
          slug: c.slug,
          title: c.title,
          summary: c.summary,
          familyTitle: CYCLE_FAMILY_TITLE[c.family],
          pcgAccounts: c.pcgAccounts ?? [],
          reviewStatus: c.reviewStatus,
          counts: {
            normes: (c.applicableStandards ?? []).length,
            ratios: (c.ratios ?? []).length,
            procedures: (c.analyticalProcedures ?? []).length,
            tests: (c.detailTests ?? []).length,
            risques: (c.risks ?? []).length,
            fraude: (c.risks ?? []).filter((r) => r.category === "RISQUE_FRAUDE").length,
          },
          veilleEnVigueur: (e?.enVigueur ?? []).map((x) => x.short),
          veilleAVenir: (e?.aVenir ?? []).map((x) => x.short),
        };
      }),
    });
  }
  return out;
}

export interface CoverageCell {
  family: ReferenceFamily;
  /** Sources distinctes du référentiel citées par le cycle. */
  count: number;
  /** Repères des évolutions non intégrées qui touchent ces sources. */
  flagged: string[];
}

export interface CoverageRow {
  n: string;
  slug: string;
  title: string;
  cells: CoverageCell[];
}

export interface CoverageGroup {
  id: CycleFamily;
  title: string;
  rows: CoverageRow[];
}

export interface CoverageMatrix {
  columns: { id: ReferenceFamily; label: string; short: string; total: number }[];
  groups: CoverageGroup[];
  /** Références citées par les cycles mais absentes du registre central (non classées). */
  unresolved: number;
}

/**
 * Matrice cycles × référentiels : pour chaque cycle, combien de sources distinctes de chaque référentiel il cite
 * (normes applicables, sources officielles et `sourceIds` des seuils, ratios, procédures, tests, risques).
 * Une référence dont l'identifiant est absent du registre n'est classée nulle part : elle est comptée à part.
 */
export function buildCoverageMatrix(cycles: AuditCycle[], sources: NormativeSource[], veille: VeilleReport | null): CoverageMatrix {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const flaggedBySource = new Map<string, string[]>();
  for (const e of veille?.evolutions ?? []) {
    if (!isOpen(e.integration)) continue;
    for (const id of e.normatifSourceIds) flaggedBySource.set(id, [...(flaggedBySource.get(id) ?? []), e.short]);
  }
  const totals = new Map<ReferenceFamily, number>();
  let unresolved = 0;
  let counter = 0;
  const groups: CoverageGroup[] = [];
  for (const family of CYCLE_FAMILIES) {
    const members = cycles.filter((c) => c.family === family.id);
    if (members.length === 0) continue;
    groups.push({
      id: family.id,
      title: CYCLE_FAMILY_TITLE[family.id],
      rows: members.map((cycle) => {
        const perFamily = new Map<ReferenceFamily, { ids: Set<string>; flagged: Set<string> }>();
        for (const id of cycleSourceIds(cycle)) {
          const src = byId.get(id);
          const fam = referenceFamilyOf(src?.type);
          if (!fam) {
            unresolved += 1;
            continue;
          }
          const slot = perFamily.get(fam) ?? { ids: new Set<string>(), flagged: new Set<string>() };
          slot.ids.add(id);
          for (const f of flaggedBySource.get(id) ?? []) slot.flagged.add(f);
          perFamily.set(fam, slot);
        }
        const cells = REFERENCE_FAMILIES.map((f) => {
          const slot = perFamily.get(f.id);
          const count = slot?.ids.size ?? 0;
          if (count > 0) totals.set(f.id, (totals.get(f.id) ?? 0) + 1);
          return { family: f.id, count, flagged: [...(slot?.flagged ?? [])].sort() };
        });
        return { n: two(++counter), slug: cycle.slug, title: cycle.title, cells };
      }),
    });
  }
  return {
    columns: REFERENCE_FAMILIES.map((f) => ({ id: f.id, label: f.label, short: f.short, total: totals.get(f.id) ?? 0 })),
    groups,
    unresolved,
  };
}

/** Répartition du registre par référentiel (segments proportionnels au nombre de sources). */
export function sourceSpread(sources: NormativeSource[]): { id: ReferenceFamily; short: string; label: string; count: number }[] {
  return REFERENCE_FAMILIES.map((f) => ({
    id: f.id,
    short: f.short,
    label: f.label,
    count: sources.filter((s) => referenceFamilyOf(s.type) === f.id).length,
  })).filter((f) => f.count > 0);
}
