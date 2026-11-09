import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Audit Normatif 360 — charte « papier », mise en page et veille, aux largeurs 1440, 1024 et 390.
 *
 * Défaut antérieur (production f2dad09, relevé du 09/11/2026) : la landing présentait la section 04 dans
 * l'ambiance papier, mais tout lien vers /normatif ouvrait l'ancienne interface sombre (barre latérale violette,
 * grilles de cartes, couleurs codées en dur) et chaque clic y restait. Le module adopte l'ambiance papier de la
 * landing : en-tête PROBANT, onglets, bandeau d'état (expertise et veille), contenu qui défile avec le document.
 *
 * Sur chaque route et à chaque largeur, ce spec relève puis vérifie :
 *  - l'ambiance papier (attribut `data-ambiance`, fond #F3EFE6) et le titre réel de la page (h1) ;
 *  - aucun débordement du document ni texte hors de <main> en dehors des cadres défilants prévus ;
 *  - les onglets : page courante marquée, visible dans son cadre ; sous 560 px, une seule ligne défilante ;
 *  - la dette axe « serious » / « critical » : aucune.
 * Puis la veille : frise (ou liste sous 820 px de contenu), panneau de détail, lien profond `?evolution=`, et la
 * neutralisation des animations sous `prefers-reduced-motion: reduce`.
 *
 * `NORMATIF_OUT` déplace le dossier des relevés et captures ; `NORMATIF_CAPTURE=0` désactive les captures.
 */
const ROOT = process.env.NORMATIF_OUT ?? path.join(process.cwd(), "docs", "probant-lots", "normatif-captures", "papier");
const CAPTURE = process.env.NORMATIF_CAPTURE !== "0";
const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const WIDTHS = [1440, 1024, 390] as const;
const PAPIER_BG = "rgb(243, 239, 230)";

const ROUTES = [
  { name: "accueil", path: "/normatif", title: "Audit Normatif 360", tab: "Vue d'ensemble" },
  { name: "cycles", path: "/normatif/cycles", title: "Cycles d'audit", tab: "Cycles d'audit" },
  { name: "cycle", path: "/normatif/cycles/achats-charges-externes", title: "Achats et charges externes", tab: "Cycles d'audit" },
  { name: "sources", path: "/normatif/sources", title: "Sources normatives", tab: "Sources normatives" },
  {
    name: "source",
    path: "/normatif/sources/cc-capitaux-propres",
    title: "Code de commerce — Réserve légale et capitaux propres inférieurs à la moitié du capital (art. L232-10, L223-42, L225-248, L226-1, L227-1)",
    tab: "Sources normatives",
  },
  { name: "methodologie", path: "/normatif/methodologie", title: "Méthodologie et contrôles qualité", tab: "Méthodologie" },
  { name: "veille", path: "/normatif/veille", title: "Veille normative", tab: "Veille" },
  { name: "export", path: "/normatif/export", title: "Export de la cartographie", tab: "Export" },
] as const;

async function waitForTitle(page: Page, title: string) {
  await expect(page.locator("main").getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
}

/** Les animations de la charte sont finies (≈ 2,2 s pour la frise) : on attend leur fin avant de relever ou de capturer. */
async function settle(page: Page) {
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map((a) => a.finished)));
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

/** Textes de <main> qui dépassent son bord droit, hors cadres défilants (tableaux, matrice, onglets). */
async function measure(page: Page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement!;
    const mainEl = document.querySelector("main")!;
    const main = mainEl.getBoundingClientRect();
    const inScroller = (el: Element | null) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
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
      const box = r.getBoundingClientRect();
      if (box.width > 0 && box.right > main.right + 1) overflowing.push(text.slice(0, 80));
    }
    const root = document.querySelector("[data-ambiance]");
    const current = document.querySelector<HTMLElement>('nav[aria-label="Audit Normatif 360"] [aria-current="page"]');
    const list = current?.closest("ul");
    const cur = current?.getBoundingClientRect();
    const frame = list?.getBoundingClientRect();
    return {
      document: { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth },
      overflowing,
      ambiance: root?.getAttribute("data-ambiance") ?? null,
      background: root ? getComputedStyle(root).backgroundColor : null,
      tabs: {
        current: current?.textContent?.trim() ?? null,
        visible: Boolean(cur && frame && cur.left >= frame.left - 1 && cur.right <= frame.right + 1),
        wraps: list ? getComputedStyle(list).flexWrap : null,
        height: Math.round(list?.getBoundingClientRect().height ?? 0),
      },
    };
  });
}

test.beforeAll(async () => {
  await mkdir(ROOT, { recursive: true });
});

