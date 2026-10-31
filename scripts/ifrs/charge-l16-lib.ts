import { performance } from "node:perf_hooks";
import { qualifyLeases } from "../../lib/ifrs/leases/qualification";
import { frameLeases } from "../../lib/ifrs/leases/framing";
import { leasePortfolioView } from "../../lib/ifrs/leases/portfolio";
import { leaseReviewSummary } from "../../lib/ifrs/leases/review-summary";
import { LEASE_RULE_BASIS } from "../../lib/ifrs/leases/rule";
import { leaseWorkspaceView } from "../../lib/ifrs/leases/view-model";
import { materializeBundle } from "../../lib/ifrs/shared/bundle";
import type { CalculationRun } from "../../lib/canonical-model/calculation";
import { previewImport, type ImportBatch } from "../../lib/workpapers/imports";
import { inputByReference, LEASE_TEMPLATE, LeaseRegistry } from "../../lib/workpapers/lease-adapter";
import { LEASE_PERIOD, leaseFile, seededLeaseRows, type LeaseRow } from "../../lib/workpapers/lease-fixture";
import { evaluateLeases, leaseReviewPoints, leaseRunEvidence, type LeaseResult } from "../../lib/workpapers/lease-review";
import { leaseFacts, LEASE_MAPPING, LEASE_REQUIRED_TYPES, LEASE_TYPES, type LeaseType } from "../../lib/workpapers/lease-sources";
import { stampLeaseWork } from "../../lib/workpapers/lease-work";
import { contentHash, periodId, type WorkpaperRun, type WorkpaperScope } from "../../lib/workpapers/model";
import type { Principal } from "../../lib/workpapers/policy";
import { freezePopulation, selectPopulation } from "../../lib/workpapers/selection";

/**
 * L16-06 — outils communs des mesures de charge et de capacité de l'atelier Locations (`bench-l16.ts`, `capacite-l16.ts`) : portefeuille
 * synthétique lu par le lecteur réel, feuille exécutée telle que le runtime l'écrit, lecture de l'atelier, octets comptés comme PostgreSQL.
 */
export const MiB = 1024 * 1024;
/** Limits of the shared Clients store and of the tabular reader, as read in clients-runtime.ts, imports.ts and lease-runtime.ts. */
export const LIMITS = { fileBytes: 3 * MiB, parserBytes: 10 * MiB, parserRows: 50_000, previewJsonBytes: 3 * MiB, sourcesBytes: 24 * MiB, versionJsonBytes: 3.5 * MiB, versionsBytes: 24 * MiB, readBytes: 8 * MiB };
export const SCOPE: WorkpaperScope = { organizationId: "BENCH-ORG", dossierId: "BENCH-LEASES", periodId: periodId(LEASE_PERIOD), mode: "demo" };
export const ACTOR: Principal = { id: "Préparateur synthétique", grants: [{ scope: SCOPE, permissions: ["read", "prepare"] }] };
export const AT = "2027-02-01T09:00:00.000Z", LINEAGE = { runId: "BENCH-RUN", rootId: "BENCH-RUN", revision: 1 };
export const RULE = { id: "ifrs16.leases" as const, version: LEASE_TEMPLATE.version, basisStatus: LEASE_RULE_BASIS.status };
export const gc = () => (globalThis as { gc?: () => void }).gc?.();
export const mem = () => { gc(); const m = process.memoryUsage(); return { rssMiB: +(m.rss / MiB).toFixed(1), heapUsedMiB: +(m.heapUsed / MiB).toFixed(1) }; };
export const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
/** Byte length of `JSON.stringify(value)` without building the whole string (leaves only). */
export const jsonBytes = (value: unknown): number => {
  if (value === null || typeof value !== "object") return Buffer.byteLength(JSON.stringify(value) ?? "null");
  if (Array.isArray(value)) return 2 + value.reduce((t: number, v) => t + jsonBytes(v === undefined ? null : v), 0) + Math.max(0, value.length - 1);
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return 2 + entries.reduce((t, [k, v]) => t + Buffer.byteLength(JSON.stringify(k)) + 1 + jsonBytes(v), 0) + Math.max(0, entries.length - 1);
};
/** Length of PostgreSQL's `jsonb::text` for a JSON value (`", "` and `": "` separators): the store limit sums `octet_length(run::text)`. */
export const jsonbTextBytes = (value: unknown): number => {
  if (value === null || typeof value !== "object") return Buffer.byteLength(JSON.stringify(value) ?? "null");
  if (Array.isArray(value)) return value.length ? 2 + value.reduce((t: number, v) => t + jsonbTextBytes(v === undefined ? null : v), 0) + 2 * (value.length - 1) : 2;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return entries.length ? 2 + entries.reduce((t, [k, v]) => t + Buffer.byteLength(JSON.stringify(k)) + 2 + jsonbTextBytes(v), 0) + 2 * (entries.length - 1) : 2;
};
export function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b), q = (p: number) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return { n: s.length, minMs: +s[0].toFixed(2), medianMs: +q(0.5).toFixed(2), p95Ms: +q(0.95).toFixed(2), maxMs: +s.at(-1)!.toFixed(2) };
}
export function time<T>(fn: () => T): [T, number] { const t = performance.now(), r = fn(); return [r, performance.now() - t]; }
export const log = (line: string) => process.stdout.write(line + "\n");

