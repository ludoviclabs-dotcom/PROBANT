import { TaxKnowledgeRegistrySchema } from "./tax-schemas";
import type {
  TaxKnowledgeRegistry,
  TaxRuleVersion,
  TaxSource,
  TaxSourceVersion,
} from "./tax-types";

export interface TaxKnowledgeValidationIssue {
  field: string;
  message: string;
  id?: string;
}

export interface TaxKnowledgeValidationResult {
  valid: boolean;
  errors: TaxKnowledgeValidationIssue[];
  warnings: TaxKnowledgeValidationIssue[];
  stats: {
    sources: number;
    sourceVersions: number;
    forms: number;
    rules: number;
    crosswalks: number;
    extensions: number;
    reviewRequired: number;
  };
}

const OFFICIAL_HOSTS = new Set([
  "legifrance.gouv.fr",
  "www.legifrance.gouv.fr",
  "bofip.impots.gouv.fr",
  "impots.gouv.fr",
  "www.impots.gouv.fr",
  "economie.gouv.fr",
  "www.economie.gouv.fr",
  "urssaf.fr",
  "www.urssaf.fr",
]);

const NON_NORMATIVE_NATURES = new Set([
  "official_form",
  "official_notice",
  "official_service_guidance",
  "secondary_analysis",
]);

function checkUniqueIds(
  field: string,
  items: Array<{ id: string }>,
  errors: TaxKnowledgeValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) errors.push({ field, id: item.id, message: "identifiant duplique" });
    seen.add(item.id);
  }
}

