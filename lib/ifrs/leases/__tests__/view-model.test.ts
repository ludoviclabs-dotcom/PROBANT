import { describe, expect, it } from "vitest";
import { LEASE_TEMPLATE } from "@/lib/workpapers/lease-adapter";
import { LEASE_REQUIRED_TYPES } from "@/lib/workpapers/lease-sources";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { leaseWorkspaceView, type ViewModelInput } from "../view-model";

/** C02 — modèle de vue serveur : étapes et actions dérivées de l'état réel, avec leur motif ; jamais déduites d'un libellé. */
const period = { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-02-15", currency: "EUR" as const, validation: "provisional" as const };
const scope = { organizationId: "o", dossierId: "d", periodId: periodId(period), mode: "real" as const };
const run = (over: Partial<WorkpaperRun> = {}): WorkpaperRun => ({ id: "r", rootId: "r", revision: 1, version: 1, schemaVersion: "1.0.0", scope, period, template: LEASE_TEMPLATE, state: "draft", preparedBy: "me",
  importIds: [], evidence: [], findings: [], notes: [], events: [], ...over });
const input = (over: Partial<ViewModelInput> = {}): ViewModelInput => ({ mode: "real", run: run(), permissions: ["read", "prepare", "review"], actorId: "me", selfReviewAllowed: true,
  sourceTypes: [...LEASE_REQUIRED_TYPES], requiredTypes: LEASE_REQUIRED_TYPES, sourcesCurrent: true, ruleCurrent: true, ruleValidated: false, qualification: null, ...over });
const work = { schemaVersion: "ifrs16-leases-1", authorId: "me", authoredAt: "2027-02-01T00:00:00.000Z" } as WorkpaperRun["leaseWork"];

describe("C02 modèle de vue Locations", () => {
  it("sans feuille : créer est permis au préparateur, refusé au lecteur et dans le scénario ; aucune autre action", () => {
    const v = leaseWorkspaceView(input({ run: null }));
    expect(v.freshness).toBe("no_sheet");
    expect(v.actions.create).toEqual({ allowed: true, reason: null });
    expect(v.actions.freeze.allowed).toBe(false);
    expect(leaseWorkspaceView(input({ run: null, permissions: ["read"] })).actions.create).toEqual({ allowed: false, reason: "Droit de préparation requis" });
    expect(leaseWorkspaceView(input({ run: null, mode: "demo" })).actions.create.reason).toMatch(/lecture seule/);
  });
  it("brouillon : le gel attend le travail enregistré, puis les sources requises ; chaque refus dit pourquoi", () => {
    expect(leaseWorkspaceView(input()).actions.freeze).toEqual({ allowed: false, reason: "Enregistrer d'abord les politiques et confirmations" });
    expect(leaseWorkspaceView(input({ run: run({ leaseWork: work }), sourceTypes: ["lease_contracts"] })).actions.freeze.reason).toBe("Sources requises absentes : lease_assumptions, lease_schedule");
    const ready = leaseWorkspaceView(input({ run: run({ leaseWork: work }) }));
    expect(ready.actions.freeze.allowed).toBe(true);
    // Without a qualification read, the qualification step cannot claim to be done.
    expect(ready.steps.map(s => [s.id, s.state])).toEqual([["sources", "done"], ["qualification", "current"], ["freeze", "current"], ["calculation", "todo"], ["adjustment", "todo"], ["review", "todo"]]);
  });
  it("population figée, règle à revoir : le calcul est refusé avec le motif de la relecture nommée et l'étape est bloquée", () => {
    const v = leaseWorkspaceView(input({ run: run({ state: "ready", leaseWork: work, population: { id: "p" } as WorkpaperRun["population"] }) }));
    expect(v.actions.execute.allowed).toBe(false);
    expect(v.actions.execute.reason).toMatch(/relecture personnelle nommée/);
    expect(v.steps.find(s => s.id === "calculation")).toMatchObject({ state: "blocked", reason: expect.stringMatching(/Règle à revoir/) });
    expect(leaseWorkspaceView(input({ run: run({ state: "ready", leaseWork: work, population: { id: "p" } as WorkpaperRun["population"] }), ruleValidated: true })).actions.execute.allowed).toBe(true);
  });
  it("source ou règle remplacée : toute préparation est refusée, la révision reste permise", () => {
    const replaced = leaseWorkspaceView(input({ run: run({ leaseWork: work }), sourcesCurrent: false }));
    expect(replaced.freshness).toBe("source_replaced");
    expect(replaced.actions.configure.reason).toMatch(/Source remplacée/);
    expect(replaced.actions.revise.allowed).toBe(true);
    expect(leaseWorkspaceView(input({ ruleCurrent: false })).freshness).toBe("rule_replaced");
  });
  it("un autre préparateur ne modifie pas la feuille ; la relecture exige une version soumise", () => {
    const other = leaseWorkspaceView(input({ actorId: "someone-else" }));
    expect(other.actions.configure.reason).toBe("Seul le préparateur de la feuille la modifie");
    expect(other.actions.review.reason).toBe("Aucune version soumise");
    expect(leaseWorkspaceView(input({ run: run({ state: "awaiting_review" }), actorId: "reviewer", permissions: ["read", "review"] })).actions.review.allowed).toBe(true);
    expect(leaseWorkspaceView(input({ run: run({ state: "awaiting_review" }), selfReviewAllowed: false })).actions.review.reason).toMatch(/identité autorisée/);
  });
  it("scénario synthétique : rien n'est permis, chaque action le dit", () => {
    const v = leaseWorkspaceView(input({ mode: "demo", permissions: [] }));
    expect(Object.values(v.actions).every(a => !a.allowed && a.reason)).toBe(true);
  });
});
