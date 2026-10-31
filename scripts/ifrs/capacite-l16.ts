import { writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import type { CalculationRun } from "../../lib/canonical-model/calculation";
import type { ScheduleRow } from "../../lib/ifrs/leases/engine";
import { stableSha256 } from "../../lib/synthesis/canonical";
import type { ImportBatch } from "../../lib/workpapers/imports";
import { LEASE_PERIOD, seededLeaseRows, type LeaseRow } from "../../lib/workpapers/lease-fixture";
import type { LeaseResult } from "../../lib/workpapers/lease-review";
import type { LeaseType } from "../../lib/workpapers/lease-sources";
import type { WorkpaperRun } from "../../lib/workpapers/model";
import { bytes, calculationShape, evaluate, jsonbTextBytes, LIMITS, log, MiB, readView, runOf, sheet, sources } from "./charge-l16-lib";

/**
 * L16-06 — comparaison des options de capacité de l'atelier Locations (`handoffs/L16-06.md` § 5.4). Chaque option est construite concrètement
 * sur la feuille exécutée du portefeuille synthétique (graine 16006, 120 mois), puis ses octets sont comptés porte par porte comme le runtime
 * réel les compte. Rien n'est changé dans le produit : c'est la mesure d'un format proposé, pas une implémentation.
 *
 * - O1 entrées par référence : l'adaptateur Locations remplace la copie des lignes sources de `input` par leur nombre et leur empreinte ;
 * - O2 résultat compacté : échéances qualifiées remplacées par leur nombre et leur empreinte (la qualification se relit sur les sources figées),
 *   échéanciers en colonnes, preuves regroupées par pièce, copie des preuves sur la feuille supprimée ;
 * - O3 résultat stocké une fois par exécution : les versions suivantes portent l'empreinte du résultat, pas le résultat ;
 * - R lecture compacte : la lecture ne renvoie ni la feuille complète ni les échéances ; le détail d'un contrat se lit à la demande ;
 * - O4 limites du profil local relevées (×8 dans ce relevé : seuil illustratif, la capacité est linéaire en chaque limite) ;
 * - O5 échéancier compact : seules les échéances exigibles à la date de revue sont importées (changement du contrat de données).
 *
 *   node --import tsx scripts/ifrs/capacite-l16.ts [--months 120] [--out docs/ifrs/recette/charge/capacite-options-120m.json]
 * Avec PROBANT_CLIENTS_TEST_DATABASE_URL (base jetable), le compteur d'octets est étalonné contre `octet_length(run::text)` de PostgreSQL.
 */
const arg = (name: string, fallback: string) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const SEED = 16006, MONTHS = Number(arg("months", "120"));
const OUT = arg("out", path.join("docs", "ifrs", "recette", "charge", "capacite-options-" + MONTHS + "m.json"));
type Option = "O1" | "O2" | "O3" | "R" | "O4" | "O5";
const COMBOS: { id: string; label: string; options: Option[] }[] = [
  { id: "A", label: "Actuel", options: [] },
  { id: "B", label: "O1 seule", options: ["O1"] },
  { id: "C", label: "O2 seule", options: ["O2"] },
  { id: "D", label: "O1 + O2", options: ["O1", "O2"] },
  { id: "E", label: "O1 + O2 + R", options: ["O1", "O2", "R"] },
  { id: "F", label: "O1 + O2 + O3 + R", options: ["O1", "O2", "O3", "R"] },
  { id: "G", label: "O4 seule (limites ×8)", options: ["O4"] },
  { id: "J", label: "O1 + O2 + O4", options: ["O1", "O2", "O4"] },
  { id: "K", label: "O1 + O2 + R + O5", options: ["O1", "O2", "R", "O5"] },
  { id: "H", label: "O1 + O2 + O3 + R + O4", options: ["O1", "O2", "O3", "R", "O4"] },
  { id: "I", label: "O1 + O2 + O3 + R + O4 + O5", options: ["O1", "O2", "O3", "R", "O4", "O5"] },
];
const limitsFor = (o: Option[]) => o.includes("O4") ? { fileBytes: 8 * LIMITS.fileBytes, parserBytes: 8 * LIMITS.parserBytes, parserRows: 8 * LIMITS.parserRows, previewJsonBytes: 8 * LIMITS.previewJsonBytes,
  sourcesBytes: 8 * LIMITS.sourcesBytes, versionJsonBytes: 8 * LIMITS.versionJsonBytes, versionsBytes: 8 * LIMITS.versionsBytes, readBytes: 8 * LIMITS.readBytes } : LIMITS;

/** O5: only the dues already payable at the review date are imported; future dues follow from the contract terms. */
function compactSchedule(rows: Record<LeaseType, LeaseRow[]>) { return { ...rows, lease_schedule: rows.lease_schedule.filter(r => r.date <= LEASE_PERIOD.asOfDate) }; }
/** O1: the registry's copy of the source rows replaced by their count and hash; the rows stay in the append-only imports store. */
function inputByReference(calc: CalculationRun): CalculationRun {
  const input = calc.input as { imports: { id: string; mappingHash: string; rows: ImportBatch["rows"] }[] };
  return { ...calc, input: { ...input, imports: input.imports.map(b => ({ id: b.id, mappingHash: b.mappingHash, rowCount: b.rows.length, rowsHash: stableSha256(b.rows) })) } };
}
const columns = (rows: ScheduleRow[]) => ({ t: rows.map(r => r.t), dueDate: rows.map(r => r.dueDate), payment: rows.map(r => r.payment.amount), openingDebt: rows.map(r => r.openingDebt.amount),
  interest: rows.map(r => r.interest.amount), principal: rows.map(r => r.principal.amount), closingDebt: rows.map(r => r.closingDebt.amount), economicInterestRounded: rows.map(r => r.economicInterestRounded.amount),
  roundingGap: rows.map(r => r.roundingGap.amount), currency: "EUR" });
/** O2: dues by reference, schedules in columns, evidence grouped by document, no copy of the evidence on the run. */
function compactResult(run: WorkpaperRun): WorkpaperRun {
  const calc = run.result as CalculationRun, result = calc.result as LeaseResult;
  const grouped = new Map<string, string[]>();
  for (const e of result.evidence) grouped.set(e.documentVersionId, [...(grouped.get(e.documentVersionId) ?? []), e.rowId!]);
  const compact = { ...result, contracts: result.contracts.map(c => ({ ...c, dues: { count: c.dues.length, hash: stableSha256(c.dues) }, schedule: c.schedule ? columns(c.schedule) : undefined })),
    evidence: [...grouped].map(([documentVersionId, rowIds]) => ({ documentVersionId, purpose: "Source de location citée", rowIds })) };
  return { ...run, evidence: [], result: { ...calc, result: compact } };
}
/** R: the read keeps the server views and the sheet without its result body; dues and proofs of a contract are read on demand. */
function compactRead(view: ReturnType<typeof readView>, run: WorkpaperRun) {
  const calc = run.result as CalculationRun, q = view.qualification[run.id];
  return { ...view, runs: [{ ...run, evidence: [], result: { ...calc, input: undefined, result: { ...(calc.result as LeaseResult), contracts: [], evidence: [] } } }],
    qualification: { [run.id]: { ...q, contracts: q.contracts.map(c => ({ ...c, dues: [], evidence: [], dueCount: c.dues.length })) } } };
}

async function measure(contracts: number, options: Option[]) {
  const base = seededLeaseRows(contracts, MONTHS, SEED), rows = options.includes("O5") ? compactSchedule(base) : base;
  const src = await sources(rows), s = sheet(src.batches);
  // O5 changes the source, not the qualification rule: measured on the import gates only (the current rule would ask for the missing dues).
  const full = options.includes("O5") ? await sources(base) : src, fs = options.includes("O5") ? sheet(full.batches) : s;
  const result = evaluate(full.batches, fs);
  let run = runOf(full.batches, fs, calculationShape(full.batches, fs, result));
  if (options.includes("O1")) run = { ...run, result: inputByReference(run.result as CalculationRun) };
  // The server views (portfolio, series, review) are computed from the full result; only the stored and returned sheet changes with O2.
  const views = readView(full.batches, run, fs);
  if (options.includes("O2")) run = compactResult(run);
  const draft = jsonbTextBytes({ ...run, result: undefined, notes: [], evidence: [] }), executed = jsonbTextBytes(run);
  const calc = run.result as CalculationRun, heavy = jsonbTextBytes({ input: calc.input, result: calc.result, evidence: run.evidence }), reference = jsonbTextBytes({ input: "0".repeat(64), result: "0".repeat(64), evidence: "0".repeat(64) });
  const chain = options.includes("O3") ? 5 * draft + 6 * (executed - heavy + reference) + heavy : 5 * draft + 6 * executed;
  // One write is refused above the version limit; with O3 the result is its own write, the versions carry its hash.
  const json = bytes(run), heavyJson = bytes({ input: calc.input, result: calc.result, evidence: run.evidence }), versionJson = options.includes("O3") ? Math.max(heavyJson, json - heavyJson) : json;
  const view = { ...views, runs: [run] }, read = bytes(options.includes("R") ? compactRead(view, run) : view);
  const schedule = src.perSource.lease_schedule;
  return { contracts, scheduleRows: schedule.rows, scheduleFile: schedule.fileBytes, schedulePreview: schedule.previewJsonBytes!, sourcesStored: Object.values(src.perSource).reduce((t, x) => t + x.storedBytes!, 0),
    draft, executed, chain, read, versionJson };
}
type Point = Awaited<ReturnType<typeof measure>>;
const METRICS = ["scheduleRows", "scheduleFile", "schedulePreview", "sourcesStored", "versionJson", "chain", "read"] as const;
/** Fixed + per-contract cost of each metric, fitted on two measured sizes and checked on a third. */
function fit(a: Point, b: Point, check: Point) {
  return Object.fromEntries(METRICS.map(m => {
    const slope = (b[m] - a[m]) / (b.contracts - a.contracts), fixed = a[m] - slope * a.contracts, predicted = fixed + slope * check.contracts;
    return [m, { fixed, perContract: slope, checkError: Math.abs(predicted - check[m]) / check[m] }];
  })) as Record<typeof METRICS[number], { fixed: number; perContract: number; checkError: number }>;
}
function capacityOf(model: ReturnType<typeof fit>, options: Option[]) {
  const L = limitsFor(options), cap = (m: typeof METRICS[number], limit: number) => Math.floor((limit - model[m].fixed) / model[m].perContract);
  const gates = [
    { gate: "échéancier · lignes du lecteur", contracts: cap("scheduleRows", L.parserRows) },
    { gate: "échéancier · fichier", contracts: Math.min(cap("scheduleFile", L.fileBytes), cap("scheduleFile", L.parserBytes)) },
    { gate: "échéancier · aperçu", contracts: cap("schedulePreview", L.previewJsonBytes) },
    { gate: "sources du dossier-exercice", contracts: cap("sourcesStored", L.sourcesBytes) },
    { gate: "version de feuille (écriture)", contracts: cap("versionJson", L.versionJsonBytes) },
    { gate: "historique des feuilles", contracts: cap("chain", L.versionsBytes) },
    { gate: "lecture de l'atelier", contracts: cap("read", L.readBytes) },
  ];
  const min = Math.min(...gates.map(g => g.contracts));
  return { contracts: min, binding: gates.filter(g => g.contracts === min).map(g => g.gate), gates };
}
/**
 * Direct measurement around the estimate (real reader, up to its 50 000 rows): step down while n fails, up while n + 1 passes. The model's
 * residual nonlinearity (row numbers growing by one digit) can move the boundary by a contract or two.
 */
async function settle(estimate: number, options: Option[]) {
  const L = limitsFor(options), ok = async (n: number) => { const p = await measure(n, options);
    return p.scheduleRows <= L.parserRows && p.scheduleFile <= Math.min(L.fileBytes, L.parserBytes) && p.schedulePreview <= L.previewJsonBytes && p.sourcesStored <= L.sourcesBytes && p.versionJson <= L.versionJsonBytes && p.chain <= L.versionsBytes && p.read <= L.readBytes; };
  if ((estimate + 1) * MONTHS > 50_000 || estimate < 1 || estimate > 600) return null;
  let n = estimate;
  while (n > 0 && !(await ok(n))) n--;
  while (await ok(n + 1)) n++;
  return { measured: n, estimate };
}

/** Byte counter calibrated against PostgreSQL: the store limit sums `octet_length(run::text)` of jsonb values. */
async function calibrate() {
  const url = process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
  if (!url) return null;
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host) || !/(_ci|_test)$/.test(new URL(url).pathname)) throw new Error("Base jetable locale *_ci / *_test exigée");
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 3 }), src = await sources(seededLeaseRows(12, MONTHS, SEED)), s = sheet(src.batches);
  const run = runOf(src.batches, s, calculationShape(src.batches, s, evaluate(src.batches, s)));
  try {
    const [{ n }] = await sql<{ n: string }[]>`SELECT octet_length(${sql.json(JSON.parse(JSON.stringify(run)))}::jsonb::text)::text AS n`;
    return { contracts: 12, postgres: Number(n), counter: jsonbTextBytes(run), relativeError: Math.abs(Number(n) - jsonbTextBytes(run)) / Number(n) };
  } finally { await sql.end(); }
}

