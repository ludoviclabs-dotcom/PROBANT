/**
 * Chargement des données du référentiel « Audit Normatif 360 » depuis les
 * fichiers YAML de `data/`.
 *
 * IMPORTANT : ce module utilise `node:fs` et ne doit être importé que depuis
 * des Server Components ou des routes API (jamais depuis un composant client).
 * `process.cwd()` pointe vers la racine du projet Next.js, en dev comme en prod.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import type { AuditCycle, MethodologyDocument, NormativeSource } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CYCLES_DIR = path.join(DATA_DIR, "cycles");
const SOURCES_DIR = path.join(DATA_DIR, "sources");
const METHODOLOGY_DIR = path.join(DATA_DIR, "methodology");

async function listYaml(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  } catch {
    // Répertoire absent (ex. build avant création des fichiers) → liste vide.
    return [];
  }
}

function slugOf(filename: string): string {
  return filename.replace(/\.ya?ml$/, "");
}

/** Charge tous les cycles, triés par famille puis par titre. */
export async function loadAllCycles(): Promise<AuditCycle[]> {
  const files = await listYaml(CYCLES_DIR);
  const cycles = await Promise.all(
    files.map(async (filename) => {
      const content = await readFile(path.join(CYCLES_DIR, filename), "utf-8");
      const raw = (yaml.load(content) as Partial<AuditCycle>) ?? {};
      // Le slug dérivé du nom de fichier fait foi.
      return { ...raw, slug: slugOf(filename) } as AuditCycle;
    }),
  );
  return cycles.sort(
    (a, b) =>
      a.family.localeCompare(b.family) || a.title.localeCompare(b.title, "fr"),
  );
}

/** Charge un cycle par son slug. Lève une erreur si introuvable. */
export async function loadCycle(slug: string): Promise<AuditCycle> {
  const filePath = path.join(CYCLES_DIR, `${slug}.yml`);
  const content = await readFile(filePath, "utf-8");
  const raw = (yaml.load(content) as Partial<AuditCycle>) ?? {};
  return { ...raw, slug } as AuditCycle;
}

/** Charge toutes les sources du registre central (tous fichiers data/sources/). */
export async function loadAllSources(): Promise<NormativeSource[]> {
  const files = await listYaml(SOURCES_DIR);
  const all: NormativeSource[] = [];
  for (const filename of files) {
    const content = await readFile(path.join(SOURCES_DIR, filename), "utf-8");
    const raw = yaml.load(content) as
      | { sources?: NormativeSource[] }
      | NormativeSource[]
      | null;
    if (Array.isArray(raw)) {
      all.push(...raw);
    } else if (raw && Array.isArray(raw.sources)) {
      all.push(...raw.sources);
    }
  }
  return all.sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

/** Charge tous les documents méthodologiques. */
export async function loadAllMethodology(): Promise<MethodologyDocument[]> {
  const files = await listYaml(METHODOLOGY_DIR);
  return Promise.all(
    files.map(async (filename) => {
      const content = await readFile(
        path.join(METHODOLOGY_DIR, filename),
        "utf-8",
      );
      const raw = (yaml.load(content) as Partial<MethodologyDocument>) ?? {};
      return {
        slug: slugOf(filename),
        title: raw.title ?? slugOf(filename),
        description: raw.description,
        status: raw.status,
        sourceIds: raw.sourceIds,
        content: raw.content ?? (raw as Record<string, unknown>),
      } satisfies MethodologyDocument;
    }),
  );
}

/** Charge un document méthodologique par slug. */
export async function loadMethodology(slug: string): Promise<MethodologyDocument> {
  const content = await readFile(
    path.join(METHODOLOGY_DIR, `${slug}.yml`),
    "utf-8",
  );
  const raw = (yaml.load(content) as Partial<MethodologyDocument>) ?? {};
  return {
    slug,
    title: raw.title ?? slug,
    description: raw.description,
    status: raw.status,
    sourceIds: raw.sourceIds,
    content: raw.content ?? (raw as Record<string, unknown>),
  };
}

