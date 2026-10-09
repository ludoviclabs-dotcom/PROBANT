// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EquityWorkspace, type EquityRequested } from "../capitaux-propres/EquityWorkspace";
import { createEquityHarness, EQ_DOSSIER, type EquityHarness } from "@/lib/workpapers/__tests__/capitaux-harness";
import { eqScope } from "@/lib/workpapers/__tests__/capitaux-fixtures";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
/** Every request reaches the real handlers over the in-memory test store: the screen displays server results only. */
async function mount(prepare: (h: EquityHarness) => Promise<unknown> = h => h.executed(), query: Partial<EquityRequested> = {}, ready: () => Promise<unknown> = () => screen.findByRole("table", { name: /Tableau reconstitué/ })) {
  const h = createEquityHarness(undefined, { directImports: true });
  await prepare(h);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/session") return Response.json({ authenticated: true, csrfToken: "server-csrf" });
    const headers = { "x-test-session": "preparer", ...(init?.headers as Record<string, string> | undefined) };
    const request = new Request("https://probant.test" + url, { method: init?.method ?? "GET", headers, body: init?.body as BodyInit | undefined });
    return init?.method === "POST" ? h.handlers.POST(request) : h.handlers.GET(request);
  }));
  render(<EquityWorkspace initialDossierId={EQ_DOSSIER} requested={{ periodId: eqScope.periodId, filter: "all", ...query }}/>);
  await ready();
  return h;
}
const variation = () => screen.getByRole("table", { name: /Tableau reconstitué|Tableau fourni|Écart fourni/ });
const componentRow = (name: string) => within(variation()).getByRole("button", { name }).closest("tr")!;
const panel = () => screen.getByRole("complementary", { name: "Détail et source" });

