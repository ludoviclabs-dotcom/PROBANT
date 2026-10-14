import { beforeEach, describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal } from "@/lib/auth/principal";
import { approvalLabel, canReviewRun, reviewAuthor } from "@/lib/auth/review-kind";
import { contentHash, validateRun } from "../model";
import { assertTransition } from "../policy";
import { cashScope } from "./cash-reconciliation-fixtures";
import { createCashHarness, type CashHarness } from "./cash-harness";
import { fixtureRun, reviewer } from "./fixtures";

/**
 * C07 — relecture personnelle nommée (profil local solo) et simulation de seconde identité.
 * Attendus fixés avant l'implémentation : la même personne peut relire son travail
 * seulement si le serveur lui reconnaît la relecture personnelle ; l'approbation
 * le dit et porte son nom ; une seconde identité synthétique reste une simulation ;
 * le parcours OIDC garde la forme historique (aucun type enregistré).
 */
const submitted = () => { const r = fixtureRun({ state: "awaiting_review", conclusion: "Documenté" }); r.submittedHash = contentHash(r); return r; };

describe("C07 — politique : relecture de son propre travail", () => {
  it("seule la relecture personnelle décidée par le serveur lève l'interdiction", () => {
    const r = submitted(), self = { ...reviewer, id: r.preparedBy };
    expect(() => assertTransition(r, "approved", self, r.submittedHash)).toThrow("SELF_APPROVAL_FORBIDDEN");
    expect(() => assertTransition(r, "approved", { ...self, review: "simulated_second_identity" }, r.submittedHash)).toThrow("SELF_APPROVAL_FORBIDDEN");
    expect(() => assertTransition(r, "approved", { ...self, review: "distinct_identity" }, r.submittedHash)).toThrow("SELF_APPROVAL_FORBIDDEN");
    expect(() => assertTransition(r, "approved", { ...self, review: "personal" }, r.submittedHash)).not.toThrow();
    // La relecture personnelle n'efface aucun autre contrôle.
    expect(() => assertTransition(r, "approved", { ...self, review: "personal" }, "stale")).toThrow("STALE_REVIEW");
  });

  it("une approbation enregistrée dit qui a relu et comment", () => {
    const base = { ...submitted(), state: "approved" as const };
    const approval = (extra: object) => ({ ...base, approval: { actorId: base.preparedBy, snapshotHash: contentHash(base), note: "Relu", at: "2026-10-14T10:00:00.000Z", version: 2, ...extra } });
    expect(() => validateRun(approval({}))).toThrow("APPROVAL_INVALID");
    expect(() => validateRun(approval({ kind: "personal" }))).toThrow("APPROVAL_INVALID");
    expect(() => validateRun(approval({ kind: "personal", reviewerName: "Camille Martin" }))).not.toThrow();
    expect(() => validateRun(approval({ kind: "simulated_second_identity" }))).toThrow("APPROVAL_INVALID");
    expect(() => validateRun(approval({ actorId: "autre", kind: "personal", reviewerName: "Camille Martin" }))).toThrow("APPROVAL_INVALID");
    expect(() => validateRun(approval({ actorId: "autre", kind: "invented" }))).toThrow("APPROVAL_INVALID");
    expect(() => validateRun(approval({ actorId: "autre" }))).not.toThrow();
    expect(() => validateRun(approval({ actorId: "autre", kind: "simulated_second_identity" }))).not.toThrow();
  });

  it("libellés : aucune relecture personnelle n'est présentée comme une revue par une autre personne", () => {
    expect(approvalLabel({ actorId: "proprietaire-local", at: "2026-10-14T10:00:00.000Z", kind: "personal", reviewerName: "Camille Martin" })).toMatch(/^Relecture personnelle nommée · Camille Martin \(proprietaire-local\) · /);
    expect(approvalLabel({ actorId: "simulation-seconde-identite", at: "2026-10-14T10:00:00.000Z", kind: "simulated_second_identity" })).toMatch(/^Simulation de seconde identité · simulation-seconde-identite/);
    expect(reviewAuthor({ actorId: "reviewer-x" })).toBe("reviewer-x");
    expect(canReviewRun({ actorId: "a", permissions: ["review"], reviewKind: "personal" }, "a")).toBe(true);
    expect(canReviewRun({ actorId: "a", permissions: ["review"] }, "a")).toBe(false);
    expect(canReviewRun({ actorId: "a", permissions: ["prepare"], reviewKind: "personal" }, "a")).toBe(false);
  });
});

