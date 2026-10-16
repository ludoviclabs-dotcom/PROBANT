import type { Finding, Severity } from "@/lib/canonical-model/finding";
import { formatEuroCents } from "@/lib/format/fr";
import type { CycleRow } from "@/lib/dossier/cycle-registry";
import { restrictExposure } from "@/lib/synthesis/exposure";
import { scopedEffectItems } from "@/lib/synthesis/effect-labels";
import type { ExposureDimension } from "@/lib/synthesis/types";
import { SEVERITIES, plural, shortCycleLabel, type SeverityCounts } from "./common";

/**
 * Concentration des constats par cycle : barres triées, segmentées par gravité, avec l'exposition chiffrée
 * de chaque cycle (poste et sens, JAMAIS additionnés) et la courbe cumulée. Les comptes par gravité viennent de
 * la projection du registre ; l'exposition de `restrictExposure`, la même que lisent le waterfall et les cloisons.
 */

export interface ConcentrationRow {
  id: string;
  label: string;
  n: number;
  counts: SeverityCounts;
  /** Exposition initiale par poste et sens, déjà signée (« −145 000 € »). */
  effects: { key: string; label: string; text: string }[];
  /** Groupes d'effets dont l'agrégation est indéterminée : aucun montant, seulement le nombre. */
  indeterminate: number;
  members: { id: string; severity: Severity; cloison: Finding["cloison"] }[];
}

export interface Concentration {
  rows: ConcentrationRow[];
  /** Constats rattachés à un cycle ; les autres (admissibilité du FEC…) restent hors du schéma. */
  total: number;
  unassigned: number;
  topCount: number;
  topShare: number;
  /** Courbe cumulée : (part des cycles, part des constats), de 0 à 1. */
  curve: { x: number; y: number }[];
  title: string;
}

export function buildConcentration(input: { cycleRows: readonly CycleRow[]; findings: readonly Finding[]; exposure: ExposureDimension }): Concentration {
  const { cycleRows, findings, exposure } = input;
  const rows = cycleRows
    .filter((row) => row.gaps.findings !== null)
    .map((row): ConcentrationRow => {
      const counts = row.gaps.findings as SeverityCounts;
      const members = findings.filter((f) => row.entry.silos.includes(f.siloId));
      const scoped = restrictExposure(exposure, members.map((f) => f.id));
      return {
        id: row.entry.id,
        label: row.entry.label,
        n: SEVERITIES.reduce((sum, s) => sum + counts[s], 0),
        counts,
        effects: scopedEffectItems(scoped).map((item) => ({ key: item.key, label: item.label, text: formatEuroCents(item.sign === "+" ? item.initialCents : -item.initialCents) })),
        indeterminate: scoped.indeterminateClusters.length,
        members: members.map((f) => ({ id: f.id, severity: f.severity, cloison: f.cloison })),
      };
    })
    .sort((a, b) => b.n - a.n);

  const total = rows.reduce((sum, r) => sum + r.n, 0);
  const unassigned = findings.length - total;
  const topCount = Math.min(3, rows.length);
  const topSum = rows.slice(0, topCount).reduce((sum, r) => sum + r.n, 0);
  const topShare = total ? Math.round((100 * topSum) / total) : 0;

  let cumulative = 0;
  const curve = [{ x: 0, y: 0 }, ...rows.map((r, i) => ({ x: (i + 1) / rows.length, y: (cumulative += r.n) / total }))];

  const withEffects = rows.filter((r) => r.effects.length > 0).map((r) => shortCycleLabel(r.label));
  const effects = withEffects.length ? ` Les effets chiffrés se concentrent sur ${withEffects.length > 3 ? `${withEffects.slice(0, 3).join(", ")} et ${withEffects.length - 3} ${plural(withEffects.length - 3, "autre")}` : withEffects.join(", ")}.` : "";
  const title = rows.length
    ? `${topCount === 3 ? "Trois" : topCount} ${plural(topCount, "cycle")} sur ${rows.length} ${plural(topCount, "porte", "portent")} ${topShare} % des constats rattachés à un cycle.${effects}`
    : "Aucun constat n’est rattaché à un cycle.";

  return { rows, total, unassigned, topCount, topShare, curve, title };
}
