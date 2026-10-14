// @vitest-environment jsdom
/**
 * En-tête de la revue par cloison : SIREN et origine lus dans le snapshot du dossier actif par
 * ActiveCloisons. Constaté le 14/10/2026 : « SIREN 000 000 000 » et « Démo » restaient affichés
 * pour un dossier de session. Attendus posés depuis les données : le dossier démo porte le SIREN
 * fictif 000000000 ; un FEC déposé sans SIREN dans son nom n'en a pas, il reste « non renseigné ».
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { DossierSnapshot } from "@/lib/dossier/types";
import { buildDemoDossierSnapshot, buildSnapshotFromFecDepot } from "@/lib/dossier/snapshot-builder";
import { ActiveCloisons } from "../ActiveCloisons";

const active = vi.hoisted(() => ({ snapshot: null as unknown as DossierSnapshot }));
vi.mock("@/lib/dossier/client", () => ({ useActiveDossierSnapshot: () => active.snapshot }));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function sessionSnapshot(siren: string | null): DossierSnapshot {
  return buildSnapshotFromFecDepot({
    dossierId: "legacy-2024",
    nomFichier: "grand-livre-2024.txt",
    fingerprint: "fixture-fingerprint",
    siren,
    referentielVersion: "fec-2026.1",
    admissibilite: [],
    analyse: [],
    entries: [],
    entriesTruncated: false,
    totalEntryCount: 0,
    generatedAt: "2026-10-14T10:00:00.000Z",
  });
}

function renderHeader(snapshot: DossierSnapshot) {
  active.snapshot = snapshot;
  const { container } = render(<ActiveCloisons />);
  const badge = container.querySelector("[data-dossier-source]");
  return { text: container.textContent ?? "", badge: badge?.textContent ?? null };
}

it.each([
  ["dossier démo", () => buildDemoDossierSnapshot(), "Démo", "SIREN 000 000 000 · Exercice 2024"],
  ["dossier de session avec SIREN", () => sessionSnapshot("552100554"), "Session", "SIREN 552 100 554 · "],
  ["dossier persistant", () => ({ ...sessionSnapshot("552100554"), sourceKind: "persistent" as const }), "Persistant", "SIREN 552 100 554 · "],
])("%s : badge et SIREN réels du dossier actif", (_cas, snapshot, badge, siren) => {
  const header = renderHeader(snapshot());
  expect(header.badge).toBe(badge);
  expect(header.text).toContain(siren);
});

it("dossier de session sans SIREN : « SIREN non renseigné », jamais des zéros ni le badge Démo", () => {
  const header = renderHeader(sessionSnapshot(null));
  expect(header.badge).toBe("Session");
  expect(header.text).toContain("SIREN non renseigné · ");
  expect(header.text).not.toMatch(/0{3}\s?0{3}\s?0{3}/);
  expect(header.text).not.toContain("non-detecte");
});

it("scénario de démonstration : badge Simulation, secteur et forme à la place du SIREN", () => {
  const header = renderHeader(buildDemoDossierSnapshot("startup-tech"));
  expect(header.badge).toBe("Simulation");
  expect(header.text).toContain("SaaS / Logiciel B2B · SAS · Exercice 2024");
});