for (const width of WIDTHS) {
  test.describe(`largeur ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const route of ROUTES) {
      test(`${route.path} — charte papier, onglets, aucun débordement, axe`, async ({ page }) => {
        await page.goto(route.path);
        await waitForTitle(page, route.title);
        await page.evaluate(() => document.fonts.ready);
        await settle(page);
        const layout = await measure(page);
        const axe = await axeSerious(page);
        await writeFile(path.join(ROOT, `${route.name}-${width}.json`), JSON.stringify({ route: route.path, width, ...layout, axe }, null, 2));
        if (CAPTURE) await page.screenshot({ path: path.join(ROOT, `${route.name}-${width}.png`) });

        expect(layout.ambiance).toBe("papier");
        expect(layout.background).toBe(PAPIER_BG);
        expect(layout.document.scrollWidth).toBeLessThanOrEqual(layout.document.clientWidth);
        expect(layout.overflowing).toEqual([]);
        expect(layout.tabs.current).toContain(route.tab);
        expect(layout.tabs.visible).toBe(true);
        if (width < 560) {
          // Une seule ligne d'onglets (≈ 44 px), qui défile ; plus de tiroir ni de bouton d'ouverture.
          expect(layout.tabs.wraps).toBe("nowrap");
          expect(layout.tabs.height).toBeLessThanOrEqual(48);
        }
        await expect(page.getByRole("button", { name: "Ouvrir la navigation" })).toHaveCount(0);
        expect(axe).toEqual({});
      });
    }
  });
}

test.describe("veille normative", () => {
  test("1440 : frise, panneau de détail et choix d'un repère", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/normatif/veille");
    await waitForTitle(page, "Veille normative");
    const frise = page.getByRole("group", { name: /Frise des évolutions normatives/ });
    await expect(frise).toBeVisible();
    const panel = page.getByRole("complementary", { name: "Détail de l'évolution" });
    await expect(panel).toBeVisible();
    const repere = frise.getByRole("button", { name: /^ISA 570 \(2024\)/ });
    await repere.click();
    await expect(repere).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByRole("heading", { level: 3 })).toContainText("ISA 570 (Revised 2024)");
    await expect(panel).toContainText("15 décembre 2026");
    await expect(page).toHaveURL(/evolution=isa-570-revised-2024/);
  });

  test("390 : liste chronologique à la place de la frise, même panneau", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/normatif/veille");
    await waitForTitle(page, "Veille normative");
    await expect(page.getByRole("group", { name: /Frise des évolutions normatives/ })).toBeHidden();
    const list = page.getByRole("list", { name: "Évolutions normatives, par date d'effet" });
    await expect(list).toBeVisible();
    await list.getByRole("button", { name: /IFRS 18 remplace IAS 1/ }).click();
    await expect(page.getByRole("complementary", { name: "Détail de l'évolution" }).getByRole("heading", { level: 3 })).toContainText("IFRS 18");
  });

  for (const [width, mode] of [[1440, "côte à côte"], [1024, "empilé"], [390, "empilé"]] as const) {
    test(`${width} (${mode}) : le panneau de détail est à l'écran après un choix`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/normatif/veille");
      await waitForTitle(page, "Veille normative");
      await settle(page);
      const choice =
        width >= 1180
          ? page.getByRole("group", { name: /Frise des évolutions normatives/ }).getByRole("button", { name: /^IFRS 18 —/ })
          : width >= 820
            ? page.getByRole("group", { name: /Frise des évolutions normatives/ }).getByRole("button", { name: /^IFRS 18 —/ })
            : page.getByRole("list", { name: "Évolutions normatives, par date d'effet" }).getByRole("button", { name: /IFRS 18 remplace IAS 1/ });
      await choice.scrollIntoViewIfNeeded();
      await choice.click();
      const panel = page.getByRole("complementary", { name: "Détail de l'évolution" });
      await expect(panel.getByRole("heading", { level: 3 })).toContainText("IFRS 18");
      // Empilé, le panneau est amené à l'écran (défilement doux) et prend le focus ; côte à côte, il est collant.
      await expect
        .poll(async () => {
          const box = await panel.boundingBox();
          return box !== null && box.y < 900 && box.y + box.height > 0 && box.y >= -4;
        })
        .toBe(true);
      if (width < 1180) await expect(panel).toBeFocused();
    });
  }

  test("lien profond depuis une fiche cycle", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/normatif/cycles/continuite-exploitation");
    await waitForTitle(page, "Continuité d'exploitation");
    const block = page.getByRole("region", { name: "Veille : ce que cette fiche ne reflète pas encore" });
    await expect(block).toBeVisible();
    await block.getByRole("link", { name: /ISA 570 \(Revised 2024\)/ }).click();
    await waitForTitle(page, "Veille normative");
    await expect(page.getByRole("complementary", { name: "Détail de l'évolution" }).getByRole("heading", { level: 3 })).toContainText(
      "ISA 570 (Revised 2024)",
    );
  });

  test("prefers-reduced-motion : aucune animation sur la frise ni sur la matrice", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [path, title] of [
      ["/normatif/veille", "Veille normative"],
      ["/normatif", "Audit Normatif 360"],
    ] as const) {
      await page.goto(path);
      await waitForTitle(page, title);
      const animated = await page.evaluate(
        () => [...document.querySelectorAll("main *")].filter((el) => getComputedStyle(el).animationName !== "none").length,
      );
      expect(animated, path).toBe(0);
    }
  });
});

test.describe("vue d'ensemble : matrice de couverture", () => {
  test("choisir un référentiel estompe les autres colonnes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/normatif");
    await waitForTitle(page, "Audit Normatif 360");
    const nep = page.getByRole("button", { name: /^NEP/ });
    await nep.click();
    await expect(nep).toHaveAttribute("aria-pressed", "true");
    // La transition d'opacité dure 240 ms : on attend l'état final.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const cells = [...document.querySelectorAll<HTMLElement>("table td")];
          const active = cells.filter((c) => c.hasAttribute("data-col-active"));
          const other = cells.filter((c) => !c.hasAttribute("data-col-active"));
          return { count: active.length, active: Number(getComputedStyle(active[0]).opacity), dimmed: Number(getComputedStyle(other[0]).opacity) < 0.5 };
        }),
      )
      .toEqual({ count: 35, active: 1, dimmed: true });
  });
});
