#!/usr/bin/env node
/**
 * L16-06 — tests de mutation de l'atelier Locations : chaque mutation est écrite dans le code, les tests désignés sont lancés, puis le fichier
 * est restauré octet pour octet (même en cas d'erreur). Une mutation est « détectée » si au moins un test échoue, sans test ignoré ; une
 * référence sans mutation doit d'abord passer entièrement. Chaque mutation porte le marqueur `MUTATION L16-06`, qu'un test de garde interdit
 * dans le code livré.
 *
 *   node scripts/ifrs/mutations-l16.mjs [--only M1,M4a] [--out docs/ifrs/recette/mutations-l16.json]
 *
 * Les mutations « durable » exigent la base PostgreSQL jetable (PROBANT_CLIENTS_TEST_DATABASE_URL) ; sans elle, elles sont « non exécutées »,
 * jamais comptées détectées.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const arg = (name, fallback) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const OUT = path.resolve(root, arg("out", "docs/ifrs/recette/mutations-l16.json"));
const ONLY = arg("only", "") ? arg("only", "").split(",") : null;
const MARK = "/* MUTATION L16-06 */";

/** Each mutation: one exact anchor in one file, its replacement, and the tests expected to detect it. */
const MUTATIONS = [
  { id: "M1", label: "Taux mensuel r / 12 au lieu de (1 + r)^(1/12) − 1", file: "lib/ifrs/shared/fixed-point.ts",
    find: "  return fixed(integerRoot((ONE_RAW + annual) * ONE_RAW ** 11n, 12) - ONE_RAW);",
    replace: "  return fixed(annual / 12n) " + MARK + ";",
    project: "unit", tests: ["lib/ifrs/leases/__tests__/engine.test.ts", "lib/ifrs/leases/__tests__/proprietes.test.ts", "lib/ifrs/shared/__tests__/fixed-point.test.ts"] },
  { id: "M2", label: "Signe du dernier loyer inversé dans l'échéancier", file: "lib/ifrs/leases/engine.ts",
    find: "  for (let t = 1; t <= n; t++) exact.push(sub(add(exact[t - 1], mul(exact[t - 1], i)), payment));",
    replace: "  for (let t = 1; t <= n; t++) exact.push(t === n ? add(add(exact[t - 1], mul(exact[t - 1], i)), payment) : sub(add(exact[t - 1], mul(exact[t - 1], i)), payment)) " + MARK + ";",
    project: "unit", tests: ["lib/ifrs/leases/__tests__/engine.test.ts", "lib/ifrs/leases/__tests__/proprietes.test.ts"] },
  { id: "M3", label: "Contrat compté deux fois dans le sous-total du portefeuille", file: "lib/workpapers/lease-review.ts",
    find: "  const computed = contracts.filter(c => c.result === \"computed\");",
    replace: "  const computed = [...contracts.filter(c => c.result === \"computed\"), ...contracts.filter(c => c.result === \"computed\").slice(0, 1)] " + MARK + ";",
    project: "unit", tests: ["lib/workpapers/__tests__/lease-proprietes.test.ts", "lib/ifrs/leases/__tests__/portfolio.test.ts", "lib/workpapers/__tests__/lease-export.test.ts"] },
  { id: "M4a", label: "Source remplacée ignorée par le runtime (feuille dite à jour)", file: "lib/workpapers/lease-runtime.ts",
    find: "const sourcesCurrentFor = (run: WorkpaperRun, heads: Head[]) => run.importIds.every(",
    replace: "const sourcesCurrentFor = (run: WorkpaperRun, heads: Head[]) => " + MARK + " true || run.importIds.every(",
    project: "durable", tests: ["lib/workpapers/__tests__/lease-durable.integration.test.ts", "lib/workpapers/__tests__/lease-validated.integration.test.ts"] },
  { id: "M4b", label: "Source remplacée ignorée à la sélection d'un retraitement", file: "lib/ifrs/shared/selection.ts",
    find: "|| !sheet.latestRevision || !sheet.sourcesCurrent || !sheet.ruleCurrent) throw new Error(\"L16_BUNDLE_STALE\");",
    replace: "|| !sheet.latestRevision || (false && !sheet.sourcesCurrent) " + MARK + " || !sheet.ruleCurrent) throw new Error(\"L16_BUNDLE_STALE\");",
    project: "unit", tests: ["lib/ifrs/shared/__tests__/contracts.test.ts", "lib/workpapers/__tests__/lease-adjustment.test.ts", "lib/workpapers/__tests__/closing-ifrs.test.ts"] },
  { id: "M4c", label: "Source remplacée ignorée après sélection (sélection jamais « à réexaminer »)", file: "lib/ifrs/shared/selection.ts",
    find: "    if (!sheet.sourcesCurrent) reasons.push(\"source remplacée ou ajoutée\");",
    replace: "    if (!sheet.sourcesCurrent && false " + MARK + ") reasons.push(\"source remplacée ou ajoutée\");",
    project: "unit", tests: ["lib/ifrs/shared/__tests__/contracts.test.ts", "lib/workpapers/__tests__/lease-adjustment.test.ts", "lib/workpapers/__tests__/closing-ifrs.test.ts"] },
  { id: "M5", label: "Coût direct initial vide accepté comme zéro", file: "lib/ifrs/leases/qualification.ts",
    find: "    if (r.state === \"value\") return r.value!;",
    replace: "    if (r.state === \"value\") return r.value!;\n    if (r.state === \"empty\" && key === \"initialDirectCosts\") return \"0.00\" " + MARK + ";",
    project: "unit", tests: ["lib/ifrs/leases/__tests__/qualification.test.ts"] },
  // Rounded balances rolled month to month, the residual absorbed by the last due (instead of publishing the rounded exact balances).
  // The variant « last month's gap forced to zero » is an equivalent mutant: with a zero final debt and a rent in cents, that gap is zero anyway.
  { id: "M6", label: "Dernière échéance ajustée pour absorber l'arrondi (soldes arrondis reportés, résidu dans le dernier loyer)", file: "lib/ifrs/leases/engine.ts",
    find: "  const published = exact.map(toCents), L = cent(inputs.payment), start = monthIndex(inputs.commencement);",
    replace: "  const L = cent(inputs.payment), start = monthIndex(inputs.commencement), published: bigint[] = [toCents(exact[0])] " + MARK + ";\n"
      + "  for (let t = 1; t <= n; t++) published.push(t === n ? 0n : published[t - 1] - (L - toCents(mul(fromMoney(eur(published[t - 1])), i))));",
    project: "unit", tests: ["lib/ifrs/leases/__tests__/engine.test.ts", "lib/ifrs/leases/__tests__/proprietes.test.ts"] },
  { id: "M7", label: "Amortissement sur la durée du contrat au lieu de la durée d'utilité plus courte", file: "lib/ifrs/leases/engine.ts",
    find: "m = Math.min(inputs.usefulLifeMonths, n);",
    replace: "m = n " + MARK + ";",
    project: "unit", tests: ["lib/ifrs/leases/__tests__/engine.test.ts", "lib/ifrs/leases/__tests__/proprietes.test.ts"] },
];

