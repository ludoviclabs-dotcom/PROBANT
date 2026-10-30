import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * IFRS C02 — poste « Locations IFRS 16 » sur un build de production.
 * 1. Scénario synthétique en lecture seule (/ifrs/locations?demo=1), calculé par le moteur côté serveur, aux trois largeurs.
 * 2. L16-03 : cadrage PCG, écritures du retraitement proposé, pont par poste et écart de cadrage, aux trois largeurs.
 * 3. L16-04 : rail en cinq étapes, ligne de synthèse, table, graphiques et tableaux égaux au JSON, frise dans l'inspecteur.
 * 4. L16-05 : synthèse de revue, points générés, exports diagnostic téléchargés égaux à l'écran et au JSON, impression du rapport HTML.
 * 5. Dossier réel sans session : l'écran dit la cause et l'action, sans chiffre ni écran fictivement terminé.
 * Captures : docs/ifrs/captures/c02 (IFRS_C02_OUT pour les déplacer). Données exclusivement synthétiques.
 */
const OUT = process.env.IFRS_C02_OUT ?? path.join(process.cwd(), "docs", "ifrs", "captures", "c02");
const WIDTHS = [1440, 1024, 390] as const;
const AXE = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

async function noOverflow(page: Page) {
  const m = await page.evaluate(() => ({ doc: [document.documentElement.scrollWidth, document.documentElement.clientWidth], main: [document.querySelector("main")?.scrollWidth ?? 0, document.querySelector("main")?.clientWidth ?? 0] }));
  expect(m.doc[0], "débordement horizontal du document").toBeLessThanOrEqual(m.doc[1] + 1);
  expect(m.main[0], "débordement horizontal de <main>").toBeLessThanOrEqual(m.main[1] + 1);
}
async function axe(page: Page) {
  await page.addScriptTag({ path: AXE });
  const violations = await page.evaluate(async () => {
    const a = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await a.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "critical" || v.impact === "serious").map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }));
  });
  expect(violations).toEqual([]);
}
async function capture(page: Page, name: string, full = true) {
  mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name + ".jpg"), type: "jpeg", quality: 78, fullPage: full });
}
const matrix = (page: Page) => page.getByRole("region", { name: /Matrice de complétude — défilement/ });

