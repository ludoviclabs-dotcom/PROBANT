import Link from "next/link";
import { Layers, Database, FileText, AlertTriangle } from "lucide-react";
import { loadAllCycles, loadAllSources } from "@/lib/audit-cycles/loader";
import { toSearchItem } from "@/lib/audit-cycles/search";
import { CYCLE_FAMILIES, CYCLE_FAMILY_LABEL } from "@/lib/audit-cycles/types";
import { PageHeader } from "@/components/probant/PageHeader";
import { SearchBar } from "@/components/normatif/SearchBar";
import { CycleCard } from "@/components/normatif/CycleCard";

export default async function NormatifHome() {
  const [cycles, sources] = await Promise.all([loadAllCycles(), loadAllSources()]);
  const searchItems = cycles.map(toSearchItem);

  const reviewRequired = cycles.filter(
    (c) => c.reviewStatus === "REVIEW_REQUIRED",
  ).length;
  const familiesPresent = new Set(cycles.map((c) => c.family));

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Audit Normatif 360"
        subtitle="Base de connaissance normative des cycles d'audit financier — ISA, NEP, IAS/IFRS, PCG, Code de commerce, CGI. Complémentaire à l'analyse FEC de PROBANT."
      />

      <SearchBar cycles={searchItems} />

      {/* Statistiques */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Layers} label="Cycles d'audit" value={cycles.length} />
        <StatCard icon={FileText} label="Familles" value={familiesPresent.size} />
        <StatCard icon={Database} label="Sources normatives" value={sources.length} />
        <StatCard
          icon={AlertTriangle}
          label="À valider"
          value={reviewRequired}
          accent="#eab308"
        />
      </div>

      {/* Caveat matérialité (toujours visible) */}
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#eab308]/40 bg-[#292207] p-4 text-[12px] leading-relaxed text-[#eab308]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>Caveat normatif.</strong> Les pourcentages de matérialité et les
          bornes de ratios affichés sont des pratiques professionnelles
          paramétrables. Les ISA / NEP imposent le principe et la documentation du
          jugement, mais ne fixent pas de pourcentage universel. Tout le contenu est
          en statut « revue requise » avant validation par un expert.
        </p>
      </div>

      {/* Cycles par famille */}
      {CYCLE_FAMILIES.filter((f) => familiesPresent.has(f.id)).map((fam) => {
        const familyCycles = cycles.filter((c) => c.family === fam.id);
        return (
          <section key={fam.id} className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--pb-text)]">
                {CYCLE_FAMILY_LABEL[fam.id]}
                <span className="ml-2 text-[11px] font-normal text-[var(--pb-text-faint)]">
                  {familyCycles.length} cycle{familyCycles.length > 1 ? "s" : ""}
                </span>
              </h3>
              <Link
                href="/normatif/cycles"
                className="text-[11px] text-[var(--pb-accent)] hover:underline"
              >
                Tout voir
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {familyCycles.map((c) => (
                <CycleCard key={c.slug} cycle={c} />
              ))}
            </div>
          </section>
        );
      })}

      {cycles.length === 0 && (
        <p className="mt-8 text-center text-[13px] text-[var(--pb-text-faint)]">
          Aucun cycle chargé. Vérifiez le répertoire <code>data/cycles/</code>.
        </p>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = "var(--pb-accent)",
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
      <Icon className="h-4 w-4" style={{ color: accent }} />
      <div className="tnum mt-2 text-2xl font-bold" style={{ color: accent }}>
        {value}
      </div>
      <div className="mt-0.5 text-[12px] text-[var(--pb-text-muted)]">{label}</div>
    </div>
  );
}
