/**
 * Tests de la couche de vue de la Synthèse. Règle centrale, comme pour les datasets : aucune divergence entre ce
 * que la vue affiche et ce que le snapshot porte. Les attendus sont posés à la main d'après le dossier de
 * démonstration (43 constats, 2 bloquants, 19 majeurs, 20 mineurs, 2 informatifs ; admissibilité rejetée par
 * DEMO-ADM-1 ; trois effets explicites en attente d'arbitrage), jamais recalculés avec le code testé.
 */

import { describe, expect, it } from "vitest";
import { CLOISONS } from "@/lib/canonical-model/taxonomy";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { appendReviewDecisionToSnapshot } from "@/lib/dossier/snapshot-state";
import { projectCycleRows, sortCycleRows } from "@/lib/dossier/cycle-registry";
import { buildSynthesisSnapshot } from "@/lib/synthesis/engine";
import { buildSynthesisDatasets } from "@/lib/visualization/build-datasets";
import type { DossierSnapshot } from "@/lib/canonical-model";
import { buildBridgeGroups, buildEffectRows, bridgeTitle, compactEuros, niceTicks } from "../bridge";
import { buildBarcode } from "../barcode";
import { buildChain, formatLines } from "../chain";
import { buildConcentration } from "../concentration";
import { buildFrieze, buildMultiples, buildStrata, spreadPositions } from "../exploration";
import { applyJournal, buildJournalRows } from "../journal";
import { buildLimits } from "../limits";
import { buildAdmissibilityMeasure, buildCoverageMeasure, buildReviewMeasure, buildSignalView } from "../measures";
import { buildMosaic, cellKey } from "../mosaic";
import { reviewStageByFinding, tallyReview } from "../review";
import { bandKey, layoutSankey, sankeyTitle } from "../sankey";
import { buildVerdictView } from "../verdict";

const CLOCK = () => "2026-10-16T00:00:00.000Z";
/** Espaces fines (U+202F) et insécables (U+00A0) comparées comme des espaces : la sortie dépend de la version d'ICU. */
const plain = (text: string) => text.replace(/[  ]/g, " ");

function view(snapshot: DossierSnapshot) {
  const synthesis = buildSynthesisSnapshot(snapshot, { clock: CLOCK });
  const datasets = buildSynthesisDatasets({ synthesis, societe: snapshot.dossier.societe, findings: snapshot.findings, admissibilityFindings: snapshot.admissibilityFindings, dossier: snapshot });
  const stages = reviewStageByFinding(snapshot);
  const present = new Set(Object.keys(synthesis.risk.matrix));
  const clos = CLOISONS.filter((c) => present.has(c.id)).map((c) => ({ id: c.id, label: c.label, short: c.short }));
  const cycleRows = sortCycleRows(projectCycleRows(snapshot));
  return { snapshot, synthesis, datasets, stages, clos, cycleRows };
}

const demo = view(buildDemoDossierSnapshot());

describe("verdict éditorial", () => {
  const v = buildVerdictView({ synthesis: demo.synthesis, findings: demo.snapshot.findings, admissibilityFindings: demo.snapshot.admissibilityFindings, stages: demo.stages });

  it("reprend le verdict du moteur : dossier non admissible, une alerte bloquante", () => {
    expect(v.status).toBe("rejected");
    expect(v.label).toBe("dossier non admissible");
    expect(v.critical).toBe(true);
    expect(v.lead).toEqual({ figure: "1", text: "alerte bloque l’admissibilité du FEC." });
  });

  it("compte les constats bloquants ou majeurs encore en attente (2 + 19)", () => {
    expect(v.second).toEqual({ figure: "21", text: "constats bloquants ou majeurs appellent une revue." });
  });

  it("énonce la ligne FEC citée par l'alerte, sa source, et ne promet aucune fiabilité", () => {
    expect(v.detail).toContain("3 écritures avec date hors format AAAAMMJJ (L517, L904, L1330), LPF art. A.47 A-1.");
    expect(v.detail).toContain("aucune analyse financière ne peut être présentée comme fiable");
  });

  it("une validation retire le constat de la liste « à revoir » (lecture du snapshot, pas d'état local)", () => {
    const next = appendReviewDecisionToSnapshot(demo.snapshot, { id: "evt-1", findingId: "DEMO-PROV-1", actorId: "demo-reviewer", actorRole: "reviewer", newStatus: "confirmed", comment: "", relatedEvidenceIds: [], createdAt: "2026-10-16T08:00:00.000Z" });
    const after = view(next);
    const verdict = buildVerdictView({ synthesis: after.synthesis, findings: next.findings, admissibilityFindings: next.admissibilityFindings, stages: after.stages });
    expect(verdict.second.figure).toBe("20");
  });
});

