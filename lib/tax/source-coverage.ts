/**
 * Couverture d'une période par les versions de sources publiées.
 *
 * Primitive partagée : elle répond à une seule question — les sources requises
 * couvrent-elles *toute* la période ? Elle ne choisit jamais « la version la
 * plus proche ». Une période qui déborde la dernière version publiée est
 * déclarée non couverte, et le contrôle qui en dépend est bloqué.
 *
 * Extraite de `vat/coverage.ts` (TAX-06) pour servir aussi aux impôts
 * secondaires, dont les sources ont leurs propres fenêtres d'effet.
 */
import type { TaxSourceRef } from "@/lib/canonical-model";
import { taxKnowledgeRegistry } from "@/lib/knowledge/tax-registry";

export interface SourceCoverage {
  readonly status: "covered" | "partially_covered" | "not_covered";
  /** Dernier jour effectivement couvert par toutes les sources requises. */
  readonly coveredThroughDate: string | null;
  /** Premier jour non couvert, s'il existe. */
  readonly uncoveredFromDate: string | null;
  readonly expiringSourceVersionIds: readonly string[];
  readonly sourceRefs: readonly TaxSourceRef[];
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

interface Interval {
  readonly from: string;
  /** `null` = sans terme. */
  readonly to: string | null;
}

/** Intervalles effectifs publiés pour une source, triés et fusionnés. */
function effectiveIntervalsFor(sourceId: string): readonly Interval[] {
  const versions = taxKnowledgeRegistry.sourceVersions
    .filter((version) => version.sourceId === sourceId && version.status === "effective")
    .map((version) => ({
      // Une version sans date d'effet est traitée comme couvrant depuis toujours :
      // c'est le registre qui l'a publiée comme effective.
      from: version.effectiveFrom ?? "0000-01-01",
      to: version.effectiveTo,
    }))
    .sort((left, right) => left.from.localeCompare(right.from));

  const merged: Interval[] = [];
  for (const interval of versions) {
    const last = merged.at(-1);
    if (!last) {
      merged.push(interval);
      continue;
    }
    if (last.to === null) return merged;
    // Contigu ou chevauchant : on prolonge.
    if (interval.from <= addDays(last.to, 1)) {
      merged[merged.length - 1] = {
        from: last.from,
        to: interval.to === null ? null : (interval.to > last.to ? interval.to : last.to),
      };
      continue;
    }
    merged.push(interval);
  }
  return merged;
}

/**
 * Premier jour de `[start, end]` non couvert par les intervalles, ou `null` si
 * la période est intégralement couverte.
 */
function firstUncoveredDay(
  intervals: readonly Interval[],
  start: string,
  end: string,
): string | null {
  let cursor = start;
  while (cursor <= end) {
    const covering = intervals.find((interval) =>
      interval.from <= cursor && (interval.to === null || interval.to >= cursor));
    if (!covering) return cursor;
    if (covering.to === null) return null;
    cursor = addDays(covering.to, 1);
  }
  return null;
}

/**
 * Évalue la couverture de la période par un jeu de sources.
 *
 * `not_covered` quand la période commence déjà hors couverture,
 * `partially_covered` quand elle bascule en cours de route.
 */
export function assessSourceCoverage(options: {
  readonly startDate: string;
  readonly endDate: string;
  readonly sourceIds: readonly string[];
}): SourceCoverage {
  const { startDate, endDate } = options;
  const sourceIds = [...new Set(options.sourceIds)].sort();

  const expiring: string[] = [];
  const sourceRefs: TaxSourceRef[] = [];
  let earliestGap: string | null = null;

  for (const sourceId of sourceIds) {
    const intervals = effectiveIntervalsFor(sourceId);
    const gap = firstUncoveredDay(intervals, startDate, endDate);

    // La couverture peut examiner toutes les versions pour trouver un trou,
    // mais les références publiées dans le résultat sont exclusivement celles
    // dont la fenêtre d'effet intersecte la période demandée. Une version
    // future ou déjà expirée n'est donc jamais présentée comme source du
    // contrôle courant.
    const versionsForSource = taxKnowledgeRegistry.sourceVersions
      .filter((version) =>
        version.sourceId === sourceId &&
        version.status === "effective" &&
        (version.effectiveFrom === null || version.effectiveFrom <= endDate) &&
        (version.effectiveTo === null || version.effectiveTo >= startDate));
    for (const version of versionsForSource) {
      sourceRefs.push({
        sourceId,
        sourceVersionId: version.id,
        locator: version.versionLabel,
      });
      if (version.effectiveTo !== null && version.effectiveTo < endDate) {
        expiring.push(version.id);
      }
    }

    if (gap !== null && (earliestGap === null || gap < earliestGap)) {
      earliestGap = gap;
    }
  }

  if (earliestGap === null) {
    return {
      status: "covered",
      coveredThroughDate: endDate,
      uncoveredFromDate: null,
      expiringSourceVersionIds: [],
      sourceRefs: sourceRefs.sort((left, right) => left.sourceVersionId.localeCompare(right.sourceVersionId)),
    };
  }

  return {
    status: earliestGap <= startDate ? "not_covered" : "partially_covered",
    coveredThroughDate: earliestGap <= startDate ? null : addDays(earliestGap, -1),
    uncoveredFromDate: earliestGap,
    expiringSourceVersionIds: [...new Set(expiring)].sort(),
    sourceRefs: sourceRefs.sort((left, right) => left.sourceVersionId.localeCompare(right.sourceVersionId)),
  };
}
