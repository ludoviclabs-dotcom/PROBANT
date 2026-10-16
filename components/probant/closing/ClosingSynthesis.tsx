"use client";
import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import { CL_MILESTONE_LABELS, CL_MILESTONES, CL_THRESHOLD_LABELS, CL_THRESHOLD_SOURCES, CL_THRESHOLDS } from "@/lib/workpapers/closing-contract";
import type { ProjectionRow, ProjectionSheet } from "@/lib/workpapers/closing-projection";
import { CitationPicker, readCitations } from "./ProcedurePanel";
import { dateFr, euros, stampFr, STEP_STATE_LABELS, TONE, type ClosingView } from "./format";
import { STATE_LABELS } from "../cash/format";
import { EventEffectsSection } from "./ClosingEventEffects";
import type { ProcedureStatus } from "@/lib/workpapers/closing-evaluate";
import cl from "./closing.module.css";

type Send = (body: Record<string, unknown>) => Promise<boolean>;
const submit = (send: Send, build: (f: FormData) => Record<string, unknown>) => async (ev: React.FormEvent<HTMLFormElement>) => { ev.preventDefault(); const form = ev.currentTarget; if (await send(build(new FormData(form)))) form.reset(); };
const EXPORTS: { format: string; label: string }[] = [{ format: "html", label: "Rapport HTML" }, { format: "pdf", label: "PDF" }, { format: "json", label: "JSON canonique" }, { format: "procedures_csv", label: "CSV procédures" },
  { format: "sheets_csv", label: "CSV feuilles" }, { format: "findings_csv", label: "CSV constats" }, { format: "journal_csv", label: "CSV journal" }, { format: "manifest", label: "Manifeste" }];
const EXCLUSION_LABELS: Record<string, string> = { procedure_non_applicable: "Procédure non applicable", couple_non_applicable: "Couple non applicable", demande_annulee: "Demande annulée", feuille_ecartee: "Feuille écartée", capacite_cycle: "Limite de capacité du cycle" };
const DATE_SOURCES: Record<string, string> = { exercice: "Exercice", journal: "Journal", feuille: "Feuille observée", declaree: "Déclarée" };
const sheetLine = (s: ProjectionSheet) => "r" + s.revision + " v" + s.version + " · " + (STATE_LABELS[s.state] ?? s.state) + " · " + (s.populationSize !== null ? s.populationSize + (s.populationSize > 1 ? " éléments" : " élément") : "population non figée") + " · " + dateFr(s.period.startDate) + " → " + dateFr(s.period.closingDate);

function Covered({ r }: { r: ProjectionRow }) {
  if (r.notApplicable) return <span>Non applicable : {r.notApplicable.reason}</span>;
  if (r.sheet) return <span>{r.sheet.label} · racine {r.sheet.rootId}<br/><span className={cl.small}>{sheetLine(r.sheet)} · {r.sheet.binding === "explicite" ? "périmètre : " + (r.sheet.perimeter ?? "—") : "rattachement implicite (feuille unique)"}{r.sheet.drift ? " · rattachement à confirmer" : ""}</span><br/><span className={cl.hash}>{r.sheet.runId} · {r.sheet.contentHash.slice(0, 12)}…</span></span>;
  if (r.manual) return <span>{r.manual.records} travail(aux) · {r.manual.population ?? "population non définie"}<br/><span className={cl.small}>{r.manual.steps.length ? r.manual.steps.map(s => s.label + " : " + (STEP_STATE_LABELS[s.state as keyof typeof STEP_STATE_LABELS] ?? s.state)).join(" · ") + " · " : ""}{r.manual.conclusion ? "conclusion " + (r.manual.conclusion.stale ? "périmée" : "du " + stampFr(r.manual.conclusion.at)) : "conclusion attendue"}{r.manual.review ? " · " + r.manual.review.basis + " (" + r.manual.review.by + ")" : ""}</span></span>;
  return <span className={cl.small}>Aucune feuille retenue</span>;
}
function Result({ r }: { r: ProjectionRow }) {
  if (r.sheet) return <span>{r.sheet.result === "inconclusive" ? <strong>Non concluant</strong> : r.sheet.result === "exceptions_detected" ? "Exceptions conservées" : r.sheet.result === "no_exception_detected" ? "Aucune exception sur le périmètre testé" : "Non exécutée"}
    {r.sheet.sourcesCurrent === false ? <><br/><span className={cl.pill} data-tone="danger">Source remplacée</span></> : null}{r.sheet.openBlockingNotes ? <><br/><span className={cl.small}>{r.sheet.openBlockingNotes} point(s) bloquant(s)</span></> : null}</span>;
  if (r.manual) return <span>{r.manual.results.sans_exception} sans exception · {r.manual.results.exceptions} avec exceptions · {r.manual.results.non_concluant ? <strong>{r.manual.results.non_concluant} non concluant(s)</strong> : "0 non concluant"}<br/><span className={cl.small}>{r.evidence.pieces} pièce(s){r.evidence.representationOnly ? " · déclaration seule" : ""}{r.evidence.superseded ? " · " + r.evidence.superseded + " citation(s) remplacée(s)" : ""}</span></span>;
  return <span>—</span>;
}

