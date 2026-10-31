"use client";

import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import p from "@/components/charte/page.module.css";
import { SeverityMark } from "@/components/charte/SeverityMark";
import { AUDIT_CYCLES, documentTypesForCycle, type AuditCycle, type DocumentType } from "@/lib/rapprochement/catalog";
import { parseTabularDocument } from "@/lib/rapprochement/parse-upload";
import { buildRapprochementDepuisDepot } from "@/lib/rapprochement/build-from-upload";
import type { DocumentSource } from "@/lib/rapprochement/types";
import { qualificationIssues, type UploadExecution, type UploadQualification } from "@/lib/rapprochement/upload-contract";
import { addRapprochementToSnapshot, invalidateRapprochementInSnapshot } from "@/lib/dossier";
import { useActiveDossier } from "@/lib/dossier/client";
import x from "./depot.module.css";

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
  return <section aria-label="Dépôt historique des onze cycles">
    <p className={x.text}>Mode navigateur : lecture des CSV/XLSX sur cet appareil. Les résultats, les empreintes et les références de lignes sont conservés dans la session de cet onglet ; les fichiers originaux ne sont pas archivés. Cette comparaison ne constitue pas une preuve opposable ni une couverture du cycle.</p>
    <fieldset disabled={busy || persistent} className={x.fieldset}>
      <legend className={x.srOnly}>Cycle à rapprocher</legend>
      <ul className={x.cycleList}>
        {AUDIT_CYCLES.map((c) => <li key={c.id}><CycleCard cycle={c} active={c.id === cycleId} onClick={() => selectCycle(c.id)} /></li>)}
      </ul>
    </fieldset>
    {persistent && <p role="alert" className={x.blocked}>Dossier persistant : ces cartes ne disposent pas du raccord durable autorisé. Dépôt et écriture bloqués.</p>}
    {cycle && <>
      <fieldset id="qualification-depot" disabled={busy || persistent} className={`${x.fieldset} ${x.qualification}`}>
        <legend className={x.legend}>Qualification — {cycle.nom}</legend>
        <div className={x.fields}>
          <label className={x.label}><span>Entité</span><input className={p.input} value={entity} onChange={(e) => changeParameter(() => setEntity(e.target.value))} /></label>
          <label className={x.label}><span>Début de période</span><input type="date" className={p.input} value={startDate} onChange={(e) => changeParameter(() => setStartDate(e.target.value))} /></label>
          <label className={x.label}><span>Clôture</span><input type="date" className={p.input} value={closingDate} onChange={(e) => changeParameter(() => setClosingDate(e.target.value))} /></label>
          <label className={x.label}><span>Date de revue</span><input type="date" className={p.input} value={asOfDate} onChange={(e) => changeParameter(() => setAsOfDate(e.target.value))} /></label>
        </div>
        <p className={x.small}>Bases de comparaison : {types.map((t) => t.libelle).join(" ↔ ")}. Montants signés en EUR ; regroupement par {cycle.config.cles.find((c) => ["tiers", "compte", "piece"].includes(c))}.</p>
        <label className={x.check}><input type="checkbox" checked={confirmed} onChange={(e) => { setConfirmed(e.target.checked); invalidate("Qualification modifiée : comparaison à relancer."); }} /> <span>Je confirme la même entité, période, clôture, périmètre et convention de signe dans les deux documents.</span></label>
        <div className={`${x.fields} ${x.spaced}`}>
          <label className={x.label}><span>Tolérance technique (EUR)</span><input type="number" min="0" step="0.01" className={p.input} value={tolerance} onChange={(e) => changeParameter(() => setTolerance(e.target.value))} /></label>
          <p className={x.small}>Sélection : toutes les lignes importées. Aucun seuil de sélection hérité des exemples.</p>
          <p className={x.small}>Signification : seuil absent, importance non évaluée. La tolérance technique ne vaut pas matérialité.</p>
        </div>
        <p className={x.small}>Statut des paramètres : {issues.length ? "incomplets — diagnostic uniquement" : "confirmés pour la comparaison"}.</p>
      </fieldset>
      <fieldset disabled={busy || persistent} className={`${x.fieldset} ${x.docRows}`}>
        <legend className={x.srOnly}>Documents à comparer</legend>
        {types.map((t) => <DocumentDropRow key={t.id} documentType={t} state={docs[t.id] ?? { statut: "vide" }} onFile={(file) => void handleFile(t, file)} />)}
      </fieldset>
      <div className={x.compare}>
        <button type="button" disabled={!ready || busy || persistent} onClick={() => void compare()} className={p.btnPrimary}>{busy ? "Enregistrement…" : issues.length ? "Comparer — diagnostic bloqué" : "Comparer les documents"}</button>
        {!ready && <p className={x.small}>Deux documents lisibles sont requis pour comparer.</p>}
        {issues.length > 0 && <div><ul className={x.issues}>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul><a href="#qualification-depot" className={x.link}>Renseigner les paramètres et vérifier les sources A/B</a></div>}
        <p className={x.small}>Le dépôt seul n’exécute aucun contrôle. Le diagnostic reste bloqué si la qualification manque.</p>
      </div>
    </>}
    {error && <p role="alert" className={x.blocked}>{error}</p>}
    {changed && history.length > 0 && <p role="status" className={x.statusLine}>Résultats précédents périmés ; comparaison à relancer après l’import ou la qualification.</p>}
    {!changed && active && <RapprochementResult key={active.id} run={active} />}
    {history.length > 0 && <details className={x.details}><summary>Historique : {history.length} exécution(s) périmée(s)</summary>{history.map((run) => <p key={run.id}>Version {run.version} — périmée — {run.staleReason} ({run.silo.findings.length} anciens constats exclus des résultats actifs)</p>)}</details>}
    {cycleId && <p><button type="button" disabled={busy} onClick={() => selectCycle(null)} className={p.btnQuiet}>Fermer les fichiers ouverts</button></p>}
  </section>;
}

