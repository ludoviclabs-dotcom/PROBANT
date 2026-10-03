import { describe, expect, it } from "vitest";
import { AUDIT_CYCLES } from "../catalog";
import { cleGroupante, joursEntre } from "../engine";
import { buildRapprochementDepuisDepot } from "../build-from-upload";
import { lignesDepuisTableur } from "../adapters/tabular";
import type { DocumentLigne, DocumentSource } from "../types";
import type { UploadQualification } from "../upload-contract";
import { addRapprochementToSnapshot, buildDemoDossierSnapshot, invalidateRapprochementInSnapshot } from "@/lib/dossier/snapshot-builder";
import { DossierUpdateQueue } from "@/lib/dossier/update-queue";
import { buildSynthesisSnapshot } from "@/lib/synthesis";
import { buildEvidenceExportPackage, verifyEvidenceExportPackage } from "@/lib/evidence/package";
import { appendReviewDecisionToSnapshot } from "@/lib/dossier/snapshot-state";

export const qualification: UploadQualification = { entity: "Entité recette", period: { startDate: "2024-01-01", closingDate: "2024-12-31", asOfDate: "2025-02-01", currency: "EUR", validation: "confirmed" }, comparisonBasisConfirmed: true, technicalToleranceEur: 0, selection: "all_imported_rows", materialityAmount: null };
export function documents(cycleId: string, a: Array<[string, number]>, b: Array<[string, number]>) {
  const cycle = AUDIT_CYCLES.find((c) => c.id === cycleId)!;
  const key = cleGroupante(cycle.config.cles);
  const doc = (id: string, rows: Array<[string, number]>): DocumentSource => ({ id, label: id, format: "csv", type: "autre", lignes: rows.map(([value, montant], i): DocumentLigne => ({ [key]: value, montant, sourceLine: i + 2 })) });
  return [doc(`${cycleId}-A`, a), doc(`${cycleId}-B`, b)];
}
export function compare(cycleId: string, a: Array<[string, number]>, b: Array<[string, number]>, q = qualification) {
  const [source, cible] = documents(cycleId, a, b);
  return { cycleId, qualification: q, generatedAt: "2026-10-03T00:00:00Z", silo: buildRapprochementDepuisDepot(cycleId, source, cible, null, q.period?.closingDate.replaceAll("-", ""), q.technicalToleranceEur), documents: [source, cible].map((doc, i) => ({ id: doc.id, fileName: `${doc.id}.csv`, fingerprint: String(i + 1).repeat(64), lineCount: doc.lignes.length, parserVersion: "rapprochement-tabular-2.0.0", mappingVersion: "auto-columns-1.0.0" })) };
}

