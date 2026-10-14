import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Audit Normatif 360 — mise en page aux largeurs étroites.
 *
 * Défaut antérieur (main ff3f9fb, relevé du 14/10/2026) : `app/normatif/layout.tsx` (commit fb43c8e)
 * gardait la navigation latérale de 240 px affichée à toutes les largeurs. À 390 px, la colonne de
 * contenu tombait à environ 150 px (90 px utiles une fois le `p-6` des pages retiré) : le titre de
 * /normatif/sources/cc-capitaux-propres passait sur une douzaine de lignes et le registre des
 * sources défilait dans un cadre de 92 px. Le document lui-même ne débordait pas, si bien qu'un
 * contrôle `scrollWidth > clientWidth` restait vert sur une page illisible.
 *
 * Aux largeurs 1440, 1024 et 390, sur chaque route du module, ce spec relève puis vérifie :
 *  - la largeur réelle de <main> : toute la fenêtre sous 768 px, fenêtre − 240 px au-delà ;
 *  - aucun débordement horizontal, ni du document ni de <main>, et aucun texte hors de la colonne
 *    en dehors des cadres de tableau défilants ;
 *  - le nombre de lignes du titre de la page et la largeur des cadres de tableau défilants ;
 *  - la navigation : en flux dès 768 px, tiroir fermé par défaut en dessous, ouvert par le bouton
 *    du bandeau (focus dans le tiroir, Tab y reste, Échap ou le voile le referment et rendent le
 *    focus au bouton, un lien le referme en naviguant) — même motif que le tableau de bord ;
 *  - la neutralisation de la transition du tiroir sous `prefers-reduced-motion: reduce` ;
 *  - la dette axe « serious » de chaque vue n'est pas aggravée par rapport au relevé « avant ».
 *
 * `NORMATIF_PHASE=avant` relève les mêmes mesures sans les assertions (état de référence) ;
 * `NORMATIF_OUT` déplace le dossier de sortie, `NORMATIF_CAPTURE=0` désactive les captures.
 */
const PHASE = process.env.NORMATIF_PHASE === "avant" ? "avant" : "apres";
const ROOT = process.env.NORMATIF_OUT ?? path.join(process.cwd(), "docs", "probant-lots", "normatif-captures");
const OUT = path.join(ROOT, PHASE);
const CAPTURE = process.env.NORMATIF_CAPTURE !== "0";
const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const WIDTHS = [1440, 1024, 390] as const;
/** Largeur de la navigation latérale (`w-60`) et seuil `md` (48rem) à partir duquel elle reste en flux. */
const SIDEBAR = 240;
const MD = 768;

/** Titres réels de chaque route : on attend le titre avant de lire la page (voir e2e/partial-coverage.spec.ts). */
const ROUTES = [
  { name: "accueil", path: "/normatif", level: 2, title: "Audit Normatif 360" },
  { name: "cycles", path: "/normatif/cycles", level: 2, title: "Cycles d'audit" },
  { name: "cycle", path: "/normatif/cycles/achats-charges-externes", level: 1, title: "Achats et charges externes" },
  { name: "sources", path: "/normatif/sources", level: 2, title: "Sources normatives" },
  {
    name: "source",
    path: "/normatif/sources/cc-capitaux-propres",
    level: 1,
    title: "Code de commerce — Perte de la moitié du capital social (art. L.225-248)",
  },
  { name: "methodologie", path: "/normatif/methodologie", level: 2, title: "Méthodologie & contrôles qualité" },
  { name: "export", path: "/normatif/export", level: 2, title: "Export de la cartographie" },
] as const;

interface Layout {
  route: string;
  width: number;
  document: { scrollWidth: number; clientWidth: number };
  main: { left: number; width: number; clientWidth: number; scrollWidth: number };
  /** Textes de <main> qui dépassent son bord droit hors d'un cadre défilant prévu (tableaux). */
  overflowing: string[];
  sidebar: { visible: boolean; left: number; width: number };
  heading: { width: number; lines: number };
  /** Cadres défilants qui contiennent un tableau : largeur visible et largeur du contenu. */
  tableFrames: { clientWidth: number; scrollWidth: number }[];
  axeSerious?: Record<string, number>;
}

