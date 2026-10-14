import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Revue par cloison — lisibilité de la liste des silos.
 *
 * Défaut antérieur (main 663ceb1, captures du lot bordures du 13/10/2026) : le panneau de revue
 * fixe de 406 px (« Aucun constat sélectionné ») ne rétrécissait pas et écrasait la colonne des
 * silos — ≈ 32 px de large à 390 px pour ≈ 453 px de contenu, 296 px à 1024 px (gravité et
 * effet rognés « 1 co… ») — et le conteneur principal défilait horizontalement.
 *
 * Aux largeurs 1440, 1024 et 390, sur le dossier démo, ce spec relève puis vérifie :
 *  - aucun débordement horizontal, ni du document ni de <main> (qui défile dans son cadre) ;
 *  - chaque ligne de silo occupe la largeur de la liste et aucun de ses textes n'est rogné ou
 *    sorti de la ligne ; aucun texte d'une carte de constat ouverte ne passe sous « Analyser » ;
 *  - le panneau de revue : ancré à droite quand la place le permet (1440), tiroir modal sinon
 *    (focus sur « Fermer », Tab reste dans le tiroir, Échap le referme et rend le focus) ;
 *  - la dette axe « serious » de la page n'est pas aggravée par rapport au relevé « avant ».
 *
 * `CLOISONS_PHASE=avant` relève les mêmes mesures sans les assertions (état de référence) ;
 * `CLOISONS_OUT` déplace le dossier de sortie, `CLOISONS_CAPTURE=0` désactive les captures.
 */
const PHASE = process.env.CLOISONS_PHASE === "avant" ? "avant" : "apres";
const ROOT = process.env.CLOISONS_OUT ?? path.join(process.cwd(), "docs", "probant-lots", "cloisons-captures");
const OUT = path.join(ROOT, PHASE);
const CAPTURE = process.env.CLOISONS_CAPTURE !== "0";
const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
/** Avant le lot, les lignes n'étaient pas marquées : on les reconnaît à leur structure (chevron, libellé, comptes). */
const ROW_SELECTOR = PHASE === "avant" ? "main button:has(> svg:first-child + div > div + div)" : "main button[data-silo-row]";

interface Layout {
  document: { scrollWidth: number; clientWidth: number };
  main: { scrollWidth: number; clientWidth: number };
  rows: { label: string; width: number; clientWidth: number; scrollWidth: number; clipped: string[] }[];
  cards: { title: string; width: number; overlapping: string[] }[];
  axeSerious?: Record<string, number>;
}

/** Même relevé que e2e/bordures-stratifiees.spec.ts : nœuds « serious »/« critical » par règle. */
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

async function measure(page: Page): Promise<Layout> {
  return page.evaluate((rowSelector) => {
    const leaves = (root: Element) =>
      [...root.querySelectorAll<HTMLElement>("*")].filter((el) => el.children.length === 0 && (el.textContent ?? "").trim() !== "");
    /** Étendue réelle du texte (un texte qui déborde de sa boîte dépasse le rectangle de l'élément). */
    const textRect = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    };
    const doc = document.scrollingElement!;
    const main = document.querySelector("main")!;
    const rows = [...document.querySelectorAll<HTMLButtonElement>(rowSelector)].map((b) => {
      // La ligne est rognée par son cadre (overflow: hidden) : c'est lui la zone visible.
      const frame = (b.parentElement ?? b).getBoundingClientRect();
      const clipped = leaves(b)
        .filter((el) => {
          const r = textRect(el);
          return r.right > frame.right + 1 || r.left < frame.left - 1 || el.scrollWidth > el.clientWidth + 1;
        })
        .map((el) => (el.textContent ?? "").trim());
      return {
        label: (leaves(b)[0]?.textContent ?? "").trim(),
        width: Math.round(b.getBoundingClientRect().width),
        clientWidth: b.clientWidth,
        scrollWidth: b.scrollWidth,
        clipped,
      };
    });
    const cards = [...main.querySelectorAll<HTMLButtonElement>("button")]
      .filter((b) => /^(Analyser|Fermer)$/.test((b.textContent ?? "").trim()))
      .map((button) => {
        const card = button.parentElement!.parentElement!;
        const br = button.getBoundingClientRect();
        const overlapping = leaves(card)
          .filter((el) => !button.contains(el))
          .filter((el) => {
            const r = textRect(el);
            return r.left < br.right && r.right > br.left && r.top < br.bottom && r.bottom > br.top;
          })
          .map((el) => (el.textContent ?? "").trim());
        return { title: leaves(card)[0]?.textContent?.trim() ?? "", width: Math.round(card.getBoundingClientRect().width), overlapping };
      });
    return {
      document: { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth },
      main: { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth },
      rows,
      cards,
    };
  }, ROW_SELECTOR);
}

