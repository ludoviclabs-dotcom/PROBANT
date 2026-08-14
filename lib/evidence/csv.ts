function csvCell(value: unknown): string {
  const text = value == null ? "" : Array.isArray(value) ? value.join("|") : String(value);
  // Les commentaires, noms de fichiers et identifiants sont des données non fiables.
  // Le préfixe texte empêche leur interprétation comme formule par un tableur.
  const safeText = /^\s*[=+@-]/u.test(text) ? `'${text}` : text;
  return /[",\r\n;]/u.test(safeText) ? `"${safeText.replace(/"/gu, '""')}"` : safeText;
}

/** CSV RFC 4180, séparateur virgule, fins de ligne CRLF, ordre explicite. */
export function buildCsv(
  columns: string[],
  rows: Array<Record<string, unknown>>,
): string {
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\r\n") + "\r\n";
}
