import x from "./depot.module.css";

const ITEMS = [
  {
    title: "Traitement selon le format",
    description: "CSV/XLSX/PDF lus dans le navigateur ; FEC transmis au stockage durable dans un dossier persistant autorisé.",
  },
  {
    title: "Résultat après validation",
    description: "Un format illisible reste bloqué ou à revoir. Un dépôt ne garantit aucune conclusion.",
  },
  {
    title: "LPF art. A.47 A-1",
    description: "Contrôles du format FEC à l’entrée ; leurs résultats restent soumis à la revue des données et des sources.",
  },
] as const;

/** Conditions de traitement d'un dépôt : trois définitions sous filet, sans icône ni carte. */
export function ReassuranceBar() {
  return (
    <dl className={x.conditions}>
      {ITEMS.map(({ title, description }) => (
        <div key={title}>
          <dt>{title}</dt>
          <dd>{description}</dd>
        </div>
      ))}
    </dl>
  );
}
