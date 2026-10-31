import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { LEASE_PERIOD, type LeaseRow } from "../lib/workpapers/lease-fixture";
import { LEASE_MAPPING, type LeaseType } from "../lib/workpapers/lease-sources";
import { periodId } from "../lib/workpapers/model";
import * as local from "./ifrs-local-helpers";
import { api, axeSerious, csv, LEASE_TYPES, noOverflow, portOpen, refusal } from "./ifrs-local-helpers";

/**
 * C03 — intégration et non-régression de l'atelier Locations IFRS 16 sur un profil personnel local **jetable**, restreinte à IFRS 16 :
 * l'atelier IFRS 18 n'est pas engagé (décision de l'utilisateur du 31/10/2026), ses étapes du parcours de référence sont hors périmètre.
 *
 *   PROBANT_E2E_LOCAL_HOME=<profil jetable> PROBANT_E2E_BASE_URL=http://127.0.0.1:<port> npx playwright test e2e/ifrs-c03-integration-locale.spec.ts
 *
 * Parcours : chaîne réelle et détail d'un montant avec sa preuve ; sélection pour une base PCG dite pont partiel ; rejeu sans double montant et
 * base qui inclut déjà le retraitement refusée ; simulation ouverte sans toucher la version revue ; version d'un contrat changée → feuille,
 * retraitement et sélection à réexaminer, l'autre contrat conservé ; sauvegarde puis restauration dans un profil distinct, relu à l'identique.
 * Sans profil, le parcours est ignoré (non vérifié), jamais simulé.
 */
const HOME = process.env.PROBANT_E2E_LOCAL_HOME ?? "";
const BASE = process.env.PROBANT_E2E_BASE_URL ?? "";
const OUT = path.join(process.cwd(), "docs", "ifrs", "captures", "c03");
const PID = periodId(LEASE_PERIOD);

test.skip(!HOME || !BASE, "Profil local jetable non démarré (PROBANT_E2E_LOCAL_HOME / PROBANT_E2E_BASE_URL absents) : non vérifié.");
test.describe.configure({ mode: "serial", timeout: 300_000 });

const signedInPage = (browser: Browser, width: number, next = "/local", home = HOME) => local.signedInPage(browser, home, width, next);
const capture = (page: Page, name: string) => local.capture(page, OUT, name);

const S = { dossierId: "", legalName: "", rootId: "" };
const leasesUrl = () => "/api/workpapers/locations-ifrs16?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID });
const closingUrl = () => "/api/workpapers/closing?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID });
const sheetHref = () => "/ifrs/locations?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID });
type Run = { id: string; rootId: string; revision: number; version: number; state: string; conclusion?: string; result?: { result?: { contracts: { contractId: string; version: string | null; fingerprint: string; closing?: { debtClosing: { amount: string } } | null }[] } } };
type Read = { runs: Run[]; sourceHeads: { document_type: string; import_id: string }[]; contentHashes: Record<string, string>; workspace: Record<string, { freshness: string }> };
const read = async (page: Page) => (await api(page, leasesUrl())).body as Read;
const head = (v: Read) => [...v.runs].sort((a, b) => b.revision - a.revision)[0];

