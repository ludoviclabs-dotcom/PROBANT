import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { moneySchema, type ProcedureTemplate, type RuleReference } from "./model";
import { citPopulationExclusions, vatPopulationExclusions } from "./fiscal-sources";
import { evaluateVat, vatOutcome, vatResultSchema, vatWorkSchema, VAT_PROCEDURE } from "./fiscal-vat";
import { citOutcome, citResultSchema, citWorkSchema, CIT_PROCEDURE, evaluateCit } from "./fiscal-cit";

/**
 * Calculation contract of the fiscal sheets (Mission 13). The rules are internal (presentation and comparison of
 * engine outputs); every tax rule, rate, form vintage and source stays in the TAX engines and their registry.
 */
export const VAT_RULE: RuleReference = { id: VAT_PROCEDURE, version: "1.0.0", authority: "internal", source: "docs/mission13/CONTRAT.md", effectiveFrom: "2000-01-01", validation: "validated" };
export const VAT_TEMPLATE: ProcedureTemplate = { id: VAT_PROCEDURE, version: "1.0.0", objective: "TVA — écritures, déclaration et pièces d’une période déclarative", kind: "calculated",
  assertions: [{ label: "Exhaustivité et exactitude de la TVA comptabilisée au regard de la déclaration de la période (visées, non validées)", validation: "proposed" },
    { label: "Rattachement à la période et justification par les pièces (visés, non validés)", validation: "proposed" }],
  requiredDocumentTypes: ["fx_fec"], rule: VAT_RULE };
export const CIT_RULE: RuleReference = { id: CIT_PROCEDURE, version: "1.0.0", authority: "internal", source: "docs/mission13/CONTRAT.md", effectiveFrom: "2000-01-01", validation: "validated" };
export const CIT_TEMPLATE: ProcedureTemplate = { id: CIT_PROCEDURE, version: "1.0.0", objective: "IS — résultat comptable cadré, retraitements documentés et calcul du moteur pour l’exercice", kind: "calculated",
  assertions: [{ label: "Exactitude du résultat comptable repris dans la liasse (visée, non validée)", validation: "proposed" },
    { label: "Exhaustivité et justification des retraitements fiscaux (visées, non validées)", validation: "proposed" }],
  requiredDocumentTypes: ["fx_fec"], rule: CIT_RULE };
const vatParameters = z.object({ work: vatWorkSchema, runId: z.string().min(1) }).strict();
const citParameters = z.object({ work: citWorkSchema, runId: z.string().min(1) }).strict();
const items = z.array(z.object({ id: z.string(), amount: moneySchema }).strict());
/** The selection is rebuilt by the server: every item of the period is selected, every other one excluded with its motive. */
function reproducible(r: CalculationRequest, excluded: { id: string }[]) {
  const excludedIds = excluded.map(e => e.id), expectedSelected = r.population.items.map(i => i.id).filter(i => !excludedIds.includes(i)).sort();
  if (stableSha256(r.selection.exclusions.map(e => e.id).sort()) !== stableSha256([...excludedIds].sort()) || stableSha256([...r.selection.selectedIds].sort()) !== stableSha256(expectedSelected)) throw new Error("FX_SELECTION_NOT_REPRODUCIBLE");
}
/** A fresh closed registry per call: no synthetic fixture can enter the durable runtime. */
export class FiscalRegistry extends CalculationRegistry {
  override execute(request: CalculationRequest) {
    const registry = new CalculationRegistry();
    registry.register(VAT_RULE, items, vatParameters, vatResultSchema,
      (_input, parameters) => evaluateVat(request.scope, request.period, request.imports, parameters.runId, parameters.work), result => vatOutcome(result),
      r => {
        if (r.scope.mode !== "real" || r.population.unit !== "vat_entry") throw new Error("FX_REAL_POPULATION_REQUIRED");
        const { work } = vatParameters.parse(r.parameters);
        reproducible(r, vatPopulationExclusions(r.imports, work.period.startDate, work.period.endDate));
      });
    registry.register(CIT_RULE, items, citParameters, citResultSchema,
      (_input, parameters) => evaluateCit(request.scope, request.period, request.imports, parameters.runId, parameters.work), result => citOutcome(result),
      r => {
        if (r.scope.mode !== "real" || r.population.unit !== "result_entry") throw new Error("FX_REAL_POPULATION_REQUIRED");
        const { work } = citParameters.parse(r.parameters);
        reproducible(r, citPopulationExclusions(r.imports, work.period.startDate, work.period.endDate));
      });
    return registry.execute(request);
  }
}
export const FISCAL_TEMPLATES = { [VAT_PROCEDURE]: VAT_TEMPLATE, [CIT_PROCEDURE]: CIT_TEMPLATE } as const;
