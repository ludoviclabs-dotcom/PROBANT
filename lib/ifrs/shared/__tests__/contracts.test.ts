import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contentHash, periodId, type WorkpaperRun, type WorkpaperScope } from "@/lib/workpapers/model";
import { assertIfrsContext, frameworkBlockers } from "../context";
import { assertManifestFor, leaseIdentity, type PreparationManifest } from "../manifest";
import { assertAdjustmentBundle, assertBundleCore, bundleHashOf, materializeBundle, type AdjustmentBundle, type AdjustmentBundleCore } from "../bundle";
import { decideBundleSelection, selectionStanding, withdrawBundleSelection, type SheetStanding } from "../selection";
import { compareFingerprints, dependencyFingerprint, type LeaseDependencies } from "../fingerprint";
import { leaseRuleBasisSchema } from "../rule-basis";
import { LEASE_RULE_BASIS, leaseRuleBasis } from "@/lib/ifrs/leases/rule";
import { LEASE_ENGINE_VERSION } from "@/lib/ifrs/leases/engine";

/** C01 — contrats communs : contexte, manifeste de base, retraitement, sélection et empreintes de dépendances. */
const period = { startDate: "2027-01-01", closingDate: "2027-12-31", asOfDate: "2028-02-15", currency: "EUR" as const, validation: "provisional" as const };
const scope: WorkpaperScope = { organizationId: "org-a", dossierId: "dossier-a", periodId: periodId(period), mode: "real" };
const framework = { standard: "IFRS 16" as const, jurisdiction: "IASB" as const, edition: "IFRS 16, IASB 2026", editionFingerprint: null };
const firstApplication = { kind: "not_applicable" as const, reason: "Entité déjà sous IFRS 16 ; aucune méthode de transition choisie par l'outil" };
const sourceRefs = [{ importId: "import-ledger", documentVersionId: "doc-ledger", sha256: "a".repeat(64) }];
const citation = { documentVersionId: "doc-ledger", importId: "import-ledger", fileName: "grand-livre.csv", sha256: "a".repeat(64), row: 2 };
const manifest = (over: Partial<PreparationManifest> = {}): PreparationManifest => ({ baseKind: "PCG", sourceRefs, period: { startDate: period.startDate, closingDate: period.closingDate },
  includedAdjustments: { kind: "declared", identities: [] }, declaredBy: "preparer", declaredAt: "2028-02-01T10:00:00.000Z", limits: "Grand livre PCG du dossier ; ne certifie aucun traitement IFRS", citation, ...over });

type OracleClosing = { closing: string; periodStart: string; status: string; bundle: { account: string; amount: string; side: string }[]; resultContributions: Record<string, string> | null };
const oracle = JSON.parse(readFileSync(resolve(__dirname, "../../../../docs/ifrs/recette/attendus_l16.json"), "utf8")) as { fixtures: { id: string; closings: OracleClosing[] }[] };
const NATURE: Record<string, string> = { rou_gross: "recognition", rou_accumulated_depreciation: "depreciation", lease_liability: "recognition", lease_interest_expense: "interest", rou_depreciation_expense: "depreciation", pcg_rent_neutralized: "rent_neutralization", opening_equity_effect: "opening_effect" };
const coreFrom = (contractId: string, c: OracleClosing, rootId = "workpaper-root"): AdjustmentBundleCore => ({
  schemaVersion: "ifrs-bundle-1", kind: "closing_adjustment", logicalId: "ifrs16.leases:" + rootId, revision: 1, runId: rootId, scope, period: { startDate: c.periodStart, closingDate: c.closing },
  expectedBase: { baseKind: "PCG", sourceRefs }, identities: [leaseIdentity(contractId)],
  lines: c.bundle.map(l => ({ account: l.account as AdjustmentBundleCore["lines"][number]["account"], side: l.side as "debit" | "credit", amount: { amount: l.amount, currency: "EUR" as const }, contractId, contractVersion: "v1", nature: NATURE[l.account] as AdjustmentBundleCore["lines"][number]["nature"], evidence: [] })),
  resultContributions: Object.entries(c.resultContributions ?? {}).map(([nature, amount]) => ({ contractId, nature: nature as AdjustmentBundleCore["resultContributions"][number]["nature"], amount: { amount, currency: "EUR" as const } })),
  taxStatus: "not_computed",
});
const f03 = oracle.fixtures.find(f => f.id === "L16-F03")!.closings[0];
const run = (over: Partial<WorkpaperRun> = {}) => ({ id: "workpaper-root", rootId: "workpaper-root", revision: 1, version: 9, schemaVersion: "1.0.0", scope, period, state: "approved",
  template: { id: "ifrs16.leases", version: "0.1.0", objective: "Locations", kind: "calculated", assertions: [], requiredDocumentTypes: [] }, preparedBy: "preparer", importIds: [], evidence: [], findings: [], notes: [], events: [], ...over }) as WorkpaperRun;
