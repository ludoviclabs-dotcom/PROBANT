import { z } from "zod";
import { frozen, moneySchema, type ProcedureTemplate } from "./model";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { frameworkBlockers } from "@/lib/ifrs/shared/context";
import { IFRS16_RULE, LEASE_RULE_VERSION } from "@/lib/ifrs/leases/rule";
import { evaluateLeases, isLeaseResult, type LeaseResult } from "./lease-review";
import { leaseWorkSchema, type LeaseWork } from "./lease-work";
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

/**
 * Adaptateur de calcul de l'atelier : le moteur pur (L16-02) derrière le registre de calcul existant. Le registre bloque toute exécution
 * réelle tant que la règle n'est pas validée par la relecture nommée (`rule_not_applicable`) ; la juridiction EU_adopted reste bloquée en réel (X33).
 */
export class LeaseRegistry extends CalculationRegistry {
  override execute(request: CalculationRequest) {
    if (request.rule.id !== "ifrs16.leases" || request.population.unit !== "lease_contract") throw new Error("L16_ADAPTER_INVALID");
    const work = leaseWorkSchema.safeParse((request.parameters as { work?: unknown } | null)?.work);
    const blockers = work.success ? frameworkBlockers(work.data.framework, request.scope.mode) : [];
    if (blockers.length) {
      const traced = new CalculationRegistry().execute(request);
      return frozen({ ...traced, execution: "blocked" as const, outcome: "inconclusive" as const, blockedControls: [...traced.blockedControls, ...blockers], result: { status: "framework_not_activatable", reason: blockers.join(" ; ") } });
    }
    const registry = new CalculationRegistry();
    registry.register(IFRS16_RULE, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), z.object({ runId: z.string().min(1), work: leaseWorkSchema }).strict(),
      z.custom<LeaseResult>(isLeaseResult), (_input, p) => evaluateLeases(request.scope, request.period, request.imports, p.runId, request.population, request.selection, p.work as LeaseWork), r => r.outcome);
    return registry.execute(request);
  }
}
