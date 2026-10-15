// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoanWorkspace } from "../loans/LoanWorkspace";
import { loanFixture } from "@/lib/workpapers/loan-fixture";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
/** The example is computed by the engine, exactly as the read-only demonstration route returns it. */
async function mount(scenario: "complete" | "simple" = "complete") {
  const f = await loanFixture({ scenario });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ actorId: f.actor.id, permissions: [], synthetic: true, executionProfile: null, runs: [f.run], facts: { [f.run.id]: f.facts },
    imports: f.imports, sourceHeads: f.imports.map(b => ({ document_type: b.document.documentType, import_id: b.id })), sourcesCurrent: { [f.run.id]: true } })));
  render(<LoanWorkspace demo requested={{ periodId: "" }}/>);
  await screen.findByRole("heading", { name: "Échéances de l’exercice" });
  return f;
}
const dues = () => within(screen.getByRole("region", { name: /Échéancier — défilement/ }));

describe("Emprunts — échéancier, panneau de détail et preuves", () => {
  it("un mois filtre les échéances ; « Année entière » restaure la liste", async () => {
    await mount();
    const all = dues().getAllByRole("row").length;
    fireEvent.click(screen.getByRole("button", { name: /^Févr\. : 1\séchéance/ }));
    expect(screen.getByRole("heading", { name: "Échéances · Févr." })).toBeTruthy();
    expect(dues().getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Année entière/ }));
    expect(dues().getAllByRole("row")).toHaveLength(all);
  });
  it("recette simple : 250 recalculés en 30/360, détail du segment et retour clavier par Échap", async () => {
    await mount("simple");
    const trigger = dues().getAllByRole("button", { name: /C13-SIMPLE-E20260201/ })[0];
    trigger.focus(); fireEvent.click(trigger);
    const heading = await screen.findByRole("heading", { name: "Échéance du 01/02/2026" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    const panel = screen.getByRole("complementary", { name: "Contrat, échéance et preuves" });
    expect(within(panel).getByText(/100 000,00 EUR × taux fixe 3 % × 30 jours \/ 360 \(30\/360\)/)).toBeTruthy();
    expect(within(panel).getAllByText(/250,00/).length).toBeGreaterThan(0);
    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.getByText("Aucune différence relevée sur la population testée")).toBeTruthy();
  });
  it("taux absent : intérêts courus bloqués avec la raison, jamais un zéro", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "C13-VARIABLE" }));
    const accrued = within(screen.getByRole("region", { name: /Intérêts courus — défilement/ }));
    expect(accrued.getByText(/Taux absent : index « Euribor 3 mois » non fourni pour la révision du 2026-10-01/)).toBeTruthy();
    expect(accrued.getAllByText("Inconnu").length).toBeGreaterThan(0);
  });
  it("résidu, covenant et cadrage : à expliquer, sans ratio ni dette omise affirmée", async () => {
    await mount();
    fireEvent.click(within(screen.getByRole("region", { name: /Contrats — défilement/ })).getByRole("button", { name: /Atlas/ }));
    const panel = await screen.findByRole("complementary", { name: "Contrat, échéance et preuves" });
    expect(within(panel).getByText("Résidu à expliquer")).toBeTruthy();
    expect(within(panel).getByText(/\+10 000,00 EUR/)).toBeTruthy();
    expect(within(panel).getByText("Aucun ratio calculé ; aucune conformité de financement déduite.")).toBeTruthy();
    expect(within(panel).getByText(/Définition contractuelle : Dettes financières nettes/)).toBeTruthy();
    const framing = within(screen.getByRole("region", { name: /Cadrage — défilement/ }));
    expect(framing.getByText(/\+15 000,00 EUR/)).toBeTruthy();
  });
  it("filtres sans résultat : message et remise à zéro", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Rechercher un contrat"), { target: { value: "aucun-contrat" } });
    expect(screen.getByText(/Aucune échéance pour ces filtres/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expect(dues().getAllByRole("row").length).toBeGreaterThan(20);
  });
});