/** What a restore must give back: every version of the lineage, the source heads, the closing journal and its IFRS section, the export bytes of r1. */
async function snapshot(page: Page) {
  const v = await read(page), r1 = v.runs.find(r => r.revision === 1)!;
  const exported = await api(page, "/api/workpapers/locations-ifrs16/export?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }),
    { json: { id: r1.id, version: r1.version, expectedHash: v.contentHashes[r1.id], format: "json", kind: "diagnostic" } });
  expect(exported.status).toBe(200);
  const closing = (await api(page, closingUrl())).body;
  return { runs: v.runs.map(r => ({ id: r.id, revision: r.revision, version: r.version, state: r.state, hash: v.contentHashes[r.id] })).sort((a, b) => a.revision - b.revision),
    sourceHeads: [...v.sourceHeads].map(h => h.document_type + ":" + h.import_id).sort(), exportHash: exported.hash,
    closing: { seq: closing.seq, journal: closing.projection.journal, ifrsWorks: closing.projection.ifrsWorks } };
}
async function replaceSource(page: Page, type: LeaseType, file: { name: string; text: string }) {
  const before = await read(page);
  const preview = await api(page, "/api/workpapers/locations-ifrs16/imports?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }),
    { form: { file: { name: file.name, type: "text/csv", text: file.text }, documentType: type, mapping: JSON.stringify(LEASE_MAPPING), period: JSON.stringify(LEASE_PERIOD) } });
  expect(preview.status, JSON.stringify(preview.body)).toBe(200);
  const approved = await api(page, "/api/workpapers/locations-ifrs16/imports?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }),
    { json: { command: "approve_import", importId: preview.body.batch.id, previewHash: preview.body.batch.previewHash, expectedSourceId: before.sourceHeads.find(h => h.document_type === type)!.import_id } });
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
}
/** First save of a sheet (or of a revision, which starts without work in real mode), then the short-term policy of the office equipment. */
async function savePolicies(page: Page) {
  await page.getByRole("button", { name: "Enregistrer les politiques" }).click();
  await expect(page.getByLabel("Exemption court terme (§ 8) — Matériel de bureau")).toBeVisible();
  await page.getByLabel("Exemption court terme (§ 8) — Matériel de bureau").selectOption("not_elected");
  await page.getByRole("button", { name: "Enregistrer les politiques" }).click();
  await expect(page.getByText("Enregistré — version serveur reçue")).toBeVisible();
}
let before: Awaited<ReturnType<typeof snapshot>> | null = null;

