import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { moneySchema, type ProcedureTemplate, type RuleReference } from "./model";
import { vatPopulationExclusions } from "./fiscal-sources";
import { evaluateVat, vatOutcome, vatResultSchema, vatWorkSchema, VAT_PROCEDURE } from "./fiscal-vat";

/**
 * Calculation contract of the fiscal sheets (Mission 13). The rule is internal (presentation and comparison of
 * engine outputs); every tax rule, rate, form vintage and source stays in the TAX engines and their registry.
 */
export const VAT_RULE: RuleReference = { id: VAT_PROCEDURE, version: "1.0.0", authority: "internal", source: "docs/mission13/CONTRAT.md", effectiveFrom: "2000-01-01", validation: "validated" };
export const VAT_TEMPLATE: ProcedureTemplate = { id: VAT_PROCEDURE, version: "1.0.0", objective: "TVA — écritures, déclaration et pièces d’une période déclarative", kind: "calculated",
  assertions: [{ label: "Exhaustivité et exactitude de la TVA comptabilisée au regard de la déclaration de la période (visées, non validées)", validation: "proposed" },
    { label: "Rattachement à la période et justification par les pièces (visés, non validés)", validation: "proposed" }],
  requiredDocumentTypes: ["fx_fec"], rule: VAT_RULE };
const parametersSchema = z.object({ work: vatWorkSchema, runId: z.string().min(1) }).strict();
/** A fresh closed registry per call: no synthetic fixture can enter the durable runtime. */
export class FiscalRegistry extends CalculationRegistry {
  override execute(request: CalculationRequest) {
    const registry = new CalculationRegistry();
    registry.register(VAT_RULE, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), parametersSchema, vatResultSchema,
      (_input, parameters) => evaluateVat(request.scope, request.period, request.imports, parameters.runId, parameters.work),
      result => vatOutcome(result),
      r => {
        if (r.scope.mode !== "real" || r.population.unit !== "vat_entry") throw new Error("FX_REAL_POPULATION_REQUIRED");
        const { work } = parametersSchema.parse(r.parameters);
        // The selection is rebuilt by the server: every VAT entry of the declarative period is selected, every other one excluded with its motive.
        const excluded = vatPopulationExclusions(r.imports, work.period.startDate, work.period.endDate), excludedIds = excluded.map(e => e.id);
        const expectedSelected = r.population.items.map(i => i.id).filter(i => !excludedIds.includes(i)).sort();
        if (stableSha256(r.selection.exclusions.map(e => e.id).sort()) !== stableSha256([...excludedIds].sort()) || stableSha256([...r.selection.selectedIds].sort()) !== stableSha256(expectedSelected)) throw new Error("FX_SELECTION_NOT_REPRODUCIBLE");
      });
    return registry.execute(request);
  }
}
export const FISCAL_TEMPLATES = { [VAT_PROCEDURE]: VAT_TEMPLATE } as const;
