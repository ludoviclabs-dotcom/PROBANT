import sourcesData from "@/data/tax/sources/official-sources.json";
import sourceVersionsData from "@/data/tax/source-versions/official-source-versions.json";
import formsData from "@/data/tax/forms/form-vintages-2026.json";
import rulesData from "@/data/tax/rules/initial-rule-versions.json";
import crosswalksData from "@/data/tax/crosswalks/initial-crosswalks.json";
import extensionsData from "@/data/tax/sources/extension-metadata.json";
import { TaxKnowledgeRegistrySchema } from "./tax-schemas";
import type { TaxRuleVersion, TaxType } from "./tax-types";
import { validateTaxKnowledgeRegistry } from "./tax-validation";

export const TAX_REGISTRY_VERIFIED_AT = "2026-08-16";

export const taxKnowledgeRegistry = TaxKnowledgeRegistrySchema.parse({
  sources: sourcesData,
  sourceVersions: sourceVersionsData,
  forms: formsData,
  rules: rulesData,
  crosswalks: crosswalksData,
  extensions: extensionsData,
});

const validation = validateTaxKnowledgeRegistry(taxKnowledgeRegistry, TAX_REGISTRY_VERIFIED_AT);
if (!validation.valid) {
  throw new Error(
    `Tax knowledge registry is invalid:\n${validation.errors
      .map((issue) => `${issue.id ?? "registry"} ${issue.field}: ${issue.message}`)
      .join("\n")}`,
  );
}

export function getTaxRuleVersion(id: string): TaxRuleVersion | undefined {
  return taxKnowledgeRegistry.rules.find((rule) => rule.id === id);
}

export function listApplicableTaxRules(options: {
  taxType: TaxType;
  fiscalYear: number;
  formVintage?: number;
  asOf?: string;
}): TaxRuleVersion[] {
  const asOf = options.asOf ?? TAX_REGISTRY_VERIFIED_AT;
  return taxKnowledgeRegistry.rules.filter((rule) => {
    if (rule.taxType !== options.taxType || rule.status !== "effective") return false;
    if (rule.effectiveFrom && rule.effectiveFrom > asOf) return false;
    if (rule.effectiveTo && rule.effectiveTo < asOf) return false;
    if (rule.fiscalYears.length > 0 && !rule.fiscalYears.includes(options.fiscalYear)) return false;
    if (
      options.formVintage !== undefined &&
      rule.formVintages.length > 0 &&
      !rule.formVintages.includes(options.formVintage)
    ) return false;
    return true;
  });
}

export function getTaxFormVintage(formNumber: string, vintage: number) {
  return taxKnowledgeRegistry.forms.find(
    (form) => form.formNumber === formNumber && form.vintage === vintage,
  );
}

