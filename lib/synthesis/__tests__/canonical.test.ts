/**
 * Conformité de la sérialisation canonique et du SHA-256 pur.
 *
 * Le SHA-256 maison n'a le droit d'exister que s'il est indistinguable de
 * l'implémentation de référence : on le confronte à `node:crypto` sur un
 * corpus de vecteurs, dont les vecteurs officiels FIPS et des chaînes
 * multi-octets UTF-8.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex, stableHash } from "@/lib/synthesis/canonical";

describe("sha256Hex — conformité à node:crypto", () => {
  const vectors = [
    "",
    "abc",
    "The quick brown fox jumps over the lazy dog",
    "écritures comptables — été 2026 €",
    "𝕌nicode hors BMP 🧾",
    "a".repeat(55), // frontière de padding (un bloc)
    "a".repeat(56), // bascule sur deux blocs
    "a".repeat(64),
    "a".repeat(1000),
    JSON.stringify({ nested: { deep: [1, 2, 3] } }),
  ];

  it.each(vectors.map((v) => [v.slice(0, 24), v]))(
    "vecteur %s",
    (_label, input) => {
      const reference = createHash("sha256").update(input, "utf8").digest("hex");
      expect(sha256Hex(input)).toBe(reference);
    },
  );

  it("vecteur FIPS abc", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("canonicalJson", () => {
  it("trie les clés récursivement — l'ordre d'insertion est indifférent", () => {
    const a = { b: 1, a: { z: true, y: [{ n: 1, m: 2 }] } };
    const b = { a: { y: [{ m: 2, n: 1 }], z: true }, b: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("omet les valeurs undefined d'objets", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("refuse NaN et Infinity plutôt que de produire null", () => {
    expect(() => canonicalJson({ x: NaN })).toThrow();
    expect(() => canonicalJson({ x: Infinity })).toThrow();
  });

  it("stableHash : même objet, ordres de clés différents ⇒ même hash", () => {
    expect(stableHash({ x: 1, y: 2 })).toBe(stableHash({ y: 2, x: 1 }));
  });
});
