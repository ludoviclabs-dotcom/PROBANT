import type { WorkpaperRun } from "@/lib/workpapers/model";
import type { LeaseResult } from "@/lib/workpapers/lease-review";
import type { LeaseFraming } from "./framing";
import type { LeaseQualification } from "./qualification";

/**
 * Modèle de vue du poste « Locations IFRS 16 » (C02), calculé par le serveur : étapes, actions permises et leur motif, fraîcheur.
 * L'interface n'en déduit rien d'autre : aucune action n'est inférée d'un libellé ou d'un zéro affiché.
 */
export type StepState = "done" | "current" | "todo" | "blocked";
/** Rail métier (L16-04) : Sources → Qualification → Calcul → Retraitements → Revue ; le gel de la population ouvre l'étape Calcul. */
export type StepId = "sources" | "qualification" | "calculation" | "adjustment" | "review";
/** `label` nomme l'étape, `task` dit le travail à faire ; `reason` explique un blocage ou ce qui reste. */
export interface WorkspaceStep { id: StepId; label: string; task: string; state: StepState; reason: string | null; exceptions: number | null }
/** Actions de la feuille ; L16-05 ajoute la résolution des points, la conclusion et les deux exports (diagnostic, revu). */
export type ActionId = "create" | "configure" | "freeze" | "execute" | "revise" | "resolve" | "conclude" | "submit" | "review" | "lock" | "export_diagnostic" | "export_reviewed";
export interface ActionState { allowed: boolean; reason: string | null }
export interface LeaseWorkspaceView {
  mode: "real" | "demo";
  freshness: "current" | "source_replaced" | "rule_replaced" | "no_sheet";
  engine: "computed" | "blocked_rule_review" | "blocked_other" | "not_run";
  steps: WorkspaceStep[];
  actions: Record<ActionId, ActionState>;
}
export interface ViewModelInput {
  mode: "real" | "demo"; run: WorkpaperRun | null; permissions: readonly string[]; actorId: string | null; selfReviewAllowed: boolean;
  sourceTypes: readonly string[]; requiredTypes: readonly string[]; sourcesCurrent: boolean; ruleCurrent: boolean; ruleValidated: boolean; qualification: LeaseQualification | null;
  /** Cadrage des sources (avant ou sans calcul) ; après calcul, le résultat de la feuille fait foi. */
  framing?: LeaseFraming | null;
}
const REVIEW_RULE = "Règle à revoir : la relecture personnelle nommée n'est pas consignée (docs/ifrs/REVUE_REGLE_IFRS16.md)";

