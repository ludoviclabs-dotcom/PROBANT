"use client";
import { eventDenominatorText, type ClosingEventEffects, type DossierEventEffect, type EventDecisionView, type EventDenominators } from "@/lib/workpapers/closing-events";
import { effectStageLabel, eventSourceText } from "@/lib/workpapers/closing-projection";
import type { PieceVersion } from "@/lib/workpapers/closing-journal";
import { formatCents } from "@/lib/workpapers/stock-contract";
import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import { CitationPicker, Cites, readCitations } from "./ProcedurePanel";
import { euros, stampFr } from "./format";
import cl from "./closing.module.css";

const cents = (value: number | null) => formatCents(value === null ? null : String(value));
const SENS = { increase: "hausse", decrease: "baisse" } as const;
const ACCOUNTING_LABELS: Record<string, string> = { inconclusive: "Non concluant", divergent: "Observations divergentes", not_evaluated: "Non évalué" };
const STATE_LABELS: Record<EventDecisionView["state"], string> = { appliquee: "s’applique", a_reexaminer: "à réexaminer", remplacee: "remplacée par la correction", non_appliquee: "non appliquée", non_verifiable: "non vérifiable" };
const BASIS_LABELS = { autre_personne: "revue par une autre personne", personnelle: "relecture personnelle nommée", simulation: "seconde identité simulée (ne vaut pas appréciation)" } as const;
type Send = (body: Record<string, unknown>) => Promise<boolean>;
/** Review actions on an effect, in the Anomalies tab only; the synthesis stays a reading. */
export interface EventActions { canPrepare: boolean; canReview: boolean; send: Send; busy: boolean; pieces: PieceVersion[]; download?: (id: string) => string }
const submit = (send: Send, build: (f: FormData) => Record<string, unknown>) => async (ev: React.FormEvent<HTMLFormElement>) => { ev.preventDefault(); const form = ev.currentTarget; if (await send(build(new FormData(form)))) form.reset(); };

/** The single sentence of the event effects denominators, as the server states it (cockpit, coverage map, synthesis and export). */
export function EventEffectsCount({ d, reason, testId }: { d: EventDenominators; reason: string | null; testId: string }) {
  return <span data-testid={testId}>{eventDenominatorText(d, reason)}</span>;
}

function Decisions({ list, download }: { list: EventDecisionView[]; download?: (id: string) => string }) {
  return <>{list.map(v => <div key={v.kind + v.seq} className={cl.decision} data-state={v.state}>
    <p className={cl.small}><strong>{v.kind === "correction" ? (v.correctedCents !== null ? "Correction partielle " + cents(v.correctedCents) : "Correction") : "Appréciation"}</strong> — {STATE_LABELS[v.state]}{v.reasons.length ? " : " + v.reasons.join(" ; ") : ""}</p>
    <p className={cl.small}>{v.text}</p>
    <p className={cl.who}>{v.by} · {stampFr(v.at)}{v.assessedBy ? " · " + BASIS_LABELS[v.assessedBy] : ""} · effet vu : {cents(v.basis.countedCents)}, {SENS[v.basis.direction]}, carte <span className={cl.hash}>{v.mapHash.slice(0, 12)}…</span></p>
    {v.kind === "correction" ? <Cites list={v.citations} download={download}/> : null}
  </div>)}</>;
}

function Forms({ x, a }: { x: DossierEventEffect; a: EventActions }) {
  if (!x.basisHash || x.status !== "determined" || x.decisions.some(v => v.kind === "correction" && v.state === "appliquee") || x.decisions.some(v => v.state === "non_appliquee")) return null;
  const base = { eventId: x.eventId, basisHash: x.basisHash }, picker = "ec-" + x.invoiceId;
  return <>
    {a.canPrepare ? <details><summary>Documenter la correction</summary><form className={cl.form} onSubmit={submit(a.send, f => ({ command: "correct_event_effect", ...base, text: f.get("text"), citations: readCitations(f, picker),
      ...(f.get("corrected") ? { correctedAmount: { amount: String(f.get("corrected")).replace(",", "."), currency: "EUR" } } : {}) }))}>
      <label>Correction (écriture passée par l’entité, référence)<textarea name="text" required maxLength={1000}/></label>
      <label>Montant corrigé si partiel, positif (vide = correction totale de {cents(x.countedCents)})<input name="corrected" pattern="\d+([.,]\d{2})" inputMode="decimal"/></label>
      <CitationPicker pieces={a.pieces} name={picker} label="Pièces du dossier qui établissent la correction" required/><button className={cl.submit} disabled={a.busy}>Enregistrer la correction</button></form></details> : null}
    {a.canReview && !x.decisions.some(v => v.kind === "assessment" && v.state === "appliquee") ? <details><summary>Apprécier l’effet non corrigé</summary><form className={cl.form} onSubmit={submit(a.send, f => ({ command: "assess_event_effect", ...base, text: f.get("text") }))}>
      <label>Appréciation (humaine, sans opinion générée)<textarea name="text" required maxLength={1500}/></label><button className={cl.submit} disabled={a.busy}>Enregistrer l’appréciation</button></form></details> : null}
  </>;
}

/**
 * Effects of the transversal events map, beside the journaled misstatements and never added to them: per event, the effect counted once, its
 * C05 stage after the file's review decision, and every source sheet at its exact version placed in its dossier lineage. Presentation only.
 */
