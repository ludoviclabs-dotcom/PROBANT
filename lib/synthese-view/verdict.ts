import type { Finding } from "@/lib/canonical-model/finding";
import type { SynthesisSnapshot, VerdictStatus } from "@/lib/synthesis/types";
import type { ReviewStage } from "./review";

/**
 * Verdict éditorial : deux phrases dont les chiffres sont en mono. Le verdict lui-même (statut, titre, détail)
 * est celui du moteur ; cette vue le met en phrases à partir des compteurs du snapshot, sans en tirer de score
 * ni de conclusion que le moteur n'a pas posée.
 */

export interface VerdictView {
  status: VerdictStatus;
  /** Verdict du moteur en minuscules : « dossier non admissible ». */
  label: string;
  /** Vrai quand le verdict bloque (admissibilité rejetée, alertes bloquantes ouvertes) : le chiffre prend la couleur du signal. */
  critical: boolean;
  lead: { figure: string | null; text: string };
  second: { figure: string | null; text: string };
  detail: string;
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

export function buildVerdictView(input: {
  synthesis: SynthesisSnapshot;
  findings: readonly Finding[];
  admissibilityFindings: readonly Finding[];
  stages: ReadonlyMap<string, ReviewStage>;
}): VerdictView {
  const { synthesis, findings, admissibilityFindings, stages } = input;
  const { verdict, admissibility, coverage, risk, review } = synthesis;

  let lead: VerdictView["lead"];
  switch (verdict.status) {
    case "rejected": {
      const n = admissibility.blockingCount;
      lead = { figure: String(n), text: plural(n, "alerte bloque l’admissibilité du FEC.", "alertes bloquent l’admissibilité du FEC.") };
      break;
    }
    case "insufficient_coverage":
      lead = { figure: null, text: coverage.status === "unqualified" ? "La couverture n’est pas qualifiée." : "La couverture ne permet pas de conclure." };
      break;
    case "blocking_open": {
      const n = risk.openBlockingCount;
      lead = { figure: String(n), text: plural(n, "alerte bloquante reste ouverte.", "alertes bloquantes restent ouvertes.") };
      break;
    }
    case "under_review":
      lead = { figure: `${review.reviewedCount}/${review.totalCount}`, text: "constats arbitrés." };
      break;
    default:
      lead = { figure: null, text: "Tous les constats sont arbitrés." };
  }

  const waiting = findings.filter((f) => (f.severity === "bloquant" || f.severity === "majeur") && stages.get(f.id) === "pending").length;
  const second: VerdictView["second"] =
    waiting > 0
      ? { figure: String(waiting), text: plural(waiting, "constat bloquant ou majeur appelle une revue.", "constats bloquants ou majeurs appellent une revue.") }
      : { figure: null, text: "Aucun constat bloquant ou majeur n’attend de revue." };

  let detail = verdict.detail;
  if (verdict.status === "rejected") {
    const blocking = admissibilityFindings.filter((f) => f.severity === "bloquant");
    const facts = blocking
      .map((f) => `${f.titre}${f.lignesSource.length ? ` (${f.lignesSource.map((line) => `L${line}`).join(", ")})` : ""}, ${f.source.ref}.`)
      .join(" ");
    const lifted = admissibility.blockingCount > 1 ? "les alertes ne sont pas levées" : "l’alerte n’est pas levée";
    detail = `${facts ? `${facts} ` : ""}Tant que ${lifted}, aucune analyse financière ne peut être présentée comme fiable.`;
  }

  return {
    status: verdict.status,
    label: verdict.headline.toLowerCase(),
    critical: verdict.status === "rejected" || verdict.status === "blocking_open",
    lead,
    second,
    detail,
  };
}
