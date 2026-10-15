"use client";
import { eventDenominatorText, type ClosingEventEffects, type EventDenominators } from "@/lib/workpapers/closing-events";
import { effectStageLabel, eventSourceText } from "@/lib/workpapers/closing-projection";
import { formatCents } from "@/lib/workpapers/stock-contract";
import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import { euros } from "./format";
import cl from "./closing.module.css";

const cents = (value: number | null) => formatCents(value === null ? null : String(value));
const SENS = { increase: "hausse", decrease: "baisse" } as const;
const ACCOUNTING_LABELS: Record<string, string> = { inconclusive: "Non concluant", divergent: "Observations divergentes", not_evaluated: "Non évalué" };

/** The single sentence of the event effects denominators, as the server states it (cockpit, coverage map, synthesis and export). */
export function EventEffectsCount({ d, reason, testId }: { d: EventDenominators; reason: string | null; testId: string }) {
  return <span data-testid={testId}>{eventDenominatorText(d, reason)}</span>;
}

/**
 * Effects of the transversal events map, beside the journaled misstatements and never added to them: per event, the effect counted once with its
 * C05 stage, and every source sheet at its exact version placed in its dossier lineage. Presentation only.
 */
export function EventEffectsSection({ events, d }: { events: ClosingEventEffects; d: EventDenominators }) {
  return <section className={cl.section} aria-labelledby="cl-synth-events">
    <h2 id="cl-synth-events">Effets des événements transversaux <span>carte C11 · projection C05 · lecture seule</span></h2>
    <p className={cl.small}><EventEffectsCount d={d} reason={events.reason} testId="synthesis-events"/>{events.map ? <> · carte {events.map.version} <span className={cl.hash}>{events.map.hash.slice(0, 12)}…</span> · revue au {events.map.period.asOfDate}</> : null}</p>
    <p className={cl.notice}>{events.notice}</p>
    {events.status === "lue" ? <>
      <ul className={cl.totals} aria-label="Pont C05 des effets par poste et sens">
        {events.stages.map(st => <li key={st.target + st.direction}>Résultat · {SENS[st.direction]} — en attente <strong>{cents(st.pendingCents)}</strong> · corrigé <strong>{cents(st.correctedCents)}</strong> · résiduel <strong>{cents(st.residualCents)}</strong>{st.proposedCents ? <> · proposé <strong>{cents(st.proposedCents)}</strong></> : null}{st.undeterminedCents ? <> · indéterminé (hors agrégat) {cents(st.undeterminedCents)}</> : null}</li>)}
        {!events.stages.length ? <li>Aucun candidat technique compté : aucun effet à projeter.</li> : null}
        <li className={cl.small}>Tenus par poste et par sens : jamais additionnés entre eux ni aux anomalies journalisées.</li>
      </ul>
      {events.effects.length ? <div className={cl.tableScroll} role="region" tabIndex={0} aria-label="Effets des événements : compté une fois, étape et feuilles sources"><table className={`${cl.grid} ${cl.journey} ${cl.effects}`}>
        <caption className="sr-only">Effets des événements transversaux : montant compté une fois, étape C05, part en attente, corrigée et résiduelle, feuilles sources à leur version exacte.</caption>
        <thead><tr><th scope="col">Événement</th><th scope="col" className={cl.num}>Compté une fois</th><th scope="col">Étape C05</th><th scope="col" className={cl.num}>En attente</th><th scope="col" className={cl.num}>Corrigé</th><th scope="col" className={cl.num}>Résiduel</th><th scope="col">Feuilles sources (version exacte, lignée du dossier)</th></tr></thead>
        <tbody>{events.effects.map(x => <tr key={x.eventId} data-event={x.invoiceId}>
          <td><strong>{x.invoiceId}</strong> · {x.flow === "sale" ? "Vente" : "Achat"} · {x.party}<br/><span className={cl.small}>{x.candidate ?? "—"}{x.account ? " · " + x.account : ""}{x.procedureTitle ? " · " + x.procedureTitle : ""}</span>{!x.inProgramme ? <><br/><span className={cl.pill} data-tone="open">Observé hors programme du dossier</span></> : null}</td>
          <td className={cl.num}>{x.countedCents !== null ? cents(x.countedCents) : "Inconnu"}<br/><span className={cl.small}>{SENS[x.direction]} du résultat · {x.contributors} observation(s)</span></td>
          <td>{effectStageLabel(x)}</td>
          <td className={cl.num}>{x.bridge ? cents(x.bridge.pendingCents) : "—"}</td><td className={cl.num}>{x.bridge ? cents(x.bridge.correctedCents) : "—"}</td><td className={cl.num}>{x.bridge ? cents(x.bridge.residualCents) : "—"}</td>
          <td><ul className={cl.sources}>{x.sources.map(s => <li key={s.procedure + s.runId + s.version}><DossierContextAnchor href={s.href}>{eventSourceText(s)}</DossierContextAnchor></li>)}</ul></td>
        </tr>)}</tbody></table></div> : null}
      <h3 className={cl.subhead}>Candidats sans effet compté</h3>
      {events.withoutEffect.length ? <ul className={cl.remaining}>{events.withoutEffect.map(x => <li key={x.eventId} data-event={x.invoiceId}>
        <strong>{x.invoiceId}</strong> · {x.flow === "sale" ? "Vente" : "Achat"} · {x.party} — <span className={cl.pill} data-tone="danger">{ACCOUNTING_LABELS[x.accounting] ?? x.accounting}</span> {x.candidates.join(", ")} : montant inconnu, aucun effet compté<br/><span className={cl.small}>{x.reason}</span>
        <ul className={cl.sources}>{x.sources.map(s => <li key={s.procedure + s.runId + s.version}>{eventSourceText(s)}{s.amount.kind === "known" ? " · montant observé " + euros(s.amount.value.amount) + " HT, non compté" : s.reasons.length ? " · " + s.reasons.join(", ") : ""}</li>)}</ul></li>)}</ul>
        : <p className={cl.small}>Aucun candidat suspendu, divergent ou seulement périmé.</p>}
    </> : null}
  </section>;
}
