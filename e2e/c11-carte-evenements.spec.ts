import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { buildPayablesMission } from "../lib/workpapers/payables-mission";
import { buildTransversalEventMap } from "../lib/workpapers/transversal-events";
import { recette, scope } from "../lib/workpapers/__tests__/c11-fixtures";

/**
 * C11 — carte des événements transversaux sur /cutoff. Présentation seule : la carte est construite par le vrai moteur
 * sur le dossier de recette (docs/recette/c11/RECETTE.md) et servie par une réponse explicite ; la persistance est
 * vérifiée par la recette PostgreSQL, pas ici. États réels vérifiés à 1440, 1024 et 390 px.
 */
const CAPTURES = path.join(process.cwd(), "docs", "probant-lots", "c11-captures");

async function setup(page: Page) {
  const map = buildTransversalEventMap(recette()), mission = buildPayablesMission(scope, [], [], []);
  await page.route("**/api/auth/session", (r) => r.fulfill({ json: { authenticated: true, csrfToken: "test-csrf" } }));
  await page.route("**/api/workpapers/payables?**", (r) => {
    const url = new URL(r.request().url());
    return r.fulfill({ json: url.searchParams.get("operation") === "events" ? { actorId: "real-preparer", map, reason: null } : { actorId: "real-preparer", permissions: ["read"], mission } });
  });
  await page.goto("/cutoff?" + new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId }));
  await expect(page.getByRole("heading", { name: "Carte des événements transversaux" })).toBeVisible();
  return map;
}
async function axe(page: Page) {
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js") });
  const violations = await page.evaluate(async () => {
    const a = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
    return (await a.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.filter((v) => ["critical", "serious"].includes(v.impact)).map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }));
  });
  expect(violations).toEqual([]);
}
const overflow = (page: Page) => page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth);

for (const width of [1440, 1024, 390]) {
  test(`carte C11 à ${width} px : pont, frise, TVA, règlements et procédure`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    const section = page.getByRole("region", { name: "Carte des événements transversaux" });
    await expect(section.locator("[data-bridge]")).toContainText("4 effets comptés une fois");
    await expect(section.locator("[data-bridge]")).toContainText("7 observations avec candidat");
    const stages = section.getByRole("list", { name: /Pont des effets/ });
    await expect(stages).toContainText("retenu 3500.00 EUR");
    await expect(stages).toContainText("retenu 1000.00 EUR");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // Clavier : l'événement s'ouvre au clavier et le focus passe au titre du panneau.
    const f101 = section.locator('button[data-event="F-101"]');
    await f101.focus();
    await page.keyboard.press("Enter");
    const detail = page.getByRole("complementary", { name: /F-101/ });
    await expect(detail.getByRole("heading", { level: 3 })).toBeFocused();
    await expect(detail).toContainText("FAE · 418");
    await expect(detail).toContainText("Règlement ANC n° 2022-06");
    await expect(detail).toContainText("1214-41");
    await expect(detail).toContainText("TVA qualifiée sous réserve");
    await expect(detail).toContainText("2026-03-25");
    await expect(detail).toContainText("Observée après son exigibilité");
    await expect(detail).toContainText("Rattachement des produits non encore facturés");
    await expect(detail.getByRole("list").first()).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // Filtre « À compléter » : les événements à information requise, jamais les événements complets.
    await section.getByRole("button", { name: "À compléter" }).click();
    const list = section.getByRole("list", { name: "Événements" });
    await expect(list).toContainText("F-107");
    await expect(list).toContainText("AV-106");
    await expect(list).not.toContainText("F-102");
    await section.getByRole("button", { name: "Tous", exact: true }).click();
    await section.locator('button[data-event="FS-202"]').click();
    await expect(page.getByRole("complementary", { name: /FS-202/ })).toContainText("P-202");
    await expect(section.getByRole("region", { name: "Règlements globaux — défilement clavier" })).toContainText("600.00 EUR");
    await section.getByText("Méthode, sources lues et dépendances d’invalidation").click();
    await expect(section).toContainText("BOI-TVA-BASE-20-50-10");
    await page.setViewportSize({ width, height: 8000 });
    await axe(page);
    await page.setViewportSize({ width, height: 900 });
    await section.locator('button[data-event="F-101"]').click();
    await page.setViewportSize({ width, height: width === 390 ? 3200 : 1500 });
    await section.screenshot({ path: path.join(CAPTURES, `cutoff-carte-${width}.jpg`), type: "jpeg", quality: 80 });
  });
}
