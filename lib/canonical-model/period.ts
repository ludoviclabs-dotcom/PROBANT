/** Shared accounting context; TaxPeriod remains its existing specialized model. */
export interface AccountingPeriod {
  startDate: string;
  closingDate: string;
  asOfDate: string;
  currency: "EUR";
  comparative?: { startDate: string; closingDate: string };
  validation: "provisional" | "confirmed";
}

export function isCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function periodIssues(period?: AccountingPeriod): string[] {
  if (!period) return ["Période absente : début, clôture et date de revue requis."];
  const issues: string[] = [];
  for (const key of ["startDate", "closingDate", "asOfDate"] as const) {
    if (!isCivilDate(period[key])) issues.push(`Date civile absente ou invalide : ${key}.`);
  }
  if (!issues.length && (period.startDate > period.closingDate || period.closingDate > period.asOfDate)) issues.push("Ordre requis : début ≤ clôture ≤ revue.");
  if (period.currency !== "EUR") issues.push("Devise non prise en charge sans conversion documentée.");
  if (period.validation !== "provisional" && period.validation !== "confirmed") issues.push("Statut de période invalide.");
  if (period.comparative && (!isCivilDate(period.comparative.startDate) || !isCivilDate(period.comparative.closingDate) || period.comparative.startDate > period.comparative.closingDate || period.comparative.closingDate >= period.startDate)) issues.push("Période comparative invalide ou chevauchante.");
  return issues;
}
