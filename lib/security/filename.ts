/**
 * Neutralisation d'un nom de fichier déposé.
 *
 * Le nom fourni par le navigateur n'est jamais utilisé pour construire une clé
 * de stockage (celle-ci est générée côté serveur, cf. ADR-002), mais il est
 * persisté et réaffiché : il doit donc être inoffensif en base, dans un log,
 * dans un `Content-Disposition` et dans un export HTML.
 *
 * Neutralisés : séparateurs de chemin, traversées `..`, caractères de contrôle,
 * marques de direction bidirectionnelle (attaque « fichier.txt » affiché à
 * l'envers), noms réservés Windows, extensions multiples trompeuses.
 */
const MAX_BASE_LENGTH = 100;
const MAX_EXTENSION_LENGTH = 12;

/** Caractères de contrôle, séparateurs et surcharges bidirectionnelles Unicode. */
const DANGEROUS =
  /[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069/\\:*?"<>|]/gu;

const WINDOWS_RESERVED = new Set([
  "con", "prn", "aux", "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

export function neutralizeFileName(input: string): string {
  // On ne garde que le dernier segment : `../../etc/passwd` devient `passwd`.
  const lastSegment = input.split(/[/\\]/u).pop() ?? "";
  const normalized = lastSegment.normalize("NFC").replace(DANGEROUS, "_");

  const dot = normalized.lastIndexOf(".");
  const rawBase = dot > 0 ? normalized.slice(0, dot) : normalized;
  const rawExtension = dot > 0 ? normalized.slice(dot + 1) : "";

  let base = rawBase
    .replace(/\s+/gu, " ")
    .replace(/^[.\s]+|[.\s]+$/gu, "")
    .slice(0, MAX_BASE_LENGTH);
  const extension = rawExtension
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, "")
    .slice(0, MAX_EXTENSION_LENGTH);

  if (base.length === 0) base = "document";
  if (WINDOWS_RESERVED.has(base.toLowerCase())) base = `_${base}`;

  return extension ? `${base}.${extension}` : base;
}

/** Extension effective après neutralisation — seule source pour l'allowlist. */
export function extensionOf(fileName: string): string {
  const neutralized = neutralizeFileName(fileName);
  const dot = neutralized.lastIndexOf(".");
  return dot > 0 ? neutralized.slice(dot + 1) : "";
}
