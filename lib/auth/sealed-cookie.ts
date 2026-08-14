import {
  createDecipheriv,
  createCipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Scellement AES-256-GCM d'une valeur de cookie.
 *
 * Utilisé pour la transaction OIDC (state, nonce, `code_verifier`) : ces
 * valeurs transitent chez le navigateur et ne doivent être ni lisibles ni
 * modifiables. Une sous-clé distincte est dérivée par usage (`purpose`), pour
 * qu'un cookie ne puisse jamais être rejoué dans un autre contexte.
 */
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SealedCookieError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SealedCookieError";
  }
}

function subkey(secret: string, purpose: string): Buffer {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new SealedCookieError(
      "AUTH_SECRET_TOO_SHORT",
      "Le secret de session doit faire au moins 32 octets.",
    );
  }
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(secret, "utf8"), Buffer.alloc(0), `probant:${purpose}`, 32),
  );
}

export function seal(payload: unknown, secret: string, purpose: string): string {
  const key = subkey(secret, purpose);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`${VERSION}:${purpose}`, "utf8"));
  const body = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    body.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function unseal(value: string, secret: string, purpose: string): unknown {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SealedCookieError("SEALED_COOKIE_MALFORMED", "Cookie scellé illisible.");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const body = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SealedCookieError("SEALED_COOKIE_MALFORMED", "Cookie scellé illisible.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", subkey(secret, purpose), iv);
    decipher.setAAD(Buffer.from(`${VERSION}:${purpose}`, "utf8"));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]);
    return JSON.parse(plain.toString("utf8"));
  } catch (error) {
    if (error instanceof SealedCookieError) throw error;
    throw new SealedCookieError("SEALED_COOKIE_INVALID", "Cookie scellé invalide.");
  }
}

/** Comparaison à durée constante de deux valeurs textuelles (state, CSRF). */
export function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
