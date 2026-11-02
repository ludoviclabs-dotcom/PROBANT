/**
 * Plan des cloisons — projection pure de la revue par cloison.
 *
 * Attendus posés indépendamment de l'implémentation :
 *  - fixtures synthétiques : ordre de la taxonomie (actif avant passif avant résultat), gravité la plus haute,
 *    silos hors taxonomie ignorés, signal EUR sans effet ≠ zéro ;
 *  - dossier démo (lib/demo/dataset.ts, relevé du 30/10/2026 et attendus C05) : 28 silos, 42 constats rattachés
 *    (+ 1 constat d'admissibilité hors cloison), actif 11 silos / 20 constats, passif 8 / 11, résultat 7 / 8,
 *    annexe 1 / 1, TVA 1 / 2 ; trois effets explicites sur le résultat — Provisions 145 000 € et chiffre
 *    d'affaires 312 000 € en diminution, charges constatées d'avance 18 000 € en augmentation ; 31 signaux EUR.
 */
import { describe, expect, it } from "vitest";
import type { Finding, SiloView } from "@/lib/canonical-model";
import { CLOISONS } from "@/lib/canonical-model";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { projectSnapshotExposure } from "@/lib/synthesis/exposure";
import {
  PLAN_LAYOUT,
  buildCloisonsPlan,
  compactEur,
  effectNote,
  eurRow,
  exposureMeasure,
  exposureScore,
  formatEcart,
  formatMesure,
  formatSeuil,
  severityCounts,
  siloEffects,
  worstSeverity,
} from "../plan";

const NO_EXPOSURE = { clusters: [] };

function finding(id: string, over: Partial<Finding> = {}): Finding {
  return {
    id,
    family: "hardLaw",
    severity: "mineur",
    ruleId: "R-TEST",
    ruleVersion: "1.0.0",
    cloison: "bilan-actif",
    siloId: "stocks",
    titre: `Constat ${id}`,
    constat: "Constat de test.",
    explication: "Explication de test.",
    mesure: { constate: 2, seuil: 1, unite: "ratio", libelle: "ratio de test" },
    source: { ref: "PCG art. 1", citation: "Texte.", effectiveDate: "2024-01-01" },
    comptesConcernes: [],
    lignesSource: [],
    faisceau: [],
    preuve: [],
    statutRevue: "en_attente",
    ...over,
  };
}

function silo(siloId: string, findings: Finding[]): SiloView {
  return { siloId, statement: { titre: siloId, unite: "EUR", rows: [] }, findings };
}

