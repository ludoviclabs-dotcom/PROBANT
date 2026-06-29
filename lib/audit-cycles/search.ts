/**
 * Recherche floue sur les cycles d'audit (Fuse.js).
 *
 * L'index est construit à partir d'éléments allégés (`CycleSearchItem`) afin de
 * pouvoir être sérialisé et instancié côté client (cf. `SearchBar`). Les mêmes
 * fonctions servent côté serveur dans la route `/api/normatif/search`.
 */

import Fuse, { type IFuseOptions } from "fuse.js";
import type { AuditCycle, CycleSearchItem } from "./types";

const FUSE_OPTIONS: IFuseOptions<CycleSearchItem> = {
  keys: [
    { name: "title", weight: 0.4 },
    { name: "pcgAccounts", weight: 0.3 },
    { name: "keywords", weight: 0.3 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeScore: true,
};

/** Transforme un cycle complet en item de recherche allégé. */
export function toSearchItem(c: AuditCycle): CycleSearchItem {
  return {
    slug: c.slug,
    title: c.title,
    family: c.family,
    pcgAccounts: c.pcgAccounts ?? [],
    keywords: [
      ...(c.applicableStandards ?? []).map((s) => s.label),
      ...(c.applicableStandards ?? []).map((s) => s.id),
      ...(c.ratios ?? []).map((r) => r.name),
      ...(c.risks ?? []).map((r) => r.name),
      ...(c.keyPoints ?? []),
    ].filter(Boolean),
  };
}

/** Construit un index Fuse à partir d'items de recherche. */
export function buildSearchIndex(
  items: CycleSearchItem[],
): Fuse<CycleSearchItem> {
  return new Fuse(items, FUSE_OPTIONS);
}

/** Recherche les cycles correspondant à la requête. Vide si requête vide. */
export function searchCycles(
  query: string,
  index: Fuse<CycleSearchItem>,
  limit = 12,
): CycleSearchItem[] {
  if (!query.trim()) return [];
  return index
    .search(query)
    .slice(0, limit)
    .map((r) => r.item);
}