test("C03-1 · chaîne réelle : calcul, détail d'un montant et sa preuve, revue, sélection pour une base PCG dite pont partiel, impôt non calculé, anomalies inchangées", async ({ browser }) => {
  const page = await signedInPage(browser, 1440);
  await expect(page.getByRole("heading", { level: 1, name: "Dossiers sur ce PC" })).toBeVisible();
  S.legalName = "Recette C03 SAS · " + new Date().toISOString().slice(0, 19);
  await page.getByLabel("Raison sociale").fill(S.legalName);
  await page.getByLabel("Exercice").fill("2026");
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Dossier créé/ })).toBeVisible();
  S.dossierId = (await api(page, "/api/local/dossiers")).body.dossiers.find((d: { legalName: string }) => d.legalName === S.legalName).id;
  const state = async () => head(await read(page)).state;

  await page.goto("/ifrs/locations?" + new URLSearchParams({ dossierId: S.dossierId }));
  await page.getByLabel("Début d'exercice").fill(LEASE_PERIOD.startDate);
  await page.getByLabel("Clôture").fill(LEASE_PERIOD.closingDate);
  await page.getByLabel("Date de revue").fill(LEASE_PERIOD.asOfDate);
  await page.getByRole("button", { name: "Ouvrir la feuille" }).click();
  await page.getByRole("button", { name: "Créer la feuille de l'exercice" }).click();
  await expect(page.getByText("Accusé serveur reçu")).toBeVisible();
  for (const [type, label] of LEASE_TYPES) {
    const file = await csv(type);
    await page.getByLabel("Type de source").selectOption(type);
    await page.getByLabel("Fichier CSV (Key ; Amount ; Date ; Details)").setInputFiles({ name: file.name, mimeType: "text/csv", buffer: Buffer.from(file.text, "utf8") });
    await page.getByRole("button", { name: "Lire et conserver l'aperçu" }).click();
    await page.getByRole("button", { name: /^Approuver cette version/ }).click();
    await expect(page.locator("section[aria-labelledby='l16-sources-title'] li").filter({ has: page.getByText(label, { exact: true }) })).toContainText("approuvée le");
  }
  await savePolicies(page);
  await page.getByRole("button", { name: "Figer la population" }).click();
  await expect.poll(state).toBe("ready");
  await page.getByRole("button", { name: "Calculer" }).click();
  await expect.poll(state).toBe("executed");
  S.rootId = head(await read(page)).rootId;

  // Detail of an amount and its proof: the inspector of F03 shows the closing debt and the cited source lines (file, line, fingerprint).
  await page.locator("section[aria-labelledby='l16-portfolio-title']").getByRole("button", { name: "F03", exact: true }).first().click();
  const inspector = page.getByLabel("Inspecteur — Contrat F03");
  await expect(inspector).toContainText(/22\s819,76/);
  await expect(inspector.getByRole("heading", { name: "Pièces citées" })).toBeVisible();
  await expect(inspector).toContainText(/EXEMPLE-lease_contracts\.csv · ligne \d+/);
  await capture(page, "inspecteur-f03-1440");
  await page.getByRole("button", { name: "Fermer l'inspecteur" }).click();

  const review = page.locator("section[aria-labelledby='l16-review-title']");
  await review.getByLabel("Conclusion de la feuille").fill("Dette et droit d'utilisation recalculés sur paramètres sourcés ; loyers cadrés sur la base PCG ; retraitement proposé, impôt non calculé.");
  await review.getByRole("button", { name: "Enregistrer la conclusion citée" }).click();
  await expect.poll(async () => !!head(await read(page)).conclusion).toBe(true);
  await review.getByRole("button", { name: "Soumettre à la relecture" }).click();
  await expect.poll(state).toBe("awaiting_review");
  await review.getByLabel("Note de relecture").fill("Relecture personnelle des paramètres, de l'échéancier, du cadrage et des preuves citées.");
  await review.getByRole("button", { name: "Approuver cette version" }).click();
  await expect.poll(state).toBe("approved");
  await review.getByRole("button", { name: "Verrouiller la version approuvée" }).click();
  await expect.poll(state).toBe("locked");
  // The reviewed export says what the workshop does not cover: partial bridge and no IFRS 18 presentation.
  const v = await read(page), r1 = head(v);
  const reviewedJson = await api(page, "/api/workpapers/locations-ifrs16/export?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }),
    { json: { id: r1.id, version: r1.version, expectedHash: v.contentHashes[r1.id], format: "json", kind: "reviewed" } });
  expect(reviewedJson.status).toBe(200);
  expect(JSON.stringify(reviewedJson.body)).toContain("Présentation IFRS 18 non préparée");
  expect(JSON.stringify(reviewedJson.body)).toContain("Pont partiel : le retraitement s'ajoute à une base PCG");

  await page.goto("/dossier-cloture?" + new URLSearchParams({ dossierId: S.dossierId, periodId: PID }));
  const openForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Ouvrir le dossier professionnel" }) });
  await openForm.getByLabel("Entité").fill(S.legalName);
  await openForm.getByLabel("Début d’exercice").fill(LEASE_PERIOD.startDate);
  await openForm.getByLabel("Clôture").fill(LEASE_PERIOD.closingDate);
  await openForm.getByLabel("Date de revue").fill(LEASE_PERIOD.asOfDate);
  await openForm.getByRole("button", { name: "Ouvrir le dossier" }).click();
  await page.getByRole("tab", { name: /^Programme/ }).click();
  const opened = (await api(page, closingUrl())).body;
  const works = page.getByRole("region", { name: /Travaux IFRS/ });
  await works.getByText("Sélectionner ce retraitement pour la base de l'exercice").click();
  await works.getByRole("button", { name: /^Sélectionner r1 · v\d+$/ }).click();
  await expect(works).toContainText("Sélectionné pour la base déclarée");
  await expect(works).toContainText("Pont partiel (partial_bridge) : base PCG plus le seul retraitement IFRS 16");
  await expect(works).toContainText("impôt non calculé");
  const selected = (await api(page, closingUrl())).body;
  // Never added to the misstatements, their totals or the C05 effects; the dossier denominators of the cycles are unchanged.
  expect(selected.projection.findings.totals).toEqual(opened.projection.findings.totals);
  expect(selected.projection.findings.events).toEqual(opened.projection.findings.events);
  expect(selected.projection.denominators.procedures).toEqual(opened.projection.denominators.procedures);
  expect(selected.projection.ifrsWorks.lineages[0].selection.base).toMatchObject({ baseKind: "PCG", bridge: { kind: "partial_bridge" } });
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await works.scrollIntoViewIfNeeded();
    expect(await noOverflow(page), "débordement clôture à " + width).toBe(true);
    expect(await axeSerious(page), "axe clôture à " + width).toEqual([]);
    await capture(page, "cloture-pont-partiel-" + width);
  }
  // The closing export, from the « Synthèse des travaux » tab, carries the same sentence as the screen.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("tab", { name: /^Synthèse des travaux/ }).click();
  const href = await page.getByRole("link", { name: "JSON canonique" }).getAttribute("href");
  const html = await page.evaluate(async url => (await fetch(url!)).text(), href!.replace("format=json", "format=html"));
  expect(html).toContain("Pont partiel (partial_bridge)");
  await page.context().close();
});

