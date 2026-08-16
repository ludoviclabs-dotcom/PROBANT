import { createHash } from "node:crypto";

/** Empreinte SHA-256 d'un contenu (fichier source, artefact de preuve). */
export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function sha256Stream(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const hash = createHash("sha256");
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return hash.digest("hex");
}

/** Empreinte courte pour affichage. */
export function shortHash(hex: string): string {
  return hex.slice(0, 12);
}