for (const cycle of AUDIT_CYCLES) describe(`dépôt réel ${cycle.id}`, () => {
  it("ne reprend pas la tolérance de fixture : l’écart d’un centime reste visible sans seuil", () => {
    const input = compare(cycle.id, [["K", 100]], [["K", 99.99]]);
    const result = input.silo.rapprochement!;
    expect(result.config.toleranceEur).toBe(0);
    expect(result.ecartBrut).toBe(0.01);
    expect(result.lignes.ecart).toEqual({ source: 1, cible: 1 });
    expect(input.silo.findings).toHaveLength(1);
    expect(input.silo.findings[0].constat).toContain("0,01 €");
    expect(input.silo.findings[0].annotation).toBe("Écart 0,01 €");
    expect(input.silo.findings[0].seuilApplique).toBeUndefined();
  });
  it("un total net identique ne rapproche aucune des lignes opposées", () => {
    const result = compare(cycle.id, [["K", 100], ["L", -100]], [["K", 0], ["L", 0]]).silo.rapprochement!;
    expect(result.totalSource).toBe(result.totalCible);
    expect(result.ecartGlobal).toBe(0);
    expect(result.ecartBrut).toBe(200);
    expect(result.tauxRapprochement).toBe(0);
    expect(result.lignes.ecart).toEqual({ source: 2, cible: 2 });
  });
  it("expose les compensations au sein d’un groupe et les agrégations multiples", () => {
    const compensated = compare(cycle.id, [["K", 100], ["K", -100]], [["K", 0]]).silo.rapprochement!;
    expect(compensated.ecartGlobal).toBe(0);
    expect(compensated.ecartBrut).toBe(200);
    expect(compensated.groupes[0].statut).toBe("ambigu");
    expect(compensated.tauxRapprochement).toBe(0);
    const aggregate = compare(cycle.id, [["K", 50], ["K", 50]], [["K", 100]]).silo.rapprochement!;
    expect(aggregate.ecartBrut).toBe(0);
    expect(aggregate.lignes.ambigu).toEqual({ source: 2, cible: 1 });
  });
  it("conserve les clés absentes et leurs références de lignes", () => {
    const result = compare(cycle.id, [[" ", 100]], [["K", 100]]).silo.rapprochement!;
    expect(result.ecartGlobal).toBe(0);
    expect(result.lignes.non_testable.source).toBe(1);
    expect(result.groupes.flatMap((g) => g.source)).toHaveLength(1);
    expect(result.groupes.find((g) => g.statut === "non_testable")?.source[0].line).toBe(2);
    expect(result.tauxRapprochement).toBe(0);
  });
  it("une période inconnue bloque la procédure sans inventer l’année courante", () => {
    const snapshot = addRapprochementToSnapshot(buildDemoDossierSnapshot(), compare(cycle.id, [["K", 100]], [["K", 100]], { ...qualification, period: undefined }));
    expect(snapshot.uploadExecutions![0].status).toBe("blocked");
    expect(snapshot.calculationContext).toMatchObject({ controlsEligible: 1, controlsExecuted: 0, controlsConcluded: 0 });
    expect(snapshot.dossier.societe.exercice).toBe("inconnue");
    expect(snapshot.dossier.societe.dateCloture).toBe("");
    expect(snapshot.calculationContext.cycleIdsCovered).toEqual([]);
  });
  it("un réimport nominal retire les anciennes exceptions et leur revue active", () => {
    let snapshot = addRapprochementToSnapshot(buildDemoDossierSnapshot(), compare(cycle.id, [["K", 100]], [["K", 90]]));
    const oldId = snapshot.findings[0].id;
    snapshot = appendReviewDecisionToSnapshot(snapshot, { id: "review", findingId: oldId, actorId: "reviewer", actorRole: "reviewer", newStatus: "confirmed", comment: "Revue", relatedEvidenceIds: [], createdAt: "2026-10-03T01:00:00Z" });
    snapshot = invalidateRapprochementInSnapshot(snapshot, cycle.id, "Nouvel import");
    expect(snapshot.findings).toHaveLength(0);
    expect(snapshot.calculationContext.controlsExecuted).toBe(0);
    snapshot = addRapprochementToSnapshot(snapshot, compare(cycle.id, [["K", 100]], [["K", 100]]));
    expect(snapshot.findings).toHaveLength(0);
    expect(snapshot.dossier.silos[0].findings).toHaveLength(0);
    expect(snapshot.uploadExecutions?.map((run) => [run.version, run.state])).toEqual([[1, "stale"], [2, "active"]]);
    expect(snapshot.uploadExecutions![0].silo.findings[0].id).toBe(oldId);
    expect(snapshot.calculationContext).toMatchObject({ controlsEligible: 1, controlsExecuted: 1, controlsConcluded: 1 });
    expect(snapshot.reviewEvents[0].findingId).toBe(oldId);
  });
  it("distingue le zéro valide des formats ambigus ou absents", () => {
    expect(compare(cycle.id, [["K", 0]], [["K", 0]]).silo.rapprochement!.tauxRapprochement).toBe(1);
    for (const amount of ["12.500", "12,500", "illisible", "", 0.001, Infinity]) expect(() => lignesDepuisTableur([{ montant: amount }], { montant: "montant" })).toThrow(/Montant (invalide|absent)/);
  });
});

