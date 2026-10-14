// @vitest-environment jsdom
/**
 * Revue par cloison — sous la largeur d'ancrage, le panneau de revue s'ouvre en tiroir modal au
 * lieu d'écraser la liste des silos. jsdom n'implémente pas matchMedia : le composant reste en
 * mode tiroir, ce qui permet d'en vérifier le comportement clavier (la mise en page elle-même est
 * vérifiée aux largeurs réelles par e2e/cloisons-mise-en-page.spec.ts).
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";
import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { projectSnapshotExposure } from "@/lib/synthesis/exposure";
import { CloisonsWorkspace } from "../CloisonsWorkspace";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function renderDemo() {
  const snapshot = buildDemoDossierSnapshot();
  return render(
    <CloisonsWorkspace
      silos={snapshot.dossier.silos}
      meta={{ label: snapshot.dossier.societe.raisonSociale, exercice: snapshot.dossier.societe.exercice }}
      exposure={projectSnapshotExposure(snapshot).exposure}
    />,
  );
}

it("« Analyser » ouvre le panneau de revue en tiroir modal ; Échap le referme et rend le focus", () => {
  renderDemo();
  expect(screen.queryByRole("dialog")).toBeNull();
  const analyser = screen.getAllByRole("button", { name: "Analyser" })[0];
  analyser.focus();
  fireEvent.click(analyser);

  const dialog = screen.getByRole("dialog");
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  const close = within(dialog).getByRole("button", { name: "Fermer le panneau de revue" });
  expect(document.activeElement).toBe(close);
  // Un seul panneau de revue : le rail ancré (masqué à cette largeur) garde son invite.
  expect(within(dialog).getByRole("heading", { level: 3 })).toBeTruthy();
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);

  // Tab depuis le dernier élément revient au premier : le focus reste dans le tiroir.
  const focusables = within(dialog).getAllByRole("button");
  focusables[focusables.length - 1].focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(focusables[focusables.length - 1]);

  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(analyser);
  expect(analyser.textContent).toBe("Analyser");
});

it("le voile et « Fermer » referment le tiroir et désélectionnent le constat", () => {
  renderDemo();
  fireEvent.click(screen.getAllByRole("button", { name: "Analyser" })[0]);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fermer le panneau de revue" }));
  expect(screen.queryByRole("dialog")).toBeNull();

  fireEvent.click(screen.getAllByRole("button", { name: "Analyser" })[0]);
  fireEvent.click(document.querySelector("[data-review-backdrop]")!);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryAllByRole("button", { name: "Fermer" })).toHaveLength(0);
});

it("chaque ligne de silo annonce son état replié ou déplié", () => {
  const { container } = renderDemo();
  const rows = [...container.querySelectorAll<HTMLButtonElement>("button[data-silo-row]")];
  expect(rows.length).toBeGreaterThan(10);
  const closed = rows.find((r) => r.getAttribute("aria-expanded") === "false")!;
  fireEvent.click(closed);
  expect(closed.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(closed);
  expect(closed.getAttribute("aria-expanded")).toBe("false");
});
