// @vitest-environment jsdom
/**
 * Page « Tests complémentaires » rendue sur le vrai dossier de démonstration. Attendus posés à la main : 39 constats à
 * couvrir sur 43 (4 paramètres internes, dont 2 informatifs), 37 procédures proposées, 2 à définir (DEMO-ACHATS-1,
 * DEMO-RESFIN-1), 22 écarts de rapprochement regroupés dans l'index.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Newsreader: font, Geist: font, IBM_Plex_Mono: font };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/dashboard/tests",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { DEMO_DOSSIER_CONTEXT } from "@/lib/dossier/repositories";
import type { DossierSnapshot } from "@/lib/dossier/types";

const snapshot: DossierSnapshot = buildDemoDossierSnapshot();

vi.mock("@/lib/dossier/client", () => {
  const value = () => ({
    context: DEMO_DOSSIER_CONTEXT,
    snapshot,
    saveSnapshot: vi.fn(async () => undefined),
    updateSnapshot: vi.fn(),
    selectDossier: vi.fn(),
    listSnapshots: vi.fn(async () => []),
    resetToDemo: vi.fn(),
    appendReviewDecision: vi.fn(),
  });
  return { useActiveDossier: value, useActiveDossierSnapshot: () => snapshot, useOptionalActiveDossier: () => null };
});

import { TestsView } from "../TestsView";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(cleanup);

const articles = () => screen.queryAllByRole("article");
const plain = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

describe("Tests complémentaires", () => {
  it("titre serif dans l'ambiance instruments, laboratoire compact en tête", () => {
    render(<TestsView />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Tests complémentaires" });
    expect(h1.closest('[data-ambiance="instruments"]')).not.toBeNull();
    const lab = screen.getByRole("region", { name: /Laboratoire de scénarios/ });
    expect(lab.getAttribute("data-tour")).toBe("scenario-lab");
    expect(lab.textContent).toContain("Aucun scénario ouvert");
    expect(within(lab).getByRole("button", { name: "Nouveau scénario synthétique" })).toBeTruthy();
    expect(within(lab).getAllByRole("status").at(-1)!.textContent).toBe("Ouvrez un scénario synthétique dédié pour commencer.");
  });

  it("volet « Mode et sauvegarde » : focus à l'ouverture, Échap le referme et rend le focus", () => {
    render(<TestsView />);
    const toggle = screen.getByRole("button", { name: "Mode et sauvegarde" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    const panel = document.getElementById("cycle-demo-info")!;
    expect(panel.hidden).toBe(false);
    expect(document.activeElement).toBe(panel);
    expect(panel.textContent).toContain("sept jours");
    expect(within(panel).getByRole("button", { name: "Copier l’identifiant" })).toBeTruthy();
    expect(panel.querySelector("dd span")!.textContent).toBe(snapshot.dossier.societe.raisonSociale);
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it("file de travail : 39 sur 43, exclusions dites, 37 proposées et 2 à définir, par gravité", () => {
    render(<TestsView />);
    const text = plain(document.body.textContent);
    expect(text).toContain("Constats à couvrir39 sur 43");
    expect(text).toContain("4 exclus : 4 paramètres internes, dont 2 informatifs");
    expect(text).toContain("37 proposées");
    expect(text).toContain("2 à définir par le professionnel");
    expect(text).toContain("2 bloquants");
    expect(text).toContain("19 majeurs");
    expect(text).toContain("18 mineurs");
  });

  it("lecture par défaut : un constat à la fois, l'index ouvre le constat choisi et y porte le focus", () => {
    render(<TestsView />);
    expect(screen.getByRole("button", { name: "un constat à la fois" }).getAttribute("aria-pressed")).toBe("true");
    expect(articles()).toHaveLength(1);
    const nav = screen.getByRole("navigation", { name: "Constats à couvrir" });
    fireEvent.click(within(nav).getByRole("button", { name: /Créance litigieuse échue non dépréciée/ }));
    const article = articles()[0];
    expect(article.textContent).toContain("Revue de recouvrabilité documentée");
    expect(article.textContent).toContain("Évaluation et imputation");
    expect(document.activeElement).toBe(within(article).getByRole("heading", { level: 3 }));
    expect(within(nav).getByRole("button", { name: /Créance litigieuse/ }).getAttribute("aria-current")).toBe("true");
  });

  it("index : les 22 écarts de rapprochement se déplient ; les procédures à définir sont marquées", () => {
    render(<TestsView />);
    const nav = screen.getByRole("navigation", { name: "Constats à couvrir" });
    const group = within(nav).getByRole("button", { name: /22 écarts de rapprochement/ });
    expect(group.getAttribute("aria-expanded")).toBe("false");
    expect(group.textContent).toContain("11 majeurs · 11 mineurs");
    fireEvent.click(group);
    expect(group.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("tc-index-rapprochement")!.hidden).toBe(false);
    expect(within(nav).getAllByText("à définir")).toHaveLength(2);
  });

  it("filtre « à définir » : deux constats, procédure explicitement à définir", () => {
    render(<TestsView />);
    fireEvent.click(screen.getByRole("button", { name: "à définir 2" }));
    const nav = screen.getByRole("navigation", { name: "Constats à couvrir" });
    expect(within(nav).getAllByRole("button")).toHaveLength(2);
    expect(articles()[0].getAttribute("data-procedure-status")).toBe("to_define");
    expect(articles()[0].textContent).toContain("Procédure à définir");
  });

  it("tout dérouler : les 39 réponses dans le DOM, dont 2 à définir", () => {
    render(<TestsView />);
    fireEvent.click(screen.getByRole("button", { name: "tout dérouler" }));
    expect(articles()).toHaveLength(39);
    expect(document.querySelectorAll('[data-procedure-status="to_define"]')).toHaveLength(2);
    const dateFec = articles().find((a) => a.textContent?.includes("date hors format"))!;
    expect(dateFec.textContent).toContain("Localiser");
    expect(dateFec.textContent).toContain("aucune assertion sur les comptes");
    const titres = articles().find((a) => a.textContent?.includes("Titres de participation non dépréciés"))!;
    expect(titres.textContent).toContain("Dossier de valeur des titres de participation");
    expect(titres.textContent).toContain("Résolue par la règle du constat");
  });

  it("régime : change les références, jamais les constats", () => {
    render(<TestsView />);
    fireEvent.click(screen.getByRole("button", { name: "tout dérouler" }));
    const count = articles().length;
    const regime = screen.getByRole("region", { name: "Régime de la mission et période" });
    expect(within(regime).getByRole("link", { name: /NEP 330/ })).toBeTruthy();
    expect(regime.textContent).toContain("Exercice 2024");
    fireEvent.change(screen.getByRole("combobox", { name: "Régime de la mission" }), { target: { value: "examen_limite" } });
    expect(within(regime).getByRole("link", { name: /NEP 2410/ }).getAttribute("target")).toBe("_blank");
    expect(within(regime).queryByRole("link", { name: /NEP 330/ })).toBeNull();
    expect(regime.textContent).toContain("ne sont pas requis par la norme");
    expect(articles()).toHaveLength(count);
  });
});
