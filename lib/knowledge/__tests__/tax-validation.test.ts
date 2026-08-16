import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getTaxFormVintage,
  listApplicableTaxRules,
  taxKnowledgeRegistry,
} from "../tax-registry";
import type { TaxKnowledgeRegistry, TaxRuleVersion } from "../tax-types";
import { validateTaxKnowledgeRegistry } from "../tax-validation";

function cloneRegistry(): TaxKnowledgeRegistry {
  return structuredClone(taxKnowledgeRegistry);
}

function findRule(registry: TaxKnowledgeRegistry, id: string): TaxRuleVersion {
  const rule = registry.rules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`missing fixture rule ${id}`);
  return rule;
}

describe("tax knowledge registry", () => {
  it("validates the executable initial registry", () => {
    const result = validateTaxKnowledgeRegistry(taxKnowledgeRegistry);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.stats.rules).toBeGreaterThanOrEqual(15);
    expect(result.stats.forms).toBe(6);
    expect(result.stats.extensions).toBe(4);
  });

  it("refuses a rule without a source", () => {
    const registry = cloneRegistry();
    const rule = findRule(registry, "is-declaration-2065-current");
    rule.sourceId = "missing-source";
    rule.sourceVersionId = "missing-version";
    const result = validateTaxKnowledgeRegistry(registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.id === rule.id && issue.field.includes("sourceId"))).toBe(true);
  });

  it("refuses a rate without an explicit period", () => {
    const registry = cloneRegistry();
    const rule = findRule(registry, "is-taux-normal-2026");
    rule.effectiveFrom = null;
    rule.fiscalYears = [];
    const result = validateTaxKnowledgeRegistry(registry);
    expect(result.errors.some((issue) => issue.id === rule.id && issue.message.includes("taux"))).toBe(true);
  });

  it("refuses a form box without its vintage", () => {
    const registry = cloneRegistry();
    const box = registry.forms[0].boxes[0] as Partial<(typeof registry.forms)[number]["boxes"][number]>;
    delete box.formVintage;
    const result = validateTaxKnowledgeRegistry(registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.field.includes("formVintage"))).toBe(true);
  });

  it("refuses incoherent overlapping rule versions", () => {
    const registry = cloneRegistry();
    const duplicate = structuredClone(findRule(registry, "is-taux-normal-2026"));
    duplicate.id = "is-taux-normal-overlap";
    registry.rules.push(duplicate);
    const result = validateTaxKnowledgeRegistry(registry);
    expect(result.errors.some((issue) => issue.id === duplicate.id && issue.message.includes("chevauchement"))).toBe(true);
  });

  it("refuses a secondary source as mandatory authority", () => {
    const registry = cloneRegistry();
    registry.sources.push({
      id: "secondary-example",
      title: "Secondary analysis fixture",
      publisher: "Example",
      authorityLevel: "interpretive_analysis",
      nature: "secondary_analysis",
      canonicalUrl: "https://example.com/analysis",
      jurisdiction: "FR",
      taxTypes: ["corporate_income_tax"],
      mandatoryBasisAllowed: false,
      lastVerifiedAt: "2026-08-16",
    });
    registry.sourceVersions.push({
      id: "secondary-example-v1",
      sourceId: "secondary-example",
      versionLabel: "fixture",
      publishedAt: "2026-01-01",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      status: "effective",
      lastVerifiedAt: "2026-08-16",
    });
    const rule = findRule(registry, "is-declaration-2065-current");
    rule.sourceId = "secondary-example";
    rule.sourceVersionId = "secondary-example-v1";
    rule.paragraphReferences = [{ sourceId: "secondary-example", sourceVersionId: "secondary-example-v1", locator: "analysis" }];
    const result = validateTaxKnowledgeRegistry(registry);
    expect(result.errors.some((issue) => issue.id === rule.id && issue.field === "rules.force")).toBe(true);
  });

  it("refuses an untraceable calculation specification", () => {
    const registry = cloneRegistry();
    const rule = findRule(registry, "is-deficits-report-2026");
    rule.calculationSpecification.expression = null;
    rule.calculationSpecification.traceRequired = false;
    rule.calculationSpecification.steps = [];
    const result = validateTaxKnowledgeRegistry(registry);
    expect(result.errors.some((issue) => issue.id === rule.id && issue.message.includes("tracable"))).toBe(true);
  });

  it("refuses a future rule marked effective", () => {
    const registry = cloneRegistry();
    const rule = findRule(registry, "is-taux-normal-2026");
    rule.effectiveFrom = "2027-01-01";
    rule.fiscalYears = [2027];
    const result = validateTaxKnowledgeRegistry(registry, "2026-08-16");
    expect(result.errors.some((issue) => issue.id === rule.id && issue.message.includes("future"))).toBe(true);
  });

  it("keeps form notices and forms non-normative", () => {
    for (const source of taxKnowledgeRegistry.sources.filter((candidate) => ["official_form", "official_notice"].includes(candidate.nature))) {
      expect(source.mandatoryBasisAllowed).toBe(false);
      expect(source.authorityLevel).not.toBe("law");
    }
  });

  it("queries only effective rules for a given period", () => {
    const rules = listApplicableTaxRules({ taxType: "corporate_income_tax", fiscalYear: 2026, formVintage: 2026 });
    expect(rules.some((rule) => rule.id === "is-taux-normal-2026")).toBe(true);
    expect(rules.every((rule) => rule.status === "effective")).toBe(true);
    expect(getTaxFormVintage("2058-A-SD", 2026)?.boxes.some((box) => box.code === "XN")).toBe(true);
  });

  it("keeps every review_required item documented", () => {
    const document = readFileSync(resolve(process.cwd(), "docs/tax/TAX_REVIEW_REQUIRED.md"), "utf8");
    const ids = [
      ...taxKnowledgeRegistry.sourceVersions.filter((item) => item.status === "review_required").map((item) => item.id),
      ...taxKnowledgeRegistry.forms.filter((item) => item.status === "review_required").map((item) => item.id),
      ...taxKnowledgeRegistry.rules.filter((item) => item.status === "review_required" || item.force === "review_required").map((item) => item.id),
      ...taxKnowledgeRegistry.crosswalks.filter((item) => item.status === "review_required").map((item) => item.id),
    ];
    for (const id of ids) expect(document, `missing review entry ${id}`).toContain(`\`${id}\``);
  });
});

