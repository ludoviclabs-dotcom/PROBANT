import { describe, it, expect } from "vitest";
import { buildSearchIndex, searchCycles } from "../search";
import type { CycleSearchItem } from "../types";

const ITEMS: CycleSearchItem[] = [
  {
    slug: "immobilisations-corporelles",
    title: "Immobilisations corporelles",
    family: "ACTIF_IMMOBILISE",
    pcgAccounts: ["21", "281"],
    keywords: ["PCG art. 214-13", "IAS 16", "Taux d'amortissement"],
  },
  {
    slug: "creances-clients",
    title: "Créances clients",
    family: "ACTIF_CIRCULANT",
    pcgAccounts: ["411", "491"],
    keywords: ["ISA 315", "IFRS 9", "DSO"],
  },
  {
    slug: "provisions-risques-charges",
    title: "Provisions pour risques et charges",
    family: "PASSIF_ENGAGEMENTS",
    pcgAccounts: ["15"],
    keywords: ["IAS 37", "ISA 540"],
  },
];

describe("searchCycles", () => {
  const index = buildSearchIndex(ITEMS);

  it("retourne un tableau vide pour une requête vide", () => {
    expect(searchCycles("", index)).toHaveLength(0);
  });

  it("trouve un cycle par son titre", () => {
    const r = searchCycles("immobilisations", index);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].slug).toBe("immobilisations-corporelles");
  });

  it("trouve un cycle par préfixe de compte PCG", () => {
    const r = searchCycles("411", index);
    expect(r.some((x) => x.slug === "creances-clients")).toBe(true);
  });

  it("trouve un cycle par mot-clé de norme", () => {
    const r = searchCycles("IAS 37", index);
    expect(r.some((x) => x.slug === "provisions-risques-charges")).toBe(true);
  });

  it("trouve par ratio indexé (DSO)", () => {
    const r = searchCycles("DSO", index);
    expect(r.some((x) => x.slug === "creances-clients")).toBe(true);
  });
});
