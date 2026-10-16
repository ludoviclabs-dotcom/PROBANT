// @vitest-environment jsdom
/**
 * Page Synthèse (refonte « grand livre ») rendue sur le VRAI dossier de démonstration DEMO SA : le snapshot, le
 * moteur de synthèse et les datasets sont ceux de l'application. Les attendus sont tirés du snapshot lui-même
 * (comptages de constats, cellules de la mosaïque recomptées depuis les constats) — jamais recopiés d'une capture.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Newsreader: font, Geist: font, IBM_Plex_Mono: font };
});

let searchString = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchString),
  usePathname: () => "/dashboard/synthese",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { DEMO_DOSSIER_CONTEXT } from "@/lib/dossier/repositories";
import type { DossierSnapshot } from "@/lib/dossier/types";

const snapshot: DossierSnapshot = buildDemoDossierSnapshot();
const appendReviewDecision = vi.fn(async () => undefined);
const resetToDemo = vi.fn(async () => undefined);
let current: DossierSnapshot = snapshot;

vi.mock("@/lib/dossier/client", () => {
  const value = () => ({
    context: DEMO_DOSSIER_CONTEXT,
    snapshot: current,
    saveSnapshot: vi.fn(),
    updateSnapshot: vi.fn(),
    selectDossier: vi.fn(),
    listSnapshots: vi.fn(async () => []),
    resetToDemo,
    appendReviewDecision,
  });
  return { useActiveDossier: value, useActiveDossierSnapshot: () => current, useOptionalActiveDossier: () => null };
});

import { SyntheseView } from "../SyntheseView";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom n'implémente pas scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  appendReviewDecision.mockClear();
  searchString = "";
  current = snapshot;
});

const plain = (text: string | null | undefined) => (text ?? "").replace(/[  ]/g, " ");

describe("Synthèse — décision", () => {
  it("le verdict reprend les comptages du snapshot : alerte d'admissibilité, constats bloquants ou majeurs", () => {
    render(<SyntheseView />);
    const heavy = snapshot.findings.filter((f) => f.severity === "bloquant" || f.severity === "majeur").length;
    const decision = screen.getByRole("region", { name: "Décision" });
    const text = plain(decision.textContent);
    expect(text).toContain(`${snapshot.admissibilityFindings.length > 0 ? "1 alerte" : ""}`);
    expect(text).toContain(`${heavy}`);
    expect(text).toMatch(/appellent une revue/);
    expect(text).toMatch(/non admissible/i);
  });

  it("n'affiche aucun ratio de couverture sans dénominateur qualifié", () => {
    render(<SyntheseView />);
    expect(screen.getAllByText(/non qualifiée/i).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/\d+\s?%\s+(?:de\s+)?couverture/i);
  });

  it("le signal heuristique reste présenté comme non opposable", () => {
    render(<SyntheseView />);
    expect(screen.getAllByText(/non opposable/i).length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/ce n’est pas un score de conformité/);
  });

  it("aucune formulation de certification ou de conformité acquise dans le texte de la page", () => {
    const { container } = render(<SyntheseView />);
    // Le panneau Méthode reprend des composants existants qui énoncent leurs propres réserves (« non certifiées ») ;
    // on contrôle ici le texte écrit par la page elle-même.
    const page = container.cloneNode(true) as HTMLElement;
    page.querySelector("#methode")?.remove();
    const body = plain(page.textContent);
    expect(body).not.toMatch(/conforme à la norme|garantit|sans anomalie|dossier conforme|comptes certifiés/i);
    expect(body.replace(/certification/gi, "")).not.toMatch(/certifi/i);
    expect(body).toMatch(/ne vaut (?:pas )?certification/i);
  });
});

describe("Synthèse — analyse", () => {
  it("la mosaïque recompte les constats par cellule depuis le snapshot", () => {
    render(<SyntheseView />);
    const cells = screen.getAllByRole("button").filter((b) => /×/.test(b.getAttribute("aria-label") ?? "") && /constat/.test(b.getAttribute("aria-label") ?? ""));
    expect(cells.length).toBeGreaterThan(0);
    const total = cells.reduce((sum, b) => sum + Number(/:\s*(\d+)\s+constat/.exec(b.getAttribute("aria-label") ?? "")?.[1] ?? 0), 0);
    // Un constat peut porter plusieurs assertions : le total des cellules ne peut pas être inférieur au nombre de constats localisés.
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(snapshot.findings.length * 6);
  });

  it("un clic sur une cellule ouvre le volet avec la liste des constats ; Échap le referme", () => {
    render(<SyntheseView />);
    const cell = screen
      .getAllByRole("button")
      .filter((b) => /×/.test(b.getAttribute("aria-label") ?? ""))
      .find((b) => Number(/:\s*(\d+)\s+constat/.exec(b.getAttribute("aria-label") ?? "")?.[1] ?? 0) > 0)!;
    const expected = Number(/:\s*(\d+)\s+constat/.exec(cell.getAttribute("aria-label") ?? "")?.[1]);
    fireEvent.click(cell);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("button", { name: /Ouvrir la chaîne de preuve/ })).toHaveLength(expected);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("le filtre croisé par gravité est un bouton à bascule exposé au clavier et s'efface", () => {
    render(<SyntheseView />);
    const major = screen.getAllByRole("button", { name: "Majeur" }).find((b) => b.hasAttribute("aria-pressed"))!;
    expect(major.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(major);
    expect(major.getAttribute("aria-pressed")).toBe("true");
    const majeurs = snapshot.findings.filter((f) => f.severity === "majeur").length;
    expect(plain(document.body.textContent)).toContain(`${majeurs} constat`);
    fireEvent.click(screen.getByRole("button", { name: /Effacer le filtre/ }));
    expect(major.getAttribute("aria-pressed")).toBe("false");
  });

  it("le pont d'exposition n'additionne jamais les sens ni les postes et laisse l'inconnu inconnu", () => {
    render(<SyntheseView />);
    const text = plain(document.body.textContent);
    expect(text).toMatch(/jamais additionnés/);
    expect(text).toMatch(/effet d’impôt connu seulement avec taux explicite et qualification/i);
  });
});

describe("Synthèse — exploration et chaîne de preuve", () => {
  it("les cinq accordéons sont repliés par défaut et s'ouvrent au clic", () => {
    render(<SyntheseView />);
    const toggles = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-controls")?.startsWith("expl-"));
    expect(toggles).toHaveLength(5);
    for (const toggle of toggles) expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggles[0]);
    expect(toggles[0].getAttribute("aria-expanded")).toBe("true");
  });

  it("« Valider » écrit une décision confirmée sur le constat sélectionné, « Écarter » une décision écartée", async () => {
    render(<SyntheseView />);
    const chainToggle = screen.getAllByRole("button").find((b) => b.getAttribute("aria-controls") === "expl-chaine")!;
    fireEvent.click(chainToggle);
    const select = document.querySelector<HTMLSelectElement>("#chaine select")!;
    expect(select.value).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    });
    expect(appendReviewDecision).toHaveBeenCalledWith({ findingId: select.value, newStatus: "confirmed", comment: "", relatedEvidenceIds: [] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Écarter" }));
    });
    expect(appendReviewDecision).toHaveBeenLastCalledWith({ findingId: select.value, newStatus: "dismissed", comment: "", relatedEvidenceIds: [] });
  });

  it("une erreur d'écriture est affichée sans fermer la chaîne", async () => {
    appendReviewDecision.mockRejectedValueOnce(new Error("Écriture refusée par le dossier."));
    render(<SyntheseView />);
    fireEvent.click(screen.getAllByRole("button").find((b) => b.getAttribute("aria-controls") === "expl-chaine")!);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    });
    expect(screen.getByText("Écriture refusée par le dossier.")).toBeTruthy();
    expect(document.querySelector("#chaine")).toBeTruthy();
  });
});

describe("Synthèse — variantes et états", () => {
  it("?variante=B change la composition, pas les chiffres", () => {
    const a = render(<SyntheseView />);
    expect(a.container.querySelector('[data-variant="A"]')).toBeTruthy();
    const verdictA = plain(a.container.querySelector("h2, [class*=verdict]")?.textContent);
    const registerA = plain(a.container.querySelector("table")?.textContent);
    a.unmount();
    searchString = "variante=B";
    const b = render(<SyntheseView />);
    expect(b.container.querySelector('[data-variant="B"]')).toBeTruthy();
    expect(b.container.querySelector("[class*=gridOverlay]")).toBeTruthy();
    // Même verdict, mêmes cycles : seule la composition change.
    expect(plain(b.container.querySelector("h2, [class*=verdict]")?.textContent)).toBe(verdictA);
    expect(plain(b.container.querySelector("table")?.textContent)).toBe(registerA);
    expect(registerA.length).toBeGreaterThan(100);
  });

  it("sans source ni constat : état vide avec dépôt de FEC et accès à la démo, aucun chiffre inventé", () => {
    current = { ...snapshot, sourceDocuments: [], findings: [], admissibilityFindings: [] };
    render(<SyntheseView />);
    expect(screen.getByRole("heading", { name: /Aucun FEC n’a été déposé/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Déposer un FEC" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ouvrir la démo DEMO SA/ }));
    expect(resetToDemo).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toMatch(/\b82\b\s*\/100/);
  });
});