export type Gate = { gate: string; limit: number; value: number; ok: boolean; error?: string };
/**
 * Bench only, for volumes the real reader and this machine cannot hold: rows built in memory in the reader's output shape (key, amount, date,
 * Details), with the same approval; the real reader's gates are still evaluated on the file it would receive.
 */
export function memoryBatch(type: LeaseType, rs: LeaseRow[], fileBytes: number): ImportBatch {
  const documentId = "source-bench-" + type, scope = SCOPE;
  const rows = rs.map((r, i) => ({ id: "row-bench-" + type + "-" + (i + 2), documentVersionId: documentId, scope, locator: { row: i + 2 }, errors: [] as string[],
    original: { Key: r.key, Amount: r.amount, Date: r.date, Details: JSON.stringify(r.details) }, normalized: { key: r.key, amount: { amount: r.amount, currency: "EUR" as const }, date: r.date } }));
  return { id: "import-bench-" + type, scope, mapping: LEASE_MAPPING, mappingHash: "0".repeat(64), rows, previewHash: "0".repeat(64),
    document: { id: documentId, logicalId: type, scope, fileName: "BENCH-" + type + ".csv", format: "csv", documentType: type, byteHash: "0".repeat(64), storageRef: documentId, sizeBytes: fileBytes, parserVersion: "bench-memory" },
    report: { status: "accepted", acceptedRows: rows.length, rejectedRows: 0, duplicateRows: 0, sourceTotal: { kind: "unknown", reason: "bench" }, normalizedTotal: { amount: "0.00", currency: "EUR" }, warnings: [], blocking: [], calculationAllowed: true } };
}
/** Reads each source through the real tabular reader; when the reader refuses the whole file, the bench assembles the batch from chunks read by the same reader. */
export async function sources(rows: Record<LeaseType, LeaseRow[]>, reader: "real" | "memory" = "real") {
  const gates: Gate[] = [], batches: ImportBatch[] = [], perSource: Record<string, { rows: number; fileBytes: number; previewJsonBytes: number | null; storedBytes: number | null; reader: string }> = {};
  for (const type of LEASE_TYPES) {
    const rs = rows[type];
    if (!rs.length) continue;
    const file = leaseFile(type, rs), fileBytes = file.size;
    gates.push({ gate: type + " · fichier ≤ 3 Mio (store)", limit: LIMITS.fileBytes, value: fileBytes, ok: fileBytes <= LIMITS.fileBytes });
    gates.push({ gate: type + " · lecteur tabulaire (10 Mio, 50 000 lignes)", limit: LIMITS.parserRows, value: rs.length, ok: fileBytes <= LIMITS.parserBytes && rs.length <= LIMITS.parserRows });
    if (reader === "memory") {
      const batch = memoryBatch(type, rs, fileBytes);
      perSource[type] = { rows: rs.length, fileBytes, previewJsonBytes: null, storedBytes: null, reader: "lignes construites en mémoire au format du lecteur (volume hors des portes réelles)" };
      batches.push({ ...batch, approval: { actorId: ACTOR.id, at: AT, previewHash: batch.previewHash } });
      continue;
    }
    let batch: ImportBatch, how = "lecteur réel, fichier entier";
    try { batch = await previewImport(file, SCOPE, LEASE_MAPPING, ACTOR, type, "ifrs16.leases"); }
    catch (error) {
      gates.find(g => g.gate === type + " · lecteur tabulaire (10 Mio, 50 000 lignes)")!.error = (error as Error).message;
      // Bench only: the real reader refused this file; the pipeline is still measured on rows read by the same reader, in chunks.
      const parts: ImportBatch[] = [];
      for (let i = 0; i < rs.length; i += 20_000) parts.push(await previewImport(leaseFile(type, rs.slice(i, i + 20_000), "BENCH-" + type + "-" + i + ".csv"), SCOPE, LEASE_MAPPING, ACTOR, type, "ifrs16.leases"));
      batch = { ...parts[0], rows: parts.flatMap(p => p.rows) };
      how = "lecteur réel par tranches de 20 000 lignes, assemblées en mémoire (le runtime refuse ce fichier)";
    }
    const previewJsonBytes = bytes(batch), storedBytes = jsonbTextBytes(batch) + Math.ceil(fileBytes / 3) * 4;
    gates.push({ gate: type + " · aperçu ≤ 3 Mio (store)", limit: LIMITS.previewJsonBytes, value: previewJsonBytes, ok: previewJsonBytes <= LIMITS.previewJsonBytes });
    perSource[type] = { rows: rs.length, fileBytes, previewJsonBytes, storedBytes, reader: how };
    batches.push({ ...batch, approval: { actorId: ACTOR.id, at: AT, previewHash: batch.previewHash }, report: { ...batch.report, calculationAllowed: true } });
  }
  if (reader === "memory") return { gates, batches, perSource };
  const stored = Object.values(perSource).reduce((t, x) => t + x.storedBytes!, 0);
  gates.push({ gate: "sources du dossier-exercice ≤ 24 Mio (aperçus + originaux, store partagé)", limit: LIMITS.sourcesBytes, value: stored, ok: stored <= LIMITS.sourcesBytes });
  return { gates, batches, perSource };
}
export function sheet(imports: ImportBatch[]) {
  const work = stampLeaseWork({ framework: { standard: "IFRS 16", jurisdiction: "IASB", edition: "IFRS 16, IASB 2026", editionFingerprint: null },
    firstApplication: { kind: "not_applicable", reason: "Portefeuille synthétique de charge : entité réputée déjà sous IFRS 16" }, policies: [], confirmations: [] }, () => { throw new Error("L16_CITATION_INVALID"); }, ACTOR.id, AT);
  const population = freezePopulation(SCOPE, imports, "lease_contract", ACTOR, LEASE_PERIOD);
  const selection = selectPopulation(population, { method: "targeted", criteria: "Tous les contrats du portefeuille synthétique", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, ACTOR);
  return { work, population, selection };
}
export type Sheet = ReturnType<typeof sheet>;
export const evaluate = (imports: ImportBatch[], s: Sheet) => evaluateLeases(SCOPE, LEASE_PERIOD, imports, LINEAGE, s.population, s.selection, s.work);
export const execute = (imports: ImportBatch[], s: Sheet) => new LeaseRegistry().execute({ scope: SCOPE, period: LEASE_PERIOD, rule: { id: "ifrs16.leases", version: LEASE_TEMPLATE.version }, imports, population: s.population, selection: s.selection,
  parameters: { ...LINEAGE, work: s.work } });
/**
 * The stored run as the runtime writes it after execution; the registry part (`input`, `sourceRefs`) is rebuilt when the registry is not measured.
 * WorkpaperService.execute adds one verified link per cited document onto the run (`leaseRunEvidence`).
 */
export function runOf(imports: ImportBatch[], s: Sheet, calculation: CalculationRun): WorkpaperRun {
  const result = calculation.result as LeaseResult;
  return { id: LINEAGE.runId, rootId: LINEAGE.rootId, revision: 1, version: 6, schemaVersion: "1.0.0", scope: SCOPE, period: LEASE_PERIOD, template: LEASE_TEMPLATE, state: "executed", preparedBy: ACTOR.id,
    importIds: imports.map(b => b.id).sort(), population: s.population, selection: s.selection, leaseWork: s.work, result: calculation, evidence: leaseRunEvidence(result), findings: [], events: [],
    notes: leaseReviewPoints(result).map(x => ({ id: "lease:" + x.key, kind: "observation" as const, text: x.text, amount: x.amount, authorId: ACTOR.id, blocking: x.blocking })) };
}
/** Same shape as the registry's completed run, without executing it, then stored as the Locations adapter stores it: source rows referenced (O1). */
export const calculationShape = (imports: ImportBatch[], s: Sheet, result: LeaseResult) => inputByReference(calculationOf(imports, s, result, imports.map(b => ({ documentId: b.document.logicalId, documentVersionId: b.document.id, normalizedHash: "0".repeat(64), fingerprint: b.document.byteHash, parserVersion: b.document.parserVersion, mappingVersion: b.mapping.version }))), imports);
const calculationOf = (imports: ImportBatch[], s: Sheet, result: LeaseResult, sourceRefs: unknown[]) => ({ id: "calculation-bench", calculationKey: "ifrs16.leases", ruleVersion: LEASE_TEMPLATE.version, inputHash: "0".repeat(64), scope: SCOPE, period: LEASE_PERIOD,
  sourceRefs, input: { scope: SCOPE, period: LEASE_PERIOD, rule: { id: "ifrs16.leases", version: LEASE_TEMPLATE.version }, sourceRefs, imports: imports.map(b => ({ id: b.id, mappingHash: b.mappingHash, rows: b.rows })), population: s.population, selection: s.selection, parameters: { ...LINEAGE, work: s.work } },
  findings: [], warnings: [], blockedControls: [], execution: "completed", outcome: result.outcome, result }) as CalculationRun;
/** Read response of the real runtime, in the shape of lease-runtime.ts `leaseRead` (runs with their stored result, then the server views). */
export function readView(imports: ImportBatch[], run: WorkpaperRun, s: Sheet) {
  const facts = leaseFacts(imports), qualification = qualifyLeases(facts, LEASE_PERIOD, s.work, RULE), framing = frameLeases(qualification, facts.lease_ledger, LEASE_PERIOD);
  const result = (run.result as CalculationRun).result as LeaseResult, bundle = result.bundle ? materializeBundle(result.bundle, run) : null;
  const workspace = leaseWorkspaceView({ mode: "real", run, permissions: ["read", "prepare"], actorId: ACTOR.id, selfReviewAllowed: true, sourceTypes: imports.map(b => b.document.documentType), requiredTypes: LEASE_REQUIRED_TYPES,
    sourcesCurrent: true, ruleCurrent: true, ruleValidated: true, qualification, framing });
  return { runs: [run], imports: imports.map(b => ({ ...b, rows: b.rows.slice(0, 5), rowCount: b.rows.length })), qualification: { [run.id]: qualification }, framing: { [run.id]: framing },
    adjustments: { [run.id]: bundle }, portfolio: { [run.id]: leasePortfolioView(run, [run], qualification) },
    review: { [run.id]: leaseReviewSummary(run, result, qualification, [...facts.lease_contracts, ...facts.lease_assumptions], bundle) }, contentHashes: { [run.id]: contentHash(run) }, workspace: { [run.id]: workspace } };
}
/**
 * Versions written by one sheet from creation to lock without resolution: before execution (create, configure, freeze: configure, population,
 * ready) the run carries no result; from execution on (execute, generated points, conclusion, submission, review, lock) each version repeats
 * the whole run with its result (append-only history of WorkpaperService).
 */
export const chainBytes = (draft: number, executed: number) => 5 * draft + 6 * executed;
/** `versionJson`: JSON of one executed version, refused above 3.5 MiB when written (clients-persistence.ts `append`). */
export const sizeGates = (draft: number, executed: number, read: number, versionJson: number): Gate[] => [
  { gate: "version de feuille ≤ 3,5 Mio (écriture)", limit: LIMITS.versionJsonBytes, value: versionJson, ok: versionJson <= LIMITS.versionJsonBytes },
  { gate: "historique des feuilles ≤ 24 Mio (création → verrouillage, 11 versions)", limit: LIMITS.versionsBytes, value: chainBytes(draft, executed), ok: chainBytes(draft, executed) <= LIMITS.versionsBytes },
  { gate: "lecture de l'atelier ≤ 8 Mio", limit: LIMITS.readBytes, value: read, ok: read <= LIMITS.readBytes }];

export async function measureAt(contracts: number, months: number, seed: number) {
  const src = await sources(seededLeaseRows(contracts, months, seed)), s = sheet(src.batches), result = evaluate(src.batches, s);
  const run = runOf(src.batches, s, calculationShape(src.batches, s, result)), draft = jsonbTextBytes({ ...run, result: undefined, notes: [], evidence: [] }), executed = jsonbTextBytes(run);
  const gates = [...src.gates, ...sizeGates(draft, executed, bytes(readView(src.batches, run, s)), bytes(run))];
  return { ok: gates.every(g => g.ok), gates };
}
/** Largest portfolio admitted by every gate of the real runtime, by doubling then bisection on real measurements (not an extrapolation). */
export async function capacity(months: number, seed: number) {
  let lo = 0, hi = 1;
  while ((await measureAt(hi, months, seed)).ok) { lo = hi; hi *= 2; if (hi > 4096) break; }
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if ((await measureAt(mid, months, seed)).ok) lo = mid; else hi = mid; }
  const above = await measureAt(lo + 1, months, seed);
  return { months, maxContracts: lo, schedules: lo * months, refusedAt: lo + 1, binding: above.gates.filter(g => !g.ok).map(g => g.gate + " (" + (g.value / MiB).toFixed(2) + " Mio)") };
}
