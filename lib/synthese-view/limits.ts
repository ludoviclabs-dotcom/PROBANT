import type { SynthesisSnapshot } from "@/lib/synthesis/types";
import { plural } from "./common";

/**
 * Limites de l'analyse : toujours visibles, jamais repliées. Les limites du moteur (`synthesis.limitations`) sont
 * reprises telles quelles ; s'y ajoutent les lectures que le snapshot permet d'énoncer avec leurs chiffres
 * (admissibilité, constats sans effet chiffré, signal heuristique) et la mention de la démonstration.
 */

export function buildLimits(input: { synthesis: SynthesisSnapshot; demoSociete: string | null }): string[] {
  const { synthesis: s, demoSociete } = input;
  const out: string[] = [];
  if (demoSociete) out.push(`Mode démo : société fictive ${demoSociete} ; aucun résultat n’est opposable ni ne vaut certification.`);
  if (s.admissibility.status === "rejected") {
    out.push(`Admissibilité rejetée : ${s.admissibility.blockingCount} ${plural(s.admissibility.blockingCount, "alerte bloquante", "alertes bloquantes")} sur le fichier ; l’exploitation chronologique du fichier est suspendue jusqu’à correction.`);
  }
  const without = s.exposure.findingsWithoutEffect.length;
  if (without > 0) out.push(`${without} ${plural(without, "constat sans effet chiffré est exclu", "constats sans effet chiffré sont exclus")} de l’exposition ; ${plural(without, "son incidence reste", "leur incidence reste")} à évaluer.`);
  for (const limit of s.limitations) out.push(limit.message);
  out.push("Le signal heuristique repose sur des pondérations internes (25/8/2/0,5), non opposables.");
  return out;
}
