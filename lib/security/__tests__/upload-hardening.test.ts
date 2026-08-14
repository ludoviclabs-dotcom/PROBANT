import { describe, expect, it } from "vitest";
import { extensionOf, neutralizeFileName } from "../filename";
import {
  ContentSignatureError,
  assertSignatureAllowed,
  detectSignature,
  looksLikeText,
  peekHead,
} from "../magic-bytes";

describe("neutralisation du nom de fichier", () => {
  it("supprime toute traversée de chemin", () => {
    expect(neutralizeFileName("../../etc/passwd")).toBe("passwd");
    expect(neutralizeFileName("..\\..\\windows\\system32\\config")).toBe("config");
    expect(neutralizeFileName("/absolu/fec.txt")).toBe("fec.txt");
  });

  it("neutralise les marques bidirectionnelles qui déguisent l'extension", () => {
    // « fec‮txt.exe » s'affiche « fec exe.txt » dans une liste de fichiers.
    const trompeur = "fec‮txt.exe";
    expect(neutralizeFileName(trompeur)).not.toContain("‮");
    expect(extensionOf(trompeur)).toBe("exe");
  });

  it("supprime les caractères de contrôle et les séparateurs", () => {
    const hostile = "fec" + String.fromCharCode(0, 31) + '/\\:*?"<>|' + "‮.txt";
    const neutralized = neutralizeFileName(hostile);
    // Aucun caractère dangereux ne subsiste, et l'extension reste lisible.
    expect(neutralized).not.toMatch(
      /[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069\/\\:*?"<>|]/u,
    );
    expect(neutralized.endsWith(".txt")).toBe(true);
  });

  it("préfixe les noms réservés Windows", () => {
    expect(neutralizeFileName("CON.txt")).toBe("_CON.txt");
    expect(neutralizeFileName("lpt1")).toBe("_lpt1");
  });

  it("borne la longueur sans perdre l'extension", () => {
    const long = `${"a".repeat(400)}.txt`;
    const neutralized = neutralizeFileName(long);
    expect(neutralized.endsWith(".txt")).toBe(true);
    expect(neutralized.length).toBeLessThanOrEqual(104);
  });

  it("produit toujours un nom exploitable", () => {
    expect(neutralizeFileName("")).toBe("document");
    expect(neutralizeFileName("...")).toBe("document");
    expect(neutralizeFileName("   ")).toBe("document");
  });

  it("est idempotente", () => {
    const once = neutralizeFileName("../FEC 2025:‮final.TXT");
    expect(neutralizeFileName(once)).toBe(once);
  });
});

describe("signature de contenu", () => {
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const texte = new TextEncoder().encode("JournalCode|JournalLib|EcritureNum\n");
  const executable = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

  it("reconnaît les conteneurs connus", () => {
    expect(detectSignature(zip)).toBe("zip");
    expect(detectSignature(pdf)).toBe("pdf");
    expect(detectSignature(ole)).toBe("ole-compound");
    expect(detectSignature(texte)).toBe("text");
  });

  it("refuse un binaire déguisé en FEC", () => {
    expect(() => assertSignatureAllowed(executable, "fec")).toThrow(ContentSignatureError);
    expect(() => assertSignatureAllowed(zip, "fec")).toThrow(ContentSignatureError);
    expect(() => assertSignatureAllowed(pdf, "fec")).toThrow(ContentSignatureError);
  });

  it("refuse un .xls binaire historique partout", () => {
    for (const type of ["fec", "balance", "pdf", "cycle_document"] as const) {
      expect(() => assertSignatureAllowed(ole, type)).toThrow(ContentSignatureError);
    }
  });

  it("accepte un FEC texte, BOM UTF-8 compris", () => {
    const avecBom = new Uint8Array([0xef, 0xbb, 0xbf, ...texte]);
    expect(assertSignatureAllowed(avecBom, "fec")).toBe("text");
  });

  it("refuse un texte contenant un octet nul", () => {
    expect(looksLikeText(new Uint8Array([0x41, 0x00, 0x42]))).toBe(false);
    expect(looksLikeText(new Uint8Array())).toBe(false);
  });

  it("accepte tabulations, retours chariot et sauts de ligne", () => {
    expect(looksLikeText(new TextEncoder().encode("a\tb\r\nc"))).toBe(true);
  });
});

describe("lecture de l'en-tête sans consommer le flux", () => {
  function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    let index = 0;
    return new ReadableStream({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(chunks[index]);
        index += 1;
      },
    });
  }

  async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const parts: Uint8Array[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) parts.push(value);
    }
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }

  it("restitue l'intégralité des octets au parseur", async () => {
    const original = new TextEncoder().encode(
      "JournalCode|JournalLib|EcritureNum\nVE|Ventes|1\nVE|Ventes|2\n",
    );
    const { head, stream } = await peekHead(
      streamOf([original.slice(0, 5), original.slice(5, 30), original.slice(30)]),
    );
    expect(head).toHaveLength(16);
    expect(detectSignature(head)).toBe("text");
    expect(await drain(stream)).toEqual(original);
  });

  it("supporte un fichier plus court que la fenêtre de lecture", async () => {
    const court = new TextEncoder().encode("ab");
    const { head, stream } = await peekHead(streamOf([court]));
    expect(head).toHaveLength(2);
    expect(await drain(stream)).toEqual(court);
  });

  it("supporte un flux vide", async () => {
    const { head, stream } = await peekHead(streamOf([]));
    expect(head).toHaveLength(0);
    expect(detectSignature(head)).toBe("unknown");
    expect(await drain(stream)).toHaveLength(0);
  });
});