describe("signal heuristique", () => {
  it("indice 82 : niveau élevé, 16 segments pleins de 5 points", () => {
    const signal = buildSignalView(demo.synthesis.risk.heuristicSeverityIndex);
    expect(signal.index).toBe(82);
    expect(signal.band).toBe("élevé");
    expect(signal.segments.filter(Boolean)).toHaveLength(16);
    expect(signal.segments).toHaveLength(20);
  });

  it("bornes des niveaux : 19 faible, 20 modéré, 40 notable, 60 élevé", () => {
    expect([19, 20, 39, 40, 59, 60].map((i) => buildSignalView(i).band)).toEqual(["faible", "modéré", "modéré", "notable", "notable", "élevé"]);
  });
});

describe("mesures de décision", () => {
  it("admissibilité : rejetée, 18 zones dont une seule signalée (EcritureDate), 3 lignes", () => {
    const m = buildAdmissibilityMeasure(demo.synthesis, demo.datasets.fecQuality, demo.snapshot.admissibilityFindings);
    expect(m.word).toBe("rejetée");
    expect(m.glyph).toBe("bloquant");
    expect(m.ticks).toHaveLength(18);
    expect(m.ticks.filter((t) => t.flagged).map((t) => t.zone)).toEqual(["EcritureDate"]);
    expect(m.text).toBe("1 alerte bloquante · zone EcritureDate · 3 lignes");
  });

  it("couverture : non qualifiée, populations dites dans les mots du dataset, aucun ratio ni pourcentage", () => {
    const m = buildCoverageMeasure(demo.synthesis, demo.datasets.coverage);
    expect(m.word).toBe("non qualifiée");
    expect(m.populations.map((p) => p.state)).toEqual(["Population manquante", "Dénominateur non qualifié"]);
    expect(m.populations.every((p) => p.ratio === null)).toBe(true);
    expect(m.aria).not.toContain("%");
  });

  it("revue : aucun constat arbitré sur 43, une graduation par constat", () => {
    const tally = tallyReview(demo.stages);
    const m = buildReviewMeasure(demo.synthesis, demo.stages, tally);
    expect([m.reviewed, m.total, m.pct]).toEqual([0, 43, 0]);
    expect(m.ticks).toHaveLength(43);
    expect(m.text).toBe("43 en attente");
  });

  it("revue : valider puis écarter se lit dans les graduations et le texte", () => {
    const base = demo.snapshot;
    const step = (s: DossierSnapshot, id: string, status: "confirmed" | "dismissed", n: number) =>
      appendReviewDecisionToSnapshot(s, { id: `e${n}`, findingId: id, actorId: "demo-reviewer", actorRole: "reviewer", newStatus: status, comment: "", relatedEvidenceIds: [], createdAt: `2026-10-16T08:0${n}:00.000Z` });
    const next = step(step(base, "DEMO-CA-1", "confirmed", 1), "DEMO-PROV-1", "dismissed", 2);
    const v = view(next);
    const tally = tallyReview(v.stages);
    expect(tally).toMatchObject({ total: 43, proposed: 1, dismissed: 1, pending: 41 });
    expect(buildReviewMeasure(v.synthesis, v.stages, tally).text).toBe("1 validé · 1 écarté · 41 en attente");
    expect(v.synthesis.review.reviewedCount).toBe(2);
  });
});

