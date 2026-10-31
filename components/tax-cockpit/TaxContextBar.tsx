"use client";

/**
 * Barre de contexte (collante dès 760 px) : exercice et devise, avancement de la revue (une seule instance,
 * responsive), statut d'attention en glyphe + mot et empreinte du snapshot. L'entrée « Importer mon FEC » est
 * l'action principale de l'en-tête de page (`PageIntro`, app/dashboard/fiscalite/page.tsx).
 * Le référentiel, la politique de statut et les moteurs vivent dans le volet « Méthodologie & traçabilité »
 * (jamais affichés en permanence).
 */

import { useEffect, useId, useRef, useState } from "react";
import p from "@/components/charte/page.module.css";
import { REFERENTIEL_VERSION, decrireReferentiel } from "@/lib/referentiel/edition";
import { formatIsoDate, type StepperStep, type TaxCockpitSummary } from "@/lib/tax/cockpit";
import { OutcomeGlyph, outcomeOfLabel } from "./OutcomeMark";
import x from "./fiscalite.module.css";

/** Registre chargé sur ce poste : les moteurs fiscaux (lib/tax) ne le lisent pas. */
const REGISTRE = decrireReferentiel(REFERENTIEL_VERSION);

const STEP_STATE_WORD: Readonly<Record<StepperStep["state"], string>> = {
  done: " — franchie",
  current: " — en cours",
  pending: " — à venir",
};

export function TaxContextBar({
  summary,
  steps,
}: {
  summary: TaxCockpitSummary;
  steps: readonly StepperStep[];
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const copyHash = () => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(summary.snapshotHash).then(
      () => {
        setCopied(true);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  };

  const attention = summary.headlineTone === "warning" || summary.headlineTone === "critical";
  const shortHash = summary.snapshotHash.slice(0, 8);

  return (
    <div ref={rootRef} className={x.context} data-tax-context="">
      <div className={x.contextRow}>
        <p className={x.contextPeriod}>
          <span className={x.contextYear}>Exercice {summary.fiscalYear}</span>
          <span className={x.contextDates}>
            {summary.periodStartDate && summary.periodEndDate
              ? `${formatIsoDate(summary.periodStartDate)} → ${formatIsoDate(summary.periodEndDate)} · ${summary.currency}`
              : summary.currency}
          </span>
        </p>

        <ol aria-label="Étapes de la revue fiscale" className={x.stepper}>
          {steps.map((step) => (
            <li key={step.id} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
              <StepGlyph state={step.state} />
              <span>
                {step.label}
                <span className="sr-only">{STEP_STATE_WORD[step.state]}</span>
              </span>
            </li>
          ))}
        </ol>

        <span className={x.headline} title={summary.headlineDetail} data-attention={attention ? "" : undefined}>
          <span className={x.headlineGlyph}>
            <OutcomeGlyph outcome={outcomeOfLabel(summary.headlineLabel)} />
          </span>
          <span className="sr-only">Statut d&apos;attention le plus prioritaire : </span>
          {summary.headlineLabel}
        </span>

        <button
          type="button"
          className={x.hashButton}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`Méthodologie et empreinte du snapshot ${shortHash}`}
          title={`${summary.snapshotHash.slice(0, 16)}…`}
          onClick={() => setOpen((o) => !o)}
        >
          empreinte <span className={x.mono}>{shortHash}</span>
        </button>
      </div>

      {open && (
        <div id={panelId} className={x.popover}>
          <p className={p.key}>Méthodologie &amp; traçabilité</p>
          <dl className={x.popList}>
            <PopRow term="Empreinte du snapshot">
              <span className={x.breakAll}>{summary.snapshotHash.slice(0, 16)}…</span>
              <button type="button" className={x.inlineAction} onClick={copyHash}>
                {copied ? "Empreinte copiée" : "Copier l'empreinte"}
              </button>
            </PopRow>
            <PopRow term="Politique de statut">{summary.headlinePolicyVersion}</PopRow>
            <PopRow term="Moteurs">
              {summary.engineVersions.length > 0
                ? summary.engineVersions.map((version) => (
                    <span key={version} className={x.block}>
                      {version}
                    </span>
                  ))
                : "aucun"}
            </PopRow>
            <PopRow term="Snapshot fiscal">généré le {summary.generatedAt.slice(0, 10)}</PopRow>
            <PopRow term="Registre normatif">
              {REGISTRE.libelle} · les moteurs fiscaux ne lisent pas ce registre
              <span className={x.popDetail}>{REGISTRE.detail}</span>
            </PopRow>
          </dl>
          <p className={x.popFoot}>
            Le statut affiché est le premier de l&apos;ordre de présentation de la taxonomie, pas une note globale.
          </p>
        </div>
      )}
    </div>
  );
}

function PopRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Franchie : coche ; en cours : disque plein ; à venir : anneau. Le mot (texte masqué) dit l'état. */
function StepGlyph({ state }: { state: StepperStep["state"] }) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" focusable="false" className={x.glyph}>
      {state === "done" ? (
        <path d="M2 6.2 4.8 9 10 3" fill="none" strokeWidth={1.5} style={{ stroke: "var(--pb-ink-2)" }} />
      ) : state === "current" ? (
        <circle cx={6} cy={6} r={4.5} style={{ fill: "var(--pb-ink)" }} />
      ) : (
        <circle cx={6} cy={6} r={4} fill="none" strokeWidth={1.2} style={{ stroke: "var(--pb-ink-3)" }} />
      )}
    </svg>
  );
}
