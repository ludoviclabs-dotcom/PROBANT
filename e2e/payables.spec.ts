import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { fixture, presentationRun } from "../lib/workpapers/__tests__/payables-fixture";
import { buildPayablesFacts, type PayablesDraft } from "../lib/workpapers/payables-investigation";
import { buildPayablesMission } from "../lib/workpapers/payables-mission";
import type { WorkpaperRun } from "../lib/workpapers/model";
// Presentation only. The native PostgreSQL recipe exercises identity, storage, commands and access.
async function setup(page: Page, onPost?: (input: Record<string, unknown>) => Promise<{
    status?: number;
    body: unknown;
}>) {
    const f = await fixture(), state = { run: presentationRun(f), expired: false }, facts = buildPayablesFacts(f.scope, f.period, f.imports, "RUN", f.procedure);
    const uiFacts = { invoices: facts.events.map(e => ({ id: e.id, party: e.party, flow: e.flow, net: e.net, tax: e.tax, gross: e.gross, proofRowId: e.row.id })), payments: facts.payments.map(p => ({ id: p.id, party: p.party, amount: p.value.amount, date: p.value.date, rowId: p.value.source.id })), ledger: [], proofRows: f.imports.flatMap(b => b.rows.map(r => ({ id: r.id, key: r.normalized!.key, type: b.document.documentType }))), issue: null };
    await page.route("**/api/auth/session", r => r.fulfill({ status: state.expired ? 401 : 200, json: state.expired ? { authenticated: false } : { authenticated: true, csrfToken: "test-csrf" } }));
    await page.route("**/api/workpapers/payables?**", async (r) => { if (r.request().method() === "POST") {
        const input = r.request().postDataJSON();
        expect(input).not.toHaveProperty("actorId");
        expect(input).not.toHaveProperty("role");
        if (!onPost)
            throw new Error("Unexpected mutation");
        const response = await onPost(input);
        return r.fulfill({ status: response.status ?? 200, json: response.body });
    } return r.fulfill({ json: { actorId: "real-preparer", permissions: ["read", "prepare", "download"], runs: [state.run], imports: f.imports, sourceHeads: f.imports.map(b => ({ document_type: b.document.documentType, import_id: b.id })), facts: { RUN: uiFacts }, sourcesCurrent: { RUN: true }, currentVersions: { RUN: state.run.version }, lineageCurrent: { RUN: { id: "RUN", version: state.run.version } } } }); });
    await page.goto("/payables?" + new URLSearchParams({ dossierId: f.scope.dossierId, periodId: f.scope.periodId, id: "RUN" }));
    const table = page.getByRole("region", { name: "Investigation — défilement clavier" });
    await expect(table).toContainText("I-U");
    return { f, state, table };
}
async function axe(page: Page) { await page.addScriptTag({ path: path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js") }); const violations = await page.evaluate(async () => { const a = (window as unknown as {
    axe: {
        run: (context: unknown, options: unknown) => Promise<{
            violations: {
                id: string;
                impact: string;
                nodes: {
                    target: string[];
                }[];
            }[];
        }>;
    };
}).axe; return (await a.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter(v => ["critical", "serious"].includes(v.impact)).map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })); }); expect(violations).toEqual([]); }
test("Achats / RPNE : cinq cas, unités, preuve et écran mobile", async ({ page }, info) => {
    const { table } = await setup(page);
    const u = table.getByRole("row", { name: /S.*I-U/ });
    await expect(u).toContainText("Candidat omission");
    await expect(u).toContainText("1200.00 EUR");
    await expect(u).toContainText("1000.00 EUR");
    await expect(table.getByRole("row", { name: /S.*I-F/ })).toContainText("FNP existante");
    await expect(table.getByRole("row", { name: /S.*I-G/ })).toContainText("600.00 EUR");
    await expect(table.getByRole("row", { name: /S.*I-G/ })).toContainText("Non concluant");
    await expect(table.getByRole("row", { name: /S.*I-N/ })).toContainText("Non concluant");
    await table.getByRole("button", { name: "Examiner I-U", exact: true }).click();
    const proof = page.getByRole("complementary", { name: "Panneau de preuve" });
    await expect(proof).toContainText("2024-12-20");
    await expect(proof).toContainText("2025-01-20");
    await expect(proof).toContainText("Allocation validée TTC");
    await axe(page);
    await page.locator("main").screenshot({ path: info.outputPath("payables-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("main").screenshot({ path: info.outputPath("payables-mobile.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test("Achats / RPNE : sauvegarde attend l’accusé, conserve focus et auteur serveur", async ({ page }) => {
    let release: () => void = () => { };
    const ack = new Promise<void>(r => release = r);
    const state:{value?:{run:WorkpaperRun}}={};
    let request: Record<string, unknown> | undefined;
    const f = await setup(page, async (input) => { request = input; await ack; state.value!.run = { ...state.value!.run, state: "ready", version: 2, result: undefined, payablesWork: { ...(input.draft as PayablesDraft), schemaVersion: "payables-investigation-1", authorId: "real-preparer", authoredAt: "2025-02-01T12:00:00.000Z" } }; return { body: { run: state.value!.run } }; });
    state.value = f.state;
    const note = page.getByLabel("Note de méthode");
    await note.fill("Méthode corrigée, preuves conservées.");
    await note.focus();
    await page.getByRole("button", { name: "Sauvegarder la préparation", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Sauvegarde en cours…");
    await expect(page.getByText("Sauvegardée — accusé serveur reçu", { exact: true })).toHaveCount(0);
    release();
    await expect(page.getByRole("status")).toHaveText("Sauvegardée — accusé serveur reçu");
    expect(JSON.stringify(request)).not.toContain("authorId");
    await expect(page.getByText(/Version affichée 2/)).toBeVisible();
});
test("Achats / RPNE : conflit compare les préparations sans perdre le brouillon ; session expirée", async ({ page }) => {
    const server:{run?:WorkpaperRun}={};
    const f = await setup(page, async () => ({ status: 409, body: { error: "VERSION_CONFLICT", current: { ...server.run!, version: 2, payablesWork: { ...server.run!.payablesWork!, method: { ...server.run!.payablesWork!.method, note: "Méthode modifiée sur le serveur" } } } } }));
    server.run = f.state.run;
    await page.getByLabel("Note de méthode").fill("Ma préparation locale");
    await page.getByRole("button", { name: "Sauvegarder la préparation", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Conflit de modification/ })).toBeVisible();
    await expect(page.getByLabel("Note de méthode")).toHaveValue("Ma préparation locale");
    await expect(page.getByText("Méthode modifiée sur le serveur", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Conserver ma préparation sur la nouvelle base" }).click();
    await expect(page.getByLabel("Note de méthode")).toHaveValue("Ma préparation locale");
    f.state.expired = true;
    await page.getByRole("button", { name: "Sauvegarder la préparation", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("Session requise");
});
test("Cut-off : événement double unique, filtres ventes / achats et versions exactes", async ({ page }, info) => {
    const a = await fixture("payables.purchases"), b = await fixture(), runs = [presentationRun(a, "PURCHASES"), presentationRun(b)], imports = [...new Map([...a.imports, ...b.imports].map(b => [b.id, b])).values()], m = buildPayablesMission(a.scope, runs, imports, imports.map(b => ({ document_type: b.document.documentType, import_id: b.id })));
    await page.route("**/api/workpapers/payables?**", r => r.fulfill({ json: { actorId: "real-preparer", permissions: ["read", "download"], mission: m } }));
    await page.goto("/cutoff?" + new URLSearchParams({ dossierId: a.scope.dossierId, periodId: a.scope.periodId }));
    const table = page.getByRole("region", { name: "Événements cut-off — défilement clavier" }), d = table.getByRole("row", { name: /I-D/ });
    await expect(d).toContainText("600.00 EUR");
    await expect(d).toContainText("payables.purchases v1");
    await expect(d).toContainText("payables.rpne v1");
    await expect(d.getByRole("link").first()).toHaveAttribute("href", /version=1/);
    await page.getByLabel("Flux", { exact: true }).selectOption("sale");
    await expect(table).toContainText("SALE");
    await expect(table).not.toContainText("I-D");
    await axe(page);
    await page.locator("main").screenshot({ path: info.outputPath("payables-cutoff.png") });
});
