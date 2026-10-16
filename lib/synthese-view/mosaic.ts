import type { Finding } from "@/lib/canonical-model/finding";
import { resolveAssertions } from "@/lib/audit/assertions";
import { CL_ASSERTIONS, CL_ASSERTION_LABELS, assertionGroup, assertionLabel, type ClosingAssertion } from "@/lib/workpapers/closing-contract";
import type { CloisonDef } from "./common";

/**
 * Mosaïque cloison × assertion (NEP 500 §09). Même résolveur d'assertions que le dataset de la Synthèse
 * (`resolveAssertions` : la règle d'abord, puis l'effet financier explicite, sinon « non résolue ») ; ce module
 * garde en plus les identifiants de constats de chaque cellule, pour le volet de détail et le filtre croisé.
 * Un constat portant deux assertions compte dans les deux. Une cellule vide dit « aucun constat », jamais « couvert ».
 */

export type MosaicGroup = "flux" | "solde" | "annexe" | "extra";

export interface MosaicColumn {
  key: string;
  /** Libellé complet (info-bulle, volet). */
  label: string;
  /** Libellé court d'en-tête ; l'ambiguïté (« Exh. » existe en flux, solde et annexe) est levée par le groupe. */
  short: string;
  group: MosaicGroup;
}

const SHORT: Record<ClosingAssertion, string> = {
  flux_realite: "Réal.",
  flux_exhaustivite: "Exh.",
  flux_mesure: "Mes.",
  flux_separation: "Sép.",
  flux_classification: "Class.",
  solde_existence: "Exist.",
  solde_droits: "Droits",
  solde_exhaustivite: "Exh.",
  solde_evaluation: "Éval.",
  annexe_realite_droits: "Réal.",
  annexe_exhaustivite: "Exh.",
  annexe_presentation: "Prés.",
  annexe_mesure_evaluation: "Mes.",
};

export const MOSAIC_GROUP_LABEL: Record<MosaicGroup, string> = { flux: "Flux", solde: "Soldes", annexe: "Annexe", extra: "Hors assertion" };

export interface MosaicModel {
  columns: MosaicColumn[];
  rows: CloisonDef[];
  /** Identifiants de constats par cellule, clé `${cloison}|${colonne}`. */
  cells: Record<string, string[]>;
}

export const cellKey = (clo: string, column: string) => `${clo}|${column}`;

export function buildMosaic(findings: readonly Finding[], clos: readonly CloisonDef[]): MosaicModel {
  const resolved = findings.map((f) => ({ f, r: resolveAssertions(f) }));
  const columns: MosaicColumn[] = CL_ASSERTIONS.filter((a) => resolved.some(({ r }) => r.assertions.includes(a))).map((a) => ({
    key: a,
    label: assertionLabel(a),
    short: SHORT[a],
    group: assertionGroup(a),
  }));
  if (resolved.some(({ r }) => r.basis === "unresolved")) columns.push({ key: "non_resolue", label: "Non résolue", short: "Non rés.", group: "extra" });
  if (resolved.some(({ r }) => r.basis === "file_conformity")) columns.push({ key: "conformite", label: "Conformité du fichier (hors assertions)", short: "Fichier", group: "extra" });

  const cells: Record<string, string[]> = {};
  for (const clo of clos) {
    const inClo = resolved.filter(({ f }) => f.cloison === clo.id);
    for (const column of columns) {
      const ids = inClo
        .filter(({ r }) => (column.key === "non_resolue" ? r.basis === "unresolved" : column.key === "conformite" ? r.basis === "file_conformity" : r.assertions.includes(column.key as ClosingAssertion)))
        .map(({ f }) => f.id);
      cells[cellKey(clo.id, column.key)] = ids;
    }
  }
  return { columns, rows: [...clos], cells };
}

/** Titre-phrase : la cellule d'assertion la plus chargée (hors colonnes « non résolue » et « fichier »). */
export function mosaicTitle(model: MosaicModel): string {
  let best: { clo: CloisonDef; column: MosaicColumn; n: number } | null = null;
  for (const clo of model.rows) {
    for (const column of model.columns) {
      if (column.group === "extra") continue;
      const n = model.cells[cellKey(clo.id, column.key)].length;
      if (n > (best?.n ?? 0)) best = { clo, column, n };
    }
  }
  if (!best) return "Aucun constat n’est rattaché à une assertion.";
  const label = CL_ASSERTION_LABELS[best.column.key as ClosingAssertion].toLowerCase();
  return `« ${label} · ${MOSAIC_GROUP_LABEL[best.column.group].toLowerCase()} » est l’assertion la plus exposée, cloison ${best.clo.short.toLowerCase()} : ${best.n} ${best.n > 1 ? "constats" : "constat"}.`;
}
