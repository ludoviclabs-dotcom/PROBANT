import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { WorkpaperRun } from "../lib/workpapers/model";
import { receivablesPresentationFixture } from "../components/probant/__tests__/client-receivables-fixture";
import type { ClientsSalesFacts, ClientsSalesDraft } from "../lib/workpapers/clients-sales";
// Presentation recipe with explicit server responses. PostgreSQL tests cover authorization and durable mutation semantics.
async function checkAccessibility(page: Page) { await page.addScriptTag({ path: path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js") }); const violations = await page.evaluate(async () => { const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe; const results = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }); return results.violations.filter(v => v.impact === "critical" || v.impact === "serious").map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })); }); expect(violations).toEqual([]); }
async function presentation(page: Page, onPost?: (input: Record<string, unknown>) => Promise<{ status?: number; body: unknown }>) {
  const f = receivablesPresentationFixture();
  const state: { run: WorkpaperRun; facts: ClientsSalesFacts; expired: boolean } = { run: f.run, facts: f.facts, expired: false };
  await page.route("**/api/auth/session", r => state.expired ? r.fulfill({ status: 401, json: { authenticated: false } }) : r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/clients?**", async r => {
    if (r.request().method() === "POST") {
      const input = r.request().postDataJSON();
      expect(input).not.toHaveProperty("actorId"); expect(input).not.toHaveProperty("role");
      if (!onPost) throw new Error("Unexpected mutation in read presentation recipe");
      const response = await onPost(input); return r.fulfill({ status: response.status ?? 200, json: response.body });
    }
    return r.fulfill({ json: { actorId: "actual-preparer", permissions: ["read", "prepare", "download"], runs: [state.run], imports: [], sourceHeads: [], salesFacts: { [state.run.id]: state.facts }, sourcesCurrent: { [state.run.id]: true }, currentVersions: { [state.run.id]: state.run.version }, lineageCurrent: { [state.run.rootId]: { id: state.run.id, revision: state.run.revision, version: state.run.version } } } });
  });
  await page.goto("/clients-framing?" + new URLSearchParams({ dossierId: f.run.scope.dossierId, periodId: f.run.scope.periodId, id: f.run.id }));
  const table = page.getByRole("region", { name: "Factures Clients — défilement clavier" });
  await expect(table).toContainText("INV-1000");
  return { ...f, state, table };
}
test("Clients et ventes : 1 000 / 300 / 700, preuve et proposition distincte avant l’accusé serveur", async ({ page }) => {
  let release: () => void = () => {};
  const ack = new Promise<void>(resolve => { release = resolve; });
  let request: Record<string, unknown> | null = null;
  let server: { run: WorkpaperRun } | null = null;
  const f = await presentation(page, async input => { request = input; await ack; const draft = input.draft as ClientsSalesDraft, previous = server!.run; server!.run = { ...previous, version: 7, state: "ready", result: undefined, clientsWork: { ...previous.clientsWork!, ...draft, window: { ...draft.window, documentVersionIds: previous.clientsWork!.window.documentVersionIds }, allocations: draft.allocations.map(a => ({ ...a, authorId: "actual-preparer", authoredAt: "2025-03-01T12:05:00Z" })), estimates: [], confirmations: [] } }; return { body: { run: server!.run } }; });
  server = f.state;
  const invoice = f.table.getByRole("row", { name: /Client A.*INV-1000/ });
  await expect(invoice).toContainText("1000.00 EUR"); await expect(invoice).toContainText("300.00 EUR"); await expect(invoice).toContainText("700.00 EUR");
  await expect(invoice).toContainText("jours depuis facture"); await expect(invoice).toContainText("Échéance inconnue");
  await expect(page.getByRole("complementary", { name: "Preuves de la facture" })).toContainText("factures.csv");
  await expect(page.getByText("Allocation validée par actual-preparer", { exact: false })).toBeVisible();
  await checkAccessibility(page);
  await f.table.screenshot({ path: "e2e/.artifacts/clients-sales-invoices.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await f.table.screenshot({ path: "e2e/.artifacts/clients-sales-mobile.png" });
  const layout = await page.evaluate(() => { const outside = Array.from(document.querySelectorAll("main *")).filter(el => { const rect = el.getBoundingClientRect(); if (!rect.width || rect.right <= window.innerWidth) return false; let parent = el.parentElement; while (parent) { if (["auto", "scroll", "hidden"].includes(getComputedStyle(parent).overflowX)) return false; parent = parent.parentElement; } return true; }).map(el => ({ tag: el.tagName, text: el.textContent?.slice(0, 90), right: Math.round(el.getBoundingClientRect().right) })); return { width: document.documentElement.scrollWidth, outside }; });
  expect(layout.width, JSON.stringify(layout.outside)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Revenir à une proposition" }).click();
  await expect(page.getByText("Proposition d’appariement", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sauvegarder allocations et jugement" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sauvegarde en cours…" })).toBeVisible();
  await expect(invoice).toContainText("700.00 EUR");
  await expect(page.getByRole("status").filter({ hasText: "Sauvegardée — accusé serveur reçu" })).toHaveCount(0);
  release();
  await expect(page.getByRole("status").filter({ hasText: "Sauvegardée — accusé serveur reçu" })).toBeVisible();
  expect(request).toMatchObject({ command: "configure_sales", expectedVersion: 6, draft: { allocations: [{ status: "proposed" }] } });
  expect(JSON.stringify(request)).not.toContain("authorId");
  await page.getByRole("tab", { name: "Litiges et estimation" }).click();
  await expect(page.getByText("Méthode absente : estimation non étayée, incertitude maintenue.")).toBeVisible();
  await page.getByRole("tab", { name: "Confirmations et preuves" }).click();
  await expect(page.getByText(/Ce suivi n’envoie aucun message externe/)).toBeVisible();
  await page.getByRole("tab", { name: "Allocations et résiduels" }).click();
});
test("Clients : annulation et avoir à la revue conservent la clôture dans la table et la frise", async ({ page }) => {
  const f = await presentation(page);
  const creditProof = { ...f.facts.invoices[0].evidence[0], id: "proof-credit", documentVersionId: "document-credits", rowId: "row-credit", purpose: "Avoir postérieur importé" };
  const credit = { id: "CREDIT-50", invoiceId: "INV-1000", customerId: "Client A", amount: { amount: "50.00", currency: "EUR" as const }, issuedOn: "2025-02-01", evidence: [creditProof] };
  f.state.facts = { ...f.facts, credits: [credit], sourceOptions: [...f.facts.sourceOptions, { importId: "import-credits", rowId: "row-credit", documentVersionId: "document-credits", fileName: "avoirs.csv", label: "CREDIT-50", locator: { row: 2 }, kind: "clients_credits" }] };
  const result = { ...f.result, credits: [{ ...credit, status: "applied" }], rows: f.result.rows.map(row => ({ ...row, subsequentPayments: { amount: "0.00", currency: "EUR" }, subsequentCredits: { amount: "50.00", currency: "EUR" }, dueAtReview: { amount: "950.00", currency: "EUR" }, timeline: [...row.timeline, { id: "cancellation", date: "2025-01-20", kind: "cancellation", label: "Annulation après clôture PAY-300", amount: { kind: "known", value: { amount: "300.00", currency: "EUR" } }, proofIds: [], effect: "review" }, { id: "credit", date: "2025-02-01", kind: "credit", label: "Avoir postérieur CREDIT-50", amount: { kind: "known", value: { amount: "50.00", currency: "EUR" } }, proofIds: [creditProof.id], effect: "review" }] })), payments: f.result.payments.map(payment => ({ ...payment, cancelledOn: "2025-01-20" })) };
  f.state.run = { ...f.run, version: 7, result: { ...f.run.result!, result } };
  await page.getByRole("button", { name: "Charger le cadrage", exact: true }).click();
  await expect(page.getByText("Annulation après clôture PAY-300", { exact: true })).toBeVisible();
  const row = f.table.getByRole("row", { name: /Client A.*INV-1000/ }), cells = row.getByRole("cell");
  await expect(cells.nth(1)).toHaveText("1000.00 EUR"); await expect(cells.nth(3)).toHaveText("50.00 EUR"); await expect(cells.nth(4)).toHaveText("950.00 EUR");
  await expect(page.getByText("Avoir postérieur CREDIT-50", { exact: true })).toBeVisible();
  await expect(page.getByText("Solde ouvert à la clôture : 1000.00 EUR")).toBeVisible();
});
test("Clients : allocation refusée et session expirée conservent les montants serveur", async ({ page }) => {
  const f = await presentation(page, async input => { expect(input.command).toBe("configure_sales"); return { status: 422, body: { error: "ALLOCATION_PARTY_MISMATCH" } }; });
  await page.getByRole("button", { name: "Sauvegarder allocations et jugement" }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(f.table).toContainText("700.00 EUR");
  await expect(page.getByRole("status").filter({ hasText: "Échec de sauvegarde" })).toBeVisible();
  f.state.expired = true;
  await page.getByRole("button", { name: "Sauvegarder allocations et jugement" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Session requise ou expirée");
  await expect(f.table).toContainText("1000.00 EUR"); await expect(f.table).toContainText("700.00 EUR");
});