test.describe("IFRS C02 · scénario synthétique en lecture seule", () => {
  for (const width of WIDTHS) {
    test(`largeur ${width} : contexte, étapes, matrice, inspecteur, filtre et accessibilité`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR", reducedMotion: "reduce" }), page = await context.newPage();
      await page.goto("/ifrs/locations?demo=1");
      await expect(page.getByRole("heading", { name: "Matrice de complétude" })).toBeVisible();
      await expect(page.getByRole("note").filter({ hasText: "Simulation non revue" })).toBeVisible();
      await expect(page.getByLabel("Contexte de la feuille")).toContainText("ifrs16.leases 1.0.0 · à revoir");
      await expect(matrix(page).getByRole("row")).toHaveCount(8);
      // The synthetic scenario is read-only: no action bar, no policy editor, no upload form.
      await expect(page.getByRole("group", { name: "Actions de la feuille" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Lire et conserver l'aperçu" })).toHaveCount(0);
      await noOverflow(page); await axe(page);
      await capture(page, "scenario-" + width);

      const cell = matrix(page).getByRole("button", { name: "D04 · Taux : à compléter" });
      await cell.click();
      await expect(page).toHaveURL(/contrat=D04&colonne=rate/);
      const inspector = width >= 1400 ? page.getByRole("complementary", { name: "Inspecteur — Contrat D04" }) : page.getByRole("dialog", { name: "Inspecteur — Contrat D04" });
      await expect(inspector).toBeVisible();
      if (width >= 1400) await expect(inspector.getByRole("heading", { name: "Contrat D04" })).toBeFocused();
      else { await expect(inspector.getByRole("button", { name: "Fermer l'inspecteur" })).toBeFocused(); expect(await inspector.evaluate(el => getComputedStyle(el).animationName)).toBe("none"); }
      await expect(inspector.getByText(/Taux nominal : à convertir en taux annuel effectif/)).toBeVisible();
      await noOverflow(page);
      await capture(page, "inspecteur-" + width, false);
      await page.keyboard.press("Escape");
      await expect(cell).toBeFocused();
      await expect(page).not.toHaveURL(/contrat=/);

      await page.getByRole("button", { name: "À qualifier", exact: true }).click();
      await expect(matrix(page).getByRole("row")).toHaveCount(2);
      await expect(page).toHaveURL(/filtre=a_qualifier/);
      await expect(page.getByText(/Affichage filtré : 1 contrat sur 7 — la population figée et l'export ne changent pas/)).toBeVisible();
      await context.close();
    });
  }

  test("lien direct : le contrat et le filtre de l'URL rouvrent la même vue ; les chiffres viennent du moteur", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" }), page = await context.newPage();
    await page.goto("/ifrs/locations?demo=1&contrat=F03");
    const inspector = page.getByRole("complementary", { name: "Inspecteur — Contrat F03" });
    await expect(inspector).toBeVisible();
    // F03 over 2026 = oracle F03 over its first year: debt 33 421,27 → 22 819,76; interest 1 398,49; depreciation 11 140,42.
    for (const amount of ["33 421,27 €", "22 819,76 €", "1 398,49 €", "11 140,42 €"]) await expect(inspector.getByText(amount, { exact: true }).first()).toBeVisible();
    await page.goto("/ifrs/locations?demo=1&filtre=hors_scope_v1");
    await expect(matrix(page).getByRole("row")).toHaveCount(2);
    await expect(matrix(page).getByRole("rowheader")).toContainText("D06");
    await context.close();
  });
});

const OUT_L3 = process.env.IFRS_L16_03_OUT ?? path.join(process.cwd(), "docs", "ifrs", "captures", "l16-03");
test.describe("IFRS L16-03 · cadrage PCG et retraitement proposé (scénario synthétique)", () => {
  for (const width of WIDTHS) {
    test(`largeur ${width} : filtre « non rapproché », écritures, pont par poste, écart de cadrage dans l'inspecteur`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR", reducedMotion: "reduce" }), page = await context.newPage();
      await page.goto("/ifrs/locations?demo=1");
      const panel = page.getByRole("region", { name: "Écritures du retraitement — défilement horizontal au clavier" });
      await expect(page.getByRole("heading", { name: "Retraitement de clôture proposé" })).toBeVisible();
      // F01 (5 lines) and F03 (6 lines) are framed; D08 (mixed charge) is not in the adjustment.
      await expect(panel.getByRole("row")).toHaveCount(1 + 11 + 1);
      await expect(panel.getByRole("row").last()).toContainText("51 901,17 €");
      await expect(panel).not.toContainText("D08");
      const bridge = page.getByRole("region", { name: "Pont par poste — défilement horizontal au clavier" });
      await expect(bridge.getByRole("row", { name: /Résultat avant impôt/ })).toContainText("−15 538,91 €");
      await expect(bridge.getByRole("row")).toHaveCount(5);
      await expect(page.getByText(/Impôt.*Non calculé/).first()).toBeVisible();
      await noOverflow(page); await axe(page);
      mkdirSync(OUT_L3, { recursive: true });
      await page.getByRole("heading", { name: "Retraitement de clôture proposé" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT_L3, "retraitement-" + width + ".jpg"), type: "jpeg", quality: 78, fullPage: true });

      await page.getByRole("button", { name: "Non rapproché", exact: true }).click();
      await expect(page).toHaveURL(/filtre=unframed/);
      await expect(matrix(page).getByRole("row")).toHaveCount(2);
      const cell = matrix(page).getByRole("button", { name: "D08 · Cadrage PCG : écart" });
      await cell.click();
      await expect(page).toHaveURL(/contrat=D08&colonne=ledger/);
      const inspector = width >= 1400 ? page.getByRole("complementary", { name: "Inspecteur — Contrat D08" }) : page.getByRole("dialog", { name: "Inspecteur — Contrat D08" });
      await expect(inspector.getByText("Écart connu de cadrage", { exact: true })).toBeVisible();
      await expect(inspector.getByText(/charge mixte/).first()).toBeVisible();
      await expect(inspector.getByRole("cell", { name: "supérieure au loyer" })).toBeVisible();
      await noOverflow(page); await axe(page);
      await page.screenshot({ path: path.join(OUT_L3, "cadrage-d08-" + width + ".jpg"), type: "jpeg", quality: 78 });
      await page.keyboard.press("Escape");
      await expect(cell).toBeFocused();
      await context.close();
    });
  }
});

const OUT_L4 = process.env.IFRS_L16_04_OUT ?? path.join(process.cwd(), "docs", "ifrs", "captures", "l16-04");
/** Formats of the screen, rebuilt here from the server strings: the test compares the JSON, the charts and the tables. */
const eur = (m: { amount: string }) => { const neg = m.amount.startsWith("-"), [w, c] = m.amount.replace("-", "").split("."); return (neg ? "−" : "") + w.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + c + " €"; };
const day = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
type Money = { amount: string };
type DemoCharts = { opening: { date: string; debt: Money; rouNet: Money }; points: { date: string; debt: Money; rouNet: Money; payments: Money; principal: Money; interest: Money }[];
  debtBridge: Record<"opening" | "additions" | "interest" | "payments" | "closing", Money>; rouBridge: Record<"opening" | "additions" | "depreciation" | "closing", Money> };
test.describe("IFRS L16-04 · poste visuel (scénario synthétique)", () => {
  for (const width of WIDTHS) {
    test(`largeur ${width} : rail en cinq étapes, synthèse, table, graphiques égaux au JSON et aux tableaux, frise dans l'inspecteur`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR", reducedMotion: "reduce" }), page = await context.newPage();
      const json = await (await page.request.get("/api/workpapers/locations-ifrs16/demo")).json(), runId = json.runs[0].id as string;
      const charts = json.portfolio[runId].charts as DemoCharts;
      await page.goto("/ifrs/locations?demo=1");
      await expect(page.getByRole("heading", { name: "Portefeuille et calcul" })).toBeVisible();
      const rail = page.getByRole("navigation", { name: "Étapes du travail" });
      await expect(rail.getByRole("listitem")).toHaveCount(5);
      for (const [i, label] of ["Sources", "Qualification", "Calcul", "Retraitements", "Revue"].entries()) await expect(rail.getByRole("listitem").nth(i)).toContainText((i + 1) + ". " + label);
      const summary = page.getByLabel("Synthèse du portefeuille");
      await expect(summary).toContainText("7 contrats au registre fourni · 3 calculable(s) sur ce périmètre");
      await expect(summary).toContainText("dette à la clôture " + eur(charts.debtBridge.closing));
      await expect(summary).toContainText("montants partiels : 2 contrats bloqués exclus (D04, D06)");
      await expect(page.getByRole("region", { name: "Table du portefeuille — défilement horizontal au clavier" }).getByRole("row")).toHaveCount(8);

      // Keyboard: one tab stop per chart, arrows move the month; both charts read the same month.
      await page.getByRole("button", { name: /^Fin janv\. 2026 :/ }).focus();
      await page.keyboard.press("ArrowRight");
      const feb = charts.points[1];
      await expect(page.getByRole("button", { name: "Fin févr. 2026 : dette " + eur(feb.debt) + ", droit d'utilisation net " + eur(feb.rouNet) })).toBeFocused();
      await expect(page.getByText("loyer " + eur(feb.payments) + " = principal " + eur(feb.principal) + " + intérêts " + eur(feb.interest))).toBeVisible();
      await noOverflow(page); await axe(page);
      mkdirSync(OUT_L4, { recursive: true });
      await page.screenshot({ path: path.join(OUT_L4, "poste-" + width + ".jpg"), type: "jpeg", quality: 78, fullPage: true });
      await page.getByRole("heading", { name: "Dette et droit d'utilisation net par fin de mois" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT_L4, "graphiques-" + width + ".jpg"), type: "jpeg", quality: 78 });

      // Equivalent tables: every cell equals the canonical JSON.
      await page.getByRole("button", { name: "Voir le tableau" }).first().click();
      const balances = page.getByRole("region", { name: "Soldes de fin de mois — défilement horizontal au clavier" }).getByRole("row");
      await expect(balances).toHaveCount(14);
      await expect(balances.nth(1)).toContainText(eur(charts.opening.debt));
      for (const [i, p] of charts.points.entries()) await expect(balances.nth(i + 2)).toHaveText(day(p.date) + eur(p.debt) + eur(p.rouNet));
      await page.getByRole("button", { name: "Voir le tableau" }).first().click();
      await page.getByRole("button", { name: "Voir le tableau" }).first().click();
      const debt = page.getByRole("region", { name: "Pont de la dette — défilement horizontal au clavier" });
      await expect(debt.getByRole("row", { name: /Dette de clôture/ })).toContainText(eur(charts.debtBridge.closing));
      await expect(debt.getByRole("row", { name: /Loyers payés/ })).toContainText("− " + eur(charts.debtBridge.payments));
      await expect(page.getByRole("region", { name: "Loyers par échéance — défilement horizontal au clavier" }).getByRole("row").last()).toContainText(eur(charts.debtBridge.payments));
      await noOverflow(page); await axe(page);
      await page.screenshot({ path: path.join(OUT_L4, "tableaux-" + width + ".jpg"), type: "jpeg", quality: 78 });

      // From the portfolio table to the inspector: timeline, formula and exact values, proof level.
      await page.getByRole("region", { name: "Table du portefeuille — défilement horizontal au clavier" }).getByRole("button", { name: "F03", exact: true }).click();
      const inspector = width >= 1400 ? page.getByRole("complementary", { name: "Inspecteur — Contrat F03" }) : page.getByRole("dialog", { name: "Inspecteur — Contrat F03" });
      await expect(inspector.getByRole("img", { name: /^Frise : prise d'effet le 01\/01\/2026, 36 échéances jusqu'au 31\/12\/2028/ })).toBeVisible();
      await expect(inspector.getByText(/12 échéances dans l'exercice \(moteur\)/)).toBeVisible();
      await expect(inspector.getByRole("heading", { name: "Formule et précision" })).toBeVisible();
      await expect(inspector.getByText(/Niveau de preuve : ligne de source/)).toBeVisible();
      await noOverflow(page); await axe(page);
      await page.screenshot({ path: path.join(OUT_L4, "inspecteur-f03-" + width + ".jpg"), type: "jpeg", quality: 78 });
      await page.keyboard.press("Escape");
      await rail.getByRole("link", { name: "Calcul" }).click();
      await expect(page).toHaveURL(/#l16-portfolio-title$/);
      await context.close();
    });
  }

  test("largeur 720 (zoom 200 % d'un écran de 1 440) : aucun débordement, graphiques contenus dans leur cadre", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 720, height: 900 }, locale: "fr-FR", reducedMotion: "reduce" }), page = await context.newPage();
    await page.goto("/ifrs/locations?demo=1");
    await expect(page.getByRole("heading", { name: "Pont du droit d'utilisation net" })).toBeVisible();
    await noOverflow(page);
    const widths = await page.locator("figure svg").evaluateAll(els => els.map(e => [e.getBoundingClientRect().width, e.parentElement!.getBoundingClientRect().width]));
    expect(widths.length).toBeGreaterThanOrEqual(4);
    for (const [svg, box] of widths) expect(svg).toBeLessThanOrEqual(box + 1);
    await context.close();
  });
});