/** Ligne d'un cycle : bouton dont le nom accessible commence par le nom du cycle ; le cycle ouvert est marqué par un trait. */
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
    <button type="button" onClick={onClick} aria-pressed={active} className={x.cycleButton}>
      <span className={x.cycleName}>{cycle.nom}</span>
      <span className={x.cycleDesc}>{cycle.description}</span>
      <span className={x.cycleAccounts}>{cycle.famillesComptes.join(" · ")}</span>
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
  const stateId = useId();

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
      aria-describedby={stateId}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
      onClick={() => inputRef.current?.click()}
      data-drag={drag ? "" : undefined}
      className={x.docRow}
    >
      <input
        ref={inputRef}
        type="file"
        aria-label={`Fichier ${documentType.libelle}`}
        accept={extAccept(documentType)}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <span className={x.docHead}>
        <span className={x.docName}>{documentType.libelle}</span>
        <span className={p.key}>{documentType.role === "source" ? "Document A" : "Document B"}</span>
      </span>
      <span className={x.docText}>{documentType.description}</span>
      <DocStateIndicator id={stateId} state={state} />
    </div>
  );
}

function DocStateIndicator({ id, state }: { id: string; state: DocState }) {
  if (state.statut === "en_cours") {
    return <span id={id} className={x.docState}>Lecture en cours…</span>;
  }
  if (state.statut === "ok") {
    return (
      <span id={id} className={x.docState}>
        {state.documentSource?.lignes.length ?? 0} ligne(s) lue(s)
        {state.fichier && <span className={p.faint}> · {state.fichier.name}</span>}
      </span>
    );
  }
  if (state.statut === "erreur") {
    return (
      <span id={id} className={x.docState} data-tone="error">
        Fichier refusé : {state.erreur}
      </span>
    );
  }
  return <span id={id} className={x.docState}>Aucun fichier déposé — cliquez, appuyez sur Entrée ou glissez un fichier ici.</span>;
}


