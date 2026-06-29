import { AlertTriangle } from "lucide-react";
import type { MaterialityBlock, MaterialityGuidance } from "@/lib/audit-cycles/types";
import { NormativeStatusBadge } from "./NormativeStatusBadge";

function Block({ title, block }: { title: string; block: MaterialityBlock }) {
  return (
    <div className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[12px] font-semibold text-[var(--pb-text)]">{title}</h4>
        <NormativeStatusBadge status={block.status} short />
      </div>
      {block.benchmark && (
        <p className="mt-1.5 text-[11px] text-[var(--pb-text-muted)]">
          <span className="text-[var(--pb-text-faint)]">Base : </span>
          {block.benchmark}
        </p>
      )}
      <p className="mt-1 text-[11px] text-[var(--pb-text-muted)]">
        <span className="text-[var(--pb-text-faint)]">Méthode : </span>
        {block.formula}
      </p>
      <p className="tnum mt-1.5 text-[13px] font-semibold text-[var(--pb-accent)]">
        {block.recommendedRange}
      </p>
      <p className="mt-1.5 text-[10px] italic leading-relaxed text-[var(--pb-text-faint)]">
        {block.caveat}
      </p>
    </div>
  );
}

export function MaterialityPanel({ materiality }: { materiality: MaterialityGuidance }) {
  return (
    <div>
      {/* Avertissement obligatoire : aucun pourcentage de matérialité n'est imposé */}
      <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-[#eab308]/40 bg-[#292207] p-3 text-[11px] leading-relaxed text-[#eab308]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Les pourcentages de matérialité affichés sont des{" "}
          <strong>pratiques professionnelles paramétrables</strong>. Les ISA / NEP
          imposent le principe et la documentation du jugement, mais{" "}
          <strong>ne fixent aucun pourcentage universel</strong>.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <Block title="Seuil de signification global" block={materiality.globalMateriality} />
        <Block title="Seuil de performance" block={materiality.performanceMateriality} />
        <Block title="Seuil clairement insignifiant" block={materiality.clearlyTrivialThreshold} />
      </div>
    </div>
  );
}
