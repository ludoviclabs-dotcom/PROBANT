import { LEASE_JURISDICTIONS, LEASE_RULE_BASIS } from "@/lib/ifrs/leases/rule";
import { qualifyLeases } from "@/lib/ifrs/leases/qualification";
import { frameLeases } from "@/lib/ifrs/leases/framing";
import { leasePortfolioView } from "@/lib/ifrs/leases/portfolio";
import { leaseReviewSummary } from "@/lib/ifrs/leases/review-summary";
import { materializeBundle } from "@/lib/ifrs/shared/bundle";
import { leaseReviewPoints, type LeaseResult } from "./lease-review";
import { leaseWorkspaceView } from "@/lib/ifrs/leases/view-model";
import { LEASE_TEMPLATE, LeaseRegistry } from "./lease-adapter";
import { buildLeaseExport, type LeaseExportFormat } from "./lease-export";
import { approvedLeaseBatches, LEASE_PERIOD, leaseDemoRows } from "./lease-fixture";
import { leaseFacts, LEASE_REQUIRED_TYPES } from "./lease-sources";
import { stampLeaseWork } from "./lease-work";
import { contentHash, periodId, type WorkpaperRun, type WorkpaperScope } from "./model";
import type { Principal } from "./policy";
import { freezePopulation, selectPopulation } from "./selection";

/**
 * Scénario synthétique en lecture seule de l'atelier (C02) : « simulation non revue ». Sources fictives, périmètre `demo`, calcul par le
 * même moteur ; rien n'est enregistré, rien n'est sélectionnable pour une base réelle, et la forme de réponse est celle de la lecture réelle.
 */
export const LEASE_DEMO_SCOPE: WorkpaperScope = { organizationId: "SYN-ORG", dossierId: "SYN-LEASES", periodId: periodId(LEASE_PERIOD), mode: "demo" };
const AT = "2027-02-01T09:00:00.000Z";

