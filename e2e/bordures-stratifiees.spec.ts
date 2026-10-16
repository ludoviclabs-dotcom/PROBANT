import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Lot transversal — stratification de la règle globale `* { border-color }`.
 *
 * Avant ce lot, `app/globals.css` posait `* { border-color: var(--pb-border) }` hors de toute
 * `@layer` : une règle non stratifiée l'emporte sur les utilitaires Tailwind (stratifiés), si bien
 * que toute classe `border-<couleur>` était ignorée et seul un style inline fonctionnait.
 *
 * Ce spec, exécuté contre le build de production, fait deux choses :
 *  - **inventaire** : sur chaque vue et à chaque largeur, il relève les éléments portant une classe
 *    de bordure colorée (`border-[#…]`, `border-[var(--pb-accent)]`, `border-amber-*`, …), leurs
 *    couleurs calculées et la dette axe « serious » ; le relevé est écrit en JSON à côté des captures ;
 *  - **preuve** : il vérifie que les couleurs de bordure déclarées en classe sont désormais
 *    appliquées (plus aucun style inline nécessaire) et que la dette axe « serious » n'est pas
 *    aggravée par rapport au relevé « avant » lorsqu'il existe.
 *
 * `BORDURES_PHASE=avant` relance le même relevé sans les assertions de preuve (état de référence).
 * `BORDURES_OUT` déplace le dossier de sortie ; `BORDURES_CAPTURE=0` désactive les captures.
 */
const PHASE = process.env.BORDURES_PHASE === "avant" ? "avant" : "apres";
const ROOT = process.env.BORDURES_OUT ?? path.join(process.cwd(), "docs", "probant-lots", "bordures-captures");
const OUT = path.join(ROOT, PHASE);
const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const WIDTHS = [1440, 1024, 390] as const;
const CAPTURE = process.env.BORDURES_CAPTURE !== "0";
/** `--pb-border` (#243044) : la couleur que la règle globale imposait à toutes les bordures. */
const PB_BORDER = "rgb(36, 48, 68)";
const PB_WARN = "rgb(245, 158, 11)";

/** Vues où le recensement a trouvé des classes de bordure colorée (voir le handoff). */
const PAGES = [
  { name: "synthese", path: "/dashboard/synthese" },
  { name: "tests", path: "/dashboard/tests" },
  { name: "risques", path: "/dashboard/risques" },
  { name: "cloisons", path: "/dashboard/cloisons" },
  { name: "depot", path: "/dashboard/depot" },
  { name: "dossier", path: "/dashboard/dossier" },
  { name: "fiscalite", path: "/dashboard/fiscalite" },
  { name: "normatif", path: "/normatif" },
  { name: "normatif-cycle", path: "/normatif/cycles/achats-charges-externes" },
  { name: "normatif-sources", path: "/normatif/sources" },
  { name: "onboarding", path: "/onboarding" },
] as const;

interface BorderRecord {
  tag: string;
  text: string;
  tokens: string[];
  inlineStyle: string | null;
  widths: [string, string, string, string];
  colors: [string, string, string, string];
}
interface PageInventory {
  page: string;
  path: string;
  width: number;
  phase: string;
  /** Éléments visibles portant une classe de bordure colorée (variantes hover/focus exclues). */
  elements: BorderRecord[];
  /** Parmi eux, ceux dont toutes les bordures visibles restent à `--pb-border` : classe ignorée. */
  stillDefault: number;
  axeSerious: Record<string, number>;
  /** Largeur de défilement du document : un débordement horizontal préexistant est relevé, pas aggravé. */
  scrollWidth: number;
  clientWidth: number;
}

async function inventory(page: Page): Promise<Pick<PageInventory, "elements" | "stillDefault">> {
  return page.evaluate((PB_BORDER) => {
    // Jetons de couleur de bordure : valeur arbitraire (#hex, var(--pb-*) autre que --pb-border, color-mix)
    // ou palette Tailwind (amber, red, sky), au repos seulement (ni hover: ni focus:).
    const colored = /^border(-[trblxyse])?-(\[(#|color:|color-mix|var\(--pb-(?!border\)))[^\]]*\](\/\d+)?|(amber|red|sky)-\d{3}(\/\d+)?|current)$/;
    const out: BorderRecord[] = [];
    let stillDefault = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[class]"))) {
      const tokens = (el.getAttribute("class") ?? "").split(/\s+/).filter((t) => colored.test(t));
      if (tokens.length === 0) continue;
      const cs = getComputedStyle(el);
      const widths: [string, string, string, string] = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth];
      if (widths.every((w) => w === "0px")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const colors: [string, string, string, string] = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor];
      const visible = colors.filter((_, i) => widths[i] !== "0px");
      if (visible.every((c) => c === PB_BORDER)) stillDefault += 1;
      out.push({ tag: el.tagName.toLowerCase(), text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60), tokens, inlineStyle: el.getAttribute("style"), widths, colors });
    }
    return { elements: out, stillDefault };
  }, PB_BORDER);
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

async function overflow(page: Page) {
  return page.evaluate(() => { const el = document.scrollingElement!; return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }; });
}