function intervalsOverlap(left: TaxRuleVersion, right: TaxRuleVersion): boolean {
  const leftStart = left.effectiveFrom ?? "0000-01-01";
  const rightStart = right.effectiveFrom ?? "0000-01-01";
  const leftEnd = left.effectiveTo ?? "9999-12-31";
  const rightEnd = right.effectiveTo ?? "9999-12-31";
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function scopesOverlap(left: TaxRuleVersion, right: TaxRuleVersion): boolean {
  const yearsOverlap =
    left.fiscalYears.length === 0 ||
    right.fiscalYears.length === 0 ||
    left.fiscalYears.some((year) => right.fiscalYears.includes(year));
  const vintagesOverlap =
    left.formVintages.length === 0 ||
    right.formVintages.length === 0 ||
    left.formVintages.some((vintage) => right.formVintages.includes(vintage));
  return yearsOverlap && vintagesOverlap;
}

function sourceVersionMatches(
  sourceVersion: TaxSourceVersion | undefined,
  sourceId: string,
): boolean {
  return Boolean(sourceVersion && sourceVersion.sourceId === sourceId);
}

export function validateTaxKnowledgeRegistry(
  registry: TaxKnowledgeRegistry,
  asOf = "2026-08-16",
): TaxKnowledgeValidationResult {
  const errors: TaxKnowledgeValidationIssue[] = [];
  const warnings: TaxKnowledgeValidationIssue[] = [];
  const parsed = TaxKnowledgeRegistrySchema.safeParse(registry);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const index = typeof issue.path[1] === "number" ? issue.path[1] : undefined;
      const collection = typeof issue.path[0] === "string" ? issue.path[0] : undefined;
      const item = collection && index !== undefined
        ? (registry as unknown as Record<string, Array<{ id?: string }>>)[collection]?.[index]
        : undefined;
      errors.push({ field: issue.path.join("."), id: item?.id, message: issue.message });
    }
  }

  checkUniqueIds("sources.id", registry.sources, errors);
  checkUniqueIds("sourceVersions.id", registry.sourceVersions, errors);
  checkUniqueIds("forms.id", registry.forms, errors);
  checkUniqueIds("rules.id", registry.rules, errors);
  checkUniqueIds("crosswalks.id", registry.crosswalks, errors);
  checkUniqueIds("extensions.id", registry.extensions, errors);

  const sources = new Map<string, TaxSource>();
  for (const source of registry.sources) {
    sources.set(source.id, source);
    try {
      const host = new URL(source.canonicalUrl).hostname.toLowerCase();
      if (source.nature !== "secondary_analysis" && !OFFICIAL_HOSTS.has(host)) {
        errors.push({ field: "sources.canonicalUrl", id: source.id, message: `domaine officiel non autorise: ${host}` });
      }
    } catch {
      errors.push({ field: "sources.canonicalUrl", id: source.id, message: "URL invalide" });
    }
    if (NON_NORMATIVE_NATURES.has(source.nature) && source.mandatoryBasisAllowed) {
      errors.push({
        field: "sources.mandatoryBasisAllowed",
        id: source.id,
        message: "un formulaire, une notice, une guidance ou une source secondaire ne peut fonder seule une obligation",
      });
    }
    if (["official_form", "official_notice"].includes(source.nature) && source.authorityLevel === "law") {
      errors.push({ field: "sources.authorityLevel", id: source.id, message: "un formulaire ou une notice ne constitue pas la loi" });
    }
  }

  const sourceVersions = new Map<string, TaxSourceVersion>();
  for (const version of registry.sourceVersions) {
    sourceVersions.set(version.id, version);
    if (!sources.has(version.sourceId)) {
      errors.push({ field: "sourceVersions.sourceId", id: version.id, message: "source inconnue" });
    }
    if (version.status === "effective" && (!version.publishedAt || !version.effectiveFrom)) {
      errors.push({ field: "sourceVersions.status", id: version.id, message: "une version effective doit avoir des dates publiee et d'effet verifiees" });
    }
    if (version.status === "effective" && version.effectiveFrom && version.effectiveFrom > asOf) {
      errors.push({ field: "sourceVersions.status", id: version.id, message: "une version future ne peut pas etre active" });
    }
  }

  const checkReference = (
    field: string,
    ownerId: string,
    sourceId: string,
    sourceVersionId: string,
  ): void => {
    if (!sources.has(sourceId)) {
      errors.push({ field: `${field}.sourceId`, id: ownerId, message: "source inconnue" });
      return;
    }
    if (!sourceVersionMatches(sourceVersions.get(sourceVersionId), sourceId)) {
      errors.push({ field: `${field}.sourceVersionId`, id: ownerId, message: "version de source absente ou rattachee a une autre source" });
    }
  };

  for (const form of registry.forms) {
    checkReference("forms", form.id, form.sourceId, form.sourceVersionId);
    if (form.status === "effective" && form.effectiveFrom && form.effectiveFrom > asOf) {
      errors.push({ field: "forms.status", id: form.id, message: "un millesime futur ne peut pas etre actif" });
    }
    const codes = new Set<string>();
    for (const box of form.boxes) {
      if (box.formVintage !== form.vintage) {
        errors.push({ field: "forms.boxes.formVintage", id: form.id, message: `la case ${box.code} ne porte pas le millesime du formulaire` });
      }
      if (codes.has(box.code)) {
        errors.push({ field: "forms.boxes.code", id: form.id, message: `case dupliquee: ${box.code}` });
      }
      codes.add(box.code);
    }
  }

  const versionsByRuleCode = new Map<string, TaxRuleVersion[]>();
  for (const rule of registry.rules) {
    checkReference("rules", rule.id, rule.sourceId, rule.sourceVersionId);
    for (const reference of rule.paragraphReferences) {
      checkReference("rules.paragraphReferences", rule.id, reference.sourceId, reference.sourceVersionId);
    }

    const source = sources.get(rule.sourceId);
    if (rule.force === "mandatory" && (!source || !source.mandatoryBasisAllowed || NON_NORMATIVE_NATURES.has(source.nature))) {
      errors.push({ field: "rules.force", id: rule.id, message: "une obligation doit reposer sur un fondement officiel normatif exact" });
    }
    if (rule.status === "effective" && (!rule.publishedAt || !rule.effectiveFrom)) {
      errors.push({ field: "rules.status", id: rule.id, message: "une regle effective doit avoir des dates publiee et d'effet verifiees" });
    }
    if (rule.status === "effective" && rule.effectiveFrom && rule.effectiveFrom > asOf) {
      errors.push({ field: "rules.status", id: rule.id, message: "une regle future ne peut pas etre active" });
    }
    if (rule.status === "future" && rule.effectiveFrom && rule.effectiveFrom <= asOf) {
      errors.push({ field: "rules.status", id: rule.id, message: "une regle deja entree en vigueur ne peut rester future" });
    }
    if (rule.calculationSpecification.kind === "rate" && (!rule.effectiveFrom || rule.fiscalYears.length === 0)) {
      errors.push({ field: "rules.calculationSpecification", id: rule.id, message: "un taux doit porter une periode et un exercice fiscal" });
    }
    if (rule.calculationSpecification.kind !== "none") {
      if (!rule.calculationSpecification.expression || !rule.calculationSpecification.traceRequired || rule.calculationSpecification.steps.length === 0) {
        errors.push({ field: "rules.calculationSpecification", id: rule.id, message: "une formule ou relation doit etre explicite, sourcee et tracable" });
      }
      for (const step of rule.calculationSpecification.steps) {
        for (const reference of step.paragraphReferences) {
          checkReference("rules.calculationSpecification.steps", rule.id, reference.sourceId, reference.sourceVersionId);
        }
      }
      if (!source || source.nature === "secondary_analysis") {
        errors.push({ field: "rules.calculationSpecification", id: rule.id, message: "une formule ne peut reposer sur une source secondaire ou absente" });
      }
    }

    const siblings = versionsByRuleCode.get(rule.ruleCode) ?? [];
    for (const sibling of siblings) {
      if (
        ["effective", "future"].includes(rule.status) &&
        ["effective", "future"].includes(sibling.status) &&
        intervalsOverlap(rule, sibling) &&
        scopesOverlap(rule, sibling)
      ) {
        errors.push({ field: "rules.effectiveFrom", id: rule.id, message: `chevauchement incoherent avec ${sibling.id}` });
      }
    }
    siblings.push(rule);
    versionsByRuleCode.set(rule.ruleCode, siblings);
  }

  for (const crosswalk of registry.crosswalks) {
    for (const reference of crosswalk.sourceReferences) {
      checkReference("crosswalks.sourceReferences", crosswalk.id, reference.sourceId, reference.sourceVersionId);
    }
  }

  for (const extension of registry.extensions) {
    checkReference("extensions", extension.id, extension.sourceId, extension.sourceVersionId);
  }

  const reviewRequired =
    registry.sourceVersions.filter((item) => item.status === "review_required").length +
    registry.forms.filter((item) => item.status === "review_required").length +
    registry.rules.filter((item) => item.status === "review_required" || item.force === "review_required").length +
    registry.crosswalks.filter((item) => item.status === "review_required").length +
    registry.extensions.filter((item) => item.status === "review_required").length;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      sources: registry.sources.length,
      sourceVersions: registry.sourceVersions.length,
      forms: registry.forms.length,
      rules: registry.rules.length,
      crosswalks: registry.crosswalks.length,
      extensions: registry.extensions.length,
      reviewRequired,
    },
  };
}

