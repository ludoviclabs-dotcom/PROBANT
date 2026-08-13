
import { describe, expect, it } from "vitest";
import {
  ActiveDossierService,
  DemoDossierRepository,
  SessionDossierRepository,
  type SessionStoragePort,
} from "../repositories";
import { buildSnapshotFromFecDepot } from "../snapshot-builder";
import type { DossierContext, PostgresDossierRepository } from "../types";

class MemoryStorage implements SessionStoragePort {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

function fixture(dossierId: string, fingerprint: string) {
  return buildSnapshotFromFecDepot({
    dossierId,
    nomFichier: `${dossierId}.txt`,
    fingerprint,
    siren: dossierId === "dossier-a" ? "111111111" : "222222222",
    referentielVersion: "fec-2026.1",
    admissibilite: [],
    analyse: [],
    entries: [],
    entriesTruncated: false,
    totalEntryCount: 12,
    generatedAt: "2026-08-13T10:00:00.000Z",
  });
}

describe("contextual dossier repositories", () => {
  it("resolves the route context before the selected session context", async () => {
    const repository = new SessionDossierRepository(new MemoryStorage());
    const service = new ActiveDossierService(new DemoDossierRepository(), repository);
    const contextA: DossierContext = { organizationId: "org-1", dossierId: "dossier-a" };
    const contextB: DossierContext = { organizationId: "org-1", dossierId: "dossier-b" };
    await repository.save(contextA, fixture("dossier-a", "fingerprint-a"));
    await repository.save(contextB, fixture("dossier-b", "fingerprint-b"));
    await repository.select(contextB);

    expect((await service.resolve()).snapshot.dossier.id).toBe("dossier-b");
    expect((await service.resolve(contextA)).snapshot.dossier.id).toBe("dossier-a");
  });

  it("isolates equal dossier ids between organizations", async () => {
    const repository = new SessionDossierRepository(new MemoryStorage());
    const left = { organizationId: "org-left", dossierId: "shared-id" };
    const right = { organizationId: "org-right", dossierId: "shared-id" };
    await repository.save(left, fixture("shared-id", "left-fingerprint"));
    await repository.save(right, fixture("shared-id", "right-fingerprint"));

    expect((await repository.get(left))?.dossier.fecFingerprint).toBe("left-fingerprint");
    expect((await repository.get(right))?.dossier.fecFingerprint).toBe("right-fingerprint");
    expect(await repository.list("org-left")).toHaveLength(1);
    expect(await repository.list("org-right")).toHaveLength(1);
  });

  it("rejects a snapshot whose id differs from its explicit context", async () => {
    const repository = new SessionDossierRepository(new MemoryStorage());
    await expect(
      repository.save(
        { organizationId: "org-1", dossierId: "wrong-id" },
        fixture("dossier-a", "fingerprint-a"),
      ),
    ).rejects.toThrow(/meme dossier/u);
  });

  it("never lets a session snapshot shadow a persistent UUID context", async () => {
    const sessionRepository = new SessionDossierRepository(new MemoryStorage());
    const context: DossierContext = {
      organizationId: "00000000-0000-4000-8000-000000000001",
      dossierId: "00000000-0000-4000-8000-000000000002",
    };
    await sessionRepository.save(context, fixture(context.dossierId, "session-shadow"));
    const durableSnapshot = {
      ...fixture(context.dossierId, "durable-fingerprint"),
      sourceKind: "persistent" as const,
    };
    const persistentRepository: PostgresDossierRepository = {
      kind: "persistent",
      get: async () => durableSnapshot,
      save: async () => undefined,
    };
    const service = new ActiveDossierService(
      new DemoDossierRepository(),
      sessionRepository,
      persistentRepository,
    );

    expect((await service.resolve(context)).snapshot.dossier.fecFingerprint).toBe(
      "durable-fingerprint",
    );
  });
});

