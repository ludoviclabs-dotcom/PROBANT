import type {
  CloisonId,
  FecEntry,
  Finding,
  FindingFamily,
  Severity,
} from "@/lib/canonical-model";
import type { ParsedFec } from "@/lib/fec/parser";

/** Contexte d'exécution fourni à chaque règle. */
export interface RuleContext {
  parsed: ParsedFec;
  entries: FecEntry[];
  nomFichier: string;
  siren: string | null;
  referentielVersion: string;
}

/**
 * Une règle est déclarative et versionnée. Elle produit zéro ou plusieurs
 * constats. Elle ne connaît ni la base de données ni l'UI.
 */
export interface Rule {
  id: string;
  family: FindingFamily;
  version: string;
  /** Cloison de rattachement par défaut des constats. */
  cloison: CloisonId;
  severity: Severity;
  titre: string;
  run(ctx: RuleContext): RuleFinding[];
}

/**
 * Constat produit par une règle, avant enrichissement UI (cibleRowId,
 * statement). L'id est complété par le runner.
 */
export type RuleFinding = Omit<Finding, "id" | "statutRevue"> & {
  /** Suffixe d'unicité optionnel quand une règle émet plusieurs constats. */
  key?: string;
};
