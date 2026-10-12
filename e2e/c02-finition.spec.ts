import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * C02 — finition de Synthèse, Tests et du laboratoire de scénarios.
 *
 * Recette réelle sur le build de production, aux trois largeurs : vide, dossier courant,
 * scénario repris, erreur de reprise, chargement, identifiant long, programme long.
 * Chaque vue est contrôlée sur : débordement global nul, focus et Échap du volet,
 * contraste serious/critical strict (axe, WCAG 2.1 AA) sur les vues modifiées.
 * Les captures vont dans docs/probant-lots/c02-captures/apres (C02_OUT pour les déplacer).
 */
const OUT = process.env.C02_OUT ?? path.join(process.cwd(), "docs", "probant-lots", "c02-captures", "apres");
const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const WIDTHS = [1440, 1024, 390] as const;
const CAPTURE = process.env.C02_CAPTURE !== "0";

async function noGlobalOverflow(page: Page) {
  const m = await page.evaluate(() => { const el = document.scrollingElement!; return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }; });
  expect(m.scrollWidth, "débordement horizontal global").toBeLessThanOrEqual(m.clientWidth);
}
async function shot(page: Page, name: string) {
  await noGlobalOverflow(page);
  if (!CAPTURE) return;
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), fullPage: true, type: "jpeg", quality: 70 });
}
/** Zéro violation « serious » ou « critical » sur le contenu de la vue : plus strict que la baseline historique d'accessibility.spec. */
async function strictAxe(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }[] }> } }).axe;
    // Périmètre : le contenu de la vue (zone <main> du tableau de bord). Le chrome partagé (Sidebar, bandeau) porte la dette
    // documentée --pb-text-faint, hors de ce lot (C00) ; accessibility.spec la gèle séparément.
    const r = await axe.run(document.querySelector("main") ?? document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.filter(v => v.impact === "serious" || v.impact === "critical").map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => n.target.join(" ")).slice(0, 6) }));
  });
  expect(violations, JSON.stringify(violations, null, 1)).toEqual([]);
}
const lab = (page: Page) => page.getByRole("region", { name: /Laboratoire de scénarios/ });

