import { describe, expect, it } from "vitest";

import { buildDemoTaxCockpitSource, getDemoTaxCockpitSource } from "../../demo/demo-dossier";
import { buildTaxCockpitDatasets } from "../build-cockpit-datasets";
import {
  CONTROL_DETAIL_DISPLAY,
  CONTROL_TITLE_DISPLAY,
  describeRequiredInput,
  displayControlDetail,
  displayControlTitle,
  displayLimitationMessage,
  displayReconciliationLineLabel,
  displayVatComparisonLabel,
  displayWaterfallStepLabel,
  LIMITATION_MESSAGE_DISPLAY,
  RECONCILIATION_LINE_DISPLAY,
  stripDiacritics,
  VAT_COMPARISON_DISPLAY,
  WATERFALL_STEP_DISPLAY,
} from "../display-labels";

const TABLES = {
  WATERFALL_STEP_DISPLAY,
  RECONCILIATION_LINE_DISPLAY,
  VAT_COMPARISON_DISPLAY,
  CONTROL_TITLE_DISPLAY,
  CONTROL_DETAIL_DISPLAY,
  LIMITATION_MESSAGE_DISPLAY,
};

const source = getDemoTaxCockpitSource();
const datasets = buildTaxCockpitDatasets(source);

describe("tables d'affichage : seuls les diacritiques changent", () => {
  it("chaque libellé fixe ne diffère du texte du moteur que par ses accents", () => {
    for (const [name, table] of Object.entries(TABLES)) {
      for (const [code, entries] of Object.entries(table)) {
        for (const [engine, display] of entries) {
          if (typeof engine !== "string") continue;
          expect(stripDiacritics(display), `${name}.${code}`).toBe(engine);
          // Le texte du moteur est bien la forme sans accent : rien à « corriger » d'autre.
          expect(stripDiacritics(engine), `${name}.${code}`).toBe(engine);
        }
      }
    }
  });

  it("les motifs rendent une phrase qui ne diffère du moteur que par ses accents", () => {
    const samples: readonly (readonly [(code: string, text: string) => string, string, string, string])[] = [
      [displayReconciliationLineLabel, "vat_form_coherence", "Coherence interne 3310-CA3-SD : brute moins deductible et net declare", "Cohérence interne 3310-CA3-SD : brute moins déductible et net déclaré"],
      [displayControlDetail, "VAT.ENTRY.NO_REFERENCE", "12 ecriture(s) de TVA sans reference de piece.", "12 écriture(s) de TVA sans référence de pièce."],
      [displayControlDetail, "VAT.DECLARED", "Declaration 3517-S-CA12 exploitable pour la periode.", "Déclaration 3517-S-CA12 exploitable pour la période."],
      [displayControlDetail, "CFE.NOTICE.AVAILABLE", "2 avis exploitable(s) pour la periode.", "2 avis exploitable(s) pour la période."],
      [displayLimitationMessage, "vat-limitation:VAT_DECLARATION_UNAVAILABLE", "Aucune 3310-CA3-SD exploitable pour la periode : l'absence de declaration n'est pas assimilee a une declaration a zero.", "Aucune 3310-CA3-SD exploitable pour la période : l'absence de déclaration n'est pas assimilée à une déclaration à zéro."],
      [displayLimitationMessage, "corporate-tax-limitation:ACCOUNTING_RESULT_UNAVAILABLE", "Les cases WA/WS ne permettent pas d'etablir le resultat comptable sans supposer qu'une absence vaut zero. Diagnostics: WA:missing:missing_field.", "Les cases WA/WS ne permettent pas d'établir le résultat comptable sans supposer qu'une absence vaut zéro. Diagnostics: WA:missing:missing_field."],
    ];
    for (const [project, code, engine, expected] of samples) {
      const displayed = project(code, engine);
      expect(displayed).toBe(expected);
      expect(stripDiacritics(displayed)).toBe(stripDiacritics(engine));
    }
  });
});

describe("repli : le texte du moteur s'affiche tel quel", () => {
  it("un code inconnu ou absent rend le texte du moteur", () => {
    expect(displayWaterfallStepLabel("unknown_step", "Etape inconnue")).toBe("Etape inconnue");
    expect(displayReconciliationLineLabel(null, "Ligne sans cle")).toBe("Ligne sans cle");
    expect(displayControlTitle(undefined, "Titre libre")).toBe("Titre libre");
    expect(displayLimitationMessage("vat-limitation:VAT_SOURCE_NOT_COVERED:VAT.NET", "Source non couverte")).toBe("Source non couverte");
  });

  it("un code connu dont le moteur a changé la formulation n'affiche jamais l'ancien libellé", () => {
    expect(displayWaterfallStepLabel("accounting_result", "Resultat comptable retraite")).toBe("Resultat comptable retraite");
    expect(displayControlDetail("VAT.NET", "Nouvelle phrase du moteur.")).toBe("Nouvelle phrase du moteur.");
  });
});