it("la clôture civile explicite gouverne l’âge ; le lettrage ne prouve jamais la dépréciation", () => {
  const [source, target] = documents("clients", [["K", 100]], [["K", 100]]);
  for (const doc of [source, target]) Object.assign(doc.lignes[0], { echeance: "20230101", lettre: true, letteringStatus: "matched" });
  const early = buildRapprochementDepuisDepot("clients", source, target, null, "20230131");
  const late = buildRapprochementDepuisDepot("clients", source, target, null, "20241231");
  expect(early.findings).toHaveLength(0);
  expect(late.findings[0].qualification).toBe("anteriorite");
  expect(late.findings[0].mesure).toMatchObject({ constate: 100, seuil: 100 });
  expect(late.findings[0].annotation).not.toContain("Dépréciation attendue");
  expect(joursEntre("20240230", "20240101")).toBeNull();
});
it("deux mutations concurrentes lisent le dernier état et préservent les deux cycles", async () => {
  let current = buildDemoDossierSnapshot();
  const queue = new DossierUpdateQueue();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const first = queue.run(async () => { await gate; current = addRapprochementToSnapshot(current, compare("clients", [["K", 100]], [["K", 100]])); });
  const second = queue.run(async () => { current = addRapprochementToSnapshot(current, compare("fournisseurs", [["K", 100]], [["K", 90]])); });
  release(); await Promise.all([first, second]);
  expect(current.uploadExecutions?.filter((run) => run.state === "active").map((run) => run.cycleId)).toEqual(["clients", "fournisseurs"]);
  expect(current.calculationContext).toMatchObject({ controlsEligible: 2, controlsExecuted: 2, controlsConcluded: 2 });
  expect(current.dossier.silos).toHaveLength(2);
  const retry = queue.run(async () => { throw new Error("stockage indisponible"); });
  await expect(retry).rejects.toThrow();
  await expect(queue.run(async () => current.dossier.silos.length)).resolves.toBe(2);
});
it("Synthèse et exports comptent les exécutions même sans findings et limitent l’assurance", async () => {
  let snapshot = addRapprochementToSnapshot(buildDemoDossierSnapshot(), compare("clients", [["K", 100]], [["K", 90]]));
  snapshot = addRapprochementToSnapshot(snapshot, compare("clients", [["K", 100]], [["K", 100]]));
  const synthesis = buildSynthesisSnapshot(snapshot, { clock: () => "2026-10-03T00:00:00Z" });
  expect(synthesis.coverage).toMatchObject({ status: "partial", controlsExecuted: 1, controlsConcluded: 1 });
  expect(synthesis.limitations.some((l) => l.code === "limited_upload_comparison")).toBe(true);
  const pack = await buildEvidenceExportPackage(snapshot, synthesis, { applicationVersion: "test", activeContext: { dossierId: snapshot.dossier.id, organizationId: "session" } });
  const exported = JSON.parse(pack.canonicalJson);
  expect(exported.controls).toHaveLength(1);
  expect(exported.controls[0].status).toBe("completed_without_finding");
  expect(exported.findings).toHaveLength(0);
  expect(exported.uploadExecutions.map((r: { state: string }) => r.state)).toEqual(["stale", "active"]);
  expect(pack.html).toContain("Une égalité des totaux nets ne démontre pas l’exhaustivité");
  expect(verifyEvidenceExportPackage(pack)).toEqual([]);
});
it("les références d’export visent les documents de la version active et le diagnostic garde son blocage", async () => {
  const snapshot = addRapprochementToSnapshot(buildDemoDossierSnapshot(), compare("clients", [["K", 100]], [["K", 90]], { ...qualification, period: undefined }));
  const pack = await buildEvidenceExportPackage(snapshot, buildSynthesisSnapshot(snapshot, { clock: () => "2026-10-03T00:00:00Z" }), { applicationVersion: "test", activeContext: { dossierId: snapshot.dossier.id, organizationId: "session" } });
  const exported = JSON.parse(pack.canonicalJson);
  expect(exported.controls[0]).toMatchObject({ status: "not_concluded", execution: "blocked" });
  expect(exported.evidenceChain[0].sourceDocumentIds).toEqual(snapshot.uploadExecutions![0].documents.map((doc) => doc.id).sort());
});
it("les cartes ne peuvent pas prétendre sauvegarder dans un dossier persistant", () => {
  const snapshot = { ...buildDemoDossierSnapshot(), sourceKind: "persistent" as const };
  expect(() => addRapprochementToSnapshot(snapshot, compare("clients", [["K", 0]], [["K", 0]]))).toThrow(/raccord durable/);
});
it("une mise à jour d’un cycle préserve le constat actif de l’autre, sans réutiliser ses IDs", () => {
  let snapshot = addRapprochementToSnapshot(buildDemoDossierSnapshot(), compare("clients", [["K", 100]], [["K", 90]]));
  snapshot = addRapprochementToSnapshot(snapshot, compare("fournisseurs", [["K", 100]], [["K", 80]]));
  const supplierId = snapshot.findings.find((f) => f.cycleSlug === "dettes-fournisseurs")!.id;
  const oldClientId = snapshot.findings.find((f) => f.cycleSlug === "creances-clients")!.id;
  snapshot = addRapprochementToSnapshot(snapshot, compare("clients", [["K", 100]], [["K", 100]]));
  expect(snapshot.findings.map((f) => f.id)).toEqual([supplierId]);
  expect(snapshot.findings.some((f) => f.id === oldClientId)).toBe(false);
  expect(snapshot.calculationContext.controlsExecuted).toBe(2);
});
it("les compteurs historiques non prouvés sont écartés lors du remplacement d’un dépôt sans contrat", () => {
  const input = compare("clients", [["K", 100]], [["K", 90]]);
  const demo = buildDemoDossierSnapshot();
  const legacy = { ...demo, sourceKind: "session" as const, dossier: { ...demo.dossier, demoMode: false, silos: [input.silo] }, findings: input.silo.findings, calculationContext: { ...demo.calculationContext, cycleIdsCovered: ["clients"], controlsEligible: 17, controlsExecuted: 17, controlsConcluded: 17 } };
  const snapshot = addRapprochementToSnapshot(legacy, compare("clients", [["K", 100]], [["K", 100]]));
  expect(snapshot.findings).toHaveLength(0);
  expect(snapshot.calculationContext).toMatchObject({ controlsEligible: 1, controlsExecuted: 1, controlsConcluded: 1, cycleIdsCovered: [] });
  expect(snapshot.calculationContext.notes.join(" ")).toContain("Compteurs historiques non vérifiables");
});
it("un seuil technique explicite ne masque pas l’écart brut ni ne devient un seuil de signification", () => {
  const input = compare("clients", [["K", 100]], [["K", 99.99]], { ...qualification, technicalToleranceEur: 0.01 });
  expect(input.silo.rapprochement!.lignes.rapproche).toEqual({ source: 1, cible: 1 });
  expect(input.silo.rapprochement!.ecartBrut).toBe(0.01);
  expect(input.silo.findings).toHaveLength(0);
  expect(input.qualification.selection).toBe("all_imported_rows");
  expect(input.qualification.materialityAmount).toBeNull();
});
it("une incohérence d’entité ou de période entre cycles est refusée avant modification du dossier", () => {
  const snapshot = addRapprochementToSnapshot(buildDemoDossierSnapshot(), compare("clients", [["K", 100]], [["K", 100]]));
  expect(() => addRapprochementToSnapshot(snapshot, compare("fournisseurs", [["K", 100]], [["K", 100]], { ...qualification, entity: "Autre entité" }))).toThrow(/Entité ou période différente/);
  expect(snapshot.uploadExecutions).toHaveLength(1);
});
