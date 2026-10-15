import { periodId, type WorkpaperRun } from "../model";
import { buildTransversalEventMap, type EventMapInput, type TransversalEventMap } from "../transversal-events";
import type { EventMapRead } from "../closing-events";
import { createClosingHarness, CL_DOSSIER, CL_ORG, type ClosingHarness } from "./closing-harness";
import { sheet, source } from "./closing-c14-fixtures";
import { period as c11Period, recette } from "./c11-fixtures";

/**
 * C14 suite — dossier de recette des effets d'événements transversaux : la recette C11 (docs/recette/c11/RECETTE.md) rejouée dans le
 * dossier de clôture. La carte est construite par le vrai moteur C11 ; le dossier observe les feuilles qui la nourrissent (Achats,
 * RPNE, Clients et ventes) à leur version, comme le ferait le magasin `clients_*`. Données synthétiques seulement.
 */
export const EV_PERIOD = c11Period, EV_PERIOD_ID = periodId(c11Period);
export const evScope = { organizationId: CL_ORG, dossierId: CL_DOSSIER, periodId: EV_PERIOD_ID, mode: "real" as const };
/** La carte de la recette C11 pour le dossier de clôture (même moteur, même dossier et même exercice que le dossier). */
export function dossierMap(change: (input: EventMapInput) => EventMapInput = x => x): TransversalEventMap {
  return buildTransversalEventMap(change({ ...recette(), scope: evScope }));
}
export const read = (map: TransversalEventMap): EventMapRead => ({ status: "lue", map, reason: null });
/** Feuilles observées par le dossier, aux runs et versions que la carte cite (r1 v1, exécutées). */
export function eventSheets(extra: WorkpaperRun[] = []) {
  const run = (id: string, template: string) => sheet({ id, template, state: "executed", version: 1, outcome: "exceptions_detected", period: EV_PERIOD });
  return source("clients", [run("RUN-ACH", "payables.purchases"), run("RUN-RPNE", "payables.rpne"), run("RUN-CLI", "clients.sales"), ...extra]);
}
/** Le dossier, ouvert sur l'exercice de la carte : un risque de séparation des exercices, Achats (P-01) et RPNE (P-02) au programme ; Clients et ventes hors programme. */
export async function eventsProgramme(h: ClosingHarness, options: { purchases?: boolean } = {}) {
  await h.ok({ command: "open", period: EV_PERIOD, entity: "GAMMA SAS (synthétique)" });
  await h.ok({ command: "set_risk", riskId: "R-01", cycle: "achats", label: "Rattachement des charges et des produits à l’exercice", assertions: ["flux_separation"], assessment: { level: "modere", rationale: "Exercice non calendaire, factures de part et d’autre de la clôture." } });
  if (options.purchases !== false) await h.ok({ command: "set_procedure", procedureId: "P-01", riskIds: ["R-01"], assertions: ["flux_separation"], nature: "engine", engine: "payables.purchases", label: "Achats et rattachement", owner: "Collaborateur A" });
  await h.ok({ command: "set_procedure", procedureId: "P-02", riskIds: ["R-01"], assertions: ["flux_separation"], nature: "engine", engine: "payables.rpne", label: "Recherche de passifs non enregistrés", owner: "Collaborateur A" });
}
export function eventsHarness(map: TransversalEventMap | (() => EventMapRead | Promise<EventMapRead>), extra: WorkpaperRun[] = []) {
  const reader = typeof map === "function" ? map : () => read(map);
  return createClosingHarness({ cycles: [eventSheets(extra)], periodId: EV_PERIOD_ID, events: async () => reader() });
}