test("C03-2 · sélection rejouée sans double montant ; base qui inclut déjà le retraitement refusée", async ({ browser }) => {
  const page = await signedInPage(browser, 1440, sheetHref());
  const v = await read(page), r1 = head(v), closing = (await api(page, closingUrl())).body, lineage = closing.projection.ifrsWorks.lineages[0];
  const body = { command: "select_ifrs_bundle", procedure: "ifrs16.leases", rootId: S.rootId, runId: r1.id, version: r1.version, contentHash: v.contentHashes[r1.id], bundleHash: lineage.bundle.bundleHash,
    base: { includedAdjustments: { kind: "declared", identities: [] }, limits: "Base PCG de l'exercice ; pont partiel limité au retraitement IFRS 16, sans autre traitement IFRS" } };
  const replay = await api(page, closingUrl(), { json: { ...body, expectedSeq: closing.seq } });
  expect(replay.status, JSON.stringify(replay.body).slice(0, 300)).toBe(200);
  const after = (await api(page, closingUrl())).body.projection.ifrsWorks;
  expect(after.denominators).toEqual(closing.projection.ifrsWorks.denominators);
  expect(after.lineages[0].bundle).toEqual(lineage.bundle);
  expect(after.lineages[0].selection).toMatchObject({ status: "selectionne", runId: r1.id, bundleHash: lineage.bundle.bundleHash });
  const seq = (await api(page, closingUrl())).body.seq;
  const included = await api(page, closingUrl(), { json: { ...body, base: { ...body.base, includedAdjustments: { kind: "declared", identities: ["ifrs16:lease:F03"] } }, expectedSeq: seq } });
  expect(refusal(included).error).toBe("L16_BUNDLE_ALREADY_INCLUDED");
  const unknown = await api(page, closingUrl(), { json: { ...body, base: { ...body.base, includedAdjustments: { kind: "unknown", reason: "Base non examinée" } }, expectedSeq: seq } });
  expect(refusal(unknown).error).toBe("L16_BASE_UNKNOWN");
  expect((await api(page, closingUrl())).body.projection.ifrsWorks).toEqual(after);
  await page.context().close();
});

test("C03-3 · simulation ouverte (écran et export) : aucune version revue ni décision du dossier modifiée", async ({ browser }) => {
  const page = await signedInPage(browser, 1440, sheetHref());
  const reference = await snapshot(page);
  await page.goto("/ifrs/locations?demo=1");
  await expect(page.getByRole("note").filter({ hasText: "Simulation non revue" })).toBeVisible();
  // The profile server runs without the demonstration flag: the synthetic export is refused here by name (it is exported on the test server, C02 e2e).
  const demo = await page.evaluate(async () => { const r = await fetch("/api/workpapers/locations-ifrs16/demo/export?format=json", { cache: "no-store" }); return { status: r.status, body: await r.json().catch(() => null) }; });
  expect(demo.status === 200 || (demo.status === 503 && demo.body?.error === "DEMONSTRATION_DISABLED"), JSON.stringify(demo)).toBe(true);
  expect(await snapshot(page)).toEqual(reference);
  await page.context().close();
});

