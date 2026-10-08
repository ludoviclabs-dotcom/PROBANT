import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { moneySchema, type ProcedureTemplate, type RuleReference } from "./model";
import { buildEquityFacts, equityPopulationExclusions } from "./equity-sources";
import { equityOutcome, equityResultSchema, equityWorkSchema, evaluateEquity } from "./equity-review";

/** Internal method validated as a calculation contract only: no legal rule, threshold, ratio conclusion or audit opinion is encoded. */
export const EQUITY_RULE: RuleReference = { id: "equity.review", version: "1.0.0", authority: "internal", source: "docs/mission11/CONTRAT.md", effectiveFrom: "2000-01-01", validation: "validated" };
export const EQUITY_TEMPLATE: ProcedureTemplate = { id: "equity.review", version: "1.0.0", objective: "Capitaux propres — décisions, mouvements et tableau de variation", kind: "calculated",
  assertions: [{ label: "Exhaustivité et exactitude des mouvements des capitaux propres (visées, non validées)", validation: "proposed" }, { label: "Existence des décisions et séparation décision / comptabilisation / paiement (visées, non validées)", validation: "proposed" }],
  requiredDocumentTypes: ["eq_balances", "eq_entries"], rule: EQUITY_RULE };
const parametersSchema = z.object({ work: equityWorkSchema, runId: z.string().min(1) }).strict();
/** A fresh closed registry per call: no synthetic equity fixture can enter the durable runtime. */
export class EquityRegistry extends CalculationRegistry {
  override execute(request: CalculationRequest) {
    const registry = new CalculationRegistry();
    registry.register(EQUITY_RULE, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), parametersSchema, equityResultSchema,
      (_input, parameters) => evaluateEquity(request.scope, request.period, request.imports, parameters.runId, parameters.work),
      result => equityOutcome(result),
      r => {
        if (r.scope.mode !== "real" || r.population.unit !== "decision_movement") throw new Error("EQ_REAL_POPULATION_REQUIRED");
        const parameters = parametersSchema.parse(r.parameters);
        const facts = buildEquityFacts(r.scope, r.period, r.imports, parameters.runId);
        // The selection is rebuilt by the server: every decision and movement is selected, every exclusion is motivated by its component.
        const excluded = equityPopulationExclusions(facts), excludedIds = excluded.map(e => e.id);
        const expectedSelected = r.population.items.map(i => i.id).filter(i => !excludedIds.includes(i)).sort();
        if (stableSha256(r.selection.exclusions.map(e => e.id).sort()) !== stableSha256([...excludedIds].sort()) || stableSha256([...r.selection.selectedIds].sort()) !== stableSha256(expectedSelected)) throw new Error("EQ_SELECTION_NOT_REPRODUCIBLE");
      });
    return registry.execute(request);
  }
}
