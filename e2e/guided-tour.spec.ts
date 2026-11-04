import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Visite guidée — parcours réel sur le build de production.
 *
 * Chaque étape doit trouver sa cible et ouvrir son cadre (ou sa scène) sur la bonne route, sans débordement
 * horizontal, carte et frise dans l'écran, aux largeurs de recette 1440, 1024 et 390. Le mouvement réduit
 * accélère le parcours sans changer l'enchaînement. Les gestes « À vous », le clavier, la frise et axe-core
 * sur la surcouche sont vérifiés à part.
 */

const STEPS = [
  ["ouverture", "/dashboard/depot", "scene"],
  ["depot", "/dashboard/depot", "spot"],
  ["contexte", "/dashboard/depot", "spot"],
  ["verdict", "/dashboard/synthese", "spot"],
  ["sankey", "/dashboard/synthese", "spot"],
  ["exposition", "/dashboard/synthese", "spot"],
  ["matrice", "/dashboard/risques", "spot"],
  ["simulateur", "/dashboard/risques", "spot"],
  ["propagation", "/dashboard/risques", "spot"],
  ["cloison", "/dashboard/cloisons", "spot"],
  ["revue", "/dashboard/cloisons", "spot"],
  ["chaines", "/dashboard/dossier", "spot"],
  ["referentiel", "/dashboard/referentiel", "spot"],
  ["conclusion", "/dashboard/referentiel", "scene"],
] as const;

const DEMO = "dossier=demo-sa-2024&organization=demo";
const stage = (page: Page) => page.locator("[data-tour-stage]");

async function settled(page: Page, id: string, phase: string) {
  await expect(stage(page)).toHaveAttribute("data-tour-stage", id, { timeout: 20_000 });
  await expect(stage(page)).toHaveAttribute("data-tour-phase", phase, { timeout: 20_000 });
}

for (const width of [1440, 1024, 390]) {
  test(`parcours complet à ${width} px : chaque étape trouve sa cible, rien ne déborde`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/dashboard/depot?guide=1&etape=0&${DEMO}`);

    for (const [i, [id, route, phase]] of STEPS.entries()) {
      await expect(page).toHaveURL((url) => url.pathname === route && url.search === `?guide=1&etape=${i}&${DEMO}`);
      await settled(page, id, phase);
      const layout = await page.evaluate(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
        const card = box('[aria-labelledby="tour-card-title"]');
        const frieze = box("[data-tour-frieze]");
        const inside = (r: DOMRect | null) => !r || (r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1);
        return { overflow: document.documentElement.scrollWidth > vw, card: inside(card), frieze: inside(frieze), hasCard: Boolean(card) };
      });
      expect(layout.overflow, `${id} : débordement horizontal`).toBe(false);
      expect(layout.card, `${id} : carte hors écran`).toBe(true);
      expect(layout.frieze, `${id} : frise hors écran`).toBe(true);
      expect(layout.hasCard, `${id} : carte de narration`).toBe(phase === "spot");
      if (i < STEPS.length - 1) await page.keyboard.press("ArrowRight");
    }

    // La conclusion reste affichée et propose la suite.
    await expect(page.getByRole("button", { name: "Importer mon FEC →" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rejouer la visite" })).toBeVisible();
  });
}

test("le lanceur du rail ouvre la visite sur le dossier démo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/synthese");
  await page.getByRole("button", { name: /Visite guidée/ }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/depot\\?guide=1&etape=0&${DEMO}`));
  await settled(page, "ouverture", "scene");
  await expect(page.getByRole("heading", { name: "Du grand livre au constat opposable." })).toBeVisible();
});

test("moment « À vous » : le clic du visiteur filtre l'analyse, le filtre est effacé en sortie d'étape", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/dashboard/synthese?guide=1&etape=4&${DEMO}`);
  await settled(page, "sankey", "spot");
  await expect(page.getByRole("status").filter({ hasText: "Cliquez un flux du Sankey." })).toBeVisible();

  const band = page.locator('[data-tour="synthese-sankey"] path[data-tour-flow="bilan-actif-majeur"]');
  const aim = await band.evaluate((el) => {
    const g = el as SVGGeometryElement;
    const p = g.getPointAtLength(g.getTotalLength() / 2);
    const m = g.getScreenCTM()!;
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  });
  await page.mouse.click(aim.x, aim.y);
  await expect(page.getByRole("status").filter({ hasText: "Bien vu" })).toBeVisible();
  await expect(page.locator('[data-tour="synthese-filtre"]')).toContainText("Majeur");

  await page.keyboard.press("ArrowRight");
  await settled(page, "exposition", "spot");
  await expect(page.locator('[data-tour="synthese-filtre"]')).toContainText("Aucun.");
});

test("sans geste du visiteur, la visite ouvre elle-même le panneau de revue", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/dashboard/cloisons?guide=1&etape=9&${DEMO}`);
  await settled(page, "cloison", "spot");
  await expect(page.locator('[data-tour="review-panel"]')).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Fait" })).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('[data-tour="review-panel"]').first()).toBeVisible();
  await settled(page, "revue", "spot");
});

test("clavier et frise : pause, chapitre, sortie", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/dashboard/depot?guide=1&etape=1&${DEMO}`);
  await settled(page, "depot", "spot");

  const pause = page.getByRole("button", { name: "Mettre la visite en pause" });
  await expect(pause).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press(" ");
  await expect(page.getByRole("button", { name: "Reprendre la visite" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(" ");

  await page.keyboard.press("3");
  await expect(page).toHaveURL(/\/dashboard\/risques\?guide=1&etape=6&/);
  await settled(page, "matrice", "spot");

  await page.getByRole("button", { name: /Aller à : Chapitre IV, Prouver/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/cloisons\?guide=1&etape=9&/);
  await settled(page, "cloison", "spot");

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`/dashboard/cloisons\\?${DEMO}$`));
  await expect(stage(page)).toHaveCount(0);
});

test("axe-core : aucune violation critique ni sérieuse dans la surcouche de la visite", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [step, id, phase] of [
    [0, "ouverture", "scene"],
    [4, "sankey", "spot"],
    [13, "conclusion", "scene"],
  ] as const) {
    await page.goto(`${STEPS[step][1]}?guide=1&etape=${step}&${DEMO}`);
    await settled(page, id, phase);
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: unknown[] }[] }> } }).axe;
      const r = await axe.run(document.querySelector("[data-tour-stage]"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
      return r.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id}×${v.nodes.length}`);
    });
    expect(violations, `${id}`).toEqual([]);
  }
});
