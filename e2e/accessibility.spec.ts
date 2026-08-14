import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Accessibilité — axe-core sur les sept pages mesurées.
 *
 * `axe-core` est déjà une dépendance du dépôt (tests de composants) : on
 * injecte son bundle dans la page plutôt que d'ajouter `@axe-core/playwright`.
 * Une dépendance de moins pour exactement le même moteur de règles.
 *
 * Deux niveaux d'exigence, volontairement différents :
 *
 * - **critique** → zéro, sans exception. Une violation critique casse la
 *   sémantique et rend une zone inutilisable au lecteur d'écran.
 * - **sérieux** → gelé à la dette constatée le 14/08/2026. Le compteur peut
 *   baisser, jamais monter. La dette restante est un défaut de contraste du
 *   thème sombre (`--pb-text-faint` #5c6b82 ≈ 3,3:1 sur `--pb-surface`), dont
 *   la correction est une décision de design documentée dans
 *   `docs/release/ACCESSIBILITY_REPORT.md` — pas un correctif de durcissement.
 */
const AXE_PATH = path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js");

interface PageUnderTest {
  readonly name: string;
  readonly path: string;
  /** Dette « serious » constatée, par règle. Toute autre règle vaut zéro. */
  readonly seriousBaseline: Readonly<Record<string, number>>;
}

const PAGES: readonly PageUnderTest[] = [
  { name: "landing", path: "/", seriousBaseline: {} },
  { name: "depot", path: "/dashboard/depot", seriousBaseline: { "color-contrast": 9 } },
  { name: "synthese", path: "/dashboard/synthese", seriousBaseline: { "color-contrast": 13 } },
  { name: "risques", path: "/dashboard/risques", seriousBaseline: {} },
  { name: "cloisons", path: "/dashboard/cloisons", seriousBaseline: { "color-contrast": 15 } },
  {
    name: "referentiel",
    path: "/dashboard/referentiel",
    seriousBaseline: { "color-contrast": 10 },
  },
  {
    name: "dossier-preuve",
    path: "/dashboard/dossier",
    seriousBaseline: { "color-contrast": 17 },
  },
];

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodeCount: number;
}

async function runAxe(page: import("@playwright/test").Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  return (await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: unknown,
            options: unknown,
          ) => Promise<{
            violations: { id: string; impact: string | null; help: string; nodes: unknown[] }[];
          }>;
        };
      }
    ).axe;
    // WCAG 2.1 AA : le périmètre engageant pour un produit professionnel.
    const results = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    });
    return results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodeCount: violation.nodes.length,
    }));
  })) as AxeViolation[];
}

test.describe("accessibilité axe-core", () => {
  for (const target of PAGES) {
    test(`${target.name} — aucune violation critique, dette « serious » non aggravée`, async ({
      page,
    }) => {
      await page.goto(target.path);
      await page.waitForLoadState("networkidle");
      const violations = await runAxe(page);

      const critical = violations.filter((violation) => violation.impact === "critical");
      expect(
        critical.map((violation) => `${violation.id}×${violation.nodeCount}`),
        `${target.name} : violation critique`,
      ).toEqual([]);

      for (const violation of violations.filter((item) => item.impact === "serious")) {
        const allowed = target.seriousBaseline[violation.id] ?? 0;
        expect(
          violation.nodeCount,
          `${target.name} : « ${violation.id} » (${violation.help}) — ${violation.nodeCount} nœud(s), dette gelée à ${allowed}`,
        ).toBeLessThanOrEqual(allowed);
      }
    });
  }
});