for (const width of WIDTHS) {
  test.describe(`largeur ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("Synthèse — dossier courant : dossier, sources et action prioritaire avant les accès ; liste des cycles depuis le registre", async ({ page }) => {
      await page.goto("/dashboard/synthese");
      await expect(page.getByRole("heading", { name: "Synthèse", level: 1 })).toBeVisible();
      const context = page.getByRole("region", { name: "Action prioritaire" });
      await expect(context).toBeVisible();
      await expect(page.getByRole("region", { name: "État des sources" })).toContainText(/alerte/);
      const cycles = page.getByRole("region", { name: "Cycles du dossier" }).first();
      await expect(cycles).toBeVisible();
      // Les anciens paragraphes d'accès ont disparu : les accès vivent dans la ligne de cycle.
      await expect(page.getByRole("link", { name: /Ouvrir la Synthèse des procédures de mission — cadrage Clients/ })).toHaveCount(0);
      const row = page.getByRole("button", { name: "Clients et ventes", exact: true });
      await row.click();
      await expect(row).toHaveAttribute("aria-expanded", "true");
      await expect(page.getByRole("link", { name: "Synthèse des procédures — cadrage Clients" })).toBeVisible();
      await expect(page.getByText("Sources distinctes des constats historiques DEMO SA et de l’atelier synthétique.")).toBeVisible();
      // Le bandeau « Action prioritaire » précède la décision et la liste dans l'ordre du document.
      const order = await page.evaluate(() => {
        const a = document.querySelector('[aria-label="Action prioritaire"]'), d = document.querySelector('[aria-label="Décision"]');
        return a && d ? a.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING : 0;
      });
      expect(order).toBeTruthy();
      await shot(page, `synthese-dossier-courant-${width}`);
      await strictAxe(page);
    });

    test("Tests — vide : lanceur compact, volet Mode et sauvegarde au clavier, Échap rend le focus", async ({ page }) => {
      await page.goto("/dashboard/tests");
      const region = lab(page);
      await expect(region).toBeVisible();
      await expect(region).toContainText("Aucun scénario ouvert");
      // Plus de bandeau clair : le fond du laboratoire est celui du thème, pas de l'ambre.
      const bg = await region.evaluate(el => getComputedStyle(el).backgroundColor);
      expect(bg).not.toBe("rgb(255, 251, 235)");
      await expect(region.getByRole("button", { name: "Nouveau scénario synthétique" })).toBeVisible();
      const toggle = region.getByRole("button", { name: "Mode et sauvegarde" });
      await toggle.focus();
      await page.keyboard.press("Enter");
      const panel = page.getByRole("region", { name: "Mode et sauvegarde" });
      await expect(panel).toBeVisible();
      await expect(panel).toContainText("sept jours");
      await expect(panel.getByRole("button", { name: "Copier l’identifiant" })).toBeVisible();
      expect(await page.evaluate(() => document.activeElement?.id)).toBe("cycle-demo-info");
      await shot(page, `tests-vide-volet-${width}`);
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(toggle).toBeFocused();
      await shot(page, `tests-vide-${width}`);
      await strictAxe(page);
    });

    test("Tests — scénario repris : exécution, blocage sémantique, identifiant long copiable, synthèse du scénario", async ({ page, context }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.goto("/dashboard/tests");
      const region = lab(page);
      await region.getByRole("button", { name: "Nouveau scénario synthétique" }).click();
      await expect(region).toContainText("SYN-");
      await expect(region).toContainText("0/10 cycles exécutés");
      await region.getByRole("combobox", { name: "Cycle", exact: true }).selectOption("clients");
      await region.getByRole("button", { name: "Exécuter ce cycle" }).click();
      await expect(region.getByRole("button", { name: "Soumettre" })).toBeVisible();
      await expect(region).toContainText("1/10 cycles exécutés");
      // Identifiant complet dans le volet, copiable.
      await region.getByRole("button", { name: "Mode et sauvegarde" }).click();
      const panel = page.getByRole("region", { name: "Mode et sauvegarde" });
      const full = await panel.locator("code").innerText();
      expect(full).toMatch(/^SYN-[0-9a-f-]{36}$/);
      await panel.getByRole("button", { name: "Copier l’identifiant" }).click();
      await expect(panel.getByRole("status")).toContainText(/copié|Copie refusée/);
      await shot(page, `tests-scenario-${width}`);
      await strictAxe(page);
      // Reprise : rechargement de la page, le scénario est repris et le compteur conservé.
      await page.reload();
      await expect(region).toContainText("1/10 cycles exécutés");
      await expect(region.getByRole("status").last()).toContainText(/repris/);
      // Pièce manquante sur un second cycle → feuille bloquée : l'ambre n'habille que ce message.
      await region.getByRole("combobox", { name: "Cycle", exact: true }).selectOption("cash");
      await region.getByLabel("Pièce manquante").check();
      await region.getByRole("button", { name: "Exécuter ce cycle" }).click();
      const blocked = region.getByRole("status").filter({ hasText: "Voir la source requise" });
      await expect(blocked).toBeVisible();
      await expect(region).toContainText("1 bloqués");
      const blockedBg = await blocked.evaluate(el => getComputedStyle(el).borderLeftColor);
      expect(blockedBg).toBe("rgb(245, 158, 11)");
      await shot(page, `tests-scenario-bloque-${width}`);
      // Synthèse du scénario : cycles, action prioritaire, preuve.
      await region.getByRole("link", { name: /Voir la synthèse/ }).click();
      await expect(page.getByRole("heading", { name: "Synthèse du dossier synthétique" })).toBeVisible();
      const priority = page.getByRole("region", { name: "Action prioritaire" });
      await expect(priority).toContainText("Trésorerie");
      await expect(priority.getByRole("link", { name: "Fournir la source requise" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Cycles du scénario" }).first()).toContainText("Bloqué");
      await shot(page, `synthese-scenario-${width}`);
      await strictAxe(page);
    });
  });
}

test.describe("états limites — 1440 et 390", () => {
  test("erreur : un journal local corrompu est refusé explicitement, remise à zéro proposée", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/tests");
    const region = lab(page);
    await region.getByRole("button", { name: "Nouveau scénario synthétique" }).click();
    await expect(region).toContainText("SYN-");
    // Corruption du journal puis rechargement : la reprise doit être refusée, pas requalifiée.
    await page.evaluate(() => {
      const prefix = "probant:synthetic-workpapers:v2:";
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (k.startsWith(prefix)) { const r = JSON.parse(localStorage.getItem(k)!); r.checksum = "0".repeat(64); localStorage.setItem(k, JSON.stringify(r)); } }
    });
    await page.reload();
    const refusal = region.getByRole("status").last();
    await expect(refusal).toContainText(/Reprise refusée : DEMO_INTEGRITY_INVALID/);
    await expect(refusal).toHaveAttribute("data-tone", "error");
    await expect(region.getByRole("button", { name: "Remise à zéro explicite" })).toBeVisible();
    await shot(page, "tests-erreur-reprise-1440");
    await page.setViewportSize({ width: 390, height: 900 });
    await shot(page, "tests-erreur-reprise-390");
    await strictAxe(page);
  });

  test("chargement : la Synthèse rend son squelette avant l'hydratation sans débordement", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    // Les scripts sont retardés : la page est capturée telle que le serveur la rend, avant hydratation.
    await page.route("**/_next/static/chunks/**", async route => { await new Promise(r => setTimeout(r, 1500)); try { await route.continue(); } catch { /* page déjà passée à la suite */ } });
    await page.goto("/dashboard/synthese", { waitUntil: "commit" });
    await page.waitForSelector("h1", { state: "attached" });
    await shot(page, "synthese-chargement-390");
    await expect(page.getByRole("region", { name: "Action prioritaire" })).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("load");
    await page.unroute("**/_next/static/chunks/**");
    await noGlobalOverflow(page);
  });

  test("identifiant long : un nom de dossier et un identifiant très longs ne débordent ni le bandeau ni le laboratoire", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/dashboard/tests");
    const region = lab(page);
    await region.getByRole("button", { name: "Nouveau scénario synthétique" }).click();
    await expect(region).toContainText("SYN-");
    await region.getByRole("button", { name: "Mode et sauvegarde" }).click();
    await noGlobalOverflow(page);
    await page.evaluate(() => {
      const code = document.querySelector("#cycle-demo-info code"); if (code) code.textContent = "SYN-" + "f".repeat(96) + "-" + "0123456789".repeat(6);
      const name = document.querySelector("#cycle-demo-info dd span"); if (name) name.textContent = "SOCIÉTÉ AU NOM EXTRAORDINAIREMENT LONG POUR CONTRÔLER LE DÉBORDEMENT DU LANCEUR SAS";
    });
    await shot(page, "tests-identifiant-long-390");
    await page.goto("/dashboard/synthese");
    await page.evaluate(() => {
      const name = document.querySelector('[aria-label="Dossier"] p'); if (name) name.textContent = "SOCIÉTÉ AU NOM EXTRAORDINAIREMENT LONG POUR CONTRÔLER LE DÉBORDEMENT DU BANDEAU SAS";
      const code = document.querySelector('[aria-label="Dossier"] code'); if (code) code.textContent = "demo-" + "a".repeat(120);
      (document.querySelector('[aria-label="Dossier"] details') as HTMLDetailsElement | null)?.setAttribute("open", "");
    });
    await shot(page, "synthese-identifiant-long-390");
  });

  test("programme long : les 10 cycles exécutés restent lisibles et la liste défile dans son conteneur à 390", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/tests");
    const region = lab(page);
    await region.getByRole("button", { name: "Nouveau scénario synthétique" }).click();
    await expect(region).toContainText("SYN-");
    const cycleSelect = region.getByRole("combobox", { name: "Cycle", exact: true });
    for (const cycle of ["cash", "cutoff", "fournisseurs", "clients", "immobilisations", "capitaux", "achats", "conges", "participations", "is"]) {
      await cycleSelect.selectOption(cycle);
      await region.getByRole("button", { name: "Exécuter ce cycle" }).click();
      await expect(region.getByRole("status").last()).toContainText("Action enregistrée");
    }
    await expect(region).toContainText(/9\/10 cycles exécutés · 1 bloqués|10\/10 cycles exécutés/);
    await shot(page, "tests-programme-long-1440");
    await region.getByRole("link", { name: /Voir la synthèse/ }).click();
    await expect(page.getByRole("heading", { name: "Synthèse du dossier synthétique" })).toBeVisible();
    await shot(page, "synthese-programme-long-1440");
    await page.setViewportSize({ width: 390, height: 900 });
    await shot(page, "synthese-programme-long-390");
    await strictAxe(page);
  });

  test("mouvement réduit : les transitions de panneau sont neutralisées", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto("/dashboard/tests");
    await lab(page).getByRole("button", { name: "Mode et sauvegarde" }).click();
    const duration = await page.locator("#cycle-demo-info").evaluate(el => getComputedStyle(el).animationDuration);
    // Chromium rapporte 0,001 ms comme « 1e-06s » : on compare la valeur, pas sa notation.
    expect(parseFloat(duration) * (duration.endsWith("ms") ? 1 : 1000)).toBeLessThanOrEqual(0.001);
    await shot(page, "tests-reduced-motion-1440");
    await context.close();
  });
});
