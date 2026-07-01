/**
 * Journal d'événements analytics — SIMULÉ en mémoire.
 *
 * Remplace un vrai provider analytics (Vercel Analytics, PostHog, etc.) qui
 * n'est pas installé dans PROBANT. Sert uniquement à vérifier que le
 * tracking applicatif se déclenche correctement, sans envoyer la moindre
 * donnée réelle à un tiers. Le tableau ci-dessous vit en mémoire process,
 * plafonné à 500 entrées, et est perdu au redémarrage du serveur Next.js —
 * ce n'est PAS une vraie persistance.
 *
 * Module serveur normal (jamais importé côté client), uniquement consommé
 * depuis les routes `app/api/.../route.ts`. `Date.now()`/`crypto.randomUUID()` y sont donc
 * utilisés sans restriction.
 */

import type { AnalyticsEvent } from "./types";

/** Nombre maximal d'événements conservés ; au-delà, les plus anciens sont retirés. */
const MAX_EVENTS = 500;

/** Journal simulé des événements analytics. */
const events: AnalyticsEvent[] = [];

/** Enregistre un événement analytics simulé et retourne l'entrée créée. */
export function recordEvent(
  name: string,
  dossierId: string,
  payload?: Record<string, unknown>,
): AnalyticsEvent {
  const event: AnalyticsEvent = {
    id: crypto.randomUUID(),
    name,
    dossierId,
    payload: payload ?? {},
    occurredAt: new Date().toISOString(),
  };

  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  return event;
}

/** Liste les événements, filtrés par `dossierId` si fourni. */
export function listEvents(dossierId?: string): AnalyticsEvent[] {
  if (!dossierId) {
    return [...events];
  }
  return events.filter((event) => event.dossierId === dossierId);
}