describe("Sankey cloison → gravité", () => {
  const layout = layoutSankey(demo.synthesis.risk.matrix, demo.clos);

  it("conserve les 43 constats du snapshot : bandes, nœuds de gauche et de droite s'additionnent à 43", () => {
    expect(layout.total).toBe(43);
    expect(layout.bands.reduce((s, b) => s + b.n, 0)).toBe(43);
    expect(layout.left.reduce((s, n) => s + n.n, 0)).toBe(43);
    expect(layout.right.reduce((s, n) => s + n.n, 0)).toBe(43);
  });

  it("une bande par couple cloison × gravité non vide (12 couples dans la démo)", () => {
    expect(layout.bands).toHaveLength(12);
    expect(layout.bands.find((b) => b.key === bandKey("bilan-actif", "majeur"))?.n).toBe(11);
  });

  it("tient dans la boîte de 360 de haut et l'épaisseur est proportionnelle au nombre de constats", () => {
    for (const n of [...layout.left, ...layout.right]) {
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y + n.h).toBeLessThanOrEqual(360);
    }
    const actif = layout.left.find((n) => n.id === "bilan-actif")!;
    const resultat = layout.left.find((n) => n.id === "resultat")!;
    expect(actif.h / resultat.h).toBeCloseTo(20 / 8, 5);
  });

  it("titre : l'actif concentre 20 constats, les deux bloquants sont nommés", () => {
    const title = sankeyTitle({ total: layout.total, left: layout.left, blockingCount: 2, blockingSources: ["admissibilité du FEC", "provisions"] });
    expect(title).toBe("L’actif concentre 20 des 43 constats ; 2 bloquants : admissibilité du FEC, provisions.");
  });

  it("sans constat : aucune bande, aucun nœud de hauteur, titre sans chiffre inventé", () => {
    const empty = layoutSankey({}, demo.clos);
    expect(empty.bands).toHaveLength(0);
    expect(empty.left.every((n) => n.h === 0)).toBe(true);
    expect(sankeyTitle({ total: 0, left: empty.left, blockingCount: 0, blockingSources: [] })).toBe("Aucun constat à répartir entre cloisons et gravités.");
  });
});

describe("pont d'exposition", () => {
  const groups = buildBridgeGroups(demo.datasets.waterfall.steps);

  it("trois ponts, jamais fusionnés : diminution, augmentation, effet sur le résultat", () => {
    expect(groups.map((g) => g.group)).toEqual(["Résultat · diminution", "Résultat · augmentation", "Effet sur le résultat"]);
  });

  it("le pont des diminutions part de 457 000 € détectés, tombe à 0 anomalie non corrigée (tout est en attente)", () => {
    const [down] = groups;
    expect(down.columns[0]).toMatchObject({ tone: "detected", kind: "start", amountCents: 45_700_000, from: 0, to: 45_700_000 });
    const pending = down.columns.find((c) => c.tone === "pending")!;
    expect(pending).toMatchObject({ amountCents: -45_700_000, from: 45_700_000, to: 0 });
    expect(down.columns.at(-1)).toMatchObject({ tone: "uncorrected", amountCents: 0 });
    expect(down.hi).toBe(45_700_000);
    expect(down.lo).toBe(0);
  });

  it("sans ajustement proposé, l'effet d'impôt et le net sont nuls (rien à imposer), pas inconnus", () => {
    const last = groups[2].columns;
    expect(last.map((c) => c.tone)).toEqual(["effect", "tax", "net"]);
    expect(last.map((c) => c.amountCents)).toEqual([0, 0, 0]);
  });

  it("un net inconnu (ajustement proposé sans taux) garde amountCents = null et n'a pas de barre", () => {
    const next = appendReviewDecisionToSnapshot(demo.snapshot, { id: "e1", findingId: "DEMO-PROV-1", actorId: "demo-reviewer", actorRole: "reviewer", newStatus: "confirmed", comment: "", relatedEvidenceIds: [], createdAt: "2026-10-16T08:00:00.000Z" });
    const v = view(next);
    const g = buildBridgeGroups(v.datasets.waterfall.steps);
    const effect = g.at(-1)!;
    expect(effect.columns.find((c) => c.tone === "tax")!.amountCents).toBeNull();
    expect(effect.columns.find((c) => c.tone === "net")!.amountCents).toBeNull();
    expect(effect.columns.find((c) => c.tone === "effect")!.amountCents).toBe(-14_500_000);
  });

  it("graduations rondes incluant le zéro, libellés compacts", () => {
    expect(niceTicks(0, 45_700_000)).toContain(0);
    expect(plain(compactEuros(0))).toBe("0 €");
    expect(plain(compactEuros(-20_000_000))).toBe("−200 k€");
    expect(plain(compactEuros(120_000_000))).toBe("1,2 M€");
  });

  it("effets chiffrés : trois groupes triés par montant, signés, en attente", () => {
    const rows = buildEffectRows(demo.synthesis.exposure.clusters, demo.snapshot.findings);
    expect(rows.map((r) => [r.id, r.signedCents, r.status])).toEqual([
      ["DEMO-CA-1", -31_200_000, "en attente"],
      ["DEMO-PROV-1", -14_500_000, "en attente"],
      ["DEMO-CCA-1", 1_800_000, "en attente"],
    ]);
    expect(rows.every((r) => !r.indeterminate)).toBe(true);
  });

  it("titre : nomme les ponts et dit qu'aucun effet n'est arbitré", () => {
    expect(plain(bridgeTitle(demo.synthesis.exposure))).toBe("3 effets chiffrés : Résultat · diminution 457 000 €, Résultat · augmentation 18 000 €. Aucun n’est encore arbitré.");
  });
});