describe("plan des cloisons — fixtures synthétiques", () => {
  const silos = [
    silo("chiffre-affaires", [finding("CA-1", { severity: "informatif" })]),
    silo("provisions", [finding("P-1", { severity: "mineur" }), finding("P-2", { severity: "bloquant" })]),
    silo("silo-inconnu", [finding("X-1", { severity: "bloquant" })]),
    silo("stocks", [finding("S-1", { severity: "majeur" }), finding("S-2", { severity: "mineur" })]),
    silo("cca", []),
  ];
  const plan = buildCloisonsPlan(silos, NO_EXPOSURE);

  it("range les silos dans l'ordre de la taxonomie, sans les silos inconnus", () => {
    expect(plan.groups.map((g) => g.cloisonId)).toEqual(["bilan-actif", "bilan-passif", "resultat"]);
    expect(plan.groups[0].cells.map((c) => c.siloId)).toEqual(["stocks", "cca"]);
    expect(plan.siloCount).toBe(4);
    expect(plan.findingCount).toBe(5);
  });

  it("gravité la plus haute, score de lecture et décompte par silo", () => {
    const cells = Object.fromEntries(plan.groups.flatMap((g) => g.cells).map((c) => [c.siloId, c]));
    expect(cells.provisions.worst).toBe("bloquant");
    expect(cells.provisions.score).toBe(96);
    expect(cells.provisions.count).toBe(2);
    expect(cells.stocks.worst).toBe("majeur");
    expect(cells.cca.worst).toBeNull();
    expect(cells.cca.score).toBe(0);
    expect(cells.cca.count).toBe(0);
  });

  it("dispose les colonnes comme les états et omet les colonnes vides", () => {
    expect(plan.boards.map((b) => b.key)).toEqual(["bilan", "resultat-annexes"]);
    expect(plan.boards[0].columns.map((c) => [c.title, c.siloCount, c.findingCount])).toEqual([
      ["Bilan — Actif", 2, 2],
      ["Bilan — Passif", 1, 2],
    ]);
    // Aucune cloison d'annexe ni de fiscalité : la colonne de droite du second plan disparaît.
    expect(plan.boards[1].columns.map((c) => c.title)).toEqual(["Compte de résultat"]);
  });

  it("chaque cloison de la taxonomie a une place, et une seule, dans le plan", () => {
    const placed = PLAN_LAYOUT.flatMap((b) => b.columns.flat());
    expect([...placed].sort()).toEqual(CLOISONS.map((c) => c.id).sort());
  });

  it("un signal EUR sans effet reste « non chiffré », jamais zéro ; une mesure hors euros ne dit rien", () => {
    const eur = finding("E-1", { mesure: { constate: 85_000, seuil: 0, unite: "EUR", libelle: "frais activés" } });
    const ratio = finding("R-1");
    expect(effectNote(siloEffects(NO_EXPOSURE, [eur]))).toEqual({ kind: "unquantified", signals: 1 });
    expect(effectNote(siloEffects(NO_EXPOSURE, [ratio]))).toEqual({ kind: "none" });
  });

  it("au-delà de deux postes, la ligne indique le reste sans l'additionner", () => {
    const item = (target: "resultat" | "bilan_actif" | "bilan_passif", direction: "increase" | "decrease", cents: number) => ({
      key: `${target}|${direction}`,
      target,
      direction,
      label: "",
      sign: direction === "increase" ? ("+" as const) : ("−" as const),
      initialCents: cents,
    });
    const note = effectNote({
      items: [item("resultat", "decrease", 14_500_000), item("bilan_actif", "decrease", 100_000), item("bilan_passif", "increase", 200_000)],
      indeterminate: 1,
      eurSignals: 0,
    });
    expect(note).toEqual({
      kind: "quantified",
      items: [
        { key: "resultat|decrease", text: "Résultat − 145 000 €", emphasis: true },
        { key: "bilan_actif|decrease", text: "actif − 1 000 €", emphasis: false },
      ],
      more: 1,
      indeterminate: true,
    });
  });
});

