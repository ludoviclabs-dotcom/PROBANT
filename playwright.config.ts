import { defineConfig, devices } from "@playwright/test";

/**
 * Configuration Playwright — PR-08.
 *
 * Les parcours s'exécutent contre un build de **production** (`next build` puis
 * `next start`) et non contre le serveur de développement : la CSP, le
 * middleware et le rendu statique ne se comportent pas de la même façon en
 * développement, et c'est l'artefact déployé qu'il faut valider.
 */
const PORT = Number(process.env.PROBANT_E2E_PORT ?? 3100);
const baseURL = process.env.PROBANT_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts",
  fullyParallel: true,
  // Un `test.only` oublié ferait passer la CI en n'exécutant qu'un test.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["list"], ["json", { outputFile: "e2e/.artifacts/report.json" }]]
    : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PROBANT_E2E_BASE_URL
    ? undefined
    : {
        command: `npm run start -- --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          // Mode démo assumé : aucune infrastructure persistante n'est requise
          // pour les parcours 1, 3 et 4.
          NODE_ENV: "production",
          CSP_MODE: process.env.CSP_MODE ?? "report-only",
        },
      },
});
