"use client";

// Import depuis `constants` et non `cookie` : ce dernier utilise
// `node:crypto`, qui n'a rien à faire dans un bundle navigateur.
import { CSRF_HEADER } from "./session/constants";

/**
 * Attache le jeton CSRF aux requêtes mutantes du navigateur.
 *
 * Le jeton est dérivé côté serveur de l'identifiant de session et distribué
 * par `GET /api/auth/session`. Il n'est ni stocké ni deviné : le client le
 * demande, le garde en mémoire le temps de la page, et le renvoie dans
 * l'en-tête `x-probant-csrf`.
 *
 * Le garder en mémoire — et non dans `localStorage` — est délibéré : un jeton
 * persisté survivrait à la déconnexion et à la rotation de session.
 */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let cachedToken: string | null = null;
let inFlight: Promise<string | null> | null = null;

interface SessionView {
  authenticated?: boolean;
  csrfToken?: string;
}

async function readToken(): Promise<string | null> {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) return null;
  const session = (await response.json().catch(() => null)) as SessionView | null;
  return session?.authenticated && typeof session.csrfToken === "string"
    ? session.csrfToken
    : null;
}

/**
 * Retourne le jeton courant, en ne déclenchant qu'un seul appel réseau même si
 * plusieurs mutations partent simultanément.
 */
export async function getCsrfToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedToken) return cachedToken;
  if (!inFlight) {
    inFlight = readToken().finally(() => {
      inFlight = null;
    });
  }
  cachedToken = await inFlight;
  return cachedToken;
}

/** À appeler après une déconnexion ou un changement d'identité. */
export function resetCsrfToken(): void {
  cachedToken = null;
}

/**
 * `fetch` pour les appels d'API de même origine.
 *
 * Sur une méthode mutante, ajoute le jeton CSRF. Si le serveur le refuse — cas
 * d'une session renouvelée dans un autre onglet — le jeton est rafraîchi et la
 * requête rejouée **une seule fois** : une boucle de réessai sur un refus
 * d'autorisation masquerait un défaut de configuration.
 */
export async function fetchWithCsrf(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  if (!UNSAFE_METHODS.has(method)) {
    return fetch(input, { ...init, credentials: "same-origin" });
  }

  const send = async (token: string | null): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (token) headers.set(CSRF_HEADER, token);
    return fetch(input, { ...init, headers, credentials: "same-origin" });
  };

  const response = await send(await getCsrfToken());
  if (response.status !== 403) return response;

  // Ne rejouer que sur un refus explicitement CSRF : un 403 d'autorisation
  // métier ne doit pas déclencher de seconde tentative.
  const clone = response.clone();
  const body = (await clone.json().catch(() => null)) as { code?: string } | null;
  if (body?.code !== "CSRF_TOKEN_INVALID") return response;

  return send(await getCsrfToken(true));
}
