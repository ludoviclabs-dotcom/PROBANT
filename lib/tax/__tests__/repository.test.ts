import { describe, expect, it } from "vitest";
import { InMemoryTaxRepository } from "@/lib/tax";
import { createTaxProfile } from "@/lib/tax/canonical";
import { fixtures, profileInput } from "./fixtures";

describe("tax repository isolation and immutability", () => {
  it("isolates every lookup by organization and dossier", async () => {
    const repository = new InMemoryTaxRepository();
    const profile = fixtures.profile();
    await repository.saveProfile({ organizationId: "org-a", dossierId: "dossier-1" }, profile);

    await expect(repository.getProfile({ organizationId: "org-b", dossierId: "dossier-1" }, profile.id)).resolves.toBeNull();
    await expect(repository.getProfile({ organizationId: "org-a", dossierId: "dossier-2" }, profile.id)).resolves.toBeNull();
    await expect(repository.getProfile({ organizationId: "org-a", dossierId: "dossier-1" }, profile.id)).resolves.toEqual(profile);
  });

  it("refuses an out-of-scope write and an overwrite", async () => {
    const repository = new InMemoryTaxRepository();
    const profile = fixtures.profile();
    await expect(repository.saveProfile({ organizationId: "org-b", dossierId: "dossier-1" }, profile)).rejects.toThrow(/scope/u);
    await repository.saveProfile({ organizationId: "org-a", dossierId: "dossier-1" }, profile);
    await expect(repository.saveProfile({ organizationId: "org-a", dossierId: "dossier-1" }, profile)).rejects.toThrow(/Immutable/u);
  });

  it("stores independent versions without mutating the former snapshot", async () => {
    const repository = new InMemoryTaxRepository();
    const first = fixtures.profile();
    const second = createTaxProfile(profileInput({ id: "profile-2", version: "2", turnoverAmountCents: 2_000_000_00 }));
    const scope = { organizationId: "org-a", dossierId: "dossier-1" };
    await repository.saveProfile(scope, first);
    await repository.saveProfile(scope, second);
    expect((await repository.getProfile(scope, first.id))?.turnoverAmountCents).toBe(1_000_000_00);
    expect((await repository.getProfile(scope, second.id))?.turnoverAmountCents).toBe(2_000_000_00);
  });

  it("persists the remaining canonical artifact families as immutable records", async () => {
    const repository = new InMemoryTaxRepository();
    const scope = { organizationId: "org-a", dossierId: "dossier-1" };
    await repository.savePeriod(scope, fixtures.period());
    await repository.saveDocument(scope, fixtures.document());
    await repository.saveExecution(scope, fixtures.execution());
    await repository.saveReconciliationLine(scope, fixtures.reconciliation());
    await repository.saveAdjustment(scope, fixtures.adjustment());
    await repository.saveComputation(scope, fixtures.computation());
    await repository.saveFiscalSynthesis(scope, fixtures.fiscalSynthesis());
    await expect(repository.getDocument(scope, "tax-document-1")).resolves.toMatchObject({ formVintage: 2026 });
    await expect(repository.getExecution(scope, "execution-1")).resolves.toMatchObject({ fiscalYear: 2026 });
    await expect(repository.getFiscalSynthesis(scope, "fiscal-synthesis-1")).resolves.toMatchObject({ snapshotVersion: "1" });
  });
});

