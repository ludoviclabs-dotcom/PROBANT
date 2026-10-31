"use client";
import { useEffect, useRef, useState } from "react";
import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import p from "@/components/charte/page.module.css";
import l from "@/components/tests-complementaires/tests.module.css";
import { useActiveDossier } from "@/lib/dossier/client";
import { buildWorkpaperPackage } from "@/lib/workpapers/package";
import { appendDemoEvent, createDemoRecord, DEMO_STORAGE_PREFIX, latestDemoParameters, replayDemo, syntheticBaseline, verifyDemoRecord, type DemoEvent, type DemoRecord } from "@/lib/workpapers/browser-demo";
import { demoCycleSchema, type DemoCycle, type DemoParameters } from "@/lib/workpapers/demo-cycles";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { WorkpaperPanel } from "./WorkpaperPanel";

/**
 * Laboratoire de scénarios (ex-« Atelier des dix cycles »). Bandeau compact dans la charte « instruments » : état du
 * dossier, Nouveau / Reprendre, volet « Mode et sauvegarde » avec l'identifiant complet copiable ; une fois le scénario
 * ouvert, cycle, paramètres, feuille de travail, note et étapes de revue simulée. La mécanique (journal local vérifié,
 * rejeu, exports) est inchangée. L'ambre n'habille que les blocages qui demandent une action.
 */
