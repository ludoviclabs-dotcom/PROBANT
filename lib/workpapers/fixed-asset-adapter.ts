import { z } from "zod";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { moneySchema, type ProcedureTemplate, type RuleReference } from "./model";
import { buildFixedAssetFacts } from "./fixed-asset-sources";
import { evaluateFixedAssets, fixedAssetOutcome, fixedAssetResultSchema, fixedAssetWorkSchema } from "./fixed-asset-review";

/** Internal method validated as a calculation contract only: no accounting rule, duration, threshold or audit opinion is encoded. */
export const FIXED_ASSETS_RULE: RuleReference = { id: "fixed_assets.review", version: "1.0.0", authority: "internal", source: "docs/mission10/CONTRAT.md", effectiveFrom: "2000-01-01", validation: "validated" };
export const FIXED_ASSETS_TEMPLATE: ProcedureTemplate = { id: "fixed_assets.review", version: "1.0.0", objective: "Immobilisations — mouvements, cadrage et recalcul documenté", kind: "calculated",
  assertions: [{ label: "Exhaustivité et exactitude des mouvements de l’exercice (visées, non validées)", validation: "proposed" }, { label: "Évaluation : dotation conforme à la méthode documentée (visée, non validée)", validation: "proposed" }],
  requiredDocumentTypes: ["fa_register", "fa_ledger"], rule: FIXED_ASSETS_RULE };
const parametersSchema = z.object({ work: fixedAssetWorkSchema, runId: z.string().min(1) }).strict();
/** A fresh closed registry per call: no synthetic fixed-asset fixture can enter the durable runtime. */
export class FixedAssetsRegistry extends CalculationRegistry {
  override execute(request: CalculationRequest) {
    const registry = new CalculationRegistry();
    registry.register(FIXED_ASSETS_RULE, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), parametersSchema, fixedAssetResultSchema,
      (_input, parameters) => evaluateFixedAssets(request.scope, request.period, request.imports, parameters.runId, parameters.work),
      result => fixedAssetOutcome(result),
      r => {
        if (r.scope.mode !== "real" || r.population.unit !== "asset") throw new Error("FA_REAL_ASSET_POPULATION_REQUIRED");
        const parameters = parametersSchema.parse(r.parameters);
        const facts = buildFixedAssetFacts(r.scope, r.period, r.imports, parameters.runId);
        // The selection is rebuilt by the server: every standard asset is selected, every exclusion is motivated by the register.
        const expectedExcluded = facts.units.filter(u => !u.inScope).map(u => u.unitId).sort(), expectedSelected = facts.units.filter(u => u.inScope).map(u => u.unitId).sort();
        if (stableSha256(r.selection.exclusions.map(e => e.id).sort()) !== stableSha256(expectedExcluded) || stableSha256([...r.selection.selectedIds].sort()) !== stableSha256(expectedSelected)) throw new Error("FA_SELECTION_NOT_REPRODUCIBLE");
      });
    return registry.execute(request);
  }
}
