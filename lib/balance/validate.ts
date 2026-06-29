import type { BalanceCheck, BalanceValidation, ParsedBalance } from "./types";
import type { CloisonId } from "@/lib/canonical-model";
import { siloForCompte } from "@/lib/canonical-model/taxonomy";

/**
 * Validation LÉGÈRE d'une balance — distincte du moteur de règles FEC (qui
 * exige des écritures ligne à ligne). On vérifie ici la cohérence d'ensemble :
 * équilibre, conformité au plan de comptes, exercice, couverture analytique.
 */
export function validateBalance(b: ParsedBalance): BalanceValidation {
  const checks: BalanceCheck[] = [];

  checks.push({
    id: "equilibre",
    ok: b.equilibre,
    severity: b.equilibre ? "informatif" : "bloquant",
    label: "Équilibre débit = crédit",
    detail: b.equilibre
      ? "Balance équilibrée."
      : `Déséquilibre de ${Math.abs(b.ecartEquilibre).toLocaleString("fr-FR")} € entre total débit et total crédit.`,
  });

  const invalides = b.lignes.filter((l) => !/^[1-8]/.test(l.compteNum));
  checks.push({
    id: "plan-comptable",
    ok: invalides.length === 0,
    severity: invalides.length ? "majeur" : "informatif",
    label: "Conformité au plan de comptes",
    detail: invalides.length
      ? `${invalides.length} compte(s) hors classes PCG 1 à 8.`
      : "Tous les comptes relèvent des classes PCG 1 à 8.",
  });

  checks.push({
    id: "exercice",
    ok: Boolean(b.exercice),
    severity: b.exercice ? "informatif" : "mineur",
    label: "Exercice détecté",
    detail: b.exercice
      ? `Exercice ${b.exercice}.`
      : "Aucun millésime d'exercice détecté automatiquement.",
  });

  const cloisons = new Set(
    b.lignes
      .map((l) => siloForCompte(l.compteNum)?.cloison)
      .filter((c): c is CloisonId => Boolean(c)),
  );
  checks.push({
    id: "couverture",
    ok: true,
    severity: "informatif",
    label: "Couverture analytique",
    detail: `${b.nbLignes} comptes rattachés à ${cloisons.size} cloison(s) PROBANT.`,
  });

  return { checks, nbAlertes: checks.filter((c) => !c.ok).length };
}
