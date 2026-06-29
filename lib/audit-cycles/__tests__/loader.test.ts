import { describe, it, expect, beforeAll } from "vitest";
import { loadAllCycles, loadCycle, loadAllSources } from "../loader";
import type { AuditCycle, NormativeSource } from "../types";

describe("loadAllCycles", () => {
  let cycles: AuditCycle[];

  beforeAll(async () => {
    cycles = await loadAllCycles();
  });

  it("charge au moins 5 cycles", () => {
    expect(cycles.length).toBeGreaterThanOrEqual(5);
  });

  it("chaque cycle a les champs structurants", () => {
    for (const c of cycles) {
      expect(c.slug, `slug pour ${c.title}`).toBeTruthy();
      expect(c.title, `title pour ${c.slug}`).toBeTruthy();
      expect(c.family, `family pour ${c.slug}`).toBeTruthy();
      expect(c.reviewStatus, `reviewStatus pour ${c.slug}`).toBeTruthy();
    }
  });

  it("les slugs respectent la convention kebab-case", () => {
    for (const c of cycles) {
      expect(c.slug).toMatch(/^[a-z][a-z0-9-]+$/);
    }
  });

  it("aucun slug dupliqué", () => {
    const slugs = cycles.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("chaque cycle porte le caveat de matérialité (principe non chiffré ISA/NEP)", () => {
    for (const c of cycles) {
      expect(c.materiality?.globalMateriality?.caveat, c.slug).toBeTruthy();
      expect(c.materiality.globalMateriality.caveat.length).toBeGreaterThan(20);
    }
  });

  it("aucun pourcentage de matérialité n'est marqué OBLIGATOIRE", () => {
    for (const c of cycles) {
      for (const block of Object.values(c.materiality ?? {})) {
        expect(block.status, c.slug).not.toBe("OBLIGATOIRE");
      }
    }
  });
});

describe("loadCycle", () => {
  it("charge immobilisations-corporelles avec son cross-link silo PROBANT", async () => {
    const c = await loadCycle("immobilisations-corporelles");
    expect(c.probantSiloIds).toContain("immobilisations-corporelles");
    expect(c.pcgAccounts).toContain("21");
  });

  it("lève une erreur sur un slug inconnu", async () => {
    await expect(loadCycle("cycle-inexistant-xyz")).rejects.toThrow();
  });
});

describe("loadAllSources", () => {
  let sources: NormativeSource[];

  beforeAll(async () => {
    sources = await loadAllSources();
  });

  it("charge le registre des sources (ISA, NEP, IFRS, PCG…)", () => {
    expect(sources.length).toBeGreaterThan(30);
  });

  it("contient les sources clés référencées par les cycles", () => {
    const ids = new Set(sources.map((s) => s.id));
    for (const id of ["isa-240", "isa-320", "ias-16", "ifrs-15", "pcg-322-1"]) {
      expect(ids.has(id), `source manquante : ${id}`).toBe(true);
    }
  });
});
