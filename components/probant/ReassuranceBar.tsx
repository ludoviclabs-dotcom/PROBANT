import { Lock, Scale, Zap } from "lucide-react";

const ITEMS = [
  {
    icon: Lock,
    title: "Traitement local",
    description: "Aucun fichier n'est stocké sur nos serveurs",
  },
  {
    icon: Zap,
    title: "Résultat quasi instantané",
    description:
      "L'empreinte, la validation réglementaire et le moteur de règles s'enchaînent immédiatement",
  },
  {
    icon: Scale,
    title: "LPF art. A.47 A-1",
    description: "Validation réglementaire du FEC à l'entrée",
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
