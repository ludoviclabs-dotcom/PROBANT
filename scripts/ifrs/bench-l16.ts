import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { computeLease } from "../../lib/ifrs/leases/engine";
import { leaseCharts, leasePortfolioView } from "../../lib/ifrs/leases/portfolio";
import { qualifyLeases } from "../../lib/ifrs/leases/qualification";
import { leaseReviewSummary } from "../../lib/ifrs/leases/review-summary";
import { materializeBundle } from "../../lib/ifrs/shared/bundle";
import type { CalculationRun } from "../../lib/canonical-model/calculation";
import { buildLeaseExport, LEASE_EXPORT_FORMATS } from "../../lib/workpapers/lease-export";
import { LEASE_PERIOD, seededLeaseRows } from "../../lib/workpapers/lease-fixture";
import type { LeaseResult } from "../../lib/workpapers/lease-review";
import { leaseFacts } from "../../lib/workpapers/lease-sources";
import { contentHash } from "../../lib/workpapers/model";
import { AT, calculationShape, capacity, chainBytes, evaluate, execute, jsonBytes, jsonbTextBytes, log, mem, MiB, readView, RULE, runOf, sheet, sizeGates, sources, stats, time } from "./charge-l16-lib";

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

  const calc = run.result as CalculationRun, draft = jsonbTextBytes({ ...run, result: undefined, notes: [], evidence: [] }), executed = jsonbTextBytes(run);
  const parts = { input: jsonbTextBytes(calc.input), runEvidence: jsonbTextBytes(run.evidence), contractsWithoutDuesAndSchedules: jsonbTextBytes(stored.contracts.map(c => ({ ...c, dues: undefined, schedule: undefined }))),
    dues: jsonbTextBytes(stored.contracts.map(c => c.dues)), schedules: jsonbTextBytes(stored.contracts.map(c => c.schedule ?? null)), evidence: jsonbTextBytes(stored.evidence),
    bundle: jsonbTextBytes(stored.bundle), notes: jsonbTextBytes(run.notes) };
  const gates = [...src.gates, ...sizeGates(draft, executed, readBytes, jsonBytes(run))];
  log(`tailles : feuille exécutée ${(executed / MiB).toFixed(1)} Mio, historique ${(chainBytes(draft, executed) / MiB).toFixed(1)} Mio, lecture ${(readBytes / MiB).toFixed(1)} Mio`);
  const capacityOut = [];
  if (CAPACITY) for (const months of [120, 36, 12]) { const c = await capacity(months, SEED); capacityOut.push(c); log(`capacité : ${c.maxContracts} contrats × ${months} mois ; refus à ${c.refusedAt} : ${c.binding.join(", ")}`); }
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