export function leaseWorkspaceView(i: ViewModelInput): LeaseWorkspaceView {
  const run = i.run, canPrepare = i.mode === "real" && i.permissions.includes("prepare"), canReview = i.mode === "real" && i.permissions.includes("review") && (!run || i.actorId !== run.preparedBy || i.selfReviewAllowed);
  const missingTypes = i.requiredTypes.filter(t => !i.sourceTypes.includes(t)), sourcesReady = missingTypes.length === 0 || !!run?.population;
  const toQualify = i.qualification?.contracts.filter(c => c.status === "a_qualifier").length ?? null;
  const preparer = !!run && run.preparedBy === i.actorId, fresh = i.sourcesCurrent && i.ruleCurrent, canDownload = i.mode === "real" && i.permissions.includes("download");
  const engine: LeaseWorkspaceView["engine"] = run?.result ? (run.result.execution === "completed" ? "computed" : run.result.blockedControls.includes("rule_not_applicable") ? "blocked_rule_review" : "blocked_other") : "not_run";
  const deny = (reason: string): ActionState => ({ allowed: false, reason });
  const ok: ActionState = { allowed: true, reason: null };
  const prepareGuard = (): ActionState | null => i.mode === "demo" ? deny("Scénario synthétique en lecture seule : rien n'est enregistré") : !canPrepare ? deny("Droit de préparation requis") : !run ? deny("Aucune feuille") : !preparer ? deny("Seul le préparateur de la feuille la modifie") : !fresh ? deny(i.sourcesCurrent ? "Règle remplacée : créer une révision" : "Source remplacée ou ajoutée : créer une révision") : null;
  const actions: Record<ActionId, ActionState> = {
    create: i.mode === "demo" ? deny("Scénario synthétique en lecture seule") : !canPrepare ? deny("Droit de préparation requis") : run ? deny("Une feuille existe déjà pour cet exercice") : ok,
    configure: prepareGuard() ?? (["draft", "ready", "executed"].includes(run!.state) ? ok : deny("La feuille n'est plus modifiable dans cet état")),
    freeze: prepareGuard() ?? (run!.state !== "draft" || run!.population ? deny("Population déjà figée") : !run!.leaseWork ? deny("Enregistrer d'abord les politiques et confirmations") : missingTypes.length ? deny("Sources requises absentes : " + missingTypes.join(", ")) : ok),
    execute: prepareGuard() ?? (run!.state !== "ready" ? deny(run!.population ? "Calcul déjà enregistré pour cette version" : "Figer d'abord la population") : !i.ruleValidated ? deny(REVIEW_RULE) : ok),
    revise: i.mode === "demo" ? deny("Scénario synthétique en lecture seule") : !canPrepare || !run ? deny("Droit de préparation et feuille requis") : run.state === "superseded" ? deny("Révision déjà remplacée") : ok,
    resolve: prepareGuard() ?? (run!.state !== "executed" ? deny("Feuille calculée requise") : !run!.notes.some(n => !n.resolution) ? deny("Aucun point ouvert") : ok),
    conclude: prepareGuard() ?? (run!.state !== "executed" ? deny("Calcul terminé requis") : ok),
    submit: prepareGuard() ?? (run!.state !== "executed" ? deny("Calcul terminé requis") : !run!.conclusion ? deny("Conclusion citée requise") : run!.notes.some(n => n.blocking && !n.resolution) ? deny("Points bloquants ouverts") : ok),
    review: i.mode === "demo" ? deny("Scénario synthétique en lecture seule") : !run || run.state !== "awaiting_review" ? deny("Aucune version soumise") : !canReview ? deny("Relecture réservée à une identité autorisée") : ok,
    lock: i.mode === "demo" ? deny("Scénario synthétique en lecture seule") : !run || run.state !== "approved" ? deny("Version approuvée requise") : !canReview ? deny("Relecture réservée à une identité autorisée") : ok,
    // A diagnostic export accepts blocked or unreviewed versions; a reviewed export needs the reviewed, current version.
    export_diagnostic: !run ? deny("Aucune feuille") : i.mode === "demo" || canDownload ? ok : deny("Droit d'export requis"),
    export_reviewed: i.mode === "demo" ? deny("Scénario synthétique : export diagnostic seulement, jamais revu") : !run ? deny("Aucune feuille") : !canDownload ? deny("Droit d'export requis")
      : !["approved", "locked"].includes(run.state) ? deny("Version approuvée ou verrouillée requise") : !fresh ? deny(i.sourcesCurrent ? "Règle remplacée : créer une révision" : "Source remplacée ou ajoutée : créer une révision") : ok,
  };
  const reviewed = !!run && ["approved", "locked"].includes(run.state);
  const steps: WorkspaceStep[] = [
    { id: "sources", label: "Sources", task: "Déposer et approuver les sources", state: sourcesReady ? "done" : "current", reason: sourcesReady ? null : "Sources requises absentes : " + missingTypes.join(", "), exceptions: null },
    { id: "qualification", label: "Qualification", task: "Qualifier les contrats", state: !sourcesReady ? "todo" : run?.leaseWork && toQualify === 0 ? "done" : "current",
      reason: !sourcesReady ? null : !run?.leaseWork ? "Politiques et confirmations à enregistrer" : toQualify ? "Données à compléter" : null, exceptions: toQualify },
    // Freezing the population opens the calculation step: before it, the step says what the freeze still needs.
    { id: "calculation", label: "Calcul", task: "Figer la population, puis calculer dette et droit d'utilisation",
      state: engine === "computed" ? "done" : !run?.population ? (actions.freeze.allowed ? "current" : "todo") : engine === "blocked_rule_review" || !i.ruleValidated ? "blocked" : actions.execute.allowed ? "current" : "blocked",
      reason: engine === "computed" ? null : !run?.population ? (actions.freeze.allowed ? "Population à figer avant le calcul" : actions.freeze.reason) : !i.ruleValidated && i.mode === "real" ? REVIEW_RULE : engine === "blocked_other" ? "Calcul bloqué : voir les contrôles du résultat" : actions.execute.reason,
      exceptions: run?.result?.execution === "completed" ? run.notes.filter(n => n.blocking && !n.resolution).length : null },
    adjustmentStep(engine, run, i.framing ?? null),
    reviewStep(run, reviewed),
  ];
  return { mode: i.mode, freshness: !run ? "no_sheet" : !i.sourcesCurrent ? "source_replaced" : !i.ruleCurrent ? "rule_replaced" : "current", engine, steps, actions };
}

