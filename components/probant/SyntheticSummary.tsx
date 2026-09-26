"use client";
import { useState } from "react";
import Link from "next/link";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { buildWorkpaperPackage } from "@/lib/workpapers/package";
import { periodId } from "@/lib/workpapers/model";
import { ModuleAvailability } from "./ModuleAvailability";

function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([new TextEncoder().encode(text)], { type: mime }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SyntheticSummary({ snapshot }: { snapshot: DossierSnapshot }) {
  const [bundle, setBundle] = useState<ReturnType<typeof buildWorkpaperPackage> | null>(null);
  const [message, setMessage] = useState("");
  function prepareExport() {
    try {
      if (!snapshot.dossier.period) throw new Error("PÉRIODE_INDISPONIBLE");
      const scope = { organizationId: "SYNTHETIC-DEMO", dossierId: snapshot.dossier.id, periodId: periodId(snapshot.dossier.period), mode: "demo" as const };
      setBundle(buildWorkpaperPackage(snapshot, scope, { id: "SYN-PREPARER", grants: [{ scope, permissions: ["read", "download"] }] }));
      setMessage("Export figé prêt pour ce dossier synthétique.");
    } catch (error) { setBundle(null); setMessage(error instanceof Error ? error.message : "Export indisponible"); }
  }
  return <main className="min-h-screen bg-[#0b0e13] p-6 text-[#e6edf6]">
    <h1 className="text-2xl font-semibold">Synthèse du dossier synthétique</h1>
    <p className="my-3">{snapshot.dossier.societe.raisonSociale} · {snapshot.dossier.id} · {snapshot.dossier.period?.startDate} au {snapshot.dossier.period?.closingDate}</p>
    <p>Les anciens constats de DEMO SA ne sont pas dans ce dossier. Les résultats ci-dessous proviennent des feuilles exécutées dans l’atelier.</p>
    <ModuleAvailability snapshot={snapshot} />
    <div className="flex flex-wrap gap-5"><Link className="underline" href="/dashboard/tests">Revenir aux travaux et aux revues →</Link><button type="button" className="underline" onClick={prepareExport}>Préparer l’export du dossier</button></div>
    <p role="status">{message}</p>
    {bundle && <div className="my-4 flex gap-4"><button className="underline" onClick={() => download("workpapers.json", bundle.json, "application/json")}>Snapshot JSON</button><button className="underline" onClick={() => download("workpapers.md", bundle.markdown, "text/markdown")}>Synthèse Markdown</button><button className="underline" onClick={() => download("manifest.json", JSON.stringify(bundle.manifest, null, 2), "application/json")}>Manifeste</button></div>}
  </main>;
}
