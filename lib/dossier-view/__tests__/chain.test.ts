/**
 * Vue « Dossier & preuve ». Les attendus sont posés à la main d'après le dossier de démonstration (43 constats sourcés :
 * 2 bloquants, 19 majeurs, 20 mineurs, 2 informatifs ; 42 chaînes ouvertes par « Source » et une par « Échantillon » ;
 * 31 transformations ; 43 règles ; 42 résultats ; 13 constats citant des lignes du FEC ; aucune décision consignée),
 * jamais recalculés avec le code testé.
 */

import { describe, expect, it } from "vitest";
import type { DossierSnapshot } from "@/lib/canonical-model";
import type { Finding } from "@/lib/canonical-model/finding";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { appendReviewDecisionToSnapshot } from "@/lib/dossier/snapshot-state";
import {
  CHAIN_LENGTH,
  EMPTY_FILTER,
  absentSummary,
  buildCompleteness,
  buildDossierEntries,
  buildEntry,
  chainSummary,
  decisionSentence,
  filterEntries,
  isFiltered,
  rowCount,
  rowReading,
  stepCategory,
} from "../chain";

const demo = buildDemoDossierSnapshot();
const { entries, journalValid } = buildDossierEntries(demo);
const matrix = buildCompleteness(entries);
const byId = (id: string) => entries.find((e) => e.id === id)!;
const rowOf = (key: string, m = matrix) => m.rows.find((r) => r.key === key)!;

describe("rattachement des libellés d'étape", () => {
  it.each([
    ["Source", "source"],
    ["Échantillon", "source"],
    ["ÉCHANTILLON ", "source"],
    ["En-tête lu", "source"],
    ["Lecture nom fichier", "source"],
    ["Transformation", "transformation"],
    ["Calcul", "transformation"],
    ["Règle", "rule"],
    ["Règle appliquée", "rule"],
    ["Résultat", "result"],
    ["Résultat de feuille", "result"],
  ])("« %s » → %s", (label, category) => {
    expect(stepCategory(label)).toBe(category);
  });

  it.each(["Contrôle", "Analyse", "Parsing", "Total CA", "", "2"])("« %s » reste une autre étape, jamais rattachée par défaut", (label) => {
    expect(stepCategory(label)).toBe("other");
  });
});

describe("entrées du dossier de démonstration", () => {
  it("liste les 43 constats sourcés, gravité décroissante puis ordre du snapshot", () => {
    expect(journalValid).toBe(true);
    expect(entries).toHaveLength(43);
    expect(entries.slice(0, 2).map((e) => e.id)).toEqual(["DEMO-ADM-1", "DEMO-PROV-1"]);
    expect(entries[2].id).toBe("DEMO-INCORP-1");
    expect(entries.at(-1)!.severity).toBe("informatif");
  });

  it("DEMO-ADM-1 : échantillon et règle, sans transformation ni résultat, décision en attente", () => {
    const e = byId("DEMO-ADM-1");
    expect(e.links).toEqual({ source: true, transformation: false, rule: true, result: false });
    expect(e.absent).toEqual(["transformation", "result"]);
    expect(e.present).toBe(2);
    expect(e.decision).toBe("pending");
    expect(e.nodes.map((n) => [n.label, n.marker, n.detail])).toEqual([
      ["Échantillon", "source", "L517: \"31/12/2024\", L904: \"15/06/2024\""],
      ["Règle", "step", "LPF A.47 A-1 — dates AAAAMMJJ"],
      ["Résultat", "missing", "absent"],
      ["Décision", "missing", "en attente"],
    ]);
    expect(chainSummary(e)).toBe("chaîne 2/5 · décision en attente");
    expect(absentSummary(e)).toBe("absentes : transformation, résultat");
    expect(e.fecLines).toEqual([517, 904, 1330]);
  });

  it("DEMO-INCORP-1 : une transformation absente n'interrompt pas la ligne de preuve", () => {
    const e = byId("DEMO-INCORP-1");
    expect(e.present).toBe(3);
    expect(e.nodes.map((n) => n.label)).toEqual(["Source", "Règle", "Résultat", "Décision"]);
    expect(e.nodes.map((n) => n.marker)).toEqual(["source", "step", "result", "missing"]);
    expect(absentSummary(e)).toBe("absente : transformation");
  });

  it("DEMO-PROV-1 : quatre étapes présentes sur cinq, la décision manque", () => {
    const e = byId("DEMO-PROV-1");
    expect(e.present).toBe(4);
    expect(CHAIN_LENGTH).toBe(5);
    expect(absentSummary(e)).toBe("");
    expect(e.nodes.map((n) => n.marker)).toEqual(["source", "step", "step", "result", "missing"]);
  });
});

