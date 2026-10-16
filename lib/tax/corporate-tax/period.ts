/**
 * Duree de l'exercice d'IS.
 *
 * Le plafond du taux reduit s'entend « par periode de douze mois » et le chiffre
 * d'affaires est « ramene s'il y a lieu a douze mois » (CGI art. 219, I-b). La
 * doctrine precise l'ajustement prorata temporis d'un exercice plus court
 * (BOI-IS-LIQ-20-20 § 50, BOI-IS-LIQ-20-10 § 70) et le decoupage d'un exercice
 * plus long en deux periodes d'imposition en l'absence de bilan dresse au cours
 * d'une annee civile (CGI art. 37 ; BOI-IS-LIQ-20-20 § 60).
 *
 * Le moteur 1.1.0 ne traite que l'exercice de douze mois exactement : cette
 * fonction le reconnait sans jamais supposer qu'une autre duree s'y ramene.
 */
export type CorporateTaxPeriodLength =
  | "twelve_months"
  | "shorter_than_twelve_months"
  | "longer_than_twelve_months"
  | "invalid";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

function parseUtc(date: string): number | null {
  const match = ISO_DATE.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const parsed = new Date(time);
  // Une date inexistante (31 avril, 29 fevrier hors bissextile) est refusee.
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return time;
}

const DAY_MS = 86_400_000;

/**
 * Un exercice dure douze mois lorsqu'il s'acheve la veille du meme quantieme,
 * douze mois apres son ouverture (01/01 -> 31/12, 01/07 -> 30/06). Un exercice
 * ouvert un 29 fevrier s'acheve le 28 fevrier suivant.
 */
export function corporateTaxPeriodLength(startDate: string, endDate: string): CorporateTaxPeriodLength {
  const start = parseUtc(startDate);
  const end = parseUtc(endDate);
  if (start === null || end === null || end < start) return "invalid";
  const opening = new Date(start);
  const anniversary = Date.UTC(opening.getUTCFullYear() + 1, opening.getUTCMonth(), opening.getUTCDate());
  const twelveMonthsEnd = anniversary - DAY_MS;
  if (end === twelveMonthsEnd) return "twelve_months";
  return end < twelveMonthsEnd ? "shorter_than_twelve_months" : "longer_than_twelve_months";
}
