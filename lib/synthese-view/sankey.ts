import type { Severity } from "@/lib/canonical-model/finding";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";
import { CLOISON_SUBJECT, SEVERITIES, type CloisonDef, type SeverityCounts } from "./common";

/**
 * Sankey cloison → gravité. La disposition est de la géométrie pure : l'épaisseur d'une bande est proportionnelle
 * au nombre de constats que le snapshot compte pour ce couple, jamais à un montant. Les comptes viennent de
 * `synthesis.risk.matrix` ; rien n'est recompté.
 */

export const SANKEY = { height: 360, pad: 16, gapLeft: 16, gapRight: 20, xLeft: 250, xRight: 770, xMid: 510 } as const;

export interface SankeyNode {
  id: string;
  label: string;
  n: number;
  y: number;
  h: number;
  /** Zone cliquable, un peu plus large que la barre. */
  hitY: number;
  hitH: number;
  /** Centre vertical, en pourcentage de la hauteur du schéma (placement des libellés HTML). */
  centerPct: number;
}

export interface SankeyBand {
  key: string;
  clo: CloisonId;
  sev: Severity;
  n: number;
  /** Surface de la bande. */
  d: string;
  /** Arête supérieure, tracée à l'entrée. */
  edge: string;
  /** Ordonnée du point de survol (milieu de la bande côté droit), en pourcentage de la hauteur. */
  anchorPct: number;
}

export interface SankeyLayout {
  total: number;
  left: SankeyNode[];
  right: SankeyNode[];
  bands: SankeyBand[];
}

export const bandKey = (clo: CloisonId, sev: Severity) => `${clo}-${sev}`;

const fix = (n: number) => n.toFixed(1);

export function layoutSankey(matrix: Partial<Record<CloisonId, SeverityCounts>>, clos: readonly CloisonDef[]): SankeyLayout {
  const { height: H, pad, gapLeft, gapRight, xLeft, xRight, xMid } = SANKEY;
  const count = (clo: CloisonId, sev: Severity) => matrix[clo]?.[sev] ?? 0;
  const byClo = (clo: CloisonId) => SEVERITIES.reduce((sum, sev) => sum + count(clo, sev), 0);
  const bySev = (sev: Severity) => clos.reduce((sum, c) => sum + count(c.id, sev), 0);
  const total = clos.reduce((sum, c) => sum + byClo(c.id), 0);

  const unit = total
    ? Math.min((H - 2 * pad - gapLeft * (clos.length - 1)) / total, (H - 2 * pad - gapRight * (SEVERITIES.length - 1)) / total)
    : 0;

  const node = (id: string, label: string, n: number, y: number, h: number): SankeyNode => ({
    id,
    label,
    n,
    y,
    h,
    hitY: y - 6,
    hitH: h + 12,
    centerPct: ((y + h / 2) / H) * 100,
  });

  let yLeft = pad + (H - 2 * pad - (total * unit + gapLeft * (clos.length - 1))) / 2;
  const left = clos.map((c) => {
    const n = byClo(c.id);
    const placed = node(c.id, c.label, n, yLeft, n * unit);
    yLeft += n * unit + gapLeft;
    return placed;
  });
  let yRight = pad + (H - 2 * pad - (total * unit + gapRight * (SEVERITIES.length - 1))) / 2;
  const right = SEVERITIES.map((sev) => {
    const n = bySev(sev);
    const placed = node(sev, sev, n, yRight, n * unit);
    yRight += n * unit + gapRight;
    return placed;
  });

  const cursorLeft = new Map(left.map((n) => [n.id, n.y]));
  const cursorRight = new Map(right.map((n) => [n.id, n.y]));
  const bands: SankeyBand[] = [];
  for (const c of clos) {
    for (const sev of SEVERITIES) {
      const n = count(c.id, sev);
      if (!n) continue;
      const t = n * unit;
      const y0 = cursorLeft.get(c.id) as number;
      const y1 = cursorRight.get(sev) as number;
      cursorLeft.set(c.id, y0 + t);
      cursorRight.set(sev, y1 + t);
      bands.push({
        key: bandKey(c.id, sev),
        clo: c.id,
        sev,
        n,
        d: `M${xLeft} ${fix(y0)}C${xMid} ${fix(y0)} ${xMid} ${fix(y1)} ${xRight} ${fix(y1)}L${xRight} ${fix(y1 + t)}C${xMid} ${fix(y1 + t)} ${xMid} ${fix(y0 + t)} ${xLeft} ${fix(y0 + t)}Z`,
        edge: `M${xLeft} ${fix(y0)}C${xMid} ${fix(y0)} ${xMid} ${fix(y1)} ${xRight} ${fix(y1)}`,
        anchorPct: ((y0 + y1 + t) / 2 / H) * 100,
      });
    }
  }
  return { total, left, right, bands };
}

/**
 * Titre-phrase du Sankey : la conclusion que le schéma permet de lire, avec ce que le snapshot compte.
 * `blockingSources` : d'où viennent les constats bloquants (cycles, ou l'admissibilité du FEC).
 */
export function sankeyTitle(input: { total: number; left: readonly SankeyNode[]; blockingSources: readonly string[]; blockingCount: number }): string {
  const { total, left, blockingSources, blockingCount } = input;
  if (total === 0) return "Aucun constat à répartir entre cloisons et gravités.";
  const top = [...left].sort((a, b) => b.n - a.n)[0];
  const subject = CLOISON_SUBJECT[top.id as CloisonId];
  const head = `${subject.text} ${subject.plural ? "concentrent" : "concentre"} ${top.n} des ${total} constats`;
  if (!blockingCount) return `${head}.`;
  return `${head} ; ${blockingCount} ${blockingCount > 1 ? "bloquants" : "bloquant"} : ${blockingSources.join(", ")}.`;
}