/** Cadrage et retraitement : fait seulement si chaque contrat calculé est cadré et retenu ; un contrat non rapproché reste compté et motivé. */
function adjustmentStep(engine: LeaseWorkspaceView["engine"], run: WorkpaperRun | null, framing: LeaseFraming | null): WorkspaceStep {
  const label = "Retraitements", task = "Cadrer sur la base PCG et proposer le retraitement";
  if (engine === "computed") {
    const result = run!.result!.result as LeaseResult, excluded = result.contracts.filter(c => c.adjustment.status === "excluded").length;
    return { id: "adjustment", label, task, state: result.bundle && !excluded ? "done" : "current", exceptions: excluded,
      reason: !result.bundle ? "Aucun contrat calculé et cadré : aucun retraitement proposé" : excluded ? excluded + " contrat(s) calculé(s) sans retraitement : cadrage en écart ou non établi" : null };
  }
  const unframed = framing ? framing.byStatus.difference + framing.byStatus.not_framed : null;
  return { id: "adjustment", label, task, state: "todo", exceptions: unframed,
    reason: unframed ? "Cadrage préalable des sources : " + unframed + " contrat(s) non rapproché(s) ; retraitement après le calcul" : null };
}

/** Revue (L16-05) : points bloquants, conclusion citée, relecture personnelle nommée, verrouillage ; chaque étape dit ce qui reste. */
function reviewStep(run: WorkpaperRun | null, reviewed: boolean): WorkspaceStep {
  const open = run ? run.notes.filter(n => n.blocking && !n.resolution).length : 0, base = { id: "review" as const, label: "Revue", task: "Résoudre les points, conclure, relire et verrouiller" };
  if (!run || !["executed", "awaiting_review", "changes_requested", "approved", "locked"].includes(run.state)) return { ...base, state: "todo", reason: null, exceptions: null };
  if (run.state === "locked") return { ...base, state: "done", reason: "Version verrouillée ; la sélection pour une base se décide au dossier de clôture", exceptions: null };
  if (reviewed) return { ...base, state: "done", reason: "Version approuvée : à verrouiller", exceptions: null };
  const reason = run.state === "awaiting_review" ? "Relecture personnelle nommée attendue" : open ? open + " point(s) bloquant(s) à résoudre par une décision citée"
    : !run.conclusion ? "Conclusion citée à rédiger" : run.state === "changes_requested" ? "Reprise demandée à la relecture" : "Soumettre à la relecture";
  return { ...base, state: "current", reason, exceptions: open || null };
}
