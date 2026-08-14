/**
 * Contrôle du contenu réel d'un fichier déposé.
 *
 * L'extension et le type MIME sont déclarés par le client : ils indiquent une
 * intention, pas un contenu. Ce module regarde les premiers octets — la seule
 * information que l'émetteur ne peut pas mentir sans changer le fichier.
 *
 * L'upload étant direct vers le stockage objet, ce contrôle a lieu côté worker
 * à l'ouverture du flux, pas à la signature de l'URL.
 */
export type ContentSignature = "zip" | "pdf" | "ole-compound" | "text" | "unknown";

export interface SignatureExpectation {
  readonly documentType: "fec" | "balance" | "pdf" | "cycle_document";
  readonly allowed: readonly ContentSignature[];
}

const SIGNATURES: readonly { signature: Exclude<ContentSignature, "text" | "unknown">; bytes: readonly number[] }[] = [
  // XLSX est un conteneur ZIP ; DOCX/ODS aussi — la distinction fine relève du parseur.
  { signature: "zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { signature: "zip", bytes: [0x50, 0x4b, 0x05, 0x06] },
  { signature: "zip", bytes: [0x50, 0x4b, 0x07, 0x08] },
  { signature: "pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  // `.xls` binaire historique (OLE2) — refusé par ADR-003.
  { signature: "ole-compound", bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
];

/** Nombre d'octets suffisant pour toutes les signatures reconnues. */
export const MAGIC_BYTE_WINDOW = 16;

export function detectSignature(head: Uint8Array): ContentSignature {
  for (const candidate of SIGNATURES) {
    if (candidate.bytes.every((byte, index) => head[index] === byte)) {
      return candidate.signature;
    }
  }
  return looksLikeText(head) ? "text" : "unknown";
}

/**
 * Heuristique « texte » volontairement stricte.
 *
 * Un FEC est du texte délimité : aucun octet nul, et pas d'octet de contrôle
 * autre que tabulation, retour chariot et saut de ligne. Un binaire déguisé en
 * `.txt` échoue donc ici, avant d'atteindre le parseur.
 */
export function looksLikeText(head: Uint8Array): boolean {
  if (head.length === 0) return false;
  let offset = 0;
  // BOM UTF-8 toléré : plusieurs exports comptables l'écrivent.
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) offset = 3;
  for (let index = offset; index < head.length; index += 1) {
    const byte = head[index];
    if (byte === 0x00) return false;
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) return false;
  }
  return true;
}

export const ALLOWED_SIGNATURES: Readonly<
  Record<SignatureExpectation["documentType"], readonly ContentSignature[]>
> = {
  fec: ["text"],
  balance: ["zip", "text"],
  pdf: ["pdf"],
  cycle_document: ["zip", "pdf", "text"],
};

export class ContentSignatureError extends Error {
  constructor(
    readonly code: "CONTENT_SIGNATURE_MISMATCH",
    readonly observed: ContentSignature,
    readonly documentType: SignatureExpectation["documentType"],
  ) {
    super(`CONTENT_SIGNATURE_MISMATCH:${documentType}:${observed}`);
    this.name = "ContentSignatureError";
  }
}

export function assertSignatureAllowed(
  head: Uint8Array,
  documentType: SignatureExpectation["documentType"],
): ContentSignature {
  const observed = detectSignature(head);
  if (!ALLOWED_SIGNATURES[documentType].includes(observed)) {
    throw new ContentSignatureError("CONTENT_SIGNATURE_MISMATCH", observed, documentType);
  }
  return observed;
}

/**
 * Lit les premiers octets d'un flux sans les consommer.
 *
 * Retourne l'en-tête **et** un flux reconstitué, pour que le parseur reçoive
 * le fichier complet : le contrôle ne doit rien coûter au traitement normal.
 */
export async function peekHead(
  stream: ReadableStream<Uint8Array>,
  byteCount = MAGIC_BYTE_WINDOW,
): Promise<{ head: Uint8Array; stream: ReadableStream<Uint8Array> }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let collected = 0;
  while (collected < byteCount) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value && value.length > 0) {
      chunks.push(value);
      collected += value.length;
    }
  }
  reader.releaseLock();

  const head = new Uint8Array(Math.min(collected, byteCount));
  let offset = 0;
  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length && offset < head.length; index += 1) {
      head[offset] = chunk[index];
      offset += 1;
    }
    if (offset >= head.length) break;
  }

  // `pull` et non `start` : rejouer le flux ne doit pas le matérialiser en
  // mémoire — c'est précisément ce que PR-03 a supprimé du pipeline FEC.
  let replayIndex = 0;
  let rest: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const replayed = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (replayIndex < chunks.length) {
        controller.enqueue(chunks[replayIndex]);
        replayIndex += 1;
        return;
      }
      rest ??= stream.getReader();
      const { value, done } = await rest.read();
      if (done) {
        controller.close();
        return;
      }
      if (value) controller.enqueue(value);
    },
    async cancel(reason) {
      await (rest ?? stream.getReader()).cancel(reason);
    },
  });

  return { head, stream: replayed };
}
