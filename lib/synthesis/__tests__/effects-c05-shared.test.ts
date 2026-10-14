import { describe, expect, it } from "vitest";
import type { AuditCycle } from "@/lib/audit-cycles/types";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import type { Finding } from "@/lib/canonical-model/finding";
import { buildCycleScores, buildPageAggregates } from "@/lib/risk-mapping/aggregate";
import { scoreGravite } from "@/lib/risk-mapping/scoring";
import { buildSynthesisSnapshot } from "@/lib/synthesis/engine";
import { projectSnapshotExposure, restrictExposure } from "@/lib/synthesis/exposure";
import { generateSynthesisNote } from "@/lib/synthesis/note";
import { buildSynthesisDatasets } from "@/lib/visualization/build-datasets";
import type { WaterfallStep } from "@/lib/visualization/types";
import { CLOCK, makeDossierSnapshot, makeEffect, makeFinding, makeReviewEvent } from "./fixtures";

/**
 * C05 (second passage) — recette de la projection PARTAGÉE. Attendus posés à la main depuis le
 * prompt, sans lire l'implémentation : la Synthèse, la gravité des risques, les agrégats de risque,
 * la concentration, la note et le waterfall lisent les mêmes groupes et les mêmes montants ; aucun
 * montant n'est inféré d'un seuil ; aucun poste ni aucun sens n'est additionné à un autre ; une
 * correction comptabilisée n'alimente jamais les anomalies non corrigées.
 */

const SOCIETE = { raisonSociale: "TEST SA", siren: "000000000", exercice: "2024", dateCloture: "20241231" };
/** Seuil de signification en euros (base et taux sans incidence sur ces tests). */
const MAT = (euros: number): MaterialityThresholds => ({
  base: "chiffre_affaires" as MaterialityThresholds["base"], baseMontant: euros * 100, taux: 0.01,
  significativite: euros, performance: euros * 0.75, trivialite: euros * 0.05, source: "ISA 320",
});

function views(findings: Finding[], over: Parameters<typeof makeDossierSnapshot>[0] = {}) {
  const snapshot = makeDossierSnapshot({ findings, ...over });
  const synthesis = buildSynthesisSnapshot(snapshot, { clock: CLOCK });
  const shared = projectSnapshotExposure(snapshot).exposure;
  const datasets = buildSynthesisDatasets({ synthesis, societe: SOCIETE, findings: snapshot.findings, admissibilityFindings: [], dossier: snapshot });
  const steps = Object.fromEntries(datasets.waterfall.steps.map((st) => [st.id, st.amountCents]));
  const risk = buildPageAggregates([], [], snapshot.findings, undefined, shared);
  const stage = (target = "resultat", direction = "increase") => synthesis.exposure.stages.find((x) => x.target === target && x.direction === direction);
  return { snapshot, synthesis, shared, datasets, steps, risk, stage };
}
const incidence = (g: ReturnType<typeof scoreGravite>) => g.drivers.find((d) => d.label.startsWith("Effets financiers explicites"));
const indeterminate = (g: ReturnType<typeof scoreGravite>) => g.drivers.find((d) => d.label.startsWith("Effets à montant indéterminé"));

/** Chaque pont se réconcilie au centime : détecté + déductions = initial ; initial − en attente − corrigé = non corrigé. */
function expectBridgesReconcile(steps: WaterfallStep[]) {
  const groups = [...new Set(steps.map((s) => s.group))].filter((g) => g !== "Effet sur le résultat");
  for (const g of groups) {
    const mine = steps.filter((s) => s.group === g);
    const at = (suffix: string) => mine.find((s) => s.id.endsWith(`-${suffix}`))?.amountCents ?? 0;
    const beforeInitial = mine.slice(0, mine.findIndex((s) => s.id.endsWith("-initial")));
    expect(beforeInitial.reduce((n, s) => n + (s.amountCents ?? 0), 0), g).toBe(at("initial"));
    expect(at("initial") + at("pending") + at("corrected"), g).toBe(at("uncorrected"));
  }
}

