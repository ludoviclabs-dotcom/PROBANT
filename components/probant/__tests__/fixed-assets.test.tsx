// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FixedAssetsWorkspace } from "../fixed-assets/FixedAssetsWorkspace";
import { createFixedAssetHarness, FA_DOSSIER, type FixedAssetHarness } from "@/lib/workpapers/__tests__/fixed-asset-harness";
import { faScope } from "@/lib/workpapers/__tests__/fixed-asset-fixtures";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
/** Every request reaches the real handlers over the in-memory test store: the screen displays server results only. */
async function mount(prepare: (h: FixedAssetHarness) => Promise<unknown> = h => h.executed(), query: Record<string, string> = {}) {
  const h = createFixedAssetHarness(undefined, { directImports: true });
  await prepare(h);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/session") return Response.json({ authenticated: true, csrfToken: "server-csrf" });
    const headers = { "x-test-session": "preparer", ...(init?.headers as Record<string, string> | undefined) };
    const request = new Request("https://probant.test" + url, { method: init?.method ?? "GET", headers, body: init?.body as BodyInit | undefined });
    return init?.method === "POST" ? h.handlers.POST(request) : h.handlers.GET(request);
  }));
  render(<FixedAssetsWorkspace initialDossierId={FA_DOSSIER} requested={{ periodId: faScope.periodId, filter: "all", ...query }}/>);
  await screen.findByRole("radiogroup", { name: "Sélecteur de famille" });
  return h;
}
const bridge = () => screen.getByRole("list", { name: /Pont Brut|Pont Amortissements|Pont Dépréciations/ });
const step = (name: RegExp) => within(bridge()).getByRole("button", { name });
const table = () => screen.getByRole("region", { name: /Actifs et composants — .* — défilement clavier/ });
const rowIds = () => within(table()).getAllByRole("row").map(r => r.getAttribute("data-unit")).filter(Boolean);
const family = (name: string) => fireEvent.click(within(screen.getByRole("radiogroup", { name: "Sélecteur de famille" })).getByRole("radio", { name: new RegExp(name) }));

