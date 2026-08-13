/**
 * Génère les deux crosswalks DÉRIVÉS des 35 cycles existants
 * (cycle_accounts, cycle_assertions).
 *
 * Ces liens ne sont pas des affirmations normatives : ils projettent le contenu
 * déjà présent dans data/cycles/*.yml. Comme ce contenu est lui-même en revue
 * requise, les liens produits portent status: review_required.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

const ROOT = process.argv[2];
const CYCLES = path.join(ROOT, "data", "cycles");
const OUT = path.join(ROOT, "data", "crosswalks");

const files = (await readdir(CYCLES)).filter((f) => f.endsWith(".yml")).sort();

const accountLinks = [];
const assertionLinks = [];

for (const f of files) {
  const cycle = yaml.load(await readFile(path.join(CYCLES, f), "utf-8"));
  const slug = f.replace(/\.yml$/, "");

  for (const acct of cycle.pcgAccounts ?? []) {
    accountLinks.push({
      from: `cycle:${slug}`,
      to: `pcg-account:${acct}`,
      relation: "related",
      status: "review_required",
      sources: [
        { sourceId: `data/cycles/${f}`, kind: "primary", note: "Dérivé de pcgAccounts." },
      ],
    });
  }

  const assertions = new Set();
  for (const p of cycle.analyticalProcedures ?? []) (p.assertions ?? []).forEach((a) => assertions.add(a));
  for (const t of cycle.detailTests ?? []) (t.assertions ?? []).forEach((a) => assertions.add(a));

  for (const a of [...assertions].sort()) {
    assertionLinks.push({
      from: `cycle:${slug}`,
      to: `assertion:${a}`,
      relation: "related",
      status: "review_required",
      sources: [
        {
          sourceId: `data/cycles/${f}`,
          kind: "primary",
          note: "Dérivé des assertions portées par les procédures et tests.",
        },
      ],
    });
  }
}

const header = (kind, label, extra) =>
  `# ${label}\n#\n${extra}\n\nkind: ${kind}\nlabel: ${label}\nlinks:\n`;

await writeFile(
  path.join(OUT, "cycle-accounts.yml"),
  header(
    "cycle_accounts",
    "Crosswalk cycle d'audit ↔ comptes PCG",
    `# GÉNÉRÉ à partir de data/cycles/*.yml (champ pcgAccounts) — ne pas éditer\n` +
      `# à la main : régénérer via scripts/gen-crosswalks.mjs.\n#\n` +
      `# Les liens portent status: review_required parce qu'ils projettent un\n` +
      `# contenu (les 35 fiches de cycles) lui-même en revue requise. Le crosswalk\n` +
      `# n'ajoute aucune affirmation normative : il rend interrogeable ce qui\n` +
      `# existe déjà.`,
  ) + yaml.dump(accountLinks, { lineWidth: 100 }).replace(/^/gm, "  "),
  "utf-8",
);

await writeFile(
  path.join(OUT, "cycle-assertions.yml"),
  header(
    "cycle_assertions",
    "Crosswalk cycle d'audit ↔ assertions",
    `# GÉNÉRÉ à partir de data/cycles/*.yml (assertions des procédures analytiques\n` +
      `# et des tests de détail) — régénérer via scripts/gen-crosswalks.mjs.\n#\n` +
      `# status: review_required pour la même raison que cycle-accounts.yml.`,
  ) + yaml.dump(assertionLinks, { lineWidth: 100 }).replace(/^/gm, "  "),
  "utf-8",
);

console.log(
  `cycles: ${files.length} | liens comptes: ${accountLinks.length} | liens assertions: ${assertionLinks.length}`,
);