describe("signal sans effet", () => {
  it("100 000 / seuil 50 000 sans effet : aucun montant dans la Synthèse, les risques ni les vues ; la gravité ne dépend pas du seuil", () => {
    const f = makeFinding("f-sig", { mesure: { constate: 100_000, seuil: 50_000, unite: "EUR", libelle: "solde" } });
    const v = views([f]);
    expect(v.synthesis.exposure.stages).toEqual([]);
    expect(v.risk.effects.stages).toEqual([]);
    expect(v.risk.eurSignalsWithoutEffect).toEqual(["f-sig"]);
    // L'ancienne incidence |100 000 − 50 000| aurait saturé la gravité contre un seuil de 1 € : elle n'existe plus.
    expect(scoreGravite([f], MAT(1), v.shared).auto).toBe(scoreGravite([f], MAT(50_000), v.shared).auto);
    expect(incidence(scoreGravite([f], MAT(1), v.shared))).toBeUndefined();
    expect(v.steps["uncorrected-resultat"]).toBe(0);
    expect(v.datasets.concentration.rows[0].cells.exposition).toBe("—");
  });
});

describe("doublon exact et versions", () => {
  const same = (id: string, over: Partial<Finding> = {}) =>
    makeFinding(id, { financialEffect: makeEffect({ amountCents: 100_000 }), lignesSource: [7], ...over });

  it("doublon exact : 1 000 € comptés une fois dans la Synthèse, les agrégats de risque et la gravité", () => {
    const findings = [same("f-a"), same("f-b", { ruleId: "R-OTHER" })];
    const v = views(findings);
    expect(v.stage()).toMatchObject({ detectedCents: 200_000, exactRepeatsCents: 100_000, determinedCents: 100_000, initialCents: 100_000, pendingCents: 100_000 });
    expect(v.risk.effects.stages).toEqual(v.synthesis.exposure.stages);
    expect(incidence(scoreGravite(findings, MAT(1_000), v.shared))!.detail).toMatch(/exposition initiale 1\s000 € .*— 100 % du seuil/);
    // Même résultat sans projection fournie (repli sur les seuls constats du cycle) : mêmes règles.
    expect(incidence(scoreGravite(findings, MAT(1_000)))!.detail).toMatch(/— 100 % du seuil/);
    expect(v.steps["resultat-increase-repeats"]).toBe(-100_000);
  });

  it("100 et 120 sans succession démontrée : conflit, aucun montant retenu ni en Synthèse ni en gravité, bornes conservées", () => {
    const findings = [same("f-100", { financialEffect: makeEffect({ amountCents: 10_000 }) }), same("f-120", { financialEffect: makeEffect({ amountCents: 12_000 }) })];
    const v = views(findings);
    expect(v.stage()).toMatchObject({ detectedCents: 22_000, undeterminedCents: 22_000, determinedCents: 0, initialCents: 0 });
    const g = scoreGravite(findings, MAT(100), v.shared);
    expect(incidence(g)).toBeUndefined();
    expect(indeterminate(g)!.detail).toMatch(/bornes 100 € à 120 €/);
    expect(v.steps["resultat-increase-undetermined"]).toBe(-22_000);
    expect(v.steps["resultat-increase-initial"]).toBe(0);
  });

  it("100 puis 120 en succession démontrée : seule la version 2 compte, partout", () => {
    const findings = [
      same("f-v1", { financialEffect: makeEffect({ amountCents: 10_000, evaluationVersion: 1 }) }),
      same("f-v2", { financialEffect: makeEffect({ amountCents: 12_000, evaluationVersion: 2, supersedesFindingId: "f-v1" }) }),
    ];
    const v = views(findings);
    expect(v.stage()).toMatchObject({ detectedCents: 22_000, supersededCents: 10_000, initialCents: 12_000 });
    expect(incidence(scoreGravite(findings, MAT(100), v.shared))!.detail).toMatch(/exposition initiale 120 € .*— 120 % du seuil/);
    expect(v.steps["resultat-increase-superseded"]).toBe(-10_000);
  });
});

