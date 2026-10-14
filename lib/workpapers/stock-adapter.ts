import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { moneySchema, type ProcedureTemplate, type RuleReference } from "./model";
import { evaluateStocks, stockOutcome, stockResultSchema, stockWorkSchema, STOCK_PROCEDURE, STOCK_RESULT_SCHEMA_VERSION, STOCK_RULE_VERSION } from "./stock-review";

/**
 * Internal method validated as a calculation contract only: no accounting rule, tolerance, threshold or audit opinion is encoded.
 * 1.1.0 (C08): value review bounded at the carrying amount, quantity basis, cost and hypothesis fallback; results of 1.0.0 stay readable and become stale.
 */
export const STOCK_RULE: RuleReference = { id: STOCK_PROCEDURE, version: STOCK_RULE_VERSION, authority: "internal", source: "docs/mission15/CONTRAT.md", effectiveFrom: "2000-01-01", validation: "validated" };
export const STOCK_TEMPLATE: ProcedureTemplate = { id: STOCK_PROCEDURE, version: STOCK_RULE_VERSION, objective: "Stocks — quantités comptées, mouvements intercalaires et passage inventaire → clôture", kind: "calculated",
  assertions: [{ label: "Existence et exhaustivité des quantités en stock à la clôture (visées, non validées ; la présence physique n’est pas certifiée)", validation: "proposed" },
    { label: "Droits et obligations : stock propre distingué des stocks de tiers, consignations, transits et en-cours (visés, non validés)", validation: "proposed" }],
  requiredDocumentTypes: ["st_count", "st_system"], rule: STOCK_RULE };
const parametersSchema = z.object({ work: stockWorkSchema, runId: z.string().min(1) }).strict();
/** A new execution always writes the current result contract; older contracts are only read. */
const currentResultSchema = stockResultSchema.refine(r => r.schemaVersion === STOCK_RESULT_SCHEMA_VERSION, "Contrat de résultat Stocks périmé");
/** A fresh closed registry per call: no synthetic stock fixture can enter the durable runtime. */
export class StockRegistry extends CalculationRegistry {
  override execute(request: CalculationRequest) {
    const registry = new CalculationRegistry();
    registry.register(STOCK_RULE, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), parametersSchema, currentResultSchema,
      (_input, parameters) => evaluateStocks(request.scope, request.period, request.imports, parameters.runId, parameters.work),
      result => stockOutcome(result),
      r => {
        if (r.scope.mode !== "real" || r.population.unit !== "stock_unit") throw new Error("ST_REAL_POPULATION_REQUIRED");
        const p = parametersSchema.parse(r.parameters);
        // The selection is rebuilt by the server: every unit of own stock is selected; every other one is excluded with its motive.
        const units = evaluateStocks(r.scope, r.period, r.imports, p.runId, p.work).units, excluded = units.filter(u => !u.inScope).map(u => u.unitId).sort(), selected = units.filter(u => u.inScope).map(u => u.unitId).sort();
        if (stableSha256(r.selection.exclusions.map(e => e.id).sort()) !== stableSha256(excluded) || stableSha256([...r.selection.selectedIds].sort()) !== stableSha256(selected)) throw new Error("ST_SELECTION_NOT_REPRODUCIBLE");
      });
    return registry.execute(request);
  }
}
