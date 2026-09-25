"use client";
import React, { useState } from "react";
import { WorkpaperPanel } from "./WorkpaperPanel";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { ModuleAvailability } from "./ModuleAvailability";
const cycles = [["clients", "Clients"], ["immobilisations", "Immobilisations"], ["capitaux", "Capitaux propres"], ["achats", "Achats"], ["conges", "Congés payés"], ["participations", "Participations"], ["is", "IS"]] as const;
export function CycleDemonstration() {
  const [cycle, setCycle] = useState("clients"), [missingEvidence, setMissing] = useState(false), [methodAvailable, setMethod] = useState(false);
  const [run, setRun] = useState<WorkpaperRun | null>(null), [token, setToken] = useState(""), [note, setNote] = useState(""), [message, setMessage] = useState("Aucune démonstration chargée."), [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<{ markdown: string; json: string; manifest: unknown } | null>(null);
  const [snapshot, setSnapshot] = useState<DossierSnapshot | null>(null);
  function download(name: string, body: string, type: string) { const url = URL.createObjectURL(new Blob([body], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  async function act(action: "create" | "submit" | "approve" | "changes" | "revise" | "lock" | "export") {
    setBusy(true); setMessage("Traitement de la démonstration…");
    try {
      const response = await fetch("/api/workpapers", { method: "PUT", headers: { "Content-Type": "application/json", "x-probant-demonstration": "synthetic-only" }, body: JSON.stringify(action === "create" ? { action, parameters: { cycle, missingEvidence, methodAvailable } } : { action, token, version: run?.version, note: action === "export" ? "Export synthétique sélectionné" : note }) });
      if (response.status === 503) throw new Error("Démonstration désactivée. Activation locale explicite requise : PROBANT_DEMONSTRATION_ENABLED=true. Aucun fallback réel.");
      if (!response.ok) throw new Error("Action refusée ou session expirée. La version précédente reste affichée ; relancer explicitement une démonstration si nécessaire.");
      const data = await response.json(); setRun(data.run); setToken(data.token); setNote(""); setExported(data.package ?? null); if (action === "create") setSnapshot(null); else if (data.snapshot) setSnapshot(data.snapshot); setMessage(`Démonstration : ${data.run.state}. Mémoire temporaire, expiration après 30 minutes. Rôles simulés.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Démonstration indisponible"); } finally { setBusy(false); }
  }
  return <section aria-labelledby="cycle-demo-title" className="my-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-950">
    <h2 id="cycle-demo-title" className="text-lg font-semibold">Atelier des cycles — DÉMONSTRATION</h2>
    <p className="my-2 text-sm">Fixtures exclusivement synthétiques. Aucun dépôt de pièce réelle. Clôture au 30/06/2024, revue au 31/07/2024. Les rôles sont simulés et le stockage temporaire : ce parcours n’est pas utilisable en production.</p>
    <form onSubmit={(e) => { e.preventDefault(); void act("create"); }} className="flex flex-wrap items-end gap-4">
      <label htmlFor="demo-cycle-choice">Cycle<select id="demo-cycle-choice" className="block rounded border p-2" value={cycle} onChange={(e) => setCycle(e.target.value)} disabled={busy}>{cycles.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="text-sm"><input type="checkbox" checked={missingEvidence} onChange={(e) => setMissing(e.target.checked)} disabled={busy} /> Simuler une pièce manquante</label>
      <label className="text-sm"><input type="checkbox" checked={methodAvailable} onChange={(e) => setMethod(e.target.checked)} disabled={busy} /> Méthode synthétique documentée (jamais règle réelle)</label>
      <button className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50" disabled={busy} type="submit">Exécuter une nouvelle démonstration</button>
    </form>
    <p role="status" aria-live="polite" className="my-3 text-sm">{message}</p>
    {run ? <>
      <WorkpaperPanel runs={[run]} />
      <label className="block">Commentaire de préparation ou de revue — sans données personnelles<textarea className="my-2 block w-full rounded border p-2" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="flex flex-wrap gap-3">
        <button className="rounded border bg-white p-2 disabled:opacity-50" disabled={busy || run.state !== "executed" || !note.trim()} onClick={() => void act("submit")}>Préparateur simulé : soumettre</button>
        <button className="rounded border bg-white p-2 disabled:opacity-50" disabled={busy || run.state !== "awaiting_review" || !note.trim()} onClick={() => void act("approve")}>Reviewer simulé : approuver le travail</button>
        <button className="rounded border bg-white p-2 disabled:opacity-50" disabled={busy || run.state !== "awaiting_review" || !note.trim()} onClick={() => void act("changes")}>Reviewer simulé : demander des corrections</button>
        <button className="rounded border bg-white p-2 disabled:opacity-50" disabled={busy || run.state !== "changes_requested" || !note.trim()} onClick={() => void act("revise")}>Préparateur simulé : nouvelle révision avec réponse aux notes</button>
        <button className="rounded border bg-white p-2 disabled:opacity-50" disabled={busy || run.state !== "approved" || !note.trim()} onClick={() => void act("lock")}>Verrouiller la projection démonstrative</button>
        <button className="rounded border bg-white p-2 disabled:opacity-50" disabled={busy || run.state !== "locked"} onClick={() => void act("export")}>Préparer l’export figé</button>
      </div>
      {exported ? <div className="my-3 flex flex-wrap gap-3"><p>Export DÉMONSTRATION, sans pièce binaire. Hash ≠ signature légale.</p><button className="underline" onClick={() => download("workpapers.md", exported.markdown, "text/markdown")}>Télécharger Markdown</button><button className="underline" onClick={() => download("workpapers.json", exported.json, "application/json")}>Télécharger le snapshot JSON</button><button className="underline" onClick={() => download("manifest.json", JSON.stringify(exported.manifest, null, 2), "application/json")}>Télécharger le manifeste</button></div> : null}
      {snapshot && <><p className="mt-4 font-semibold">Synthèse de cette démonstration isolée — mission courante inchangée</p><ModuleAvailability snapshot={snapshot} showWorkpapers={false} /></>}
    </> : null}
  </section>;
}