/** Scénario complet, calculé une fois par lecture : sources, feuille, qualification, cadrage, retraitement. */
async function leaseDemoScenario() {
  const actor: Principal = { id: "Préparateur synthétique", grants: [{ scope: LEASE_DEMO_SCOPE, permissions: ["read", "prepare"] }] };
  const imports = await approvedLeaseBatches(LEASE_DEMO_SCOPE, actor, rows => Object.assign(rows, leaseDemoRows()));
  const work = stampLeaseWork({ framework: { standard: "IFRS 16", jurisdiction: "IASB", edition: "IFRS 16, IASB 2026", editionFingerprint: null },
    firstApplication: { kind: "not_applicable", reason: "Scénario synthétique : entité réputée déjà sous IFRS 16" },
    policies: [{ kind: "short_term_exemption", assetCategory: "Matériel de bureau", answer: { kind: "value", value: "not_elected" } }], confirmations: [] }, () => { throw new Error("L16_CITATION_INVALID"); }, actor.id, AT);
  const runId = "SYN-LEASES-RUN", population = freezePopulation(LEASE_DEMO_SCOPE, imports, "lease_contract", actor, LEASE_PERIOD);
  const selection = selectPopulation(population, { method: "targeted", criteria: "Tous les contrats du registre synthétique", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
  const result = new LeaseRegistry().execute({ scope: LEASE_DEMO_SCOPE, period: LEASE_PERIOD, rule: { id: "ifrs16.leases", version: LEASE_TEMPLATE.version }, imports, population, selection, parameters: { runId, rootId: runId, revision: 1, work } });
  const run: WorkpaperRun = { id: runId, rootId: runId, revision: 1, version: 5, schemaVersion: "1.0.0", scope: LEASE_DEMO_SCOPE, period: LEASE_PERIOD, template: LEASE_TEMPLATE, state: result.execution === "completed" ? "executed" : "blocked",
    preparedBy: actor.id, importIds: imports.map(b => b.id).sort(), population, selection, leaseWork: work, result, evidence: [], findings: [], events: [],
    // Review points generated at execution, as the runtime adds them to a real sheet: one per contract without a determined result or framing.
    notes: result.execution === "completed" ? leaseReviewPoints(result.result as LeaseResult).map(x => ({ id: "lease:" + x.key, kind: "observation" as const, text: x.text, amount: x.amount, authorId: actor.id, blocking: x.blocking })) : [] };
  const facts = leaseFacts(imports), qualification = qualifyLeases(facts, LEASE_PERIOD, work, { id: "ifrs16.leases", version: LEASE_TEMPLATE.version, basisStatus: LEASE_RULE_BASIS.status });
  const framing = frameLeases(qualification, facts.lease_ledger, LEASE_PERIOD), core = result.execution === "completed" ? (result.result as LeaseResult).bundle : null;
  const bundle = core ? materializeBundle(core, run) : null, cited = [...facts.lease_contracts, ...facts.lease_assumptions];
  return { imports, run, result, facts: cited, qualification, framing, bundle };
}

export async function leaseDemoView() {
  const { imports, run, result, facts, qualification, framing, bundle } = await leaseDemoScenario(), runId = run.id;
  const workspace = leaseWorkspaceView({ mode: "demo", run, permissions: [], actorId: null, selfReviewAllowed: false, sourceTypes: imports.map(b => b.document.documentType), requiredTypes: LEASE_REQUIRED_TYPES,
    sourcesCurrent: true, ruleCurrent: true, ruleValidated: LEASE_TEMPLATE.rule!.validation === "validated", qualification, framing });
  return { synthetic: true as const, label: "simulation non revue", actorId: null, permissions: [], executionProfile: null, runs: [run],
    imports: imports.map(b => ({ ...b, rows: b.rows.slice(0, 5), rowCount: b.rows.length })), sourceHeads: imports.map(b => ({ document_type: b.document.documentType, import_id: b.id })),
    sourcesCurrent: { [runId]: true }, ruleCurrent: { [runId]: true }, qualification: { [runId]: qualification }, qualificationIssues: {}, framing: { [runId]: framing }, adjustments: { [runId]: bundle }, portfolio: { [runId]: leasePortfolioView(run, [run], qualification) },
    contentHashes: { [runId]: contentHash(run) },
    review: { [runId]: leaseReviewSummary(run, result.execution === "completed" ? result.result as LeaseResult : null, qualification, facts, bundle) }, workspace: { [runId]: workspace },
    emptyWorkspace: workspace, capability: { engine: "1.0.0", realExecution: LEASE_TEMPLATE.rule!.validation === "validated" ? "allowed" : "blocked_rule_review_required", rule: { id: "ifrs16.leases", version: LEASE_TEMPLATE.version, basisStatus: LEASE_RULE_BASIS.status }, requiredTypes: LEASE_REQUIRED_TYPES, jurisdictions: LEASE_JURISDICTIONS } };
}

/**
 * Export diagnostic du scénario synthétique (L16-05) : mêmes formats et même manifeste que l'export réel, étiqueté « simulation non revue » ;
 * jamais un export revu, rien n'est enregistré.
 */
/** Métadonnées d'émission fixes de l'exemple publié dans docs/ifrs/exemples/l16-05 : hors empreinte métier. */
export const LEASE_EXAMPLE_EMISSION = { exportedAt: "2027-02-20T10:00:00.000Z", exportedBy: "exemple synthétique" };
export async function leaseDemoExport(format: LeaseExportFormat, emission = { exportedAt: new Date().toISOString(), exportedBy: "scénario synthétique" }) {
  const { imports, run, result, facts, qualification, bundle } = await leaseDemoScenario();
  return buildLeaseExport({ run, result: result.execution === "completed" ? result.result as LeaseResult : null, qualification, facts, bundle,
    sources: imports.map(b => ({ importId: b.id, documentVersionId: b.document.id, documentType: b.document.documentType, fileName: b.document.fileName, sha256: b.document.byteHash, rows: b.rows.length, approvedAt: b.approval?.at ?? null })),
    standing: { latestRevision: true, sourcesCurrent: true, ruleCurrent: true }, kind: "diagnostic", format, emission });
}
