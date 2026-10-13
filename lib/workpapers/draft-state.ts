/**
 * État de sauvegarde d'une feuille de travail côté navigateur (C02, incident M20-UI-03).
 *
 * Une feuille fraîchement chargée, ou affichée en lecture seule, n'est pas « non sauvegardée » :
 * le libellé « Modifications non sauvegardées » n'apparaît que lorsque le brouillon hydraté
 * diffère de sa base serveur. Les états transitoires (sauvegarde, accusé, échec, conflit)
 * restent prioritaires sur la comparaison : un conflit serveur n'est jamais masqué.
 */
export type SaveStatus = "idle" | "saving" | "saved" | "failed" | "conflict";

export const SAVE_STATUS_LABELS: Record<Exclude<SaveStatus, "idle">, string> = {
  saving: "Sauvegarde en cours…",
  saved: "Sauvegardée — accusé serveur reçu",
  failed: "Échec de sauvegarde",
  conflict: "Conflit de modification",
};
export const DIRTY_LABEL = "Modifications non sauvegardées";
export const CLEAN_LABEL = "Aucune modification en attente";
export const READ_ONLY_LABEL = "Lecture seule · aucune saisie";

/** Normalisation structurelle : ordre des clés indifférent, `undefined` ignoré, `File` comparé par nom et taille. */
function canonical(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (typeof File !== "undefined" && value instanceof File) return { __file: value.name, size: value.size };
  if (Array.isArray(value)) return value.map(canonical);
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => [k, canonical(v)] as const);
  return Object.fromEntries(entries);
}

/** Égalité du brouillon et de sa base, indépendante de l'ordre des clés et des champs absents. */
export function sameDraft(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** Libellé affiché dans la zone `role="status"` d'une feuille. */
export function saveStateLabel(input: { status: SaveStatus; dirty: boolean; readOnly?: boolean }): string {
  if (input.status !== "idle") return SAVE_STATUS_LABELS[input.status];
  if (input.dirty) return DIRTY_LABEL;
  return input.readOnly ? READ_ONLY_LABEL : CLEAN_LABEL;
}
