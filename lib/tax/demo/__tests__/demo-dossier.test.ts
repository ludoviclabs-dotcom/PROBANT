import { describe, expect, it } from "vitest";

import {
  CorporateTaxSnapshotSchema,
  FiscalSynthesisSnapshotSchema,
  VatReconciliationSnapshotSchema,
} from "@/lib/tax";
import { buildDemoTaxCockpitSource, getDemoTaxCockpitSource } from "../demo-dossier";

describe("dossier fiscal de démonstration", () => {
  const source = getDemoTaxCockpitSource();

  it("exécute réellement les trois moteurs et produit des snapshots valides", () => {
    expect(source.corporateTax).not.toBeNull();
    expect(source.vat).not.toBeNull();
    expect(source.cfe).not.toBeNull();
    expect(() => CorporateTaxSnapshotSchema.parse(source.corporateTax!.snapshot)).not.toThrow();
    expect(() => VatReconciliationSnapshotSchema.parse(source.vat!.snapshot)).not.toThrow();
    expect(() => FiscalSynthesisSnapshotSchema.parse(source.synthesis)).not.toThrow();
  });

  it("est déterministe : deux constructions produisent les mêmes empreintes", () => {
    const rebuilt = buildDemoTaxCockpitSource();
    expect(rebuilt.synthesis.snapshotHash).toBe(source.synthesis.snapshotHash);
    expect(rebuilt.corporateTax!.snapshot.snapshotHash).toBe(
      source.corporateTax!.snapshot.snapshotHash,
    );
    expect(rebuilt.vat!.snapshot.snapshotHash).toBe(source.vat!.snapshot.snapshotHash);
  });

  it("porte l'écart de démonstration de 24 850,00 EUR sur la charge d'impôt comptabilisée", () => {
    const line = source.corporateTax!.reconciliationLines.find(
      (candidate) => candidate.lineKey === "accounted_tax_charge",
    );
    expect(line).toBeDefined();
    expect(line!.status).toBe("different");
    // 126 412,50 EUR calculés − 101 562,50 EUR comptabilisés = 24 850,00 EUR.
    expect(Math.abs(line!.differenceAmountCents ?? 0)).toBe(2_485_000);
  });

  it("porte un écart de TVA nette de 20,00 EUR entre comptabilité et CA3", () => {
    const control = source.vat!.snapshot.controls.find(
      (candidate) => candidate.controlId === "VAT.NET",
    );
    expect(control).toBeDefined();
    expect(control!.outcome).toBe("reconciliation_difference");
    // Net comptabilisé 1 300,00 EUR − net déclaré 1 320,00 EUR = −20,00 EUR.
    expect(control!.differenceCents).toBe(-2_000);
  });

  it("agrège les compteurs de sorties depuis les contrôles exécutés", () => {
    const total =
      1 + source.vat!.snapshot.controls.length + source.cfe!.snapshot.controls.length;
    const counted = Object.values(source.synthesis.outcomeCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    expect(counted).toBe(total);
    expect(source.synthesis.headlineStatus).not.toBe("no_conclusion");
  });

  it("construit un dossier IS seul", () => {
    const isOnly = buildDemoTaxCockpitSource({ includeVat: false, includeCfe: false });
    expect(isOnly.corporateTax).not.toBeNull();
    expect(isOnly.vat).toBeNull();
    expect(isOnly.cfe).toBeNull();
    expect(isOnly.periods.map((period) => period.taxType)).toEqual(["corporate_income_tax"]);
    expect(() => FiscalSynthesisSnapshotSchema.parse(isOnly.synthesis)).not.toThrow();
  });

  it("construit un dossier TVA seul", () => {
    const vatOnly = buildDemoTaxCockpitSource({ includeCorporateTax: false, includeCfe: false });
    expect(vatOnly.corporateTax).toBeNull();
    expect(vatOnly.vat).not.toBeNull();
    expect(vatOnly.synthesis.computationSnapshotIds).toEqual([]);
  });

  it("sans aucune pièce, aucun impôt n'est calculable et rien n'est inventé", () => {
    const empty = buildDemoTaxCockpitSource({ withoutDocuments: true });
    expect(empty.corporateTax!.snapshot.status).toBe("blocked");
    // Le moteur TVA reste « reconciled » mais conclut à l'information manquante.
    expect(empty.vat!.snapshot.outcome).toBe("missing_information");
    expect(empty.cfe!.snapshot.capability).toBe("recommend_review");
    expect(empty.synthesis.outcomeCounts.missing_information).toBeGreaterThan(0);
    expect(empty.synthesis.coverage.availableDocumentCount).toBe(0);
    expect(empty.synthesis.headlineStatus).toBe("missing_information");
  });
});
