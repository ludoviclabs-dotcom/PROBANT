import type { ResultAssessment, SubControlResult } from "@/lib/canonical-model/calculation";
import type { DemoCycle, DemoParameters } from "./demo-cycles";
import type { CutoffResult } from "./cutoff";

export const TARGET_CONTROL: Record<DemoCycle, { id: string; label: string }> = {
  cash: { id: "cash.bridge", label: "Concordance GL / relevé / ERB" },
  cutoff: { id: "cutoff.recognition", label: "Rattachement à la clôture" },
  fournisseurs: { id: "fournisseurs.recognition", label: "Recherche de passif sur paiement affecté" },
  clients: { id: "clients.general-auxiliary", label: "Cadrage GL / auxiliaire clients" },
  immobilisations: { id: "immobilisations.gross", label: "Pont des valeurs brutes" },
  capitaux: { id: "capitaux.bridge", label: "Pont des capitaux propres" },
  achats: { id: "achats.invoice", label: "Concordance lignes / allocations facture" },
  conges: { id: "conges.booked", label: "Indemnité / montant comptabilisé sur les mêmes droits" },
  participations: { id: "participations.dividend", label: "Dividende attendu / comptabilisé" },
  is: { id: "is.accounting", label: "Cadrage du résultat comptable" },
};
export interface DemoCycleReport { technical: unknown; assessment: ResultAssessment }
export const cutoffOutcome = (r: CutoffResult): SubControlResult["outcome"] => r.status === "candidate" ? "exceptions_detected" : r.status === "inconclusive" ? "inconclusive" : "no_exception_detected";

/** Presentation adapter for existing engines; classifications are supplied explicitly by each caller. */
export function demoAssessment(p: DemoParameters) {
  const sourceHref = p.cycle === "is" ? "/dashboard/fiscalite" : "/dashboard/depot";
  const prerequisites: SubControlResult["prerequisites"] = [
    { id: "source", label: "Pièces synthétiques vérifiées", status: p.missingEvidence ? "missing" : "met", sourceHref: "/dashboard/depot" },
    { id: "method", label: "Méthode synthétique documentée", status: p.methodAvailable ? "met" : "missing", sourceHref },
    { id: "input", label: "Donnée source valide", status: p.scenario === "invalid" ? "missing" : "met", sourceHref: "/dashboard/depot" },
  ];
  const control = (id: string, label: string, outcome: SubControlResult["outcome"], reason?: string): SubControlResult => ({
    id, label, availability: "available", mode: "demo", prerequisites, execution: "completed", outcome,
    reason: reason ?? (outcome === "exceptions_detected" ? "Écart démontré sur le sous-contrôle testé ; qualification à revoir." : outcome === "inconclusive" ? "La source ou la qualification ne permet pas de conclure." : "Concordance vérifiée sur les éléments synthétiques testés."),
    uncertainty: outcome === "inconclusive" ? reason ?? "Conclusion humaine ou source complémentaire requise." : "Limité aux éléments synthétiques testés ; aucune opinion d’audit.",
    nextAction: outcome === "exceptions_detected" ? "Documenter l’écart et faire revoir sa qualification." : outcome === "inconclusive" ? "Obtenir la source requise et documenter le jugement." : "Documenter la conclusion et soumettre à la revue simulée.", sourceHref,
  });
  const pending = (id: string, label: string, reason: string, blocked = false, availability: SubControlResult["availability"] = "available"): SubControlResult => ({
    ...control(id, label, "inconclusive", reason), availability, execution: blocked ? "blocked" : "not_run",
    prerequisites: [...prerequisites, { id: "additional-source", label: reason, status: "missing", sourceHref }],
    nextAction: `SOURCE REQUISE : ${reason}`, uncertainty: reason,
  });
  const report = (technical: unknown, subControls: SubControlResult[], forceBlocked = false): DemoCycleReport => ({ technical,
    assessment: { version: "2.0.0", execution: forceBlocked || !subControls.some((c) => c.execution === "completed") ? "blocked" : "completed", subControls } });
  const target = TARGET_CONTROL[p.cycle];
  const prerequisiteReason = p.scenario === "invalid" ? "Montant source invalide : calcul interdit, aucune conversion en zéro." : p.missingEvidence ? "Pièce requise absente : calcul interdit jusqu’à vérification de la source." : !p.methodAvailable ? "Méthode requise absente : calcul interdit jusqu’à documentation." : null;
  return { control, pending, report, target, prerequisiteReason };
}