describe("Capitaux propres — tableau de variation, frise, listes et panneau PV", () => {
  it("tableau horizontal par composante : ponts, total 301 → 361, transferts sans effet, expansion d’une composante", async () => {
    await mount();
    const resultat = componentRow("Résultat de l’exercice");
    for (const text of ["100,00", "−70,00", "−25,00", "+50,00", "55,00"]) expect(within(resultat).getAllByText(new RegExp(text.replace("+", "\\+"))).length).toBeGreaterThan(0);
    const total = within(variation()).getByRole("row", { name: /^Total des capitaux propres/ });
    expect(within(total).getByText(/301,00/)).toBeTruthy(); expect(within(total).getAllByText(/361,00/).length).toBeGreaterThan(0);
    expect(screen.getByText(/effet sur le total 0,00/)).toBeTruthy();
    expect(componentRow("Autres fonds propres").getAttribute("data-status")).toBe("excluded");
    const toggle = within(variation()).getByRole("button", { name: "Résultat de l’exercice" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const movements = screen.getByRole("region", { name: "Mouvements de Résultat de l’exercice" });
    expect(within(movements).getAllByRole("button").map(b => b.textContent?.slice(0, 3))).toEqual(["E01", "E04", "E10"]);
    expect(screen.getByText(/Aucune règle juridique n’est implémentée/)).toBeTruthy();
  });
  it("liste « montant divergent » → panneau PV : voté, comptabilisé et payé séparés ; page et transcription citées", async () => {
    await mount();
    const lists = screen.getByRole("region", { name: /^Montant divergent \d/ });
    const origin = within(lists).getByRole("button", { name: /D1-DIV/ });
    origin.focus(); fireEvent.click(origin);
    await waitFor(() => expect(document.activeElement?.textContent).toMatch(/^AGO-2024 · D1-DIV — Dividende voté/));
    const measures = within(panel()).getByRole("group", { name: "Décision, comptabilisation et paiement" });
    expect(within(measures).getByText("−30,00 EUR")).toBeTruthy(); expect(within(measures).getByText("−25,00 EUR")).toBeTruthy(); expect(within(measures).getByText("25,00 EUR")).toBeTruthy();
    expect(within(panel()).getByText(/Écart comptabilisé − voté : \+5,00/)).toBeTruthy();
    const pv = within(panel()).getByRole("region", { name: "Procès-verbal à la page citée" });
    expect(within(pv).getByText(/PV-AGO-2024 · PV de l’assemblée générale ordinaire du 30 mai 2024/)).toBeTruthy();
    expect(within(pv).getByText(/page 3 · résolution 3/)).toBeTruthy();
    expect(within(pv).getByText(/Un dividende de 30,00 est mis en distribution/)).toBeTruthy();
    expect(within(pv).getByRole("button", { name: "Afficher la page 3 du PV" })).toBeTruthy();
    expect(within(pv).getByText(/Lecture validée par/)).toBeTruthy();
    fireEvent.keyDown(panel(), { key: "Escape" });
    expect(document.activeElement).toBe(origin);
  });
  it("écriture sans décision : la composante s’ouvre et le mouvement sélectionné est mis en évidence ; décision sans écriture et PV absent restent visibles", async () => {
    await mount();
    fireEvent.click(within(screen.getByRole("region", { name: /^Écriture sans décision \d/ })).getByRole("button", { name: /E09/ }));
    const movements = await screen.findByRole("region", { name: "Mouvements de Autres réserves" });
    expect(within(movements).getByRole("button", { name: /E09/ }).getAttribute("aria-current")).toBe("true");
    expect(within(panel()).getByText(/Sans décision — Nature appelant une décision/)).toBeTruthy();
    expect(within(screen.getByRole("region", { name: /^Décision sans écriture \d/ })).getByRole("button", { name: /D4-DIV/ })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("group", { name: "Frise des décisions" })).getByRole("button", { name: /AGE-2024-12/ }));
    await waitFor(() => expect(within(panel()).getByText(/PV absent : la pièce « PV-AGE-2024-12 » n’est pas fournie/)).toBeTruthy());
    expect(within(panel()).getByText(/Effet postérieur à la clôture/)).toBeTruthy();
  });
  it("vue des écarts du tableau fourni : distribution et clôture du résultat −5,00, cellules non lues comme nulles", async () => {
    await mount();
    fireEvent.click(screen.getByRole("radio", { name: "Écarts fourni − reconstitué" }));
    const row = componentRow("Résultat de l’exercice");
    expect(within(row).getAllByText("−5,00 EUR")).toHaveLength(2);
    fireEvent.click(screen.getByRole("radio", { name: "Fourni par l’entité" }));
    expect(within(componentRow("Résultat de l’exercice")).getByText("−30,00 EUR")).toBeTruthy();
  });
  it("lecture d’un PV avant exécution : la pièce, la version et la page sont citées par le serveur", async () => {
    await mount(h => h.frozenRun(), { item: "D:D1-DIV" }, () => screen.findByRole("heading", { name: /D1-DIV/ }));
    const pv = within(panel()).getByRole("region", { name: "Procès-verbal à la page citée" });
    fireEvent.change(within(pv).getByLabelText(/Ce que vous avez vérifié à la page 3/), { target: { value: "Résolution 3 relue : dividende de 30,00." } });
    fireEvent.click(within(pv).getByRole("button", { name: "Valider la lecture — cite PV-AGO-2024 · page 3" }));
    await waitFor(() => expect(within(panel()).getByText(/Lecture validée par/)).toBeTruthy());
    expect(within(panel()).getByText(/cite PV-AGO-2024 · version/)).toBeTruthy();
    expect(screen.getByText(/Sauvegardée — accusé serveur reçu/)).toBeTruthy();
  });
  it("décision humaine : le traitement d’une exception exige une pièce figée citée", async () => {
    await mount(undefined, { filter: "exceptions" }, () => screen.findByRole("heading", { name: "Traitements documentés et conclusion" }));
    const resolve = screen.getAllByRole("button", { name: "Documenter le traitement avec le texte et la pièce citée" })[0];
    fireEvent.change(screen.getByLabelText("Traitement ou commentaire"), { target: { value: "Traitement documenté." } });
    expect(resolve.getAttribute("aria-disabled")).toBe("true");
    const select = screen.getByLabelText("Pièce citée") as HTMLSelectElement;
    const pv = [...select.options].find(o => o.textContent?.startsWith("PV-AGO-2024"))!;
    fireEvent.change(select, { target: { value: pv.value } });
    expect(resolve.getAttribute("aria-disabled")).toBe("true");
    fireEvent.change(screen.getByLabelText(/Page \(1 à 3\)/), { target: { value: "3" } });
    expect(resolve.getAttribute("aria-disabled")).toBe("false");
  });
});
