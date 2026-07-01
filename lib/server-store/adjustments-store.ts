/**
 * Store d'ajustements de jugement — persistance SIMULÉE en mémoire.
 *
 * Module serveur normal, JAMAIS importé côté client : uniquement consommé
 * depuis les routes `app/api/.../route.ts`. Il n'existe aucune vraie base de données
 * derrière — une simple `Map` module-level et un tableau d'historique, tous
 * deux perdus au redémarrage du process Next.js. Ce fichier imite la forme
 * d'une table + d'un historique d'audit-trail, en attendant une décision
 * d'infra réelle. Comme il ne tourne que côté serveur (jamais dans un
 * script workflow rejouable), `Date.now()` et `crypto.randomUUID()` y sont
 * utilisés sans restriction.
 */

import { DEMO_USER_ID } from "./types";
import type { AdjustmentHistoryEntry, JudgementAdjustmentRecord } from "./types";

/** Clé composite = dossierId:cycleSlug:axe. */
function makeKey(dossierId: string, cycleSlug: string, axe: JudgementAdjustmentRecord["axe"]): string {
  return `${dossierId}:${cycleSlug}:${axe}`;
}

/** Table simulée des ajustements courants (dernière valeur par clé). */
const adjustmentsTable = new Map<string, JudgementAdjustmentRecord>();

/** Historique simulé de toutes les modifications d'ajustements. */
const historyLog: AdjustmentHistoryEntry[] = [];

export interface UpsertAdjustmentInput {
  dossierId: string;
  cycleSlug: string;
  axe: JudgementAdjustmentRecord["axe"];
  valeurAjustee: number;
  commentaire?: string;
  userId?: string;
}

/**
 * Crée ou met à jour l'ajustement pour (dossierId, cycleSlug, axe). Si une
 * valeur existait déjà et diffère de la nouvelle, une entrée d'historique est
 * ajoutée (previousValue → newValue).
 */
export function upsertAdjustment(input: UpsertAdjustmentInput): JudgementAdjustmentRecord {
  const key = makeKey(input.dossierId, input.cycleSlug, input.axe);
  const existing = adjustmentsTable.get(key);
  const now = new Date().toISOString();
  const userId = input.userId ?? DEMO_USER_ID;

  if (existing && existing.valeurAjustee !== input.valeurAjustee) {
    historyLog.push({
      id: crypto.randomUUID(),
      adjustmentId: existing.id,
      userId,
      cycleSlug: input.cycleSlug,
      axe: input.axe,
      previousValue: existing.valeurAjustee,
      newValue: input.valeurAjustee,
      commentaire: input.commentaire,
      changedAt: now,
    });
  }

  const record: JudgementAdjustmentRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    userId,
    dossierId: input.dossierId,
    cycleSlug: input.cycleSlug,
    axe: input.axe,
    valeurAjustee: input.valeurAjustee,
    commentaire: input.commentaire,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  adjustmentsTable.set(key, record);
  return record;
}

/** Liste tous les ajustements courants d'un dossier. */
export function listAdjustments(dossierId: string): JudgementAdjustmentRecord[] {
  return Array.from(adjustmentsTable.values()).filter((record) => record.dossierId === dossierId);
}

/** Supprime un ajustement par id. Retourne `true` si une entrée a été supprimée. */
export function deleteAdjustment(id: string): boolean {
  for (const [key, record] of adjustmentsTable.entries()) {
    if (record.id === id) {
      adjustmentsTable.delete(key);
      return true;
    }
  }
  return false;
}

/** Supprime tous les ajustements d'un dossier. Retourne le nombre supprimé. */
export function deleteAllAdjustments(dossierId: string): number {
  let count = 0;
  for (const [key, record] of adjustmentsTable.entries()) {
    if (record.dossierId === dossierId) {
      adjustmentsTable.delete(key);
      count += 1;
    }
  }
  return count;
}

/**
 * Liste l'historique des ajustements d'un dossier, trié par `changedAt`
 * décroissant (le plus récent en premier), filtré par `cycleSlug` si fourni.
 *
 * Note : l'historique ne porte pas de `dossierId` propre (il référence un
 * `adjustmentId`) ; le filtre par dossier se fait via les ajustements
 * actuellement rattachés à ce dossier.
 */
export function listHistory(dossierId: string, cycleSlug?: string): AdjustmentHistoryEntry[] {
  const adjustmentIdsInDossier = new Set(
    Array.from(adjustmentsTable.values())
      .filter((record) => record.dossierId === dossierId)
      .map((record) => record.id),
  );

  return historyLog
    .filter((entry) => adjustmentIdsInDossier.has(entry.adjustmentId))
    .filter((entry) => (cycleSlug ? entry.cycleSlug === cycleSlug : true))
    .sort((a, b) => (a.changedAt < b.changedAt ? 1 : a.changedAt > b.changedAt ? -1 : 0));
}
