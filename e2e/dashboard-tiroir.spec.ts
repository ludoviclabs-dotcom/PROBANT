import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Tableau de bord — tiroir de navigation sous 768 px.
 *
 * Défaut antérieur (main ff3f9fb, relevé du 14/10/2026) sur `components/probant/Sidebar.tsx` et
 * `app/dashboard/layout.tsx` :
 *  - clavier : ouvrir le tiroir ne déplaçait pas le focus ; l'aside précédant le bandeau dans le DOM,
 *    Tab partait du bouton vers la page derrière le voile ; rien n'était inerte ; Échap refermait sans
 *    rendre le focus au bouton (perdu sur body si le focus était dans le tiroir) ;
 *  - animation : `translate-x-*` pose la propriété CSS `translate` (Tailwind 4) alors que la transition
 *    déclarait `transform, visibility` : le tiroir apparaissait d'un coup et, à la fermeture, restait
 *    affiché 200 ms puis disparaissait sans glisser.
 *
 * Ce spec relève puis vérifie, sur la Synthèse et la Cartographie des risques à 1440, 1024 et 390 :
 *  - la mise en page inchangée au-delà de 768 px (navigation en flux, bouton du bandeau masqué) et
 *    le tiroir fermé par défaut en dessous ;
 *  - à 390 : focus sur « Fermer la navigation » à l'ouverture, Tab et Maj+Tab restent dans le tiroir,
 *    contenu inerte, Échap / voile / Fermer referment et rendent le focus au bouton, un lien navigue et
 *    referme, le passage à 1024 tiroir ouvert le referme ;
 *  - le glissement (transition de `translate`) et sa neutralisation sous `prefers-reduced-motion` ;
 *  - la dette axe « serious » non aggravée par rapport au relevé « avant ».
 *
 * `DASHBOARD_TIROIR_PHASE=avant` relève les mesures et captures sans les assertions (état de référence) ;
 * `DASHBOARD_TIROIR_OUT` déplace le dossier de sortie, `DASHBOARD_TIROIR_CAPTURE=0` désactive les captures.
 */
const PHASE = process.env.DASHBOARD_TIROIR_PHASE === "avant" ? "avant" : "apres";
const ROOT = process.env.DASHBOARD_TIROIR_OUT ?? path.join(process.cwd(), "docs", "probant-lots", "dashboard-tiroir-captures");
const OUT = path.join(ROOT, PHASE);
const CAPTURE = process.env.DASHBOARD_TIROIR_CAPTURE !== "0";
const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const WIDTHS = [1440, 1024, 390] as const;
const SIDEBAR = 240;
const MD = 768;

/** Titres réels (voir e2e/partial-coverage.spec.ts) : le dossier se charge côté client. */
const ROUTES = [
  { name: "synthese", path: "/dashboard/synthese", title: "Synthèse" },
  { name: "risques", path: "/dashboard/risques", title: "Cartographie des risques" },
] as const;

interface Layout {
  route: string;
  width: number;
  main: { left: number; width: number };
  sidebar: { visible: boolean; left: number; width: number };
  axeSerious?: Record<string, number>;
}

async function waitForTitle(page: Page, route: (typeof ROUTES)[number]) {
  await expect(page.getByRole("heading", { name: route.title, level: 1, exact: true })).toBeVisible();
}

async function axeSerious(page: Page): Promise<Record<string, number>> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; nodes: unknown[] }[] }> } }).axe;
    const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    const counts: Record<string, number> = {};
    for (const v of r.violations) if (v.impact === "serious" || v.impact === "critical") counts[`${v.impact}:${v.id}`] = v.nodes.length;
    return counts;
  });
}

