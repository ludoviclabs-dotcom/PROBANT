"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UploadCloud, CheckCircle2, XCircle, Loader2, RotateCcw } from "lucide-react";
import { AUDIT_CYCLES, documentTypesForCycle, type AuditCycle, type DocumentType } from "@/lib/rapprochement/catalog";
import { parseTabularDocument } from "@/lib/rapprochement/parse-upload";
import { buildRapprochementDepuisDepot } from "@/lib/rapprochement/build-from-upload";
import type { DocumentSource } from "@/lib/rapprochement/types";
import { qualificationIssues, type UploadExecution, type UploadQualification } from "@/lib/rapprochement/upload-contract";
import { addRapprochementToSnapshot, invalidateRapprochementInSnapshot } from "@/lib/dossier";
import { useActiveDossier } from "@/lib/dossier/client";
import { SeverityBadge } from "./Badges";
import { cn } from "@/lib/utils";

interface DocState {
  statut: "vide" | "en_cours" | "ok" | "erreur";
  fichier?: File;
  documentSource?: DocumentSource;
  fingerprint?: string;
  erreur?: string;
}
async function fingerprintFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
export function CycleUploadPanel() {
  return <Suspense fallback={null}><CycleUploadPanelInner /></Suspense>;
}
function CycleUploadPanelInner() {
  const { snapshot, updateSnapshot } = useActiveDossier();
  const params = useSearchParams();
  const [cycleId, setCycleId] = useState<string | null>(() => params.get("cycle"));
  const [docs, setDocs] = useState<Record<string, DocState>>({});
  const [entity, setEntity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [asOfDate, setAsOfDate] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [tolerance, setTolerance] = useState("0");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const generation = useRef(0);
  const previousDemo = useRef(snapshot.dossier.demoMode);
  const requests = useRef(new Map<string, string>());
  const cycle = AUDIT_CYCLES.find((c) => c.id === cycleId);
  const types = useMemo(() => cycle ? documentTypesForCycle(cycle.id) : [], [cycle]);
  const qualification: UploadQualification = {
    entity, period: startDate || closingDate || asOfDate ? { startDate, closingDate, asOfDate, currency: "EUR", validation: confirmed ? "confirmed" : "provisional" } : undefined,
    comparisonBasisConfirmed: confirmed,
    technicalToleranceEur: tolerance.trim() === "" ? NaN : Number(tolerance),
    selection: "all_imported_rows", materialityAmount: null,
  };
  const issues = qualificationIssues(qualification);
  const active = snapshot.uploadExecutions?.find((run) => run.cycleId === cycleId && run.state === "active");
  const history = snapshot.uploadExecutions?.filter((run) => run.cycleId === cycleId && run.state === "stale") ?? [];
  const persistent = snapshot.sourceKind === "persistent";

  // Un dossier changé pendant une lecture ne reçoit jamais la réponse de l'ancien fichier.
  useEffect(() => {
    generation.current += 1; requests.current.clear();
    if (!previousDemo.current) setDocs({});
    previousDemo.current = snapshot.dossier.demoMode;
    const saved = snapshot.uploadExecutions?.find((run) => run.state === "active" && run.cycleId === cycleId) ?? snapshot.uploadExecutions?.find((run) => run.state === "active");
    if (saved && !entity && !startDate && !closingDate) {
      setEntity(saved.qualification.entity);
      setStartDate(saved.qualification.period?.startDate ?? "");
      setClosingDate(saved.qualification.period?.closingDate ?? "");
      setAsOfDate(saved.qualification.period?.asOfDate ?? "");
      setConfirmed(saved.qualification.comparisonBasisConfirmed);
      setTolerance(String(saved.qualification.technicalToleranceEur));
    }
    // L’identité change lors de la première comparaison depuis DEMO ; les fichiers restent ouverts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.dossier.id]);

  function selectCycle(id: string | null) {
    generation.current += 1;
    requests.current.clear();
    setCycleId(id); setDocs({}); setError(""); setChanged(false);
  }
  function invalidate(reason: string) {
    setChanged(true);
    setError("");
    if (cycleId && !persistent) void updateSnapshot((current) => invalidateRapprochementInSnapshot(current, cycleId, reason)).catch((e) => setError(String(e.message ?? e)));
  }
  function changeParameter(change: () => void) {
    change(); setConfirmed(false); invalidate("Paramètres modifiés : comparaison à relancer.");
  }
  async function handleFile(type: DocumentType, file: File) {
    if (busy || persistent) return;
    const request = crypto.randomUUID(), currentGeneration = generation.current;
    requests.current.set(type.id, request);
    setDocs((current) => ({ ...current, [type.id]: { statut: "en_cours", fichier: file } }));
    invalidate("Nouvel import : résultats précédents périmés.");
    try {
      const parsed = await parseTabularDocument(file, type);
      const fingerprint = await fingerprintFile(file);
      if (generation.current !== currentGeneration || requests.current.get(type.id) !== request) return;
      setDocs((current) => ({ ...current, [type.id]: { statut: "ok", fichier: file, documentSource: { ...parsed.documentSource, fingerprint }, fingerprint } }));
    } catch (e) {
      if (generation.current !== currentGeneration || requests.current.get(type.id) !== request) return;
      setDocs((current) => ({ ...current, [type.id]: { statut: "erreur", fichier: file, erreur: e instanceof Error ? e.message : "Lecture impossible." } }));
    }
  }
  async function compare() {
    if (!cycle || busy || persistent) return;
    const sourceType = types.find((t) => t.role === "source")!, targetType = types.find((t) => t.role === "cible")!;
    const a = docs[sourceType.id], b = docs[targetType.id];
    if (!a?.documentSource || !b?.documentSource) return;
    setBusy(true); setError("");
    try {
      const validPeriod = issues.length === 0 ? qualification.period : undefined;
      const silo = buildRapprochementDepuisDepot(cycle.id, a.documentSource, b.documentSource, null, validPeriod?.closingDate.replaceAll("-", ""), qualification.technicalToleranceEur);
      await updateSnapshot((current) => addRapprochementToSnapshot(current, {
        cycleId: cycle.id, silo, qualification,
        documents: [a, b].map((doc) => ({ id: doc.documentSource!.id, fileName: doc.fichier!.name, fingerprint: doc.fingerprint!, lineCount: doc.documentSource!.lignes.length, parserVersion: doc.documentSource!.parserVersion, mappingVersion: doc.documentSource!.mappingVersion })),
      }));
      setChanged(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Comparaison impossible."); }
    finally { setBusy(false); }
  }
  const ready = types.length === 2 && types.every((t) => docs[t.id]?.statut === "ok");
  const inputClass = "mt-1 w-full rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1.5 text-sm";
  return <section aria-label="Dépôt historique des onze cycles" className="space-y-4">
    <p className="text-xs text-[var(--pb-text-muted)]">Mode navigateur : lecture des CSV/XLSX sur cet appareil. Les résultats, les empreintes et les références de lignes sont conservés dans la session de cet onglet ; les fichiers originaux ne sont pas archivés. Cette comparaison ne constitue pas une preuve opposable ni une couverture du cycle.</p>
    <fieldset disabled={busy || persistent} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {AUDIT_CYCLES.map((c) => <CycleCard key={c.id} cycle={c} active={c.id === cycleId} onClick={() => selectCycle(c.id)} />)}
    </fieldset>
    {persistent && <p role="alert">Dossier persistant : ces cartes ne disposent pas du raccord durable autorisé. Dépôt et écriture bloqués.</p>}
    {cycle && <>
      <fieldset id="qualification-depot" disabled={busy || persistent} className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <legend className="px-1 text-sm font-semibold">Qualification — {cycle.nom}</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs">Entité<input className={inputClass} value={entity} onChange={(e) => changeParameter(() => setEntity(e.target.value))} /></label>
          <label className="text-xs">Début de période<input type="date" className={inputClass} value={startDate} onChange={(e) => changeParameter(() => setStartDate(e.target.value))} /></label>
          <label className="text-xs">Clôture<input type="date" className={inputClass} value={closingDate} onChange={(e) => changeParameter(() => setClosingDate(e.target.value))} /></label>
          <label className="text-xs">Date de revue<input type="date" className={inputClass} value={asOfDate} onChange={(e) => changeParameter(() => setAsOfDate(e.target.value))} /></label>
        </div>
        <p className="mt-3 text-xs">Bases de comparaison : {types.map((t) => t.libelle).join(" ↔ ")}. Montants signés en EUR ; regroupement par {cycle.config.cles.find((c) => ["tiers", "compte", "piece"].includes(c))}.</p>
        <label className="mt-3 block text-xs"><input type="checkbox" checked={confirmed} onChange={(e) => { setConfirmed(e.target.checked); invalidate("Qualification modifiée : comparaison à relancer."); }} /> Je confirme la même entité, période, clôture, périmètre et convention de signe dans les deux documents.</label>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
          <label>Tolérance technique (EUR)<input type="number" min="0" step="0.01" className={inputClass} value={tolerance} onChange={(e) => changeParameter(() => setTolerance(e.target.value))} /></label>
          <p>Sélection : toutes les lignes importées. Aucun seuil de sélection hérité des exemples.</p>
          <p>Signification : seuil absent, importance non évaluée. La tolérance technique ne vaut pas matérialité.</p>
        </div>
        <p className="mt-3 text-xs">Statut des paramètres : {issues.length ? "incomplets — diagnostic uniquement" : "confirmés pour la comparaison"}.</p>
      </fieldset>
      <fieldset disabled={busy || persistent} className="space-y-3">{types.map((t) => <DocumentDropRow key={t.id} documentType={t} state={docs[t.id] ?? { statut: "vide" }} onFile={(file) => void handleFile(t, file)} />)}</fieldset>
      <div className="rounded-xl border border-[var(--pb-border)] p-3 text-xs">
        <button type="button" disabled={!ready || busy || persistent} onClick={() => void compare()} className="rounded-lg border border-[var(--pb-border)] px-3 py-2 disabled:opacity-50">{busy ? "Enregistrement…" : issues.length ? "Comparer — diagnostic bloqué" : "Comparer les documents"}</button>
        {!ready && <p className="mt-2">Deux documents lisibles sont requis pour comparer.</p>}
        {issues.length > 0 && <div className="mt-2"><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul><a href="#qualification-depot" className="underline">Renseigner les paramètres et vérifier les sources A/B</a></div>}
        <p className="mt-2">Le dépôt seul n’exécute aucun contrôle. Le diagnostic reste bloqué si la qualification manque.</p>
      </div>
    </>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {changed && history.length > 0 && <p role="status" className="text-xs">Résultats précédents périmés ; comparaison à relancer après l’import ou la qualification.</p>}
    {!changed && active && <RapprochementResult key={active.id} run={active} />}
    {history.length > 0 && <details className="text-xs"><summary>Historique : {history.length} exécution(s) périmée(s)</summary>{history.map((run) => <p key={run.id}>Version {run.version} — périmée — {run.staleReason} ({run.silo.findings.length} anciens constats exclus des résultats actifs)</p>)}</details>}
    {cycleId && <button type="button" disabled={busy} onClick={() => selectCycle(null)} className="flex items-center gap-2 text-xs"><RotateCcw className="h-3.5 w-3.5" />Fermer les fichiers ouverts</button>}
  </section>;
}

function CycleCard({
  cycle,
  active,
  onClick,
}: {
  cycle: AuditCycle;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors",
        active
          ? "border-[var(--pb-accent)] bg-[var(--pb-accent)]/8"
          : "border-[var(--pb-border)] bg-[var(--pb-surface)] hover:border-[var(--pb-border-strong)]",
      )}
    >
      <div className="text-sm font-semibold text-[var(--pb-text)]">{cycle.nom}</div>
      <div className="text-[12px] text-[var(--pb-text-muted)]">{cycle.description}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {cycle.famillesComptes.map((f) => (
          <span
            key={f}
            className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--pb-text-faint)]"
          >
            {f}
          </span>
        ))}
      </div>
    </button>
  );
}

function extAccept(documentType: DocumentType): string {
  return documentType.formats.map((f) => `.${f}`).join(",");
}

function DocumentDropRow({
  documentType,
  state,
  onFile,
}: {
  documentType: DocumentType;
  state: DocState;
  onFile: (fichier: File) => void;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      role="button"
      tabIndex={0}
      aria-label={`Déposer ${documentType.libelle}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors",
        drag
          ? "border-[var(--pb-accent)] bg-[var(--pb-accent)]/8"
          : "border-[var(--pb-border-strong)] bg-[var(--pb-surface)] hover:border-[var(--pb-accent)]/60",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        aria-label={`Fichier ${documentType.libelle}`}
        accept={extAccept(documentType)}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <UploadCloud className="mt-0.5 h-6 w-6 shrink-0 text-[var(--pb-accent)]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--pb-text)]">
            {documentType.libelle}
          </span>
          <span className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
            {documentType.role === "source" ? "Document A" : "Document B"}
          </span>
        </div>
        <div className="mt-0.5 text-[12px] text-[var(--pb-text-muted)]">
          {documentType.description}
        </div>
        <DocStateIndicator state={state} />
      </div>
    </div>
  );
}

function DocStateIndicator({ state }: { state: DocState }) {
  if (state.statut === "en_cours") {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[var(--pb-accent)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Lecture en cours…
      </div>
    );
  }
  if (state.statut === "ok") {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#22c55e]">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {state.documentSource?.lignes.length ?? 0} ligne(s) lue(s)
        {state.fichier && (
          <span className="text-[var(--pb-text-faint)]"> · {state.fichier.name}</span>
        )}
      </div>
    );
  }
  if (state.statut === "erreur") {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#ef4444]">
        <XCircle className="h-3.5 w-3.5" />
        {state.erreur}
      </div>
    );
  }
  return (
    <div className="mt-1.5 text-[12px] text-[var(--pb-text-faint)]">
      Aucun fichier déposé — cliquez ou glissez ici.
    </div>
  );
}


const STATUS = { rapproche: "Rapprochées", ecart: "Non rapprochées", ambigu: "Ambiguës", non_testable: "Non testables" };
const euro = (value: number) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export function RapprochementResult({ run }: { run: UploadExecution }) {
  const [selected, setSelected] = useState<number | null>(null);
  const result = run.silo.rapprochement;
  if (!result) return <p>Résultat historique non qualifié : comparaison à relancer.</p>;
  const group = selected === null ? null : result.groupes[selected];
  return <div key={run.id} className="space-y-4" aria-label="Résultat de comparaison">
    <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4 text-xs">
      <h3 className="text-sm font-semibold">{run.silo.statement.titre}</h3>
      <p className="mt-2">Version {run.version} · {run.qualification.entity || "Entité inconnue"} · {run.qualification.period ? `${run.qualification.period.startDate} → ${run.qualification.period.closingDate}` : "Période inconnue"}</p>
      <p className="mt-2 font-semibold">{run.status === "blocked" ? "Bloquée — diagnostic exportable, aucun contrôle concluant" : run.status === "inconclusive" ? "Comparaison partiellement non concluante" : "Comparaison exécutée sur les éléments fournis"}</p>
      {run.issues.map((issue) => <p key={issue}>{issue}</p>)}
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt>Total net A</dt><dd className="tnum">{euro(result.totalSource)}</dd></div>
        <div><dt>Total net B</dt><dd className="tnum">{euro(result.totalCible)}</dd></div>
        <div><dt>Écart net</dt><dd className="tnum">{euro(result.ecartGlobal)}</dd></div>
        <div><dt>Écarts bruts sans compensation</dt><dd className="tnum">{euro(result.ecartBrut)}</dd></div>
        {Object.entries(STATUS).map(([key, label]) => { const count = result.lignes[key as keyof typeof STATUS]; return <div key={key}><dt>Lignes {label.toLowerCase()}</dt><dd>A : {count.source} · B : {count.cible}</dd></div>; })}
      </dl>
      <p className="mt-3">Part de lignes univoques concordantes : {(result.tauxRapprochement * 100).toFixed(1)} %. L’égalité des totaux nets ne démontre pas l’exhaustivité. Les groupes multiples restent ambigus ; l’âge et le lettrage ne mesurent aucune perte.</p>
      <p className="mt-2">Signification : {run.qualification.materialityAmount === null ? "non évaluée (seuil absent)" : euro(run.qualification.materialityAmount)}. Prochaine action : justifier les écarts, lever les ambiguïtés et revoir les sources avant toute conclusion de cycle.</p>
    </div>
    <div className="overflow-x-auto rounded-xl border border-[var(--pb-border)] p-4 text-xs">
      <table className="w-full text-left"><caption className="mb-2 text-left font-semibold">Groupes et sources</caption><thead><tr><th>Clé</th><th>Statut</th><th>A</th><th>B</th><th>Écart brut</th><th>Détail</th></tr></thead><tbody>{result.groupes.map((g, i) => <tr key={`${g.cle}-${i}`} onDoubleClick={() => setSelected(i)} className="border-t border-[var(--pb-border)]"><td className="py-2">{g.cle}</td><td>{STATUS[g.statut]}</td><td className="tnum">{euro(g.montantSource)}</td><td className="tnum">{euro(g.montantCible)}</td><td className="tnum">{euro(g.ecartBrut)}</td><td><button type="button" aria-expanded={selected === i} onClick={() => setSelected(selected === i ? null : i)} className="px-2 underline">Détails {g.cle}</button></td></tr>)}</tbody></table>
      {group && <section aria-label={`Sources du groupe ${group.cle}`} className="mt-3 rounded-lg border border-[var(--pb-border)] p-3"><h4 className="font-semibold">{group.cle} — {STATUS[group.statut]}</h4><p>{group.cause}</p>{(["source", "cible"] as const).map((side) => <div key={side} className="mt-2"><h5>Document {side === "source" ? "A" : "B"}</h5>{group[side].length === 0 ? <p>Aucune ligne dans ce document.</p> : group[side].map((line) => { const doc = run.documents.find((d) => d.id === line.documentId); return <p key={`${line.documentId}-${line.line}`}>{doc?.fileName ?? line.documentId} · ligne {line.line} · {euro(line.montant)}{line.piece ? ` · pièce ${line.piece}` : ""}{line.date ? ` · date ${line.date}` : ""} · empreinte {doc?.fingerprint.slice(0, 12) ?? "inconnue"}</p>; })}</div>)}</section>}
    </div>
    <div className="rounded-xl border border-[var(--pb-border)] p-4 text-xs"><h3>{run.silo.findings.length} constat(s) actif(s) — un constat n’est pas un contrôle exécuté</h3><ul className="mt-2 space-y-2">{run.silo.findings.map((f) => <li key={f.id} className="flex gap-3"><SeverityBadge severity={f.severity} /><div><strong>{f.titre}</strong><p>{f.constat}</p></div></li>)}</ul></div>
    <details className="text-xs"><summary>Détail technique de l’exécution</summary><pre className="mt-2 overflow-auto">{JSON.stringify(run, null, 2)}</pre></details>
  </div>;
}
