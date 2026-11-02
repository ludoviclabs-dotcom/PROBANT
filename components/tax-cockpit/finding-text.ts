import {
  displayControlDetail,
  displayControlTitle,
  displayReconciliationLineLabel,
  type TaxFindingRowDetail,
} from "@/lib/tax/cockpit";
import type { VisualizationRow } from "@/lib/visualization/types";

/** Titre affiché d'une ligne d'exploration : sans le préfixe « CONTROL.ID — », libellé du moteur accentué. */
export function findingTitle(row: VisualizationRow, detail: TaxFindingRowDetail | undefined): string {
  const raw = String(row.cells.label ?? row.id);
  const controlId = detail?.controlId ?? null;
  if (controlId) {
    const title = raw.startsWith(`${controlId} — `) ? raw.slice(controlId.length + 3) : raw;
    return displayControlTitle(controlId, title);
  }
  return displayReconciliationLineLabel(detail?.lineKey, raw);
}

/** Lecture affichée : détail du moteur accentué pour un contrôle, wording de la taxonomie sinon. */
export function findingReading(detail: TaxFindingRowDetail | undefined): string {
  if (!detail) return "—";
  return detail.controlId ? displayControlDetail(detail.controlId, detail.reading) : detail.reading;
}