test("C03-4 · version du contrat F03 changée : feuille, retraitement et sélection à réexaminer ; la révision recalcule, F01 conservé à l'identique", async ({ browser }) => {
  const page = await signedInPage(browser, 1440, sheetHref());
  const r1 = head(await read(page));
  const toV2 = (rows: Record<LeaseType, LeaseRow[]>) => {
    for (const r of [...rows.lease_contracts, ...rows.lease_schedule]) if (r.details.contractId === "F03") r.details = { ...r.details, fields: { ...(r.details.fields as object), contractVersion: "v2" } };
  };
  await replaceSource(page, "lease_contracts", await csv("lease_contracts", toV2));
  await replaceSource(page, "lease_schedule", await csv("lease_schedule", toV2));
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Source remplacée — à réexaminer" })).toBeVisible();
  const stale = (await api(page, closingUrl())).body.projection.ifrsWorks.lineages[0];
  expect(stale.selection).toMatchObject({ status: "a_reexaminer", reasons: ["source remplacée ou ajoutée"] });

  // The revision starts without work in real mode: policies, freeze and calculation again, on the current sources.
  await page.getByRole("button", { name: "Créer une révision" }).click();
  await expect.poll(async () => head(await read(page)).revision).toBe(2);
  await savePolicies(page);
  await page.getByRole("button", { name: "Figer la population" }).click();
  await expect.poll(async () => head(await read(page)).state).toBe("ready");
  await page.getByRole("button", { name: "Calculer" }).click();
  await expect.poll(async () => head(await read(page)).state).toBe("executed");
  const v = await read(page), r2 = head(v), old = v.runs.find(r => r.id === r1.id)!;
  const by = (r: Run, id: string) => r.result!.result!.contracts.find(c => c.contractId === id)!;
  // F01 untouched: same fingerprint and same figures; F03: new version, new fingerprint, same amounts (a documentary version, no economic change).
  expect(by(r2, "F01").fingerprint).toBe(by(old, "F01").fingerprint);
  expect(by(r2, "F01").closing).toEqual(by(old, "F01").closing);
  expect([by(old, "F03").version, by(r2, "F03").version]).toEqual(["v1", "v2"]);
  expect(by(r2, "F03").fingerprint).not.toBe(by(old, "F03").fingerprint);
  // r1 stays locked with its proofs; the comparison on screen names the only fact observed, on F03 only.
  expect(old.state).toBe("locked");
  const comparison = page.getByRole("region", { name: /Comparaison de versions/ });
  await expect(comparison.getByRole("row").filter({ hasText: "F03" })).toContainText("version du contrat v1 → v2");
  await expect(comparison.getByRole("row").filter({ hasText: "F01" })).toContainText("aucun changement observé");
  await comparison.scrollIntoViewIfNeeded();
  await capture(page, "comparaison-r1-r2-1440");
  // Closing: head r2 not reviewed, r1 kept as a previous revision, the selection of r1 still to re-examine; nothing selectable yet.
  const works = (await api(page, closingUrl())).body.projection.ifrsWorks;
  expect(works.lineages[0]).toMatchObject({ revision: 2, state: "executed", selection: { status: "a_reexaminer", runId: r1.id }, previous: [{ runId: r1.id, revision: 1, state: "locked" }] });
  expect(works.lineages[0].bundle.bundleHash).not.toBe(stale.bundle.bundleHash);
  await page.context().close();
});

test("C03-5 · sauvegarde puis restauration dans un profil distinct : sources, versions, décisions et liens relus à l'identique ; profil d'origine inchangé", async ({ browser }) => {
  const page = await signedInPage(browser, 1440, sheetHref());
  before = await snapshot(page);
  await page.context().close();
  const saved = local.launcher(HOME, "backup", ["--label", "recette-c03"]);
  expect(saved.status, saved.out).toBe(0);
  const dir = /Sauvegarde cohérente : (.+?) \(/.exec(saved.out)?.[1];
  expect(dir, saved.out).toBeTruthy();
  const target = path.join(path.dirname(HOME), "profil-c03-restaure-" + Date.now());
  const restored = local.launcher(HOME, "restore", [dir!, "--vers", target]);
  expect(restored.status, restored.out).toBe(0);
  expect(restored.out).toContain("Restauration vérifiée");
  const cfg = local.profileConfig(target);
  expect(cfg.restoredFrom).toContain(dir!);
  expect(cfg.app.port).not.toBe(local.profileConfig(HOME).app.port);
  const started = local.launcher(target, "start", ["--sans-navigateur"]);
  try {
    expect(started.status, started.out).toBe(0);
    expect(started.out).toContain("Profil restauré depuis");
    const copy = await signedInPage(browser, 1440, sheetHref(), target);
    await expect(copy.getByRole("heading", { level: 1, name: "Locations IFRS 16" })).toBeVisible();
    expect(new URL(copy.url()).port).toBe(String(cfg.app.port));
    expect(await snapshot(copy)).toEqual(before);
    await copy.context().close();
  } finally {
    const stopped = local.launcher(target, "stop");
    expect(stopped.status, stopped.out).toBe(0);
  }
  expect(await portOpen(cfg.app.port)).toBe(false);
  // The original profile is still the one serving, unchanged by the backup and the restore.
  const original = await signedInPage(browser, 1440, sheetHref());
  expect(await snapshot(original)).toEqual(before);
  expect(JSON.parse(readFileSync(path.join(target, "restauration.json"), "utf8")).differences).toEqual([]);
  await original.context().close();
});