/** La zone de contenu défile dans son cadre : on agrandit la fenêtre le temps d'une capture longue. */
async function longCapture(page: Page, name: string) {
  if (!CAPTURE) return;
  const viewport = page.viewportSize()!;
  const height = await page.evaluate(() => Math.min(5000, Math.max(900, document.querySelector("main")!.scrollHeight + 80)));
  await page.setViewportSize({ width: viewport.width, height });
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 72 });
  await page.setViewportSize(viewport);
}

async function openCloisons(page: Page) {
  await page.goto("/dashboard/cloisons");
  await expect(page.getByRole("heading", { name: "Revue par cloison" })).toBeVisible();
  await expect(page.locator("[data-effects-summary]")).toBeVisible();
  await expect(page.locator(ROW_SELECTOR).first()).toBeVisible();
}

for (const width of [1440, 1024, 390] as const) {
  test.describe(`largeur ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("liste des silos lisible : aucun débordement, aucune ligne rognée", async ({ page }) => {
      await openCloisons(page);
      const layout = await measure(page);
      layout.axeSerious = await axeSerious(page);
      await mkdir(OUT, { recursive: true });
      await writeFile(path.join(OUT, `cloisons-${width}.json`), JSON.stringify(layout, null, 2));
      if (CAPTURE) await page.screenshot({ path: path.join(OUT, `cloisons-${width}.jpg`), type: "jpeg", quality: 72 });
      await longCapture(page, `cloisons-${width}-long`);
      if (PHASE === "avant") return;

      expect(layout.document.scrollWidth, "débordement horizontal du document").toBeLessThanOrEqual(layout.document.clientWidth);
      expect(layout.main.scrollWidth, "débordement horizontal du conteneur principal").toBeLessThanOrEqual(layout.main.clientWidth);
      expect(layout.rows.length, "lignes de silo du dossier démo").toBeGreaterThan(10);
      for (const row of layout.rows) {
        expect(row.scrollWidth, `ligne « ${row.label} » : contenu plus large que la ligne`).toBeLessThanOrEqual(row.clientWidth);
        expect(row.clipped, `ligne « ${row.label} » : texte rogné`).toEqual([]);
        // La liste n'est plus écrasée : une ligne occupe l'essentiel de la zone principale.
        expect(row.width, `ligne « ${row.label} » écrasée`).toBeGreaterThanOrEqual(0.55 * layout.main.clientWidth);
      }
      expect(layout.cards.length, "cartes de constat des silos ouverts").toBeGreaterThan(0);
      for (const card of layout.cards) expect(card.overlapping, `carte « ${card.title} » : texte sous le bouton`).toEqual([]);
      const before = await readFile(path.join(ROOT, "avant", `cloisons-${width}.json`), "utf-8").then((t) => JSON.parse(t) as Layout).catch(() => null);
      for (const [rule, count] of Object.entries(layout.axeSerious)) {
        if (before?.axeSerious) expect(count, `axe « ${rule} » : ${count} nœud(s), relevé avant ${before.axeSerious[rule] ?? 0}`).toBeLessThanOrEqual(before.axeSerious[rule] ?? 0);
      }
      // Ancre de la visite guidée (temps 5) : le silo vitrine reste ouvert et visible ; dès que la
      // liste a la place (1024 en tiroir, 1440 ancré), le connecteur ligne → constat est tracé.
      await expect(page.locator('[data-tour="bezier-link"]')).toBeVisible();
      if (width >= 1024) await expect(page.locator('[data-tour="bezier-link"] > svg > path').first()).toBeVisible();
      // Effets C05 inchangés sur les lignes.
      await expect(page.locator(ROW_SELECTOR).filter({ hasText: "Provisions" }).first()).toContainText(/Résultat − 145\s000 €/);
      await expect(page.locator(ROW_SELECTOR).filter({ hasText: "effet non chiffré" }).first()).toBeVisible();
    });

    test("filtres ouverts : le menu reste dans la fenêtre", async ({ page }) => {
      test.skip(PHASE === "avant", "relevé avant le lot : sonde ponctuelle, voir le handoff");
      await openCloisons(page);
      for (const label of ["Sévérité", "Statut", "Nature"]) {
        await page.getByRole("button", { name: new RegExp(`^${label}`) }).click();
        const firstItem = { Sévérité: "Bloquant", Statut: "En attente", Nature: "Obligatoire" }[label]!;
        await expect(page.getByRole("button", { name: firstItem, exact: true })).toBeVisible();
        const layout = await measure(page);
        expect(layout.document.scrollWidth, `${label} ouvert : débordement du document`).toBeLessThanOrEqual(layout.document.clientWidth);
        expect(layout.main.scrollWidth, `${label} ouvert : débordement du conteneur principal`).toBeLessThanOrEqual(layout.main.clientWidth);
        await page.getByRole("heading", { name: "Revue par cloison" }).click();
      }
    });

    test("panneau de revue : ancré quand la place le permet, tiroir modal sinon", async ({ page }) => {
      test.skip(PHASE === "avant", "le tiroir n'existe pas avant le lot");
      await openCloisons(page);
      const placeholder = page.getByText("Aucun constat sélectionné");
      const analyser = page.getByRole("button", { name: "Analyser" }).first();
      await analyser.scrollIntoViewIfNeeded();

      if (width === 1440) {
        await expect(placeholder).toBeVisible();
        await analyser.click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        const rail = page.locator("aside[data-review-rail]");
        await expect(rail.getByRole("heading", { level: 3 })).toBeVisible();
        await expect(rail.getByRole("button", { name: /Valider/ })).toBeVisible();
        if (CAPTURE) await page.screenshot({ path: path.join(OUT, `cloisons-${width}-revue.jpg`), type: "jpeg", quality: 72 });
        return;
      }

      await expect(placeholder).toBeHidden();
      await analyser.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("heading", { level: 3 })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Fermer le panneau de revue" })).toBeFocused();
      // L'entrée (pb-drawer-in) part de translateX(16px) : on mesure une fois l'animation terminée.
      await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
      const box = (await dialog.boundingBox())!;
      expect(box.x, "tiroir dans la fenêtre").toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, "tiroir dans la fenêtre").toBeLessThanOrEqual(width + 1);
      const layout = await measure(page);
      expect(layout.document.scrollWidth).toBeLessThanOrEqual(layout.document.clientWidth);
      expect(layout.main.scrollWidth).toBeLessThanOrEqual(layout.main.clientWidth);
      if (CAPTURE) await page.screenshot({ path: path.join(OUT, `cloisons-${width}-revue.jpg`), type: "jpeg", quality: 72 });

      // Tab et Maj+Tab restent dans le tiroir.
      for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
      await page.keyboard.press("Shift+Tab");
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);

      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Analyser" }).first()).toBeFocused();
    });
  });
}

test.describe("mouvement réduit", () => {
  test.use({ viewport: { width: 390, height: 900 } });

  test("l'entrée du tiroir est neutralisée par la règle prefers-reduced-motion", async ({ page }) => {
    test.skip(PHASE === "avant", "le tiroir n'existe pas avant le lot");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openCloisons(page);
    await page.getByRole("button", { name: "Analyser" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Chromium écrit 0,001 ms « 1e-06s » : on compare la valeur.
    const seconds = await dialog.evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
    expect(seconds).toBeLessThanOrEqual(0.00001);
  });
});
