/**
 * Couverture normative d'une période TVA.
 *
 * La recodification de la TVA dans le code des impositions sur les biens et
 * services au 1er septembre 2026 fait expirer des versions de sources sans
 * successeur publié dans le registre. Ce module répond à une seule question :
 * *toutes* les sources requises par un contrôle couvrent-elles *toute* la
 * période ?
 *
 * Il ne choisit jamais « la version la plus proche ». Une période qui déborde la
 * dernière version publiée est déclarée non couverte, et le contrôle qui en
 * dépend est bloqué.
 */
import type { TaxSourceRef } from "@/lib/canonical-model";
import { taxKnowledgeRegistry } from "@/lib/knowledge/tax-registry";
import type { VatNormativeCoverage } from "./types";

/** Sources requises par famille de contrôle TVA. */
export const VAT_SOURCE_REQUIREMENTS = {
  /** Fait générateur et exigibilité : décalage de période. */
  taxPoint: ["cgi-art-269"],
  /** Droit à déduction. */
  deduction: ["cgi-art-271"],
  /** Obligation de facturation : pièces justificatives. */
  invoicing: ["cgi-art-289"],
  /** Déclaration et périodicité. */
  filing: ["cgi-art-287"],
} as const;

export type VatSourceRequirement = keyof typeof VAT_SOURCE_REQUIREMENTS;

function addDays(isoDate: string, days: number): string {
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
 * Évalue la couverture normative de la période pour un jeu d'exigences.
 *
 * Renvoie `not_covered` quand la période commence déjà hors couverture, et
 * `partially_covered` quand elle bascule en cours de route — le cas exact de la
 * frontière du 1er septembre 2026.
 */
export function assessNormativeCoverage(options: {
  readonly startDate: string;
  readonly endDate: string;
  readonly requirements: readonly VatSourceRequirement[];
}): VatNormativeCoverage {
  const { startDate, endDate, requirements } = options;
  const sourceIds = [...new Set(requirements.flatMap((key) => VAT_SOURCE_REQUIREMENTS[key]))].sort();

  const expiring: string[] = [];
  const sourceRefs: TaxSourceRef[] = [];
  let earliestGap: string | null = null;

  for (const sourceId of sourceIds) {
    const intervals = effectiveIntervalsFor(sourceId);
    const gap = firstUncoveredDay(intervals, startDate, endDate);

    const versionsForSource = taxKnowledgeRegistry.sourceVersions
      .filter((version) => version.sourceId === sourceId && version.status === "effective");
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