function vitest(project, tests) {
  const dir = mkdtempSync(path.join(tmpdir(), "l16-mutations-")), report = path.join(dir, "report.json");
  const r = spawnSync(process.execPath, [path.join(root, "node_modules", "vitest", "vitest.mjs"), "run", "--config", "vitest.config.mjs", "--configLoader", "runner", "--pool=forks", "--project", project,
    "--reporter=json", "--outputFile=" + report, ...tests], { cwd: root, encoding: "utf8", env: process.env, windowsHide: true, timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });
  let json = null;
  try { json = JSON.parse(readFileSync(report, "utf8")); } catch { /* no report: counted as an execution error below */ }
  rmSync(dir, { recursive: true, force: true });
  if (!json) return { ran: false, error: (r.stderr || r.stdout || "").slice(-2000) };
  const failed = json.testResults.flatMap(f => f.assertionResults.filter(a => a.status === "failed").map(a => path.relative(root, f.name).replaceAll("\\", "/") + " › " + a.title));
  return { ran: true, passed: json.numPassedTests, failed: json.numFailedTests, skipped: json.numPendingTests + json.numTodoTests, failedSuites: json.numFailedTestSuites, failedTitles: failed.slice(0, 8) };
}

const results = [];
const database = !!process.env.PROBANT_CLIENTS_TEST_DATABASE_URL;
for (const m of MUTATIONS.filter(x => !ONLY || ONLY.includes(x.id))) {
  const file = path.join(root, m.file), original = readFileSync(file, "utf8");
  if (original.includes(MARK)) throw new Error(m.file + " contient déjà le marqueur de mutation : restaurer le fichier avant de relancer");
  const count = original.split(m.find).length - 1;
  if (count !== 1) { results.push({ ...m, status: "ancre_introuvable", anchors: count }); continue; }
  if (m.project === "durable" && !database) { results.push({ id: m.id, label: m.label, file: m.file, tests: m.tests, status: "non_executee", reason: "base PostgreSQL jetable absente" }); continue; }
  process.stdout.write(`${m.id} · référence sans mutation… `);
  const baseline = vitest(m.project, m.tests);
  if (!baseline.ran || baseline.failed || baseline.skipped || baseline.failedSuites) { results.push({ id: m.id, label: m.label, file: m.file, tests: m.tests, status: "reference_en_echec", baseline }); process.stdout.write("référence en échec\n"); continue; }
  process.stdout.write(`${baseline.passed} réussis ; mutation… `);
  let mutated;
  try { writeFileSync(file, original.replace(m.find, m.replace), "utf8"); mutated = vitest(m.project, m.tests); }
  finally { writeFileSync(file, original, "utf8"); }
  if (readFileSync(file, "utf8") !== original) throw new Error("Restauration impossible de " + m.file);
  const detected = mutated.ran ? mutated.failed > 0 || mutated.failedSuites > 0 : true;
  results.push({ id: m.id, label: m.label, file: m.file, tests: m.tests, project: m.project, status: detected ? "detectee" : "non_detectee", baseline: { passed: baseline.passed }, mutated });
  process.stdout.write(detected ? `détectée (${mutated.ran ? mutated.failed + " test(s) en échec" : "suite en erreur"})\n` : "NON DÉTECTÉE\n");
}
writeFileSync(OUT, JSON.stringify({ schema: "probant-l16-06-mutations-1", generatedBy: "scripts/ifrs/mutations-l16.mjs", node: process.version, database, results }, null, 2) + "\n", "utf8");
const bad = results.filter(r => r.status !== "detectee" && r.status !== "non_executee");
process.stdout.write(`${results.filter(r => r.status === "detectee").length}/${results.length} détectées ; non exécutées : ${results.filter(r => r.status === "non_executee").map(r => r.id).join(", ") || "aucune"} ; écrit ${path.relative(root, OUT)}\n`);
process.exit(bad.length ? 1 : 0);
