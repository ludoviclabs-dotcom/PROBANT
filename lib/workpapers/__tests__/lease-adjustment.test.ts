import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { materializeBundle, type AdjustmentBundle } from "@/lib/ifrs/shared/bundle";
import { ifrs16ResultFeed } from "@/lib/ifrs/shared/feed";
import type { PreparationManifest } from "@/lib/ifrs/shared/manifest";
import { bundleLifecycle, decideBundleSelection, documentBundlePosting, selectionStanding, withdrawBundleSelection, type SheetStanding } from "@/lib/ifrs/shared/selection";
import type { ImportBatch } from "../imports";
import { LEASE_TEMPLATE, LeaseRegistry } from "../lease-adapter";
import { leaseReviewPoints, type LeaseResult } from "../lease-review";
import { stampLeaseWork } from "../lease-work";
import { periodId, type WorkpaperRun, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { freezePopulation, selectPopulation } from "../selection";
import { approvedLeaseBatches, LEASE_PERIOD, type LeaseRow } from "./lease-fixture";
import { leaseFacts, type LeaseType } from "../lease-sources";

/**
 * L16-03 — de la feuille au retraitement proposé, puis à sa sélection pour une base : résultat de contrôle, inclusion par contrat, points
 * de revue, matérialisation à version exacte, sélection et retrait par version attendue, comptabilisation documentée, contrat exposé à IFRS 18.
 * Scénario synthétique (`demo`) : la règle reste à revoir, l'exécution réelle est couverte par `lease-validated.integration.test.ts`.
 */
const scope: WorkpaperScope = { organizationId: "org-l16-03", dossierId: "dossier-l16-03", periodId: periodId(LEASE_PERIOD), mode: "demo" };
const actor: Principal = { id: "preparer-l16-03", grants: [{ scope, permissions: ["read", "prepare"] }] };
const work = stampLeaseWork({ framework: { standard: "IFRS 16", jurisdiction: "IASB", edition: "IFRS 16, IASB 2026", editionFingerprint: null }, firstApplication: { kind: "not_applicable", reason: "Entité déjà sous IFRS 16" },
  policies: [{ kind: "short_term_exemption", assetCategory: "Matériel de bureau", answer: { kind: "value", value: "not_elected" } }], confirmations: [] }, () => { throw new Error("unused"); }, actor.id, "2027-02-01T10:00:00.000Z");
type Rows = Record<LeaseType, LeaseRow[]>;
const oracle = JSON.parse(readFileSync(resolve(__dirname, "../../../docs/ifrs/recette/attendus_l16.json"), "utf8")) as { fixtures: { id: string; closings: { closing: string; bundle: { account: string; side: string; amount: string }[] }[] }[] };

function run(batches: ImportBatch[], revision = 1) {
  const population = freezePopulation(scope, batches, "lease_contract", actor, LEASE_PERIOD);
  const selection = selectPopulation(population, { method: "targeted", criteria: "Tous les contrats", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
  return new LeaseRegistry().execute({ scope, period: LEASE_PERIOD, rule: { id: "ifrs16.leases", version: "1.0.0" }, imports: batches, population, selection, parameters: { runId: "sheet-r" + revision, rootId: "sheet", revision, work } });
}
async function execute(edit?: (rows: Rows) => void, revision = 1) {
  const batches = await approvedLeaseBatches(scope, actor, edit), r = run(batches, revision);
  if (r.execution !== "completed") throw new Error("not completed: " + r.blockedControls.join(","));
  return { result: r.result as LeaseResult, batches };
}
const sheetRun = (result: LeaseResult, state: WorkpaperRun["state"], revision = 1, version = 6) => ({ id: "sheet-r" + revision, rootId: "sheet", revision, version, schemaVersion: "1.0.0", scope, period: LEASE_PERIOD, template: LEASE_TEMPLATE,
  state, preparedBy: actor.id, importIds: [], evidence: [], findings: [], notes: [], events: [], result: { execution: "completed", outcome: result.outcome, result } } as unknown as WorkpaperRun);
const standing = (b: AdjustmentBundle, over: Partial<SheetStanding> = {}): SheetStanding => ({ runId: b.runId, rootId: "sheet", revision: b.revision, version: b.runVersion, state: "approved", contentHash: b.contentHash, latestRevision: true, sourcesCurrent: true, ruleCurrent: true, ...over });

describe("L16-03 résultat : calcul, cadrage et retraitement restent trois objets", () => {
  it("base cadrée : retraitement proposé sur F01 et F03, sans exception ; lignes de F03 égales à l'oracle ; le loyer neutralisé cite les lignes PCG", async () => {
    const { result, batches } = await execute();
    expect(result.outcome).toBe("no_exception_detected");
    expect(result.contracts.map(c => [c.contractId, c.result, c.framing.status, c.adjustment.status])).toEqual([["F01", "computed", "framed", "included"], ["F03", "computed", "framed", "included"]]);
    const bundle = result.bundle!, ledger = batches.find(b => b.document.documentType === "lease_ledger")!;
    expect(bundle).toMatchObject({ kind: "closing_adjustment", logicalId: "ifrs16.leases:sheet", revision: 1, runId: "sheet-r1", identities: ["ifrs16:lease:F01", "ifrs16:lease:F03"], taxStatus: "not_computed",
      expectedBase: { baseKind: "PCG", sourceRefs: [{ importId: ledger.id, documentVersionId: ledger.document.id, sha256: ledger.document.byteHash }] } });
    // F03 over 2026 is the oracle's F03 over its first year (same months, same amounts).
    expect(bundle.lines.filter(l => l.contractId === "F03").map(l => ({ account: l.account, side: l.side, amount: l.amount.amount }))).toEqual(oracle.fixtures.find(f => f.id === "L16-F03")!.closings[0].bundle);
    const rent = bundle.lines.find(l => l.contractId === "F03" && l.account === "pcg_rent_neutralized")!;
    expect(rent.evidence).toEqual([ "sheet-r1:lease:" + ledger.rows.find(r => r.normalized!.key === "GL-613-F03-2026")!.id ]);
    expect(result.evidence.documents.flatMap(d => d.rows.map(r => r.rowId))).toEqual(expect.arrayContaining(ledger.rows.map(r => r.id)));
    expect(result.bridge!.rows.find(r => r.poste === "pnl_before_tax")).toMatchObject({ base: { amount: "-15000.00" }, baseBasis: "ledger", adjustment: { amount: "-538.91" }, target: { amount: "-15538.91" } });
    expect(result.bridge!.rows.filter(r => r.poste !== "pnl_before_tax").every(r => r.baseBasis === "condition")).toBe(true);
    expect(result.ledgerFraming).toMatchObject({ byStatus: { framed: 2 }, lines: { framed: 4, unattached: 0 } });
    expect(leaseReviewPoints(result)).toEqual([]);
  });
  it("charge mixte sur F03 : écart connu → exceptions relevées ; F03 garde ses chiffres sans retraitement ; point bloquant sans montant", async () => {
    const { result } = await execute(r => { r.lease_ledger.find(l => l.key === "GL-613-F03-2026")!.amount = "12600.00"; });
    expect(result.outcome).toBe("exceptions_detected");
    const f03 = result.contracts.find(c => c.contractId === "F03")!;
    expect(f03).toMatchObject({ result: "computed", closing: { debtClosing: { amount: "22819.76" } }, adjustment: { status: "excluded", reason: expect.stringContaining("X28") } });
    expect(result.bundle!.identities).toEqual(["ifrs16:lease:F01"]);
    expect(result.bridge!.notCovered.contracts).toEqual([{ contractId: "F03", reason: expect.stringContaining("X28") }]);
    // The difference is never an audit misstatement: no amount is attributed to the point.
    expect(leaseReviewPoints(result)).toEqual([expect.objectContaining({ key: "cadrage:F03", blocking: true, amount: { kind: "unknown", reason: expect.any(String) } })]);
  });
  it("charges absentes : aucun retraitement, résultat non concluant, jamais un retraitement à zéro", async () => {
    const { result } = await execute(r => { r.lease_ledger = []; });
    expect(result).toMatchObject({ outcome: "inconclusive", bundle: null, bridge: null });
    expect(result.contracts.map(c => c.adjustment.status)).toEqual(["excluded", "excluded"]);
    expect(leaseReviewPoints(result).map(p => [p.key, p.blocking])).toEqual([["cadrage:F01", true], ["cadrage:F03", true]]);
  });
  it("une écart connu prime : F01 sans charge (inconnu) et F03 en écart (connu) → exceptions relevées, les deux comptés", async () => {
    const { result } = await execute(r => { r.lease_ledger = r.lease_ledger.filter(l => !l.key.startsWith("GL-613-F01")); r.lease_ledger.find(l => l.key === "GL-613-F03-2026")!.amount = "11000.00"; });
    expect(result.outcome).toBe("exceptions_detected");
    expect(result.ledgerFraming.byStatus).toMatchObject({ not_framed: 1, difference: 1 });
    expect(result.bundle).toBeNull();
  });
  it("contrat historique sans ouverture : diagnostic, exclu du retraitement même si sa charge est cadrée", async () => {
    const { result } = await execute(r => {
      const c = r.lease_contracts.find(x => x.key === "F03")!, f = c.details.fields as Record<string, string>;
      c.date = "2025-01-01"; f.endDate = "2027-12-31"; f.signatureDate = "2024-12-15";
      r.lease_schedule = r.lease_schedule.map(d => d.details.contractId !== "F03" ? d : { ...d, date: shift(d.date), key: "F03-" + shift(d.date), details: { ...d.details, fields: { contractVersion: "v1", ...(shift(d.date) <= LEASE_PERIOD.asOfDate ? { paidDate: shift(d.date), paidAmount: "1000.00" } : { paidDate: "non_applicable", paidAmount: "non_applicable" }) } } });
    });
    const f03 = result.contracts.find(c => c.contractId === "F03")!;
    expect(f03).toMatchObject({ result: "diagnostic", framing: { status: "framed" }, adjustment: { status: "excluded", reason: expect.stringContaining("X24") } });
    expect(result.outcome).toBe("inconclusive");
    expect(result.bundle!.identities).toEqual(["ifrs16:lease:F01"]);
  });
  it("doublon d'import : deux sources de grand livre dans la même population sont refusées, jamais additionnées", async () => {
    const { batches } = await execute();
    const ledger = batches.find(b => b.document.documentType === "lease_ledger")!, twin = { ...ledger, id: ledger.id + "-bis", document: { ...ledger.document, id: ledger.document.id + "-bis" } };
    // Two heads of one type stop the calculation (L16_CURRENT_SOURCES_REQUIRED inside the engine): no result, no amount, no bundle.
    expect(() => leaseFacts([...batches, twin])).toThrow("L16_CURRENT_SOURCES_REQUIRED");
    expect(run([...batches, twin])).toMatchObject({ execution: "failed", outcome: "inconclusive", result: null });
  });
});

describe("L16-03 retraitement matérialisé, sélection par version attendue et contrat IFRS 18", () => {
  const manifestFor = (b: AdjustmentBundle, over: Partial<PreparationManifest> = {}): PreparationManifest => ({ baseKind: "PCG", sourceRefs: b.expectedBase.sourceRefs, period: b.period,
    includedAdjustments: { kind: "declared", identities: [] }, declaredBy: actor.id, declaredAt: "2027-02-10T09:00:00.000Z", limits: "Grand livre PCG du dossier ; ne certifie aucun traitement IFRS",
    citation: { documentVersionId: b.expectedBase.sourceRefs[0].documentVersionId, importId: b.expectedBase.sourceRefs[0].importId, fileName: "grand-livre.csv", sha256: b.expectedBase.sourceRefs[0].sha256, row: 2 }, ...over });
  const select = (current: Parameters<typeof decideBundleSelection>[0], b: AdjustmentBundle, over: { manifest?: unknown; sheet?: Partial<SheetStanding>; expected?: Partial<{ bundleHash: string; version: number }> } = {}) =>
    decideBundleSelection(current, { scope: b.scope, period: b.period, bundle: b, manifest: over.manifest ?? manifestFor(b), sheet: standing(b, over.sheet), actorId: actor.id, at: "2027-02-10T10:00:00.000Z",
      expected: { runId: b.runId, version: b.runVersion, contentHash: b.contentHash, bundleHash: b.bundleHash, ...over.expected } });
  /**
   * The real execution stays blocked until the named rule review: the content computed in the synthetic scope is re-scoped to a real sheet
   * here, for the pure selection decision only (the real chain is covered by the validated integration recipe).
   */
  async function reviewedBundle(edit?: (rows: Rows) => void, revision = 1) {
    const { result } = await execute(edit, revision), core = { ...result.bundle!, scope: { ...scope, mode: "real" as const } };
    const realRun = (state: WorkpaperRun["state"]) => ({ ...sheetRun(result, state, revision), scope: core.scope });
    return { proposed: materializeBundle(core, realRun("executed")), reviewed: materializeBundle(core, realRun("approved")), run: realRun("approved") };
  }
  it("proposé ≠ revu ≠ sélectionné ≠ comptabilisé : quatre états distincts, chacun prouvé par son propre acte", async () => {
    const { proposed, reviewed } = await reviewedBundle();
    expect(proposed.status).toBe("proposed"); expect(reviewed.status).toBe("reviewed"); expect(reviewed.bundleHash).toBe(proposed.bundleHash);
    expect(() => select([], proposed)).toThrow("L16_BUNDLE_NOT_REVIEWED");
    const { selections } = select([], reviewed);
    expect(bundleLifecycle(reviewed, null, null, null)).toEqual({ review: "reviewed", selection: "not_selected", posting: "not_documented" });
    expect(bundleLifecycle(reviewed, selections[0], { status: "current" }, null)).toEqual({ review: "reviewed", selection: "selected", posting: "not_documented" });
    expect(() => documentBundlePosting(selections, { logicalId: reviewed.logicalId, bundleHash: reviewed.bundleHash, citation: null, actorId: actor.id, at: "2027-03-01T09:00:00.000Z" })).toThrow("L16_CITATION_INVALID");
    const posting = documentBundlePosting(selections, { logicalId: reviewed.logicalId, bundleHash: reviewed.bundleHash, citation: manifestFor(reviewed).citation, actorId: actor.id, at: "2027-03-01T09:00:00.000Z" });
    expect(bundleLifecycle(reviewed, selections[0], { status: "current" }, posting).posting).toBe("documented");
  });
  it("double sélection rejouée sans doubler ; base contenant déjà le retraitement, base inconnue, mauvaise période : refus motivés", async () => {
    const { reviewed } = await reviewedBundle();
    const first = select([], reviewed), again = select(first.selections, reviewed);
    expect(again).toMatchObject({ effect: "replayed" }); expect(again.selections).toHaveLength(1);
    expect(() => select([], reviewed, { manifest: manifestFor(reviewed, { includedAdjustments: { kind: "declared", identities: ["ifrs16:lease:F03"] } }) })).toThrow("L16_BUNDLE_ALREADY_INCLUDED");
    expect(() => select([], reviewed, { manifest: manifestFor(reviewed, { includedAdjustments: { kind: "unknown", reason: "Base reçue d'un tiers sans liste des retraitements" } }) })).toThrow("L16_BASE_UNKNOWN");
    expect(() => select([], reviewed, { manifest: manifestFor(reviewed, { period: { startDate: "2025-01-01", closingDate: "2025-12-31" } }) })).toThrow("L16_PERIOD_MISMATCH");
  });
  it("source remplacée après revue : la sélection est à réexaminer, une nouvelle sélection est refusée ; une révision remplace la lignée sans s'ajouter", async () => {
    const { reviewed } = await reviewedBundle();
    const { selections } = select([], reviewed);
    expect(selectionStanding(selections[0], standing(reviewed, { sourcesCurrent: false }))).toEqual({ status: "to_reexamine", reasons: ["source remplacée ou ajoutée"] });
    expect(() => select([], reviewed, { sheet: { sourcesCurrent: false } })).toThrow("L16_BUNDLE_STALE");
    const next = await reviewedBundle(r => { r.lease_ledger.find(l => l.key === "GL-613-F03-2026")!.details.fields = { account: "613500", periodStart: "2026-01-01", periodEnd: "2026-12-31", piece: "OD-2026-12-CORRIGEE" }; }, 2);
    const replaced = select(selections, next.reviewed);
    expect(replaced).toMatchObject({ effect: "replaced", replaced: { runId: "sheet-r1" } });
    expect(replaced.selections.map(s => s.runId)).toEqual(["sheet-r2"]);
  });
  it("lecture concurrente discordante : une version ou une empreinte lue avant un changement est refusée ; le retrait vise la version lue", async () => {
    const { reviewed } = await reviewedBundle();
    expect(() => select([], reviewed, { expected: { version: reviewed.runVersion - 1 } })).toThrow("L16_BUNDLE_STALE");
    // The sheet changed between the read and the decision: its content hash is no longer the one the bundle was materialized from.
    expect(() => select([], reviewed, { sheet: { contentHash: "c".repeat(64) } })).toThrow("L16_BUNDLE_STALE");
    const { selections } = select([], reviewed);
    expect(() => withdrawBundleSelection(selections, reviewed.logicalId, { runId: reviewed.runId, bundleHash: "0".repeat(64) })).toThrow("L16_BUNDLE_STALE");
    expect(withdrawBundleSelection(selections, reviewed.logicalId, { runId: reviewed.runId, bundleHash: reviewed.bundleHash })).toEqual([]);
  });
  it("contrat IFRS 18 : seules les contributions au résultat de l'exercice sortent, avec les identités couvertes ; jamais une composante de bilan", async () => {
    const { reviewed } = await reviewedBundle();
    const { selections } = select([], reviewed);
    const feed = ifrs16ResultFeed(reviewed, selections[0], { status: "current" });
    expect(feed).toMatchObject({ schemaVersion: "ifrs16-feed-1", identities: ["ifrs16:lease:F01", "ifrs16:lease:F03"], taxStatus: "not_computed" });
    expect(new Set(feed.resultContributions.map(c => c.nature))).toEqual(new Set(["lease_interest_expense", "rou_depreciation_expense", "pcg_rent_neutralized"]));
    expect(JSON.stringify(feed)).not.toMatch(/rou_gross|lease_liability|opening_equity_effect/);
    expect(() => ifrs16ResultFeed(reviewed, null, { status: "current" })).toThrow("L16_BUNDLE_NOT_SELECTED");
    expect(() => ifrs16ResultFeed(reviewed, selections[0], { status: "to_reexamine", reasons: ["source remplacée ou ajoutée"] })).toThrow("L16_BUNDLE_STALE");
    expect(() => ifrs16ResultFeed(reviewed, { ...selections[0], base: { ...selections[0].base, includedAdjustments: { kind: "unknown", reason: "x" } } }, { status: "current" })).toThrow("L16_BASE_UNKNOWN");
  });
  it("scénario synthétique : jamais sélectionnable pour une base réelle", async () => {
    const { result } = await execute();
    const demoReviewed = materializeBundle(result.bundle!, sheetRun(result, "approved"));
    expect(() => decideBundleSelection([], { scope: { ...scope, mode: "real" }, period: demoReviewed.period, bundle: demoReviewed, manifest: manifestFor(demoReviewed), sheet: standing(demoReviewed), actorId: actor.id, at: "2027-02-10T10:00:00.000Z",
      expected: { runId: demoReviewed.runId, version: demoReviewed.runVersion, contentHash: demoReviewed.contentHash, bundleHash: demoReviewed.bundleHash } })).toThrow("WORKPAPER_SCOPE_MISMATCH");
  });
});
/** Shift a 2026 due date to the same month of 2025, at its month end. */
function shift(date: string) { const y = Number(date.slice(0, 4)) - 1, m = Number(date.slice(5, 7)); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
