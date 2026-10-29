import { frozen, type ProcedureTemplate } from "./model";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { frameworkBlockers } from "@/lib/ifrs/shared/context";
import { IFRS16_RULE, LEASE_RULE_BASIS, LEASE_RULE_VERSION } from "@/lib/ifrs/leases/rule";
import { leaseWorkSchema } from "./lease-work";
import { LEASE_REQUIRED_TYPES } from "./lease-sources";

export const LEASE_TEMPLATE: ProcedureTemplate = {
  id: "ifrs16.leases", version: LEASE_RULE_VERSION, objective: "Locations IFRS 16 (preneur, périmètre V1) : qualification, dette locative, droit d'utilisation et retraitement de clôture proposé", kind: "calculated",
  assertions: [
    { label: "Population des contrats qualifiée : location, exemption documentée, éligible V1, à qualifier ou hors périmètre, sans réponse vide comptée comme une absence", validation: "proposed" },
    { label: "Dette locative et droit d'utilisation recalculés sur paramètres sourcés, en virgule fixe, publiés au centime", validation: "proposed" },
    { label: "Retraitement de clôture proposé, équilibré et cadré sur les loyers PCG, distinct des anomalies d'audit", validation: "proposed" },
  ],
  requiredDocumentTypes: [...LEASE_REQUIRED_TYPES],
  rule: IFRS16_RULE,
};
export const LEASE_ENGINE_NOT_AVAILABLE = "L16_ENGINE_NOT_AVAILABLE";

/**
 * Adaptateur de calcul du socle C01 : aucune exécution, une incapacité explicite. Les contrôles communs (portée, période, sources
 * approuvées, population et sélection reproductibles) s'exécutent pour tracer l'entrée ; le résultat est toujours `blocked`,
 * `inconclusive`, sans montant, jamais un succès avec des zéros. Le moteur pur arrive en L16-02 et remplacera cette classe.
 */
export class LeaseRegistry extends CalculationRegistry {
  override execute(request: CalculationRequest) {
    if (request.rule.id !== "ifrs16.leases" || request.population.unit !== "lease_contract") throw new Error("L16_ADAPTER_INVALID");
    const traced = new CalculationRegistry().execute(request);
    const work = leaseWorkSchema.safeParse((request.parameters as { work?: unknown } | null)?.work);
    const blockers = [LEASE_ENGINE_NOT_AVAILABLE, ...(work.success ? frameworkBlockers(work.data.framework, request.scope.mode) : ["L16_WORK_REQUIRED"])];
    return frozen({ ...traced, execution: "blocked" as const, outcome: "inconclusive" as const, blockedControls: [...traced.blockedControls, ...blockers],
      warnings: [...traced.warnings, "Aucun moteur IFRS 16 dans ce socle : rien n'est calculé et aucun montant n'est publié."],
      result: { status: "engine_not_available", code: LEASE_ENGINE_NOT_AVAILABLE, ruleVersion: LEASE_RULE_VERSION, ruleBasisStatus: LEASE_RULE_BASIS.status,
        reason: "Le moteur de l'atelier Locations IFRS 16 n'est pas encore livré (lot L16-02). La feuille garde ses sources, sa population et son travail ; aucun montant n'est publié." } });
  }
}