describe("dossier de démonstration", () => {
  it("chaque étape du waterfall reçoit son libellé accentué, attendus établis à la main", () => {
    const shown = datasets.waterfall.steps.map((step) => displayWaterfallStepLabel(step.id, step.label));
    expect(shown).toEqual([
      "Résultat comptable",
      "Réintégrations confirmées",
      "Réintégrations proposées",
      "Déductions confirmées",
      "Déductions proposées",
      "Résultat fiscal avant déficits",
      "Déficits imputés",
      "Base imposable",
      "Impôt sur les sociétés brut",
    ]);
  });

  it("chaque ligne de rapprochement est reconnue par sa clé stable", () => {
    const lines = [
      ...(source.corporateTax?.reconciliationLines ?? []),
      ...(source.vat?.reconciliationLines ?? []),
      ...(source.cfe?.reconciliationLines ?? []),
    ];
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(RECONCILIATION_LINE_DISPLAY[line.lineKey], line.lineKey).toBeDefined();
      const shown = displayReconciliationLineLabel(line.lineKey, line.label);
      expect(stripDiacritics(shown)).toBe(line.label);
    }
    const charge = lines.find((line) => line.lineKey === "accounted_tax_charge")!;
    expect(displayReconciliationLineLabel(charge.lineKey, charge.label)).toBe(
      "Impôt liquidé estimé et charge d'impôt comptabilisée",
    );
  });

  it("chaque titre de contrôle TVA et CFE exécuté est couvert", () => {
    const controls = [...(source.vat?.snapshot.controls ?? []), ...(source.cfe?.snapshot.controls ?? [])];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(CONTROL_TITLE_DISPLAY[control.controlId], control.controlId).toBeDefined();
      expect(displayControlTitle(control.controlId, control.title)).not.toBe("");
    }
    expect(displayControlTitle("CFE.ESTABLISHMENT.COHERENCE", "Coherence des etablissements")).toBe(
      "Cohérence des établissements",
    );
  });

  it("les agrégats TVA comparés sont reconnus", () => {
    for (const bar of datasets.vatReconciliation.bars) {
      expect(VAT_COMPARISON_DISPLAY[bar.id], bar.id).toBeDefined();
    }
    expect(displayVatComparisonLabel("collected", "TVA collectee")).toBe("TVA collectée");
  });

  it("la limitation du taux réduit s'affiche accentuée", () => {
    const row = datasets.requiredDocuments.rows.find((candidate) => candidate.id.endsWith("REDUCED_RATE_ELIGIBILITY_UNKNOWN"))!;
    expect(displayLimitationMessage(row.id, String(row.cells.piece))).toBe(
      "Une condition du taux réduit n'est pas renseignée : le taux réduit n'est pas appliqué et l'impôt reste une estimation au taux normal.",
    );
  });
});

describe("aucune valeur ni empreinte n'est modifiée", () => {
  it("les datasets portent toujours le libellé du moteur, la projection est faite au rendu", () => {
    const engineSteps = source.corporateTax!.snapshot.waterfall.steps;
    expect(datasets.waterfall.steps.map((step) => step.label)).toEqual(engineSteps.map((step) => step.label));
    const engineLines = source.corporateTax!.reconciliationLines;
    expect(datasets.corporateReconciliation.bars.map((bar) => bar.label)).toEqual(engineLines.map((line) => line.label));
  });

  it("la clé de ligne exposée est celle du moteur", () => {
    const engineLines = source.corporateTax!.reconciliationLines;
    expect(datasets.corporateReconciliation.bars.map((bar) => bar.lineKey)).toEqual(engineLines.map((line) => line.lineKey));
    for (const line of [...engineLines, ...(source.vat?.reconciliationLines ?? []), ...(source.cfe?.reconciliationLines ?? [])]) {
      expect(datasets.findings.details[line.id]?.lineKey).toBe(line.lineKey);
    }
    for (const bar of datasets.vatReconciliation.bars) expect(bar.lineKey).toBeNull();
  });

  it("projeter les libellés ne touche ni l'instantané IS ni la synthèse fiscale", () => {
    const fresh = buildDemoTaxCockpitSource();
    const before = [fresh.corporateTax!.snapshot.snapshotHash, fresh.synthesis.snapshotHash];
    for (const step of fresh.corporateTax!.snapshot.waterfall.steps) displayWaterfallStepLabel(step.code, step.label);
    for (const line of fresh.corporateTax!.reconciliationLines) displayReconciliationLineLabel(line.lineKey, line.label);
    expect([fresh.corporateTax!.snapshot.snapshotHash, fresh.synthesis.snapshotHash]).toEqual(before);
    expect(fresh.corporateTax!.snapshot.snapshotHash).toBe(source.corporateTax!.snapshot.snapshotHash);
    expect(fresh.synthesis.snapshotHash).toBe(source.synthesis.snapshotHash);
  });
});

describe("donnée attendue sans table de libellés", () => {
  it("le fait « ownershipStatus » est décrit par la phrase de sa recommandation, code conservé", () => {
    const described = describeRequiredInput("profile:ownershipStatus");
    expect(described.code).toBe("profile:ownershipStatus");
    expect(described.title).toBe("Confirmer le taux de détention");
    expect(described.sentence).toBe(
      "Documenter et confirmer le taux et la nature de la détention du capital pour la période contrôlée.",
    );
  });

  it("un code sans règle reste sans phrase (le code seul est montré)", () => {
    expect(describeRequiredInput("field:16")).toEqual({ code: "field:16", title: null, sentence: null });
  });
});
