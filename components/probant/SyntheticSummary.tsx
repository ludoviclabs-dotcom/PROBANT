"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { buildWorkpaperPackage } from "@/lib/workpapers/package";
import { periodId } from "@/lib/workpapers/model";
import { priorityCycle, projectCycleRows, projectSourceState, sortCycleRows } from "@/lib/dossier/cycle-registry";
import { ModuleAvailability } from "./ModuleAvailability";
import { CycleRegistryList } from "./CycleRegistryList";
import { DossierContextBar } from "./DossierContextBar";

function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([new TextEncoder().encode(text)], { type: mime }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const linkClass = "pbz-focusable text-[13px] text-[var(--pb-accent)] underline-offset-2 hover:underline";

/** Synthèse d'un scénario du laboratoire : mêmes entrées de registre que la Synthèse historique, sans constat DEMO SA. */
export function SyntheticSummary({ snapshot }: { snapshot: DossierSnapshot }) {
  const [bundle, setBundle] = useState<ReturnType<typeof buildWorkpaperPackage> | null>(null);
  const [message, setMessage] = useState("");
  const rows = useMemo(() => sortCycleRows(projectCycleRows(snapshot, { synthetic: true })), [snapshot]);
  const sources = useMemo(() => projectSourceState(snapshot), [snapshot]);
  const priority = useMemo(() => priorityCycle(rows), [rows]);
  function prepareExport() {
    try {
      if (!snapshot.dossier.period) throw new Error("PÉRIODE_INDISPONIBLE");
      const scope = { organizationId: "SYNTHETIC-DEMO", dossierId: snapshot.dossier.id, periodId: periodId(snapshot.dossier.period), mode: "demo" as const };
      setBundle(buildWorkpaperPackage(snapshot, scope, { id: "SYN-PREPARER", grants: [{ scope, permissions: ["read", "download"] }] }));
      setMessage("Export figé prêt pour ce dossier synthétique.");
    } catch (error) { setBundle(null); setMessage(error instanceof Error ? error.message : "Export indisponible"); }
  }
  const period = snapshot.dossier.period ? `${snapshot.dossier.period.startDate} → ${snapshot.dossier.period.closingDate}` : "Période indisponible";
  return <main className="min-h-screen bg-[var(--pb-bg)] p-4 text-[var(--pb-text)] md:p-6">
    <header className="mb-4">
      <h1 className="text-2xl font-semibold">Synthèse du dossier synthétique</h1>
      <p className="mt-1 text-[13px] text-[var(--pb-text-muted)]">Les anciens constats de DEMO SA ne sont pas dans ce dossier. Les résultats proviennent des feuilles exécutées dans le laboratoire.</p>
    </header>
    <DossierContextBar className="mb-4" dossier={{ name: snapshot.dossier.societe.raisonSociale, period, id: snapshot.dossier.id }} sources={sources} priority={priority} />
    <CycleRegistryList rows={rows} synthetic className="mb-4" title="Cycles du scénario" />
    <ModuleAvailability snapshot={snapshot} />
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2"><Link className={linkClass} href="/dashboard/tests">Revenir aux travaux et aux revues →</Link><button type="button" className={linkClass} onClick={prepareExport}>Préparer l’export du dossier</button></div>
    <p role="status" className="mt-2 text-[13px] text-[var(--pb-text-muted)]">{message}</p>
    {bundle && bundle.manifest.sourceSnapshotHash === snapshot.snapshotHash && <div className="my-4 flex flex-wrap gap-x-4 gap-y-2"><button type="button" className={linkClass} onClick={() => download("workpapers.json", bundle.json, "application/json")}>Snapshot JSON</button><button type="button" className={linkClass} onClick={() => download("workpapers.md", bundle.markdown, "text/markdown")}>Synthèse Markdown</button><button type="button" className={linkClass} onClick={() => download("manifest.json", JSON.stringify(bundle.manifest, null, 2), "application/json")}>Manifeste</button></div>}
  </main>;
}
