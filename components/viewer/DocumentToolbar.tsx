"use client";

import { FileDown, Printer } from "lucide-react";
import type { AnnotatedDocument, Severity } from "@/lib/canonical-model";
import { SEVERITY_STYLE } from "@/components/probant/severity";
import { cn } from "@/lib/utils";
import type { DocCounts, SeverityFilter } from "./types";

const ADMISSIBILITE_STYLE: Record<
  AnnotatedDocument["metadata"]["admissibilite"],
  { label: string; hex: string }
> = {
  conforme: { label: "Conforme", hex: "#22c55e" },
  alerte: { label: "Alerte", hex: "#f97316" },
  rejete: { label: "Rejeté", hex: "#ef4444" },
};

interface FilterDef {
  key: SeverityFilter;
  label: string;
  count: number;
  hex?: string;
}

export function DocumentToolbar({
  docs,
  activeId,
  onSelectDoc,
  doc,
  counts,
  filter,
  onFilter,
  onExportPdf,
  onExportJson,
}: {
  docs: AnnotatedDocument[];
  activeId: string;
  onSelectDoc: (id: string) => void;
  doc: AnnotatedDocument;
  counts: DocCounts;
  filter: SeverityFilter;
  onFilter: (f: SeverityFilter) => void;
  onExportPdf: () => void;
  onExportJson: () => void;
}) {
  const adm = ADMISSIBILITE_STYLE[doc.metadata.admissibilite];

  const filters: FilterDef[] = [
    { key: "all", label: "Tout", count: counts.total },
    {
      key: "bloquant",
      label: "Bloquant",
      count: counts.bloquant,
      hex: SEVERITY_STYLE.bloquant.hex,
    },
    {
      key: "majeur",
      label: "Majeur",
      count: counts.majeur,
      hex: SEVERITY_STYLE.majeur.hex,
    },
    {
      key: "mineur",
      label: "Mineur",
      count: counts.mineur,
      hex: SEVERITY_STYLE.mineur.hex,
    },
    {
      key: "informatif",
      label: "Informatif",
      count: counts.informatif,
      hex: SEVERITY_STYLE.informatif.hex,
    },
    { key: "sain", label: "Lignes saines", count: counts.sain },
  ];

  return (
    <div className="space-y-3 border-b border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-3">
      {/* Ligne 1 : titre + admissibilité + export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-[var(--pb-text)]">
              {doc.titre}
            </h3>
            <span
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold"
              style={{ borderColor: `${adm.hex}66`, color: adm.hex }}
              role="status"
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: adm.hex }}
              />
              {adm.label}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--pb-text-faint)]">
            {doc.societe} · exercice {doc.exercice} ·{" "}
            {doc.origine === "upload" ? "document déposé" : "états reconstitués"}
            {doc.metadata.note ? ` · ${doc.metadata.note}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 print:hidden">
          <button
            onClick={onExportJson}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pb-border)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--pb-text-muted)] transition-colors hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)]"
          >
            <FileDown className="h-3.5 w-3.5" /> JSON
          </button>
          <button
            onClick={onExportPdf}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--pb-accent)]/50 bg-[var(--pb-accent)]/10 px-2.5 py-1.5 text-[12px] font-semibold text-[var(--pb-accent)] transition-colors hover:bg-[var(--pb-accent)]/20"
          >
            <Printer className="h-3.5 w-3.5" /> Exporter PDF
          </button>
        </div>
      </div>

      {/* Sélecteur de type de document (si plusieurs états disponibles) */}
      {docs.length > 1 && (
        <div className="flex flex-wrap gap-1.5 print:hidden">
          {docs.map((d) => {
            const isActive = d.id === activeId;
            return (
              <button
                key={d.id}
                onClick={() => onSelectDoc(d.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[12px] transition-colors",
                  isActive
                    ? "border-[var(--pb-accent)] bg-[var(--pb-accent)]/12 font-semibold text-[var(--pb-text)]"
                    : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)]",
                )}
              >
                {d.titre}
              </button>
            );
          })}
        </div>
      )}

      {/* Filtres par gravité */}
      <div className="flex flex-wrap gap-1.5 print:hidden">
        {filters.map((f) => {
          const isActive = filter === f.key;
          const accent = f.hex ?? "var(--pb-accent)";
          return (
            <button
              key={f.key}
              onClick={() => onFilter(f.key)}
              aria-pressed={isActive}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors",
                isActive
                  ? "font-semibold text-[var(--pb-text)]"
                  : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)]",
              )}
              style={
                isActive
                  ? { borderColor: accent, backgroundColor: `${accent}1f` }
                  : undefined
              }
            >
              <span>{f.label}</span>
              <span
                className="tnum rounded px-1 text-[10px] font-semibold"
                style={{
                  color: f.hex ?? "var(--pb-text-muted)",
                  backgroundColor: f.hex ? `${f.hex}1a` : "var(--pb-surface-3)",
                }}
              >
                {f.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