void (async () => {
  const calibration = await calibrate();
  if (calibration) log(`étalonnage : PostgreSQL ${calibration.postgres} octets, compteur ${calibration.counter} (écart ${(calibration.relativeError * 100).toFixed(3)} %)`);
  const out = [];
  for (const combo of COMBOS) {
    const a = await measure(10, combo.options), b = await measure(40, combo.options), check = await measure(80, combo.options), model = fit(a, b, check), capacity = capacityOf(model, combo.options);
    const verification = await settle(capacity.contracts, combo.options);
    const perContractMiB = Object.fromEntries(METRICS.filter(m => m !== "scheduleRows").map(m => [m, +(model[m].perContract / MiB).toFixed(4)]));
    out.push({ ...combo, perContractMiB, maxCheckError: Math.max(...METRICS.map(m => model[m].checkError)), capacity, verification });
    log(`${combo.id} ${combo.label} : ${verification ? verification.measured + " contrats mesurés" : capacity.contracts + " contrats estimés (au-delà du lecteur réel)"} × ${MONTHS} mois (porte : ${capacity.binding.join(", ")} ; modèle ${capacity.contracts})`);
  }
  writeFileSync(OUT, JSON.stringify({ schema: "probant-l16-06-capacite-options-1", generatedBy: "scripts/ifrs/capacite-l16.ts", seed: SEED, months: MONTHS, limits: LIMITS, calibration, combos: out }, null, 2) + "\n", "utf8");
  log("écrit : " + OUT);
})().catch(error => { process.stderr.write(String(error?.stack ?? error) + "\n"); process.exit(1); });