describe("C07 — chaîne Trésorerie en profil solo : préparer, relire soi-même, verrouiller, exporter", () => {
  let h: CashHarness;
  const local = (subject: string, roles: AuthenticatedPrincipal["roles"], reviewKind: AuthenticatedPrincipal["reviewKind"], displayName?: string): AuthenticatedPrincipal =>
    ({ subject, organizationId: cashScope.organizationId, roles, dossierIds: null, authenticationMethod: "local-session", amr: ["probant-local-code"], acr: null, mfaSatisfied: false, expiresAtEpochSeconds: 2_000_000_000, reviewKind, ...(displayName ? { displayName } : {}) });
  beforeEach(() => {
    h = createCashHarness();
    // Le propriétaire local prépare sous le même sujet que le préparateur des fixtures.
    h.auth.identities.solo = local("preparer-cash", ["preparer", "reviewer", "signer"], "personal", "Camille Martin");
    h.auth.identities.simulation = local("simulation-seconde-identite", ["reviewer"], "simulated_second_identity");
  });

  it("relecture personnelle nommée : enregistrée comme telle, exportée comme telle", async () => {
    const { run: executed } = await h.executed();
    let run = await h.ok({ command: "conclude", id: executed.id, expectedVersion: executed.version, text: "Pont concordant ; suspens documenté." }, "solo");
    run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: run.notes[0].id, text: "Chèque remis, débit attendu en mars." }, "solo");
    run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version }, "solo");
    const view = (await h.read("solo")).body;
    expect(view).toMatchObject({ actorId: "preparer-cash", reviewKind: "personal" });
    // Le même sujet sans relecture personnelle reste refusé (session OIDC des fixtures).
    expect((await h.command({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Auto" }, "preparer")).status).toBe(403);
    run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Relecture personnelle du pont et des suspens." }, "solo");
    expect(run.approval).toMatchObject({ actorId: "preparer-cash", kind: "personal", reviewerName: "Camille Martin" });
    run = await h.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "solo");
    expect(run.state).toBe("locked");
    const mission = await h.mission("solo");
    expect(mission.procedure.review).toMatchObject({ actorId: "preparer-cash", kind: "personal", reviewerName: "Camille Martin" });
    const exported = await h.handlers.exportPOST(new Request("https://probant.test/api/workpapers/cash/export", { method: "POST", headers: { "x-test-session": "solo", "Content-Type": "application/json" },
      body: JSON.stringify({ dossierId: cashScope.dossierId, periodId: cashScope.periodId, id: run.id, version: run.version, kind: "approved", format: "html", expectedSnapshotHash: mission.hash }) }));
    expect(exported.status).toBe(200);
    expect(await exported.text()).toContain("Relecture personnelle nommée — Camille Martin (preparer-cash)");
  });

  it("seconde identité synthétique : sa décision est enregistrée comme simulation, jamais comme relecture", async () => {
    const { run: executed } = await h.executed();
    let run = await h.ok({ command: "conclude", id: executed.id, expectedVersion: executed.version, text: "Pont concordant." });
    run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: run.notes[0].id, text: "Documenté." });
    run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
    run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Décision simulée." }, "simulation");
    expect(run.approval).toMatchObject({ actorId: "simulation-seconde-identite", kind: "simulated_second_identity" });
    expect(run.approval?.reviewerName).toBeUndefined();
  });

  it("relecture par une autre identité OIDC : forme historique, sans type enregistré", async () => {
    const { run: executed } = await h.executed();
    let run = await h.ok({ command: "conclude", id: executed.id, expectedVersion: executed.version, text: "Pont concordant." });
    run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: run.notes[0].id, text: "Documenté." });
    run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
    run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue distincte." }, "reviewer");
    expect(Object.keys(run.approval!).sort()).toEqual(["actorId", "at", "note", "snapshotHash", "version"]);
  });
});
