import type { IFRSvsPCGDifference } from "@/lib/audit-cycles/types";

export function IFRSvsPCGPanel({ differences }: { differences: IFRSvsPCGDifference[] }) {
  if (!differences?.length) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--pb-border)] px-3 py-3 text-[12px] text-[var(--pb-text-faint)]">
        Aucune différence significative IFRS / PCG identifiée pour ce cycle, ou
        cycle relevant uniquement du référentiel français.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--pb-border)]">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-[var(--pb-surface-3)] text-left text-[var(--pb-text-muted)]">
            <th className="px-3 py-2 font-semibold">Thème</th>
            <th className="px-3 py-2 font-semibold">Traitement IFRS</th>
            <th className="px-3 py-2 font-semibold">Traitement PCG</th>
            <th className="px-3 py-2 font-semibold">Impact audit</th>
          </tr>
        </thead>
        <tbody>
          {differences.map((d, i) => (
            <tr
              key={i}
              className="border-t border-[var(--pb-border)] align-top text-[var(--pb-text-muted)]"
            >
              <td className="px-3 py-2 font-medium text-[var(--pb-text)]">{d.topic}</td>
              <td className="px-3 py-2">{d.ifrsTreatment}</td>
              <td className="px-3 py-2">{d.pcgTreatment}</td>
              <td className="px-3 py-2 text-[var(--pb-accent)]">{d.auditImpact}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
