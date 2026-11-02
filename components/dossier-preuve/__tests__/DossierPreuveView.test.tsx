// @vitest-environment jsdom
/**
 * Page « Dossier & preuve » rendue sur le vrai dossier de démonstration DEMO SA. Les attendus sont posés à la main
 * d'après le snapshot (43 constats sourcés, 2 bloquants, un seul sans résultat : DEMO-ADM-1), jamais recopiés du code.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Newsreader: font, Geist: font, IBM_Plex_Mono: font };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/dashboard/dossier",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { DEMO_DOSSIER_CONTEXT } from "@/lib/dossier/repositories";
import type { DossierSnapshot } from "@/lib/dossier/types";

const snapshot: DossierSnapshot = buildDemoDossierSnapshot();

vi.mock("@/lib/dossier/client", () => ({
  useActiveDossier: () => ({ context: DEMO_DOSSIER_CONTEXT, snapshot }),
  useActiveDossierSnapshot: () => snapshot,
  useOptionalActiveDossier: () => null,
}));

import { DossierPreuveView } from "../DossierPreuveView";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const articles = () => screen.queryAllByRole("article");

describe("Dossier & preuve", () => {
  it("titre serif dans l'ambiance instruments ; bandeau de traçabilité ancré pour la visite", () => {
    const { container } = render(<DossierPreuveView />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Dossier & preuve" });
    expect(h1.closest('[data-ambiance="instruments"]')).not.toBeNull();
    const panel = container.querySelector('[data-tour="dossier-panel"]')!;
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain(snapshot.dossier.id);
    expect(panel.textContent).toContain(snapshot.dossier.fecFingerprint.slice(0, 12));
    expect(panel.querySelector("details summary")).not.toBeNull();
  });

  it("plus de pastille « ✓ Sourcé » ni « Obligatoire » : statut de chaîne calculé, familles de la charte", () => {
    render(<DossierPreuveView />);
    expect(document.body.textContent).not.toContain("✓ Sourcé");
    expect(document.body.textContent).not.toContain("Obligatoire");
    expect(document.body.textContent).toContain("Droit dur");
    const adm = articles().find((a) => a.textContent?.includes("DEMO-ADM-1"))!;
    expect(adm.textContent).toContain("chaîne 2/5 · décision en attente");
    expect(adm.textContent).toContain("absentes : transformation, résultat");
    const chain = within(adm).getByRole("list", { name: "Chaîne de preuve" });
    expect(within(chain).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "ÉchantillonL517: \"31/12/2024\", L904: \"15/06/2024\"",
      "RègleLPF A.47 A-1 — dates AAAAMMJJ",
      "Résultatabsent",
      "Décisionen attente",
    ]);
  });

  it("matrice : dessin décoratif doublé d'une table accessible", () => {
    render(<DossierPreuveView />);
    expect(screen.getByRole("heading", { level: 2, name: "Complétude des 43 chaînes" })).toBeTruthy();
    const region = screen.getByRole("region", { name: /Matrice de complétude/ });
    const table = within(region).getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows[0]).toBe("Source43/43présente pour tous les constats");
    expect(rows[1]?.startsWith("Transformation31/43")).toBe(true);
    expect(rows[3]).toBe("Résultat42/43absente pour DEMO-ADM-1");
    expect(rows[4]).toBe("Décision0/43 · tous en attenteabsente pour tous les constats");
    expect(rows[5]?.startsWith("Lignes FEC citées13/43")).toBe(true);
    expect(region.querySelector('[aria-hidden="true"]')!.querySelectorAll("i")).toHaveLength(43 * 6);
    expect(document.body.textContent).toContain("Une étape absente n’est pas une erreur en soi");
  });

  it("dix constats d'abord, puis « Afficher les 33 autres constats »", () => {
    render(<DossierPreuveView />);
    expect(articles()).toHaveLength(10);
    expect(articles()[0].textContent).toContain("DEMO-ADM-1");
    fireEvent.click(screen.getByRole("button", { name: "Afficher les 33 autres constats" }));
    expect(articles()).toHaveLength(43);
  });

  it("filtres : chaîne sans résultat, gravité, recherche, réinitialisation", () => {
    render(<DossierPreuveView />);
    fireEvent.change(screen.getByRole("combobox", { name: "Chaîne" }), { target: { value: "no_result" } });
    expect(articles()).toHaveLength(1);
    expect(articles()[0].textContent).toContain("DEMO-ADM-1");
    expect(screen.getByText("1 constat sur 43")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Réinitialiser" })[0]);
    fireEvent.change(screen.getByRole("combobox", { name: "Gravité" }), { target: { value: "bloquant" } });
    expect(articles().map((a) => a.id)).toEqual(["dp-DEMO-ADM-1", "dp-DEMO-PROV-1"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Gravité" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Rechercher" }), { target: { value: "zzz-introuvable" } });
    expect(articles()).toHaveLength(0);
    expect(screen.getByText(/Aucun constat ne correspond à ces filtres/)).toBeTruthy();
  });

  it("export en échec : le refus est dit dans une zone polie, jamais ignoré", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("refusé", { status: 403 })));
    render(<DossierPreuveView />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Exporter le review pack (JSON)" }));
    });
    const status = screen.getByText(/Export impossible : le serveur a répondu 403/);
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("data-tone")).toBe("error");
  });

  it("export interrompu (réseau) : même message explicite", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<DossierPreuveView />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Exporter le review pack (JSON)" }));
    });
    expect(screen.getByText(/Export impossible : Failed to fetch/)).toBeTruthy();
  });
});
