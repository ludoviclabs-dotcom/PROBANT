import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { computeLease } from "../../lib/ifrs/leases/engine";
import { leaseCharts, leasePortfolioView } from "../../lib/ifrs/leases/portfolio";
import { qualifyLeases } from "../../lib/ifrs/leases/qualification";
import { frameLeases } from "../../lib/ifrs/leases/framing";
import { leaseReviewSummary } from "../../lib/ifrs/leases/review-summary";
import { LEASE_RULE_BASIS } from "../../lib/ifrs/leases/rule";
import { leaseWorkspaceView } from "../../lib/ifrs/leases/view-model";
import { materializeBundle } from "../../lib/ifrs/shared/bundle";
import type { CalculationRun } from "../../lib/canonical-model/calculation";
import { previewImport, type ImportBatch } from "../../lib/workpapers/imports";
import { LEASE_TEMPLATE, LeaseRegistry } from "../../lib/workpapers/lease-adapter";
import { buildLeaseExport, LEASE_EXPORT_FORMATS } from "../../lib/workpapers/lease-export";
import { LEASE_PERIOD, leaseFile, seededLeaseRows, type LeaseRow } from "../../lib/workpapers/lease-fixture";
import { evaluateLeases, leaseReviewPoints, type LeaseResult } from "../../lib/workpapers/lease-review";
import { leaseFacts, LEASE_MAPPING, LEASE_REQUIRED_TYPES, LEASE_TYPES, type LeaseType } from "../../lib/workpapers/lease-sources";
import { stampLeaseWork } from "../../lib/workpapers/lease-work";
import { contentHash, periodId, type WorkpaperRun, type WorkpaperScope } from "../../lib/workpapers/model";
import type { Principal } from "../../lib/workpapers/policy";
import { freezePopulation, selectPopulation } from "../../lib/workpapers/selection";

/**
 * L16-06 — charge du module Locations sur un portefeuille généré par graine, sans donnée réelle (périmètre `demo`, même moteur, aucune écriture).
 * Sépare le coût propre à L16 (qualification, moteur, cadrage, retraitement, preuves : `evaluateLeases`) du coût du registre de calcul partagé
 * (copie et empreinte des entrées, double évaluation, gel profond), mesure vues, lecture et exports, puis la capacité maximale admise par
 * chaque limite du runtime réel. Qualification de cette machine, pas une garantie de performance générale.
 *
 *   node --expose-gc --import tsx scripts/ifrs/bench-l16.ts [--contracts 1000] [--months 120] [--repeat 5] [--seed 16006]
 *        [--reader real|memory] [--registry yes|no] [--heavy yes|no] [--capacity yes|no] [--out <json>]
 */
