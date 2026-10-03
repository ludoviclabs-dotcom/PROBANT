import { Lock, Scale, Zap } from "lucide-react";

const ITEMS = [
  {
    icon: Lock,
    title: "Traitement selon le format",
    description: "CSV/XLSX/PDF lus dans le navigateur ; FEC transmis au stockage durable dans un dossier persistant autorisé.",
  },
  {
    icon: Zap,
    title: "Résultat après validation",
    description:
      "Un format illisible reste bloqué ou à revoir. Un dépôt ne garantit aucune conclusion.",
  },
  {
    icon: Scale,
    title: "LPF art. A.47 A-1",
    description: "Contrôles du format FEC à l’entrée ; leurs résultats restent soumis à la revue des données et des sources.",
  },
] as const;

export function ReassuranceBar() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {ITEMS.map(({ icon: Icon, title, description }) => (
        <div
          key={title}
          className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-3"
        >
          <Icon className="h-5 w-5 text-[var(--pb-accent)]" />
          <p className="mt-2 text-[13px] font-semibold text-[var(--pb-text)]">{title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--pb-text-muted)]">
            {description}
          </p>
        </div>
      ))}
    </div>
  );
}
