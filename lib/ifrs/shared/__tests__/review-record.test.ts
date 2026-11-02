import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { consignedLeaseReviews, LEASE_REVIEW_FICHES, LEASE_REVIEW_REFUSALS, LEASE_RULE_REVIEWED, leaseJurisdictions, leaseRuleBasis } from "@/lib/ifrs/leases/rule";
import { LEASE_RULE_REVIEW, LEASE_RULE_REVIEW_EU, type LeaseRuleReview, type LeaseRuleReviewEu } from "@/lib/ifrs/leases/rule-review";
import { REVIEW_TEMPLATE_NAMES, REVIEW_TEMPLATE_TIMES, reviewRecordIssues } from "../review-record";

/**
 * Garde des consignations de relecture : un bloc recopié d'une fiche sans nom ni heure réels n'ouvre rien. Les valeurs d'exemple sont lues dans
 * les fiches elles-mêmes, pour qu'une fiche modifiée ne laisse pas passer son nouvel exemple.
 */
const DOCS = join(__dirname, "../../../../docs/ifrs");
const NOW = new Date("2026-11-10T12:00:00.000Z");
const iasb: LeaseRuleReview = { reviewedBy: "Camille Recette", reviewedAt: "2026-10-31T12:00:00.000Z", jurisdiction: "IASB",
  confirmations: { wordByWordParagraphs: true, b9ToB33: true, internalPoliciesAccepted: true, referenceCasesExamined: true } };
const eu: LeaseRuleReviewEu = { reviewedBy: "Camille Recette", reviewedAt: "2026-11-02T15:00:00.000Z", jurisdiction: "EU_adopted",
  text: { regulation: "(UE) 2023/1803", sha256: "06e74a9524d2e7c9d872e771ed960e585755645da2e54a1b793eb3779c424951" },
  confirmations: { frenchParagraphsWordByWord: true, sameMeaningAsIasbReview: true, laterAmendmentsOutsideV1Accepted: true } };
const bounds = { notBefore: "2026-10-29T22:50:54.000Z", now: NOW };

describe("Garde des consignations de relecture", () => {
  it("les noms et heures d'exemple de chaque fiche sont refusés, et chaque fiche n'en a pas d'autres", () => {
    for (const file of ["FICHE_RELECTURE_UE.md", "REVUE_REGLE_IFRS16.md", "FICHE_RELECTURE_UTILISATEUR.md"]) {
      const text = readFileSync(join(DOCS, file), "utf8");
      const name = /reviewedBy: "([^"]+)"/.exec(text)![1], at = /reviewedAt: "([^"]+)"/.exec(text)![1];
      expect(REVIEW_TEMPLATE_NAMES, file).toContain(name);
      expect(REVIEW_TEMPLATE_TIMES, file).toContain(at);
      expect(reviewRecordIssues({ reviewedBy: name, reviewedAt: "2026-11-02T15:00:00.000Z" }, bounds)[0], file).toMatch(/^nom d'exemple de la fiche/);
      expect(reviewRecordIssues({ reviewedBy: "Camille Recette", reviewedAt: at }, bounds)[0], file).toMatch(/^heure d'exemple de la fiche/);
    }
    expect(reviewRecordIssues({ reviewedBy: "  prénom   NOM ", reviewedAt: "2026-11-02T15:00:00.000Z" }, bounds)).toHaveLength(1);
  });

  it("nom vide, heure hors format, date inexistante, heure antérieure à la fiche ou future : refusés ; une vraie consignation passe", () => {
    expect(reviewRecordIssues({ reviewedBy: " ", reviewedAt: "2026-11-02T15:00:00.000Z" }, bounds)).toEqual(["nom de la personne qui relit absent"]);
    for (const at of ["", "2026-11-02 16:45", "2026-11-02T16:45:00Z", "2026-11-02T16:45:00.000+01:00", "2026-02-30T10:00:00.000Z", "2026-11-02T25:00:00.000Z"])
      expect(reviewRecordIssues({ reviewedBy: "Camille Recette", reviewedAt: at }, bounds)[0], at).toMatch(/hors du format/);
    expect(reviewRecordIssues({ reviewedBy: "Camille Recette", reviewedAt: "2026-10-29T12:00:00.000Z" }, bounds)[0]).toMatch(/antérieure à la fiche/);
    expect(reviewRecordIssues({ reviewedBy: "Camille Recette", reviewedAt: "2026-11-10T12:00:01.000Z" }, bounds)[0]).toMatch(/dans le futur/);
    expect(reviewRecordIssues({ reviewedBy: "Camille Recette", reviewedAt: "2026-11-10T12:00:00.000Z" }, bounds)).toEqual([]);
  });

  it("une consignation refusée compte comme absente : UE refusée → IASB seule ; IASB refusée → règle à revoir, aucune juridiction", () => {
    const euRefused = consignedLeaseReviews(iasb, { ...eu, reviewedBy: "Prénom Nom" }, NOW);
    expect(euRefused.euReview).toBeNull();
    expect(leaseJurisdictions(euRefused.review, euRefused.euReview).map(j => j.jurisdiction)).toEqual(["IASB"]);
    expect(euRefused.refusals).toEqual(["Relecture UE consignée refusée (docs/ifrs/FICHE_RELECTURE_UE.md) : nom d'exemple de la fiche (« Prénom Nom ») au lieu du nom de la personne qui relit"]);
    // An EU review timed before its fiche existed (the template's 00:00 of the same day) is refused too.
    expect(consignedLeaseReviews(iasb, { ...eu, reviewedAt: "2026-11-02T09:00:00.000Z" }, NOW).refusals[0]).toMatch(/antérieure à la fiche de relecture \(2026-11-02T10:10:41\.000Z\)/);
    const iasbRefused = consignedLeaseReviews({ ...iasb, reviewedAt: "2026-11-02T10:00:00.000Z" }, eu, NOW);
    expect(iasbRefused.review).toBeNull();
    expect(leaseJurisdictions(iasbRefused.review, iasbRefused.euReview)).toEqual([]);
    expect(leaseRuleBasis(iasbRefused.review)).toMatchObject({ status: "review_required" });
    expect(consignedLeaseReviews(iasb, eu, NOW)).toMatchObject({ review: iasb, euReview: eu, refusals: [] });
    expect(LEASE_REVIEW_FICHES.eu.notBefore).toBe("2026-11-02T10:10:41.000Z");
  });

  it("les consignations réelles de rule-review.ts sont retenues (un bloc d'exemple collé tel quel fait échouer ce test)", () => {
    expect(LEASE_REVIEW_REFUSALS).toEqual([]);
    expect(LEASE_RULE_REVIEWED).toBe(LEASE_RULE_REVIEW !== null);
    if (LEASE_RULE_REVIEW_EU) expect(consignedLeaseReviews(LEASE_RULE_REVIEW, LEASE_RULE_REVIEW_EU).euReview).not.toBeNull();
  });
});
