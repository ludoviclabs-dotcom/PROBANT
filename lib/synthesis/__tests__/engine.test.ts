/**
 * Tests du moteur de Synthèse — les douze scénarios imposés par le lot.
 *
 * Chaque scénario correspond à une situation d'audit réelle ; les assertions
 * portent sur le SynthesisSnapshot complet (dimensions, trace, limitations,
 * hash), pas sur des détails d'implémentation.
 */

import { describe, expect, it } from "vitest";
import { buildSynthesisSnapshot } from "@/lib/synthesis/engine";
import { generateSynthesisNote } from "@/lib/synthesis/note";
import { CLOCK, makeDossierSnapshot, makeEffect, makeFinding } from "./fixtures";

const build = (input = makeDossierSnapshot()) =>
  buildSynthesisSnapshot(input, { clock: CLOCK });

/* ── 1. Dossier propre ─────────────────────────────────────────────────────── */
describe("dossier propre", () => {
  it("produit un snapshot vide cohérent, sans exposition présumée", () => {
    const s = build();
    expect(s.admissibility.status).toBe("admissible");
    expect(s.coverage.status).toBe("substantial");
    expect(s.risk.totalFindings).toBe(0);
    expect(s.exposure.grossDetectedExposureCents).toBe(0);
    expect(s.exposure.deduplicatedExposureCents).toBe(0);
    expect(s.review.pct).toBe(0);
    expect(s.verdict.status).toBe("reviewed"); // rien à revoir = revue close
    expect(s.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("trace chaque KPI avec formule, unité et arrondi", () => {
    const s = build();
    const ids = s.calculationTrace.map((t) => t.metricId);
    expect(ids).toContain("admissibility.status");
    expect(ids).toContain("coverage.status");
    expect(ids).toContain("risk.heuristicSeverityIndex");
    expect(ids).toContain("exposure.deduplicatedExposureCents");
    expect(ids).toContain("review.pct");
    expect(ids).toContain("verdict.status");
    for (const t of s.calculationTrace) {
      expect(t.formulaId).toBeTruthy();
      expect(t.formulaVersion).toBeTruthy();
      expect(t.unit).toBeTruthy();
      expect(t.rounding).toBeTruthy();
      expect(t.explanation).toBeTruthy();
    }
  });
});

/* ── 2. FEC rejeté ─────────────────────────────────────────────────────────── */
describe("FEC rejeté", () => {
  it("verdict rejected — plus jamais « exploitable » sur un dossier non admissible", () => {
    const blocking = makeFinding("adm-1", {
      family: "hardLaw",
      severity: "bloquant",
    });
    const s = build(
      makeDossierSnapshot({
        admissibilityFindings: [blocking],
        findings: [blocking],
      }),
    );
    expect(s.admissibility.status).toBe("rejected");
    expect(s.verdict.status).toBe("rejected");
    expect(s.verdict.detail).not.toMatch(/exploitable/i);

    const note = generateSynthesisNote(s, {
      raisonSociale: "TEST SA",
      siren: "123456789",
      exercice: "2024",
      dateCloture: "20241231",
    });
    expect(note).toContain("non admissible");
  });
});

/* ── 3. Couverture partielle ───────────────────────────────────────────────── */
describe("couverture partielle", () => {
  it("émet partial_coverage et interdit le verdict sans réserve", () => {
    const s = build(
      makeDossierSnapshot({
        calculationContext: {
          entriesTotal: 100,
          entriesAnalysed: 40,
          controlsEligible: 10,
          controlsExecuted: 10,
          controlsConcluded: 10,
          controlsNotConcluded: 0,
          notes: [],
        },
      }),
    );
    expect(s.coverage.status).toBe("partial");
    expect(s.limitations.some((l) => l.code === "partial_coverage")).toBe(true);
    expect(s.verdict.headline).toMatch(/couverture partielle/i);
  });

  it("couverture nulle ⇒ insufficient_coverage, aucun verdict d'exploitabilité", () => {
    const s = build(
      makeDossierSnapshot({
        calculationContext: {
          entriesTotal: 100,
          entriesAnalysed: 0,
          controlsEligible: 10,
          controlsExecuted: 0,
          controlsConcluded: 0,
          controlsNotConcluded: 0,
          notes: [],
        },
      }),
    );
    expect(s.coverage.status).toBe("none");
    expect(s.verdict.status).toBe("insufficient_coverage");
  });
});

/* ── 4. Doublons exacts ────────────────────────────────────────────────────── */
describe("doublons exacts", () => {
  it("un même effet détecté par deux règles ne compte qu'une fois", () => {
    const effect = makeEffect({ amountCents: 250_000 });
    const s = build(
      makeDossierSnapshot({
        findings: [
          makeFinding("f-1", { financialEffect: effect, lignesSource: [42] }),
          makeFinding("f-2", { financialEffect: effect, lignesSource: [42], ruleId: "R-TEST-002" }),
        ],
      }),
    );
    expect(s.exposure.grossDetectedExposureCents).toBe(500_000);
    expect(s.exposure.deduplicatedExposureCents).toBe(250_000);
    // Le doublon écarté est tracé, jamais supprimé en silence.
    const traceExposure = s.calculationTrace.find(
      (t) => t.metricId === "exposure.deduplicatedExposureCents",
    );
    expect(traceExposure?.excludedItems.some((e) => e.id === "f-2")).toBe(true);
  });
});

/* ── 5. Constats qui se chevauchent ────────────────────────────────────────── */
describe("chevauchement", () => {
  it("deux effets partageant des écritures forment un cluster : max retenu", () => {
    const s = build(
      makeDossierSnapshot({
        findings: [
          makeFinding("f-1", {
            financialEffect: makeEffect({ amountCents: 100_000, rootCause: "cutoff" }),
            lignesSource: [10, 11],
          }),
          makeFinding("f-2", {
            financialEffect: makeEffect({ amountCents: 180_000, rootCause: "cutoff" }),
            lignesSource: [11, 12],
            ruleId: "R-TEST-002",
          }),
        ],
      }),
    );
    // Clés différentes (écritures différentes) mais chevauchement sur 11.
    expect(s.exposure.clusters).toHaveLength(1);
    expect(s.exposure.clusters[0].ambiguous).toBe(false);
    expect(s.exposure.grossDetectedExposureCents).toBe(280_000);
    expect(s.exposure.deduplicatedExposureCents).toBe(180_000);
  });
});

/* ── 6. Même compte, effets indépendants ───────────────────────────────────── */
describe("même compte, effets indépendants", () => {
  it("deux effets sans écriture commune s'additionnent", () => {
    const s = build(
      makeDossierSnapshot({
        findings: [
          makeFinding("f-1", {
            financialEffect: makeEffect({ amountCents: 100_000 }),
            lignesSource: [10],
          }),
          makeFinding("f-2", {
            financialEffect: makeEffect({ amountCents: 70_000 }),
            lignesSource: [20],
            ruleId: "R-TEST-002",
          }),
        ],
      }),
    );
    expect(s.exposure.clusters).toHaveLength(2);
    expect(s.exposure.deduplicatedExposureCents).toBe(170_000);
  });
});

/* ── 7. Sens opposés ───────────────────────────────────────────────────────── */
describe("sens opposés", () => {
  it("jamais de compensation silencieuse : cluster ambigu + review_required", () => {
    const s = build(
      makeDossierSnapshot({
        findings: [
          makeFinding("f-1", {
            financialEffect: makeEffect({ amountCents: 100_000, direction: "increase" }),
            lignesSource: [10],
          }),
          makeFinding("f-2", {
            financialEffect: makeEffect({ amountCents: 90_000, direction: "decrease" }),
            lignesSource: [10],
            ruleId: "R-TEST-002",
          }),
        ],
      }),
    );
    expect(s.exposure.clusters).toHaveLength(1);
    expect(s.exposure.clusters[0].ambiguous).toBe(true);
    // Contribution conservatrice (max), pas la somme nette (10 000).
    expect(s.exposure.deduplicatedExposureCents).toBe(100_000);
    expect(
      s.limitations.some(
        (l) =>
          l.code === "source_review_required" &&
          l.subjects.includes("f-1") &&
          l.subjects.includes("f-2"),
      ),
    ).toBe(true);
  });
});

/* ── 8. Effet financier absent ─────────────────────────────────────────────── */
describe("constat sans effet financier explicite", () => {
  it("est exclu de l'exposition — la présomption |constaté−seuil| a disparu", () => {
    const s = build(
      makeDossierSnapshot({
        findings: [
          // Mesure EUR avec gros écart, mais AUCUN financialEffect.
          makeFinding("f-1", {
            mesure: { constate: 1_000_000, seuil: 0, unite: "EUR", libelle: "écart" },
          }),
        ],
      }),
    );
    expect(s.exposure.grossDetectedExposureCents).toBe(0);
    expect(s.exposure.findingsWithoutEffect).toEqual(["f-1"]);
    const trace = s.calculationTrace.find(
      (t) => t.metricId === "exposure.deduplicatedExposureCents",
    );
    expect(trace?.excludedItems).toEqual([
      expect.objectContaining({ id: "f-1", reason: expect.stringMatching(/financialEffect/) }),
    ]);
  });

  it("chaîne de preuve vide ⇒ signalé dans evidence", () => {
    const s = build(
      makeDossierSnapshot({
        findings: [makeFinding("f-1", { preuve: [] })],
      }),
    );
    expect(s.evidence.findingsWithoutEvidenceChain).toEqual(["f-1"]);
  });
});

/* ── 9-10. Revue partielle / totale ────────────────────────────────────────── */
describe("progression de revue", () => {
  const findings = [
    makeFinding("f-1", {
      statutRevue: "valide",
      financialEffect: makeEffect({ amountCents: 100_000, taxRatePct: 25 }),
      lignesSource: [1],
    }),
    makeFinding("f-2", {
      statutRevue: "en_attente",
      financialEffect: makeEffect({ amountCents: 50_000 }),
      lignesSource: [2],
    }),
  ];

  it("partiellement revu : pct, exposition revue et ajustement validé cohérents", () => {
    const s = build(makeDossierSnapshot({ findings }));
    expect(s.review.pct).toBe(50);
    expect(s.verdict.status).toBe("under_review");
    // Seul le cluster f-1 est clos.
    expect(s.exposure.reviewedExposureCents).toBe(100_000);
    expect(s.exposure.validatedAdjustmentCents).toBe(100_000);
    expect(s.exposure.taxEffectCents).toBe(25_000);
    expect(s.exposure.netFinancialStatementEffectCents).toBe(75_000);
  });

  it("entièrement revu : verdict reviewed, expositions alignées", () => {
    const s = build(
      makeDossierSnapshot({
        findings: [
          findings[0],
          makeFinding("f-2", {
            statutRevue: "ecarte",
            financialEffect: makeEffect({ amountCents: 50_000 }),
            lignesSource: [2],
          }),
        ],
      }),
    );
    expect(s.review.pct).toBe(100);
    expect(s.verdict.status).toBe("reviewed");
    expect(s.exposure.reviewedExposureCents).toBe(150_000);
    // Écarté ≠ validé : seul f-1 contribue à l'ajustement.
    expect(s.exposure.validatedAdjustmentCents).toBe(100_000);
  });

  it("les événements de revue priment sur le statut porté par le constat", () => {
    const s = build(
      makeDossierSnapshot({
        findings,
        reviewEvents: [
          {
            id: "ev-1",
            dossierId: "dossier-test",
            findingId: "f-2",
            previousStatus: "en_attente",
            newStatus: "valide",
            actorLabel: "Réviseur",
            actorRole: "reviewer",
            createdAt: "2026-08-14T10:00:00.000Z",
            relatedEvidenceIds: [],
          },
        ],
      }),
    );
    expect(s.review.pct).toBe(100);
    expect(s.exposure.validatedAdjustmentCents).toBe(150_000);
  });
});

/* ── 11. Déterminisme par permutation ──────────────────────────────────────── */
describe("déterminisme", () => {
  const findings = [
    makeFinding("f-1", { financialEffect: makeEffect({ amountCents: 100_000 }), lignesSource: [1] }),
    makeFinding("f-2", { financialEffect: makeEffect({ amountCents: 70_000 }), lignesSource: [2] }),
    makeFinding("f-3", { severity: "bloquant" }),
  ];

  it("mêmes données dans un ordre différent ⇒ même snapshotHash", () => {
    const a = build(makeDossierSnapshot({ findings: [...findings] }));
    const b = build(makeDossierSnapshot({ findings: [...findings].reverse() }));
    expect(a.snapshotHash).toBe(b.snapshotHash);
    expect(a.exposure).toEqual(b.exposure);
    expect(a.calculationTrace).toEqual(b.calculationTrace);
  });

  it("le hash couvre le contenu, pas l'horodatage", () => {
    const input = makeDossierSnapshot({ findings });
    const a = buildSynthesisSnapshot(input, { clock: () => "2026-01-01T00:00:00.000Z" });
    const b = buildSynthesisSnapshot(input, { clock: () => "2026-12-31T23:59:59.000Z" });
    expect(a.snapshotHash).toBe(b.snapshotHash);
    expect(a.generatedAt).not.toBe(b.generatedAt);
  });

  it("une donnée modifiée ⇒ hash différent", () => {
    const a = build(makeDossierSnapshot({ findings }));
    const b = build(
      makeDossierSnapshot({
        findings: [
          { ...findings[0], financialEffect: makeEffect({ amountCents: 100_001 }) },
          findings[1],
          findings[2],
        ],
      }),
    );
    expect(a.snapshotHash).not.toBe(b.snapshotHash);
  });

  it("la note de synthèse est elle-même déterministe", () => {
    const societe = {
      raisonSociale: "TEST SA",
      siren: "123456789",
      exercice: "2024",
      dateCloture: "20241231",
    };
    const s1 = build(makeDossierSnapshot({ findings: [...findings] }));
    const s2 = build(makeDossierSnapshot({ findings: [...findings].reverse() }));
    expect(generateSynthesisNote(s1, societe)).toBe(generateSynthesisNote(s2, societe));
  });
});

/* ── 12. Politiques aux bornes ─────────────────────────────────────────────── */
describe("bornes de politiques", () => {
  const ctxWithRatio = (analysed: number) => ({
    entriesTotal: 100,
    entriesAnalysed: analysed,
    controlsEligible: 10,
    controlsExecuted: 10,
    controlsConcluded: 10,
    controlsNotConcluded: 0,
    notes: [],
  });

  it("ratio exactement au seuil 0.95 ⇒ substantial (borne incluse)", () => {
    const s = build(makeDossierSnapshot({ calculationContext: ctxWithRatio(95) }));
    expect(s.coverage.status).toBe("substantial");
  });

  it("ratio juste sous le seuil ⇒ partial", () => {
    const s = build(makeDossierSnapshot({ calculationContext: ctxWithRatio(94) }));
    expect(s.coverage.status).toBe("partial");
  });

  it("égalité de montants dans un cluster : départage stable par clé", () => {
    const mk = (id: string, lignes: number[], rootCause: string) =>
      makeFinding(id, {
        financialEffect: makeEffect({ amountCents: 100_000, rootCause }),
        lignesSource: lignes,
      });
    // Même montant, chevauchement sur l'écriture 5, causes distinctes ⇒
    // ambigu, et le retenu est déterminé par la clé la plus petite — pas par
    // l'ordre d'arrivée.
    const a = build(makeDossierSnapshot({ findings: [mk("f-1", [5], "aaa"), mk("f-2", [5], "bbb")] }));
    const b = build(makeDossierSnapshot({ findings: [mk("f-2", [5], "bbb"), mk("f-1", [5], "aaa")] }));
    expect(a.exposure.deduplicatedExposureCents).toBe(100_000);
    expect(a.snapshotHash).toBe(b.snapshotHash);
    expect(a.exposure.clusters[0].ambiguous).toBe(true);
  });

  it("limitations : contrôles non exécutés et non conclusifs générés", () => {
    const s = build(
      makeDossierSnapshot({
        calculationContext: {
          entriesTotal: 100,
          entriesAnalysed: 100,
          controlsEligible: 10,
          controlsExecuted: 8,
          controlsConcluded: 6,
          controlsNotConcluded: 2,
          notes: [],
        },
      }),
    );
    const codes = s.limitations.map((l) => l.code);
    expect(codes).toContain("control_not_run");
    expect(codes).toContain("control_inconclusive");
  });

  it("document attendu manquant et document tronqué génèrent leurs limitations", () => {
    const s = build(
      makeDossierSnapshot({
        calculationContext: {
          entriesTotal: 100,
          entriesAnalysed: 100,
          controlsEligible: 10,
          controlsExecuted: 10,
          controlsConcluded: 10,
          controlsNotConcluded: 0,
          expectedDocumentTypes: ["fec", "balance"],
          notes: [],
        },
        sourceDocuments: [
          {
            id: "doc-1",
            dossierId: "dossier-test",
            fileName: "123456789FEC20241231.txt",
            documentType: "fec",
            fingerprint: "fec-fingerprint-test",
            truncated: true,
            createdAt: "2026-08-14T00:00:00.000Z",
          },
        ],
      }),
    );
    const codes = s.limitations.map((l) => l.code);
    expect(codes).toContain("missing_document");
    expect(codes).toContain("parser_warning");
  });

  it("constats internes ⇒ limitation internal_threshold", () => {
    const s = build(
      makeDossierSnapshot({
        findings: [makeFinding("f-1", { family: "internal" })],
      }),
    );
    expect(s.limitations.some((l) => l.code === "internal_threshold")).toBe(true);
  });
});

/* ── risk.openBlockingCount — distinct de bySeverity.bloquant ────────────── */
describe("openBlockingCount — bloquants dont la revue n'est pas close", () => {
  it("compte tous les bloquants tant qu'aucun n'est arbitré", () => {
    const s = build(
      makeDossierSnapshot({
        findings: [
          makeFinding("f-1", { severity: "bloquant" }),
          makeFinding("f-2", { severity: "bloquant" }),
        ],
      }),
    );
    expect(s.risk.bySeverity.bloquant).toBe(2);
    expect(s.risk.openBlockingCount).toBe(2);
  });

  it("un bloquant validé n'est plus un blocage ouvert, mais reste compté en gravité", () => {
    const s = build(
      makeDossierSnapshot({
        findings: [
          makeFinding("f-1", { severity: "bloquant", statutRevue: "valide" }),
          makeFinding("f-2", { severity: "bloquant" }),
        ],
      }),
    );
    expect(s.risk.bySeverity.bloquant).toBe(2);
    expect(s.risk.openBlockingCount).toBe(1);
  });

  it("un bloquant écarté sort du décompte de blocages ouverts", () => {
    const s = build(
      makeDossierSnapshot({
        findings: [makeFinding("f-1", { severity: "bloquant", statutRevue: "ecarte" })],
      }),
    );
    expect(s.risk.openBlockingCount).toBe(0);
  });

  it("un événement de revue postérieur au statut du constat prime", () => {
    const f = makeFinding("f-1", { severity: "bloquant", statutRevue: "en_attente" });
    const s = build(
      makeDossierSnapshot({
        findings: [f],
        reviewEvents: [
          {
            id: "ev-1",
            dossierId: "dossier-test",
            findingId: "f-1",
            previousStatus: "en_attente",
            newStatus: "valide",
            actorLabel: "Réviseur",
            actorRole: "reviewer",
            createdAt: "2026-08-14T10:00:00.000Z",
            relatedEvidenceIds: [],
          },
        ],
      }),
    );
    expect(s.risk.openBlockingCount).toBe(0);
  });

  it("trace risk.openBlockingCount avec l'exclusion motivée du bloquant clos", () => {
    const s = build(
      makeDossierSnapshot({
        findings: [makeFinding("f-1", { severity: "bloquant", statutRevue: "valide" })],
      }),
    );
    const t = s.calculationTrace.find((x) => x.metricId === "risk.openBlockingCount");
    expect(t?.output).toBe(0);
    expect(t?.excludedItems).toEqual([
      expect.objectContaining({ id: "f-1", reason: expect.stringMatching(/revue close/) }),
    ]);
  });
});
