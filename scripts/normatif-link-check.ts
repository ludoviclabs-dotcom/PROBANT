/**
 * Relevé des liens officiels d'Audit Normatif 360 — `npm run normatif:liens`.
 *
 * Ouvre chaque adresse du registre des sources (`data/sources/*.yml`) et de la veille (`data/veille/veille.yml`),
 * suit les redirections, puis écrit `data/veille/link-check.json`. La qualification est celle de
 * `classifyLink` (lib/audit-cycles/veille.ts) : joignable, redirigé vers une autre page, introuvable, domaine
 * injoignable, ou refus des robots (Légifrance et iaasb.org répondent 403 à un client automatique : ces pages ne
 * sont pas déclarées mortes, elles sont à ouvrir à la main).
 *
 * Un relevé de lien ne vaut pas vérification du contenu : la page Veille distingue les deux.
 * Lancé à la main, jamais au build ni en production (outil local).
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { classifyLink, type LinkCheckEntry, type LinkCheckFile } from "../lib/audit-cycles/veille";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "data", "veille", "link-check.json");
const TIMEOUT_MS = 25_000;
// Identité honnête : le script ne se fait pas passer pour un navigateur. Les pages qui refusent les robots (Légifrance,
// iaasb.org) sont qualifiées « non contrôlables » et se lisent à la main, jamais contournées.
const USER_AGENT = "PROBANT-veille/1.0 (outil personnel local ; lecture de pages officielles publiques)";

async function collectUrls(): Promise<string[]> {
  const urls = new Set<string>();
  const dir = path.join(ROOT, "data", "sources");
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".yml"))) {
    const raw = yaml.load(await readFile(path.join(dir, file), "utf8")) as { sources?: { url?: string }[] } | null;
    for (const s of raw?.sources ?? []) if (s.url) urls.add(s.url);
  }
  try {
    const veille = yaml.load(await readFile(path.join(ROOT, "data", "veille", "veille.yml"), "utf8")) as {
      evolutions?: { officialUrl?: string | null }[];
    } | null;
    for (const e of veille?.evolutions ?? []) if (e.officialUrl) urls.add(e.officialUrl);
  } catch {
    // Pas de veille arrêtée : seules les sources sont relevées.
  }
  return [...urls].sort();
}

async function probe(url: string): Promise<LinkCheckEntry> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/pdf;q=0.9,*/*;q=0.8" },
    });
    await res.body?.cancel();
    return { url, httpStatus: res.status, finalUrl: res.url || null, outcome: classifyLink(url, res.status, res.url || null) };
  } catch {
    return { url, httpStatus: null, finalUrl: null, outcome: classifyLink(url, null, null) };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const urls = await collectUrls();
  const entries: LinkCheckEntry[] = [];
  // Séquentiel et lent à dessein : quelques dizaines de pages officielles, sans charge pour les serveurs publics.
  for (const url of urls) {
    const entry = await probe(url);
    entries.push(entry);
    console.log(`${String(entry.httpStatus ?? "—").padStart(3)}  ${entry.outcome.padEnd(16)} ${url}`);
  }
  const checkedAt = new Date().toISOString().slice(0, 10);
  const file: LinkCheckFile = { checkedAt, tool: "scripts/normatif-link-check.ts", entries };
  await writeFile(OUT, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`\n${entries.length} adresses relevées le ${checkedAt} → ${path.relative(ROOT, OUT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