describe("matrice de complétude", () => {
  it("une colonne par constat, groupée par gravité", () => {
    expect(matrix.total).toBe(43);
    expect(matrix.columns).toHaveLength(43);
    expect(matrix.groups).toEqual([
      { severity: "bloquant", count: 2 },
      { severity: "majeur", count: 19 },
      { severity: "mineur", count: 20 },
      { severity: "informatif", count: 2 },
    ]);
  });

  it("compte chaque étape présente : 43, 31, 43, 42 ; décision 0 ; lignes FEC 13", () => {
    expect(matrix.rows.map((r) => [r.label, r.present])).toEqual([
      ["Source", 43],
      ["Transformation", 31],
      ["Règle", 43],
      ["Résultat", 42],
      ["Décision", 0],
      ["Lignes FEC citées", 13],
    ]);
    expect(rowCount(rowOf("transformation"), matrix)).toBe("31/43");
    expect(rowCount(rowOf("decision"), matrix)).toBe("0/43 · tous en attente");
    expect(matrix.otherLabels).toEqual([]);
  });

  it("chaque case correspond à la colonne de son constat", () => {
    const col = matrix.columns.findIndex((c) => c.id === "DEMO-ADM-1");
    expect(rowOf("result").cells[col]).toBe(false);
    expect(rowOf("fecLines").cells[col]).toBe(true);
  });

  it("la lecture accessible nomme la liste la plus courte", () => {
    expect(rowReading(rowOf("source"))).toBe("présente pour tous les constats");
    expect(rowReading(rowOf("result"))).toBe("absente pour DEMO-ADM-1");
    expect(rowReading(rowOf("decision"))).toBe("absente pour tous les constats");
    expect(rowReading(rowOf("fecLines")).startsWith("présente pour ")).toBe(true);
    expect(rowReading(rowOf("fecLines")).split(", ")).toHaveLength(13);
  });

  it("dit la décision sans la présumer", () => {
    expect(decisionSentence(matrix)).toBe("La décision, elle, manque partout : aucun constat n'a encore été arbitré.");
  });
});

describe("décision lue dans le journal de revue", () => {
  const reviewed = appendReviewDecisionToSnapshot(demo, {
    id: "evt-dossier-1",
    findingId: "DEMO-INCORP-1",
    actorId: "demo-reviewer",
    actorRole: "reviewer",
    newStatus: "confirmed",
    comment: "",
    relatedEvidenceIds: [],
    createdAt: "2026-10-30T08:00:00.000Z",
  });
  const after = buildDossierEntries(reviewed);
  const m = buildCompleteness(after.entries);

  it("un constat validé porte sa décision : 4/5 et un losange", () => {
    const e = after.entries.find((x) => x.id === "DEMO-INCORP-1")!;
    expect(e.decided).toBe(true);
    expect(e.present).toBe(4);
    expect(chainSummary(e)).toBe("chaîne 4/5 · constat validé");
    expect(e.nodes.at(-1)).toMatchObject({ label: "Décision", marker: "decision", detail: "validé par l’auditeur" });
    expect(rowCount(rowOf("decision", m), m)).toBe("1/43");
    expect(decisionSentence(m)).toBe("1 constat arbitré sur 43 ; les autres restent en attente.");
    expect(filterEntries(after.entries, { ...EMPTY_FILTER, chain: "decision_pending" })).toHaveLength(42);
  });

  it("un journal qui ne se vérifie pas rend la décision indéterminée, jamais « en attente »", () => {
    const tampered: DossierSnapshot = { ...reviewed, reviewEvents: reviewed.reviewEvents.map((ev) => ({ ...ev, eventHash: "0".repeat(64) })) };
    const broken = buildDossierEntries(tampered);
    expect(broken.journalValid).toBe(false);
    expect(broken.entries.every((e) => e.decision === "unknown" && !e.decided)).toBe(true);
    const bm = buildCompleteness(broken.entries);
    expect(bm.undetermined).toBe(43);
    expect(rowCount(rowOf("decision", bm), bm)).toBe("0/43 · indéterminée");
    expect(decisionSentence(bm)).toContain("indéterminée");
    expect(chainSummary(broken.entries[0])).toBe("chaîne 2/5 · décision indéterminée");
    expect(filterEntries(broken.entries, { ...EMPTY_FILTER, chain: "decision_pending" })).toHaveLength(0);
  });
});