const labels: Record<DemoCycle, string> = { cash: "Cash", cutoff: "Cut-off", fournisseurs: "Fournisseurs / RPNE", clients: "Clients", immobilisations: "Immobilisations", capitaux: "Capitaux propres", achats: "Achats", conges: "Congés payés", participations: "Participations", is: "IS" };
function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([new TextEncoder().encode(body)], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Identifiant court pour les libellés ordinaires ; le complet reste dans le volet. */
export const shortScenarioId = (id: string) => (id.length > 14 ? `${id.slice(0, 12)}…` : id);

export function CycleDemonstration() {
  const dossier = useActiveDossier();
  const active = dossier.context.organizationId === "SYNTHETIC-DEMO" && /^SYN-[A-Za-z0-9-]+$/.test(dossier.context.dossierId) && dossier.snapshot.dossier.demoMode;
  const [cycle, setCycle] = useState<DemoCycle>("clients"), [scenario, setScenario] = useState<"nominal" | "exception" | "invalid">("nominal");
  const [missingEvidence, setMissing] = useState(false), [methodAvailable, setMethod] = useState(true);
  const [note, setNote] = useState(""), [message, setMessageState] = useState<{ text: string; tone: "info" | "error" }>({ text: "Ouvrez un scénario synthétique dédié pour commencer.", tone: "info" });
  const setMessage = (text: string, tone: "info" | "error" = "info") => setMessageState({ text, tone });
  const [record, setRecord] = useState<DemoRecord | null>(null), [runs, setRuns] = useState<Map<DemoCycle, WorkpaperRun>>(new Map());
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [packageReady, setPackageReady] = useState<ReturnType<typeof buildWorkpaperPackage> | null>(null);
  const [infoOpen, setInfoOpen] = useState(false), [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const infoButton = useRef<HTMLButtonElement>(null), infoPanel = useRef<HTMLDivElement>(null);
  const current = runs.get(cycle), parameters: DemoParameters = { cycle, scenario, missingEvidence, methodAvailable };
  const executed = [...runs.values()].filter((r) => r.result?.execution === "completed").length, blocked = [...runs.values()].filter((r) => r.state === "blocked").length;
  function restoreParameters(stored: DemoRecord) {
    const p = latestDemoParameters(stored);
    if (p) { setCycle(p.cycle); setScenario(p.scenario ?? "nominal"); setMissing(p.missingEvidence); setMethod(p.methodAvailable); }
  }
  useEffect(() => {
    if (!active) {
      setRecord(null); setRuns(new Map()); setPackageReady(null);
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
    if (!raw) { setRecord(null); setRuns(new Map()); setPackageReady(null); setMessage("Journal absent ou ancien contrat v1 : une remise à zéro explicite est requise pour appliquer le contrat v2. Les anciens résultats ne sont pas requalifiés silencieusement.", "error"); return; }
    void (async () => {
      try {
        const stored = verifyDemoRecord(JSON.parse(raw)), restored = await replayDemo(stored);
        if (cancelled) return;
        await dossier.saveSnapshot(restored.snapshot, { organizationId: "SYNTHETIC-DEMO", dossierId: stored.dossierId });
        setRecord(stored); setRuns(restored.runs); restoreParameters(stored); setMessage("Scénario synthétique repris et intégrité locale vérifiée.");
      } catch (error) { if (!cancelled) setMessage(`Reprise refusée : ${error instanceof Error ? error.message : "journal invalide"}. Remise à zéro explicite disponible.`, "error"); }
    })();
    return () => { cancelled = true; };
  // Reprise au changement de dossier uniquement.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, dossier.context.dossierId]);
  useEffect(() => {
    if (!infoOpen) return;
    infoPanel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setInfoOpen(false); infoButton.current?.focus(); } };
    const panel = infoPanel.current; panel?.addEventListener("keydown", onKey);
    return () => panel?.removeEventListener("keydown", onKey);
  }, [infoOpen]);
  async function openNew() {
    setBusy(true);
    try {
      const id = `SYN-${crypto.randomUUID()}`, created = createDemoRecord(id);
      localStorage.setItem(`${DEMO_STORAGE_PREFIX}${id}`, JSON.stringify(created));
      await dossier.saveSnapshot(syntheticBaseline(id), { organizationId: "SYNTHETIC-DEMO", dossierId: id });
      setRecord(created); setRuns(new Map()); setPackageReady(null); setMessage("Scénario synthétique dédié ouvert ; aucun constat de DEMO SA repris.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ouverture impossible", "error"); } finally { setBusy(false); }
  }
  async function resume() {
    if (!resumeId) return;
    setBusy(true);
    try {
      const raw = localStorage.getItem(`${DEMO_STORAGE_PREFIX}${resumeId}`);
      if (!raw) throw new Error("JOURNAL_LOCAL_ABSENT");
      const stored = verifyDemoRecord(JSON.parse(raw)), restored = await replayDemo(stored);
      await dossier.saveSnapshot(restored.snapshot, { organizationId: "SYNTHETIC-DEMO", dossierId: stored.dossierId });
      setRecord(stored); setRuns(restored.runs); restoreParameters(stored); setMessage("Scénario synthétique repris après vérification.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reprise impossible", "error"); } finally { setBusy(false); }
  }
  async function reset() {
    if (!active) return;
    setBusy(true);
    try {
      const cleared = createDemoRecord(dossier.context.dossierId);
      localStorage.setItem(`${DEMO_STORAGE_PREFIX}${cleared.dossierId}`, JSON.stringify(cleared));
      await dossier.saveSnapshot(syntheticBaseline(cleared.dossierId), { organizationId: "SYNTHETIC-DEMO", dossierId: cleared.dossierId });
      setRecord(cleared); setRuns(new Map()); setPackageReady(null); setMessage("Travaux, revues et projections synthétiques remis à zéro.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Remise à zéro impossible", "error"); } finally { setBusy(false); }
  }
  async function act(event: DemoEvent) {
    if (!record || !active || record.dossierId !== dossier.context.dossierId) return;
    setBusy(true); setPackageReady(null);
    try {
      const next = await appendDemoEvent(record, event);
      localStorage.setItem(`${DEMO_STORAGE_PREFIX}${record.dossierId}`, JSON.stringify(next.record));
      await dossier.saveSnapshot(next.snapshot, { organizationId: "SYNTHETIC-DEMO", dossierId: record.dossierId });
      setRecord(next.record); setRuns(next.runs); setNote(""); setMessage("Action enregistrée dans ce navigateur ; synthèse du dossier actualisée.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Action refusée", "error"); } finally { setBusy(false); }
  }
  function exportPackage() {
    try {
      if (!active) throw new Error("DOSSIER_SYNTHETIQUE_REQUIS");
      const scope = { organizationId: "SYNTHETIC-DEMO", dossierId: dossier.context.dossierId, periodId: periodId(dossier.snapshot.dossier.period!), mode: "demo" as const };
      const actor = { id: "SYN-PREPARER", grants: [{ scope, permissions: ["read", "download"] as ("read" | "download")[] }] };
      setPackageReady(buildWorkpaperPackage(dossier.snapshot, scope, actor)); setMessage("Export du même dossier préparé.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Export indisponible", "error"); }
  }
  async function copyId() {
    try { await navigator.clipboard.writeText(dossier.context.dossierId); setCopied("done"); }
    catch { setCopied("failed"); }
  }
  const blockedMessage = current?.result?.execution === "blocked";
  return <section aria-labelledby="cycle-demo-title" data-tour="scenario-lab" className={l.lab}>
    <div className={l.labHead}>
      <div className={l.labMain}>
        <h2 id="cycle-demo-title" className={l.labTitle}>Laboratoire de scénarios</h2>
        <p className={l.labState} title={active ? dossier.context.dossierId : undefined}>
          {active ? <>Scénario <strong>{shortScenarioId(dossier.context.dossierId)}</strong> · {executed}/10 cycles exécutés · {blocked} bloqués.</> : <>Aucun scénario ouvert · fixtures synthétiques, rôles simulés.</>}
        </p>
      </div>
      <div className={l.labActions}>
        {!active && <button type="button" className={p.btnSecondary} aria-label="Nouveau scénario synthétique" disabled={busy} onClick={() => void openNew()}>Nouveau</button>}
        {!active && resumeId && <button type="button" className={p.btnSecondary} aria-label={`Reprendre le scénario ${resumeId}`} title={resumeId} disabled={busy} onClick={() => void resume()}>Reprendre</button>}
        {active && <button type="button" className={p.btnSecondary} disabled={busy} onClick={() => void reset()}>Remise à zéro explicite</button>}
        <button ref={infoButton} type="button" className={l.disclosure} aria-expanded={infoOpen} aria-controls="cycle-demo-info" onClick={() => setInfoOpen(o => !o)}>Mode et sauvegarde</button>
      </div>
    </div>
    <div id="cycle-demo-info" ref={infoPanel} tabIndex={-1} role="region" aria-label="Mode et sauvegarde" hidden={!infoOpen} className={`${l.labInfo}${infoOpen ? " pb-panel-in" : ""}`}>
      <dl className={l.labFacts}>
        <dt>Mode</dt><dd>Fixtures exclusivement synthétiques. Rôles simulés. Aucune donnée réelle.</dd>
        <dt>Sauvegarde</dt><dd>Dans ce navigateur pendant sept jours : contrôle d’intégrité, ni preuve inviolable ni persistance de production.</dd>
        <dt>Dossier actif</dt>
        <dd>
          <span>{dossier.snapshot.dossier.societe.raisonSociale}</span>
          <span className={l.idRow}>
            <code className={l.idCode}>{dossier.context.dossierId}</code>
            <button type="button" className={p.btnSecondary} onClick={() => void copyId()}>Copier l’identifiant</button>
            {copied !== "idle" && <span role="status">{copied === "done" ? "Identifiant copié." : "Copie refusée par le navigateur : sélectionnez l’identifiant."}</span>}
          </span>
        </dd>
        {active && <><dt>Période</dt><dd className={p.mono}>01/07/2023–30/06/2024 · revue : 31/07/2024.</dd></>}
      </dl>
    </div>
    {active && <div className={l.labWork}>
      <div className={l.labControls}>
        <label className={l.labField}>Cycle<select value={cycle} onChange={(e) => setCycle(demoCycleSchema.parse(e.target.value))} disabled={busy}>{demoCycleSchema.options.map((id) => <option key={id} value={id}>{labels[id]}</option>)}</select></label>
        <label className={l.labField}>Scénario<select value={scenario} onChange={(e) => setScenario(e.target.value as typeof scenario)} disabled={busy}><option value="nominal">Nominal</option><option value="exception">Exception</option><option value="invalid">Donnée invalide</option></select></label>
        <label className={l.check}><input type="checkbox" checked={missingEvidence} onChange={(e) => setMissing(e.target.checked)} disabled={busy} /> Pièce manquante</label>
        <label className={l.check}><input type="checkbox" checked={methodAvailable} onChange={(e) => setMethod(e.target.checked)} disabled={busy} /> Méthode synthétique documentée</label>
        {!current ? <button type="button" className={p.btnPrimary} disabled={busy || !record} onClick={() => void act({ action: "create", parameters })}>Exécuter ce cycle</button> : ["locked", "blocked", "failed"].includes(current.state) ? <button type="button" className={p.btnSecondary} disabled={busy} onClick={() => void act({ action: "edit", parameters })}>{current.state === "locked" ? "Modifier : invalider la revue de ce cycle" : "Corriger les paramètres et réexécuter"}</button> : null}
      </div>
      {blockedMessage && <p role="status" data-tone="blocked" className={l.blocked}>{current!.result!.blockedControls.join(" ; ")} La soumission, l’approbation et le verrouillage sont indisponibles. <Link href={cycle === "is" ? "/dashboard/fiscalite" : "/dashboard/depot"}>Voir la source requise</Link>. Le diagnostic peut être exporté.</p>}
      {current?.state === "locked" && <p className={l.lockedNote}>Toute modification remplace le résultat courant et périme la revue ; une nouvelle revue sera nécessaire avant export.</p>}
      {current && <><div className={l.workpaper}><WorkpaperPanel runs={[current]} /></div><label className={l.noteField}>Note de préparation ou revue simulée<textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label><div className={l.workflow}>
        {([ ["submit", "Soumettre", "executed"], ["approve", "Approuver", "awaiting_review"], ["changes", "Demander correction", "awaiting_review"], ["revise", "Réviser", "changes_requested"], ["lock", "Verrouiller", "approved"] ] as const).map(([action, label, state]) => <button key={action} type="button" className={p.btnSecondary} disabled={busy || current.state !== state || !note.trim()} onClick={() => void act({ action, cycle, note })}>{label}</button>)}
      </div></>}
      <div className={l.labLinks}><Link href="/dashboard/synthese">Voir la synthèse du même dossier →</Link><button type="button" className={p.btnQuiet} disabled={busy || ![...runs.values()].some((r) => r.state === "locked" || r.state === "blocked")} onClick={exportPackage}>Préparer l’export</button></div>
      {packageReady && packageReady.manifest.sourceSnapshotHash === dossier.snapshot.snapshotHash && <div className={l.labLinks}><button type="button" className={p.btnQuiet} onClick={() => download("workpapers.json", packageReady.json, "application/json")}>Snapshot JSON</button><button type="button" className={p.btnQuiet} onClick={() => download("workpapers.md", packageReady.markdown, "text/markdown")}>Synthèse Markdown</button><button type="button" className={p.btnQuiet} onClick={() => download("manifest.json", JSON.stringify(packageReady.manifest, null, 2), "application/json")}>Manifeste</button></div>}
    </div>}
    <p role="status" aria-live="polite" data-tone={message.tone} className={l.labMessage}>{message.tone === "error" && <span className={l.blockedWord}>Blocage · </span>}{message.text}</p>
  </section>;
}