async function waitForTitle(page: Page, route: (typeof ROUTES)[number]) {
  await expect(page.locator("main").getByRole("heading", { level: route.level, name: route.title, exact: true })).toBeVisible();
}

/** Même relevé que e2e/cloisons-mise-en-page.spec.ts : nœuds « serious »/« critical » par règle. */
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

async function measure(page: Page, route: (typeof ROUTES)[number], width: number): Promise<Layout> {
  const raw = await page.evaluate(
    ({ level, title }) => {
      const doc = document.scrollingElement!;
      const mainEl = document.querySelector("main")!;
      const main = mainEl.getBoundingClientRect();
      const aside = document.querySelector("aside")!;
      const a = aside.getBoundingClientRect();
      const visible = getComputedStyle(aside).visibility !== "hidden" && a.right > 0 && a.left < window.innerWidth;
      const heading = [...document.querySelectorAll(`main h${level}`)].find((h) => h.textContent?.trim() === title)!;
      // Nombre de lignes du titre : sommets distincts des boîtes de texte (un retour à la ligne = une boîte de plus).
      const range = document.createRange();
      range.selectNodeContents(heading);
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      const tableFrames = [...document.querySelectorAll<HTMLElement>("main table")]
        .map((t) => t.parentElement!)
        .filter((f) => ["auto", "scroll"].includes(getComputedStyle(f).overflowX))
        .map((f) => ({ clientWidth: f.clientWidth, scrollWidth: f.scrollWidth }));
      // Débordement interne de <main> : un texte qui sort de son bord droit ne fait pas déborder le
      // document (main défile dans son cadre) — c'est l'angle mort du seul contrôle scrollWidth.
      // Un texte dans un cadre défilant horizontalement (tableau) est lisible : il est exclu.
      const inScroller = (el: Element | null) => {
        for (let e = el; e && e !== mainEl; e = e.parentElement) {
          if (["auto", "scroll"].includes(getComputedStyle(e).overflowX)) return true;
        }
        return false;
      };
      const walker = document.createTreeWalker(mainEl, NodeFilter.SHOW_TEXT);
      const overflowing: string[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim();
        if (!text || inScroller(n.parentElement)) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        if (r.getBoundingClientRect().right > main.right + 1) overflowing.push(text.slice(0, 80));
      }
      return {
        document: { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth },
        main: { left: Math.round(main.left), width: Math.round(main.width), clientWidth: mainEl.clientWidth, scrollWidth: mainEl.scrollWidth },
        overflowing,
        sidebar: { visible, left: Math.round(a.left), width: Math.round(a.width) },
        heading: { width: Math.round(heading.getBoundingClientRect().width), lines },
        tableFrames,
      };
    },
    { level: route.level, title: route.title },
  );
  return { route: route.path, width, ...raw };
}

