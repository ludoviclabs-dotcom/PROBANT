import {
  constants as cryptoConstants,
  createPublicKey,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";
import { z } from "zod";

/**
 * Vérification JWS compacte pour les jetons d'identité OIDC.
 *
 * Seules des signatures asymétriques sont acceptées : `none` et les familles
 * HMAC sont refusées explicitement, pour qu'aucune confusion d'algorithme ne
 * puisse transformer une clé publique en secret de vérification.
 */
const SUPPORTED_ALGORITHMS = {
  RS256: { hash: "sha256", kty: "RSA" },
  RS384: { hash: "sha384", kty: "RSA" },
  RS512: { hash: "sha512", kty: "RSA" },
  PS256: { hash: "sha256", kty: "RSA", pss: true },
  PS384: { hash: "sha384", kty: "RSA", pss: true },
  PS512: { hash: "sha512", kty: "RSA", pss: true },
  ES256: { hash: "sha256", kty: "EC" },
  ES384: { hash: "sha384", kty: "EC" },
  ES512: { hash: "sha512", kty: "EC" },
} as const satisfies Record<string, { hash: string; kty: "RSA" | "EC"; pss?: true }>;

export type SupportedAlgorithm = keyof typeof SUPPORTED_ALGORITHMS;

export const SUPPORTED_ALGORITHM_NAMES = Object.keys(
  SUPPORTED_ALGORITHMS,
) as SupportedAlgorithm[];

export class JwtVerificationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "JwtVerificationError";
  }
}

const headerSchema = z.object({
  alg: z.string(),
  kid: z.string().optional(),
  typ: z.string().optional(),
});

/** JWK public minimal — la présence de `d` révèlerait une clé privée. */
export const jsonWebKeySchema = z
  .object({
    kty: z.string(),
    kid: z.string().optional(),
    alg: z.string().optional(),
    use: z.string().optional(),
    n: z.string().optional(),
    e: z.string().optional(),
    crv: z.string().optional(),
    x: z.string().optional(),
    y: z.string().optional(),
  })
  .passthrough()
  .refine((jwk) => !("d" in jwk), { message: "PRIVATE_KEY_IN_JWKS" });

export type JsonWebKey = z.infer<typeof jsonWebKeySchema>;

export const jsonWebKeySetSchema = z.object({ keys: z.array(jsonWebKeySchema) });

export interface DecodedJws {
  readonly header: z.infer<typeof headerSchema>;
  readonly payload: Record<string, unknown>;
  readonly signingInput: string;
  readonly signature: Buffer;
}

function decodeSegment(segment: string, part: string): unknown {
  let json: string;
  try {
    json = Buffer.from(segment, "base64url").toString("utf8");
  } catch {
    throw new JwtVerificationError("JWT_MALFORMED", `Segment ${part} illisible.`);
  }
  try {
    return JSON.parse(json);
  } catch {
    throw new JwtVerificationError("JWT_MALFORMED", `Segment ${part} non JSON.`);
  }
}

export function decodeJws(token: string): DecodedJws {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new JwtVerificationError("JWT_MALFORMED", "Jeton JWS malformé.");
  }
  const header = headerSchema.safeParse(decodeSegment(parts[0], "header"));
  if (!header.success) {
    throw new JwtVerificationError("JWT_MALFORMED", "En-tête JWS invalide.");
  }
  const payload = decodeSegment(parts[1], "payload");
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new JwtVerificationError("JWT_MALFORMED", "Charge utile JWS invalide.");
  }
  return {
    header: header.data,
    payload: payload as Record<string, unknown>,
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: Buffer.from(parts[2], "base64url"),
  };
}

function publicKeyFrom(jwk: JsonWebKey): KeyObject {
  try {
    return createPublicKey({ key: jwk as Record<string, unknown>, format: "jwk" });
  } catch {
    throw new JwtVerificationError("JWKS_KEY_INVALID", "Clé JWKS inexploitable.");
  }
}

export function verifyJwsSignature(decoded: DecodedJws, jwk: JsonWebKey): void {
  const algorithm = decoded.header.alg as SupportedAlgorithm;
  const spec = SUPPORTED_ALGORITHMS[algorithm];
  if (!spec) {
    throw new JwtVerificationError(
      "JWT_ALG_UNSUPPORTED",
      `Algorithme de signature refusé : ${decoded.header.alg}.`,
    );
  }
  if (jwk.kty !== spec.kty) {
    throw new JwtVerificationError("JWT_ALG_KEY_MISMATCH", "Type de clé incompatible.");
  }
  // Une clé annotée `alg` ne doit pas servir à un autre algorithme.
  if (jwk.alg && jwk.alg !== algorithm) {
    throw new JwtVerificationError("JWT_ALG_KEY_MISMATCH", "Algorithme de clé incompatible.");
  }

  const key = publicKeyFrom(jwk);
  const options =
    spec.kty === "EC"
      ? // JWS encode (r‖s) brut ; Node attend du DER sans cette option.
        { key, dsaEncoding: "ieee-p1363" as const }
      : "pss" in spec && spec.pss
        ? {
            key,
            padding: cryptoConstants.RSA_PKCS1_PSS_PADDING,
            saltLength: cryptoConstants.RSA_PSS_SALTLEN_DIGEST,
          }
        : { key, padding: cryptoConstants.RSA_PKCS1_PADDING };

  const valid = verifySignature(
    spec.hash,
    Buffer.from(decoded.signingInput, "utf8"),
    options,
    decoded.signature,
  );
  if (!valid) {
    throw new JwtVerificationError("JWT_SIGNATURE_INVALID", "Signature du jeton invalide.");
  }
}

export function selectJwk(keys: readonly JsonWebKey[], header: DecodedJws["header"]): JsonWebKey {
  const usable = keys.filter((key) => !key.use || key.use === "sig");
  const candidates = header.kid
    ? usable.filter((key) => key.kid === header.kid)
    : usable.filter((key) => !key.alg || key.alg === header.alg);
  if (candidates.length === 0) {
    throw new JwtVerificationError("JWKS_KEY_NOT_FOUND", "Aucune clé JWKS ne correspond.");
  }
  return candidates[0];
}
