// @vitest-environment jsdom
/**
 * Le détail d'une édition (identifiant complet, empreinte, absence de relecture)
 * s'atteint au clavier et au toucher, pas seulement par un `title`.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { REFERENTIEL_EDITIONS, REFERENTIEL_VERSION } from "@/lib/referentiel/edition";
import { ReferentielEdition } from "../ReferentielEdition";

afterEach(cleanup);

// Libellé de l'édition chargée, dérivé du journal (la dernière édition déclarée).
const libelleCourant = `éd. ${REFERENTIEL_EDITIONS[REFERENTIEL_EDITIONS.length - 1].numero}`;

it("divulgation focalisable : ouverte au clic, fermée par Échap avec retour du focus", () => {
  const { container } = render(<ReferentielEdition identifiant={REFERENTIEL_VERSION} />);
  const details = container.querySelector("details")!;
  const summary = screen.getByText(libelleCourant);

  expect(summary.tagName).toBe("SUMMARY");
  expect(summary.getAttribute("aria-label")).toBe(`Référentiel ${libelleCourant} : détail de l'édition`);
  expect(container.querySelector("[title]")).toBeNull();
  expect(details.open).toBe(false);

  fireEvent.click(summary);
  expect(details.open).toBe(true);
  expect(details.textContent).toContain(REFERENTIEL_VERSION);
  expect(details.textContent).toContain("n'atteste pas la relecture");

  summary.focus();
  fireEvent.keyDown(summary, { key: "Escape" });
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(summary);
});

it("un clic hors du panneau le referme ; un identifiant antérieur reste lisible", () => {
  const { container } = render(
    <div>
      <ReferentielEdition identifiant="2024-01-01" />
      <button type="button">ailleurs</button>
    </div>,
  );
  const details = container.querySelector("details")!;
  fireEvent.click(screen.getByText("2024-01-01 (antérieur)"));
  expect(details.open).toBe(true);
  expect(details.textContent).toContain("pas déterminable");

  fireEvent.pointerDown(screen.getByText("ailleurs"));
  expect(details.open).toBe(false);
});
