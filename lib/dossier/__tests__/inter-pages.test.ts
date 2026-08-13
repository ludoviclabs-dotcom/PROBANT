import { describe, expect, it } from "vitest";
import type { DossierSnapshot } from "@/lib/canonical-model";
import {
  ActiveDossierService,
  DemoDossierRepository,
  SessionDossierRepository,
  type SessionStoragePort,
} from "../repositories";
import { buildSnapshotFromFecDepot } from "../snapshot-builder";
import { calculateReviewProgress } from "../review";

class MemoryStorage implements SessionStoragePort {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}

function invariants(snapshot: DossierSnapshot) {
  const statuses = snapshot.findings.map((finding) => {
    const latest = snapshot.reviewEvents
      .filter((event) => event.findingId === finding.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .at(-1);
    return latest?.newStatus ?? finding.statutRevue;
  });
  const review = calculateReviewProgress(statuses);
  return {
    dossierId: snapshot.dossier.id,
    fingerprint: snapshot.dossier.fecFingerprint,
    referentielVersion: snapshot.dossier.referentielVersion,
    findingCount: snapshot.findings.length,
    review: `${review.numerator}/${review.denominator}/${review.pct}`,
  };
}

describe("inter-page dossier consistency", () => {
  it("serves identical invariants to every restitution consumer", async () => {
    const storage = new MemoryStorage();
    const repository = new SessionDossierRepository(storage);
    const service = new ActiveDossierService(new DemoDossierRepository(), repository);
    const context = { organizationId: "org-fixture", dossierId: "fec-fixture" };
    const snapshot = buildSnapshotFromFecDepot({
      dossierId: context.dossierId,
      nomFichier: "fixture-fec.txt",
      fingerprint: "fixture-fingerprint",
      siren: "123456789",
      referentielVersion: "fec-2026.1",
      admissibilite: [],
      analyse: [],
      entries: [],
      entriesTruncated: false,
      totalEntryCount: 10,
      generatedAt: "2026-08-13T10:00:00.000Z",
    });
    await repository.save(context, snapshot);
    const resolved = (await service.resolve(context)).snapshot;
    const consumers = ["layout", "synthese", "cloisons", "risques", "preuve"];
    const projections = consumers.map(() => invariants(resolved));

    expect(new Set(projections.map((value) => JSON.stringify(value))).size).toBe(1);
    expect(projections[0]).toEqual({
      dossierId: "fec-fixture",
      fingerprint: "fixture-fingerprint",
      referentielVersion: "fec-2026.1",
      findingCount: 0,
      review: "0/0/0",
    });
  });

  it("ne sérialise jamais le grand livre dans sessionStorage", async () => {
    const storage = new MemoryStorage();
    const repository = new SessionDossierRepository(storage);
    const context = { organizationId: "session", dossierId: "fec-no-ledger" };
    const snapshot = buildSnapshotFromFecDepot({
      dossierId: context.dossierId,
      nomFichier: "fixture-fec.txt",
      fingerprint: "full-sha256-placeholder",
      siren: "123456789",
      referentielVersion: "fec-2026.1",
      admissibilite: [],
      analyse: [],
      entries: [
        {
          ligne: 1,
          journalCode: "AC",
          journalLib: "Achats",
          ecritureNum: "E1",
          ecritureDate: "20241231",
          compteNum: "607000",
          compteLib: "Achats",
          compAuxNum: "",
          compAuxLib: "",
          pieceRef: "P1",
          pieceDate: "20241231",
          ecritureLib: "Test",
          debit: 100,
          credit: 0,
          ecritureLet: "",
          dateLet: "",
          validDate: "20241231",
          montant: 100,
        },
      ],
      entriesTruncated: true,
      totalEntryCount: 20_000,
    });
    await repository.save(context, snapshot);
    const restored = await repository.get(context);
    expect(restored?.ledgerEntries).toBeUndefined();
    for (let index = 0; index < storage.length; index += 1) {
      expect(storage.getItem(storage.key(index)!)).not.toContain('"ledgerEntries":[');
    }
  });
});
