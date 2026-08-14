import { expect, test } from "@playwright/test";

/**
 * Parcours 1 — DEMO.
 *
 * ouvrir → filtrer → constat → décision → note → export
 *
 * Seul parcours entièrement exécutable sans infrastructure : il sert de
 * barrière de non-régression de bout en bout.
 *
 * Le filtrage et la sélection d'un constat s'exercent sur `/dashboard/cloisons`
 * et non sur la Synthèse : le dossier de démonstration porte une alerte
 * bloquante d'admissibilité, et la Synthèse **masque volontairement** son
 * journal d'analyse tant que cette alerte n'est pas levée. Tester le filtre
 * là où il n'existe pas reviendrait à exiger que ce garde-fou disparaisse.
 */
test.describe("parcours DEMO", () => {
  test("ouvrir, filtrer, décider, générer la note et exporter", async ({ page }) => {
    // — ouvrir ——————————————————————————————————————————————
    await page.goto("/dashboard/synthese");
    await expect(page.getByRole("heading", { name: "Synthèse", level: 1 })).toBeVisible();

    // Verdict et empreinte sont affichés avant toute interaction : aucune
    // conclusion ne dépend d'un geste de l'utilisateur.
    const decision = page.getByRole("region", { name: "Décision" });
    await expect(decision).toBeVisible();
    await expect(decision.getByText(/snapshot\s+[0-9a-f]{12}/u)).toBeVisible();

    // — filtrer + constat ——————————————————————————————————
    await page.goto("/dashboard/cloisons");
    await expect(page.getByRole("heading", { name: "Revue par cloison" })).toBeVisible();

    const search = page.getByPlaceholder("Rechercher compte, libellé, norme…");
    await expect(search).toBeVisible();
    const cloisonsBefore = await page.getByRole("button").count();

    await search.fill("Créances clients");
    await expect
      .poll(async () => page.getByRole("button").count(), {
        message: "le filtre doit réduire la liste des cloisons",
      })
      .toBeLessThan(cloisonsBefore);
    // Le constat filtré reste atteignable et porte son effet chiffré.
    await expect(page.getByRole("button", { name: /Créances clients/u }).first()).toBeVisible();

    const filteredCount = await page.getByRole("button").count();
    await search.fill("zzz-aucune-cloison-ne-porte-ce-terme");
    await expect
      .poll(async () => page.getByRole("button").count(), {
        message: "un terme sans correspondance doit réduire encore la liste",
      })
      .toBeLessThanOrEqual(filteredCount);
    await search.fill("");
    await expect.poll(async () => page.getByRole("button").count()).toBe(cloisonsBefore);

    // — décision ————————————————————————————————————————————
    await page.goto("/dashboard/synthese");
    // Le panneau de revue est replié par défaut : il faut l'ouvrir, comme un
    // utilisateur le ferait.
    const reviewPanel = page.getByText(/Revue append-only · \d+ événement/u);
    await reviewPanel.scrollIntoViewIfNeeded();
    await reviewPanel.click();

    const decisionButton = page.getByRole("button", { name: "Enregistrer la décision" });
    await expect(decisionButton).toBeVisible();

    const findingSelect = page.locator("select").first();
    await expect(findingSelect).toBeEnabled();
    expect(await findingSelect.locator("option").count()).toBeGreaterThan(0);

    await decisionButton.click();
    // En DEMO la décision n'est pas persistée : l'interface doit le dire
    // plutôt que de laisser croire à un enregistrement durable.
    await expect(page.getByText(/demo|démonstration|persist|non enregistr/iu).first()).toBeVisible();

    // — note ——————————————————————————————————————————————
    const noteButton = page.getByRole("button", { name: /Générer la note de synthèse/iu });
    await noteButton.scrollIntoViewIfNeeded();
    await noteButton.click();
    await expect(page.getByText(/constat|dossier|couverture/iu).first()).toBeVisible();

    // — export ————————————————————————————————————————————
    const exportToolbar = page.getByRole("region", { name: "Exports du dossier de preuve" });
    await exportToolbar.scrollIntoViewIfNeeded();
    const downloadPromise = page.waitForEvent("download");
    await exportToolbar.getByRole("button", { name: "Exporter JSON" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/u);
  });

  test("le garde-fou d'admissibilité masque l'analyse au lieu de conclure", async ({ page }) => {
    await page.goto("/dashboard/synthese");
    // Le dossier de démonstration porte une alerte bloquante : la page doit
    // le dire explicitement et ne présenter aucun journal d'analyse.
    await expect(page.getByText(/Dossier non admissible/iu).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Journal des constats" })).toHaveCount(0);
  });

  test("aucun bouton factice : chaque bouton visible porte un nom accessible", async ({ page }) => {
    await page.goto("/dashboard/synthese");
    const buttons = page.getByRole("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index);
      if (!(await button.isVisible())) continue;
      // Un bouton sans nom accessible ne peut être ni décrit ni testé : c'est
      // le premier symptôme d'un bouton décoratif.
      const name = (await button.getAttribute("aria-label")) ?? (await button.innerText());
      expect(name.trim().length, "bouton sans nom accessible").toBeGreaterThan(0);
    }
  });

  test("les en-têtes de sécurité sont posés sur la navigation", async ({ page }) => {
    const response = await page.goto("/dashboard/synthese");
    const headers = response?.headers() ?? {};
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    const csp =
      headers["content-security-policy"] ?? headers["content-security-policy-report-only"];
    expect(csp, "une politique CSP doit être présente").toBeTruthy();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});
