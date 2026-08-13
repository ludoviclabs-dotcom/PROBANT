
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type DossierContext, type DossierSnapshot } from "@/lib/dossier";
import { useActiveDossier } from "@/lib/dossier/client";

function initiales(nom: string): string {
  return nom.trim().slice(0, 2).toUpperCase();
}
function StatutBadge() {
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        color: "var(--pb-ok)",
        backgroundColor: "color-mix(in srgb, var(--pb-ok) 16%, transparent)",
      }}
    >
      actif
    </span>
  );
}

function DossierCard({
  nom,
  exercice,
  sousLigne,
  href,
  context,
  onSelect,
}: {
  nom: string;
  exercice: string;
  sousLigne: string;
  href: string;
  context: DossierContext;
  onSelect: (context: DossierContext) => void;
}) {
  return (
    <div
      className={cn(
        "flex h-[72px] items-center gap-3 rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-3",
        "transition-colors hover:border-[var(--pb-border-strong)]",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--pb-surface-3)] text-[12px] font-semibold text-[var(--pb-text)]">
        {initiales(nom)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--pb-text)]">
          {nom} <span className="text-[var(--pb-text-faint)]">· {exercice}</span>
        </p>
        <p className="truncate text-[12px] text-[var(--pb-text-muted)]">{sousLigne}</p>
      </div>
      <StatutBadge />
      <Link
        href={href}
        onClick={() => {
          onSelect(context);
        }}
        className="ml-auto flex shrink-0 items-center gap-1 text-[12px] font-medium text-[var(--pb-accent)] hover:underline"
      >
        Reprendre
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export function RecentDossiers() {
  const { context: activeContext, listSnapshots, selectDossier } = useActiveDossier();
  const [snapshots, setSnapshots] = useState<DossierSnapshot[]>([]);

  useEffect(() => {
    void listSnapshots().then(setSnapshots);
  }, [listSnapshots]);

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-[var(--pb-text)]">Reprendre un dossier</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {snapshots.map((snapshot) => (
          <DossierCard
            key={snapshot.dossier.id}
            nom={snapshot.dossier.societe.raisonSociale}
            exercice={snapshot.dossier.societe.exercice}
            sousLigne={`${snapshot.findings.length} constats · ${
              snapshot.sourceDocuments.at(0)?.fileName ?? "snapshot"
            }`}
            href="/dashboard/cloisons?mode=live"
            context={{
              organizationId: snapshot.sourceKind === "demo"
                ? "demo"
                : activeContext.organizationId === "demo"
                  ? "session"
                  : activeContext.organizationId,
              dossierId: snapshot.dossier.id,
            }}
            onSelect={(context) => void selectDossier(context)}
          />
        ))}
        <Link
          href="/dashboard/depot"
          className="flex h-[72px] items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--pb-border-strong)] text-[13px] font-medium text-[var(--pb-text-muted)] transition-colors hover:text-[var(--pb-text)]"
        >
          <Plus className="h-4 w-4" />
          Nouveau dossier
        </Link>
      </div>
    </section>
  );
}
