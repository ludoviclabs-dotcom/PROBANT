import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { moneySchema, type ProcedureTemplate, type RuleReference } from "./model";
import { buildEquityFacts, equityPopulationExclusions } from "./capitaux-sources";
import { CAPITAUX_RESULT_SCHEMA_VERSION, CAPITAUX_RULE_VERSION, CAPITAUX_RULE_VERSION_1_1_0, equityOutcome, equityResultSchema, capitauxWorkSchemaV2, evaluateEquity } from "./capitaux-review";

/**
 * Internal method validated as a calculation contract only: no legal conclusion, threshold verdict or audit opinion is encoded.
 * 1.1.0 (C09): amended decisions counted once, settlement per decision, other-equity presentation dated by ANC 2024-07, dated legal markers.
 * 1.1.1: an SCA's half-capital marker cites L225-248 through the renvoi of L226-1; every other form gets the 1.1.0 result unchanged.
 */
export const EQUITY_RULE_VERSION = CAPITAUX_RULE_VERSION;
export const EQUITY_RULE: RuleReference = { id: "capitaux_propres.review", version: EQUITY_RULE_VERSION, authority: "internal", source: "docs/mission-c09/CONTRAT.md", effectiveFrom: "2000-01-01", validation: "validated" };
/** 1.1.0 stays executable for the sheets it still covers (any form but an SCA), whose result is the same as under 1.1.1. */
const EQUITY_RULE_1_1_0: RuleReference = { ...EQUITY_RULE, version: CAPITAUX_RULE_VERSION_1_1_0 };
export const EQUITY_TEMPLATE: ProcedureTemplate = { id: "capitaux_propres.review", version: EQUITY_RULE_VERSION, objective: "Capitaux propres — décisions, mouvements et tableau de variation", kind: "calculated",
  assertions: [{ label: "Exhaustivité et exactitude des mouvements des capitaux propres (visées, non validées)", validation: "proposed" }, { label: "Existence des décisions et séparation décision / comptabilisation / paiement (visées, non validées)", validation: "proposed" }],
  requiredDocumentTypes: ["eq_balances", "eq_entries"], rule: EQUITY_RULE };
const parametersSchema = z.object({ work: capitauxWorkSchemaV2, runId: z.string().min(1) }).strict();
/** Only the current contract can be produced by an execution; 1.0.0 results stay readable through equityResultSchema. */
const currentResultSchema = equityResultSchema.refine(r => r.schemaVersion === CAPITAUX_RESULT_SCHEMA_VERSION, "Contrat de résultat Capitaux propres périmé");
/** A fresh closed registry per call: no synthetic equity fixture can enter the durable runtime. */
export class EquityRegistry extends CalculationRegistry {
  override execute(request: CalculationRequest) {
    const registry = new CalculationRegistry();
    for (const reference of [EQUITY_RULE, EQUITY_RULE_1_1_0]) registry.register(reference, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), parametersSchema, currentResultSchema,
      (_input, parameters) => evaluateEquity(request.scope, request.period, request.imports, parameters.runId, parameters.work),
      result => equityOutcome(result),
      r => {
        if (r.scope.mode !== "real" || r.population.unit !== "decision_movement") throw new Error("EQ_REAL_POPULATION_REQUIRED");
        const parameters = parametersSchema.parse(r.parameters);
        if (reference === EQUITY_RULE_1_1_0 && parameters.work.framing.socialForm === "sca") throw new Error("EQ_RULE_REPLACED_REVISION_REQUIRED");
        const facts = buildEquityFacts(r.scope, r.period, r.imports, parameters.runId);
        // The selection is rebuilt by the server: every decision and movement is selected, every exclusion is motivated by its component.
        const excluded = equityPopulationExclusions(facts), excludedIds = excluded.map(e => e.id);
        const expectedSelected = r.population.items.map(i => i.id).filter(i => !excludedIds.includes(i)).sort();
        if (stableSha256(r.selection.exclusions.map(e => e.id).sort()) !== stableSha256([...excludedIds].sort()) || stableSha256([...r.selection.selectedIds].sort()) !== stableSha256(expectedSelected)) throw new Error("EQ_SELECTION_NOT_REPRODUCIBLE");
      });
    return registry.execute(request);
  }
}
