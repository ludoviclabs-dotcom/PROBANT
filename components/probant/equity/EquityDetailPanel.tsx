"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EQ_DECISION_TEXT, EQ_ENTRY_TEXT, type EquityReading, type EquityResult } from "@/lib/workpapers/equity-review";
import type { EquityFactsView } from "@/lib/workpapers/equity-sources";
import { COMPONENT_LABELS, dateFr, DECISION_TYPE_LABELS, eur, knownLabel, locatorText, NATURE_LABELS, TIMING_LABELS } from "./format";
import { PdfPage } from "./PdfPage";
import type { EquitySelection, EquityView } from "./types";
import styles from "../cash/cash.module.css";
import eq from "./equity.module.css";

export interface EquityDetailHandle { focus(): void }
interface Props {
  selection: EquitySelection; result: EquityResult | null; facts: EquityFactsView | null; readings: EquityReading[]; view: EquityView; dossierId: string; periodId: string;
  canRead: boolean; saving: boolean; onValidateReading(lineId: string, text: string): void; onWithdrawReading(lineId: string): void;
  onDecision(lineId: string): void; onMovement(entryId: string): void; onReturn(): void;
}
/** Side panel: a decision line with its PV at the cited page, or a movement with its decision and source. No opening animation. */
export const EquityDetailPanel = forwardRef<EquityDetailHandle, Props>(function EquityDetailPanel({ selection, result, facts, readings, view, dossierId, periodId, canRead, saving, onValidateReading, onWithdrawReading, onDecision, onMovement, onReturn }, ref) {
  const heading = useRef<HTMLHeadingElement>(null), [reading, setReading] = useState("");
  useImperativeHandle(ref, () => ({ focus: () => heading.current?.focus() }), []);
  useEffect(() => { setReading(""); }, [selection?.kind, selection?.id]);
  const close = (e: React.KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onReturn(); } };
  const download = (id: string) => "/api/workpapers/capitaux-propres?" + new URLSearchParams({ dossierId, periodId, operation: "download", id });
  const canDownload = view.permissions.includes("download");
  if (!selection) return <aside className={styles.detail + " " + eq.panel} aria-label="Détail et source"><h2 ref={heading} tabIndex={-1}>Détail et source</h2><p className={styles.muted}>Choisissez une décision (frise, tableau ou listes) pour voir son PV à la page citée, ou un mouvement du tableau de variation. Échap revient à l’élément d’origine.</p></aside>;
  if (selection.kind === "decision") {
    const d = result?.decisions?.find(x => x.lineId === selection.id) ?? null, fact = facts?.decisions?.find(x => x.lineId === selection.id) ?? null;
    if (!d && !fact) return <aside className={styles.detail + " " + eq.panel} aria-label="Détail et source" onKeyDown={close}><h2 ref={heading} tabIndex={-1}>Décision {selection.id}</h2><p className={styles.muted}>Ligne absente de cette version.</p></aside>;
    const line = d ?? null, label = d?.label || fact?.label || "", pv = facts?.minutes.find(m => m.pieceRef === (d?.pv.pieceRef ?? fact?.minutesRef)) ?? null;
    const page = d?.pv.page ?? fact?.page ?? null, pageValid = !!pv && !!page && page <= pv.pageCount, linked = result?.entries.filter(e => d?.entryIds.includes(e.entryId)) ?? [];
    const payments = result?.payments?.filter(p => d?.paymentIds.includes(p.paymentId)) ?? [];
    const recorded = readings.find(r => r.lineId === selection.id) ?? null;
    // With a result, the server status decides; before execution, the recorded reading of this version is shown as such.
    const validated = d ? (d.reading.status === "validated" && recorded ? recorded : null) : recorded;
    return <aside className={styles.detail + " " + eq.panel} aria-label="Détail et source" onKeyDown={close}>
      <h2 ref={heading} tabIndex={-1}>{(d?.decisionId ?? fact?.decisionId) + " · " + selection.id}{label ? " — " + label : ""}</h2>
      <dl>
        <dt>Type</dt><dd>{DECISION_TYPE_LABELS[(d?.type ?? fact?.type)!]}</dd><dt>Composante</dt><dd>{COMPONENT_LABELS[(d?.component ?? fact?.component)!]}</dd>
        <dt>Organe</dt><dd>{(d?.organ ?? fact?.organ) || "Non indiqué"}</dd><dt>Décision</dt><dd>{dateFr((d?.decisionDate ?? fact?.date)!)}</dd>
        <dt>Effet</dt><dd>{dateFr((d?.effectDate ?? fact?.effectDate)!)}{d ? " · " + TIMING_LABELS[d.timing] : ""}</dd>
      </dl>
      {line ? <>
        <div className={eq.measures} role="group" aria-label="Décision, comptabilisation et paiement">
          <div><small>Décision (voté)</small><strong>{eur(line.voted, { signed: true })}</strong></div>
          <div><small>Comptabilisation</small><strong>{knownLabel(line.booked)}</strong></div>
          <div><small>Paiement</small><strong>{knownLabel(line.payment)}</strong></div>
        </div>
        <p><span className={eq.status} data-status={line.status}>{EQ_DECISION_TEXT[line.status].label}</span> {line.difference.kind === "known" ? "Écart comptabilisé − voté : " + eur(line.difference.value, { signed: true }) + "." : ""}</p>
        <p className={styles.muted}>{line.statusMeaning} Aucune conclusion juridique.</p>
      </> : <p className={styles.notice}>Revue non exécutée : décision, comptabilisation et paiement seront comparés par le serveur.</p>}
      <section className={eq.pv} aria-label="Procès-verbal à la page citée">
        <h3>Procès-verbal</h3>
        {pv ? <dl>
          <dt>Pièce</dt><dd>{pv.pieceRef} · {pv.title}</dd><dt>Fichier</dt><dd>{pv.fileName} · {pv.pageCount} page(s)</dd>
          <dt>Version</dt><dd><code>{pv.documentVersionId}</code></dd><dt>SHA-256</dt><dd><code>{pv.sha256.slice(0, 24)}…</code></dd>
          <dt>Page citée</dt><dd>{page ? "page " + page + (pageValid ? "" : " — absente du PV") : "non indiquée au registre"}{(d?.pv.resolution ?? fact?.resolution) ? " · résolution " + (d?.pv.resolution ?? fact?.resolution) : ""}</dd>
        </dl> : <p className={styles.notice} data-tone="danger">PV absent : {(d?.pv.pieceRef ?? fact?.minutesRef) ? "la pièce « " + (d?.pv.pieceRef ?? fact?.minutesRef) + " » n’est pas fournie" : "aucune référence de PV au registre"}. Décision non appuyée ; aucune lecture possible, aucun montant comparé.</p>}
        {(d?.pv.extract ?? fact?.extract) && <blockquote className={eq.extract}><small className={styles.muted}>Transcription du registre {validated ? "— lecture validée" : "— non validée"}</small><br/>{d?.pv.extract ?? fact?.extract}</blockquote>}
        {pv && pageValid && <PdfPage url={download(pv.documentVersionId)} page={page!} title={pv.title} canDownload={canDownload}/>}
        <h4>Lecture du PV</h4>
        {validated ? <>
          <p>Lecture validée par <strong>{validated.authorId}</strong> le {new Date(validated.authoredAt).toLocaleString("fr-FR")} — cite {validated.pieceRef} · version <code>{validated.documentVersionId}</code> · page {validated.page}.</p>
          <p className={styles.muted}>« {validated.text} »</p>
          {!d && <p className={styles.muted}>Lecture enregistrée sur cette version ; elle sera prise en compte à l’exécution.</p>}
          {canRead && <button type="button" className={styles.danger} disabled={saving} onClick={() => onWithdrawReading(selection.id)}>Retirer cette lecture (retire le résultat courant)</button>}
        </> : pv && pageValid ? canRead ? <>
          <label>Ce que vous avez vérifié à la page {page}<textarea value={reading} onChange={e => setReading(e.target.value)} placeholder="Ex. : résolution 3 relue : dividende de 30,00 voté à l’unanimité des présents."/></label>
          <button type="button" className={styles.primary} disabled={saving || !reading.trim()} onClick={() => onValidateReading(selection.id, reading)}>Valider la lecture — cite {pv.pieceRef} · page {page}</button>
          <p className={styles.muted}>La pièce, la version et la page sont résolues par le serveur. La validation retire le résultat courant : une nouvelle exécution sera requise.</p>
        </> : <p className={styles.muted}>Lecture à valider par le préparateur de cette version.</p> : <p className={styles.muted}>Lecture impossible tant que le PV ou la page citée manque.</p>}
      </section>
      <h3>Écritures rattachées</h3>
      {linked.length ? <ul className={eq.movements}>{linked.map(e => <li key={e.entryId}><button type="button" onClick={() => onMovement(e.entryId)}><span>{e.entryId}</span><span>{dateFr(e.date)}</span><span>{NATURE_LABELS[e.nature]} · effet {dateFr(e.effectDate)}</span><span className={eq.amount}>{eur(e.amount, { signed: true })}</span></button></li>)}</ul> : <p className={styles.muted}>Aucune écriture ne cite cette ligne de décision.</p>}
      <h3>Règlements</h3>
      {payments.length ? <ul className={styles.list}>{payments.map(p => <li key={p.paymentId}>{p.paymentId} · {dateFr(p.date)} · {eur(p.amount)}{p.label ? " · " + p.label : ""}</li>)}</ul> : <p className={styles.muted}>{line ? knownLabel(line.payment) : "Non calculé"}.</p>}
      {fact && <section className={styles.sourceBox} aria-label={"Registre des décisions — " + fact.fileName}><h3>Ligne du registre</h3><dl><dt>Pièce</dt><dd>{fact.fileName}</dd><dt>Localisateur</dt><dd>{locatorText(fact.locator)}</dd><dt>Version</dt><dd><code>{fact.documentVersionId}</code></dd></dl>
        {canDownload && <a href={download(fact.documentVersionId)}>Télécharger l’original (même contrôle d’accès)</a>}</section>}
    </aside>;
  }
  const e = result?.entries.find(x => x.entryId === selection.id) ?? null, fact = facts?.entries.find(x => x.entryId === selection.id) ?? null;
  const base = e ?? fact;
  if (!base) return <aside className={styles.detail + " " + eq.panel} aria-label="Détail et source" onKeyDown={close}><h2 ref={heading} tabIndex={-1}>Écriture {selection.id}</h2><p className={styles.muted}>Écriture absente de cette version.</p></aside>;
  const transfer = e?.transferRef ? result?.transfers.find(t => t.transferRef === e.transferRef) : null, decision = base.decisionRef ? result?.decisions?.find(d => d.lineId === base.decisionRef) : null;
  return <aside className={styles.detail + " " + eq.panel} aria-label="Détail et source" onKeyDown={close}>
    <h2 ref={heading} tabIndex={-1}>Écriture {base.entryId}{base.label ? " — " + base.label : ""}</h2>
    <dl>
      <dt>Compte</dt><dd>{base.account} · {COMPONENT_LABELS[base.component]}</dd><dt>Nature</dt><dd>{NATURE_LABELS[base.nature]}</dd>
      <dt>Montant</dt><dd>{eur(e?.amount ?? fact!.amount, { signed: true })} (sens des capitaux propres)</dd>
      <dt>Date comptable</dt><dd>{dateFr(e?.date ?? fact!.date)}</dd><dt>Date d’effet</dt><dd>{dateFr(base.effectDate)}{e?.effectStatus === "outside_period" && <span className={eq.flag} data-tone="warn">hors période</span>}</dd>
      <dt>Pièce comptable</dt><dd>{base.pieceRef || "—"}</dd>
      <dt>Décision citée</dt><dd>{base.decisionRef ? <button type="button" onClick={() => onDecision(base.decisionRef!)} disabled={!decision}>{base.decisionRef}{decision ? "" : " (absente du registre)"}</button> : "Aucune"}</dd>
      {e && <><dt>Rapprochement</dt><dd>{EQ_ENTRY_TEXT[e.decisionStatus].label} — {EQ_ENTRY_TEXT[e.decisionStatus].meaning}</dd></>}
    </dl>
    {transfer && <section aria-label={"Transfert interne " + transfer.transferRef}><h3>Transfert interne {transfer.transferRef}</h3><ul className={styles.list}>{transfer.lines.map(l => <li key={l.entryId}>{l.entryId === base.entryId ? <strong>{l.entryId}</strong> : <button type="button" onClick={() => onMovement(l.entryId)}>{l.entryId}</button>} · {COMPONENT_LABELS[l.component]} · {eur(l.amount, { signed: true })}</li>)}</ul><p className={styles.muted}>Total du transfert {eur(transfer.total, { signed: true })} : aucun effet sur le total des capitaux propres.</p></section>}
    {fact && <section className={styles.sourceBox} aria-label={"Écritures — " + fact.fileName}><h3>Source</h3><dl><dt>Pièce</dt><dd>{fact.fileName}</dd><dt>Localisateur</dt><dd>{locatorText(fact.locator)}</dd><dt>Version</dt><dd><code>{fact.documentVersionId}</code></dd></dl>
      {canDownload && <a href={download(fact.documentVersionId)}>Télécharger l’original (même contrôle d’accès)</a>}</section>}
  </aside>;
});
