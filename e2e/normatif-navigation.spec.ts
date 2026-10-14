import { expect, test, type Page } from "@playwright/test";

/**
 * Audit Normatif 360 — navigation client vers /normatif/cycles.
 *
 * Défaut antérieur (relevé le 14/10/2026 sur le build de production de main ff3f9fb, 12 échecs sur
 * 12) : un clic sur un lien vers /normatif/cycles depuis une autre page du module ne changeait ni
 * l'URL ni le contenu, sans erreur. La page est rendue à la demande (elle lit `searchParams`) et le
 * segment n'avait pas de `loading.tsx` : le préchargement automatique du lien ne contenait que la
 * mise en page partagée, et au clic le routeur récupérait la page en différé (`?_rsc`, réponse
 * complète) pour l'appliquer dans une transition suspendue qui ne se validait jamais. Un
 * préchargement complet, ou une URL jamais préchargée (`?famille=…`), naviguait normalement.
 *
 * Ce spec suit chaque point d'entrée du module — barre latérale, accueil, fil d'Ariane d'une fiche
 * cycle — sans attendre puis après préchargement, et attend l'URL, le titre réel et la liste.
 * Les filtres de la page sont des liens de document (voir `FilterChip`) : leurs enchaînements, qui
 * figeaient aussi la liste (dont « Tous » depuis un filtre chargé directement, 6 / 6), sont vérifiés.
 */
const ENTRIES: readonly { name: string; from: string; link: (page: Page) => ReturnType<Page["locator"]> }[] = [
  { name: "barre latérale depuis le registre", from: "/normatif/sources", link: (p) => p.locator("#normatif-nav").getByRole("link", { name: "Cycles d'audit" }) },
  {
    name: "barre latérale depuis une fiche source",
    from: "/normatif/sources/cc-capitaux-propres",
    link: (p) => p.locator("#normatif-nav").getByRole("link", { name: "Cycles d'audit" }),
  },
  { name: "lien de l'accueil", from: "/normatif", link: (p) => p.locator("main a[href='/normatif/cycles']").first() },
  {
    name: "fil d'Ariane d'une fiche cycle",
    from: "/normatif/cycles/achats-charges-externes",
    link: (p) => p.locator("main").getByRole("link", { name: "Cycles d'audit" }).first(),
  },
];

async function expectCyclesList(page: Page, url: RegExp) {
  await expect(page).toHaveURL(url);
  await expect(page.locator("main").getByRole("heading", { name: "Cycles d'audit", level: 2, exact: true })).toBeVisible();
  await expect(page.locator("main a[href^='/normatif/cycles/']").first()).toBeVisible();
}

test.use({ viewport: { width: 1440, height: 900 } });

for (const entry of ENTRIES) {
  for (const prefetched of [false, true]) {
    test(`${entry.name} → /normatif/cycles (${prefetched ? "après préchargement" : "clic immédiat"})`, async ({ page }) => {
      await page.goto(entry.from);
      await expect(page.locator("main h1, main h2").first()).toBeVisible();
      // Laisse le préchargement automatique du lien visible se terminer : c'était le cas qui figeait.
      if (prefetched) await page.waitForLoadState("networkidle");
      await entry.link(page).click();
      await expectCyclesList(page, /\/normatif\/cycles$/);
    });
  }
}

test("filtres : enchaînements qui figeaient la liste, y compris « Tous » depuis un filtre chargé directement", async ({ page }) => {
  // Les puces sont des liens de document (voir FilterChip) : chaque clic recharge la page serveur.
  const steps = [
    "/normatif/cycles",
    "/normatif/cycles?fraude=1",
    "/normatif/cycles?famille=TRESORERIE",
    "/normatif/cycles?famille=ACTIF_CIRCULANT",
    "/normatif/cycles?famille=CAPITAUX_PROPRES_FINANCEMENT",
    "/normatif/cycles?famille=ACTIF_IMMOBILISE",
    "/normatif/cycles",
  ];
  await page.goto("/normatif/cycles?famille=ACTIF_IMMOBILISE");
  await expectCyclesList(page, /\/normatif\/cycles\?famille=ACTIF_IMMOBILISE$/);
  for (const href of steps) {
    await page.locator(`main a[href='${href}']`).first().click();
    await expectCyclesList(page, new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  }
});
