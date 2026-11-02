import x from "./depot.module.css";

/**
 * Valeur absente de l'écran Dépôt : un tiret long suivi d'un libellé explicite (« montant inconnu », « non
 * renseigné »). Un montant ou un compte absent n'est jamais affiché comme zéro.
 */
export function Unknown({ label }: { label: string }) {
  return (
    <span className={x.unknown}>
      <span aria-hidden="true">—</span>{" "}
      <span className={x.unknownLabel}>{label}</span>
    </span>
  );
}

/** Montant en euros tel que le lit le parseur, arrondi à l'unité pour l'affichage ; inconnu s'il n'est pas un nombre fini. */
export function Euro({ value, unknownLabel = "montant inconnu" }: { value: number | null | undefined; unknownLabel?: string }) {
  if (typeof value !== "number" || !Number.isFinite(value)) return <Unknown label={unknownLabel} />;
  return <>{`${value.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`}</>;
}
