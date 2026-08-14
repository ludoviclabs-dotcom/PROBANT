import { createHmac, createHash, randomBytes } from "node:crypto";
import { constantTimeEquals } from "../sealed-cookie";

/**
 * Cookies de session.
 *
 * Le préfixe `__Host-` est un contrat vérifié par le navigateur : il n'accepte
 * le cookie que s'il est `Secure`, `Path=/` et **sans** attribut `Domain`. Un
 * sous-domaine compromis ne peut donc pas écrire la session. `localhost` est
 * un contexte sécurisé pour les navigateurs, le développement fonctionne donc
 * sans assouplir l'attribut `Secure`.
 */
export const SESSION_COOKIE = "__Host-probant_session";
export const OIDC_TRANSACTION_COOKIE = "__Host-probant_oidc_tx";
export const CSRF_HEADER = "x-probant-csrf";

export interface CookieAttributes {
  readonly name: string;
  readonly value: string;
  readonly maxAgeSeconds: number;
  readonly httpOnly: boolean;
  readonly sameSite: "Lax" | "Strict";
}

/** Sérialise un cookie en `Set-Cookie`, attributs de sécurité non négociables. */
export function serializeCookie(cookie: CookieAttributes): string {
  const parts = [
    `${cookie.name}=${cookie.value}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(cookie.maxAgeSeconds))}`,
    `SameSite=${cookie.sameSite}`,
    "Secure",
  ];
  if (cookie.httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
}

export function expiredCookie(name: string): string {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly`;
}

/** Lecture d'un cookie depuis l'en-tête brut — sans dépendance de parsing. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim() || null;
    }
  }
  return null;
}

/** Secret opaque porté par le cookie : 256 bits d'aléa, jamais dérivé de l'identité. */
export function newSessionSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Seule cette empreinte est stockée : une fuite de base ne rejoue aucune session. */
export function sessionTokenDigest(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * Jeton CSRF lié à la session, dérivé et non stocké.
 *
 * Le client le lit via `GET /api/auth/session` et le renvoie dans l'en-tête
 * `x-probant-csrf`. Un attaquant tiers ne peut ni lire la réponse (CORS) ni
 * forger l'en-tête depuis un formulaire.
 */
export function csrfTokenFor(sessionId: string, secret: string): string {
  return createHmac("sha256", secret).update(`csrf:${sessionId}`, "utf8").digest("base64url");
}

export function csrfTokenMatches(
  sessionId: string,
  secret: string,
  supplied: string | null,
): boolean {
  if (!supplied) return false;
  return constantTimeEquals(csrfTokenFor(sessionId, secret), supplied);
}