const arg = (name: string, fallback: string) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const CONTRACTS = Number(arg("contracts", "1000")), MONTHS = Number(arg("months", "120")), REPEAT = Number(arg("repeat", "5")), SEED = Number(arg("seed", "16006"));
const REGISTRY = arg("registry", "yes") === "yes", CAPACITY = arg("capacity", "yes") === "yes", READER = arg("reader", "real") as "real" | "memory";
/** Whole-run serialization, hash and exports: linear in the stored run (registry input copy included); off for volumes this machine cannot hold. */
const HEAVY = arg("heavy", "yes") === "yes";
const OUT = arg("out", path.join("docs", "ifrs", "recette", "charge", "charge-" + CONTRACTS + "x" + MONTHS + ".json"));
const MiB = 1024 * 1024;
/** Limits of the shared Clients store and of the tabular reader, as read in clients-runtime.ts, imports.ts and lease-runtime.ts. */
const LIMITS = { fileBytes: 3 * MiB, parserBytes: 10 * MiB, parserRows: 50_000, previewJsonBytes: 3 * MiB, sourcesBytes: 24 * MiB, versionsBytes: 24 * MiB, readBytes: 8 * MiB };
const SCOPE: WorkpaperScope = { organizationId: "BENCH-ORG", dossierId: "BENCH-LEASES", periodId: periodId(LEASE_PERIOD), mode: "demo" };
const ACTOR: Principal = { id: "Préparateur synthétique", grants: [{ scope: SCOPE, permissions: ["read", "prepare"] }] };
const AT = "2027-02-01T09:00:00.000Z", LINEAGE = { runId: "BENCH-RUN", rootId: "BENCH-RUN", revision: 1 };
const RULE = { id: "ifrs16.leases" as const, version: LEASE_TEMPLATE.version, basisStatus: LEASE_RULE_BASIS.status };
const gc = () => (globalThis as { gc?: () => void }).gc?.();
const mem = () => { gc(); const m = process.memoryUsage(); return { rssMiB: +(m.rss / MiB).toFixed(1), heapUsedMiB: +(m.heapUsed / MiB).toFixed(1) }; };
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
/** Byte length of `JSON.stringify(value)` without building the whole string (leaves only). */
const jsonBytes = (value: unknown): number => {
  if (value === null || typeof value !== "object") return Buffer.byteLength(JSON.stringify(value) ?? "null");
  if (Array.isArray(value)) return 2 + value.reduce((t: number, v) => t + jsonBytes(v === undefined ? null : v), 0) + Math.max(0, value.length - 1);
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return 2 + entries.reduce((t, [k, v]) => t + Buffer.byteLength(JSON.stringify(k)) + 1 + jsonBytes(v), 0) + Math.max(0, entries.length - 1);
};
/** Length of PostgreSQL's `jsonb::text` for a JSON value (`", "` and `": "` separators): the store limit sums `octet_length(run::text)`. */
const jsonbTextBytes = (value: unknown): number => {
  if (value === null || typeof value !== "object") return Buffer.byteLength(JSON.stringify(value) ?? "null");
  if (Array.isArray(value)) return value.length ? 2 + value.reduce((t: number, v) => t + jsonbTextBytes(v === undefined ? null : v), 0) + 2 * (value.length - 1) : 2;
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return entries.length ? 2 + entries.reduce((t, [k, v]) => t + Buffer.byteLength(JSON.stringify(k)) + 2 + jsonbTextBytes(v), 0) + 2 * (entries.length - 1) : 2;
};
function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b), q = (p: number) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return { n: s.length, minMs: +s[0].toFixed(2), medianMs: +q(0.5).toFixed(2), p95Ms: +q(0.95).toFixed(2), maxMs: +s.at(-1)!.toFixed(2) };
}
function time<T>(fn: () => T): [T, number] { const t = performance.now(), r = fn(); return [r, performance.now() - t]; }
const log = (line: string) => process.stdout.write(line + "\n");

type Gate = { gate: string; limit: number; value: number; ok: boolean; error?: string };
/**
 * Bench only, for volumes the real reader and this machine cannot hold: rows built in memory in the reader's output shape (key, amount, date,
 * Details), with the same approval; the real reader's gates are still evaluated on the file it would receive.
 */
