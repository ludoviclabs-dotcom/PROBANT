/**
 * En-têtes de sécurité HTTP — PR-08.
 *
 * Fonctions pures : la politique est testable sans démarrer Next.js, et le
 * middleware ne fait que l'appliquer.
 *
 * La CSP démarre en **Report-Only**. La bascule en enforcement est une
 * décision d'exploitation (`CSP_MODE=enforce`) prise après lecture des
 * rapports — notamment pour pdf.js, ses workers et ses URL `blob:`.
 */
export type CspMode = "report-only" | "enforce";

export const CSP_REPORT_PATH = "/api/security/csp-report";

export function readCspMode(
  env: Record<string, string | undefined> = process.env,
): CspMode {
  return env.CSP_MODE === "enforce" ? "enforce" : "report-only";
}

export interface CspOptions {
  readonly nonce: string;
  readonly mode: CspMode;
  /** Le HMR de Next.js exige `'unsafe-eval'` : jamais en production. */
  readonly development?: boolean;
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${options.nonce}'`,
    // `strict-dynamic` fait confiance aux scripts chargés par un script
    // noncé et neutralise les allowlists d'hôtes, plus faciles à contourner.
    "'strict-dynamic'",
    ...(options.development ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Tailwind et les styles inline de Next.js imposent `unsafe-inline` ;
    // l'impact est borné par l'absence de `unsafe-eval` côté script.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    // pdf.js instancie ses workers depuis des URL `blob:`.
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "media-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
    `report-uri ${CSP_REPORT_PATH}`,
    "report-to probant-csp",
  ].join("; ");
}

/**
 * Permissions-Policy : tout est refusé par défaut.
 *
 * PROBANT n'a besoin d'aucune capacité navigateur sensible ; une liste vide
 * `()` signifie « aucune origine », y compris la nôtre.
 */
export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "camera=()",
  "display-capture=()",
  "encrypted-media=()",
  "fullscreen=(self)",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

export interface SecurityHeaderOptions extends CspOptions {
  /** HSTS n'est posé que sur HTTPS : inutile et trompeur en local. */
  readonly https: boolean;
}

export function buildSecurityHeaders(
  options: SecurityHeaderOptions,
): Record<string, string> {
  const cspHeader =
    options.mode === "enforce"
      ? "content-security-policy"
      : "content-security-policy-report-only";

  const headers: Record<string, string> = {
    [cspHeader]: buildContentSecurityPolicy(options),
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": PERMISSIONS_POLICY,
    // Doublon volontaire de `frame-ancestors` pour les navigateurs anciens.
    "x-frame-options": "DENY",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "reporting-endpoints": `probant-csp="${CSP_REPORT_PATH}"`,
    "x-permitted-cross-domain-policies": "none",
  };

  if (options.https) {
    headers["strict-transport-security"] = "max-age=63072000; includeSubDomains; preload";
  }
  return headers;
}

/** Nonce CSP : 128 bits d'aléa, encodés base64. */
export function generateNonce(
  randomBytes: (size: number) => Uint8Array = defaultRandomBytes,
): string {
  return Buffer.from(randomBytes(16)).toString("base64");
}

function defaultRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}