const OUT_L5 = process.env.IFRS_L16_05_OUT ?? path.join(process.cwd(), "docs", "ifrs", "captures", "l16-05");
const centsOf = (amount: string) => BigInt(amount.replace(".", "").replace(/^(-?)0+(?=\d)/, "$1"));
test.describe("IFRS L16-05 · revue et exports (scénario synthétique)", () => {
  for (const width of WIDTHS) {
    test(`largeur ${width} : synthèse de revue, points générés, export diagnostic téléchargé égal à l'écran et au JSON, export revu refusé avec son motif`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "fr-FR", reducedMotion: "reduce", acceptDownloads: true }), page = await context.newPage();
      const json = await (await page.request.get("/api/workpapers/locations-ifrs16/demo")).json(), runId = json.runs[0].id as string;
      const debtClosing = json.portfolio[runId].summary.amounts.debtClosing as Money;
      await page.goto("/ifrs/locations?demo=1");
      await expect(page.getByRole("heading", { name: "Revue et exports" })).toBeVisible();
      await expect(page.getByLabel("Synthèse de revue", { exact: true })).toContainText("2 point(s) bloquant(s) ouvert(s) sur 6 · conclusion absente · aucune relecture · impôt non calculé");
      await expect(page.getByRole("region", { name: "Synthèse de revue par contrat — défilement horizontal au clavier" }).getByRole("row")).toHaveCount(8);
      const reviewed = page.getByRole("group", { name: "Export revu" });
      await expect(reviewed.getByText("Scénario synthétique : export diagnostic seulement, jamais revu")).toBeVisible();
      for (const b of await reviewed.getByRole("button").all()) await expect(b).toBeDisabled();
      await page.getByRole("navigation", { name: "Étapes du travail" }).getByRole("link", { name: "Revue" }).click();
      await expect(page).toHaveURL(/#l16-review-title$/);

      const diagnostic = page.getByRole("group", { name: "Export diagnostic" });
      const [html] = await Promise.all([page.waitForEvent("download"), diagnostic.getByRole("button", { name: "Rapport HTML imprimable" }).click()]);
      expect(html.suggestedFilename()).toBe("simulation-non-revue-locations-ifrs16-SYN-LEAS-r1v5-diagnostic.html");
      const report = readFileSync((await html.path())!, "utf8");
      expect(report).toContain("dette " + eur(debtClosing));
      expect(report).toContain("débit 51 901,17 €, crédit 51 901,17 €");
      await expect(page.getByRole("status").filter({ hasText: "Export téléchargé" })).toContainText("empreinte métier");
      const [csv] = await Promise.all([page.waitForEvent("download"), diagnostic.getByRole("button", { name: "CSV contrats" }).click()]);
      const [head, ...rows] = readFileSync((await csv.path())!, "utf8").trim().split("\r\n").map(l => l.split(","));
      const col = head.indexOf("debt_closing"), total = rows.reduce((t, r) => t + (r[col] ? centsOf(r[col]) : 0n), 0n);
      expect(total).toBe(centsOf(debtClosing.amount));
      await noOverflow(page); await axe(page);
      mkdirSync(OUT_L5, { recursive: true });
      await page.getByRole("heading", { name: "Revue et exports" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT_L5, "revue-" + width + ".jpg"), type: "jpeg", quality: 78 });

      if (width === 1440) {
        // Printing the HTML report: repeated table headers, context on each table, several pages without a broken layout.
        const print = await context.newPage();
        await print.setContent(report);
        await print.emulateMedia({ media: "print" });
        expect(await print.evaluate(() => getComputedStyle(document.querySelector("thead")!).display)).toBe("table-header-group");
        expect(await print.locator("caption").first().textContent()).toContain("Dossier SYN-LEASES · exercice 01/01/2026 → 31/12/2026 · feuille r1 · v5");
        const pages = ((await print.pdf({ format: "A4" })).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
        expect(pages).toBeGreaterThanOrEqual(2);
        await print.screenshot({ path: path.join(OUT_L5, "rapport-impression-1440.jpg"), type: "jpeg", quality: 78 });
        await print.close();
      }
      await context.close();
    });
  }
});

test.describe("IFRS C02 · dossier réel sans session", () => {
  test("l'écran dit la cause et l'action, sans chiffre ni étape terminée", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, locale: "fr-FR" }), page = await context.newPage();
    await page.goto("/ifrs/locations?dossierId=11111111-1111-4111-8111-111111111111&periodId=period-sans-session");
    const alert = page.getByRole("alert").filter({ hasText: "Action impossible" });
    await expect(alert).toContainText("Session requise ou expirée");
    await expect(alert.getByRole("link", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Matrice de complétude" })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Étapes du travail" })).toHaveCount(0);
    await noOverflow(page); await axe(page);
    await capture(page, "reel-sans-session-1024");
    await context.close();
  });
});
