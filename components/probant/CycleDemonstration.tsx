"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useActiveDossier } from "@/lib/dossier/client";
import { buildWorkpaperPackage } from "@/lib/workpapers/package";
import { appendDemoEvent, createDemoRecord, DEMO_STORAGE_PREFIX, replayDemo, syntheticBaseline, verifyDemoRecord, type DemoEvent, type DemoRecord } from "@/lib/workpapers/browser-demo";
import { demoCycleSchema, type DemoCycle, type DemoParameters } from "@/lib/workpapers/demo-cycles";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { WorkpaperPanel } from "./WorkpaperPanel";

const labels: Record<DemoCycle, string> = { cash: "Cash", cutoff: "Cut-off", fournisseurs: "Fournisseurs / RPNE", clients: "Clients", immobilisations: "Immobilisations", capitaux: "Capitaux propres", achats: "Achats", conges: "Congés payés", participations: "Participations", is: "IS" };
function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([new TextEncoder().encode(body)], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function CycleDemonstration() {
  const dossier = useActiveDossier();
  const active = dossier.context.organizationId === "SYNTHETIC-DEMO" && /^SYN-[A-Za-z0-9-]+$/.test(dossier.context.dossierId) && dossier.snapshot.dossier.demoMode;
  const [cycle, setCycle] = useState<DemoCycle>("clients"), [scenario, setScenario] = useState<"nominal" | "exception" | "invalid">("nominal");
  const [missingEvidence, setMissing] = useState(false), [methodAvailable, setMethod] = useState(true);
  const [note, setNote] = useState(""), [message, setMessage] = useState("Ouvrez un dossier synthétique dédié pour commencer.");
  const [record, setRecord] = useState<DemoRecord | null>(null), [runs, setRuns] = useState<Map<DemoCycle, WorkpaperRun>>(new Map());
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [packageReady, setPackageReady] = useState<ReturnType<typeof buildWorkpaperPackage> | null>(null);
  const current = runs.get(cycle), parameters: DemoParameters = { cycle, scenario, missingEvidence, methodAvailable };
  useEffect(() => {
    if (!active) {
      setRecord(null); setRuns(new Map());
      const candidates: DemoRecord[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(DEMO_STORAGE_PREFIX)) continue;
        try { candidates.push(verifyDemoRecord(JSON.parse(localStorage.getItem(key)!))); } catch { /* corrupted or expired journals are not resumed */ }
      }
      setResumeId(candidates.sort((a, b) => b.createdAt - a.createdAt)[0]?.dossierId ?? null);
      return;
    }
    let cancelled = false;
    const raw = localStorage.getItem(`${DEMO_STORAGE_PREFIX}${dossier.context.dossierId}`);
    if (!raw) { setMessage("Journal local absent. Utilisez la remise à zéro explicite pour reprendre ce dossier."); return; }
    void (async () => {
      try {
        const stored = verifyDemoRecord(JSON.parse(raw)), restored = await replayDemo(stored);
        if (cancelled) return;
        await dossier.saveSnapshot(restored.snapshot, { organizationId: "SYNTHETIC-DEMO", dossierId: stored.dossierId });
        setRecord(stored); setRuns(restored.runs); setMessage("Dossier synthétique repris et intégrité locale vérifiée.");
      } catch (error) { if (!cancelled) setMessage(`Reprise refusée : ${error instanceof Error ? error.message : "journal invalide"}. Remise à zéro explicite disponible.`); }
    })();
    return () => { cancelled = true; };
  // Reprise au changement de dossier uniquement.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, dossier.context.dossierId]);
  async function openNew() {
    setBusy(true);
    try {
      const id = `SYN-${crypto.randomUUID()}`, created = createDemoRecord(id);
      localStorage.setItem(`${DEMO_STORAGE_PREFIX}${id}`, JSON.stringify(created));
      await dossier.saveSnapshot(syntheticBaseline(id), { organizationId: "SYNTHETIC-DEMO", dossierId: id });
      setRecord(created); setRuns(new Map()); setPackageReady(null); setMessage("Dossier synthétique dédié ouvert ; aucun constat de DEMO SA repris.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ouverture impossible"); } finally { setBusy(false); }
  }
  async function resume() {
    if (!resumeId) return;
    setBusy(true);
    try {
      const raw = localStorage.getItem(`${DEMO_STORAGE_PREFIX}${resumeId}`);
      if (!raw) throw new Error("JOURNAL_LOCAL_ABSENT");
      const stored = verifyDemoRecord(JSON.parse(raw)), restored = await replayDemo(stored);
      await dossier.saveSnapshot(restored.snapshot, { organizationId: "SYNTHETIC-DEMO", dossierId: stored.dossierId });
      setRecord(stored); setRuns(restored.runs); setMessage("Dossier synthétique repris après vérification.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reprise impossible"); } finally { setBusy(false); }
  }
  async function reset() {
    if (!active) return;
    setBusy(true);
    try {
      const cleared = createDemoRecord(dossier.context.dossierId);
      localStorage.setItem(`${DEMO_STORAGE_PREFIX}${cleared.dossierId}`, JSON.stringify(cleared));
      await dossier.saveSnapshot(syntheticBaseline(cleared.dossierId), { organizationId: "SYNTHETIC-DEMO", dossierId: cleared.dossierId });
      setRecord(cleared); setRuns(new Map()); setPackageReady(null); setMessage("Travaux, revues et projections synthétiques remis à zéro.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Remise à zéro impossible"); } finally { setBusy(false); }
  }
  async function act(event: DemoEvent) {
    if (!record || !active || record.dossierId !== dossier.context.dossierId) return;
    setBusy(true); setPackageReady(null);
    try {
      const next = await appendDemoEvent(record, event);
      localStorage.setItem(`${DEMO_STORAGE_PREFIX}${record.dossierId}`, JSON.stringify(next.record));
      await dossier.saveSnapshot(next.snapshot, { organizationId: "SYNTHETIC-DEMO", dossierId: record.dossierId });
      setRecord(next.record); setRuns(next.runs); setNote(""); setMessage("Action enregistrée dans ce navigateur ; synthèse du dossier actualisée.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Action refusée"); } finally { setBusy(false); }
  }
  function exportPackage() {
    try {
      if (!active || ![...runs.values()].some((r) => r.state === "locked")) throw new Error("VERROUILLAGE_REQUIS");
      const scope = { organizationId: "SYNTHETIC-DEMO", dossierId: dossier.context.dossierId, periodId: periodId(dossier.snapshot.dossier.period!), mode: "demo" as const };
      const actor = { id: "SYN-PREPARER", grants: [{ scope, permissions: ["read", "download"] as ("read" | "download")[] }] };
      setPackageReady(buildWorkpaperPackage(dossier.snapshot, scope, actor)); setMessage("Export du même dossier préparé.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Export indisponible"); }
  }
  return <section aria-labelledby="cycle-demo-title" className="my-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-950">
    <h2 id="cycle-demo-title" className="text-lg font-semibold">Atelier des dix cycles · démonstration</h2>
    <p className="my-2 text-sm">Fixtures exclusivement synthétiques. Rôles simulés. Sauvegarde dans ce navigateur pendant sept jours : contrôle d’intégrité, ni preuve inviolable ni persistance de production. Aucune donnée réelle.</p>
    <p className="font-semibold">Dossier actif : {dossier.snapshot.dossier.societe.raisonSociale} · {dossier.context.dossierId}</p>
    {!active ? <div className="my-3 flex gap-4"><button type="button" className="rounded bg-slate-900 px-4 py-2 text-white" disabled={busy} onClick={() => void openNew()}>Ouvrir un dossier synthétique dédié</button>{resumeId && <button type="button" className="rounded border bg-white px-4 py-2" disabled={busy} onClick={() => void resume()}>Reprendre le dossier synthétique {resumeId}</button>}</div> : <>
      <p>Période : 01/07/2023–30/06/2024 · revue : 31/07/2024. {runs.size}/10 cycles exécutés.</p>
      <div className="my-3 flex flex-wrap items-end gap-4">
        <label>Cycle<select className="ml-2 rounded border p-2" value={cycle} onChange={(e) => setCycle(demoCycleSchema.parse(e.target.value))} disabled={busy}>{demoCycleSchema.options.map((id) => <option key={id} value={id}>{labels[id]}</option>)}</select></label>
        <label>Scénario<select className="ml-2 rounded border p-2" value={scenario} onChange={(e) => setScenario(e.target.value as typeof scenario)} disabled={busy}><option value="nominal">Nominal</option><option value="exception">Exception</option><option value="invalid">Donnée invalide</option></select></label>
        <label><input type="checkbox" checked={missingEvidence} onChange={(e) => setMissing(e.target.checked)} disabled={busy} /> Pièce manquante</label>
        <label><input type="checkbox" checked={methodAvailable} onChange={(e) => setMethod(e.target.checked)} disabled={busy} /> Méthode synthétique documentée</label>
        {!current ? <button type="button" className="rounded bg-slate-900 px-4 py-2 text-white" disabled={busy || !record} onClick={() => void act({ action: "create", parameters })}>Exécuter ce cycle</button> : current.state === "locked" ? <button type="button" className="rounded border bg-white p-2" disabled={busy} onClick={() => void act({ action: "edit", parameters })}>Modifier : invalider la revue de ce cycle</button> : null}
      </div>
      {current && <><WorkpaperPanel runs={[current]} /><label className="block">Note de préparation ou revue simulée<textarea className="my-2 block w-full rounded border p-2" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label><div className="flex flex-wrap gap-2">
        {([ ["submit", "Soumettre", "executed"], ["approve", "Approuver", "awaiting_review"], ["changes", "Demander correction", "awaiting_review"], ["revise", "Réviser", "changes_requested"], ["lock", "Verrouiller", "approved"] ] as const).map(([action, label, state]) => <button key={action} type="button" className="rounded border bg-white p-2 disabled:opacity-50" disabled={busy || current.state !== state || !note.trim()} onClick={() => void act({ action, cycle, note })}>{label}</button>)}
      </div></>}
      <div className="my-4 flex flex-wrap gap-4"><Link className="underline" href="/dashboard/synthese">Voir la synthèse du même dossier →</Link><button type="button" className="underline disabled:opacity-50" disabled={busy || ![...runs.values()].some((r) => r.state === "locked")} onClick={exportPackage}>Préparer l’export</button><button type="button" className="underline" disabled={busy} onClick={() => void reset()}>Remise à zéro explicite</button></div>
      {packageReady && <div className="flex flex-wrap gap-3"><button type="button" className="underline" onClick={() => download("workpapers.json", packageReady.json, "application/json")}>Snapshot JSON</button><button type="button" className="underline" onClick={() => download("workpapers.md", packageReady.markdown, "text/markdown")}>Synthèse Markdown</button><button type="button" className="underline" onClick={() => download("manifest.json", JSON.stringify(packageReady.manifest, null, 2), "application/json")}>Manifeste</button></div>}
    </>}
    <p role="status" aria-live="polite" className="my-3 text-sm">{message}</p>
  </section>;
}
