import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { moneySchema, type ProcedureTemplate, type RuleReference } from "./model";
import { evaluateProvisions, provisionOutcome, provisionResultSchema, provisionWorkSchema, PROVISION_PROCEDURE } from "./provision-review";

/** Internal method validated as a calculation contract only: no accounting rule, probability, tolerance, threshold or audit opinion is encoded. */
export const PROVISION_RULE: RuleReference = { id: PROVISION_PROCEDURE, version: "1.0.0", authority: "internal", source: "docs/mission16/CONTRAT.md", effectiveFrom: "2000-01-01", validation: "validated" };
export const PROVISION_TEMPLATE: ProcedureTemplate = { id: PROVISION_PROCEDURE, version: "1.0.0", objective: "Provisions et engagements — registre relié au grand livre et à l’annexe, ponts et comparaisons documentés", kind: "calculated",
  assertions: [{ label: "Exhaustivité et évaluation des provisions ; information en annexe sur les passifs éventuels et engagements (visées, non validées ; aucune issue juridique n’est déduite)", validation: "proposed" }],
  requiredDocumentTypes: ["pv_register", "pv_ledger"], rule: PROVISION_RULE };
const parametersSchema = z.object({ work: provisionWorkSchema, runId: z.string().min(1) }).strict();
/** A fresh closed registry per call: no synthetic fixture can enter the durable runtime. */
export class ProvisionRegistry extends CalculationRegistry {
  override execute(request: CalculationRequest) {
    const registry = new CalculationRegistry();
    registry.register(PROVISION_RULE, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), parametersSchema, provisionResultSchema,
      (_input, parameters) => evaluateProvisions(request.scope, request.period, request.imports, parameters.runId, parameters.work),
      result => provisionOutcome(result),
      r => {
        if (r.scope.mode !== "real" || r.population.unit !== "pv_event") throw new Error("PV_REAL_POPULATION_REQUIRED");
        const p = parametersSchema.parse(r.parameters);
        // The selection is rebuilt by the server: every event of the exercise is selected; events outside it are excluded with their motive.
        const events = evaluateProvisions(r.scope, r.period, r.imports, p.runId, p.work).events, excluded = events.filter(e => !e.inScope).map(e => e.eventId).sort(), selected = events.filter(e => e.inScope).map(e => e.eventId).sort();
        if (stableSha256(r.selection.exclusions.map(e => e.id).sort()) !== stableSha256(excluded) || stableSha256([...r.selection.selectedIds].sort()) !== stableSha256(selected)) throw new Error("PV_SELECTION_NOT_REPRODUCIBLE");
      });
    return registry.execute(request);
  }
}