describe("chevauchements et sens", () => {
  const mk = (id: string, lignes: number[], amountCents: number, over: Partial<Parameters<typeof makeEffect>[0]> = {}) =>
    makeFinding(id, { financialEffect: makeEffect({ amountCents, rootCause: `cause-${id}`, ...over }), lignesSource: lignes });

  it("L1/L2 pour 100 et L2/L3 pour 120 (+ un effet indépendant de 30) : seul l'indépendant est agrégé ; bornes et détail conservés", () => {
    const findings = [mk("A", [1, 2], 10_000), mk("B", [2, 3], 12_000), mk("C", [9], 3_000)];
    const v = views(findings);
    expect(v.stage()).toMatchObject({ detectedCents: 25_000, undeterminedCents: 22_000, determinedCents: 3_000, initialCents: 3_000 });
    const g = scoreGravite(findings, MAT(30), v.shared);
    expect(incidence(g)!.detail).toMatch(/exposition initiale 30 € .*— 100 % du seuil/);
    expect(indeterminate(g)!.detail).toMatch(/A \/ B : bornes 120 € à 220 €/);
    expect(v.datasets.waterfall.steps.find((s) => s.id === "resultat-increase-undetermined")!.note).toMatch(/A \/ B bornes 120,00 € à 220,00 €/);
    expectBridgesReconcile(v.datasets.waterfall.steps);
  });

  it("postes et sens distincts : jamais additionnés ; la gravité retient le poste et sens le plus exposé (100 €, ni 210 € ni 60 €)", () => {
    const findings = [
      mk("R+", [1], 10_000),
      mk("R-", [2], 4_000, { direction: "decrease" }),
      mk("P+", [3], 7_000, { target: "bilan_passif" }),
    ];
    const v = views(findings);
    expect(v.synthesis.exposure.stages.map((st) => [st.target, st.direction, st.initialCents])).toEqual([
      ["bilan_passif", "increase", 7_000], ["resultat", "decrease", 4_000], ["resultat", "increase", 10_000],
    ]);
    const detail = incidence(scoreGravite(findings, MAT(100), v.shared))!.detail;
    expect(detail).toMatch(/Résultat · augmentation, exposition initiale 100 € .*— 100 % du seuil/);
    expect(detail).toMatch(/non additionnés : Bilan — passif · augmentation 70 € ; Résultat · diminution 40 €/);
    expect(new Set(v.datasets.waterfall.steps.map((s) => s.group))).toEqual(new Set(["Bilan — passif · augmentation", "Résultat · diminution", "Résultat · augmentation", "Effet sur le résultat"]));
    expectBridgesReconcile(v.datasets.waterfall.steps);
  });

  it("sens opposés sur les mêmes écritures : aucune compensation, chaque sens hors agrégat, aucun montant en gravité", () => {
    const findings = [mk("A", [1], 10_000), mk("B", [1], 4_000, { direction: "decrease" })];
    const v = views(findings);
    expect(v.stage("resultat", "increase")).toMatchObject({ undeterminedCents: 10_000, initialCents: 0 });
    expect(v.stage("resultat", "decrease")).toMatchObject({ undeterminedCents: 4_000, initialCents: 0 });
    expect(incidence(scoreGravite(findings, MAT(10), v.shared))).toBeUndefined();
    expect(v.steps["uncorrected-resultat"]).toBe(0);
  });
});