describe("étapes non rattachées", () => {
  const base = demo.findings.find((f) => f.id === "DEMO-INCORP-1")!;
  const controle: Finding = { ...base, id: "X-CTRL-1", preuve: [{ etape: "Contrôle", detail: "Grand livre 1511 = 0" }, { etape: "Règle", detail: "PCG art. 322-1" }] };
  const e = buildEntry(controle, "pending");

  it("restent visibles dans la ligne et dans la matrice, sans combler la source", () => {
    expect(e.otherSteps).toEqual(["Contrôle"]);
    expect(e.links.source).toBe(false);
    expect(e.nodes.map((n) => [n.label, n.marker])).toEqual([
      ["Source", "missing"],
      ["Contrôle", "step"],
      ["Règle", "step"],
      ["Résultat", "missing"],
      ["Décision", "missing"],
    ]);
    const m = buildCompleteness([e]);
    expect(m.otherLabels).toEqual(["Contrôle"]);
    expect(m.rows.at(-1)).toMatchObject({ key: "other", label: "Autre étape", present: 1, total: 1 });
    expect(rowCount(m.rows.find((r) => r.key === "decision")!, m)).toBe("0/1 · en attente");
  });

  it("une règle absente est dessinée avant le premier résultat", () => {
    const noRule = buildEntry({ ...base, preuve: [{ etape: "Source", detail: "a" }, { etape: "Résultat", detail: "b" }] }, "pending");
    expect(noRule.nodes.map((n) => n.label)).toEqual(["Source", "Règle", "Résultat", "Décision"]);
    expect(noRule.nodes[1].marker).toBe("missing");
  });
});

describe("filtres", () => {
  const ids = (f: Partial<typeof EMPTY_FILTER>) => filterEntries(entries, { ...EMPTY_FILTER, ...f }).map((e) => e.id);

  it("sans filtre, les 43 constats", () => {
    expect(ids({})).toHaveLength(43);
    expect(isFiltered(EMPTY_FILTER)).toBe(false);
    expect(isFiltered({ ...EMPTY_FILTER, query: "  " })).toBe(false);
    expect(isFiltered({ ...EMPTY_FILTER, chain: "no_result" })).toBe(true);
  });

  it("gravité et famille", () => {
    expect(ids({ severity: "bloquant" })).toEqual(["DEMO-ADM-1", "DEMO-PROV-1"]);
    expect(ids({ family: "internal" })).toHaveLength(4);
    expect(ids({ family: "hardLaw" })).toHaveLength(11);
    expect(ids({ family: "methodology" })).toHaveLength(28);
  });

  it("chaîne : sans résultat, sans transformation, sans ligne FEC, décision en attente", () => {
    expect(ids({ chain: "no_result" })).toEqual(["DEMO-ADM-1"]);
    expect(ids({ chain: "no_transformation" })).toHaveLength(12);
    expect(ids({ chain: "no_fec_lines" })).toHaveLength(30);
    expect(ids({ chain: "decision_pending" })).toHaveLength(43);
  });

  it("recherche sur l'intitulé, le compte et la référence, sans accents ni casse", () => {
    expect(ids({ query: "ecritures avec date" })).toEqual(["DEMO-ADM-1"]);
    expect(ids({ query: "bernard" })).toContain("RAPPRO-creances-clients-1");
    expect(ids({ query: "6811" })).toContain("DEMO-INCORP-1");
    expect(ids({ query: "lpf" })).toContain("DEMO-ADM-1");
    expect(ids({ query: "demo-prov-1" })).toEqual(["DEMO-PROV-1"]);
    expect(ids({ query: "aucun constat ne porte ce texte" })).toEqual([]);
  });

  it("les filtres se cumulent", () => {
    expect(ids({ severity: "majeur", chain: "no_fec_lines", family: "methodology" }).every((id) => {
      const e = byId(id);
      return e.severity === "majeur" && e.family === "methodology" && e.fecLines.length === 0;
    })).toBe(true);
  });
});
