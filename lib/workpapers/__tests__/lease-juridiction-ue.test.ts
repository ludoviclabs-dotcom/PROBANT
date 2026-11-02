import { describe, expect, it, vi } from "vitest";
import { CAPABILITY_FRAMEWORKS } from "@/lib/capabilities/registry";
import { LEASE_EU_TEXT, LEASE_JURISDICTIONS, leaseJurisdictions } from "@/lib/ifrs/leases/rule";
import type { LeaseRuleReview, LeaseRuleReviewEu } from "@/lib/ifrs/leases/rule-review";
import { LeaseRegistry } from "../lease-adapter";
import { stampLeaseWork } from "../lease-work";
import { periodId, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { freezePopulation, selectPopulation } from "../selection";
import { approvedLeaseBatches, LEASE_PERIOD } from "./lease-fixture";

/**
 * Juridiction des IFRS adoptées dans l'UE (X33) : elle s'ouvre en réel par la relecture nommée du texte UE, distincte de celle de l'IASB, et
 * pour la seule édition relue. Les deux relectures sont **simulées ici** par des valeurs de recette ; celles de `rule-review.ts` ne sont jamais
 * écrites par un test. Le cas « texte UE non relu » est gardé par `contracts.test.ts` et par l'état réel du dépôt (`lease-socle.test.ts`).
 */
const IASB_REVIEW: LeaseRuleReview = { reviewedBy: "Relecture de recette", reviewedAt: "2026-10-31T10:00:00.000Z", jurisdiction: "IASB",
  confirmations: { wordByWordParagraphs: true, b9ToB33: true, internalPoliciesAccepted: true, referenceCasesExamined: true } };
const EU_REVIEW: LeaseRuleReviewEu = { reviewedBy: "Relecture de recette", reviewedAt: "2026-11-02T10:00:00.000Z", jurisdiction: "EU_adopted",
  text: { regulation: "(UE) 2023/1803", sha256: "06e74a9524d2e7c9d872e771ed960e585755645da2e54a1b793eb3779c424951" },
  confirmations: { frenchParagraphsWordByWord: true, sameMeaningAsIasbReview: true, laterAmendmentsOutsideV1Accepted: true } };
vi.mock("@/lib/ifrs/leases/rule-review", () => ({
  LEASE_RULE_REVIEW: { reviewedBy: "Relecture de recette", reviewedAt: "2026-10-31T10:00:00.000Z", jurisdiction: "IASB",
    confirmations: { wordByWordParagraphs: true, b9ToB33: true, internalPoliciesAccepted: true, referenceCasesExamined: true } },
  LEASE_RULE_REVIEW_EU: { reviewedBy: "Relecture de recette", reviewedAt: "2026-11-02T10:00:00.000Z", jurisdiction: "EU_adopted",
    text: { regulation: "(UE) 2023/1803", sha256: "06e74a9524d2e7c9d872e771ed960e585755645da2e54a1b793eb3779c424951" },
    confirmations: { frenchParagraphsWordByWord: true, sameMeaningAsIasbReview: true, laterAmendmentsOutsideV1Accepted: true } },
}));

const scope: WorkpaperScope = { organizationId: "org-l16-ue", dossierId: "dossier-l16-ue", periodId: periodId(LEASE_PERIOD), mode: "real" };
async function request(framework: { jurisdiction: "IASB" | "EU_adopted"; edition: string; editionFingerprint: string | null }) {
  const actor: Principal = { id: "preparer-ue", grants: [{ scope, permissions: ["read", "prepare"] }] };
  const batches = await approvedLeaseBatches(scope, actor), population = freezePopulation(scope, batches, "lease_contract", actor, LEASE_PERIOD);
  const selection = selectPopulation(population, { method: "targeted", criteria: "Tous les contrats", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
  const work = stampLeaseWork({ framework: { standard: "IFRS 16", ...framework }, firstApplication: { kind: "not_applicable", reason: "Entité déjà sous IFRS 16" },
    policies: [{ kind: "short_term_exemption", assetCategory: "Matériel de bureau", answer: { kind: "value", value: "not_elected" } }], confirmations: [] }, () => { throw new Error("unused"); }, actor.id, "2027-02-01T10:00:00.000Z");
  return { scope, period: LEASE_PERIOD, rule: { id: "ifrs16.leases", version: "1.0.0" }, imports: batches, population, selection, parameters: { runId: "sheet-ue-r1", rootId: "sheet-ue", revision: 1, work } };
}

describe("Juridictions proposées : une relecture nommée par juridiction", () => {
  it("rien sans la relecture IASB de la règle ; l'IASB seule sans relecture UE ; l'UE en plus, pour l'empreinte du texte relu seulement", () => {
    expect(leaseJurisdictions(null, EU_REVIEW)).toEqual([]);
    expect(leaseJurisdictions(IASB_REVIEW, null).map(j => j.jurisdiction)).toEqual(["IASB"]);
    expect(leaseJurisdictions(IASB_REVIEW, EU_REVIEW)).toEqual([
      expect.objectContaining({ jurisdiction: "IASB", editionFingerprint: null }),
      { jurisdiction: "EU_adopted", label: expect.stringContaining("règlement 2023/1803"), edition: LEASE_EU_TEXT.edition, editionFingerprint: LEASE_EU_TEXT.sha256 }]);
    const otherText = { ...EU_REVIEW, text: { ...EU_REVIEW.text, sha256: "f".repeat(64) } } as unknown as LeaseRuleReviewEu;
    expect(leaseJurisdictions(IASB_REVIEW, otherText).map(j => j.jurisdiction)).toEqual(["IASB"]);
  });
});

describe("Texte UE relu (relectures simulées) : EU_adopted exécutable en réel pour l'édition relue", () => {
  it("l'écran propose les deux juridictions ; une feuille UE de l'édition relue est calculée comme l'IASB, aux mêmes montants", async () => {
    expect(LEASE_JURISDICTIONS.map(j => j.jurisdiction)).toEqual(["IASB", "EU_adopted"]);
    const eu = new LeaseRegistry().execute(await request({ jurisdiction: "EU_adopted", edition: LEASE_EU_TEXT.edition, editionFingerprint: LEASE_EU_TEXT.sha256 }));
    const iasb = new LeaseRegistry().execute(await request({ jurisdiction: "IASB", edition: "IFRS 16, IASB 2026", editionFingerprint: null }));
    expect(eu).toMatchObject({ execution: "completed", blockedControls: [] });
    expect(JSON.stringify((eu.result as { contracts: { closing: unknown }[] }).contracts.map(c => c.closing))).toBe(JSON.stringify((iasb.result as { contracts: { closing: unknown }[] }).contracts.map(c => c.closing)));
  });
  it("une feuille UE qui déclare une autre édition (ou aucune empreinte) reste bloquée par X33, sans montant", async () => {
    for (const editionFingerprint of [null, "e".repeat(64)]) {
      const r = new LeaseRegistry().execute(await request({ jurisdiction: "EU_adopted", edition: "IFRS 16, version consolidée", editionFingerprint }));
      expect(r).toMatchObject({ execution: "blocked", outcome: "inconclusive" });
      expect(r.blockedControls).toEqual(expect.arrayContaining([expect.stringContaining("X33 : édition déclarée différente")]));
      expect(JSON.stringify(r.result)).not.toMatch(/"amount"/);
    }
  });
  it("le registre des capacités dit l'UE ouverte pour le seul texte relu", () => {
    const [leases] = CAPABILITY_FRAMEWORKS, text = leases.exclusions.join(" ");
    expect(text).toContain("Juridiction EU_adopted ouverte en réel pour le seul texte relu");
    expect(text).toContain("Règle relue pour les juridictions IASB et EU_adopted");
    expect(leases.modes.local_persistent.scope).toContain("et pour la juridiction EU_adopted (règlement (UE) 2023/1803, version d'origine)");
  });
});
