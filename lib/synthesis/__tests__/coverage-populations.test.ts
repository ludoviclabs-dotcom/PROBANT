import { describe, expect, it } from "vitest";
import { buildSynthesisSnapshot } from "@/lib/synthesis/engine";
import { buildSynthesisDatasets } from "@/lib/visualization/build-datasets";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { appendDemoEvent, createDemoRecord, syntheticBaseline } from "@/lib/workpapers/browser-demo";
import type { CalculationContext, DossierSnapshot } from "@/lib/canonical-model/dossier";
import { CLOCK, makeDossierSnapshot } from "./fixtures";

/** C03 — recette des populations de couverture : manquante, connue vide, non applicable, partielle, non qualifiée. */
const ctx = (over: Partial<CalculationContext>): CalculationContext => ({
  entriesTotal: 100, entriesAnalysed: 100, controlsEligible: 10, controlsExecuted: 10, controlsConcluded: 10, controlsNotConcluded: 0, notes: [], ...over,
});
const build = (over: Partial<DossierSnapshot>) => buildSynthesisSnapshot(makeDossierSnapshot(over), { clock: CLOCK });
const population = (s: ReturnType<typeof build>, id: "entries" | "controls") => s.coverage.populations.find((p) => p.id === id)!;

describe("couverture : populations qualifiées séparément", () => {
  it("population manquante (écritures non dénombrées) : aucun ratio, couverture non qualifiée, verdict sans exploitabilité", () => {
    const s = build({ calculationContext: ctx({ entriesTotal: 0, entriesAnalysed: 0 }) });
    expect(population(s, "entries")).toMatchObject({ status: "missing", denominator: null, ratio: null });
    expect(population(s, "controls")).toMatchObject({ status: "complete", ratio: 1 });
    expect(s.coverage.status).toBe("unqualified");
    expect(s.verdict).toMatchObject({ status: "insufficient_coverage", headline: "Couverture non qualifiée" });
    expect(s.limitations.some((l) => l.code === "coverage_unqualified" && l.subjects.includes("entries"))).toBe(true);
  });
  it("population connue vide (fichier lu, zéro écriture) : rien à couvrir, les contrôles déclarés gouvernent", () => {
    const s = build({ calculationContext: ctx({ entriesTotal: 0, entriesAnalysed: 0, entriesPopulation: "known_empty" }) });
    expect(population(s, "entries")).toMatchObject({ status: "known_empty", ratio: null });
    expect(s.coverage.status).toBe("substantial");
    expect(s.limitations.some((l) => l.code === "coverage_unqualified")).toBe(false);
  });
  it("population non applicable : exclue du ratio directeur, tracée comme telle", () => {
    const s = build({ calculationContext: ctx({ entriesTotal: 0, entriesAnalysed: 0, entriesPopulation: "not_applicable" }) });
    expect(population(s, "entries").status).toBe("not_applicable");
    expect(s.calculationTrace.find((t) => t.metricId === "coverage.status")?.excludedItems.map((e) => e.id)).toEqual(["entries"]);
    expect(s.coverage.status).toBe("substantial");
  });
  it("population partiellement traitée : ratio sur dénominateur qualifié, couverture partielle", () => {
    const s = build({ calculationContext: ctx({ entriesAnalysed: 40 }) });
    expect(population(s, "entries")).toMatchObject({ status: "partial", numerator: 40, denominator: 100, ratio: 0.4 });
    expect(s.coverage.status).toBe("partial");
  });
  it("contrôles comptés depuis les constats : dénominateur non qualifié même à 24/24, jamais « substantielle »", () => {
    const s = build({ calculationContext: ctx({ controlsEligible: 24, controlsExecuted: 24, controlsConcluded: 24, controlsDenominatorBasis: "findings_only" }) });
    expect(population(s, "controls")).toMatchObject({ status: "unqualified", ratio: null, numerator: 24 });
    expect(population(s, "entries").ratio).toBe(1);
    // Les écritures sont intégralement traitées mais le dénominateur de contrôles est non qualifié : la couverture n'est pas qualifiée.
    expect(s.coverage.status).toBe("unqualified");
    expect(s.limitations.map((l) => l.code)).toContain("coverage_unqualified");
  });
  it("DEMO SA (0/0 écritures, contrôles comptés depuis les constats) n'est plus « substantielle »", () => {
    const s = buildSynthesisSnapshot(buildDemoDossierSnapshot(), { clock: CLOCK });
    expect(s.coverage.populations.map((p) => p.status)).toEqual(["missing", "unqualified"]);
    expect(s.coverage.status).toBe("unqualified");
    expect(s.coverage.populations.every((p) => p.ratio === null)).toBe(true);
  });
  it("source absente : la limite de document manquant reste distincte de la couverture", () => {
    const s = build({ sourceDocuments: [], calculationContext: ctx({ expectedDocumentTypes: ["fec"] }) });
    expect(s.limitations.some((l) => l.code === "missing_document")).toBe(true);
    expect(s.coverage.status).toBe("substantial");
  });
});

describe("couverture des travaux : vue distincte de la matrice des constats", () => {
  const datasets = (snapshot: DossierSnapshot) => buildSynthesisDatasets({
    synthesis: buildSynthesisSnapshot(snapshot, { clock: CLOCK }), societe: snapshot.dossier.societe, findings: snapshot.findings, admissibilityFindings: snapshot.admissibilityFindings, dossier: snapshot,
  });
  it("sans travail : couverture non établie, aucune ligne réputée couverte", () => {
    const d = datasets(buildDemoDossierSnapshot());
    expect(d.workCoverage.rows).toHaveLength(0);
    expect(d.workCoverage.summary).toMatch(/non établie/);
    expect(d.riskHeatmap.rows.length).toBeGreaterThan(0);
  });
  it("travail non concluant : la ligne le dit, avec pièces et version ; une assertion visée n'est pas couverte", async () => {
    const run = await appendDemoEvent(createDemoRecord("SYN-c03"), { action: "create", parameters: { cycle: "clients", scenario: "nominal", missingEvidence: false, methodAvailable: true } });
    const d = datasets({ ...syntheticBaseline("SYN-c03"), ...run.snapshot });
    expect(d.workCoverage.rows).toHaveLength(1);
    const row = d.workCoverage.rows[0];
    expect(String(row.cells.travail)).toMatch(/Non concluant|Exécuté/);
    expect(String(row.cells.version)).toMatch(/^r\d+ v\d+$/);
    expect(typeof row.cells.pieces).toBe("number");
    expect(String(row.cells.assertions).length).toBeGreaterThan(0);
  });
  it("travail bloqué (source absente) : procédure non exécutée, ligne critique", async () => {
    const run = await appendDemoEvent(createDemoRecord("SYN-c03b"), { action: "create", parameters: { cycle: "cash", scenario: "nominal", missingEvidence: true, methodAvailable: true } });
    const d = datasets({ ...syntheticBaseline("SYN-c03b"), ...run.snapshot });
    expect(d.workCoverage.rows[0]).toMatchObject({ emphasis: "critical" });
    expect(String(d.workCoverage.rows[0].cells.travail)).toMatch(/Bloqué/);
  });
});
