import { createHash } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import type { SessionConfig } from "../session/config";
import { newSessionSecret, serializeCookie, SESSION_COOKIE, sessionTokenDigest } from "../session/cookie";
import type { SessionRecord, SessionStore } from "../session/store";
import { localIdentity, type LocalAuthConfig } from "./config";

/**
 * Connexion du profil personnel local (C07).
 *
 * Le lanceur écrit dans la base personnelle l'empreinte SHA-256 d'un code
 * aléatoire à usage unique (`probant_local.login_codes`, durée courte) et ouvre
 * `/api/auth/local?code=…`. Ici, le code est consommé atomiquement, le marqueur
 * de la base est revérifié, puis une session serveur ordinaire est créée.
 * Aucun mot de passe, aucun rôle ni type de relecture ne vient du navigateur.
 */
export interface LocalLoginStore {
  /** Identifiant du profil inscrit dans la base (`probant_local.profile`), ou `null` sans marqueur. */
  profileId(): Promise<string | null>;
  /** Consomme un code valide et non utilisé ; retourne le sujet local qu'il ouvre. */
  consumeCode(codeSha256: string): Promise<string | null>;
}

export interface LocalLoginDeps {
  readonly config: LocalAuthConfig;
  readonly sessionConfig: SessionConfig;
  readonly sessionStore: SessionStore;
  readonly loginStore: LocalLoginStore;
  readonly nowEpochSeconds: () => number;
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const CODE = /^[A-Za-z0-9_-]{32,128}$/;

/** Chemin de retour sûr : relatif, sans changement d'origine. */
export function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.length > 512) return "/local";
  return value;
}

export function localCodeDigest(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export type LocalLoginResult =
  | { kind: "redirect_canonical"; location: string }
  | { kind: "session"; location: string; setCookie: string; session: SessionRecord };

export async function completeLocalLogin(request: Request, deps: LocalLoginDeps): Promise<LocalLoginResult> {
  const url = new URL(request.url);
  // L'hôte réellement visé par le navigateur est l'en-tête Host : derrière `next start`, request.url
  // peut porter un autre nom de la même machine que celui de la barre d'adresse.
  const host = request.headers.get("host");
  const visited = host ? new URL(url.protocol + "//" + host) : url;
  if (!LOOPBACK.has(visited.hostname) || !LOOPBACK.has(url.hostname)) throw new ApiError("LOCAL_LOGIN_LOOPBACK_ONLY", "Connexion locale réservée à cette machine.", 403);
  const canonical = new URL(deps.sessionConfig.appOrigin);
  // Le cookie et le contrôle d'origine suivent l'origine déclarée : on y renvoie avant de consommer le code.
  if (visited.origin !== canonical.origin) return { kind: "redirect_canonical", location: canonical.origin + url.pathname + url.search };
  const code = url.searchParams.get("code") ?? "";
  if (!CODE.test(code)) throw new ApiError("LOCAL_LOGIN_CODE_INVALID", "Code de connexion locale absent ou invalide.", 401);
  const profileId = await deps.loginStore.profileId();
  if (profileId?.toLowerCase() !== deps.config.profileId) {
    throw new ApiError("LOCAL_PROFILE_DATABASE_MISMATCH", "La base ouverte n'est pas celle de ce profil personnel.", 503);
  }
  const subject = await deps.loginStore.consumeCode(localCodeDigest(code));
  const identity = subject ? localIdentity(deps.config, subject) : null;
  if (!identity) throw new ApiError("LOCAL_LOGIN_CODE_INVALID", "Code de connexion locale expiré, déjà utilisé ou inconnu.", 401);
  const secret = newSessionSecret();
  const session = await deps.sessionStore.create({
    tokenSha256: sessionTokenDigest(secret),
    issuer: deps.config.issuer,
    subject: identity.subject,
    organizationId: deps.config.organizationId,
    roles: identity.roles,
    acr: null,
    amr: ["probant-local-code"],
    mfaSatisfied: false,
    nowEpochSeconds: deps.nowEpochSeconds(),
    idleTtlSeconds: deps.sessionConfig.idleTtlSeconds,
    absoluteTtlSeconds: deps.sessionConfig.absoluteTtlSeconds,
  });
  return {
    kind: "session",
    location: canonical.origin + safeReturnPath(url.searchParams.get("next")),
    setCookie: serializeCookie({ name: SESSION_COOKIE, value: secret, maxAgeSeconds: deps.sessionConfig.absoluteTtlSeconds, httpOnly: true, sameSite: "Lax" }),
    session,
  };
}