async function record(page: Page, name: string, width: number, pathname: string) {
  await mkdir(OUT, { recursive: true });
  const inv = await inventory(page);
  const data: PageInventory = { page: name, path: pathname, width, phase: PHASE, ...inv, axeSerious: await axeSerious(page), ...(await overflow(page)) };
  await writeFile(path.join(OUT, `${name}-${width}.json`), JSON.stringify(data, null, 1), "utf8");
  if (CAPTURE) await page.screenshot({ path: path.join(OUT, `${name}-${width}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
  return data;
}

/**
 * Capture longue : la zone de contenu défile dans son cadre, une capture « page entière » à 900 px ne montre
 * que la ligne de flottaison. La fenêtre est dépliée à la hauteur du contenu (plafond 4 000 px) puis, en phase
 * « après » seulement, la règle non stratifiée est réinjectée telle qu'elle existait (`* { border-color }` hors
 * `@layer`) pour produire un « avant simulé » au même cadrage sur le même build — les styles inline retirés par
 * ce lot n'y figurent plus, ce qui est documenté dans le README des captures.
 */
async function longCapture(page: Page, name: string, width: number) {
  if (!CAPTURE) return;
  const height = await page.evaluate(() => {
    const main = document.querySelector("main");
    const inner = main ? Array.from(main.querySelectorAll<HTMLElement>("*")).filter((el) => el.scrollHeight > el.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(el).overflowY)).map((el) => el.scrollHeight) : [];
    return Math.min(4000, Math.max(900, document.documentElement.scrollHeight, main?.scrollHeight ?? 0, ...inner) + 120);
  });
  await page.setViewportSize({ width, height });
  await page.screenshot({ path: path.join(OUT, `${name}-${width}-long.jpg`), fullPage: true, type: "jpeg", quality: 70 });
  if (PHASE === "apres") {
    await page.addStyleTag({ content: "* { border-color: var(--pb-border); }" });
    const sim = path.join(ROOT, "avant-simule");
    await mkdir(sim, { recursive: true });
    await page.screenshot({ path: path.join(sim, `${name}-${width}-long.jpg`), fullPage: true, type: "jpeg", quality: 70 });
  }
  await page.setViewportSize({ width, height: 900 });
}

/** Relevé « avant » de la même vue, s'il existe : la dette « serious » ne doit pas monter. */
async function readBefore(name: string, width: number): Promise<PageInventory | null> {
  try { return JSON.parse(await readFile(path.join(ROOT, "avant", `${name}-${width}.json`), "utf8")) as PageInventory; } catch { return null; }
}

/**
 * Débordements horizontaux préexistants, hors périmètre de ce lot (une couleur de bordure ne change pas la
 * mise en page). La largeur mesurée dépend des polices de la machine (Onboarding 390 : 448 px sous Windows,
 * 454 px sous Linux CI), d'où une dette gelée par vue et largeur plutôt qu'une comparaison au relevé « avant ».
 */
const KNOWN_OVERFLOW: Readonly<Record<string, true>> = { "onboarding-390": true };

function expectNotWorse(after: PageInventory, before: PageInventory | null) {
  if (!KNOWN_OVERFLOW[`${after.page}-${after.width}`]) {
    expect(after.scrollWidth, `${after.page} ${after.width} : débordement horizontal global`).toBeLessThanOrEqual(after.clientWidth);
  }
  if (!before) return;
  for (const [key, count] of Object.entries(after.axeSerious)) {
    expect(count, `${after.page} ${after.width} : « ${key} » ${count} nœud(s), relevé avant ${before.axeSerious[key] ?? 0}`).toBeLessThanOrEqual(before.axeSerious[key] ?? 0);
  }
}

for (const width of WIDTHS) {
  test.describe(`largeur ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const target of PAGES) {
      test(`${target.name} — inventaire des bordures colorées, captures, dette axe non aggravée`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(target.path);
        await page.waitForLoadState("networkidle");
        const data = await record(page, target.name, width, target.path);
        await longCapture(page, target.name, width);
        if (PHASE === "avant") return;
        // Preuve : plus aucun élément à classe de bordure colorée ne reste à la couleur neutre sur toutes ses faces visibles.
        expect(data.stillDefault, `${target.name} : ${data.stillDefault} élément(s) dont la classe de couleur est encore ignorée\n${JSON.stringify(data.elements.filter(e => e.colors.filter((_, i) => e.widths[i] !== "0px").every(c => c === PB_BORDER)), null, 1)}`).toBe(0);
        expectNotWorse(data, await readBefore(target.name, width));
      });
    }

    test("synthese — l'action prioritaire n'a aucun style inline et son lien porte l'accent du jeton", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/dashboard/synthese");
      const section = page.getByRole("region", { name: "Action prioritaire" });
      await expect(section).toBeVisible();
      // Refonte « salle d'instruments » : le ruban de contexte est stylé par module CSS ; la couleur d'accent est celle
      // du jeton `--pb-verif`, résolue sur le même élément (clair ou sombre), et aucun style n'est posé en ligne.
      const probe = await section.evaluate((el) => {
        const link = el.querySelector("a");
        const reference = document.createElement("span");
        reference.style.color = "var(--pb-verif)";
        el.appendChild(reference);
        const accent = getComputedStyle(reference).color;
        reference.remove();
        return { left: getComputedStyle(el).borderLeftColor, top: getComputedStyle(el).borderTopColor, inline: el.getAttribute("style"), linkInline: link?.getAttribute("style") ?? null, linkColor: link ? getComputedStyle(link).color : null, accent };
      });
      const badge = page.locator('header span[class*="border-[#3b82f6]/50"]').first();
      const badgeColor = (await badge.count()) ? await badge.evaluate((el) => getComputedStyle(el).borderTopColor) : null;
      await mkdir(OUT, { recursive: true });
      await writeFile(path.join(OUT, `synthese-action-prioritaire-${width}.json`), JSON.stringify({ phase: PHASE, width, ...probe, badgeColor }, null, 1), "utf8");
      if (CAPTURE) await section.screenshot({ path: path.join(OUT, `synthese-action-prioritaire-${width}.jpg`), type: "jpeg", quality: 80 });
      if (PHASE === "avant") return;
      expect(probe.inline).toBeNull();
      expect(probe.linkInline).toBeNull();
      expect(probe.linkColor).toBe(probe.accent);
      if (badgeColor !== null) expect(badgeColor, "pastille source du bandeau : classe border-[#3b82f6]/50").not.toBe(PB_BORDER);
    });

    test("tests — la feuille bloquée porte l'ambre par classe, sans style inline", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/dashboard/tests");
      const region = page.getByRole("region", { name: /Laboratoire de scénarios/ });
      await region.getByRole("button", { name: "Nouveau scénario synthétique" }).click();
      await expect(region).toContainText("SYN-");
      await region.getByRole("combobox", { name: "Cycle", exact: true }).selectOption("cash");
      await region.getByLabel("Pièce manquante").check();
      await region.getByRole("button", { name: "Exécuter ce cycle" }).click();
      const blocked = region.getByRole("status").filter({ hasText: "Voir la source requise" });
      await expect(blocked).toBeVisible();
      const probe = await blocked.evaluate((el) => ({ left: getComputedStyle(el).borderLeftColor, top: getComputedStyle(el).borderTopColor, inline: el.getAttribute("style") }));
      await mkdir(OUT, { recursive: true });
      await writeFile(path.join(OUT, `tests-bloque-${width}.json`), JSON.stringify({ phase: PHASE, width, ...probe }, null, 1), "utf8");
      if (CAPTURE) await blocked.screenshot({ path: path.join(OUT, `tests-bloque-${width}.jpg`), type: "jpeg", quality: 80 });
      if (PHASE === "avant") return;
      expect(probe.left).toBe(PB_WARN);
      // Faces non accentuées : ambre à 50 % (color-mix), donc ni la couleur neutre ni l'ambre plein.
      expect(probe.top).not.toBe(PB_BORDER);
      expect(probe.top).not.toBe(PB_WARN);
      expect(probe.inline).toBeNull();
    });
  });
}
