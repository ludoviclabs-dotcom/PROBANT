/**
 * Helper de tracking analytics SIMULÉ, appelable depuis des composants
 * client ("use client" non requis dans ce fichier lui-même — c'est un
 * simple utilitaire fetch).
 *
 * Journalise l'événement en mémoire côté serveur via la route
 * `app/api/analytics/events/route.ts`, qui elle-même délègue à
 * `lib/server-store/analytics-store.ts` (store en mémoire process, non
 * durable, perdu au redémarrage). Ne transmet RIEN à un provider tiers réel
 * (pas de Vercel Analytics/PostHog installé dans PROBANT). Sert uniquement à
 * valider le câblage des événements produit avant un vrai choix d'outil.
 *
 * Événements suggérés (liste seulement, à implémenter dans d'autres
 * composants) :
 * - demo_viewed : ouverture du mode démo.
 * - cta_clicked : clic sur un appel à l'action principal.
 * - fec_uploaded : dépôt d'un fichier FEC par l'utilisateur.
 * - mapping_generated : génération d'une cartographie des risques.
 */

/**
 * Envoie un événement de tracking simulé en fire-and-forget.
 *
 * N'attend jamais la réponse côté appelant (pas d'await bloquant) et
 * n'expose aucune erreur réseau à l'utilisateur : le tracking ne doit
 * jamais casser l'expérience produit, même si l'API est indisponible.
 */
export function track(name: string, payload?: Record<string, unknown>): void {
  try {
    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, payload }),
    }).catch(() => {
      // Erreur réseau silencieuse : le tracking ne doit jamais lever
      // d'exception visible pour l'utilisateur.
    });
  } catch {
    // Garde-fou supplémentaire (ex: fetch indisponible dans l'environnement) :
    // ne jamais propager d'exception depuis un appel de tracking.
  }
}
