/**
 * Garde d'une consignation de relecture personnelle nommée (`rule-review.ts`) : un bloc recopié d'une fiche sans y mettre son nom ni l'heure
 * réelle n'est pas une relecture. Une consignation refusée compte comme absente : la règle reste à revoir, la juridiction reste fermée, et
 * l'écran dit pourquoi. Le garde ne juge pas la relecture elle-même ; il refuse seulement ce qui ne peut pas en être une.
 *
 * Conventions internes, pas des exigences IFRS :
 * - nom : non vide, différent des noms d'exemple des fiches ;
 * - heure : ISO 8601 en UTC au format `AAAA-MM-JJTHH:MM:SS.sssZ`, date réelle, différente des heures d'exemple des fiches ;
 * - heure ni antérieure à la création de la fiche qui définit la relecture, ni postérieure à l'instant présent.
 */
export const REVIEW_TEMPLATE_NAMES = ["Prénom Nom", "Ton nom", "Ton prénom et nom"] as const;
/** Heures d'exemple des blocs à recopier : FICHE_RELECTURE_UE.md, REVUE_REGLE_IFRS16.md, FICHE_RELECTURE_UTILISATEUR.md (épinglées par test). */
export const REVIEW_TEMPLATE_TIMES = ["2026-11-02T00:00:00.000Z", "2026-11-02T10:00:00.000Z", "2026-11-03T10:00:00.000Z"] as const;

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const normalize = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

export function reviewRecordIssues(record: { reviewedBy: string; reviewedAt: string }, bounds: { notBefore: string; now?: Date }): string[] {
  const issues: string[] = [];
  const name = normalize(record.reviewedBy ?? "");
  if (!name) issues.push("nom de la personne qui relit absent");
  else if (REVIEW_TEMPLATE_NAMES.some(t => normalize(t) === name)) issues.push(`nom d'exemple de la fiche (« ${record.reviewedBy.trim()} ») au lieu du nom de la personne qui relit`);
  const at = record.reviewedAt ?? "", time = Date.parse(at);
  if (!ISO_UTC.test(at) || Number.isNaN(time) || new Date(time).toISOString() !== at) issues.push(`heure « ${at} » hors du format AAAA-MM-JJTHH:MM:SS.000Z (UTC) ou date inexistante`);
  else if ((REVIEW_TEMPLATE_TIMES as readonly string[]).includes(at)) issues.push(`heure d'exemple de la fiche (${at}) au lieu de l'heure réelle de la relecture`);
  else if (time < Date.parse(bounds.notBefore)) issues.push(`heure (${at}) antérieure à la fiche de relecture (${bounds.notBefore})`);
  else if (time > (bounds.now ?? new Date()).getTime()) issues.push(`heure (${at}) dans le futur`);
  return issues;
}
