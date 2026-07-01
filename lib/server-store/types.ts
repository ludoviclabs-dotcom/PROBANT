/**
 * Persistance SIMULÉE en mémoire — types partagés.
 *
 * AUCUNE vraie base de données ici : ce module ne fait qu'imiter la FORME
 * d'une DB (tables + historique + identité utilisateur) via des structures
 * en mémoire process (voir `adjustments-store.ts`, `analytics-store.ts`).
 * Les données sont perdues à chaque redémarrage du process Next.js. Ce socle
 * sert de brique d'attente avant une décision d'infra réelle (Postgres,
 * Supabase, etc.) et ne doit jamais être présenté comme une persistance
 * durable.
 */

/** Identité utilisateur simulée (aucune vraie authentification dans PROBANT). */
export const DEMO_USER_ID = "auditeur-demo";

/** Dossier simulé unique : PROBANT ne porte qu'un seul dossier de démo. */
export const DEMO_DOSSIER_ID = "demo-dossier";

/**
 * Enregistrement d'un ajustement de jugement pour un cycle/axe donné.
 * Imite une ligne de table « judgement_adjustments » d'une vraie DB.
 */
export interface JudgementAdjustmentRecord {
  id: string;
  userId: string;
  dossierId: string;
  cycleSlug: string;
  axe: "probabilite" | "detectabilite";
  valeurAjustee: number;
  commentaire?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Entrée d'historique d'un ajustement : trace la valeur précédente et la
 * nouvelle valeur à chaque modification. Imite une table d'audit-trail.
 */
export interface AdjustmentHistoryEntry {
  id: string;
  adjustmentId: string;
  userId: string;
  cycleSlug: string;
  axe: "probabilite" | "detectabilite";
  previousValue: number;
  newValue: number;
  commentaire?: string;
  changedAt: string;
}

/**
 * Événement analytics simulé (voir `analytics-store.ts`). Ne part vers
 * aucun tiers réel : sert uniquement à vérifier que le tracking applicatif
 * fonctionne en local.
 */
export interface AnalyticsEvent {
  id: string;
  name: string;
  dossierId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}
