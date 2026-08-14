/**
 * Sérialisation canonique et hash stable du moteur de Synthèse.
 *
 * Objectif : `mêmes données ⇒ même hash`, y compris quand l'ordre d'arrivée
 * des tableaux d'entrée diffère (le moteur trie AVANT de sérialiser — voir
 * engine.ts) et quel que soit l'ordre d'insertion des clés d'objets (la
 * sérialisation trie les clés récursivement).
 *
 * Le hash est un SHA-256 implémenté en TypeScript pur : le moteur doit
 * pouvoir tourner côté client (la page Synthèse construit le snapshot depuis
 * le dossier actif en sessionStorage) comme côté serveur et dans les tests —
 * sans dépendre de `node:crypto` ni du contexte sécurisé exigé par WebCrypto.
 * Un test de conformité compare cette implémentation à `node:crypto` sur un
 * corpus de vecteurs (voir __tests__/canonical.test.ts).
 */

/**
 * JSON canonique : clés d'objets triées récursivement, `undefined` omis,
 * aucun espace. Refuse NaN/Infinity (non représentables en JSON) plutôt que
 * de produire `null` en silence.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error(`canonicalJson : nombre non fini (${value})`);
      }
      return JSON.stringify(value);
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "undefined":
      throw new Error("canonicalJson : undefined à la racine");
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((v) => (v === undefined ? "null" : serialize(v))).join(",")}]`;
      }
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${serialize(v)}`).join(",")}}`;
    }
    default:
      throw new Error(`canonicalJson : type non sérialisable (${typeof value})`);
  }
}

/* ── SHA-256 (implémentation pure, FIPS 180-4) ────────────────────────────── */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** SHA-256 hexadécimal d'une chaîne UTF-8. */
export function sha256Hex(text: string): string {
  const data = utf8Bytes(text);
  const bitLen = data.length * 8;

  // Padding : 0x80, zéros, longueur sur 64 bits big-endian.
  const paddedLen = (((data.length + 8) >> 6) + 1) << 6;
  const bytes = new Uint8Array(paddedLen);
  bytes.set(data);
  bytes[data.length] = 0x80;
  const dv = new DataView(bytes.buffer);
  dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(paddedLen - 4, bitLen >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
}

/** Hash stable d'une valeur : SHA-256 de son JSON canonique. */
export function stableHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