export function EventEffectsSection({ events, d, actions, headingId = "cl-synth-events" }: { events: ClosingEventEffects; d: EventDenominators; actions?: EventActions; headingId?: string }) {
  return <section className={cl.section} aria-labelledby={headingId}>
    <h2 id={headingId}>Effets des événements transversaux <span>carte C11 · projection C05 · décisions du dossier</span></h2>
    <p className={cl.small}><EventEffectsCount d={d} reason={events.reason} testId={actions ? "anomalies-events" : "synthesis-events"}/>{events.map ? <> · carte {events.map.version} <span className={cl.hash}>{events.map.hash.slice(0, 12)}…</span> · revue au {events.map.period.asOfDate}</> : null}</p>
    <p className={cl.notice}>{events.notice}</p>
    {events.status === "lue" ? <>
      <ul className={cl.totals} aria-label="Pont C05 des effets par poste et sens">
        {events.stages.map(st => <li key={st.target + st.direction}>Résultat · {SENS[st.direction]} — en attente <strong>{cents(st.pendingCents)}</strong> · apprécié non corrigé <strong>{cents(st.proposedCents)}</strong> · corrigé <strong>{cents(st.correctedCents)}</strong> · résiduel <strong>{cents(st.residualCents)}</strong>{st.undeterminedCents ? <> · indéterminé (hors agrégat) {cents(st.undeterminedCents)}</> : null}</li>)}
        {!events.stages.length ? <li>Aucun candidat technique compté : aucun effet à projeter.</li> : null}
        <li className={cl.small}>Tenus par poste et par sens : jamais additionnés entre eux ni aux anomalies journalisées.</li>
      </ul>
      {events.effects.length ? <div className={cl.tableScroll} role="region" tabIndex={0} aria-label={actions ? "Effets des événements à traiter : étape, décision et feuilles sources" : "Effets des événements : compté une fois, étape et feuilles sources"}><table className={`${cl.grid} ${cl.journey} ${cl.effects}`}>
        <caption className="sr-only">Effets des événements transversaux : montant compté une fois, étape C05 et décision du dossier, pont C05 de l’effet, feuilles sources à leur version exacte.</caption>
        <thead><tr><th scope="col">Événement</th><th scope="col" className={cl.num}>Compté une fois</th><th scope="col">Étape et décision</th><th scope="col">Pont C05 de l’effet</th><th scope="col">Feuilles sources (version exacte, lignée du dossier)</th></tr></thead>
        <tbody>{events.effects.map(x => <tr key={x.eventId} data-event={x.invoiceId}>
          <td><strong>{x.invoiceId}</strong> · {x.flow === "sale" ? "Vente" : "Achat"} · {x.party}<br/><span className={cl.small}>{x.candidate ?? "—"}{x.account ? " · " + x.account : ""}{x.procedureTitle ? " · " + x.procedureTitle : ""}</span>{!x.inProgramme ? <><br/><span className={cl.pill} data-tone="open">Observé hors programme du dossier</span></> : null}</td>
          <td className={cl.num}>{x.countedCents !== null ? cents(x.countedCents) : "Inconnu"}<br/><span className={cl.small}>{SENS[x.direction]} du résultat · {x.contributors} observation(s)</span></td>
          <td><span className={cl.stageText} data-tone={x.stage === "corrected" ? "ok" : x.stage === "proposed" ? "open" : "danger"}>{effectStageLabel(x)}</span><Decisions list={x.decisions} download={actions?.download}/>{actions ? <Forms x={x} a={actions}/> : null}</td>
          <td>{x.bridge ? <ul className={cl.sources}><li>En attente {cents(x.bridge.pendingCents)}</li><li>Apprécié non corrigé {cents(x.bridge.proposedCents)}</li><li>Corrigé {cents(x.bridge.correctedCents)}</li><li>Résiduel {cents(x.bridge.residualCents)}</li></ul> : <span className={cl.small}>Aucun montant retenu (groupe non déterminé)</span>}</td>
          <td><ul className={cl.sources}>{x.sources.map(s => <li key={s.procedure + s.runId + s.version}><DossierContextAnchor href={s.href}>{eventSourceText(s)}</DossierContextAnchor></li>)}</ul></td>
        </tr>)}</tbody></table></div> : null}
      <h3 className={cl.subhead}>Candidats sans effet compté</h3>
      {events.withoutEffect.length ? <ul className={cl.remaining}>{events.withoutEffect.map(x => <li key={x.eventId} data-event={x.invoiceId}>
        <strong>{x.invoiceId}</strong> · {x.flow === "sale" ? "Vente" : "Achat"} · {x.party} — <span className={cl.pill} data-tone="danger">{ACCOUNTING_LABELS[x.accounting] ?? x.accounting}</span> {x.candidates.join(", ")} : montant inconnu, aucun effet compté<br/><span className={cl.small}>{x.reason}</span>
        <ul className={cl.sources}>{x.sources.map(s => <li key={s.procedure + s.runId + s.version}>{eventSourceText(s)}{s.amount.kind === "known" ? " · montant observé " + euros(s.amount.value.amount) + " HT, non compté" : s.reasons.length ? " · " + s.reasons.join(", ") : ""}</li>)}</ul></li>)}</ul>
        : <p className={cl.small}>Aucun candidat suspendu, divergent ou seulement périmé.</p>}
    </> : null}
    {events.orphanDecisions.length ? <><h3 className={cl.subhead}>Décisions sans effet dans la carte</h3><ul className={cl.remaining}>{events.orphanDecisions.map(o => <li key={o.eventId} data-event={o.invoiceId}>
      <strong>{o.invoiceId}</strong> · {o.party} — {o.reason}<Decisions list={o.decisions} download={actions?.download}/></li>)}</ul></> : null}
  </section>;
}
