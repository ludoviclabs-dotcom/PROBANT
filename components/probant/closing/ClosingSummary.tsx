"use client";
import type { Indicator } from "@/lib/workpapers/closing-evaluate";
import type { ClosingView } from "./format";
import cl from "./closing.module.css";

const SEGMENT_LABELS = { done: "atteint", partial: "en cours", todo: "à faire", blocked: "bloqué ou manquant" } as const;

/** The honest headline: what is locked, what remains, and that no opinion is generated. */
export function ClosingVerdict({ view }: { view: ClosingView }) {
  const e = view.evaluation, cycles = e.indicators.find(i => i.id === "cycles")!, validated = e.validation.status === "validee";
  const tone = validated ? "ok" : "open";
  return <section className={cl.verdict} data-tone={tone} aria-labelledby="cl-verdict">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
    <div>
      <p id="cl-verdict"><strong>{validated ? "Validation de clôture enregistrée par le professionnel habilité." : cycles.numerator > 0 && !e.closable ? "Des feuilles de cycle sont verrouillées, mais le dossier n’est pas complet." : e.closable ? "Aucun travail restant détecté : la validation reste une décision du professionnel habilité." : "Dossier en cours : un ensemble de cycles n’est pas un audit complet."}</strong></p>
      <ul className={cl.facts}>
        <li><strong>{cycles.numerator} / {cycles.denominator}</strong> feuilles de cycle du programme verrouillées</li>
        <li><strong>{e.blockers.length}</strong> {e.blockers.length > 1 ? "travaux restants ou contradictions" : "travail restant ou contradiction"}</li>
        <li><strong>{e.missing.length}</strong> {e.missing.length > 1 ? "pièces ou éléments manquants" : "pièce ou élément manquant"}</li>
        <li>{e.noOpinion}</li>
      </ul>
    </div>
  </section>;
}

/** Each indicator is a fraction with its unit, its exclusions and one segment per real item (keyboard reachable). */
export function IndicatorLedger({ indicators, onSegment, current }: { indicators: Indicator[]; onSegment: (indicator: string, id: string) => void; current: string | null }) {
  return <section aria-labelledby="cl-indicators">
    <h2 id="cl-indicators" className="sr-only">Indicateurs avec dénominateur</h2>
    <ul className={cl.legend} aria-label="Légende des segments">
      <li><i style={{ background: "var(--ok)" }}/>atteint</li><li><i style={{ background: "linear-gradient(90deg,var(--open) 50%,transparent 50%)", boxShadow: "inset 0 0 0 1px var(--open)" }}/>en cours</li>
      <li><i style={{ boxShadow: "inset 0 0 0 1px #324563" }}/>à faire</li><li><i style={{ background: "repeating-linear-gradient(135deg,var(--danger) 0 2px,transparent 2px 5px)", boxShadow: "inset 0 0 0 1px var(--danger)" }}/>bloqué ou manquant</li>
    </ul>
    <dl className={cl.ledger}>
      {indicators.map(i => <div key={i.id} className={cl.metric}>
        <dt>{i.label}</dt>
        <dd className={cl.fraction}>{i.numerator} / {i.denominator}<small>{i.unit}</small></dd>
        <dd className={cl.stripCell}><div className={cl.strip} role="group" aria-label={i.label + " : " + i.numerator + " sur " + i.denominator + " " + i.unit}>
          {i.segments.length ? i.segments.map(s => <button key={s.id} type="button" className={cl.seg} data-state={s.state} aria-current={current === s.id ? "true" : undefined}
            aria-label={s.label + " (" + SEGMENT_LABELS[s.state] + ")"} title={s.label} onClick={() => onSegment(i.id, s.id)}/>) : <span className={cl.none}>Aucun élément : indicateur non calculable, pas « 100 % ».</span>}
        </div></dd>
        {i.excluded || i.note ? <dd className={cl.metricNote}>{[i.excluded ? "Exclu : " + i.excluded + "." : "", i.note ?? ""].filter(Boolean).join(" ")}</dd> : null}
      </div>)}
    </dl>
  </section>;
}
