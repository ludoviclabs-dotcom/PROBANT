import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOG_FIELD_NAMES, sanitizeLogFields } from "../fields";
import { log, logAuthEvent, logSecurityEvent, setLogSink } from "../logger";
import { measure, recordMetric, rowsPerSecond } from "../metrics";

const ORGANIZATION = "11111111-1111-4111-8111-111111111111";

let lines: string[];

beforeEach(() => {
  lines = [];
  setLogSink({ write: (_level, line) => lines.push(line) });
});

afterEach(() => {
  setLogSink(null);
});

function lastPayload(): Record<string, unknown> {
  return JSON.parse(lines[lines.length - 1]);
}

describe("allowlist des champs de log", () => {
  it("n'expose aucun champ de contenu comptable", () => {
    const forbidden = [
      "ecritureLib",
      "compteLib",
      "libelle",
      "tiers",
      "fournisseur",
      "client",
      "pieceContent",
      "fileName",
      "originalName",
      "token",
      "accessToken",
      "idToken",
      "cookie",
      "authorization",
      "email",
      "subject",
      "sub",
    ];
    for (const field of forbidden) {
      expect(LOG_FIELD_NAMES).not.toContain(field);
    }
  });

  it("supprime silencieusement tout champ inconnu", () => {
    const safe = sanitizeLogFields({
      requestId: "req-1",
      ecritureLib: "Facture EDF n°2025-113",
      compteLib: "401ACME — ACME SAS",
      accessToken: "eyJhbGciOi…",
    });
    expect(safe).toEqual({ requestId: "req-1" });
  });

  it("supprime un champ connu dont la valeur ne respecte pas son format", () => {
    const safe = sanitizeLogFields({
      organizationId: "acme",
      dossierId: ORGANIZATION,
      errorCode: "libellé libre avec des espaces",
      lineCount: -5,
    });
    expect(safe).toEqual({ dossierId: ORGANIZATION });
  });

  it("ne recopie jamais une ligne FEC complète", () => {
    const ligneFec =
      "VE|Ventes|VE00001|20250131|411ACME|ACME SAS||FA2025-113|Facture ACME|1200,00|0,00";
    log("info", "ingestion_progress", { requestId: "req-1", ecritureLib: ligneFec });
    expect(lines[0]).not.toContain("ACME");
    expect(lines[0]).not.toContain("1200,00");
  });
});

describe("format de sortie", () => {
  it("émet une ligne JSON plate en snake_case", () => {
    log("info", "job_completed", {
      requestId: "req-1",
      organizationId: ORGANIZATION,
      parseDurationMs: 1_234,
      lineCount: 42,
    });
    expect(lastPayload()).toEqual({
      level: "info",
      event: "job_completed",
      request_id: "req-1",
      organization_id: ORGANIZATION,
      parse_duration_ms: 1_234,
      line_count: 42,
    });
  });

  it("consigne une authentification sans le sujet ni le jeton", () => {
    logAuthEvent({
      event: "session_created",
      requestId: "req-1",
      outcome: "success",
      organizationId: ORGANIZATION,
      mfaSatisfied: true,
    });
    const payload = lastPayload();
    expect(payload).toMatchObject({ event: "session_created", mfa_satisfied: true });
    expect(Object.keys(payload)).not.toContain("subject");
  });

  it("classe un refus de sécurité en warn", () => {
    logSecurityEvent({ event: "csp_violation", errorCode: "SCRIPT_SRC" });
    expect(lastPayload()).toMatchObject({ level: "warn", event: "csp_violation" });
  });
});

describe("métriques métier", () => {
  it("émet nom et valeur avec leurs dimensions", () => {
    recordMetric("ingestion_duration_ms", 4_200, {
      organizationId: ORGANIZATION,
      documentType: "fec",
      outcome: "success",
    });
    expect(lastPayload()).toMatchObject({
      event: "metric",
      metric_name: "ingestion_duration_ms",
      metric_value: 4_200,
      document_type: "fec",
      outcome: "success",
    });
  });

  it("ignore une valeur non finie ou négative", () => {
    recordMetric("export_duration_ms", Number.NaN);
    recordMetric("export_duration_ms", -1);
    expect(lines).toHaveLength(0);
  });

  it("chronomètre un succès", async () => {
    let clock = 0;
    const result = await measure(
      "snapshot_build_duration_ms",
      { dossierId: ORGANIZATION },
      async () => {
        clock = 250;
        return "ok";
      },
      () => clock,
    );
    expect(result).toBe("ok");
    expect(lastPayload()).toMatchObject({
      metric_name: "snapshot_build_duration_ms",
      metric_value: 250,
      outcome: "success",
    });
  });

  it("chronomètre et marque un échec sans avaler l'erreur", async () => {
    let clock = 0;
    await expect(
      measure(
        "control_duration_ms",
        {},
        async () => {
          clock = 80;
          throw new Error("règle en échec");
        },
        () => clock,
      ),
    ).rejects.toThrow("règle en échec");
    expect(lastPayload()).toMatchObject({ metric_value: 80, outcome: "error" });
  });

  it("calcule un débit de parsing", () => {
    expect(rowsPerSecond(50_000, 2_000)).toBe(25_000);
    expect(rowsPerSecond(0, 1_000)).toBe(0);
    expect(rowsPerSecond(100, 0)).toBe(0);
  });
});
