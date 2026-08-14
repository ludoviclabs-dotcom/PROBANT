import { describe, expect, it } from "vitest";
import {
  CSP_REPORT_PATH,
  PERMISSIONS_POLICY,
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  generateNonce,
  readCspMode,
} from "../headers";

const NONCE = "bm9uY2UtZGUtdGVzdA==";

describe("mode CSP", () => {
  it("démarre en Report-Only par défaut", () => {
    expect(readCspMode({})).toBe("report-only");
    expect(readCspMode({ CSP_MODE: "n-importe-quoi" })).toBe("report-only");
  });

  it("bascule en enforcement uniquement sur demande explicite", () => {
    expect(readCspMode({ CSP_MODE: "enforce" })).toBe("enforce");
  });

  it("choisit l'en-tête correspondant au mode", () => {
    const reportOnly = buildSecurityHeaders({ nonce: NONCE, mode: "report-only", https: true });
    expect(reportOnly["content-security-policy-report-only"]).toBeDefined();
    expect(reportOnly["content-security-policy"]).toBeUndefined();

    const enforced = buildSecurityHeaders({ nonce: NONCE, mode: "enforce", https: true });
    expect(enforced["content-security-policy"]).toBeDefined();
    expect(enforced["content-security-policy-report-only"]).toBeUndefined();
  });
});

describe("politique CSP", () => {
  const policy = buildContentSecurityPolicy({ nonce: NONCE, mode: "enforce" });

  it("porte le nonce et strict-dynamic", () => {
    expect(policy).toContain(`'nonce-${NONCE}'`);
    expect(policy).toContain("'strict-dynamic'");
  });

  it("verrouille les directives structurantes", () => {
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("form-action 'self'");
  });

  it("autorise les workers blob: dont pdf.js a besoin", () => {
    expect(policy).toContain("worker-src 'self' blob:");
  });

  it("n'autorise jamais unsafe-eval en production", () => {
    expect(policy).not.toContain("unsafe-eval");
  });

  it("n'autorise unsafe-eval qu'en développement, pour le HMR", () => {
    const dev = buildContentSecurityPolicy({ nonce: NONCE, mode: "enforce", development: true });
    expect(dev).toContain("'unsafe-eval'");
  });

  it("déclare le point de collecte des violations", () => {
    expect(policy).toContain(`report-uri ${CSP_REPORT_PATH}`);
    expect(policy).toContain("report-to probant-csp");
  });
});

describe("en-têtes complémentaires", () => {
  const headers = buildSecurityHeaders({ nonce: NONCE, mode: "report-only", https: true });

  it("pose les en-têtes exigés par la revue de release", () => {
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toBe(PERMISSIONS_POLICY);
    expect(headers["x-frame-options"]).toBe("DENY");
  });

  it("refuse par défaut les capacités navigateur sensibles", () => {
    for (const capability of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      expect(PERMISSIONS_POLICY).toContain(`${capability}=()`);
    }
  });

  it("ne pose HSTS que sur HTTPS", () => {
    expect(headers["strict-transport-security"]).toContain("max-age=63072000");
    const local = buildSecurityHeaders({ nonce: NONCE, mode: "report-only", https: false });
    expect(local["strict-transport-security"]).toBeUndefined();
  });
});

describe("nonce", () => {
  it("produit 128 bits distincts à chaque appel", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => generateNonce()));
    expect(nonces.size).toBe(50);
    expect(Buffer.from([...nonces][0], "base64")).toHaveLength(16);
  });
});
