/**
 * Période d'un exercice pour le ruban de contexte : « 01/01 → 31/12/2024 » quand les deux dates sont dans la
 * même année (l'année n'est écrite qu'une fois), « 01/07/2023 → 30/06/2024 » sinon. Dates ISO (AAAA-MM-JJ) ou
 * compactes (AAAAMMJJ) ; une date illisible est restituée telle quelle, jamais corrigée.
 */

function parts(date: string): { y: string; m: string; d: string } | null {
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(date.trim());
  return match ? { y: match[1], m: match[2], d: match[3] } : null;
}

export function formatPeriod(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  if (!a || !b) return `${start} → ${end}`;
  return a.y === b.y ? `${a.d}/${a.m} → ${b.d}/${b.m}/${b.y}` : `${a.d}/${a.m}/${a.y} → ${b.d}/${b.m}/${b.y}`;
}

/**
 * Quand seule la date de clôture est connue (aucune date de début), le ruban l'écrit telle quelle — « clôture
 * 31/12/2024 » — sans reconstituer un début d'exercice. Une date absente ou illisible donne null.
 */
export function formatClosing(closing: string | null | undefined): string | null {
  if (!closing) return null;
  const c = parts(closing);
  return c ? `clôture ${c.d}/${c.m}/${c.y}` : null;
}
