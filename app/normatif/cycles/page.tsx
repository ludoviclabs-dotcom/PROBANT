import { loadAllCycles } from "@/lib/audit-cycles/loader";
import {
  CYCLE_FAMILIES,
  CYCLE_FAMILY_LABEL,
  type CycleFamily,
} from "@/lib/audit-cycles/types";
import { PageHeader } from "@/components/probant/PageHeader";
import { CycleCard } from "@/components/normatif/CycleCard";
import { cn } from "@/lib/utils";

export default async function CyclesListPage({
  searchParams,
}: {
  searchParams: Promise<{ famille?: string; fraude?: string }>;
}) {
  const params = await searchParams;
  const cycles = await loadAllCycles();

  const activeFamily = params.famille as CycleFamily | undefined;
  const fraudeOnly = params.fraude === "1";

  let filtered = cycles;
  if (activeFamily) filtered = filtered.filter((c) => c.family === activeFamily);
  if (fraudeOnly)
    filtered = filtered.filter((c) =>
      (c.risks ?? []).some((r) => r.category === "RISQUE_FRAUDE"),
    );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        title="Cycles d'audit"
        subtitle={`${filtered.length} cycle(s) affiché(s) sur ${cycles.length}. Filtrez par famille ou par présence d'un risque de fraude (ISA 240).`}
      />

      {/* Filtres */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <FilterChip href="/normatif/cycles" active={!activeFamily && !fraudeOnly}>
          Tous
        </FilterChip>
        {CYCLE_FAMILIES.map((f) => (
          <FilterChip
            key={f.id}
            href={`/normatif/cycles?famille=${f.id}`}
            active={activeFamily === f.id}
          >
            {f.short}
          </FilterChip>
        ))}
        <span className="mx-1 h-4 w-px bg-[var(--pb-border)]" />
        <FilterChip href="/normatif/cycles?fraude=1" active={fraudeOnly}>
          Risque de fraude
        </FilterChip>
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13px] text-[var(--pb-text-faint)]">
          Aucun cycle ne correspond à ce filtre.{" "}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- chargement de document voulu, voir FilterChip */}
          <a href="/normatif/cycles" className="text-[var(--pb-accent)] hover:underline">
            Réinitialiser
          </a>
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CycleCard key={c.slug} cycle={c} />
          ))}
        </div>
      )}

      {activeFamily && (
        <p className="mt-4 text-[11px] text-[var(--pb-text-faint)]">
          Famille : {CYCLE_FAMILY_LABEL[activeFamily]}
        </p>
      )}
    </div>
  );
}

/**
 * Filtre de la liste : lien HTML ordinaire (chargement de document), pas `next/link`.
 * Passer d'un filtre à l'autre garde la page montée ; la navigation client
 * restait alors suspendue au milieu du rendu en flux de la nouvelle liste, sans
 * jamais se valider (React canary de Next 15.5.27, relevé le 14/10/2026 ;
 * `loading.tsx` ne s'applique pas, sa frontière étant conservée d'un paramètre
 * de recherche à l'autre). Un rechargement local de cette page serveur est sûr.
 */
function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-[12px] transition-colors",
        active
          ? "border-[var(--pb-accent)] bg-[var(--pb-accent)]/12 font-semibold text-[var(--pb-text)]"
          : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:bg-[var(--pb-surface-2)] hover:text-[var(--pb-text)]",
      )}
    >
      {children}
    </a>
  );
}