/** Relevé « avant » de la même vue, s'il existe : la dette « serious » ne doit pas monter. */
async function baseline(name: string, width: number): Promise<Layout | null> {
  try {
    return JSON.parse(await readFile(path.join(ROOT, "avant", `${name}-${width}.json`), "utf8")) as Layout;
  } catch {
    return null;
  }
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

for (const width of WIDTHS) {
  test.describe(`largeur ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const route of ROUTES) {
      test(`${route.path} — colonne de contenu, titre, tableaux et navigation`, async ({ page }) => {
        await page.goto(route.path);
        await waitForTitle(page, route);
        await page.evaluate(() => document.fonts.ready);
        const layout = await measure(page, route, width);
        layout.axeSerious = await axeSerious(page);
        await writeFile(path.join(OUT, `${route.name}-${width}.json`), JSON.stringify(layout, null, 2));
        if (CAPTURE) await page.screenshot({ path: path.join(OUT, `${route.name}-${width}.png`) });
        if (CAPTURE && route.name === "cycle") {
          // Tableau IFRS / PCG : colonne « Impact audit » rognée (overflow-hidden) avant le lot, défilante après.
          await page.locator("main table", { has: page.getByRole("columnheader", { name: "Impact audit" }) }).scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(OUT, `cycle-ifrs-${width}.png`) });
        }
        if (PHASE === "avant") return;

        if (route.name === "source") {
          // L'URL officielle passe à la ligne sans écraser son icône (12 px), calée sur la première ligne.
          const link = page.locator("main a[href^='https://www.legifrance.gouv.fr']");
          const box = await link.evaluate((a) => {
            const icon = a.querySelector("svg")!.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(a.lastChild!);
            const first = range.getClientRects()[0];
            return { width: Math.round(icon.width), iconMid: icon.top + icon.height / 2, top: first.top, bottom: first.bottom };
          });
          expect(box.width).toBe(12);
          expect(box.iconMid).toBeGreaterThan(box.top);
          expect(box.iconMid).toBeLessThan(box.bottom);
        }

        // Aucun débordement du document (condition nécessaire, pas suffisante : c'était déjà vrai avant),
        // ni de <main> qui défile dans son cadre : aucun texte ne sort de la colonne hors des tableaux.
        expect(layout.document.scrollWidth).toBeLessThanOrEqual(layout.document.clientWidth);
        expect(layout.overflowing).toEqual([]);
        expect(layout.main.scrollWidth).toBeLessThanOrEqual(layout.main.clientWidth);
        const toggle = page.getByRole("button", { name: "Ouvrir la navigation" });
        if (width < MD) {
          // Sous 768 px, le contenu prend toute la largeur ; la navigation attend dans son tiroir fermé.
          expect(layout.main.left).toBe(0);
          expect(layout.main.width).toBe(width);
          expect(layout.sidebar.visible).toBe(false);
          await expect(toggle).toBeVisible();
          await expect(toggle).toHaveAttribute("aria-expanded", "false");
          await expect(toggle).toHaveAttribute("aria-controls", "normatif-nav");
          // Colonne utile : 390 − 2 × 24 px de marge des pages = 342 px. Le titre le plus long
          // (≈ 70 caractères en 20 px gras) tient alors sur 3 à 4 lignes, pas une douzaine.
          expect(layout.heading.width).toBeGreaterThanOrEqual(300);
          expect(layout.heading.lines).toBeLessThanOrEqual(4);
          for (const frame of layout.tableFrames) expect(frame.clientWidth).toBeGreaterThanOrEqual(300);
        } else {
          // Dès 768 px, la navigation reste en flux à gauche et le bouton du bandeau disparaît.
          expect(layout.sidebar.visible).toBe(true);
          expect(layout.sidebar.left).toBe(0);
          expect(layout.sidebar.width).toBe(SIDEBAR);
          expect(layout.main.left).toBe(SIDEBAR);
          expect(layout.main.width).toBe(width - SIDEBAR);
          await expect(toggle).toBeHidden();
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

test.describe("méthodologie : arbre clé/valeur aux largeurs intermédiaires", () => {
  // Avant le correctif, chaque niveau imbriqué de ContentTree réservait 160 px à sa clé : la plus
  // étroite des valeurs mesurait 120 px à 1440, 8 px à 1024 et 0 px à 768 et 640 (texte hors de
  // <main>). Une valeur n'a plus jamais moins de 7rem (112 px) à côté de sa clé : sinon elle passe dessous.
  const methodologie = ROUTES.find((r) => r.name === "methodologie")!;
  for (const width of [1440, 1280, 1024, 768, 640] as const) {
    test(`${width} px — aucune valeur écrasée ni hors de la colonne`, async ({ page }) => {
      test.skip(PHASE === "avant", "relevé « avant » fait par la boucle principale");
      await page.setViewportSize({ width, height: 900 });
      await page.goto(methodologie.path);
      await waitForTitle(page, methodologie);
      const layout = await measure(page, methodologie, width);
      expect(layout.overflowing).toEqual([]);
      expect(layout.main.scrollWidth).toBeLessThanOrEqual(layout.main.clientWidth);
      const narrowest = await page.evaluate(() => {
        // Valeurs placées à côté de leur clé (même ligne) : la plus étroite.
        const sideBySide = [...document.querySelectorAll<HTMLElement>("main dl > div > dd")].filter((dd) => {
          const dt = dd.previousElementSibling!.getBoundingClientRect();
          return Math.abs(dd.getBoundingClientRect().top - dt.top) < 2;
        });
        return Math.min(...sideBySide.map((dd) => dd.getBoundingClientRect().width));
      });
      expect(narrowest).toBeGreaterThanOrEqual(112);
    });
  }
});

test.describe("tiroir de navigation à 390", () => {
  test.use({ viewport: { width: 390, height: 900 } });
  test.skip(PHASE === "avant", "le tiroir n'existe pas avant le lot");

  const source = ROUTES.find((r) => r.name === "source")!;
  const cycles = ROUTES.find((r) => r.name === "cycles")!;

  test("clavier : focus dans le tiroir, Tab y reste, Échap le referme et rend le focus au bouton", async ({ page }) => {
    await page.goto(source.path);
    await waitForTitle(page, source);
    const nav = page.locator("#normatif-nav");
    const toggle = page.getByRole("button", { name: "Ouvrir la navigation" });
    // Fermé, le tiroir est hors de l'ordre de tabulation.
    await expect(nav).toBeHidden();
    await expect(nav.getByRole("link", { name: "Sources normatives" })).toBeHidden();

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(nav).toBeVisible();
    const close = nav.getByRole("button", { name: "Fermer la navigation" });
    await expect(close).toBeFocused();
    // Le contenu derrière le voile est inerte : ni focus ni lecture d'écran.
    expect(await page.evaluate(() => document.querySelector("main")!.closest("[inert]") !== null)).toBe(true);
    if (CAPTURE) {
      await nav.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      await page.screenshot({ path: path.join(OUT, "tiroir-ouvert-390.png") });
    }

    // Un tour complet de Tab, puis Maj+Tab depuis le premier élément : le focus ne sort jamais du tiroir.
    const count = await nav.evaluate((el) => el.querySelectorAll("a[href], button:not([disabled])").length);
    for (let i = 0; i < count + 1; i++) {
      await page.keyboard.press("Tab");
      expect(await nav.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await nav.getByRole("link").first().focus();
    await page.keyboard.press("Shift+Tab");
    expect(await nav.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(nav).toBeHidden();
    await expect(toggle).toBeFocused();
    expect(await page.evaluate(() => document.querySelector("main")!.closest("[inert]"))).toBeNull();
  });

  test("pointeur : le voile et le bouton Fermer referment ; un lien navigue et referme", async ({ page }) => {
    await page.goto(source.path);
    await waitForTitle(page, source);
    const nav = page.locator("#normatif-nav");
    const toggle = page.getByRole("button", { name: "Ouvrir la navigation" });

    await toggle.click();
    await expect(nav).toBeVisible();
    // Le voile couvre la zone à droite du tiroir (240 px) ; un clic y referme.
    await page.mouse.click(350, 450);
    await expect(nav).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();
    await nav.getByRole("button", { name: "Fermer la navigation" }).click();
    await expect(nav).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await nav.getByRole("link", { name: "Cycles d'audit" }).click();
    await expect(page).toHaveURL(/\/normatif\/cycles$/);
    await waitForTitle(page, cycles);
    await expect(nav).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("passage à 1024 tiroir ouvert : la navigation revient en flux et le contenu n'est plus inerte", async ({ page }) => {
    await page.goto(source.path);
    await waitForTitle(page, source);
    const toggle = page.getByRole("button", { name: "Ouvrir la navigation" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(page.locator("#normatif-nav")).toBeVisible();
    await expect(toggle).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.querySelector("main")!.closest("[inert]"))).toBeNull();
    const main = await page.evaluate(() => Math.round(document.querySelector("main")!.getBoundingClientRect().left));
    expect(main).toBe(SIDEBAR);
    // De retour en étroit, le tiroir est refermé (pas de voile résiduel).
    await page.setViewportSize({ width: 390, height: 900 });
    await expect(page.locator("#normatif-nav")).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});

test.describe("mouvement réduit", () => {
  test.skip(PHASE === "avant", "le tiroir n'existe pas avant le lot");

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`transition du tiroir — ${reducedMotion}`, async ({ browser }) => {
      const context = await browser.newContext({ reducedMotion, viewport: { width: 390, height: 900 } });
      const page = await context.newPage();
      const source = ROUTES.find((r) => r.name === "source")!;
      await page.goto(source.path);
      await waitForTitle(page, source);
      const duration = await page.locator("#normatif-nav").evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
      // 200 ms par défaut ; la règle globale de app/globals.css la ramène à 0,001 ms sous « reduce ».
      if (reducedMotion === "reduce") expect(duration).toBeLessThan(0.01);
      else expect(duration).toBeCloseTo(0.2, 3);
      await context.close();
    });
  }
});
