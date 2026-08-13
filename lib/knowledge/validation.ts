import { KnowledgeRegistrySchema } from "./schemas";
import type { KnowledgeRegistry, SourceRecord, SourceVersion } from "./types";

export interface KnowledgeValidationIssue {
  field: string;
  message: string;
  id?: string;
}

export interface KnowledgeValidationResult {
  valid: boolean;
  errors: KnowledgeValidationIssue[];
  warnings: KnowledgeValidationIssue[];
  stats: {
    records: number;
    versions: number;
    requirements: number;
    statistics: number;
    reviewRequired: number;
  };
}

const ALLOWED_HOSTS = new Set([
  "legifrance.gouv.fr",
  "www.legifrance.gouv.fr",
  "anc.gouv.fr",
  "www.anc.gouv.fr",
  "bofip.impots.gouv.fr",
  "h2a-france.org",
  "www.h2a-france.org",
  "ifrs.org",
  "www.ifrs.org",
  "eur-lex.europa.eu",
  "efrag.org",
  "www.efrag.org",
  "acpr.banque-france.fr",
  "cncc.fr",
  "www.cncc.fr",
  "doc.cncc.fr",
  "experts-comptables.fr",
  "www.experts-comptables.fr",
  "ey.com",
  "www.ey.com",
  "pwc.fr",
  "www.pwc.fr",
]);

function sourceVersionKey(version: SourceVersion): string {
  return `${version.sourceId}:${version.versionLabel}`;
}

function isSecondarySource(record: SourceRecord): boolean {
  return record.sourceNature === "secondary_analysis";
}

function isIfrsStandard(record: SourceRecord): boolean {
  return ["ifrs_standard_metadata", "ifrs_standards_collection_metadata"].includes(
    record.documentType,
  );
}

function checkUniqueIds(
  field: string,
  items: Array<{ id: string }>,
  errors: KnowledgeValidationIssue[],
): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) {
      errors.push({ field, id: item.id, message: "identifiant duplique" });
    }
    ids.add(item.id);
  }
}