describe("Immobilisations — pont par famille, actifs, chronologie, pièce et recalcul", () => {
  it("pont Brut du matériel : 205 + 60 − 10 = 255 attendu, 254 observé, écart −1 à expliquer ; valeurs écrites en clair", async () => {
    await mount();
    family("Matériel industriel");
    expect(step(/^Ouverture : 205,00/)).toBeTruthy();
    expect(step(/^\+ Entrées : \+60,00/)).toBeTruthy();
    expect(step(/^− Sorties : −10,00/)).toBeTruthy();
    expect(step(/^= Clôture attendue : 255,00/)).toBeTruthy();
    expect(step(/^Clôture observée : 254,00/)).toBeTruthy();
    expect(step(/^Écart.*−1,00.*1.actif en écart.*Écart à expliquer/)).toBeTruthy();
    expect(within(bridge()).queryByRole("button", { name: /Reprises/ })).toBeNull();
    expect(screen.getByText(/Le pont explique l’arithmétique des mouvements/)).toBeTruthy();
    const a001 = within(table()).getByRole("row", { name: /^A-001.*écart −1,00/ });
    expect(within(a001).getByText("à expliquer")).toBeTruthy();
    family("Terrains");
    expect(within(table()).getByText(/Exclu du test : Actif réévalué/)).toBeTruthy();
  });
  it("cliquer une variation filtre ses actifs et place le focus sur la première ligne ; le filtre est explicite et retirable", async () => {
    await mount();
    family("Matériel industriel");
    fireEvent.click(step(/^\+ Entrées/));
    expect(step(/^\+ Entrées/).getAttribute("aria-pressed")).toBe("true");
    expect(rowIds()).toEqual(["A-001", "A-004"]);
    expect(document.activeElement?.getAttribute("data-unit")).toBe("A-001");
    fireEvent.click(step(/^Écart/));
    expect(rowIds()).toEqual(["A-001"]);
    fireEvent.click(screen.getByRole("button", { name: /Filtre : en écart ou incomplets — retirer/ }));
    expect(rowIds()).toEqual(["A-001", "A-002", "A-004", "A-005"]);
  });
  it("clavier : variation → actif → chronologie → pièce, puis Échap revient à la ligne", async () => {
    await mount();
    family("Matériel industriel");
    fireEvent.click(step(/^− Sorties/));
    const row = document.activeElement as HTMLElement; expect(row.getAttribute("data-unit")).toBe("A-001");
    fireEvent.keyDown(row, { key: "Enter" });
    const panel = screen.getByRole("complementary", { name: "Détail et source" });
    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByRole("heading", { level: 2, name: /A-001 — Presse hydraulique/ })));
    const chronology = within(panel).getByRole("list", { name: /Chronologie Brut de A-001/ });
    expect(within(chronology).getAllByRole("listitem").map(li => li.getAttribute("data-movement"))).toEqual(["opening", "addition", "disposal", "closing"]);
    const disposal = within(chronology).getAllByRole("listitem")[2];
    expect(within(disposal).getByText("Pièce concordante")).toBeTruthy();
    fireEvent.click(within(disposal).getByRole("button", { name: "Ouvrir la ligne et sa pièce" }));
    expect(within(panel).getByRole("region", { name: /Pièce CES-001 \(cession\)/ })).toBeTruthy();
    expect(within(panel).getByRole("region", { name: /Ligne du registre/ })).toBeTruthy();
    fireEvent.keyDown(within(disposal).getByRole("button", { name: "Masquer la source" }), { key: "Escape" });
    expect(document.activeElement).toBe(row);
  });
  it("onglet Amortissements : panneau de recalcul avec entrées, formule, arrondi et provenance", async () => {
    await mount();
    family("Matériel industriel");
    fireEvent.click(screen.getByRole("tab", { name: "Amortissements" }));
    const a002 = within(table()).getByRole("row", { name: /^A-002/ });
    expect(within(a002).getByText("Recalculé")).toBeTruthy();
    fireEvent.click(a002);
    const panel = screen.getByRole("complementary", { name: "Détail et source" });
    const recalc = within(panel).getByRole("region", { name: "Recalcul documenté de la dotation" });
    for (const text of ["LIN-2024 v1 — Linéaire — politique d’amortissement 2024", "60,00 EUR", "60 mois", "12 / 12", "01/01/2022", "Au centime, demi supérieur"]) expect(within(recalc).getAllByText(text, { exact: false }).length).toBeGreaterThan(0);
    expect(within(recalc).getByText(/Dotation recalculée = \(coût − valeur résiduelle\) × 12 ÷ durée en mois/)).toBeTruthy();
    expect(within(recalc).getByRole("region", { name: /Paramètres d’amortissement de l’actif/ })).toBeTruthy();
    expect(within(recalc).getByRole("region", { name: /Pièce de mise en service/ })).toBeTruthy();
    fireEvent.click(within(table()).getByRole("row", { name: /^A-005/ }));
    expect(within(screen.getByRole("region", { name: "Recalcul documenté de la dotation" })).getAllByText(/Valeur résiduelle 50.00 EUR supérieure au coût 45.00 EUR/).length).toBeGreaterThan(0);
    fireEvent.click(within(table()).getByRole("row", { name: /^A-004/ }));
    expect(within(screen.getByRole("region", { name: "Recalcul documenté de la dotation" })).getAllByText("Mise en service postérieure à clôture").length).toBeGreaterThan(0);
  });
  it("sous-onglets au clavier ; famille Logiciels : méthode absente bloque le recalcul", async () => {
    await mount();
    family("Logiciels");
    const gross = screen.getByRole("tab", { name: "Brut" }); gross.focus();
    fireEvent.keyDown(gross, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Amortissements" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Amortissements" }));
    const a003 = within(table()).getByRole("row", { name: /^A-003/ });
    expect(within(a003).getByText("Bloqué")).toBeTruthy(); expect(within(a003).getByText("SOURCE REQUISE : méthode absente des paramètres.")).toBeTruthy();
  });
  it("exception → feuille : le bouton ouvre l’actif dans son tableau ; le traitement documenté explique l’écart −1", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: /Exceptions/ }));
    expect(within(screen.getByRole("region", { name: "Exceptions et incertitudes du calcul serveur" })).getByText(/clôture 109.00 − \(ouverture 100.00 \+ entrées 20.00 − sorties 10.00/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Traitement ou commentaire"), { target: { value: "Écart −1,00 : mise au rebut d’un accessoire non saisie (PV R-17)." } });
    fireEvent.click(screen.getAllByRole("button", { name: "Documenter le traitement avec le texte ci-dessous" })[0]);
    await screen.findByText(/Traitement documenté par preparer-fa : Écart −1,00 : mise au rebut/);
    fireEvent.click(screen.getByRole("button", { name: "Voir l’actif A-001 dans le pont" }));
    await waitFor(() => expect(document.activeElement?.getAttribute("data-unit")).toBe("A-001"));
    expect(screen.getByRole("tab", { name: "Brut" }).getAttribute("aria-selected")).toBe("true");
  });
  it("avant exécution : aucun pont affiché sans calcul serveur, cause et action indiquées", async () => {
    await mount(h => h.frozenRun());
    expect(screen.getByText(/Revue non exécutée : exécutez-la sur les sources figées/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: /Pont Brut/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Exécuter la revue des immobilisations" })).toBeTruthy();
  });
});
