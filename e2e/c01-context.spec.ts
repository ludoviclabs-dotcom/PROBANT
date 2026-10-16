import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { clientMissionFixture } from "../lib/workpapers/__tests__/client-mission-fixture";
import { buildClientMission } from "../lib/workpapers/client-mission";
import { buildSnapshotFromFecDepot } from "../lib/dossier/snapshot-builder";
import { computeDossierSnapshotHash } from "../lib/dossier/snapshot-state";
import { contextParams, navigationContext } from "../lib/dossier/navigation-context";
import { contentHash, periodId } from "../lib/workpapers/model";
import { linkImportedEvidence } from "../lib/workpapers/evidence";
const output = `docs/recette/c01/${process.env.PROBANT_C01_PHASE ?? "after"}`;
const org = "22222222-2222-4222-8222-222222222222", nextDossier = "33333333-3333-4333-8333-333333333333";
const pendingRequests = new WeakMap<Page, Map<unknown, string>>();
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const requests = new Map<unknown, string>(); pendingRequests.set(page, requests);
  page.on("request", r => requests.set(r, r.url()));
  page.on("requestfinished", r => requests.delete(r)); page.on("requestfailed", r => requests.delete(r));
});
async function record(page: Page, info: TestInfo, name: string) {
  const timer = setTimeout(() => { void writeFile(`${output}/${name}-pending.json`, JSON.stringify({ observedAt: new Date().toISOString(), url: page.url(), pending: [...(pendingRequests.get(page)?.values() ?? [])] }, null, 2)); }, 5000);
  try { await page.waitForLoadState("networkidle"); } finally { clearTimeout(timer); }
  await page.evaluate(() => document.fonts.ready);
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
  const state = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run(c: unknown, o: unknown): Promise<{ violations: { id: string; impact: string; nodes: { target: string[]; failureSummary?: string }[] }[] }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, violations: result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, failureSummary: n.failureSummary })) })) };
  });
  await mkdir(output, { recursive: true }); await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  await page.screenshot({ path: `${output}/${name}-viewport.png` });
  const file = `${output}/${name}.json`; await writeFile(file, JSON.stringify({ observedAt: new Date().toISOString(), browser: page.context().browser()?.version(), method: "compiled local Next / existing WorkpaperService fixtures / HTTP interception / reduced motion / stable fonts and network / axe WCAG AA", url: page.url(), ...state }, null, 2));
  await info.attach(name, { path: file, contentType: "application/json" });
  expect.soft(state.scrollWidth).toBeLessThanOrEqual(state.viewport);
  expect.soft(state.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
}
async function localFixture(page: Page) {
  const original = await clientMissionFixture();
  const f = JSON.parse(JSON.stringify(original).replaceAll("real-organization", org)) as typeof original;
  const actor = { id: f.run.preparedBy, grants: [{ scope: f.scope, permissions: ["read", "prepare"] as ("read" | "prepare")[] }] };
  const evidence = f.imports.map(b => linkImportedEvidence(f.run, b, b.rows[0].id, "Source du cadrage Clients", actor));
  f.run = { ...f.run, evidence }; f.run.submittedHash = contentHash(f.run);
  f.approved = { ...f.approved, evidence, approval: { ...f.approved.approval!, snapshotHash: contentHash(f.run) } };
  f.locked = { ...f.locked, evidence, approval: f.approved.approval };
  function snapshot(id: string, year: string) {
    const value = buildSnapshotFromFecDepot({ dossierId: id, nomFichier: `fixture-${year}.txt`, fingerprint: `fixture-${year}`, siren: "123456789", referentielVersion: "fixture-pcg", admissibilite: [], analyse: [], entries: [], entriesTruncated: false, generatedAt: "2025-02-01T00:00:00Z" });
    value.sourceKind = "persistent"; value.dossier = { ...value.dossier, organizationId: org, period: { ...f.locked.period, startDate: `${year}-01-01`, closingDate: `${year}-12-31`, asOfDate: `${Number(year) + 1}-02-01` }, societe: { raisonSociale: "ENTITÉ LOCALE · fixture de recette", siren: "123456789", exercice: year, dateCloture: `${year}1231` } };
    value.snapshotHash = computeDossierSnapshotHash(value); return value;
  }
  const a = snapshot(f.scope.dossierId, "2024"), b = snapshot(nextDossier, "2025");
  const contexts = [a, b].map(s => ({ organizationId: org, dossierId: s.dossier.id }));
  await page.addInitScript(({ snapshots, contexts, org }) => {
    sessionStorage.setItem(`probant:dossier:v1:index:${encodeURIComponent(org)}`, JSON.stringify(contexts));
    for (const s of snapshots) sessionStorage.setItem(`probant:dossier:v1:snapshot:${encodeURIComponent(org)}:${encodeURIComponent(s.dossier.id)}`, JSON.stringify(s));
  }, { snapshots: [a, b], contexts, org });
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "synthetic-c01" } }));
  await page.route("**/api/dossiers/*/snapshot", r => r.fulfill({ json: r.request().url().includes(nextDossier) ? b : a }));
  await page.route("**/api/workpapers/clients?**", r => {
    const q = new URL(r.request().url()).searchParams, first = q.get("dossierId") === f.scope.dossierId;
    const scope = first ? f.scope : { ...f.scope, dossierId: nextDossier, periodId: periodId(b.dossier.period!) };
    if (q.get("operation") === "mission") return r.fulfill({ json: { actorId: "fixture-reviewer", permissions: ["read", "download"], mission: buildClientMission(scope, first ? [f.run, f.approved, f.locked] : [], first ? f.imports : [], first ? f.heads : []) } });
    return r.fulfill({ json: { actorId: "fixture-reviewer", permissions: ["read", "download"], runs: first ? [f.locked] : [], imports: first ? f.imports : [], sourceHeads: first ? f.heads : [], sourcesCurrent: { [f.locked.id]: true }, currentVersions: { [f.locked.id]: 12 } } });
  });
  return { f, a: navigationContext(a, contexts[0]), b: navigationContext(b, contexts[1]) };
}