async function measure(page: Page, route: string, width: number): Promise<Layout> {
  const raw = await page.evaluate(() => {
    const main = document.querySelector("main")!.getBoundingClientRect();
    const aside = document.querySelector("#dashboard-nav")!;
    const a = aside.getBoundingClientRect();
    const visible = getComputedStyle(aside).visibility !== "hidden" && a.right > 0 && a.left < window.innerWidth;
    return {
      main: { left: Math.round(main.left), width: Math.round(main.width) },
      sidebar: { visible, left: Math.round(a.left), width: Math.round(a.width) },
    };
  });
  return { route, width, ...raw };
}

async function baseline(name: string, width: number): Promise<Layout | null> {
  try {
    return JSON.parse(await readFile(path.join(ROOT, "avant", `${name}-${width}.json`), "utf8")) as Layout;
  } catch {
    return null;
  }
}

/** Le contenu (colonne et CTA flottant) est-il inerte ? */
const contentInert = (page: Page) => page.evaluate(() => document.querySelector("main")!.closest("[inert]") !== null);

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

for (const width of WIDTHS) {
  test.describe(`largeur ${width}`, () => {
    test.use({ viewport: { width, height: 900 }, contextOptions: { reducedMotion: "reduce" } });

    for (const route of ROUTES) {
      test(`${route.path} — navigation en flux ou tiroir fermé`, async ({ page }) => {
        await page.goto(route.path);
        await waitForTitle(page, route);
        await page.evaluate(() => document.fonts.ready);
        const layout = await measure(page, route.path, width);
        layout.axeSerious = await axeSerious(page);
        await writeFile(path.join(OUT, `${route.name}-${width}.json`), JSON.stringify(layout, null, 2));
        if (CAPTURE) await page.screenshot({ path: path.join(OUT, `${route.name}-${width}.png`) });
        if (PHASE === "avant") return;

        const toggle = page.getByRole("button", { name: "Ouvrir la navigation" });
        const close = page.locator("#dashboard-nav").getByRole("button", { name: "Fermer la navigation" });
        if (width < MD) {
          expect(layout.sidebar.visible).toBe(false);
          expect(layout.main.left).toBe(0);
          expect(layout.main.width).toBe(width);
          await expect(toggle).toBeVisible();
          await expect(toggle).toHaveAttribute("aria-expanded", "false");
          await expect(toggle).toHaveAttribute("aria-controls", "dashboard-nav");
        } else {
          // Inchangé au-delà de 768 px : navigation en flux, ni bouton du bandeau ni bouton « Fermer ».
          expect(layout.sidebar.visible).toBe(true);
          expect(layout.sidebar.left).toBe(0);
          expect(layout.sidebar.width).toBe(SIDEBAR);
          expect(layout.main.left).toBe(SIDEBAR);
          expect(layout.main.width).toBe(width - SIDEBAR);
          await expect(toggle).toBeHidden();
          await expect(close).toBeHidden();
        }
        const before = await baseline(route.name, width);
        if (before?.axeSerious) {
          for (const [key, count] of Object.entries(layout.axeSerious)) {
            expect(count, `${route.path} ${width} : « ${key} » ${count} nœud(s), relevé avant ${before.axeSerious[key] ?? 0}`).toBeLessThanOrEqual(
              before.axeSerious[key] ?? 0,
            );
          }
        }
      });
    }
  });
}

