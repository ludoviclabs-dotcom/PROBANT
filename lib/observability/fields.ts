import { z } from "zod";

/**
 * Champs autorisés dans un log structuré PROBANT.
 *
 * Le principe est une **allowlist fermée**, pas une liste d'interdits : un
 * champ qui n'est pas décrit ici n'est jamais sérialisé. On ne peut donc pas
 * faire fuiter un libellé d'écriture, un nom de fournisseur, une ligne de FEC
 * ou un jeton en ajoutant simplement une clé à un appel de log.
 *
 * Interdits explicites, rappelés pour la revue : libellés d'écritures, noms de
 * tiers, contenu de pièces, lignes FEC, PDF brut, jetons, cookies, en-têtes
 * d'autorisation, noms de fichiers déposés.
 */
const identifier = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u);
const shortCode = z.string().regex(/^[A-Z0-9_]{1,64}$/u);
const slug = z.string().regex(/^[a-z0-9._:-]{1,64}$/u);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const durationMs = z.number().min(0).max(86_400_000);

export const logFieldSchema = z
  .object({
    // Corrélation
    requestId: identifier,
    organizationId: z.string().uuid(),
    dossierId: z.string().uuid(),
    documentId: z.string().uuid(),
    jobId: z.string().uuid(),
    sessionId: z.string().uuid(),

    // Nature de l'événement
    event: slug,
    outcome: z.enum(["success", "denied", "rejected", "error"]),
    errorCode: shortCode,
    jobStatus: slug,
    parserVersion: identifier,
    ruleSetVersion: identifier,
    engineVersion: identifier,
    documentType: z.enum(["fec", "balance", "pdf", "cycle_document"]),
    mode: z.enum(["demo", "persistent"]),
    route: z.string().regex(/^\/[A-Za-z0-9\-._~/[\]]{0,128}$/u),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
    statusCode: z.number().int().min(100).max(599),

    // Authentification — jamais le sujet, jamais l'e-mail, jamais un jeton
    authenticationMethod: z.enum(["oidc-session", "signed-gateway-context"]),
    mfaSatisfied: z.boolean(),
    mfaReason: slug,

    // Volumétrie et durées
    fileBytes: count,
    lineCount: count,
    warningCount: count,
    controlCount: count,
    findingCount: count,
    rowsPerSecond: z.number().min(0),
    parseDurationMs: durationMs,
    controlDurationMs: durationMs,
    snapshotDurationMs: durationMs,
    exportDurationMs: durationMs,
    ingestionDurationMs: durationMs,
    durationMs,
    attempt: count,
    retryable: z.boolean(),

    // Métriques métier
    metricName: z.string().regex(/^[a-z0-9_]{1,64}$/u),
    metricValue: z.number().min(0).finite(),
  })
  .partial()
  .strict();

export type LogFields = z.infer<typeof logFieldSchema>;

export const LOG_FIELD_NAMES = Object.keys(logFieldSchema.shape) as (keyof LogFields)[];

/**
 * Filtre une charge utile de log.
 *
 * Les champs inconnus **et** les champs connus dont la valeur ne respecte pas
 * son format sont retirés silencieusement : un log dégradé vaut mieux qu'un
 * log qui refuse d'être écrit ou qui recopie une valeur non contrôlée.
 */
export function sanitizeLogFields(input: Record<string, unknown>): LogFields {
  const output: Record<string, unknown> = {};
  const shape = logFieldSchema.shape as Record<string, z.ZodTypeAny>;
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    const validator = shape[key];
    if (!validator) continue;
    const parsed = validator.safeParse(value);
    if (parsed.success) output[key] = parsed.data;
  }
  return output as LogFields;
}