describe("fiscalité et corrections", () => {
  it("+1 000 validé sans taux ni qualification : non corrigé connu, impôt et net inconnus dans le waterfall, la décision et la note", () => {
    const v = views([makeFinding("f", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 100_000, taxRatePct: undefined, taxQualification: undefined }), lignesSource: [1] })]);
    expect(v.steps["resultat-increase-uncorrected"]).toBe(100_000);
    expect(v.steps["uncorrected-resultat"]).toBe(100_000);
    expect(v.steps.tax).toBeNull();
    expect(v.steps.net).toBeNull();
    const rows = Object.fromEntries(v.datasets.waterfall.rows.map((r) => [r.id, r.cells.montant]));
    expect(rows.tax).toBe("inconnu");
    expect(rows.net).toBe("inconnu");
    expect(v.datasets.decision.items.find((i) => i.id === "exposition-validee")!.detail).toMatch(/net après impôt inconnu/);
    expect(generateSynthesisNote(v.synthesis, SOCIETE)).toMatch(/net après impôt inconnu \(sous-total partiel sur les seuls effets qualifiés : 0,00 €\)/);
  });

  const corrected = (correctionCents: number) => {
    const f = makeFinding("c", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 100_000, taxRatePct: 25, correction: { amountCents: correctionCents } }), lignesSource: [1] });
    return views([f], { reviewEvents: [makeReviewEvent(f, "corrected", "ev-c")] });
  };

  it("correction partielle 600 sur 1 000 : seul le résiduel 400 est non corrigé ; impôt 100, net 300 ; le pont se réconcilie", () => {
    const v = corrected(60_000);
    expect(v.steps["resultat-increase-initial"]).toBe(100_000);
    expect(v.steps["resultat-increase-corrected"]).toBe(-60_000);
    expect(v.steps["resultat-increase-uncorrected"]).toBe(40_000);
    expect(v.steps["uncorrected-resultat"]).toBe(40_000);
    expect(v.steps.tax).toBe(-10_000);
    expect(v.steps.net).toBe(30_000);
    expectBridgesReconcile(v.datasets.waterfall.steps);
  });

  it("correction totale : aucune anomalie non corrigée, aucun impôt, net nul ; la gravité garde l'exposition initiale (l'erreur a existé)", () => {
    const v = corrected(100_000);
    expect(v.steps["resultat-increase-uncorrected"]).toBe(0);
    expect(v.steps["uncorrected-resultat"]).toBe(0);
    expect(v.steps.tax).toBe(0);
    expect(v.steps.net).toBe(0);
    expect(incidence(scoreGravite(v.snapshot.findings, MAT(1_000), v.shared))!.detail).toMatch(/exposition initiale 1\s000 €/);
  });

  it("constat écarté : hors exposition initiale, hors gravité, visible dans le pont comme écarté", () => {
    const v = views([makeFinding("e", { statutRevue: "ecarte", financialEffect: makeEffect({ amountCents: 100_000 }), lignesSource: [1] })]);
    expect(v.stage()).toMatchObject({ determinedCents: 100_000, dismissedCents: 100_000, initialCents: 0 });
    expect(v.steps["resultat-increase-dismissed"]).toBe(-100_000);
    expect(incidence(scoreGravite(v.snapshot.findings, MAT(1), v.shared))).toBeUndefined();
  });
});