test.describe("tiroir à 390", () => {
  test.use({ viewport: { width: 390, height: 900 } });
  const synthese = ROUTES[0];
  const risques = ROUTES[1];

  test("capture du tiroir ouvert", async ({ page }) => {
    await page.goto(synthese.path);
    await waitForTitle(page, synthese);
    await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
    const nav = page.locator("#dashboard-nav");
    await expect(nav).toBeVisible();
    await nav.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    if (CAPTURE) await page.screenshot({ path: path.join(OUT, "tiroir-ouvert-390.png") });
  });

  test("clavier : focus dans le tiroir, Tab y reste, Échap le referme et rend le focus au bouton", async ({ page }) => {
    test.skip(PHASE === "avant", "comportement introduit par le lot");
    await page.goto(synthese.path);
    await waitForTitle(page, synthese);
    const nav = page.locator("#dashboard-nav");
    const toggle = page.getByRole("button", { name: "Ouvrir la navigation" });
    await expect(nav).toBeHidden();

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("button", { name: "Fermer la navigation" })).toBeFocused();
    expect(await contentInert(page)).toBe(true);
    // Le CTA flottant « Importer mon FEC » est derrière le voile : inerte lui aussi.
    expect(await page.evaluate(() => [...document.querySelectorAll("a[href*='/onboarding']")].every((a) => a.closest("#dashboard-nav") || a.closest("[inert]")))).toBe(true);

    const count = await nav.evaluate(
      (el) => el.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])").length,
    );
    for (let i = 0; i < count + 1; i++) {
      await page.keyboard.press("Tab");
      expect(await nav.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await nav.locator("a[href]").first().focus();
    await page.keyboard.press("Shift+Tab");
    expect(await nav.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(nav).toBeHidden();
    await expect(toggle).toBeFocused();
    expect(await contentInert(page)).toBe(false);
  });

  test("pointeur : voile, « Fermer » et lien referment ; le lien navigue", async ({ page }) => {
    test.skip(PHASE === "avant", "comportement introduit par le lot");
    await page.goto(synthese.path);
    await waitForTitle(page, synthese);
    const nav = page.locator("#dashboard-nav");
    const toggle = page.getByRole("button", { name: "Ouvrir la navigation" });

    await toggle.click();
    await expect(nav).toBeVisible();
    await page.mouse.click(350, 450);
    await expect(nav).toBeHidden();

    await toggle.click();
    await nav.getByRole("button", { name: "Fermer la navigation" }).click();
    await expect(nav).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await nav.locator("a[href*='/dashboard/risques']").click();
    await expect(page).toHaveURL(/\/dashboard\/risques/);
    await waitForTitle(page, risques);
    await expect(nav).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("passage à 1024 tiroir ouvert : navigation en flux, contenu non inerte", async ({ page }) => {
    test.skip(PHASE === "avant", "comportement introduit par le lot");
    await page.goto(synthese.path);
    await waitForTitle(page, synthese);
    const toggle = page.getByRole("button", { name: "Ouvrir la navigation" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(page.locator("#dashboard-nav")).toBeVisible();
    await expect(toggle).toBeHidden();
    await expect.poll(() => contentInert(page)).toBe(false);
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(page.locator("#dashboard-nav")).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("glissement", () => {
  test.skip(PHASE === "avant", "comportement introduit par le lot");

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`ouverture et fermeture — ${reducedMotion}`, async ({ browser }) => {
      const context = await browser.newContext({ reducedMotion, viewport: { width: 390, height: 900 } });
      const page = await context.newPage();
      await page.goto(ROUTES[0].path);
      await waitForTitle(page, ROUTES[0]);
      const nav = page.locator("#dashboard-nav");
      const toggle = page.getByRole("button", { name: "Ouvrir la navigation" });
      // Transitions lancées par l'ouverture puis la fermeture, et durée calculée du tiroir.
      const sample = async () =>
        nav.evaluate((el) => ({
          running: el.getAnimations().map((a) => (a as CSSTransition).transitionProperty),
          duration: parseFloat(getComputedStyle(el).transitionDuration),
        }));
      await toggle.click();
      const opening = await sample();
      await nav.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      await page.keyboard.press("Escape");
      const closing = await sample();
      if (reducedMotion === "reduce") {
        expect(opening.duration).toBeLessThan(0.01);
        expect(closing.duration).toBeLessThan(0.01);
      } else {
        expect(opening.duration).toBeCloseTo(0.2, 3);
        expect(opening.running).toContain("translate");
        expect(closing.running).toContain("translate");
        // À l'ouverture, `visibility` n'est pas animée : le tiroir est visible (et focalisable) d'emblée.
        expect(opening.running).not.toContain("visibility");
      }
      await context.close();
    });
  }
});
