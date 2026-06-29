"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, FileText } from "lucide-react";
import type { SiloView } from "@/lib/canonical-model";
import { buildStatementDocuments } from "@/lib/canonical-model";
import { cn } from "@/lib/utils";
import { CloisonsView } from "./CloisonsView";
import { FinancialDocumentViewer } from "@/components/viewer/FinancialDocumentViewer";

type Vue = "silo" | "document";

/**
 * Espace de revue : conserve la revue par silo (analyse cloison par cloison)
 * et ajoute une vue « document annoté » (états reconstruits Bilan / Compte de
 * résultat / Flux, anomalies marquées sur les postes).
 */
export function CloisonsWorkspace({
  silos,
  meta,
}: {
  silos: SiloView[];
  meta: { label: string; exercice: string };
}) {
  const [vue, setVue] = useState<Vue>("silo");
  const docs = useMemo(() => buildStatementDocuments(silos, meta), [silos, meta]);
  const documentDisponible = docs.length > 0;

  return (
    <div className="space-y-4">
      {/* Bascule de vue */}
      <div className="inline-flex rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-0.5 text-[12px]">
        <button
          onClick={() => setVue("silo")}
          aria-pressed={vue === "silo"}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
            vue === "silo"
              ? "bg-[var(--pb-accent)]/15 text-[var(--pb-text)]"
              : "text-[var(--pb-text-muted)] hover:text-[var(--pb-text)]",
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Vue par silo
        </button>
        <button
          onClick={() => documentDisponible && setVue("document")}
          aria-pressed={vue === "document"}
          disabled={!documentDisponible}
          title={
            documentDisponible
              ? undefined
              : "Aucun état reconstruit disponible pour ce scénario"
          }
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
            vue === "document"
              ? "bg-[var(--pb-accent)]/15 text-[var(--pb-text)]"
              : "text-[var(--pb-text-muted)] hover:text-[var(--pb-text)]",
            !documentDisponible && "cursor-not-allowed opacity-40",
          )}
        >
          <FileText className="h-3.5 w-3.5" /> Vue document annoté
        </button>
      </div>

      {vue === "silo" || !documentDisponible ? (
        <CloisonsView silos={silos} />
      ) : (
        <FinancialDocumentViewer docs={docs} />
      )}
    </div>
  );
}
