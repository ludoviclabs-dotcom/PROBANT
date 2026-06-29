import { describe, it, expect } from "vitest";
import {
  computeMateriality,
  evaluateSeuil,
  deriveFauxPositif,
  enrichFinding,
} from "../materiality";
import type { Finding } from "@/lib/canonical-model";

function makeFinding(partial: Partial<Finding> = {}): Finding {
  return {
    id: "F-1",
    family: "hardLaw",
    severity: "majeur",
    ruleId: "R-TEST",
    ruleVersion: "1.0.0",
    cloison: "bilan-actif",
    siloId: "immobilisations-corporelles",
    titre: "Constat de test",
    constat: "…",
    explication: "…",
    mesure: { constate: 100000, seuil: 0, unite: "EUR", libelle: "test" },
    source: { ref: "PCG", citation: "…", effectiveDate: "2025-01-01" },
    comptesConcernes: [],
    lignesSource: [],
    faisceau: [],
    preuve: [],
    statutRevue: "en_attente",
    ...partial,
  };
}

describe("computeMateriality", () => {
  it("retient le CA en priorité sur le total bilan", () => {
    const th = computeMateriality({
      chiffreAffaires: 1_000_000,
      totalBilan: 2_000_000,
    });
    expect(th).not.toBeNull();
    expect(th!.base).toBe("chiffre_affaires");
    expect(th!.taux).toBe(0.005);
    expect(th!.significativite).toBe(5000);
    expect(th!.performance).toBe(3750);
  });

  it("retombe sur le total bilan si pas de CA", () => {
    const th = computeMateriality({ totalBilan: 500_000 });
    expect(th!.base).toBe("total_bilan");
    expect(th!.significativite).toBe(5000); // 1 %
  });

  it("retourne null sans base exploitable", () => {
    expect(computeMateriality({})).toBeNull();
    expect(computeMateriality({ chiffreAffaires: 0 })).toBeNull();
  });
});

describe("evaluateSeuil", () => {
  const th = computeMateriality({ chiffreAffaires: 1_000_000 })!; // sig = 5000

  it("dépasse au-delà du seuil de signification", () => {
    expect(evaluateSeuil(6000, th).depasse).toBe(true);
    expect(evaluateSeuil(-6000, th).depasse).toBe(true); // valeur absolue
  });

  it("ne dépasse pas en deçà", () => {
    expect(evaluateSeuil(4000, th).depasse).toBe(false);
  });
});

describe("deriveFauxPositif", () => {
  it("droit dur : faible si dépassé ou non chiffré, moyen sous le seuil", () => {
    expect(deriveFauxPositif(makeFinding({ family: "hardLaw" }), true)).toBe("faible");
    expect(deriveFauxPositif(makeFinding({ family: "hardLaw" }), null)).toBe("faible");
    expect(deriveFauxPositif(makeFinding({ family: "hardLaw" }), false)).toBe("moyen");
  });

  it("présomption d'audit : élevé sous le seuil", () => {
    expect(deriveFauxPositif(makeFinding({ family: "methodology" }), false)).toBe("eleve");
    expect(deriveFauxPositif(makeFinding({ family: "methodology" }), true)).toBe("moyen");
  });

  it("paramètre interne : toujours à confirmer si non chiffré", () => {
    expect(deriveFauxPositif(makeFinding({ family: "internal" }), null)).toBe("eleve");
    expect(deriveFauxPositif(makeFinding({ family: "internal" }), true)).toBe("moyen");
  });

  it("respecte une valeur déjà renseignée", () => {
    expect(
      deriveFauxPositif(makeFinding({ family: "internal", fauxPositifRisk: "faible" }), null),
    ).toBe("faible");
  });
});

describe("enrichFinding", () => {
  const th = computeMateriality({ chiffreAffaires: 1_000_000 })!; // sig = 5000

  it("calcule le seuil pour une mesure en EUR", () => {
    const f = enrichFinding(
      makeFinding({ mesure: { constate: 100000, seuil: 0, unite: "EUR", libelle: "x" } }),
      th,
    );
    expect(f.seuilApplique?.depasse).toBe(true);
    expect(f.fauxPositifRisk).toBe("faible"); // hardLaw + dépassé
  });

  it("n'applique pas de seuil à une mesure non chiffrée en EUR", () => {
    const f = enrichFinding(
      makeFinding({
        family: "internal",
        mesure: { constate: 40, seuil: 20, unite: "%", libelle: "taux" },
      }),
      th,
    );
    expect(f.seuilApplique).toBeUndefined();
    expect(f.fauxPositifRisk).toBe("eleve"); // internal non chiffré
  });

  it("sans seuils disponibles, dérive quand même le risque", () => {
    const f = enrichFinding(makeFinding({ family: "methodology" }), null);
    expect(f.seuilApplique).toBeUndefined();
    expect(f.fauxPositifRisk).toBeDefined();
  });
});
