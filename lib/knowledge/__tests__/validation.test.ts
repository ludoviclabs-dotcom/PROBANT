import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAllCycles } from "@/lib/audit-cycles/loader";
import crosswalkData from "@/data/crosswalks/knowledge-crosswalks.json";
import statisticsData from "@/data/statistics/external-statistics.json";
import { CrosswalkEntrySchema, ExternalStatisticSchema } from "../schemas";
import { knowledgeRegistry } from "../registry";
import type { KnowledgeRegistry } from "../types";
import { validateKnowledgeRegistry } from "../validation";

function cloneRegistry(): KnowledgeRegistry {
  return structuredClone(knowledgeRegistry);
}

describe("knowledge registry validation", () => {
  it("validates the initial versioned registry and required source coverage", () => {
    const result = validateKnowledgeRegistry(knowledgeRegistry);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.stats.records).toBeGreaterThan(20);

    const ids = new Set(knowledgeRegistry.records.map((record) => record.id));
    for (const id of [
      "pcg-anc-2014-03",
      "anc-2026-03",
      "anc-2026-04",
      "lpf-a47-a1",
      "bofip-fec-format",
      "h2a-referentiel-normatif",
      "ifrs-required-2026",
      "ifrs-18",
      "ifrs-19",
      "ifrs-taxonomy-2025-2026",
      "acpr-ifrs",
      "acpr-isa",
      "cncc-ifrs-referentiel",
      "ey-ifrs-18-analysis",
      "pwc-ifrs-18-analysis",
    ]) {
      expect(ids.has(id), `missing source ${id}`).toBe(true);
    }
  });

  it("rejects a mandatory rule produced from a secondary source", () => {
    const registry = cloneRegistry();
    registry.requirements.push({
      id: "bad-secondary-rule",
      label: "Bad secondary rule",
      summary: "A secondary analysis must never become a mandatory rule.",
      force: "mandatory",
      applicability: "direct_eu",
      authorityLevel: "interpretive_analysis",
      sourceId: "ey-ifrs-18-analysis",
      sourceVersion: "update-2026-04-29",
      paragraphReference: {
        sourceId: "ey-ifrs-18-analysis",
        sourceVersion: "update-2026-04-29",
        locator: "analysis",
      },
    });

    const result = validateKnowledgeRegistry(registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.id === "bad-secondary-rule")).toBe(true);
  });

  it("rejects a statistic without period or unit", () => {
    const registry = cloneRegistry();
    registry.statistics.push({
      id: "bad-stat",
      label: "Bad stat",
      value: 1,
      unit: "",
      period: "",
      geographicScope: "FR",
      populationScope: "Test",
      methodology: "Test",
      sourceId: "lpf-a47-a1",
      sourceVersion: "version-en-vigueur-2013-08-02",
      lastVerifiedAt: "2026-08-13",
    });

    const result = validateKnowledgeRegistry(registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.id === "bad-stat" && issue.field === "statistics.period")).toBe(true);
    expect(result.errors.some((issue) => issue.id === "bad-stat" && issue.field === "statistics.unit")).toBe(true);
  });

  it("rejects an IFRS without IASB and EU adoption metadata", () => {
    const registry = cloneRegistry();
    const version = registry.versions.find((candidate) => candidate.sourceId === "ifrs-18");
    expect(version).toBeDefined();
    delete version!.iasbEffectiveFrom;
    delete version!.euEndorsementStatus;
    delete version!.euEndorsementSource;

    const result = validateKnowledgeRegistry(registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.field === "versions.euEndorsementStatus")).toBe(true);
    expect(result.errors.some((issue) => issue.field === "versions.iasbStatus")).toBe(true);
  });

  it("rejects a mandatory numeric rule without a source and paragraph", () => {
    const registry = cloneRegistry();
    registry.requirements.push({
      id: "bad-unsourced-threshold",
      label: "Unsourced threshold",
      summary: "Un seuil ne peut pas etre obligatoire sans source.",
      force: "mandatory",
      applicability: "direct_fr",
      authorityLevel: "law",
      sourceId: "",
      sourceVersion: "",
      numericThreshold: { value: 10, unit: "percent", operator: "gte" },
    });

    const result = validateKnowledgeRegistry(registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.field.includes("requirements"))).toBe(true);
  });

  it("rejects a superseded version kept active without justification", () => {
    const registry = cloneRegistry();
    const version = registry.versions.find((candidate) => candidate.sourceId === "pcg-anc-2014-03");
    expect(version).toBeDefined();
    version!.supersededBy = version!.versionLabel;

    const result = validateKnowledgeRegistry(registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.field === "versions.status")).toBe(true);
  });

  it("rejects an abnormally long IFRS payload", () => {
    const registry = cloneRegistry();
    registry.requirements.push({
      id: "copied-ifrs-text",
      label: "Copied IFRS text",
      summary: "x".repeat(5000),
      force: "review_required",
      applicability: "international_reference",
      authorityLevel: "international_standard",
      sourceId: "ifrs-18",
      sourceVersion: "issued-2024-04-09",
    });

    const result = validateKnowledgeRegistry(registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.id === "copied-ifrs-text")).toBe(true);
  });

  it("rejects a NEP/ISA crosswalk presented as directly applicable", () => {
    const registry = cloneRegistry();
    registry.crosswalks.push({
      id: "bad-nep-isa-applicability",
      fromKind: "NEP",
      fromId: "NEP 230",
      toKind: "ISA",
      toId: "ISA 230",
      relation: "corresponds_to",
      applicability: "direct",
      sourceId: "acpr-isa",
      sourceVersion: "page-2024-12-27",
      status: "effective",
    });

    const result = validateKnowledgeRegistry(registry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.id === "bad-nep-isa-applicability")).toBe(true);
  });

  it("validates the data-plane crosswalk and statistic files", () => {
    expect(crosswalkData.every((entry) => CrosswalkEntrySchema.safeParse(entry).success)).toBe(true);
    expect(statisticsData.every((entry) => ExternalStatisticSchema.safeParse(entry).success)).toBe(true);
  });

  it("keeps REVIEW_REQUIRED exhaustive", () => {
    const reviewDocument = readFileSync(
      resolve(process.cwd(), "docs/knowledge/REVIEW_REQUIRED.md"),
      "utf8",
    );
    const expectedIds = [
      ...knowledgeRegistry.versions
        .filter(
          (version) =>
            ["review_required", "pending_endorsement"].includes(version.status) ||
            ["review_required", "pending"].includes(version.euEndorsementStatus ?? ""),
        )
        .map((version) => `${version.sourceId}:${version.versionLabel}`),
      ...knowledgeRegistry.requirements
        .filter((requirement) => requirement.force === "review_required")
        .map((requirement) => requirement.id),
      ...knowledgeRegistry.crosswalks
        .filter((entry) => entry.status === "review_required")
        .map((entry) => entry.id),
    ];

    for (const id of expectedIds) {
      expect(reviewDocument, `missing REVIEW_REQUIRED entry ${id}`).toContain(`\`${id}\``);
    }
  });

  it("keeps the existing 35 audit cycles loadable", async () => {
    const cycles = await loadAllCycles();
    expect(cycles).toHaveLength(35);
  });
});
