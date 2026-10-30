import { MATRIX_COLUMNS, type MatrixColumn } from "./format";

/** Filtres d'affichage : ils ne changent ni la population figée, ni la version revue, ni un export. */
export type LeaseFilter = "all" | "a_qualifier" | "rate" | "hors_scope_v1" | "exemption" | `code:${string}`;
export const FILTERS: { id: LeaseFilter; label: string }[] = [
  { id: "all", label: "Tous" }, { id: "a_qualifier", label: "À qualifier" }, { id: "rate", label: "Taux manquant ou non converti" }, { id: "hors_scope_v1", label: "Hors périmètre V1" }, { id: "exemption", label: "Exemptions" },
];
/** Sélection commune du poste (C02), lue et écrite dans l'URL : `contrat`, `colonne`, `filtre`. Module pur, lu aussi par la page serveur. */
export interface LeaseSelectionState { contractId: string | null; column: MatrixColumn | null; filter: LeaseFilter }
const isFilter = (v: string | null): v is LeaseFilter => !!v && (FILTERS.some(f => f.id === v) || /^code:[A-Z]\d{2}$/.test(v));
const isColumn = (v: string | null): v is MatrixColumn => !!v && MATRIX_COLUMNS.some(c => c.id === v);
export function parseSelection(search: string): LeaseSelectionState {
  const q = new URLSearchParams(search), contract = q.get("contrat"), filter = q.get("filtre"), column = q.get("colonne");
  return { contractId: contract && /^[A-Za-z0-9._:-]{1,200}$/.test(contract) ? contract : null, column: isColumn(column) ? column : null, filter: isFilter(filter) ? filter : "all" };
}
export function selectionSearch(base: string, state: LeaseSelectionState) {
  const q = new URLSearchParams(base);
  for (const k of ["contrat", "colonne", "filtre"]) q.delete(k);
  if (state.filter !== "all") q.set("filtre", state.filter);
  if (state.contractId) { q.set("contrat", state.contractId); if (state.column) q.set("colonne", state.column); }
  return q.toString();
}
