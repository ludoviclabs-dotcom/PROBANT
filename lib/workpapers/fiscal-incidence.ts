import { computeCorporateTax, type CorporateTaxComputationInput } from "@/lib/tax/corporate-tax/engine";
import { CIT_RULE } from "./fiscal-adapter";
import { CIT_PROCEDURE, CIT_RESULT_SCHEMA_VERSION, citComputationInput, type CitResult, type CitWork } from "./fiscal-cit";
import { fiscalRelevance, fiscalSourcesCurrent } from "./fiscal-sources";
import type { FiscalSourceHead } from "./fiscal-store";
import type { ImportBatch } from "./imports";
import type { WorkpaperRun, WorkpaperScope } from "./model";

/**
 * Base de l'incidence fiscale d'un ajustement (C05 / C10) : le calcul d'IS de la feuille IS de l'exercice, reconstruit
 * depuis ses sources figées. Seule une feuille verrouillée, à jour (règle, sources, révision) et dont le calcul se
 * reproduit à l'identique sert de base ; sinon l'incidence reste inconnue, avec le motif. Aucun calcul n'est fait ici
 * à la place du moteur : l'entrée est celle que la feuille a elle-même exécutée.
 */
export interface CitIncidenceSheet {
  runId: string;
  rootId: string;
  version: number;
  revision: number;
  state: string;
  ruleVersion: string | null;
  engineVersion: string | null;
  snapshotHash: string | null;
  href: string;
}
export type CitIncidenceBase =
  | { status: "available"; input: CorporateTaxComputationInput; sheet: CitIncidenceSheet }
  | { status: "unavailable"; reason: string; sheet: CitIncidenceSheet | null };

const newer = (a: WorkpaperRun, b: WorkpaperRun) => a.revision > b.revision || (a.revision === b.revision && a.version > b.version);

export function citIncidenceBase(scope: WorkpaperScope, versions: readonly WorkpaperRun[], imports: readonly ImportBatch[], heads: readonly FiscalSourceHead[]): CitIncidenceBase {
  const runs = versions.filter((r) => r.template.id === CIT_PROCEDURE && r.fiscalWork?.tax === "cit");
  if (!runs.length) return { status: "unavailable", reason: "Aucune feuille IS pour cet exercice : incidence fiscale inconnue.", sheet: null };
  // L'exercice n'a qu'une feuille IS ; sa dernière révision, dans sa dernière version, fait seule foi.
  const run = runs.reduce((latest, r) => (newer(r, latest) ? r : latest));
  const result = run.result?.result as CitResult | undefined;
  const sheet: CitIncidenceSheet = {
    runId: run.id, rootId: run.rootId, version: run.version, revision: run.revision, state: run.state,
    ruleVersion: run.template.rule?.version ?? null, engineVersion: result?.engine.version ?? null, snapshotHash: result?.engine.snapshotHash ?? null,
    href: "/fiscal?" + new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, tax: "cit", id: run.id, version: String(run.version) }),
  };
  const unavailable = (reason: string): CitIncidenceBase => ({ status: "unavailable", reason, sheet });
  if (run.state !== "locked") return unavailable(`Feuille IS non verrouillée (${run.state}) : le calcul de base n'a pas été approuvé en revue.`);
  if (sheet.ruleVersion !== CIT_RULE.version) return unavailable(`Feuille IS établie sous la règle ${sheet.ruleVersion ?? "inconnue"} : une révision en ${CIT_RULE.version} est requise.`);
  if (!fiscalSourcesCurrent(run.importIds, [...heads], fiscalRelevance(run, [...heads]))) return unavailable("Une source de la feuille IS a été remplacée depuis le gel : une révision est requise.");
  if (!result || result.schemaVersion !== CIT_RESULT_SCHEMA_VERSION) return unavailable("Résultat de la feuille IS absent ou d'un contrat antérieur : une révision est requise.");
  if (result.engine.status !== "computed") return unavailable("Moteur IS bloqué sur la feuille de l'exercice : aucun calcul de base.");
  const batches = imports.filter((b) => run.importIds.includes(b.id));
  const input = citComputationInput(run.scope, run.period, batches, run.id, run.fiscalWork as CitWork);
  // Le calcul reconstruit doit être celui que la revue a approuvé : moteur, barème et sources inchangés.
  if (computeCorporateTax(input).snapshot.snapshotHash !== result.engine.snapshotHash) {
    return unavailable("Le calcul de base ne se reproduit pas à l'identique (moteur ou registre modifié depuis le verrouillage) : une révision de la feuille IS est requise.");
  }
  return { status: "available", input, sheet };
}
