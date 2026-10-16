"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { PROOF_CASES, PROOF_STEPS } from "./content";
import s from "./landing.module.css";

type Decision = "validated" | "dismissed" | undefined;

const MARK_KINDS = ["tick", "tick", "square", "circle", "diamond"] as const;

/**
 * 03 · Dossier de preuve : la chaîne source → transformation → règle → résultat → décision, reliée par la
 * ligne de preuve. Trois constats de démonstration en onglets ; « Valider » et « Écarter » ne font que
 * montrer l'état de la décision : rien n'est enregistré depuis la landing.
 */
export function EvidenceChain() {
  const [tab, setTab] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const base = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = PROOF_CASES[tab];
  const decision = decisions[current.id];

  const decide = (next: Exclude<Decision, undefined>) =>
    setDecisions((state) => ({ ...state, [current.id]: state[current.id] === next ? undefined : next }));

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = PROOF_CASES.length - 1;
    const target = event.key === "ArrowRight" ? (index === last ? 0 : index + 1) : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (target === null) return;
    event.preventDefault();
    setTab(target);
    tabRefs.current[target]?.focus();
  };

  const detail = (step: number) => {
    if (step < 4) return current.chain[step];
    return decision === "validated" ? "Validé par l’auditeur" : decision === "dismissed" ? "Écarté par l’auditeur" : "En attente de revue";
  };
  const status =
    decision === "validated"
      ? `${current.id} validé. La décision est horodatée et rejoint le dossier de preuve.`
      : decision === "dismissed"
        ? `${current.id} écarté. Le motif est consigné ; le constat sort de l’exposition.`
        : `${current.id} attend la décision de l’auditeur. Rien n’est validé automatiquement.`;

  return (
    <section id="preuve" aria-labelledby="preuve-t" className={s.section}>
      <div className={s.sectionHead}>
        <span className={s.sectionNum}>03</span>
        <h2 id="preuve-t" className={s.h2}>Dossier de preuve</h2>
      </div>
      <p className={s.sectionLead}>
        Une chaîne reconstituable pour chaque constat, de la ligne source à la décision de l’auditeur. La validation consigne un jugement ; elle ne vaut pas certification.
      </p>
      <div role="tablist" aria-label="Constats de démonstration" className={s.tabs}>
        {PROOF_CASES.map((item, i) => (
          <button
            key={item.id}
            ref={(node) => {
              tabRefs.current[i] = node;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={tab === i}
            aria-controls={`${base}-panel`}
            tabIndex={tab === i ? 0 : -1}
            className={s.tab}
            onClick={() => setTab(i)}
            onKeyDown={(event) => onTabKeyDown(event, i)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${tab}`} tabIndex={0} className={s.chainScroll}>
        <div className={s.chainWrap}>
          <span aria-hidden="true" className={s.chainLine} />
          <span aria-hidden="true" className={s.chainLast} data-decision={decision} />
          <ol className={s.chain}>
            {PROOF_STEPS.map((step, i) => (
              <li key={step} className={s.chainNode}>
                <div className={s.chainMarkRow}>
                  <span className={s.chainMark} data-kind={MARK_KINDS[i]} data-decision={i === 4 ? decision : undefined} />
                </div>
                <div className={s.chainStep}>{step}</div>
                <div className={s.chainDetail}>{detail(i)}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className={s.decisionBar}>
        <p aria-live="polite" className={s.status}>{status}</p>
        <div className={s.decisionButtons}>
          <button type="button" aria-pressed={decision === "validated"} className={s.btnValidate} onClick={() => decide("validated")}>
            Valider
          </button>
          <button type="button" aria-pressed={decision === "dismissed"} className={s.btnDismiss} onClick={() => decide("dismissed")}>
            Écarter
          </button>
        </div>
      </div>
      <p className={s.simulation}>Illustration : ces constats sont ceux de la démonstration, la décision n’est enregistrée nulle part.</p>
    </section>
  );
}
