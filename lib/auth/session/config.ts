import { z } from "zod";

/**
 * Configuration de la session serveur — ADR-007 § 3.
 *
 * Aucun défaut de secret : sans `AUTH_SESSION_SECRET` d'au moins 32 octets, il
 * n'y a pas de session, donc pas de mode persistant.
 */
const schema = z.object({
  AUTH_SESSION_SECRET: z.string().min(32).max(512),
  /** Inactivité tolérée avant expiration (fenêtre glissante). */
  AUTH_SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3_600),
  /** Durée de vie maximale, même en usage continu. */
  AUTH_SESSION_ABSOLUTE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(604_800)
    .default(43_200),
  /** Origine publique de l'application — sert au contrôle CSRF d'origine. */
  AUTH_APP_ORIGIN: z.string().url(),
});

export interface SessionConfig {
  readonly secret: string;
  readonly idleTtlSeconds: number;
  readonly absoluteTtlSeconds: number;
  readonly appOrigin: string;
}

export class SessionNotConfiguredError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`AUTH_SESSION_NOT_CONFIGURED:${missing.join(",")}`);
    this.name = "SessionNotConfiguredError";
  }
}

export type EnvironmentRecord = Record<string, string | undefined>;

export function readSessionConfig(env: EnvironmentRecord = process.env): SessionConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new SessionNotConfiguredError(
      [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].sort(),
    );
  }
  const data = parsed.data;
  if (data.AUTH_SESSION_ABSOLUTE_TTL_SECONDS < data.AUTH_SESSION_IDLE_TTL_SECONDS) {
    throw new SessionNotConfiguredError(["AUTH_SESSION_ABSOLUTE_TTL_SECONDS"]);
  }
  return {
    secret: data.AUTH_SESSION_SECRET,
    idleTtlSeconds: data.AUTH_SESSION_IDLE_TTL_SECONDS,
    absoluteTtlSeconds: data.AUTH_SESSION_ABSOLUTE_TTL_SECONDS,
    appOrigin: new URL(data.AUTH_APP_ORIGIN).origin,
  };
}

export function isSessionConfigured(env: EnvironmentRecord = process.env): boolean {
  return schema.safeParse(env).success;
}
