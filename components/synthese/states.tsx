import type { ReactNode } from "react";
import s from "./states.module.css";

/**
 * États de l'écran Synthèse : chargement, vide, erreur. Même langue visuelle que la page : une ligne de preuve
 * (repère, trait, cercle, carré) dont l'état change, un titre serif, des faits et des actions. Un chargement n'a de
 * progression que si elle est réelle (`steps`) ; sans étape connue il dit seulement ce qu'il fait, sans boucle.
 */

type StepState = "fait" | "en cours" | "à venir";

export function LoadingState({ title, label, steps }: { title: string; label: string; steps?: readonly { text: string; state: StepState }[] }) {
  const done = steps ? steps.filter((step) => step.state === "fait").length : 0;
  const current = steps ? Math.min(steps.length, done + (steps.some((step) => step.state === "en cours") ? 1 : 0)) : 0;
  return (
    <section role="status" aria-busy="true" aria-label="Chargement du snapshot" className={s.state}>
      <p className={s.eyebrow}>{steps ? `${label} · étape ${current} / ${steps.length}` : label}</p>
      <h1 className={`${s.title} ${s.titleSoft}`}>{title}</h1>
      {steps && (
        <>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={current} aria-label="Progression" className={s.progress}>
            <div className={s.progressTrack} />
            <div className={s.progressFill} style={{ width: `${steps.length > 1 ? ((current - 1) / (steps.length - 1)) * 100 : 100}%` }} />
            {steps.map((step, i) => (
              <span key={step.text} className={s.progressTick} data-state={step.state} style={{ left: `${steps.length > 1 ? (i / (steps.length - 1)) * 100 : 0}%` }} />
            ))}
          </div>
          <ol className={s.steps}>
            {steps.map((step, i) => (
              <li key={step.text} data-state={step.state}>
                <span className={s.stepNum}>{String(i + 1).padStart(2, "0")}</span>
                <span>{step.text}</span>
                <span className={s.stepState}>{step.state}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** Ligne de preuve interrompue (erreur) ou en attente (vide) : repère, trait, cercle ou croix, carré. */
function ProofLineState({ kind }: { kind: "empty" | "error" }) {
  const ink = { stroke: "var(--pb-ink)" };
  const faint = { stroke: "var(--pb-rule-strong)" };
  return (
    <svg viewBox="0 0 600 24" width="100%" height={24} aria-hidden="true" focusable="false" className={s.proofLine}>
      <line x1={0.5} y1={4} x2={0.5} y2={20} strokeWidth={1} style={ink} />
      {kind === "empty" ? (
        <>
          <line x1={0} y1={12} x2={600} y2={12} strokeWidth={1} strokeDasharray="3 4" style={faint} />
          <circle cx={300} cy={12} r={5} strokeWidth={1} style={{ ...faint, fill: "var(--pb-bg)" }} />
          <rect x={588} y={6} width={12} height={12} fill="none" strokeWidth={1} style={faint} />
        </>
      ) : (
        <>
          <line x1={0} y1={12} x2={216} y2={12} strokeWidth={1} style={ink} />
          <line x1={226} y1={5} x2={240} y2={19} strokeWidth={1.6} style={{ stroke: "var(--pb-signal)" }} />
          <line x1={240} y1={5} x2={226} y2={19} strokeWidth={1.6} style={{ stroke: "var(--pb-signal)" }} />
          <line x1={250} y1={12} x2={600} y2={12} strokeWidth={1} strokeDasharray="3 4" style={faint} />
        </>
      )}
    </svg>
  );
}

export function EmptyState({ lead, actions }: { lead: string; actions: ReactNode }) {
  return (
    <section aria-label="Aucune source" className={s.state}>
      <p className={s.eyebrow}>Dossier sans source</p>
      <h1 className={s.title}>Aucun FEC n’a été déposé pour ce dossier.</h1>
      <p className={s.lead}>{lead}</p>
      <ProofLineState kind="empty" />
      <div className={s.actions}>{actions}</div>
    </section>
  );
}

export function ErrorState({ eyebrow, title, facts, actions }: { eyebrow: string; title: string; facts: readonly [string, string][]; actions: ReactNode }) {
  return (
    <section role="alert" aria-label="Erreur de lecture" className={s.state}>
      <p className={`${s.eyebrow} ${s.eyebrowAlert}`}>{eyebrow}</p>
      <h1 className={s.title}>{title}</h1>
      <ProofLineState kind="error" />
      <dl className={s.facts}>
        {facts.map(([term, detail]) => (
          <div key={term} className={s.fact}>
            <dt>{term}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
      </dl>
      <div className={s.actions}>{actions}</div>
    </section>
  );
}