const STATUS = { rapproche: "Rapprochées", ecart: "Non rapprochées", ambigu: "Ambiguës", non_testable: "Non testables" };
const euro = (value: number) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export function RapprochementResult({ run }: { run: UploadExecution }) {
  const [selected, setSelected] = useState<number | null>(null);
  const result = run.silo.rapprochement;
  if (!result) return <p className={x.statusLine}>Résultat historique non qualifié : comparaison à relancer.</p>;
  const group = selected === null ? null : result.groupes[selected];
  return <section key={run.id} className={x.run} aria-label="Résultat de comparaison">
    <h3 className={x.runTitle}>{run.silo.statement.titre}</h3>
    <p className={x.small}>Version {run.version} · {run.qualification.entity || "Entité inconnue"} · {run.qualification.period ? `${run.qualification.period.startDate} → ${run.qualification.period.closingDate}` : "Période inconnue"}</p>
    <p className={x.runStatus}>{run.status === "blocked" ? "Bloquée — diagnostic exportable, aucun contrôle concluant" : run.status === "inconclusive" ? "Comparaison partiellement non concluante" : "Comparaison exécutée sur les éléments fournis"}</p>
    {run.issues.map((issue) => <p key={issue} className={x.small}>{issue}</p>)}
    <dl className={`${p.readouts} ${x.runReadouts}`}>
      <div><dt>Total net A</dt><dd>{euro(result.totalSource)}</dd></div>
      <div><dt>Total net B</dt><dd>{euro(result.totalCible)}</dd></div>
      <div><dt>Écart net</dt><dd>{euro(result.ecartGlobal)}</dd></div>
      <div><dt>Écarts bruts sans compensation</dt><dd>{euro(result.ecartBrut)}</dd></div>
      {Object.entries(STATUS).map(([key, label]) => { const count = result.lignes[key as keyof typeof STATUS]; return <div key={key}><dt>Lignes {label.toLowerCase()}</dt><dd>A : {count.source} · B : {count.cible}</dd></div>; })}
    </dl>
    <p className={x.small}>Part de lignes univoques concordantes : {(result.tauxRapprochement * 100).toFixed(1)} %. L’égalité des totaux nets ne démontre pas l’exhaustivité. Les groupes multiples restent ambigus ; l’âge et le lettrage ne mesurent aucune perte.</p>
    <p className={x.small}>Signification : {run.qualification.materialityAmount === null ? "non évaluée (seuil absent)" : euro(run.qualification.materialityAmount)}. Prochaine action : justifier les écarts, lever les ambiguïtés et revoir les sources avant toute conclusion de cycle.</p>
    <div role="region" aria-label="Groupes et sources, défilement horizontal" tabIndex={0} className={`${p.scrollX} ${x.tableWrap}`}>
      <table className={`${p.register} ${x.groups}`}>
        <caption className={x.caption}>Groupes et sources</caption>
        <thead><tr><th scope="col">Clé</th><th scope="col">Statut</th><th scope="col" className={p.num}>A</th><th scope="col" className={p.num}>B</th><th scope="col" className={p.num}>Écart brut</th><th scope="col">Détail</th></tr></thead>
        <tbody>{result.groupes.map((g, i) => <tr key={`${g.cle}-${i}`} onDoubleClick={() => setSelected(i)} data-selected={selected === i ? "" : undefined}><td className={p.mono}>{g.cle}</td><td>{STATUS[g.statut]}</td><td className={p.num}>{euro(g.montantSource)}</td><td className={p.num}>{euro(g.montantCible)}</td><td className={p.num}>{euro(g.ecartBrut)}</td><td><button type="button" aria-expanded={selected === i} onClick={() => setSelected(selected === i ? null : i)} className={p.btnQuiet}>Détails {g.cle}</button></td></tr>)}</tbody>
      </table>
    </div>
    {group && <section aria-label={`Sources du groupe ${group.cle}`} className={`${p.panel} ${x.groupPanel}`}><div className={p.panelSection}><h4 className={x.groupTitle}>{group.cle} — {STATUS[group.statut]}</h4><p className={x.small}>{group.cause}</p>{(["source", "cible"] as const).map((side) => <div key={side}><h5 className={x.groupSide}>Document {side === "source" ? "A" : "B"}</h5>{group[side].length === 0 ? <p className={x.groupLine}>Aucune ligne dans ce document.</p> : group[side].map((line) => { const doc = run.documents.find((d) => d.id === line.documentId); return <p key={`${line.documentId}-${line.line}`} className={x.groupLine}>{doc?.fileName ?? line.documentId} · ligne {line.line} · {euro(line.montant)}{line.piece ? ` · pièce ${line.piece}` : ""}{line.date ? ` · date ${line.date}` : ""} · empreinte {doc?.fingerprint.slice(0, 12) ?? "inconnue"}</p>; })}</div>)}</div></section>}
    <h4 className={x.subhead}>{run.silo.findings.length} constat(s) actif(s) — un constat n’est pas un contrôle exécuté</h4>
    <ul className={x.findings}>{run.silo.findings.map((f) => <li key={f.id}><SeverityMark severity={f.severity} label /><div><strong>{f.titre}</strong><p>{f.constat}</p></div></li>)}</ul>
    <details className={x.details}><summary>Détail technique de l’exécution</summary><pre className={x.pre}>{JSON.stringify(run, null, 2)}</pre></details>
  </section>;
}
