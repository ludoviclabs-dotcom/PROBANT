// @vitest-environment jsdom
/**
 * C05 — la revue par cloison lit la projection des effets partagée avec la Synthèse : plus aucun
 * montant |constaté − seuil|, exposition initiale par poste et sens, signal EUR sans effet nommé
 * comme tel. Attendus posés depuis le dossier démo : trois effets explicites indépendants sur le
 * résultat, tous en attente — 145 000 € et 312 000 € en diminution, 18 000 € en augmentation.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { projectSnapshotExposure } from "@/lib/synthesis/exposure";
import { CloisonsWorkspace } from "../CloisonsWorkspace";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom ne fournit pas ResizeObserver (utilisé par la mise en page des documents).
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

it("en-tête et lignes de silo : exposition initiale par poste et sens, jamais un cumul d'écarts au seuil", () => {
  const snapshot = buildDemoDossierSnapshot();
  const { container } = render(
    <CloisonsWorkspace
      silos={snapshot.dossier.silos}
      meta={{ label: snapshot.dossier.societe.raisonSociale, exercice: snapshot.dossier.societe.exercice, referentiel: snapshot.dossier.referentielVersion }}
      exposure={projectSnapshotExposure(snapshot).exposure}
    />,
  );
  const text = container.textContent ?? "";
  expect(text).not.toContain("Exposition cumulée");
  const summary = container.querySelector("[data-effects-summary]")!.textContent ?? "";
  expect(summary).toMatch(/Exposition initiale par poste et sens/);
  expect(summary).toMatch(/Résultat − 457\s000 €/);
  expect(summary).toMatch(/Résultat \+ 18\s000 €/);
  expect(summary).toMatch(/signaux EUR sans effet chiffré/);
  // Ligne du silo Provisions : l'effet porte sur le résultat, même si la cloison du constat est le passif.
  const provisions = [...container.querySelectorAll("button")].find((b) => /Provisions/.test(b.textContent ?? ""))!;
  expect(provisions.textContent).toMatch(/Résultat − 145\s000 €/);
  // Un silo dont les constats ne sont que des signaux EUR ne montre aucun montant.
  expect(text).toMatch(/effet non chiffré/);
});