export function validateKnowledgeRegistry(
  registry: KnowledgeRegistry,
): KnowledgeValidationResult {
  const errors: KnowledgeValidationIssue[] = [];
  const warnings: KnowledgeValidationIssue[] = [];

  const parsed = KnowledgeRegistrySchema.safeParse(registry);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({ field: issue.path.join("."), message: issue.message });
    }
  }

  const records = new Map<string, SourceRecord>();
  for (const record of registry.records) {
    if (records.has(record.id)) {
      errors.push({ field: "records.id", id: record.id, message: "identifiant de source duplique" });
    }
    records.set(record.id, record);

    if (record.canonicalUrl.startsWith("internal://")) {
      if (record.sourceNature !== "internal_rule") {
        errors.push({
          field: "records.canonicalUrl",
          id: record.id,
          message: "une URL interne est reservee aux regles internes PROBANT",
        });
      }
      continue;
    }
    try {
      const host = new URL(record.canonicalUrl).hostname.toLowerCase();
      if (!ALLOWED_HOSTS.has(host)) {
        errors.push({
          field: "records.canonicalUrl",
          id: record.id,
          message: `domaine source non autorise: ${host}`,
        });
      }
    } catch {
      errors.push({
        field: "records.canonicalUrl",
        id: record.id,
        message: "URL de source invalide",
      });
    }
  }

  const versionsByKey = new Map<string, SourceVersion>();
  for (const version of registry.versions) {
    const key = sourceVersionKey(version);
    if (versionsByKey.has(key)) {
      errors.push({ field: "versions.versionLabel", id: key, message: "version de source dupliquee" });
    }
    versionsByKey.set(key, version);
    const record = records.get(version.sourceId);
    if (!record) {
      errors.push({ field: "versions.sourceId", id: key, message: "version rattachee a une source inconnue" });
      continue;
    }
    if (record.id.startsWith("h2a-nep-") && !version.homologationDate) {
      errors.push({
        field: "versions.homologationDate",
        id: key,
        message: "une NEP doit porter sa date d'homologation",
      });
    }
    if (isIfrsStandard(record)) {
      if (!version.iasbStatus || !version.iasbEffectiveFrom) {
        errors.push({
          field: "versions.iasbStatus",
          id: key,
          message: "une IFRS doit distinguer statut et date d'effet IASB",
        });
      }
      if (!version.euEndorsementStatus) {
        errors.push({
          field: "versions.euEndorsementStatus",
          id: key,
          message: "une IFRS doit porter son statut d'adoption UE",
        });
      } else if (
        version.euEndorsementStatus !== "not_applicable" &&
        !version.euEndorsementSource
      ) {
        errors.push({
          field: "versions.euEndorsementSource",
          id: key,
          message: "le statut d'adoption UE d'une IFRS doit citer sa source",
        });
      }
    }
    if (version.status === "effective" && version.supersededBy && !version.supersessionJustification) {
      errors.push({
        field: "versions.status",
        id: key,
        message: "une version remplacee ne peut rester active sans justification",
      });
    }
  }

  const checkSourceVersionReference = (
    field: string,
    id: string,
    sourceId: string,
    sourceVersion: string,
  ): void => {
    if (!records.has(sourceId)) {
      errors.push({ field: `${field}.sourceId`, id, message: "reference rattachee a une source inconnue" });
    } else if (!versionsByKey.has(`${sourceId}:${sourceVersion}`)) {
      errors.push({ field: `${field}.sourceVersion`, id, message: "reference rattachee a une version inconnue" });
    }
  };

  for (const version of registry.versions) {
    if (version.euEndorsementSource) {
      checkSourceVersionReference(
        "versions.euEndorsementSource",
        sourceVersionKey(version),
        version.euEndorsementSource.sourceId,
        version.euEndorsementSource.sourceVersion,
      );
    }
    for (const linkedVersion of [version.supersedes, version.supersededBy]) {
      if (linkedVersion && !versionsByKey.has(`${version.sourceId}:${linkedVersion}`)) {
        errors.push({
          field: "versions.supersession",
          id: sourceVersionKey(version),
          message: "lien de remplacement vers une version inconnue",
        });
      }
    }
  }

  checkUniqueIds("requirements.id", registry.requirements, errors);
  checkUniqueIds("crosswalks.id", registry.crosswalks, errors);
  checkUniqueIds("statistics.id", registry.statistics, errors);

  for (const requirement of registry.requirements) {
    checkSourceVersionReference(
      "requirements",
      requirement.id,
      requirement.sourceId,
      requirement.sourceVersion,
    );
    const record = records.get(requirement.sourceId);
    if (!record) continue;

    if (requirement.force === "mandatory" && isSecondarySource(record)) {
      errors.push({
        field: "requirements.force",
        id: requirement.id,
        message: "une source secondaire ne peut pas fonder une exigence obligatoire",
      });
    }
    if (requirement.force === "mandatory" && record.sourceNature === "internal_rule") {
      errors.push({
        field: "requirements.force",
        id: requirement.id,
        message: "un parametre interne ne peut pas etre presente comme obligation externe",
      });
    }
    if (
      requirement.paragraphReference &&
      (requirement.paragraphReference.sourceId !== requirement.sourceId ||
        requirement.paragraphReference.sourceVersion !== requirement.sourceVersion)
    ) {
      errors.push({
        field: "requirements.paragraphReference",
        id: requirement.id,
        message: "la reference de paragraphe doit viser la source de l'exigence",
      });
    }
    if (
      requirement.force === "mandatory" &&
      requirement.numericThreshold &&
      (!requirement.sourceId || !requirement.sourceVersion || !requirement.paragraphReference)
    ) {
      errors.push({
        field: "requirements.numericThreshold",
        id: requirement.id,
        message: "une regle chiffree obligatoire doit etre sourcee au paragraphe",
      });
    }
    if (isIfrsStandard(record) && requirement.summary.length > 1200) {
      errors.push({
        field: "requirements.summary",
        id: requirement.id,
        message: "contenu IFRS anormalement long: conserver un resume original, pas le texte integral",
      });
    }
  }

  for (const statistic of registry.statistics) {
    checkSourceVersionReference(
      "statistics",
      statistic.id,
      statistic.sourceId,
      statistic.sourceVersion,
    );
    if (!statistic.period.trim()) {
      errors.push({ field: "statistics.period", id: statistic.id, message: "une statistique doit indiquer une periode" });
    }
    if (!statistic.unit.trim()) {
      errors.push({ field: "statistics.unit", id: statistic.id, message: "une statistique doit indiquer une unite" });
    }
  }

  for (const crosswalk of registry.crosswalks) {
    checkSourceVersionReference(
      "crosswalks",
      crosswalk.id,
      crosswalk.sourceId,
      crosswalk.sourceVersion,
    );
    const isNepIsa =
      (crosswalk.fromKind === "NEP" && crosswalk.toKind === "ISA") ||
      (crosswalk.fromKind === "ISA" && crosswalk.toKind === "NEP");
    if (isNepIsa && crosswalk.applicability !== "international_correspondence_only") {
      errors.push({
        field: "crosswalks.applicability",
        id: crosswalk.id,
        message: "une correspondance NEP/ISA ne doit pas presenter l'ISA comme directement applicable en France",
      });
    }
  }

  for (const verification of registry.verifications) {
    checkSourceVersionReference(
      "verifications",
      `${verification.sourceId}:${verification.sourceVersion}`,
      verification.sourceId,
      verification.sourceVersion,
    );
    if (
      verification.result === "pass_with_limitations" &&
      (!verification.unverifiedFields || verification.unverifiedFields.length === 0)
    ) {
      warnings.push({
        field: "verifications.unverifiedFields",
        id: `${verification.sourceId}:${verification.sourceVersion}`,
        message: "les champs non verifies devraient etre enumeres",
      });
    }
  }

  const reviewRequired =
    registry.versions.filter((version) =>
      ["review_required", "pending_endorsement"].includes(version.status),
    ).length +
    registry.requirements.filter((requirement) => requirement.force === "review_required").length +
    registry.crosswalks.filter((entry) => entry.status === "review_required").length;

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      records: registry.records.length,
      versions: registry.versions.length,
      requirements: registry.requirements.length,
      statistics: registry.statistics.length,
      reviewRequired,
    },
  };
}