describe("mosaïque cloison × assertion", () => {
  const model = buildMosaic(demo.snapshot.findings, demo.clos);

  it("les comptes de chaque cellule égalent ceux du dataset de la Synthèse (aucune divergence)", () => {
    const dataset = demo.datasets.riskHeatmap;
    const byLabel = new Map(dataset.columns.map((c) => [c.label, c.key]));
    for (const column of model.columns) {
      const key = byLabel.get(column.label);
      expect(key, `colonne ${column.label}`).toBeDefined();
      for (const clo of model.rows) {
        const row = dataset.rows.find((r) => r.id === clo.id)!;
        expect(model.cells[cellKey(clo.id, column.key)].length, `${clo.id} × ${column.label}`).toBe(Number(row.cells[key as string]));
      }
    }
  });

  it("les colonnes d'assertion suivent l'ordre de la NEP 500 et les colonnes hors assertion viennent après", () => {
    const keys = model.columns.map((c) => c.key);
    expect(keys.indexOf("flux_realite")).toBeLessThan(keys.indexOf("solde_existence"));
    expect(keys.indexOf("solde_evaluation")).toBeLessThan(keys.indexOf("annexe_exhaustivite"));
    expect(keys.slice(-2)).toEqual(["non_resolue", "conformite"]);
  });
});

describe("concentration par cycle", () => {
  const c = buildConcentration({ cycleRows: demo.cycleRows, findings: demo.snapshot.findings, exposure: demo.synthesis.exposure });

  it("42 constats rattachés à un cycle, 1 non rattaché (l'alerte d'admissibilité du FEC)", () => {
    expect(c.total).toBe(42);
    expect(c.unassigned).toBe(1);
    expect(c.rows).toHaveLength(11);
  });

  it("trié par nombre de constats ; les trois premiers cycles portent 50 % (21/42)", () => {
    expect(c.rows[0].label).toBe("Clients et ventes");
    expect(c.rows[0].n).toBe(8);
    expect(c.topShare).toBe(50);
    expect(c.curve[0]).toEqual({ x: 0, y: 0 });
    expect(c.curve.at(-1)).toEqual({ x: 1, y: 1 });
  });

  it("l'exposition d'un cycle est lue par poste et sens, jamais additionnée", () => {
    const prov = c.rows.find((r) => r.id === "provisions")!;
    expect(prov.effects.map((e) => plain(e.text))).toEqual(["−145 000 €"]);
    const clients = c.rows.find((r) => r.id === "clients")!;
    expect(clients.effects.map((e) => plain(e.text))).toEqual(["−312 000 €"]);
  });
});

