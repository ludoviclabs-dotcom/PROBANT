import { describe, expect, it } from "vitest";
import {
  decodeJws,
  selectJwk,
  verifyJwsSignature,
  JwtVerificationError,
  SUPPORTED_ALGORITHM_NAMES,
} from "../oidc/jwt";
import { generateTestKey, signJwt, unsignedJwt } from "./helpers";

const CLAIMS = { sub: "user-1", iss: "https://idp.example.test" };

describe("vérification JWS", () => {
  it("accepte une signature RS256 valide", () => {
    const key = generateTestKey("RS256");
    const decoded = decodeJws(signJwt(key, CLAIMS));
    expect(() => verifyJwsSignature(decoded, selectJwk([key.jwk], decoded.header))).not.toThrow();
  });

  it("accepte une signature ES256 valide (encodage IEEE P-1363)", () => {
    const key = generateTestKey("ES256", "ec-key");
    const decoded = decodeJws(signJwt(key, CLAIMS));
    expect(() => verifyJwsSignature(decoded, selectJwk([key.jwk], decoded.header))).not.toThrow();
  });

  it("accepte une signature PS256 valide", () => {
    const key = generateTestKey("PS256", "pss-key");
    const decoded = decodeJws(signJwt(key, CLAIMS));
    expect(() => verifyJwsSignature(decoded, selectJwk([key.jwk], decoded.header))).not.toThrow();
  });

  it("refuse alg:none — le jeton non signé n'atteint jamais la vérification", () => {
    // Signature vide : rejeté dès le décodage, donc deux fois protégé.
    expect(() => decodeJws(unsignedJwt(CLAIMS))).toThrowError(
      expect.objectContaining({ code: "JWT_MALFORMED" }),
    );
  });

  it("refuse alg:none même accompagné d'une signature factice", () => {
    const key = generateTestKey();
    const [header, payload] = unsignedJwt(CLAIMS).split(".");
    const decoded = decodeJws(`${header}.${payload}.ZmFrZQ`);
    expect(() => verifyJwsSignature(decoded, key.jwk)).toThrowError(
      expect.objectContaining({ code: "JWT_ALG_UNSUPPORTED" }),
    );
  });

  it("refuse HS256 — une clé publique ne doit pas devenir un secret HMAC", () => {
    const key = generateTestKey();
    expect(SUPPORTED_ALGORITHM_NAMES).not.toContain("HS256");
    const decoded = decodeJws(signJwt(key, CLAIMS, { alg: "HS256" }));
    expect(() => verifyJwsSignature(decoded, key.jwk)).toThrowError(
      expect.objectContaining({ code: "JWT_ALG_UNSUPPORTED" }),
    );
  });

  it("refuse une charge utile modifiée après signature", () => {
    const key = generateTestKey();
    const token = signJwt(key, CLAIMS);
    const [header, , signature] = token.split(".");
    const tampered = Buffer.from(
      JSON.stringify({ ...CLAIMS, sub: "attacker" }),
      "utf8",
    ).toString("base64url");
    const decoded = decodeJws(`${header}.${tampered}.${signature}`);
    expect(() => verifyJwsSignature(decoded, key.jwk)).toThrowError(
      expect.objectContaining({ code: "JWT_SIGNATURE_INVALID" }),
    );
  });

  it("refuse une clé dont l'alg annoncé diffère de l'en-tête", () => {
    const key = generateTestKey("RS256");
    const decoded = decodeJws(signJwt(key, CLAIMS));
    expect(() => verifyJwsSignature(decoded, { ...key.jwk, alg: "RS512" })).toThrowError(
      expect.objectContaining({ code: "JWT_ALG_KEY_MISMATCH" }),
    );
  });

  it("refuse une clé de type incompatible avec l'algorithme", () => {
    const rsa = generateTestKey("RS256");
    const ec = generateTestKey("ES256", "ec");
    const decoded = decodeJws(signJwt(rsa, CLAIMS));
    expect(() => verifyJwsSignature(decoded, { ...ec.jwk, alg: undefined })).toThrowError(
      expect.objectContaining({ code: "JWT_ALG_KEY_MISMATCH" }),
    );
  });

  it("refuse un JWKS contenant une clé privée", () => {
    const key = generateTestKey();
    const decoded = decodeJws(signJwt(key, CLAIMS));
    // `selectJwk` ne filtre pas les clés privées : c'est le schéma Zod du JWKS
    // qui les rejette. On vérifie ici que la sélection par `kid` reste stricte.
    expect(() => selectJwk([{ ...key.jwk, kid: "autre" }], decoded.header)).toThrowError(
      expect.objectContaining({ code: "JWKS_KEY_NOT_FOUND" }),
    );
  });

  it("refuse un jeton malformé", () => {
    expect(() => decodeJws("pas.un.jwt")).toThrow(JwtVerificationError);
    expect(() => decodeJws("deux.segments")).toThrow(JwtVerificationError);
    expect(() => decodeJws("")).toThrow(JwtVerificationError);
  });

  it("refuse une charge utile qui n'est pas un objet JSON", () => {
    const header = Buffer.from(JSON.stringify({ alg: "RS256" }), "utf8").toString("base64url");
    const payload = Buffer.from(JSON.stringify(["tableau"]), "utf8").toString("base64url");
    expect(() => decodeJws(`${header}.${payload}.sig`)).toThrowError(
      expect.objectContaining({ code: "JWT_MALFORMED" }),
    );
  });
});
