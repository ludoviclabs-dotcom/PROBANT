import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

const port = 3120;
const baseURL = `http://127.0.0.1:${port}`;
const phase = process.env.PROBANT_C00_PHASE ?? "after";
export default defineConfig({
  ...base,
  workers: 1,
  retries: 0,
  outputDir: `docs/recette/c00/${phase}/artifacts`,
  reporter: [["list"], ["json", { outputFile: `docs/recette/c00/${phase}/browser.json` }]],
  use: { ...base.use, baseURL, trace: "off" },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: process.env.PROBANT_C00_OWNED_SERVER === "true" ? undefined : {
    command: `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { NODE_ENV: "production", CSP_MODE: "report-only", PROBANT_DEMONSTRATION_ENABLED: "true", PROBANT_DEMONSTRATION_ORIGIN: baseURL },
  },
});
