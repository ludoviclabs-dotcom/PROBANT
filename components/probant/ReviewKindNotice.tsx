import { REVIEW_KIND_LABELS, REVIEW_KIND_NOTICES, type ReviewKind } from "@/lib/auth/review-kind";

/**
 * Type de relecture de l'identité connectée (C07), tel que décidé par le serveur.
 * Rien n'est affiché pour une relecture par une autre identité : le parcours
 * historique reste inchangé. La relecture personnelle et la simulation sont
 * annoncées avant toute décision.
 */
export function ReviewKindNotice({ kind }: { kind?: ReviewKind }) {
  if (!kind || kind === "distinct_identity") return null;
  return (
    <p role="note" data-review-kind={kind} className="my-2 border-l-2 border-[var(--pb-accent)] pl-3 text-sm leading-relaxed text-[var(--pb-text-muted)]">
      <strong className="text-[var(--pb-text)]">{REVIEW_KIND_LABELS[kind]}.</strong> {REVIEW_KIND_NOTICES[kind]}
    </p>
  );
}
