import { describe, expect, it } from "vitest";
import { leaseDemoView } from "../lease-demo";
import type { LeaseResult } from "../lease-review";
import { contentHash, type WorkpaperRun } from "../model";
import type { ResolvedCitation } from "../closing-contract";
import { decide } from "../closing-decide";
import { evaluateClosing } from "../closing-evaluate";
import { decideIfrsPosting, observeFramework, projectIfrsWorks } from "../closing-ifrs";
import { emptyState, eventHash, fold, GENESIS_HASH, type ClosingEvent, type ClosingState } from "../closing-journal";

/**
 * L16-05 — « Travaux IFRS » du dossier de clôture : sélection d'un retraitement revu pour une base déclarée, retrait, comptabilisation documentée.
 * Feuille du scénario synthétique ramenée au périmètre réel du dossier ; le journal est replié depuis des événements chaînés, comme au serveur.
 */
const AT = "2027-02-20T10:00:00.000Z", ACTOR = "local-owner";
async function sheet(state: WorkpaperRun["state"] = "approved", over: Partial<WorkpaperRun> = {}) {
  const view = await leaseDemoView(), demo = view.runs[0], scope = { ...demo.scope, mode: "real" as const }, result = demo.result!.result as LeaseResult;
  const real = { ...result, scope, bundle: { ...result.bundle!, scope } };
  const run: WorkpaperRun = { ...demo, scope, state, result: { ...demo.result!, result: real } as WorkpaperRun["result"],
    ...(["approved", "locked"].includes(state) ? { approval: { actorId: ACTOR, snapshotHash: "0".repeat(64), note: "Relecture", at: AT, version: demo.version, kind: "personal" as const, reviewerName: "Camille Martin (exemple)" } } : {}), ...over };
  return { run, scope };
}
/** Journal replié depuis des événements chaînés : ouverture du dossier sur l'exercice de la feuille, puis les décisions données. */
function journal(decisions: { type: ClosingEvent["type"]; payload: Record<string, unknown> }[], period = { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-02-15", currency: "EUR", validation: "provisional" }) {
  const events: ClosingEvent[] = [];
  for (const d of [{ type: "open" as const, payload: { period, entity: "LOCATIONS SAS (synthétique)" } }, ...decisions]) {
    const base = { seq: events.length + 1, id: "e" + (events.length + 1), type: d.type, actorId: ACTOR, at: AT, payload: d.payload, prevHash: events.at(-1)?.hash ?? GENESIS_HASH };
    events.push({ ...base, hash: eventHash(base) });
  }
  return fold(events);
}
const base = { includedAdjustments: { kind: "declared" as const, identities: [] }, limits: "Base PCG de l'exercice ; pont partiel limité au retraitement IFRS 16" };
const select = (run: WorkpaperRun, s: ClosingState, over: Record<string, unknown> = {}) => ({ command: "select_ifrs_bundle" as const, expectedSeq: s.seq, procedure: "ifrs16.leases" as const, rootId: run.rootId, runId: run.id,
  version: run.version, contentHash: contentHash(run), bundleHash: observeFramework([{ run }], () => true)[0].bundle!.bundleHash, base, ...over });
const ctx = (sheets: ReturnType<typeof observeFramework>, scope: WorkpaperRun["scope"]) => ({ actorId: ACTOR, at: AT, closingAuthority: false, observations: [], framework: sheets, scope });

describe("L16-05 travaux IFRS du dossier de clôture", () => {
  it("sélection d'une version revue : manifeste complété par le serveur, section propre, aucun ajout aux anomalies ni aux effets C05", async () => {
    const { run, scope } = await sheet(), sheets = observeFramework([{ run }], () => true), s = journal([]);
    const decision = decide(s, select(run, s), ctx(sheets, scope));
    expect(decision.payload).toMatchObject({ effect: "selected", selection: { logicalId: "ifrs16.leases:" + run.rootId, runId: run.id, base: { baseKind: "PCG", declaredBy: ACTOR, declaredAt: AT,
      citation: { fileName: expect.any(String), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) } } } });
    const after = journal([decision]), works = projectIfrsWorks(sheets, after);
    expect(works.lineages[0]).toMatchObject({ selection: { status: "selectionne", reasons: [] }, posting: { status: "non_documentee" }, toDecide: false, bundle: { status: "reviewed", taxStatus: "not_computed" } });
    expect(works.denominators).toEqual({ lineages: 1, reviewed: 1, selected: 1, toReexamine: 0, postingsDocumented: 0 });
    const withIfrs = evaluateClosing(after, [], undefined, sheets), without = evaluateClosing(journal([]), [], undefined, []);
    expect(withIfrs.misstatements).toEqual(without.misstatements);
    expect(withIfrs.events).toEqual(without.events);
    expect(withIfrs.blockers).toEqual(without.blockers);
    // The same selection replayed changes nothing: one selection, no amount doubled.
    const replay = decide(after, select(run, after), ctx(sheets, scope));
    expect(replay.payload).toMatchObject({ effect: "replayed" });
    expect(journal([decision, replay]).ifrs.selections).toHaveLength(1);
  });

  it("refus motivés : feuille non revue, version lue périmée, base inconnue ou déjà retraitée, autre exercice, scénario, feuille inconnue", async () => {
    const executed = await sheet("executed"), s = journal([]);
    expect(() => decide(s, select(executed.run, s), ctx(observeFramework([{ run: executed.run }], () => true), executed.scope))).toThrow("L16_BUNDLE_NOT_REVIEWED");
    const { run, scope } = await sheet(), sheets = observeFramework([{ run }], () => true);
    expect(() => decide(s, select(run, s, { version: run.version - 1 }), ctx(sheets, scope))).toThrow("L16_BUNDLE_STALE");
    expect(() => decide(s, select(run, s), ctx(observeFramework([{ run }], () => false), scope))).toThrow("L16_BUNDLE_STALE");
    expect(() => decide(s, select(run, s, { base: { ...base, includedAdjustments: { kind: "unknown", reason: "Base non examinée" } } }), ctx(sheets, scope))).toThrow("L16_BASE_UNKNOWN");
    expect(() => decide(s, select(run, s, { base: { ...base, includedAdjustments: { kind: "declared", identities: ["ifrs16:lease:F03"] } } }), ctx(sheets, scope))).toThrow("L16_BUNDLE_ALREADY_INCLUDED");
    const other = journal([], { startDate: "2027-01-01", closingDate: "2027-12-31", asOfDate: "2028-02-15", currency: "EUR", validation: "provisional" });
    expect(() => decide(other, select(run, other), ctx(sheets, scope))).toThrow("L16_PERIOD_MISMATCH");
    expect(() => decide(s, select(run, s), ctx(sheets, { ...scope, mode: "demo" }))).toThrow("WORKPAPER_SCOPE_MISMATCH");
    expect(() => decide(s, select(run, s, { runId: "AUTRE" }), ctx(sheets, scope))).toThrow("L16_NOT_FOUND");
  });

  it("source remplacée ou révision après sélection : la sélection est conservée et dite à réexaminer ; le retrait vise la version lue", async () => {
    const { run, scope } = await sheet(), sheets = observeFramework([{ run }], () => true), s = journal([]), selected = decide(s, select(run, s), ctx(sheets, scope)), after = journal([selected]);
    const stale = projectIfrsWorks(observeFramework([{ run }], () => false), after).lineages[0];
    expect(stale.selection).toMatchObject({ status: "a_reexaminer", reasons: ["source remplacée ou ajoutée"] });
    const revised = { ...run, id: run.id + "-r2", revision: 2, state: "draft" as const, result: undefined, approval: undefined };
    const works = projectIfrsWorks(observeFramework([{ run }, { run: revised }], () => true), after);
    expect(works.lineages[0]).toMatchObject({ runId: revised.id, revision: 2, selection: { status: "a_reexaminer", reasons: ["révision remplacée"] }, previous: [{ runId: run.id, revision: 1 }] });
    expect(works.denominators.toReexamine).toBe(1);
    const bundleHash = sheets[0].bundle!.bundleHash;
    expect(() => decide(after, { command: "withdraw_ifrs_bundle", expectedSeq: after.seq, rootId: run.rootId, runId: run.id, bundleHash: "f".repeat(64) }, ctx(sheets, scope))).toThrow("L16_BUNDLE_STALE");
    const withdrawn = journal([selected, decide(after, { command: "withdraw_ifrs_bundle", expectedSeq: after.seq, rootId: run.rootId, runId: run.id, bundleHash }, ctx(sheets, scope))]);
    expect(withdrawn.ifrs.selections).toEqual([]);
    expect(projectIfrsWorks(sheets, withdrawn).lineages[0]).toMatchObject({ selection: { status: "non_selectionne" }, toDecide: true });
  });

  it("verrouillée et sélectionnée ne vaut pas comptabilisée : seule une pièce citée pour la version sélectionnée la documente", async () => {
    const { run, scope } = await sheet("locked"), sheets = observeFramework([{ run }], () => true), s = journal([]);
    const selected = decide(s, select(run, s), ctx(sheets, scope)), after = journal([selected]), bundleHash = sheets[0].bundle!.bundleHash;
    expect(projectIfrsWorks(sheets, after).lineages[0]).toMatchObject({ state: "locked", selection: { status: "selectionne" }, posting: { status: "non_documentee" } });
    const piece: ResolvedCitation = { pieceVersionId: "PC-1-v1", pieceId: "PC-1", version: 1, fileName: "ecritures-erp.csv", label: "Écritures ERP", sha256: "a".repeat(64), kind: "document" };
    expect(() => decideIfrsPosting(journal([]), { rootId: run.rootId, bundleHash, text: "Passées", citations: [{ pieceVersionId: "PC-1-v1" }] }, () => piece)).toThrow("L16_NOT_FOUND");
    expect(() => decideIfrsPosting(after, { rootId: run.rootId, bundleHash: "e".repeat(64), text: "Passées", citations: [{ pieceVersionId: "PC-1-v1" }] }, () => piece)).toThrow("L16_BUNDLE_STALE");
    const posting = decideIfrsPosting(after, { rootId: run.rootId, bundleHash, text: "Écritures passées dans l'ERP", citations: [{ pieceVersionId: "PC-1-v1" }] }, () => piece);
    const documented = journal([selected, { type: "document_ifrs_posting", payload: posting as unknown as Record<string, unknown> }]);
    expect(projectIfrsWorks(sheets, documented).lineages[0].posting).toMatchObject({ status: "documentee", citations: ["ecritures-erp.csv v1"], by: ACTOR });
    expect(emptyState().ifrs).toEqual({ selections: [], postings: {} });
  });
});