/** Dossier journey: per cycle, what each programme procedure covers and where it stands; the other sheets stay listed. Read from the single server projection. */
export function ClosingSynthesis({ view, onOpen, canPrepare, send, busy, exportHref }: { view: ClosingView; onOpen: (id: string, origin: HTMLElement) => void; canPrepare: boolean; send: Send; busy: boolean; exportHref?: (format: string) => string }) {
  const p = view.projection, d = p.denominators, f = p.findings;
  return <div>
    <section aria-labelledby="cl-synth">
      <h2 id="cl-synth">Synthèse des travaux</h2>
      <p className={cl.small} data-testid="synthesis-denominator">Mêmes dénominateurs que la carte de couverture, le bandeau et l’export : <strong>{d.procedures.done} / {d.procedures.applicable}</strong> procédures revues par une autre personne{d.procedures.donePersonal !== d.procedures.done ? " · " + d.procedures.donePersonal + " relues, relecture personnelle incluse" : ""} · <strong>{d.pairs.reviewed} / {d.pairs.counted}</strong> couples · <strong>{d.engines.locked} / {d.engines.applicable}</strong> feuilles verrouillées · {d.sheets.toAssign} feuille(s) à rattacher, {d.sheets.excluded} écartée(s), {d.sheets.outsideProgram} hors programme.</p>
      <nav aria-label="Cycles du dossier" className={cl.cycleNav}>{p.cycles.map(c => <a key={c.cycle} href={"#cyc-" + c.cycle}>{c.label} <span>{c.rows.filter(r => r.done).length}/{c.rows.filter(r => r.applicable).length}</span></a>)}</nav>
      {exportHref ? <div className={cl.exports} role="group" aria-label={"Exporter cette projection (empreinte " + p.hash.slice(0, 12) + "…)"}>
        <span className={cl.small}>Exporter l’état #{p.journal.seq} · {p.hash.slice(0, 12)}…</span>
        {EXPORTS.map(x => <DossierContextAnchor key={x.format} href={exportHref(x.format)} download>{x.label}</DossierContextAnchor>)}</div> : <p className={cl.small}>Export réservé aux identités autorisées à télécharger.</p>}
    </section>

    {p.cycles.map(c => <section key={c.cycle} id={"cyc-" + c.cycle} className={cl.lane} aria-labelledby={"cyc-h-" + c.cycle}>
      <div className={cl.laneHead}><h3 id={"cyc-h-" + c.cycle}>{c.label}</h3>
        <ul className={cl.chips} aria-label="Risques du cycle">{c.risks.map(r => <li key={r.riskId} className={cl.chip}>{r.riskId} · {r.label}</li>)}</ul></div>
      {c.rows.length ? <div className={cl.tableScroll} role="region" tabIndex={0} aria-label={"Procédures du cycle " + c.label}><table className={`${cl.grid} ${cl.journey}`}>
        <caption className="sr-only">Procédures du cycle {c.label} : état, ce qui est couvert, résultats, constats et reste à faire.</caption>
        <thead><tr><th scope="col">Procédure</th><th scope="col">État</th><th scope="col">Ce qui est couvert</th><th scope="col">Résultat et pièces</th><th scope="col">Constats</th><th scope="col">Reste à faire</th></tr></thead>
        <tbody>{c.rows.map(r => <tr key={r.procedureId}>
          <td><button type="button" className={cl.link} onClick={ev => onOpen(r.procedureId, ev.currentTarget)}>{r.procedureId} · {r.label}</button><br/><span className={cl.small}>{r.natureLabel} · {r.owner}</span></td>
          <td><span className={cl.statusText}><span className={cl.station} data-tone={TONE[r.status as ProcedureStatus]} aria-hidden="true"/>{r.statusLabel}</span>{r.reviewBasis ? <><br/><span className={cl.small}>{r.reviewBasis}</span></> : null}</td>
          <td><Covered r={r}/></td><td><Result r={r}/></td>
          <td>{[...r.misstatements, ...r.contradictions, ...r.openPoints].join(", ") || <span className={cl.small}>—</span>}</td>
          <td>{r.remaining.length ? <span>{r.remaining.length} élément(s)<br/><span className={cl.small}>{r.remaining[0]}</span></span> : <span className={cl.small}>{r.applicable ? "Aucun travail restant détecté — pas une attestation" : "Exclue"}</span>}{r.limits.length ? <><br/><span className={cl.small}>⚠ {r.limits.join(" ")}</span></> : null}</td>
        </tr>)}</tbody></table></div> : <p className={cl.small}>Aucune procédure du programme sur ce cycle.</p>}
      {c.otherSheets.length ? <><h4 className={cl.subhead}>Autres feuilles listées</h4><ul className={cl.remaining}>{c.otherSheets.map(s => <li key={s.procedure + s.rootId}>
        {s.label} · racine {s.rootId} · {sheetLine(s)} — <span className={cl.pill} data-tone={s.assignment === "ecartee" ? "muted" : "danger"}>{s.assignmentLabel}</span>{s.exclusion ? <span className={cl.small}> · motif : {s.exclusion.reason}</span> : null}
        {s.previousRevisions.length ? <span className={cl.small}> · révisions antérieures : {s.previousRevisions.map(x => "r" + x.revision + " " + (STATE_LABELS[x.state] ?? x.state)).join(", ")}</span> : null}</li>)}</ul></> : null}
    </section>)}
    {!p.cycles.length ? <p className={cl.small}>Aucun risque, procédure ni feuille : le programme est vide.</p> : null}

    <section className={cl.section} aria-labelledby="cl-synth-findings">
      <h2 id="cl-synth-findings">Corrections, preuves nouvelles et anomalies résiduelles <span>vocabulaire C05 : corrigé, résiduel, en attente</span></h2>
      <ul className={cl.totals}><li>Corrigé (connu) <strong>{euros(f.totals.knownCorrected.amount)}</strong></li><li>Non corrigé (connu) <strong>{euros(f.totals.knownUncorrected.amount)}</strong></li><li>Résiduel connu <strong>{euros(f.totals.knownResidual.amount)}</strong></li>
        <li>{f.totals.unknownUncorrected} montant(s) inconnu(s) non corrigé(s), jamais comptés pour zéro</li></ul>
      <div className={cl.tableScroll} role="region" tabIndex={0} aria-label={"Anomalies : relevé, corrigé, résiduel"}><table className={`${cl.grid} ${cl.journey}`}>
        <caption className="sr-only">Anomalies : montant relevé, étape, part corrigée, reste résiduel et preuve nouvelle.</caption>
        <thead><tr><th scope="col">Anomalie</th><th scope="col">Étape</th><th scope="col" className={cl.num}>Relevé</th><th scope="col" className={cl.num}>Corrigé</th><th scope="col" className={cl.num}>Résiduel</th><th scope="col">Preuve nouvelle</th></tr></thead>
        <tbody>{f.misstatements.map(m => <tr key={m.id}><td><strong>{m.id}</strong> · {m.description}<br/><span className={cl.small}>{m.cycle}{m.procedureId ? " · " + m.procedureId : ""}</span></td><td>{m.stageLabel}{m.assessedBy ? <><br/><span className={cl.small}>{m.assessedBy}</span></> : null}</td>
          <td className={cl.num}>{m.amount}</td><td className={cl.num}>{m.corrected ?? "—"}</td><td className={cl.num}>{m.residual ?? "—"}</td><td>{m.freshEvidence.length ? m.freshEvidence.join(", ") : <span className={cl.small}>—</span>}<br/><span className={cl.small}>révélée par {m.originalEvidence.join(", ")}</span></td></tr>)}</tbody>
      </table></div>
      {!f.misstatements.length ? <p className={cl.small}>Aucune anomalie relevée.</p> : null}
      <h3 className={cl.subhead}>Contradictions</h3>
      {f.contradictions.length ? <ul className={cl.remaining}>{f.contradictions.map(c => <li key={c.id}><strong>{c.id}</strong> · {c.description} — <span className={cl.pill} data-tone={c.status === "resolue" ? "ok" : "danger"}>{c.status === "resolue" ? "Résolue" : c.status === "ouverte" ? "Ouverte" : "Résolution à réexaminer"}</span>
        {c.laterRepresentations.length ? <span className={cl.small}> · déclaration de la direction reçue depuis ({c.laterRepresentations.join(", ")}) : elle ne clôt pas la contradiction</span> : null}</li>)}</ul> : <p className={cl.small}>Aucune contradiction déclarée.</p>}
    </section>

    <EventEffectsSection events={f.events} d={d.events}/>

    <section className={cl.section} aria-labelledby="cl-synth-dates">
      <h2 id="cl-synth-dates">Dates utiles et seuils documentés</h2>
      <div className={cl.tableScroll} role="region" tabIndex={0} aria-label={"Dates utiles"}><table className={`${cl.grid} ${cl.journey}`}><caption className="sr-only">Dates de l’exercice, du journal, des feuilles et dates déclarées.</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Libellé</th><th scope="col">Origine</th><th scope="col">Auteur ou détail</th></tr></thead>
        <tbody>{p.dates.map(x => <tr key={x.id}><td className={cl.num}>{x.date.length > 10 ? stampFr(x.date) : dateFr(x.date)}</td><td>{x.label}</td><td>{DATE_SOURCES[x.source]}</td><td className={cl.small}>{[x.by, x.detail].filter(Boolean).join(" · ") || "—"}</td></tr>)}</tbody></table></div>
      <p className={cl.small}>Aucune échéance légale n’est calculée : les dates déclarées restent sous la responsabilité de leur auteur.</p>
      <p className={cl.notice}>{p.thresholdNotice}</p>
      {p.thresholds.length ? <div className={cl.tableScroll} role="region" tabIndex={0} aria-label={"Seuils documentés"}><table className={`${cl.grid} ${cl.journey}`}><caption className="sr-only">Seuils documentés, sans comparaison automatique.</caption>
        <thead><tr><th scope="col">Seuil</th><th scope="col" className={cl.num}>Montant</th><th scope="col">Base et pourcentage déclarés</th><th scope="col">Motif</th></tr></thead>
        <tbody>{p.thresholds.map(t => <tr key={t.label}><td>{t.label}<br/><span className={cl.small}>{t.source}</span></td><td className={cl.num}>{t.amount}</td><td>{t.basis ?? "—"}{t.rate ? " · " + t.rate + " % (méthode interne)" : ""}</td><td>{t.rationale}<br/><span className={cl.who}>{t.by} · {stampFr(t.at)}</span></td></tr>)}</tbody></table></div>
        : <p className={cl.small}>Aucun seuil documenté.</p>}
      {canPrepare ? <div className={cl.groups}>
        <details><summary>Déclarer une date utile</summary><form className={cl.form} onSubmit={submit(send, fd => ({ command: "set_milestone", milestone: fd.get("milestone"), ...(fd.get("label") ? { label: fd.get("label") } : {}), date: fd.get("date"), citations: readCitations(fd, "mi") }))}>
          <div className={cl.row}><label>Date<select name="milestone">{CL_MILESTONES.map(m => <option key={m} value={m}>{CL_MILESTONE_LABELS[m]}</option>)}</select></label><label>Le<input type="date" name="date" required/></label></div>
          <label>Libellé (autre date seulement)<input name="label" maxLength={120}/></label><CitationPicker pieces={view.pieces} name="mi"/><button className={cl.submit} disabled={busy}>Enregistrer la date</button></form></details>
        <details><summary>Documenter un seuil</summary><form className={cl.form} onSubmit={submit(send, fd => ({ command: "set_threshold", threshold: fd.get("threshold"),
          amount: fd.get("known") === "known" ? { kind: "known", value: { amount: String(fd.get("amount")).replace(",", "."), currency: "EUR" } } : { kind: "unknown", reason: fd.get("reason") },
          ...(fd.get("basis") ? { basis: fd.get("basis") } : {}), ...(fd.get("rate") ? { rate: String(fd.get("rate")).replace(",", ".") } : {}), rationale: fd.get("rationale"), citations: readCitations(fd, "th") }))}>
          <label>Seuil<select name="threshold">{CL_THRESHOLDS.map(t => <option key={t} value={t}>{CL_THRESHOLD_LABELS[t]} — {CL_THRESHOLD_SOURCES[t]}</option>)}</select></label>
          <div className={cl.row}><label>Montant<select name="known"><option value="known">Connu</option><option value="unknown">Inconnu</option></select></label><label>En euros (ex. 15000.00)<input name="amount" pattern="\d+([.,]\d{2})"/></label><label>Motif si inconnu<input name="reason" maxLength={300}/></label></div>
          <div className={cl.row}><label>Base de référence (facultatif)<input name="basis" maxLength={300}/></label><label>Pourcentage déclaré (méthode interne)<input name="rate" inputMode="decimal" pattern="(100|\d{1,2}([.,]\d{1,2})?)"/></label></div>
          <label>Motif du choix<textarea name="rationale" required maxLength={1000}/></label><CitationPicker pieces={view.pieces} name="th"/><button className={cl.submit} disabled={busy}>Documenter le seuil</button></form></details>
      </div> : null}
    </section>

    <section className={cl.section} aria-labelledby="cl-synth-excl">
      <h2 id="cl-synth-excl">Exclusions encore pertinentes <span>{p.exclusions.length} élément(s) · motivées dans le dossier ou limites de capacité des cycles présents</span></h2>
      <div className={cl.tableScroll} role="region" tabIndex={0} aria-label={"Exclusions encore pertinentes"}><table className={`${cl.grid} ${cl.journey}`}><caption className="sr-only">Exclusions motivées et limites de capacité.</caption>
        <thead><tr><th scope="col">Nature</th><th scope="col">Élément</th><th scope="col">Motif</th></tr></thead>
        <tbody>{p.exclusions.map(x => <tr key={x.kind + x.id}><td>{EXCLUSION_LABELS[x.kind]}</td><td>{x.label}</td><td>{x.reason}</td></tr>)}</tbody></table></div>
      <p className={cl.small}>{p.noOpinion}</p>
    </section>
  </div>;
}