describe("code-barres de positions", () => {
  const b = buildBarcode({ findings: demo.snapshot.findings, admissibilityFindings: demo.snapshot.admissibilityFindings, fileLines: null });

  it("une bande par famille ayant des lignes citées ; 13 constats renvoient à 20 lignes distinctes", () => {
    expect(b.rows.map((r) => r.family)).toEqual(["hardLaw", "methodology"]);
    expect(new Set(b.rows.flatMap((r) => r.ticks.map((t) => t.findingId))).size).toBe(13);
    expect(b.located).toBe(20);
  });

  it("l'axe est borné à la ligne la plus éloignée (2750 → 3000) car la longueur du fichier n'est pas dénombrée", () => {
    expect(b.fileLines).toBeNull();
    expect(b.axisMax).toBe(3000);
    expect(b.axisLabels[0]).toBe(0);
    expect(b.axisLabels.at(-1)).toBe(3000);
    expect(b.method).toContain("longueur du fichier non dénombrée");
  });

  it("trois lignes bloquent l'admissibilité (L517, L904, L1330)", () => {
    expect(b.blockingLines).toBe(3);
    expect(b.title).toBe("20 lignes du fichier sont repérées par des constats : 3 bloquent l’admissibilité, 17 autres appellent une corroboration.");
  });

  it("avec une longueur de fichier dénombrée, l'axe la reprend telle quelle", () => {
    const sized = buildBarcode({ findings: demo.snapshot.findings, admissibilityFindings: demo.snapshot.admissibilityFindings, fileLines: 2840 });
    expect(sized.axisMax).toBe(2840);
    expect(sized.axisLabels.at(-1)).toBe(2840);
  });
});

describe("journal des constats", () => {
  const cycleBySilo = new Map(demo.cycleRows.flatMap((r) => r.entry.silos.map((s) => [s, r.entry.label] as const)));
  const rows = buildJournalRows(demo.snapshot.findings, cycleBySilo, demo.stages);
  const base = { cloison: null, severity: null, family: null, query: "", sort: "gravite" as const };

  it("43 lignes, bloquants d'abord", () => {
    const sorted = applyJournal(rows, base);
    expect(sorted).toHaveLength(43);
    expect(sorted.slice(0, 2).map((r) => r.severity)).toEqual(["bloquant", "bloquant"]);
  });

  it("tri par effet chiffré : le plus grand effet absolu d'abord (DEMO-CA-1 −312 000 €)", () => {
    const sorted = applyJournal(rows, { ...base, sort: "effet" });
    expect(sorted[0].id).toBe("DEMO-CA-1");
    expect(sorted[0].effectCents).toBe(-31_200_000);
    expect(sorted.filter((r) => r.effectCents !== null)).toHaveLength(3);
  });

  it("filtres croisés et recherche plein texte (compte, référence, cycle)", () => {
    expect(applyJournal(rows, { ...base, severity: "bloquant" })).toHaveLength(2);
    expect(applyJournal(rows, { ...base, cloison: "bilan-actif", severity: "majeur" })).toHaveLength(11);
    expect(applyJournal(rows, { ...base, query: "DEMO-CA-1" }).map((r) => r.id)).toEqual(["DEMO-CA-1"]);
    expect(applyJournal(rows, { ...base, query: "222222" })).toHaveLength(0);
  });

  it("le cycle d'un constat vient de son silo ; l'alerte d'admissibilité n'a pas de cycle", () => {
    expect(rows.find((r) => r.id === "DEMO-IMMO-1")?.cycle).toBe("Immobilisations");
    expect(rows.find((r) => r.id === "DEMO-ADM-1")?.cycle).toBeNull();
  });
});

describe("chaîne de preuve", () => {
  it("formatLines regroupe les lignes consécutives en plages", () => {
    expect(formatLines([2310, 2311, 2312])).toBe("L2310–2312");
    expect(formatLines([517, 904, 1330])).toBe("L517, L904, L1330");
    expect(formatLines([1204, 1205, 1330])).toBe("L1204–1205, L1330");
    expect(formatLines([])).toBe("");
  });

  it("un maillon absent est dit absent, jamais reconstitué", () => {
    const adm = demo.snapshot.findings.find((f) => f.id === "DEMO-ADM-1")!;
    const chain = buildChain(adm, "pending");
    expect(chain.nodes[0].detail).toContain("L517");
    expect(chain.nodes[1]).toMatchObject({ detail: "non renseigné", missing: true });
    expect(chain.focus[1]).toBe("Transformation : aucune déclarée, lecture directe.");
  });

  it("le dernier maillon suit l'étape de revue", () => {
    const f = demo.snapshot.findings.find((x) => x.id === "DEMO-CA-1")!;
    expect(buildChain(f, "pending").nodes[4].detail).toBe("En attente de revue");
    expect(buildChain(f, "proposed").nodes[4].detail).toBe("Validé par l’auditeur");
    expect(buildChain(f, "dismissed").nodes[4].detail).toBe("Écarté par l’auditeur");
    expect(plain(buildChain(f, "pending").focus[3])).toContain("effet chiffré −312 000 €");
  });
});

