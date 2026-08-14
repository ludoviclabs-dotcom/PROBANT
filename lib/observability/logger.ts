import { sanitizeLogFields, type LogFields } from "./fields";

/**
 * Journalisation structurée.
 *
 * Une ligne = un objet JSON à plat, champs issus d'une allowlist. Les noms de
 * champs suivent la convention OpenTelemetry en `snake_case` afin qu'un
 * collecteur puisse les indexer sans transformation, sans que PROBANT dépende
 * d'un SDK OTel (cf. `docs/release/KNOWN_LIMITATIONS.md`).
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogSink {
  write(level: LogLevel, line: string): void;
}

const consoleSink: LogSink = {
  write(level, line) {
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  },
};

let activeSink: LogSink = consoleSink;

/** Remplace la destination — tests et collecteurs alternatifs. */
export function setLogSink(sink: LogSink | null): void {
  activeSink = sink ?? consoleSink;
}

function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const safe = sanitizeLogFields({ ...fields, event });
  const payload: Record<string, unknown> = { level };
  for (const [key, value] of Object.entries(safe)) {
    payload[toSnakeCase(key)] = value;
  }
  activeSink.write(level, JSON.stringify(payload));
}

/**
 * Événement d'authentification.
 *
 * Ne consigne ni `sub`, ni e-mail, ni jeton : l'organisation et le résultat
 * suffisent à détecter un abus, et le sujet est retrouvable via `request_id`
 * dans le magasin de sessions si une investigation le justifie.
 */
export function logAuthEvent(
  fields: Pick<LogFields, "event" | "requestId" | "outcome"> & Partial<LogFields>,
): void {
  log(fields.outcome === "success" ? "info" : "warn", fields.event ?? "auth", fields);
}

/** Événement de sécurité : refus d'origine, CSRF, quota, rate limit. */
export function logSecurityEvent(
  fields: Pick<LogFields, "event"> & Partial<LogFields>,
): void {
  log("warn", fields.event ?? "security", fields);
}

export function logIngestionEvent(
  fields: Pick<LogFields, "event"> & Partial<LogFields>,
): void {
  log(fields.outcome === "error" ? "error" : "info", fields.event ?? "ingestion", fields);
}
