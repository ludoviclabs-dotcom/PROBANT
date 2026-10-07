import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { buildClientMission } from "../lib/workpapers/client-mission";
import { buildClientMissionPackage } from "../lib/evidence/client-mission-package";
import type { WorkpaperRun } from "../lib/workpapers/model";
import { clientMissionFixture } from "../lib/workpapers/__tests__/client-mission-fixture";
// Browser presentation contract. Durable identity/ACL/concurrency are exercised separately on PostgreSQL CI.
test("Synthèse Clients : programme, résidus après revue, preuve, version exacte et HTML concordant", async ({ page }) => {
  const f = await clientMissionFixture(), versions = [f.run, f.approved, f.locked];
  const mission = buildClientMission(f.scope, versions, f.imports, f.heads);
  const pack = await buildClientMissionPackage(mission, f.locked, f.imports, "approved", "2025-02-03T00:00:00Z");
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/clients?**", r => {
    const q = new URL(r.request().url()).searchParams;
    if (q.get("operation") === "mission") return r.fulfill({ json: { actorId: "actual-reviewer", permissions: ["read","review","download"], mission } });
    if (q.get("operation") === "download") return r.fulfill({ body: "original séparé", contentType: "application/octet-stream" });
    const selected = q.get("operation") === "version" ? versions.find(v => v.version === Number(q.get("version")))! : f.locked;
    return r.fulfill({ json: { actorId: "actual-reviewer", permissions: ["read","review","download"], runs: [selected], imports: [], sourceHeads: f.heads, sourcesCurrent: { [selected.id]: true }, currentVersions: { [selected.id]: 12 } } });
  });
  await page.route("**/api/workpapers/clients/export", r => {
    const input = r.request().postDataJSON();
    expect(input).toEqual({ dossierId: f.scope.dossierId, periodId: f.scope.periodId, rootId: f.run.rootId, id: f.locked.id, version: 12, kind: "approved", format: "html", expectedSnapshotHash: mission.hash });
    return r.fulfill({ body: pack.html, headers: { "Content-Type": "text/html;charset=utf-8", "X-Probant-Snapshot": mission.hash, "Content-Disposition": 'attachment; filename="clients-approved.html"' } });
  });
  await page.goto("/clients-framing/synthesis?" + new URLSearchParams({ dossierId: f.scope.dossierId, periodId: f.scope.periodId }));
  await expect(page.getByText("1/1 procédure exécutée")).toBeVisible();
  await page.getByRole("button", { name: "Exceptions à expliquer" }).click();
  await expect(page.getByText("Exception maintenue", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Examiner les preuves de A" }).click();
  await expect(page.getByRole("complementary", { name: "Panneau de preuve" })).toContainText("ligne");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "HTML imprimable", exact: true }).nth(1).click()]);
  const html = await readFile((await download.path())!, "utf8");
  expect(html).toBe(pack.html); expect(html).toContain("Exceptions maintenues"); expect(html).toContain(mission.hash);
  await page.screenshot({ path: "e2e/.artifacts/clients-mission-synthesis.png", fullPage: true });
  await page.getByRole("link", { name: "Ouvrir la feuille v12", exact: true }).first().click();
  await expect(page.getByText(/Examen de la version 12 · version courante 12/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Exceptions", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Approuver le cadrage" })).toHaveCount(0);
});
test("Feuille Clients : traitement documenté après accusé, animation courte, focus et position conservés", async ({ page }) => {
  const f = await clientMissionFixture();
  let run: WorkpaperRun = { ...f.run, state: "executed" as const, submittedHash: undefined, notes: f.run.notes.map(n => ({ ...n, resolution: undefined })) };
  let releaseAck: () => void = () => {};
  const ack = new Promise<void>(resolve => { releaseAck = resolve; });
  await page.route("**/api/auth/session", r => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/clients?**", async r => {
    if (r.request().method() === "POST") {
      const input = r.request().postDataJSON(); expect(input.command).toBe("resolve");
      await ack;
      run = { ...run, version: run.version + 1, notes: run.notes.map(n => ({ ...n, resolution: { text: input.text, authorId: "actual-preparer", at: "2025-02-01T00:00:00Z" } })) };
      return r.fulfill({ json: { run } });
    }
    return r.fulfill({ json: { actorId: "actual-preparer", permissions: ["read","prepare","download"], runs: [run], imports: [], sourceHeads: f.heads, sourcesCurrent: { [run.id]: true } } });
  });
  await page.goto("/clients-framing?" + new URLSearchParams({ dossierId: f.scope.dossierId, periodId: f.scope.periodId }));
  await page.getByLabel("Commentaire ou justification").fill("Explication documentée du résidu");
  const button = page.getByRole("button", { name: "Documenter le traitement avec ce texte" });
  await button.focus(); await button.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  await button.click();
  await expect(page.getByRole("status").filter({ hasText: "Sauvegarde en cours…" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Traitement documenté : Explication documentée du résidu" })).toHaveCount(0);
  releaseAck();
  await expect(page.getByRole("button", { name: "Traitement documenté : Explication documentée du résidu" })).toBeFocused();
  const after = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })); expect(after).toEqual(before);
});
