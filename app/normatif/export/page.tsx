import { FileJson, FileSpreadsheet, FileText } from "lucide-react";
import { loadAllCycles } from "@/lib/audit-cycles/loader";
import { PageHeader } from "@/components/probant/PageHeader";

export default async function ExportPage() {
  const cycles = await loadAllCycles();

  return (
    <div className="mx-auto max-w-3xl p-6">
      <PageHeader
        title="Export de la cartographie"
        subtitle={`Exportez les ${cycles.length} cycles d'audit dans le format de votre choix pour archivage, revue ou intégration.`}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <ExportCard
          icon={FileJson}
          title="JSON complet"
          desc="Toutes les fiches avec l'intégralité des champs structurés."
          href="/api/normatif/export?format=json"
          hex="#5b9dff"
        />
        <ExportCard
          icon={FileSpreadsheet}
          title="CSV de synthèse"
          desc="Une ligne par cycle : famille, comptes, compteurs, statut."
          href="/api/normatif/export?format=csv"
          hex="#22c55e"
        />
        <ExportCard
          icon={FileText}
          title="Markdown global"
          desc="Cartographie complète lisible, fiche par fiche."
          href="/api/normatif/export?format=md"
          hex="#a78bfa"
        />
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-[var(--pb-text-faint)]">
        Les exports reflètent l'état actuel des fichiers YAML de <code>data/</code>.
        Le contenu est en statut « revue requise » : à valider par un expert audit
        avant toute utilisation opposable.
      </p>
    </div>
  );
}

function ExportCard({
  icon: Icon,
  title,
  desc,
  href,
  hex,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  desc: string;
  href: string;
  hex: string;
}) {
  return (
    <a
      href={href}
      className="flex flex-col rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4 transition-colors hover:border-[var(--pb-border-strong)] hover:bg-[var(--pb-surface-2)]"
    >
      <Icon className="h-6 w-6" style={{ color: hex }} />
      <h3 className="mt-2 text-[13px] font-semibold text-[var(--pb-text)]">{title}</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--pb-text-muted)]">{desc}</p>
      <span className="mt-3 text-[11px] font-medium" style={{ color: hex }}>
        Télécharger →
      </span>
    </a>
  );
}