function memoryBatch(type: LeaseType, rs: LeaseRow[], fileBytes: number): ImportBatch {
  const documentId = "source-bench-" + type, scope = SCOPE;
  const rows = rs.map((r, i) => ({ id: "row-bench-" + type + "-" + (i + 2), documentVersionId: documentId, scope, locator: { row: i + 2 }, errors: [] as string[],
    original: { Key: r.key, Amount: r.amount, Date: r.date, Details: JSON.stringify(r.details) }, normalized: { key: r.key, amount: { amount: r.amount, currency: "EUR" as const }, date: r.date } }));
  return { id: "import-bench-" + type, scope, mapping: LEASE_MAPPING, mappingHash: "0".repeat(64), rows, previewHash: "0".repeat(64),
    document: { id: documentId, logicalId: type, scope, fileName: "BENCH-" + type + ".csv", format: "csv", documentType: type, byteHash: "0".repeat(64), storageRef: documentId, sizeBytes: fileBytes, parserVersion: "bench-memory" },
    report: { status: "accepted", acceptedRows: rows.length, rejectedRows: 0, duplicateRows: 0, sourceTotal: { kind: "unknown", reason: "bench" }, normalizedTotal: { amount: "0.00", currency: "EUR" }, warnings: [], blocking: [], calculationAllowed: true } };
}
/** Reads each source through the real tabular reader; when the reader refuses the whole file, the bench assembles the batch from chunks read by the same reader. */
async function sources(rows: Record<LeaseType, LeaseRow[]>, reader: "real" | "memory" = "real") {
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
function sheet(imports: ImportBatch[]) {
  const work = stampLeaseWork({ framework: { standard: "IFRS 16", jurisdiction: "IASB", edition: "IFRS 16, IASB 2026", editionFingerprint: null },
    firstApplication: { kind: "not_applicable", reason: "Portefeuille synthétique de charge : entité réputée déjà sous IFRS 16" }, policies: [], confirmations: [] }, () => { throw new Error("L16_CITATION_INVALID"); }, ACTOR.id, AT);
  const population = freezePopulation(SCOPE, imports, "lease_contract", ACTOR, LEASE_PERIOD);
  const selection = selectPopulation(population, { method: "targeted", criteria: "Tous les contrats du portefeuille synthétique", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, ACTOR);
  return { work, population, selection };
}
type Sheet = ReturnType<typeof sheet>;
const evaluate = (imports: ImportBatch[], s: Sheet) => evaluateLeases(SCOPE, LEASE_PERIOD, imports, LINEAGE, s.population, s.selection, s.work);
const execute = (imports: ImportBatch[], s: Sheet) => new LeaseRegistry().execute({ scope: SCOPE, period: LEASE_PERIOD, rule: { id: "ifrs16.leases", version: LEASE_TEMPLATE.version }, imports, population: s.population, selection: s.selection,
  parameters: { ...LINEAGE, work: s.work } });
/** The stored run as the runtime writes it after execution; the registry part (`input`, `sourceRefs`) is rebuilt when the registry is not measured. */
function runOf(imports: ImportBatch[], s: Sheet, calculation: CalculationRun): WorkpaperRun {
  const result = calculation.result as LeaseResult;
  return { id: LINEAGE.runId, rootId: LINEAGE.rootId, revision: 1, version: 6, schemaVersion: "1.0.0", scope: SCOPE, period: LEASE_PERIOD, template: LEASE_TEMPLATE, state: "executed", preparedBy: ACTOR.id,
    importIds: imports.map(b => b.id).sort(), population: s.population, selection: s.selection, leaseWork: s.work, result: calculation, evidence: [], findings: [], events: [],
    notes: leaseReviewPoints(result).map(x => ({ id: "lease:" + x.key, kind: "observation" as const, text: x.text, amount: x.amount, authorId: ACTOR.id, blocking: x.blocking })) };
}
/** Same shape as the registry's completed run, without executing it: the `input` copy of every source row is what the registry stores. */
const calculationShape = (imports: ImportBatch[], s: Sheet, result: LeaseResult) => ({ id: "calculation-bench", calculationKey: "ifrs16.leases", ruleVersion: LEASE_TEMPLATE.version, inputHash: "0".repeat(64), scope: SCOPE, period: LEASE_PERIOD,
  sourceRefs: imports.map(b => ({ documentId: b.document.logicalId, documentVersionId: b.document.id, normalizedHash: "0".repeat(64), fingerprint: b.document.byteHash, parserVersion: b.document.parserVersion, mappingVersion: b.mapping.version })),
  input: { scope: SCOPE, period: LEASE_PERIOD, rule: { id: "ifrs16.leases", version: LEASE_TEMPLATE.version }, sourceRefs: [], imports: imports.map(b => ({ id: b.id, mappingHash: b.mappingHash, rows: b.rows })), population: s.population, selection: s.selection, parameters: { ...LINEAGE, work: s.work } },
  findings: [], warnings: [], blockedControls: [], execution: "completed", outcome: result.outcome, result }) as CalculationRun;
/** Read response of the real runtime, in the shape of lease-runtime.ts `leaseRead` (runs with their stored result, then the server views). */
function readView(imports: ImportBatch[], run: WorkpaperRun, s: Sheet) {
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
const chainBytes = (draft: number, executed: number) => 5 * draft + 6 * executed;
const sizeGates = (draft: number, executed: number, read: number): Gate[] => [
  { gate: "historique des feuilles ≤ 24 Mio (création → verrouillage, 11 versions)", limit: LIMITS.versionsBytes, value: chainBytes(draft, executed), ok: chainBytes(draft, executed) <= LIMITS.versionsBytes },
  { gate: "lecture de l'atelier ≤ 8 Mio", limit: LIMITS.readBytes, value: read, ok: read <= LIMITS.readBytes }];

async function measureAt(contracts: number, months: number) {
  const src = await sources(seededLeaseRows(contracts, months, SEED)), s = sheet(src.batches), result = evaluate(src.batches, s);
  const run = runOf(src.batches, s, calculationShape(src.batches, s, result)), draft = jsonbTextBytes({ ...run, result: undefined, notes: [] }), executed = jsonbTextBytes(run);
  const gates = [...src.gates, ...sizeGates(draft, executed, bytes(readView(src.batches, run, s)))];
  return { ok: gates.every(g => g.ok), gates };
}
/** Largest portfolio admitted by every gate of the real runtime, by doubling then bisection on real measurements (not an extrapolation). */
async function capacity(months: number) {
  let lo = 0, hi = 1;
  while ((await measureAt(hi, months)).ok) { lo = hi; hi *= 2; if (hi > 4096) break; }
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if ((await measureAt(mid, months)).ok) lo = mid; else hi = mid; }
  const above = await measureAt(lo + 1, months);
  return { months, maxContracts: lo, schedules: lo * months, refusedAt: lo + 1, binding: above.gates.filter(g => !g.ok).map(g => g.gate + " (" + (g.value / MiB).toFixed(2) + " Mio)") };
}

void (async () => {
  const cpu = os.cpus();
  const machine = { cpu: cpu[0]?.model.trim(), logicalCores: cpu.length, ramGiB: +(os.totalmem() / 1024 ** 3).toFixed(1), os: os.type() + " " + os.release() + " (" + os.version() + ")", arch: os.arch(), node: process.version,
    gcExposed: typeof (globalThis as { gc?: unknown }).gc === "function", heapLimitMiB: +((await import("node:v8")).getHeapStatistics().heap_size_limit / MiB).toFixed(0) };
  const memory: Record<string, ReturnType<typeof mem>> = { start: mem() };
  log(`L16-06 charge : ${CONTRACTS} contrats × ${MONTHS} mois, graine ${SEED}, ${REPEAT} répétitions, lecteur ${READER}, registre ${REGISTRY ? "mesuré" : "non mesuré"}`);
  const [rows, generationMs] = time(() => seededLeaseRows(CONTRACTS, MONTHS, SEED));
  const t0 = performance.now(), src = await sources(rows, READER), sourcesReadMs = performance.now() - t0;
  memory.afterSources = mem();
  log(`sources lues en ${sourcesReadMs.toFixed(0)} ms ; portes refusées : ${src.gates.filter(g => !g.ok).map(g => g.gate).join(" | ") || "aucune"}`);
  const s = sheet(src.batches), facts = leaseFacts(src.batches);

  // L16's own calculation: qualification, engine, PCG framing, adjustment and evidence, without the shared registry.
  const [result, coldMs] = time(() => evaluate(src.batches, s));
  memory.afterEvaluateCold = mem();
  const warm: number[] = [], qualificationMs: number[] = [];
  for (let i = 0; i < REPEAT; i++) { warm.push(time(() => evaluate(src.batches, s))[1]); qualificationMs.push(time(() => qualifyLeases(facts, LEASE_PERIOD, s.work, RULE))[1]); }
  log(`calcul L16 : froid ${coldMs.toFixed(0)} ms, chaud médiane ${stats(warm).medianMs} ms`);
  const qualification = qualifyLeases(facts, LEASE_PERIOD, s.work, RULE);

  // Shared registry around the same calculation: input copy and hash, double evaluation for determinism, deep freeze.
  let registry: null | { coldMs: number; warm: ReturnType<typeof stats> } = null, calculation: CalculationRun;
  if (REGISTRY) {
    const [first, ms] = time(() => execute(src.batches, s));
    if (first.execution !== "completed") throw new Error("BENCH_EXECUTION_" + first.execution);
    const again: number[] = [];
    for (let i = 0; i < REPEAT; i++) again.push(time(() => execute(src.batches, s))[1]);
    registry = { coldMs: +ms.toFixed(1), warm: stats(again) }; calculation = first;
    memory.afterRegistry = mem();
    log(`registre partagé : froid ${ms.toFixed(0)} ms, chaud médiane ${registry.warm.medianMs} ms`);
  } else calculation = calculationShape(src.batches, s, result);
  const run = runOf(src.batches, s, calculation), stored = (run.result as CalculationRun).result as LeaseResult;

  // One contract changed: the engine alone, then the product path (a new revision evaluates the whole frozen population again).
  const target = qualification.contracts.find(c => c.inputs)!, oneContract: number[] = [];
  for (let i = 0; i < REPEAT * 20; i++) oneContract.push(time(() => computeLease(target.inputs!, LEASE_PERIOD))[1]);
  const edited = rows.lease_contracts.map(r => r.key === target.contractId ? { ...r, details: { ...r.details, fields: { ...(r.details.fields as Record<string, string>), depreciationJustification: "Justification révisée (charge L16-06)" } } } : r);
  const contractsBatch = (await sources({ lease_contracts: edited, lease_assumptions: [], lease_schedule: [], lease_ledger: [], lease_opening: [] })).batches[0];
  const changedImports = [...src.batches.filter(b => b.document.documentType !== "lease_contracts"), contractsBatch], changedSheet = sheet(changedImports), reevaluate: number[] = [];
  for (let i = 0; i < REPEAT; i++) reevaluate.push(time(() => evaluate(changedImports, changedSheet))[1]);

  // Server views read from the stored result, and the screen filter of Portfolio.tsx on the same rows.
  // materializeBundle hashes the whole run once (contentHash), like the runtime's read.
  const [bundle, materializeMs] = time(() => stored.bundle ? materializeBundle(stored.bundle, run) : null), cited = [...facts.lease_contracts, ...facts.lease_assumptions];
  const portfolioMs: number[] = [], chartsMs: number[] = [], reviewMs: number[] = [], readMs: number[] = [], hashMs: number[] = [];
  let readBytes = 0;
  for (let i = 0; i < REPEAT; i++) {
    portfolioMs.push(time(() => leasePortfolioView(run, [run], qualification))[1]);
    chartsMs.push(time(() => leaseCharts(stored))[1]);
    reviewMs.push(time(() => leaseReviewSummary(run, stored, qualification, cited, bundle))[1]);
    if (HEAVY) {
      const [text, ms] = time(() => JSON.stringify(readView(src.batches, run, s)));
      readMs.push(ms); readBytes = Buffer.byteLength(text);
      hashMs.push(time(() => contentHash(run))[1]);
    }
  }
  if (!HEAVY) readBytes = jsonBytes(readView(src.batches, run, s));
  memory.afterViews = mem();
  const tableRows = leasePortfolioView(run, [run], qualification)?.rows ?? [], filter: number[] = [];
  for (const q of ["b00", "bailleur", "locaux", "véhicules", "b0099", "zzz", "matériel", "b01", "b005", "b00042"]) for (let i = 0; i < 10; i++)
    filter.push(time(() => [...tableRows.filter(r => [r.contractId, r.lessor ?? "", r.assetCategory ?? ""].some(v => v.toLowerCase().includes(q)))].sort((a, b) => (a.contractId < b.contractId ? -1 : 1)))[1]);

  // Exports of the exact version, every format, from the same stored result.
  const exportInput = { run, result: stored, qualification, facts: cited, bundle,
    sources: src.batches.map(b => ({ importId: b.id, documentVersionId: b.document.id, documentType: b.document.documentType, fileName: b.document.fileName, sha256: b.document.byteHash, rows: b.rows.length, approvedAt: AT })),
    standing: { latestRevision: true, sourcesCurrent: true, ruleCurrent: true }, kind: "diagnostic" as const, emission: { exportedAt: AT, exportedBy: "charge L16-06" } };
  const exportsOut: Record<string, ReturnType<typeof stats> & { bytes: number }> = {};
  for (const format of HEAVY ? LEASE_EXPORT_FORMATS : []) {
    const samples: number[] = [];
    let size = 0;
    for (let i = 0; i < REPEAT; i++) { const [file, ms] = time(() => buildLeaseExport({ ...exportInput, format })); samples.push(ms); size = Buffer.byteLength(file.content); }
    exportsOut[format] = { ...stats(samples), bytes: size };
  }
  memory.afterExports = mem();

  const calc = run.result as CalculationRun, draft = jsonbTextBytes({ ...run, result: undefined, notes: [] }), executed = jsonbTextBytes(run);
  const parts = { input: jsonbTextBytes(calc.input), contractsWithoutDuesAndSchedules: jsonbTextBytes(stored.contracts.map(c => ({ ...c, dues: undefined, schedule: undefined }))),
    dues: jsonbTextBytes(stored.contracts.map(c => c.dues)), schedules: jsonbTextBytes(stored.contracts.map(c => c.schedule ?? null)), evidence: jsonbTextBytes(stored.evidence),
    bundle: jsonbTextBytes(stored.bundle), notes: jsonbTextBytes(run.notes) };
  const gates = [...src.gates, ...sizeGates(draft, executed, readBytes)];
  log(`tailles : feuille exécutée ${(executed / MiB).toFixed(1)} Mio, historique ${(chainBytes(draft, executed) / MiB).toFixed(1)} Mio, lecture ${(readBytes / MiB).toFixed(1)} Mio`);
  const capacityOut = [];
  if (CAPACITY) for (const months of [120, 36, 12]) { const c = await capacity(months); capacityOut.push(c); log(`capacité : ${c.maxContracts} contrats × ${months} mois ; refus à ${c.refusedAt} : ${c.binding.join(", ")}`); }
  const peakRssMiB = +(process.resourceUsage().maxRSS / 1024).toFixed(1);

  const report = {
    schema: "probant-l16-06-charge-1", generatedBy: "scripts/ifrs/bench-l16.ts", machine,
    parameters: { contracts: CONTRACTS, months: MONTHS, schedules: CONTRACTS * MONTHS, seed: SEED, repeat: REPEAT, reader: READER, registryMeasured: REGISTRY, heavyMeasured: HEAVY, period: LEASE_PERIOD, scope: "demo (même moteur, aucune écriture)" },
    portfolio: { byResult: stored.portfolio.byResult, adjustmentContracts: stored.bundle ? new Set(stored.bundle.lines.map(l => l.contractId)).size : 0, debtClosing: stored.portfolio.computedSubtotal?.debtClosing ?? null, outcome: stored.outcome },
    timings: {
      generationMs: +generationMs.toFixed(1), sourcesReadMs: +sourcesReadMs.toFixed(1),
      l16: { evaluateColdMs: +coldMs.toFixed(1), evaluateWarm: stats(warm), qualification: stats(qualificationMs), oneContractEngine: stats(oneContract), reevaluateAfterOneContractChanged: stats(reevaluate) },
      sharedRegistry: registry,
      views: { portfolio: stats(portfolioMs), charts: stats(chartsMs), reviewSummary: stats(reviewMs), readSerialized: HEAVY ? stats(readMs) : null, contentHash: HEAVY ? stats(hashMs) : null, screenFilter: stats(filter) },
      exports: exportsOut, materializeBundleMs: +materializeMs.toFixed(1),
    },
    sizes: { perSource: src.perSource, draftRunBytes: draft, executedRunBytes: executed, executedRunParts: parts, chainBytes: chainBytes(draft, executed), readBytes },
    memory: { ...memory, peakRssMiB }, gates, capacity: capacityOut,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n", "utf8");
  log(`mémoire pic ${peakRssMiB} Mio ; écrit : ${OUT}`);
})().catch(error => { process.stderr.write(String(error?.stack ?? error) + "\n"); process.exit(1); });