describe("plan des cloisons — dossier démo", () => {
  const snapshot = buildDemoDossierSnapshot();
  const exposure = projectSnapshotExposure(snapshot).exposure;
  const plan = buildCloisonsPlan(snapshot.dossier.silos, exposure);
  const cells = Object.fromEntries(plan.groups.flatMap((g) => g.cells).map((c) => [c.siloId, c]));

  it("28 silos, 42 constats rattachés ; l'admissibilité reste hors cloison", () => {
    expect(plan.siloCount).toBe(28);
    expect(plan.findingCount).toBe(42);
    expect(snapshot.dossier.admissibilite).toHaveLength(1);
    expect(plan.groups.map((g) => [g.cloisonId, g.cells.length, g.findingCount])).toEqual([
      ["bilan-actif", 11, 20],
      ["bilan-passif", 8, 11],
      ["resultat", 7, 8],
      ["annexe", 1, 1],
      ["tva-fiscalite", 1, 2],
    ]);
    expect(plan.boards[1].columns.map((c) => [c.title, c.siloCount, c.findingCount])).toEqual([
      ["Compte de résultat", 7, 8],
      ["Annexe · TVA & fiscalité", 2, 3],
    ]);
  });

  it("gravité la plus haute des silos vitrines", () => {
    expect(cells.provisions.worst).toBe("bloquant");
    expect(cells["immobilisations-incorporelles"].worst).toBe("majeur");
    expect(cells.stocks.worst).toBe("mineur");
    expect(cells["dettes-fiscales-sociales"].worst).toBe("informatif");
    expect(cells["rapprochement-clients"].count).toBe(5);
  });

  it("effets par silo : trois montants explicites, les autres non chiffrés ou muets", () => {
    expect(cells.provisions.note).toMatchObject({ kind: "quantified", items: [{ text: "Résultat − 145 000 €", emphasis: true }], more: 0 });
    expect(cells["chiffre-affaires"].note).toMatchObject({ kind: "quantified", items: [{ text: "Résultat − 312 000 €" }] });
    expect(cells.cca.note).toMatchObject({ kind: "quantified", items: [{ text: "Résultat + 18 000 €", emphasis: false }] });
    expect(cells["immobilisations-incorporelles"].note.kind).toBe("unquantified");
    // Taux d'amortissement (mesure en %) : aucun effet monétaire n'est affiché, ni zéro ni « non chiffré ».
    expect(cells["immobilisations-corporelles"].note.kind).toBe("none");
  });

  it("mesure d'en-tête : poste et sens séparés, silos porteurs, 31 signaux EUR", () => {
    const all = snapshot.dossier.silos.flatMap((s) => s.findings);
    const m = exposureMeasure(plan, siloEffects(exposure, all));
    const byText = Object.fromEntries(m.lines.map((l) => [l.text, l]));
    expect(Object.keys(byText).sort()).toEqual(["Résultat + 18 000 €", "Résultat − 457 000 €"]);
    expect(byText["Résultat − 457 000 €"].amount).toBe("− 457 000 €");
    expect(byText["Résultat − 457 000 €"].contributors.map((c) => [c.siloId, c.amount])).toEqual([
      ["provisions", "− 145 000 €"],
      ["chiffre-affaires", "− 312 000 €"],
    ]);
    expect(byText["Résultat + 18 000 €"].contributors.map((c) => c.siloId)).toEqual(["cca"]);
    expect(m.indeterminate).toBe(0);
    expect(m.eurSignals).toBe(31);
    expect(severityCounts(all)).toEqual({ bloquant: 1, majeur: 19, mineur: 20, informatif: 2 });
  });
});

describe("formats de la revue", () => {
  it("lignes d'état : négatif entre parenthèses, zéro en tiret", () => {
    expect(eurRow(-55_000)).toBe("(55 000 €)");
    expect(eurRow(0)).toBe("—");
    expect(eurRow(120_000)).toBe("120 000 €");
    expect(compactEur(2_500_000)).toBe("2,50 M€");
  });

  it("mesures en points de pourcentage : 40 % reste 40 %, jamais 4 000 %", () => {
    const f = { mesure: { constate: 40, seuil: 20, unite: "%" as const, libelle: "taux" } };
    expect(formatMesure(f)).toBe("40,0 %");
    expect(formatSeuil(f)).toBe("20,0 %");
    expect(formatEcart(f)).toBe("+20,0 pp");
  });

  it("écart en euros signé, sens typographique", () => {
    expect(formatEcart({ mesure: { constate: 0, seuil: 145_000, unite: "EUR", libelle: "provision" } })).toBe("−145 000 €");
    expect(formatEcart({ mesure: { constate: 85_000, seuil: 0, unite: "EUR", libelle: "frais" } })).toBe("+85 000 €");
  });

  it("gravité la plus haute et score de lecture", () => {
    expect(worstSeverity([])).toBeNull();
    expect(worstSeverity([{ severity: "mineur" }, { severity: "majeur" }])).toBe("majeur");
    expect(exposureScore("bloquant")).toBe(96);
    expect(exposureScore(null)).toBe(0);
  });
});
