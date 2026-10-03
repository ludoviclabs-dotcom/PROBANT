import { z } from "zod";
import type { CalculationRun, ResultAssessment, SubControlResult } from "@/lib/canonical-model/calculation";
import type { KnownAmount } from "@/lib/canonical-model/money";
import { cents } from "@/lib/canonical-model/money";
import type { WorkpaperRun } from "./model";

const outcome = z.enum(["no_exception_detected", "exceptions_detected", "inconclusive"]);
const sourceHref = z.string().regex(/^\/dashboard\/[a-z-]+(?:#[A-Za-z0-9-]+)?$/);
export const assessmentSchema = z.object({
  version: z.literal("2.0.0"), execution: z.enum(["completed", "blocked", "failed"]),
  subControls: z.array(z.object({
    id: z.string().min(1), label: z.string().min(1), availability: z.enum(["available", "blocked"]), mode: z.enum(["demo", "real"]),
    prerequisites: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), status: z.enum(["met", "missing"]), sourceHref }).strict()),
    execution: z.enum(["completed", "blocked", "not_run"]), outcome,
    reason: z.string().min(1), uncertainty: z.string().min(1), nextAction: z.string().min(1), sourceHref,
  }).strict()).min(1),
}).strict().superRefine((a, ctx) => {
  if (new Set(a.subControls.map((c) => c.id)).size !== a.subControls.length) ctx.addIssue({ code: "custom", message: "DUPLICATE_SUBCONTROL" });
  if (a.execution === "completed" && !a.subControls.some((c) => c.execution === "completed")) ctx.addIssue({ code: "custom", message: "NO_EXECUTED_SUBCONTROL" });
  for (const c of a.subControls) {
    if (c.execution !== "completed" && c.outcome !== "inconclusive") ctx.addIssue({ code: "custom", message: "UNEXECUTED_CONTROL_CANNOT_CONCLUDE" });
    if (c.execution === "completed" && (c.availability === "blocked" || c.prerequisites.some((p) => p.status === "missing"))) ctx.addIssue({ code: "custom", message: "MISSING_PREREQUISITE_CANNOT_EXECUTE" });
  }
});

/** Only a named, comparable difference can be classified this way. Never scan a JSON for amounts. */
export function differenceOutcome(difference: KnownAmount): SubControlResult["outcome"] {
  return difference.kind !== "known" ? "inconclusive" : cents(difference.value) === 0n ? "no_exception_detected" : "exceptions_detected";
}
export function assessmentOutcome(a: ResultAssessment): CalculationRun["outcome"] {
  if (a.execution !== "completed") return "inconclusive";
  if (a.subControls.some((c) => c.outcome === "exceptions_detected")) return "exceptions_detected";
  if (a.subControls.some((c) => c.outcome === "inconclusive")) return "inconclusive";
  return "no_exception_detected";
}
export const OUTCOME_LABELS = { no_exception_detected: "Aucune exception sur les éléments testés", exceptions_detected: "Exception démontrée sur les éléments testés", inconclusive: "Non concluant" };
export function resultPresentation(run: WorkpaperRun) {
  const controls = run.result?.assessment?.subControls ?? [];
  const exceptions = controls.filter((c) => c.outcome === "exceptions_detected").length;
  const incomplete = controls.filter((c) => c.outcome === "inconclusive").length;
  const executed = controls.filter((c) => c.execution === "completed").length;
  const blocked = run.result?.execution === "blocked";
  const contractOutdated = run.template.id.startsWith("demo.cycle.") && !!run.result && !run.result.assessment;
  const result = blocked ? `Diagnostic bloqué${exceptions ? ` · ${exceptions} exception(s) démontrée(s) dans la partie testée` : ""}`
    : exceptions ? `Exception démontrée${incomplete ? " · conclusion partielle" : ""}` : incomplete ? "Résultat partiellement non concluant" : run.result ? OUTCOME_LABELS[run.result.outcome] : "Résultat absent";
  return {
    controls, exceptions, incomplete, executed, blocked, result: contractOutdated ? "Contrat de résultat périmé — nouvelle exécution requise" : result, contractOutdated,
    testExecuted: contractOutdated ? "Aucune exécution confirmée avec le contrat courant" : controls.length ? `${executed}/${controls.length} sous-contrôles exécutés${blocked ? " · procédure bloquée" : ""}` : run.result?.execution === "completed" ? "Calcul exécuté" : "Non exécuté",
    uncertainty: controls.length ? controls.filter((c) => c.outcome === "inconclusive").map((c) => `${c.label} : ${c.uncertainty}`).join(" ; ") || "Périmètre synthétique limité aux éléments testés ; aucune opinion d’audit." : "Conclusion limitée au calcul et à ses preuves.",
    nextAction: contractOutdated ? "Remettre explicitement le journal à zéro et exécuter avec le contrat courant." : controls.find((c) => c.execution === "blocked")?.nextAction ?? controls.find((c) => c.outcome !== "no_exception_detected")?.nextAction ?? "Documenter la conclusion et soumettre à la revue simulée.",
    review: run.approval ? "Travail revu" : run.state === "awaiting_review" ? "Revue en attente" : "Travail non revu",
    locking: run.state === "locked" ? "Verrouillé" : "Non verrouillé",
    staleness: contractOutdated ? "Contrat périmé" : run.previousLockedId && run.state !== "locked" && run.state !== "superseded" ? "Revue périmée après modification" : "Version courante",
  };
}
