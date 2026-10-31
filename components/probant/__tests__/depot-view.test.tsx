// @vitest-environment jsdom
/**
 * Écran Dépôt & ingestion à la charte « instruments ». Attendus posés à la main : la zone de dépôt est un bouton
 * nommé, atteignable au clavier et activable par Entrée et Espace ; le glisser-déposer passe toujours par le même
 * traitement ; un refus est annoncé (role="alert") sans fil d'étapes fictif ; un montant absent n'est jamais un zéro.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "", className: "", style: { fontFamily: "" } });
  return { Newsreader: font, Geist: font, IBM_Plex_Mono: font };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/dashboard/depot",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { buildDemoDossierSnapshot } from "@/lib/dossier/snapshot-builder";
import { DEMO_DOSSIER_CONTEXT } from "@/lib/dossier/repositories";
import type { DossierSnapshot } from "@/lib/dossier/types";
import type { ParsedBalance } from "@/lib/balance/types";
import { validateBalance } from "@/lib/balance/validate";

const snapshot: DossierSnapshot = buildDemoDossierSnapshot();

vi.mock("@/lib/dossier/client", () => {
  // Valeur stable, comme celle du fournisseur : une fonction `listSnapshots` recréée à chaque rendu relancerait
  // l'effet de RecentDossiers en boucle.
  let value: Record<string, unknown> | null = null;
  const useActiveDossier = () =>
    (value ??= {
      context: DEMO_DOSSIER_CONTEXT,
      snapshot,
      saveSnapshot: vi.fn(async () => undefined),
      updateSnapshot: vi.fn(),
      selectDossier: vi.fn(),
      listSnapshots: vi.fn(async () => []),
      resetToDemo: vi.fn(),
      appendReviewDecision: vi.fn(),
    });
  return { useActiveDossier, useActiveDossierSnapshot: () => snapshot, useOptionalActiveDossier: () => null };
});

import { BalanceResult, DepotView } from "../DepotView";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function renderDepot() {
  const view = render(<DepotView />);
  // RecentDossiers lit la liste des dossiers de session de façon asynchrone.
  await act(async () => {});
  return view;
}

const plain = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

describe("zone de dépôt au clavier", () => {
  it("est un bouton nommé, dans l'ordre de tabulation, qui garde l'ancre de la visite guidée", async () => {
    await renderDepot();
    const zone = screen.getByRole("button", { name: "Déposer un fichier à qualifier" });
    expect(zone.getAttribute("tabindex")).toBe("0");
    expect(zone.getAttribute("data-tour")).toBe("depot-dropzone");
    expect(zone.getAttribute("aria-describedby")).toBeTruthy();
    expect(plain(document.getElementById(zone.getAttribute("aria-describedby")!)?.textContent)).toContain("Entrée ou Espace");
    zone.focus();
    expect(document.activeElement).toBe(zone);
  });

  it("Entrée, Espace et le clic ouvrent le sélecteur de fichier ; une autre touche ne fait rien", async () => {
    await renderDepot();
    const picker = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    const zone = screen.getByRole("button", { name: "Déposer un fichier à qualifier" });
    fireEvent.keyDown(zone, { key: "Enter" });
    expect(picker).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(zone, { key: " " });
    expect(picker).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(zone, { key: "a" });
    expect(picker).toHaveBeenCalledTimes(2);
    fireEvent.click(zone);
    expect(picker).toHaveBeenCalledTimes(3);
    // Le sélecteur ouvert est bien l'unique champ fichier de l'écran par défaut.
    const inputs = document.querySelectorAll('input[type="file"]');
    expect(inputs).toHaveLength(1);
    expect(picker.mock.contexts.every((input) => input === inputs[0])).toBe(true);
  });

  it("le glisser-déposer marque la zone, puis un refus de format est annoncé par role=alert, sans fil d'étapes", async () => {
    await renderDepot();
    const zone = screen.getByRole("button", { name: "Déposer un fichier à qualifier" });
    fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
    expect(zone.hasAttribute("data-drag")).toBe(true);
    const file = new File(["synthetic"], "fixture-synthetique.exe", { type: "application/octet-stream" });
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    });
    expect(zone.hasAttribute("data-drag")).toBe(false);
    const alert = await screen.findByRole("alert");
    expect(plain(alert.textContent)).toContain("Format non supporté");
    expect(screen.queryByRole("list", { name: "Étapes du traitement" })).toBeNull();
  });
});

describe("résultat de balance", () => {
  const base: ParsedBalance = {
    source: "csv",
    fileName: "balance-vide.csv",
    lignes: [],
    nbLignes: 0,
    totalDebit: 0,
    totalCredit: 0,
    ecartEquilibre: 0,
    equilibre: true,
    exercice: null,
    siren: null,
    colonnes: { compte: "Compte", libelle: null, debit: "Débit", credit: "Crédit" },
    parseWarnings: ["Aucune ligne de compte exploitable détectée."],
  };

  it("sans ligne lue, les totaux et l'équilibre restent inconnus : « — » et un libellé, jamais « 0 € »", () => {
    const view = render(<BalanceResult data={base} validation={validateBalance(base)} />);
    const readouts = Array.from(view.container.querySelectorAll("dt")).map((dt) => [plain(dt.textContent), plain(dt.nextElementSibling?.textContent)] as const);
    const value = (term: string) => readouts.find(([t]) => t === term)?.[1];
    expect(value("Total débit")).toBe("— inconnu — aucune ligne lue");
    expect(value("Total crédit")).toBe("— inconnu — aucune ligne lue");
    expect(value("Équilibre")).toBe("— non établi — aucune ligne lue");
    expect(value("SIREN")).toBe("— non détecté");
    expect(document.body.textContent).not.toMatch(/\b0 €/u);
  });

  it("contrôles de cohérence : gravité en glyphe et en mot, aucune teinte codée en dur", () => {
    const lignes = [
      { compteNum: "411000", compteLib: "Clients", debit: 1200, credit: 0, solde: 1200 },
      { compteNum: "706000", compteLib: "Prestations", debit: 0, credit: 1000, solde: -1000 },
    ];
    const data: ParsedBalance = { ...base, fileName: "balance.csv", lignes, nbLignes: 2, totalDebit: 1200, totalCredit: 1000, ecartEquilibre: 200, equilibre: false, parseWarnings: [] };
    const view = render(<BalanceResult data={data} validation={validateBalance(data)} />);
    expect(screen.getByText("balance.csv", { exact: true })).toBeTruthy();
    expect(screen.getByText("Contrôles de cohérence", { exact: true })).toBeTruthy();
    const table = screen.getByRole("columnheader", { name: "Gravité de l’écart" }).closest("table")!;
    const row = within(table).getByRole("rowheader", { name: "Équilibre débit = crédit" }).closest("tr")!;
    expect(plain(row.textContent)).toContain("non satisfait");
    expect(plain(row.textContent)).toContain("Bloquant");
    expect(row.querySelector("svg")).not.toBeNull();
    // Un contrôle satisfait n'affiche pas de gravité : rien ne doit se lire comme une alerte.
    const satisfied = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")).filter((tr) => plain(tr.cells[1]?.textContent) === "satisfait");
    expect(satisfied.length).toBeGreaterThan(0);
    for (const tr of satisfied) {
      expect(plain(tr.textContent)).toContain("sans objet");
      expect(tr.querySelector("svg")).toBeNull();
    }
    expect(table.innerHTML).not.toMatch(/#[0-9a-f]{6}/iu);
    const equilibrium = Array.from(view.container.querySelectorAll("dt")).find((dt) => dt.textContent === "Équilibre")!.nextElementSibling!;
    expect(plain(equilibrium.textContent)).toBe("déséquilibrée · écart débit − crédit 200 €");
  });
});
