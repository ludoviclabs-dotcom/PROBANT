import x from "./depot.module.css";

type StepStatus = "idle" | "processing" | "done" | "error";
type StepState = "done" | "current" | "failed" | "pending";

interface IngestionStepperProps {
  labels: string[];
  activeIndex: number;
  status: StepStatus;
}

const STATE_WORD: Record<StepState, string> = {
  done: "effectuée",
  current: "en cours",
  failed: "interrompue",
  pending: "en attente",
};

/**
 * Fil des étapes RÉELLES du traitement (FEC : état du job serveur ; balance et liasse : lecture locale). L'étape
 * active est « en cours », jamais cochée d'avance ; après une erreur, l'étape atteinte est « interrompue » et les
 * suivantes restent « en attente ». L'état est dit en mots et par le trait, sans animation.
 *
 * Un refus survenu avant toute étape effectuée (format non pris en charge, dossier non persistant, job en échec dès
 * l'empreinte) n'affiche pas le fil : il ne montrerait qu'une étape qui n'a pas eu lieu. Le message d'erreur suffit.
 */
export function IngestionStepper({ labels, activeIndex, status }: IngestionStepperProps) {
  if (status === "idle" || labels.length === 0) return null;
  if (status === "error" && activeIndex === 0) return null;

  const stateOf = (index: number): StepState => {
    if (status === "done" || index < activeIndex) return "done";
    if (index === activeIndex) return status === "error" ? "failed" : "current";
    return "pending";
  };

  const current = labels[activeIndex];
  const summary =
    status === "done"
      ? `Traitement terminé : ${labels.length} étapes sur ${labels.length}.`
      : status === "error"
        ? `Traitement interrompu à l’étape ${activeIndex + 1} sur ${labels.length}${current ? ` : ${current}` : ""}.`
        : `Étape ${activeIndex + 1} sur ${labels.length}${current ? ` : ${current}` : ""} — en cours.`;

  return (
    <div>
      <ol className={x.steps} aria-label="Étapes du traitement">
        {labels.map((label, index) => {
          const state = stateOf(index);
          return (
            <li key={label} className={x.step} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className={x.stepIndex}>{String(index + 1).padStart(2, "0")}</span>
              <span className={x.stepLabel}>{label}</span>
              <span className={x.stepState}>{STATE_WORD[state]}</span>
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className={x.stepStatus}>
        {summary}
      </p>
    </div>
  );
}