const reviewed = (core = coreFrom("F03", f03), r = run()) => materializeBundle(core, r);
const sheet = (b: AdjustmentBundle, over: Partial<SheetStanding> = {}): SheetStanding => ({ runId: b.runId, rootId: "workpaper-root", revision: b.revision, version: b.runVersion, state: "approved", contentHash: b.contentHash, latestRevision: true, sourcesCurrent: true, ruleCurrent: true, ...over });
const request = (b: AdjustmentBundle, over: { sheet?: Partial<SheetStanding>; manifest?: unknown; expected?: Partial<{ runId: string; version: number; contentHash: string; bundleHash: string }> } = {}) => ({
  scope, period: { startDate: period.startDate, closingDate: period.closingDate }, bundle: b, manifest: over.manifest ?? manifest(), sheet: sheet(b, over.sheet), actorId: "preparer", at: "2028-02-10T09:00:00.000Z",
  expected: { runId: b.runId, version: b.runVersion, contentHash: b.contentHash, bundleHash: b.bundleHash, ...over.expected } });

describe("C01 contexte IFRS", () => {
  const context = { scope, period, framework, firstApplication };
  it("admet le contexte du périmètre serveur et refuse un autre dossier, une autre organisation, un autre mode ou un autre exercice", () => {
    expect(assertIfrsContext(scope, context).framework.jurisdiction).toBe("IASB");
    for (const key of ["organizationId", "dossierId"] as const) expect(() => assertIfrsContext(scope, { ...context, scope: { ...scope, [key]: "autre" } })).toThrow("WORKPAPER_SCOPE_MISMATCH");
    expect(() => assertIfrsContext(scope, { ...context, scope: { ...scope, mode: "demo" } })).toThrow("WORKPAPER_SCOPE_MISMATCH");
    const other = { ...period, startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-02-15" };
    expect(() => assertIfrsContext(scope, { ...context, period: other })).toThrow("WORKPAPER_PERIOD_INVALID");
  });
  it("refuse une juridiction hors liste, une norme autre qu'IFRS 16 ou une méthode de transition", () => {
    expect(() => assertIfrsContext(scope, { ...context, framework: { ...framework, jurisdiction: "FR" } })).toThrow("L16_REQUEST_INVALID");
    expect(() => assertIfrsContext(scope, { ...context, framework: { ...framework, standard: "IFRS 18" } })).toThrow("L16_REQUEST_INVALID");
    expect(() => assertIfrsContext(scope, { ...context, firstApplication: { kind: "modified_retrospective", reason: "x" } })).toThrow("L16_REQUEST_INVALID");
    expect(() => assertIfrsContext(scope, { ...context, period: { ...period, closingDate: "2027-02-30" } })).toThrow("L16_REQUEST_INVALID");
  });
  it("X33 : EU_adopted n'est pas activable en réel tant que le texte UE n'est pas lu ; aucun blocage en scénario ni pour l'IASB", () => {
    expect(frameworkBlockers({ ...framework, jurisdiction: "EU_adopted" }, "real")).toEqual([expect.stringContaining("X33")]);
    expect(frameworkBlockers({ ...framework, jurisdiction: "EU_adopted" }, "demo")).toEqual([]);
    expect(frameworkBlockers(framework, "real")).toEqual([]);
  });
});

describe("C01 fiche de règle", () => {
  it("la fiche reste à revoir tant que la relecture nommée n'est pas consignée ; une fiche validée exige un relecteur nommé et daté", () => {
    expect(LEASE_RULE_BASIS).toMatchObject({ status: "review_required", ruleVersion: "1.0.0", engineVersion: LEASE_ENGINE_VERSION, jurisdiction: "IASB" });
    expect(LEASE_RULE_BASIS.paragraphs).toContain("B9-B33");
    expect(LEASE_RULE_BASIS.referenceCases).toHaveLength(10); expect(LEASE_RULE_BASIS.exclusions).toHaveLength(34);
    const review = { reviewedBy: "Personne de test", reviewedAt: "2026-11-02T10:00:00.000Z", jurisdiction: "IASB" as const, confirmations: { wordByWordParagraphs: true as const, b9ToB33: true as const, internalPoliciesAccepted: true as const, referenceCasesExamined: true as const } };
    expect(leaseRuleBasis(review)).toMatchObject({ status: "validated", reviewedBy: "Personne de test" });
    expect(LEASE_RULE_BASIS.reviewedBy).toBeUndefined();
    expect(() => leaseRuleBasisSchema.parse({ ...LEASE_RULE_BASIS, status: "validated" })).toThrow(/L16_RULE_REVIEW_REQUIRED/);
    expect(() => leaseRuleBasisSchema.parse({ ...LEASE_RULE_BASIS, reviewedBy: "Camille Martin" })).toThrow(/L16_RULE_REVIEW_INCONSISTENT/);
  });
});

describe("C01 manifeste de base", () => {
  const expected = { baseKind: "PCG" as const, sourceRefs, period: { startDate: period.startDate, closingDate: period.closingDate } };
  it("admet la base PCG attendue ; refuse une base inconnue, une autre base, d'autres sources ou un autre exercice", () => {
    expect(assertManifestFor(manifest(), expected).baseKind).toBe("PCG");
    expect(() => assertManifestFor(manifest({ includedAdjustments: { kind: "unknown", reason: "Retraitements du reporting non listés" } }), expected)).toThrow("L16_BASE_UNKNOWN");
    expect(() => assertManifestFor(manifest({ baseKind: "IFRS_prepared" }), expected)).toThrow("L16_BASE_MISMATCH");
    expect(() => assertManifestFor(manifest({ sourceRefs: [{ ...sourceRefs[0], sha256: "b".repeat(64) }] }), expected)).toThrow("L16_BASE_MISMATCH");
    expect(() => assertManifestFor(manifest({ period: { startDate: "2027-01-01", closingDate: "2027-06-30" } }), expected)).toThrow("L16_PERIOD_MISMATCH");
  });
  it("refuse une identité en double, une source en double, une limite vide ou un horodatage non ISO", () => {
    expect(() => assertManifestFor(manifest({ includedAdjustments: { kind: "declared", identities: ["ifrs16:lease:A", "ifrs16:lease:A"] } }), expected)).toThrow("L16_REQUEST_INVALID");
    expect(() => assertManifestFor(manifest({ sourceRefs: [sourceRefs[0], sourceRefs[0]] }), expected)).toThrow("L16_REQUEST_INVALID");
    expect(() => assertManifestFor(manifest({ limits: " " }), expected)).toThrow("L16_REQUEST_INVALID");
    expect(() => assertManifestFor(manifest({ declaredAt: "01/02/2028" }), expected)).toThrow("L16_REQUEST_INVALID");
    expect(() => leaseIdentity("contrat avec espace")).toThrow("L16_CONTRACT_INVALID");
  });
});

describe("C01 retraitement : contenu et invariants", () => {
  it("chaque retraitement calculé par l'oracle est équilibré et ses contributions concordent avec ses lignes", () => {
    let checked = 0;
    for (const f of oracle.fixtures) for (const c of f.closings.filter(x => x.status === "computed")) { assertBundleCore(coreFrom(f.id.replace("L16-", ""), c)); checked++; }
    expect(checked).toBe(17);
  });
  it("refuse un déséquilibre, un montant nul ou négatif, une contribution différente ou absente, une identité non triée ou une ligne de trésorerie", () => {
    const core = coreFrom("F03", f03);
    expect(() => assertBundleCore({ ...core, lines: core.lines.map((l, i) => i === 0 ? { ...l, amount: { amount: "33421.28", currency: "EUR" } } : l) })).toThrow("L16_BUNDLE_UNBALANCED");
    expect(() => assertBundleCore({ ...core, lines: [...core.lines, { ...core.lines[0], amount: { amount: "0.00", currency: "EUR" } }] })).toThrow("L16_BUNDLE_INVALID");
    expect(() => assertBundleCore({ ...core, lines: core.lines.map((l, i) => i === 0 ? { ...l, amount: { amount: "-33421.27", currency: "EUR" } } : l) })).toThrow("L16_BUNDLE_INVALID");
    expect(() => assertBundleCore({ ...core, resultContributions: core.resultContributions.map(c => c.nature === "lease_interest_expense" ? { ...c, amount: { amount: "1398.49", currency: "EUR" } } : c) })).toThrow("L16_BUNDLE_INVALID");
    expect(() => assertBundleCore({ ...core, resultContributions: core.resultContributions.filter(c => c.nature !== "pcg_rent_neutralized") })).toThrow("L16_BUNDLE_INVALID");
    expect(() => assertBundleCore({ ...core, identities: ["ifrs16:lease:F03", "ifrs16:lease:F99"] })).toThrow("L16_BUNDLE_INVALID");
    expect(() => assertBundleCore({ ...core, lines: [...core.lines, { ...core.lines[0], account: "bank" }] })).toThrow("L16_BUNDLE_INVALID");
    expect(() => assertBundleCore({ ...core, lines: core.lines.map(l => l.account === "lease_interest_expense" ? { ...l, nature: "recognition" } : l) })).toThrow("L16_BUNDLE_INVALID");
    expect(() => assertBundleCore({ ...core, taxStatus: "computed" })).toThrow("L16_BUNDLE_INVALID");
  });
  it("deux contrats : l'équilibre est exigé par contrat, pas seulement au total", () => {
    const a = coreFrom("A", f03), b = coreFrom("B", f03);
    const both = { ...a, identities: ["ifrs16:lease:A", "ifrs16:lease:B"], lines: [...a.lines, ...b.lines], resultContributions: [...a.resultContributions, ...b.resultContributions] };
    expect(assertBundleCore(both).identities).toHaveLength(2);
    const shifted = both.lines.map((l, i) => i === 0 ? { ...l, amount: { amount: "33421.28", currency: "EUR" as const } } : l.contractId === "B" && l.account === "rou_gross" ? { ...l, amount: { amount: "33421.26", currency: "EUR" as const } } : l);
    expect(() => assertBundleCore({ ...both, lines: shifted })).toThrow("L16_BUNDLE_UNBALANCED");
  });
  it("matérialisation : empreinte de contenu stable de l'approbation au verrouillage, statut revu seulement après revue, contenu altéré refusé", () => {
    const approved = reviewed(), locked = reviewed(coreFrom("F03", f03), run({ state: "locked", version: 10 }));
    expect(approved.status).toBe("reviewed"); expect(locked.bundleHash).toBe(approved.bundleHash); expect(locked.contentHash).toBe(approved.contentHash);
    expect(reviewed(coreFrom("F03", f03), run({ state: "executed", version: 5 })).status).toBe("proposed");
    expect(approved.contentHash).toBe(contentHash(run()));
    expect(assertAdjustmentBundle(approved)).toEqual(approved);
    expect(() => assertAdjustmentBundle({ ...approved, lines: [...approved.lines].reverse(), bundleHash: approved.bundleHash })).toThrow("L16_BUNDLE_INVALID");
    expect(() => materializeBundle({ ...coreFrom("F03", f03), runId: "autre" }, run())).toThrow("L16_BUNDLE_INVALID");
    expect(bundleHashOf(coreFrom("F03", f03))).toBe(approved.bundleHash);
  });
});

describe("C01 sélection du retraitement", () => {
  it("sélectionne, rejoue sans doubler, puis remplace par une nouvelle version de la même lignée", () => {
    const b = reviewed(), first = decideBundleSelection([], request(b));
    expect(first.effect).toBe("selected"); expect(first.selections).toHaveLength(1);
    const replay = decideBundleSelection(first.selections, request(b));
    expect(replay.effect).toBe("replayed"); expect(replay.selections).toEqual(first.selections);
    const lockedOnly = reviewed(coreFrom("F03", f03), run({ state: "locked", version: 10 }));
    expect(decideBundleSelection(first.selections, request(lockedOnly, { sheet: { state: "locked" } })).effect).toBe("replayed");
    const b2 = materializeBundle({ ...coreFrom("F03", f03), runId: "workpaper-root:r2", revision: 2 }, run({ id: "workpaper-root:r2", revision: 2, version: 7, conclusion: "Révision" }));
    const replaced = decideBundleSelection(first.selections, request(b2));
    expect(replaced.effect).toBe("replaced"); expect(replaced.selections).toHaveLength(1); expect(replaced.selections[0].runId).toBe("workpaper-root:r2"); expect(replaced.replaced?.runId).toBe("workpaper-root");
  });
  it("refuse une feuille non revue, une version ou une empreinte différente, une révision remplacée, une source ou une règle remplacée", () => {
    const b = reviewed();
    expect(() => decideBundleSelection([], request(b, { sheet: { state: "executed" } }))).toThrow("L16_BUNDLE_NOT_REVIEWED");
    expect(() => decideBundleSelection([], request(reviewed(coreFrom("F03", f03), run({ state: "awaiting_review" }))))).toThrow("L16_BUNDLE_NOT_REVIEWED");
    expect(() => decideBundleSelection([], request(b, { expected: { version: b.runVersion - 1 } }))).toThrow("L16_BUNDLE_STALE");
    expect(() => decideBundleSelection([], request(b, { expected: { bundleHash: "c".repeat(64) } }))).toThrow("L16_BUNDLE_STALE");
    expect(() => decideBundleSelection([], request(b, { sheet: { contentHash: "d".repeat(64) }, expected: { contentHash: "d".repeat(64) } }))).toThrow("L16_BUNDLE_STALE");
    expect(() => decideBundleSelection([], request(b, { sheet: { latestRevision: false } }))).toThrow("L16_BUNDLE_STALE");
    expect(() => decideBundleSelection([], request(b, { sheet: { sourcesCurrent: false } }))).toThrow("L16_BUNDLE_STALE");
    expect(() => decideBundleSelection([], request(b, { sheet: { ruleCurrent: false } }))).toThrow("L16_BUNDLE_STALE");
  });
  it("refuse une base qui inclut déjà le contrat, une autre lignée sur le même contrat, une base inconnue ou un autre exercice", () => {
    const b = reviewed();
    expect(() => decideBundleSelection([], request(b, { manifest: manifest({ includedAdjustments: { kind: "declared", identities: ["ifrs16:lease:F03"] } }) }))).toThrow("L16_BUNDLE_ALREADY_INCLUDED");
    expect(() => decideBundleSelection([], request(b, { manifest: manifest({ includedAdjustments: { kind: "unknown", reason: "Non listés" } }) }))).toThrow("L16_BASE_UNKNOWN");
    expect(() => decideBundleSelection([], request(b, { manifest: manifest({ baseKind: "partial_bridge" }) }))).toThrow("L16_BASE_MISMATCH");
    const otherRoot = materializeBundle(coreFrom("F03", f03, "workpaper-other"), run({ id: "workpaper-other", rootId: "workpaper-other" }));
    const first = decideBundleSelection([], request(b)).selections;
    expect(() => decideBundleSelection(first, { ...request(otherRoot), sheet: { ...sheet(otherRoot), rootId: "workpaper-other" } })).toThrow("L16_BUNDLE_ALREADY_INCLUDED");
    const late = { ...request(b), period: { startDate: "2027-01-01", closingDate: "2027-06-30" } };
    expect(() => decideBundleSelection([], late)).toThrow("L16_PERIOD_MISMATCH");
  });
  it("refuse un scénario ou un autre dossier, un contenu différent sous la même version, et un retrait d'une sélection absente", () => {
    const demoScope = { ...scope, mode: "demo" as const }, demo = materializeBundle({ ...coreFrom("F03", f03), scope: demoScope }, run({ scope: demoScope }));
    expect(() => decideBundleSelection([], request(demo))).toThrow("WORKPAPER_SCOPE_MISMATCH");
    const b = reviewed(), first = decideBundleSelection([], request(b)).selections;
    expect(() => decideBundleSelection([{ ...first[0], bundleHash: "e".repeat(64) }], request(b))).toThrow("L16_BUNDLE_CONTENT_CONFLICT");
    expect(withdrawBundleSelection(first, b.logicalId)).toEqual([]);
    expect(() => withdrawBundleSelection([], b.logicalId)).toThrow("L16_NOT_FOUND");
  });
  it("source remplacée : seule la sélection de la lignée concernée est à réexaminer ; consulter ne périme rien", () => {
    const a = reviewed(), other = materializeBundle(coreFrom("Z", f03, "workpaper-z"), run({ id: "workpaper-z", rootId: "workpaper-z" }));
    let selections = decideBundleSelection([], request(a)).selections;
    selections = decideBundleSelection(selections, { ...request(other), sheet: { ...sheet(other), rootId: "workpaper-z" } }).selections;
    const sheets: Record<string, SheetStanding> = { [a.logicalId]: sheet(a, { sourcesCurrent: false }), [other.logicalId]: { ...sheet(other), rootId: "workpaper-z" } };
    const standing = Object.fromEntries(selections.map(s => [s.logicalId, selectionStanding(s, sheets[s.logicalId])]));
    expect(standing[a.logicalId]).toEqual({ status: "to_reexamine", reasons: ["source remplacée ou ajoutée"] });
    expect(standing[other.logicalId]).toEqual({ status: "current" });
    expect(selectionStanding(selections[0], sheets[selections[0].logicalId])).toEqual(standing[selections[0].logicalId]);
    expect(selectionStanding(selections[0], null)).toEqual({ status: "to_reexamine", reasons: ["feuille introuvable"] });
  });
});

describe("C01 empreintes de dépendances", () => {
  const deps = (over: Partial<LeaseDependencies> = {}): LeaseDependencies => ({
    sources: [{ documentType: "lease_contracts", importId: "i1", documentVersionId: "d1", byteHash: "1".repeat(64), mappingVersion: "ifrs16-leases-1" }, { documentType: "lease_schedule", importId: "i2", documentVersionId: "d2", byteHash: "2".repeat(64), mappingVersion: "ifrs16-leases-1" }],
    policy: { shortTerm: [{ category: "véhicules", elected: true }] }, rule: { id: "ifrs16.leases", version: "0.1.0", basisStatus: "review_required" },
    contracts: { A: { payment: "1000.00" }, B: { payment: "2000.00" } }, ...over });
  it("même contenu, même empreinte : recalculer ou consulter ne change rien", () => expect(dependencyFingerprint(deps())).toEqual(dependencyFingerprint(deps())));
  it("un contrat modifié ne touche que ce contrat ; une politique ou une règle modifiée touche tous les contrats", () => {
    const base = dependencyFingerprint(deps());
    expect(compareFingerprints(base, dependencyFingerprint(deps({ contracts: { A: { payment: "1000.00" }, B: { payment: "2100.00" } } })))).toMatchObject({ unchanged: false, components: [], changedContracts: ["B"], identicalContracts: ["A"] });
    expect(compareFingerprints(base, dependencyFingerprint(deps({ policy: { shortTerm: [] } })))).toMatchObject({ components: ["policy"], changedContracts: ["A", "B"], identicalContracts: [] });
    expect(compareFingerprints(base, dependencyFingerprint(deps({ rule: { id: "ifrs16.leases", version: "1.0.0", basisStatus: "review_required" } })))).toMatchObject({ components: ["rule"], changedContracts: ["A", "B"] });
    expect(compareFingerprints(base, dependencyFingerprint(deps({ contracts: { A: { payment: "1000.00" }, C: {} } })))).toMatchObject({ addedContracts: ["C"], removedContracts: ["B"], identicalContracts: ["A"] });
  });
  it("une source remplacée ou un mapping changé est nommé ; deux sources du même type sont refusées", () => {
    const base = dependencyFingerprint(deps()), sources = deps().sources;
    expect(compareFingerprints(base, dependencyFingerprint(deps({ sources: [sources[0], { ...sources[1], importId: "i3", byteHash: "3".repeat(64) }] }))).components).toEqual(["sources"]);
    expect(compareFingerprints(base, dependencyFingerprint(deps({ sources: [sources[0], { ...sources[1], mappingVersion: "ifrs16-leases-2" }] }))).components).toEqual(["mapping"]);
    expect(() => dependencyFingerprint(deps({ sources: [sources[0], { ...sources[0], importId: "i9" }] }))).toThrow("L16_CURRENT_SOURCES_REQUIRED");
  });
});