describe("exploration", () => {
  it("petits multiples : une échelle commune, l'actif cumule le plus de majeurs", () => {
    const m = buildMultiples(demo.synthesis.risk.matrix, demo.clos);
    expect(m.title).toContain("l’actif cumule le plus de majeurs (11)");
    const ratios = m.panels.flatMap((p) => p.rows.map((r) => r.ratio));
    expect(Math.max(...ratios)).toBe(1);
    expect(m.panels.find((p) => p.id === "bilan-actif")!.rows.find((r) => r.severity === "majeur")!.n).toBe(11);
  });

  it("strates : 28 méthode, 11 droit dur, 4 interne ; les corpus cités viennent des constats", () => {
    const s = buildStrata(demo.snapshot.findings, demo.synthesis.risk.byFamily);
    expect(s.title.startsWith("28 constats relèvent de la méthode d’audit, 11 du droit dur, 4 de paramètres internes.")).toBe(true);
    const hard = s.rows.find((r) => r.family === "hardLaw")!;
    expect(hard.sub).toContain("LPF");
    expect(hard.sub.endsWith("— opposable")).toBe(true);
    expect(s.rows.find((r) => r.family === "methodology")!.length).toBe(100);
  });

  it("frise : repères datés issus des sources citées, triés, l'édition du référentiel en dernier", () => {
    const frieze = buildFrieze(demo.snapshot.findings, { label: "éd. 3", enteredOn: "2026-10-14" });
    const years = frieze.map((i) => i.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
    expect(frieze.at(-1)).toMatchObject({ title: "Référentiel PROBANT éd. 3", sub: "Versionné · revue requise" });
    expect(frieze.find((i) => i.year === 2013)?.title).toBe("LPF");
    expect(frieze.every((i, k) => k === 0 || i.left - frieze[k - 1].left >= 11.99)).toBe(true);
  });

  it("spreadPositions écarte sans réordonner et reste dans la frise", () => {
    expect(spreadPositions([0, 1, 2, 50, 51])).toEqual([0, 12, 24, 50, 62]);
    const crowded = spreadPositions([0, 1, 2, 3, 4, 5, 6, 7, 8], 12, 88);
    expect(crowded[0]).toBe(0);
    expect(crowded.at(-1)).toBe(88);
    expect(crowded.every((v, i) => i === 0 || v > crowded[i - 1])).toBe(true);
  });
});

describe("limites de l'analyse", () => {
  it("reprend les limites du moteur et ajoute les lectures chiffrées (démo, admissibilité, constats sans effet)", () => {
    const limits = buildLimits({ synthesis: demo.synthesis, demoSociete: "DEMO SA" });
    expect(limits[0]).toBe("Mode démo : société fictive DEMO SA ; aucun résultat n’est opposable ni ne vaut certification.");
    expect(limits).toContain("Admissibilité rejetée : 1 alerte bloquante sur le fichier ; l’exploitation chronologique du fichier est suspendue jusqu’à correction.");
    expect(limits).toContain("40 constats sans effet chiffré sont exclus de l’exposition ; leur incidence reste à évaluer.");
    for (const l of demo.synthesis.limitations) expect(limits).toContain(l.message);
    expect(limits.at(-1)).toBe("Le signal heuristique repose sur des pondérations internes (25/8/2/0,5), non opposables.");
  });

  it("hors démonstration, aucune mention de société fictive", () => {
    expect(buildLimits({ synthesis: demo.synthesis, demoSociete: null }).some((l) => l.startsWith("Mode démo"))).toBe(false);
  });
});
