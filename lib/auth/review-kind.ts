/**
 * Type de relecture — mission C07.
 *
 * Axe distinct du profil d'exécution et du type de dossier. Il est décidé par
 * le serveur à partir de l'identité authentifiée, jamais d'une étiquette
 * envoyée par le navigateur :
 *
 * - `distinct_identity` : relecture par une identité authentifiée différente
 *   du préparateur (règle historique `SELF_APPROVAL_FORBIDDEN`). Ce n'est pas
 *   une attestation d'indépendance professionnelle ;
 * - `personal` : relecture personnelle nommée du profil local solo — la même
 *   personne relit son propre travail, sous son nom. Jamais présentée comme
 *   une relecture par une autre personne ;
 * - `simulated_second_identity` : seconde identité synthétique du profil local,
 *   ouverte seulement sur demande ; toute décision qu'elle porte reste une
 *   simulation.
 *
 * Module sans dépendance Node : les écrans l'importent pour leurs libellés.
 */
export const REVIEW_KINDS = ["distinct_identity", "personal", "simulated_second_identity"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const REVIEW_KIND_LABELS: Record<ReviewKind, string> = {
  distinct_identity: "Relecture par une autre identité",
  personal: "Relecture personnelle nommée",
  simulated_second_identity: "Simulation de seconde identité",
};

export const REVIEW_KIND_NOTICES: Record<ReviewKind, string> = {
  distinct_identity: "Le relecteur authentifié est distinct du préparateur ; ce n'est pas une attestation d'indépendance professionnelle.",
  personal: "Profil local solo : vous relisez votre propre travail. La relecture est enregistrée à votre nom comme relecture personnelle, pas comme une revue par une autre personne.",
  simulated_second_identity: "Seconde identité synthétique : chaque décision qu'elle enregistre reste une simulation et ne vaut pas relecture.",
};

/** Une relecture par le préparateur lui-même n'est admise que pour la relecture personnelle nommée. */
export function mayReviewOwnWork(kind: ReviewKind | undefined): boolean {
  return kind === "personal";
}

/** Peut-on relire cette feuille ? Même règle que le serveur (`assertTransition`) ; le serveur reste seul juge. */
export function canReviewRun(view: { actorId: string; permissions: readonly string[]; reviewKind?: ReviewKind } | null | undefined, preparedBy: string | undefined): boolean {
  if (!view?.permissions.includes("review") || !preparedBy) return false;
  return view.actorId !== preparedBy || mayReviewOwnWork(view.reviewKind);
}

export interface ApprovalLike { actorId: string; at: string; kind?: ReviewKind; reviewerName?: string }

/** Libellé d'une approbation enregistrée ; une approbation antérieure à C07 est une relecture par une autre identité. */
export function approvalLabel(approval: ApprovalLike): string {
  const kind = approval.kind ?? "distinct_identity";
  const who = kind === "personal" && approval.reviewerName ? approval.reviewerName + " (" + approval.actorId + ")" : approval.actorId;
  return REVIEW_KIND_LABELS[kind] + " · " + who + " · " + new Date(approval.at).toLocaleString("fr-FR");
}

/** Auteur d'une décision de revue dans les synthèses et exports : identité, et type de relecture quand il est enregistré. */
export function reviewAuthor(review: { actorId: string; kind?: ReviewKind; reviewerName?: string }): string {
  if (!review.kind) return review.actorId;
  return REVIEW_KIND_LABELS[review.kind] + " — " + (review.reviewerName ? review.reviewerName + " (" + review.actorId + ")" : review.actorId);
}
