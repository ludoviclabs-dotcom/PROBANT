import { describe, expect, it, vi } from "vitest";
import { CAPABILITY_FRAMEWORKS } from "@/lib/capabilities/registry";
import { LEASE_RULE_BASIS } from "@/lib/ifrs/leases/rule";
import { LEASE_TEMPLATE, LeaseRegistry } from "../lease-adapter";
import type { LeaseResult } from "../lease-review";
import { stampLeaseWork } from "../lease-work";
import { periodId, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { freezePopulation, selectPopulation } from "../selection";
import { approvedLeaseBatches, LEASE_PERIOD } from "./lease-fixture";

/**
 * Garde du cas « règle non relue », dont dépend toute réouverture : sans relecture personnelle nommée consignée (`rule-review.ts` à `null`,
 * **simulé ici**), la fiche reste à revoir, la règle provisoire, toute exécution réelle est refusée sans montant, et le registre des capacités
 * ne l'annonce pas ; le scénario synthétique reste calculé. La relecture réellement consignée est vérifiée par lease-socle et contracts.
 */
vi.mock("@/lib/ifrs/leases/rule-review", () => ({ LEASE_RULE_REVIEW: null, LEASE_RULE_REVIEW_EU: null }));

const scope: WorkpaperScope = { organizationId: "org-l16-non-relue", dossierId: "dossier-l16-non-relue", periodId: periodId(LEASE_PERIOD), mode: "real" };
async function request(s: WorkpaperScope) {
  const actor: Principal = { id: "preparer-non-relue", grants: [{ scope: s, permissions: ["read", "prepare"] }] };
  const batches = await approvedLeaseBatches(s, actor), population = freezePopulation(s, batches, "lease_contract", actor, LEASE_PERIOD);
  const selection = selectPopulation(population, { method: "targeted", criteria: "Tous les contrats", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
  const work = stampLeaseWork({ framework: { standard: "IFRS 16", jurisdiction: "IASB", edition: "IFRS 16, IASB 2026", editionFingerprint: null }, firstApplication: { kind: "not_applicable", reason: "Entité déjà sous IFRS 16" },
    policies: [{ kind: "short_term_exemption", assetCategory: "Matériel de bureau", answer: { kind: "value", value: "not_elected" } }], confirmations: [] }, () => { throw new Error("unused"); }, actor.id, "2027-02-01T10:00:00.000Z");
  return { scope: s, period: LEASE_PERIOD, rule: { id: "ifrs16.leases", version: "1.0.0" }, imports: batches, population, selection, parameters: { runId: "sheet-r1", rootId: "sheet", revision: 1, work } };
}

describe("Règle ifrs16.leases non relue (relecture absente simulée)", () => {
  it("fiche à revoir, règle provisoire : l'exécution réelle est refusée (rule_not_applicable), sans résultat ni montant", async () => {
    expect(LEASE_RULE_BASIS).toMatchObject({ status: "review_required" });
    expect(LEASE_TEMPLATE.rule).toMatchObject({ validation: "provisional" });
    const r = new LeaseRegistry().execute(await request(scope));
    expect(r).toMatchObject({ execution: "blocked", outcome: "inconclusive", result: null, findings: [] });
    expect(r.blockedControls).toContain("rule_not_applicable");
    expect(JSON.stringify(r.result)).not.toMatch(/"amount"/);
  });

  it("le scénario synthétique reste calculé et dit que la règle est à revoir ; le registre n'annonce pas la chaîne locale", async () => {
    const r = new LeaseRegistry().execute(await request({ ...scope, mode: "demo" })), result = r.result as LeaseResult;
    expect(r.execution).toBe("completed");
    expect(result.rule.basisStatus).toBe("review_required");
    expect(result.limitations.some(l => l.startsWith("Règle à revoir"))).toBe(true);
    const [leases] = CAPABILITY_FRAMEWORKS;
    expect(leases.modes.local_persistent).toMatchObject({ implemented: false, scope: expect.stringContaining("exécution réelle bloquée tant que la fiche de règle n'a pas reçu sa relecture personnelle nommée") });
  });
});
