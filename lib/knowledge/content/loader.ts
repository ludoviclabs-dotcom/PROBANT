/**
 * Chargement du plan de connaissance depuis `data/`.
 *
 * IMPORTANT : ce module utilise `node:fs` et ne doit être importé que depuis
 * du code serveur (routes API, composants serveur) ou des tests — jamais dans
 * un composant client. Même contrainte et même convention que
 * `lib/audit-cycles/loader.ts`, dont il est indépendant.
 *
 * Chaque lecture passe par un schéma Zod : un YAML malformé ou incomplet fait
 * échouer le chargement avec un message localisé, au lieu de se propager en
 * `undefined` dans l'application. C'est la frontière de validation exigée par
 * `CLAUDE.md`.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import type { z } from "zod";
import {
  CrosswalkSchema,
  FecControlSetSchema,
  FecFieldSetSchema,
  IfrsSetSchema,
  NepSetSchema,
  PcgSetSchema,
  StatisticSetSchema,
  type Crosswalk,
  type FecControlSet,
  type FecFieldSet,
  type IfrsSet,
  type NepSet,
  type PcgSet,
  type StatisticSet,
} from "./schemas";

const DATA_DIR = path.join(process.cwd(), "data");

/** Lit un YAML et le valide, en rapportant le fichier fautif en cas d'échec. */
async function loadYaml<S extends z.ZodTypeAny>(
  relativePath: string,
  schema: S,
): Promise<z.infer<S>> {
  const filePath = path.join(DATA_DIR, relativePath);
  const raw = await readFile(filePath, "utf-8");
  const parsed = yaml.load(raw);
  const result = schema.safeParse(parsed);

  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  · ${i.path.join(".") || "(racine)"} : ${i.message}`)
      .join("\n");
    throw new Error(
      `Plan de connaissance — validation échouée pour data/${relativePath} :\n${details}`,
    );
  }

  return result.data;
}

/** Les 18 zones du FEC (article A47 A-1). */
export function loadFecFields(): Promise<FecFieldSet> {
  return loadYaml("fec/fields.yml", FecFieldSetSchema);
}

/** Les contrôles atomiques FEC, par famille. */
export function loadFecControls(): Promise<FecControlSet> {
  return loadYaml("fec/controls.yml", FecControlSetSchema);
}

/** Métadonnées des NEP. */
export function loadNep(): Promise<NepSet> {
  return loadYaml("nep/nep.yml", NepSetSchema);
}

/** Métadonnées des normes IAS/IFRS prioritaires. */
export function loadIfrs(): Promise<IfrsSet> {
  return loadYaml("ifrs/standards.yml", IfrsSetSchema);
}

/** Exigences PCG datées. */
export function loadPcg(): Promise<PcgSet> {
  return loadYaml("pcg/requirements.yml", PcgSetSchema);
}

/** Statistiques externes — espace cloisonné, jamais utilisé pour scorer. */
export function loadStatistics(): Promise<StatisticSet> {
  return loadYaml("statistics/external.yml", StatisticSetSchema);
}

/** Fichiers de crosswalks, dans un ordre stable. */
const CROSSWALK_FILES = [
  "pcg-ifrs.yml",
  "nep-isa.yml",
  "cycle-assertions.yml",
  "cycle-accounts.yml",
  "control-source.yml",
  "finding-control.yml",
] as const;

/** Charge les six crosswalks. */
export async function loadCrosswalks(): Promise<Crosswalk[]> {
  return Promise.all(
    CROSSWALK_FILES.map((f) => loadYaml(`crosswalks/${f}`, CrosswalkSchema)),
  );
}

/** Vue complète du plan de connaissance. */
export interface KnowledgeBase {
  fecFields: FecFieldSet;
  fecControls: FecControlSet;
  nep: NepSet;
  ifrs: IfrsSet;
  pcg: PcgSet;
  crosswalks: Crosswalk[];
  statistics: StatisticSet;
}

/** Charge et valide l'intégralité du plan de connaissance. */
export async function loadKnowledgeBase(): Promise<KnowledgeBase> {
  const [fecFields, fecControls, nep, ifrs, pcg, crosswalks, statistics] =
    await Promise.all([
      loadFecFields(),
      loadFecControls(),
      loadNep(),
      loadIfrs(),
      loadPcg(),
      loadCrosswalks(),
      loadStatistics(),
    ]);

  return { fecFields, fecControls, nep, ifrs, pcg, crosswalks, statistics };
}