/** Les lignes du registre se déplient à la demande : on ouvre d'abord tout le registre si besoin, puis la ligne du cycle. */
async function openCycle(page: Page, label: string) {
  // Le registre compte toujours plus de cinq cycles : le bouton attend son rendu (aucune lecture instantanée du DOM).
  await page.getByRole("button", { name: /^Afficher les \d+ cycles$/ }).click();
  const row = page.getByRole("button", { name: label, exact: true });
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
}
for (const width of [390, 1024, 1440]) {
  test(`C01 Synthèse → Clients → preuve → retour, sans ressaisie, ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); const f = await localFixture(page);
    await page.goto("/dashboard/synthese?" + contextParams(f.a));
    await expect(page.getByRole("heading", { name: "Registre des cycles du dossier" })).toBeVisible();
    await openCycle(page, "Clients et ventes");
    await page.getByRole("link", { name: "Synthèse des procédures — cadrage Clients", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Revue et Synthèse Clients" })).toBeVisible();
    const url = new URL(page.url()); expect(url.searchParams.get("dossierId")).toBe(f.a.dossierId); expect(url.searchParams.get("periodId")).toBe(f.a.procedurePeriod!.id);
    await page.getByRole("button", { name: /Examiner les preuves de/ }).first().click();
    await expect(page.getByRole("complementary", { name: "Panneau de preuve" })).toContainText("clients_general.csv");
    await record(page, info, `clients-proof-${width}`);
    await page.getByRole("link", { name: "Ouvrir la feuille pilote", exact: true }).click();
    await expect(page.getByText(/Examen de la version 12/)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("version")).toBe("12");
    await page.getByRole("link", { name: "Retour à la Synthèse", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Registre des cycles du dossier" })).toBeVisible(); expect(new URL(page.url()).searchParams.get("exercise")).toBe("2024");
    await record(page, info, `returned-synthesis-${width}`);
  });
  test(`C01 changement d’exercice et feuille absente, ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); const f = await localFixture(page);
    await page.goto("/clients-framing/synthesis?" + contextParams(f.a)); await expect(page.getByRole("heading", { name: "Revue et Synthèse Clients" })).toBeVisible();
    await page.getByRole("combobox", { name: "Dossier et exercice", exact: true }).selectOption(nextDossier);
    await expect(page.getByRole("heading", { name: "Aucune feuille Clients pour ce dossier et cet exercice" })).toBeVisible();
    const q = new URL(page.url()).searchParams; expect(q.get("exercise")).toBe("2025"); expect(q.get("periodId")).toBe(f.b.procedurePeriod!.id);
    for (const key of ["id", "version", "rootId", "item"]) expect(q.has(key)).toBe(false);
    await expect(page.getByText("Cadrage revu, exceptions maintenues.", { exact: true })).toHaveCount(0);
    await record(page, info, `missing-sheet-${width}`);
    if (width === 390) {
      const programme = page.getByRole("region", { name: "Programme des procédures — défilement clavier", exact: true });
      await programme.focus(); await expect(programme).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => programme.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
    await page.getByRole("link", { name: "Initialiser explicitement la feuille Clients" }).click();
    await page.getByText("Détails du dossier et dates de revue", { exact: true }).click();
    await expect(page.getByLabel("Dossier", { exact: true })).toHaveValue(nextDossier);
    await expect(page.getByLabel("Dossier", { exact: true })).toHaveAttribute("readonly", "");
    expect(await page.locator('input[type="date"]').first().inputValue()).toBe("2025-01-01");
  });
  test(`C01 Stocks et atelier historiques qualifiés, ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 }); await page.goto("/dashboard/synthese");
    await openCycle(page, "Stocks");
    await page.getByRole("link", { name: "Feuille Stocks", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Stocks", exact: true })).toBeVisible();
    await expect(page.getByText(/Aucune feuille persistante n’est rattachée/)).toBeVisible();
    // Registry 1.1.0 (C08): counted sheets are transcribed, costs declared, no depreciation nor provision is automatic.
    await expect(page.getByText("Feuilles de comptage transcrites et état théorique à la clôture", { exact: true })).toBeVisible();
    await expect(page.getByText(/Coûts CUMP \/ PEPS déclarés, non reconstitués/)).toBeVisible();
    await expect(page.getByText(/Aucune dépréciation ni provision automatique/)).toBeVisible();
    await record(page, info, `historical-stocks-${width}`);
    await page.getByRole("link", { name: "Retour à la Synthèse", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Registre des cycles du dossier" })).toBeVisible();
    await page.locator("details#methode > summary").click();
    await page.getByText("Disponibilité et limites de l’atelier par module", { exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: "Stocks · atelier" })).toContainText("Absent de cet atelier");
    await record(page, info, `workshop-scope-${width}`);
  });
}
test("C01 dossier absent ou exercice incompatible : aucun repli sur DEMO SA", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 }); const f = await localFixture(page);
  const q = contextParams(f.a); q.set("exercise", "2026");
  await page.goto("/dashboard/synthese?" + q);
  await expect(page.getByRole("heading", { name: "Dossier indisponible" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "aucune version n’a été mélangée" })).toBeVisible();
  await expect(page.getByText("DEMO SA", { exact: true })).toHaveCount(0);
  await record(page, info, "mismatched-exercise");
  await page.unroute("**/api/dossiers/*/snapshot"); await page.route("**/api/dossiers/*/snapshot", r => r.fulfill({ status: 404, json: {} }));
  await page.goto("/dashboard/synthese?" + contextParams(f.a));
  await expect(page.getByRole("heading", { name: "Dossier indisponible" })).toBeVisible();
  await expect(page.getByText("DEMO SA", { exact: true })).toHaveCount(0); await record(page, info, "missing-dossier");
});
test("C01 recette indépendante identifiée et retour au dossier sélectionné", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 }); const f = await localFixture(page);
  await page.goto("/dashboard/synthese?" + contextParams(f.a));
  await expect(page.getByRole("heading", { name: "Registre des cycles du dossier" })).toBeVisible();
  await page.goto("/equity?demo=1");
  await expect(page.getByText(/Exemple synthétique, séparé des constats historiques/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Contexte du dossier" })).toHaveCount(0);
  await page.getByRole("link", { name: "Synthèse du dossier", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registre des cycles du dossier" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ENTITÉ LOCALE · fixture de recette", exact: true })).toBeVisible();
  expect(f.a.dossierId).not.toBe(nextDossier);
  await record(page, info, "independent-recipe-return");
});