describe("invariance, double comptage, mêmes résultats", () => {
  const findings = [
    makeFinding("f-1", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 10_000, taxRatePct: 25 }), lignesSource: [1] }),
    makeFinding("f-2", { statutRevue: "valide", financialEffect: makeEffect({ amountCents: 10_000, taxRatePct: 25 }), lignesSource: [1], ruleId: "R-DUP" }),
    makeFinding("f-3", { financialEffect: makeEffect({ amountCents: 5_000, rootCause: "x" }), lignesSource: [2, 3] }),
    makeFinding("f-4", { financialEffect: makeEffect({ amountCents: 7_000, rootCause: "y" }), lignesSource: [3, 4] }),
    makeFinding("f-5", { cloison: "bilan-passif", financialEffect: makeEffect({ amountCents: 9_000, direction: "decrease", target: "bilan_passif", rootCause: "z" }), lignesSource: [5] }),
    makeFinding("f-6", { mesure: { constate: 100_000, seuil: 50_000, unite: "EUR", libelle: "signal" } }),
  ];

  it("l'ordre d'entrée ne change ni le waterfall, ni la gravité, ni les agrégats de risque", () => {
    const a = views(findings);
    const b = views([...findings].reverse());
    const c = views([findings[3], findings[5], findings[0], findings[4], findings[2], findings[1]]);
    for (const other of [b, c]) {
      expect(other.datasets.waterfall.steps).toEqual(a.datasets.waterfall.steps);
      expect(other.risk.effects).toEqual(a.risk.effects);
      // Les montants et les drivers d'effets ne dépendent pas de l'ordre (les drivers de densité listent les constats dans l'ordre reçu).
      const effectsView = (g: ReturnType<typeof scoreGravite>) => ({ auto: g.auto, incidence: incidence(g), indeterminate: indeterminate(g) });
      expect(effectsView(scoreGravite(other.snapshot.findings, MAT(100), other.shared))).toEqual(effectsView(scoreGravite(a.snapshot.findings, MAT(100), a.shared)));
      expect(other.datasets.concentration.rows).toEqual(a.datasets.concentration.rows);
    }
  });

  it("deux cycles touchant le même groupe le jugent identiquement ; le total de page ne somme pas les cycles", () => {
    const cycle = (slug: string) => ({ slug, family: "ACTIF_CIRCULANT", title: slug, pcgAccounts: [], probantSiloIds: ["silo-test"], probantCloisons: [], applicableStandards: [], risks: [], relatedCycles: [] }) as unknown as AuditCycle;
    const pair = [
      makeFinding("d-a", { financialEffect: makeEffect({ amountCents: 100_000 }), lignesSource: [7] }),
      makeFinding("d-b", { financialEffect: makeEffect({ amountCents: 100_000 }), lignesSource: [7], ruleId: "R-OTHER" }),
    ];
    const v = views(pair);
    const cycles = [cycle("cycle-a"), cycle("cycle-b")];
    const scores = buildCycleScores(cycles, v.snapshot.findings, MAT(1_000), {}, v.shared);
    for (const s of scores) {
      expect(s.findingCount).toBe(2);
      expect(s.axes.gravite.drivers.find((d) => d.label.startsWith("Effets financiers explicites"))!.detail).toMatch(/exposition initiale 1\s000 € .*— 100 % du seuil/);
    }
    expect(scores[0].axes.gravite.value).toBe(scores[1].axes.gravite.value);
    const page = buildPageAggregates(cycles, scores, v.snapshot.findings, undefined, v.shared);
    expect(page.effects.stages.map((st) => st.initialCents)).toEqual([100_000]);
  });

  it("aucun double comptage : un constat transmis deux fois et une répétition exacte comptent une fois", () => {
    const v = views(findings);
    const twice = buildPageAggregates([], [], [...v.snapshot.findings, v.snapshot.findings[0]], undefined, v.shared);
    expect(twice.effects.stages).toEqual(v.synthesis.exposure.stages);
    expect(v.stage()).toMatchObject({ detectedCents: 32_000, exactRepeatsCents: 10_000, undeterminedCents: 12_000, initialCents: 10_000 });
    expect(v.stage("bilan_passif", "decrease")).toMatchObject({ detectedCents: 9_000, initialCents: 9_000 });
  });

  it("mêmes résultats : Synthèse, risques, périmètre entier, concentration et pont lisent les mêmes montants", () => {
    const v = views(findings);
    expect(v.risk.effects.stages).toEqual(v.synthesis.exposure.stages);
    expect(restrictExposure(v.synthesis.exposure, findings.map((f) => f.id)).stages).toEqual(v.synthesis.exposure.stages);
    for (const st of v.synthesis.exposure.stages) {
      const k = `${st.target}-${st.direction}`;
      expect(v.steps[`${k}-initial`]).toBe(st.initialCents);
      expect(v.steps[`${k}-uncorrected`]).toBe(st.proposedCents + st.residualCents);
    }
    const byCloison = Object.fromEntries(v.datasets.concentration.rows.map((r) => [r.id, r.cells.exposition]));
    expect(byCloison.resultat).toMatch(/^Résultat \+ 100,00 € · 1 groupe\(s\) indéterminé\(s\)$/);
    expect(byCloison["bilan-passif"]).toMatch(/^Bilan — passif − 90,00 €$/);
    expectBridgesReconcile(v.datasets.waterfall.steps);
  });
});
