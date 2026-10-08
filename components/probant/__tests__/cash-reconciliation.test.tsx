// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CashReconciliationWorkspace } from "../cash/CashReconciliationWorkspace";
import { cashPresentation } from "./cash-fixture";
import type { CashView } from "../cash/types";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
type Post = (body: Record<string, unknown>) => Promise<Response>;
async function mount(options: Parameters<typeof cashPresentation>[0] = {}, post?: Post, query: Record<string, string> = {}) {
  const f = await cashPresentation(options);
  let view: CashView = f.view;
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 0; });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/session") return Response.json({ authenticated: true, csrfToken: "server-csrf" });
    if (init?.method === "POST") { const body = JSON.parse(init.body as string); posts.push(body); const r = await (post ?? (async () => Response.json({ error: "UNEXPECTED" }, { status: 500 })))(body); if (r.ok) { const data = await r.clone().json(); view = { ...view, runs: [data.run] }; } return r; }
    return Response.json(view);
  }));
  render(<CashReconciliationWorkspace initialDossierId={f.dossierId} requested={{ periodId: f.periodId, filter: "all", ...query }}/>);
  await screen.findByRole("radiogroup", { name: "Sélecteur de compte" });
  return { ...f, posts };
}
const bridge = () => screen.getByRole("list", { name: /Pont de rapprochement/ });
const step = (name: RegExp) => within(bridge()).getByRole("button", { name });
const table = () => screen.getByRole("region", { name: "Suspens à la clôture — défilement clavier" });

describe("Trésorerie — pont lisible, suspens, ERB et source", () => {
  it("état nominal : 90 + 15 − 5 = 100, écart nul, R1 apuré, P1 ouvert avec leur sens textuel", async () => {
    await mount();
    expect(step(/Solde du relevé à la clôture : 90,00/)).toBeTruthy();
    expect(step(/Remises non créditées : \+15,00/)).toBeTruthy();
    expect(step(/Paiements non débités : −5,00/)).toBeTruthy();
    expect(step(/Solde reconstitué : 100,00/)).toBeTruthy();
    expect(step(/Solde comptable \(GL\) : 100,00/)).toBeTruthy();
    expect(step(/Écart du pont.*0,00.*ne démontre pas l’authenticité/)).toBeTruthy();
    const rows = within(table()).getAllByRole("row");
    expect(rows.map(r => r.getAttribute("data-item")).filter(Boolean)).toEqual(["P1", "R1"]);
    const r1 = within(table()).getByRole("row", { name: /R1.*Apuré/ }), p1 = within(table()).getByRole("row", { name: /P1.*Ouvert/ });
    expect(within(r1).getByText(/intégralement retrouvé/)).toBeTruthy(); expect(within(p1).getByText(/non retrouvé dans la fenêtre documentée/)).toBeTruthy();
    expect(within(p1).getByText(/reste 5,00/)).toBeTruthy(); expect(within(p1).getByText("Chèque 1045 émis non débité")).toBeTruthy(); expect(within(p1).getByText("CHQ-1045")).toBeTruthy(); expect(within(p1).getByText(/^3.jours à la clôture$/)).toBeTruthy();
    expect(screen.getByText(/Des totaux concordants ne donnent aucune assurance d’authenticité/)).toBeTruthy();
    expect(screen.getByRole("table", { name: /Écarts de source — distincts de l’écart du pont/ })).toBeTruthy();
  });
  it("cliquer une barre filtre ses lignes et place le focus sur la première ligne", async () => {
    await mount();
    fireEvent.click(step(/Remises non créditées/));
    expect(step(/Remises non créditées/).getAttribute("aria-pressed")).toBe("true");
    const items = within(table()).getAllByRole("row").map(r => r.getAttribute("data-item")).filter(Boolean);
    expect(items).toEqual(["R1"]); expect(document.activeElement?.getAttribute("data-item")).toBe("R1");
    fireEvent.click(step(/Paiements non débités/));
    expect(within(table()).getAllByRole("row").map(r => r.getAttribute("data-item")).filter(Boolean)).toEqual(["P1"]);
  });
  it("clavier : pont → ligne → source → retour, puis retour au pont", async () => {
    await mount();
    const receipt = step(/Remises non créditées/); receipt.focus();
    fireEvent.click(receipt);
    const row = document.activeElement as HTMLElement; expect(row.getAttribute("data-item")).toBe("R1");
    fireEvent.keyDown(row, { key: "Enter" });
    const panel = screen.getByRole("complementary", { name: "Détail et source" });
    expect(document.activeElement).toBe(within(panel).getByRole("heading", { name: "Suspens R1 — Remise non créditée" }));
    const source = within(panel).getByRole("region", { name: /Source du suspens \(ERB\) — cash_erb\.csv/ });
    expect(within(source).getByText("ligne 4")).toBeTruthy(); expect(within(source).getByText(/Source courante/)).toBeTruthy();
    expect(within(panel).getByRole("region", { name: /Relevé postérieur — cash_settlements\.csv/ })).toBeTruthy();
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(document.activeElement).toBe(row);
    fireEvent.keyDown(row, { key: "Escape" });
    expect(document.activeElement).toBe(step(/Remises non créditées/));
  });
  it("le relevé et le GL s’ouvrent depuis le pont avec leur pièce, et le focus revient à la barre", async () => {
    await mount();
    const statement = step(/Solde du relevé à la clôture/); statement.focus(); fireEvent.click(statement);
    const panel = screen.getByRole("complementary", { name: "Détail et source" });
    expect(within(panel).getByRole("heading", { name: "Solde du relevé bancaire à la clôture" })).toBe(document.activeElement);
    expect(within(panel).getByText("cash_statement.csv")).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: "Retour au pont" }));
    expect(document.activeElement).toBe(statement);
  });
  it("apurement partiel : 10 apurés, 5 restants, statut partiellement apuré", async () => {
    await mount({ partial: true });
    const r1 = within(table()).getByRole("row", { name: /R1.*Partiellement apuré/ });
    expect(within(r1).getByText(/^10,00/)).toBeTruthy(); expect(within(r1).getByText(/reste 5,00/)).toBeTruthy();
  });
  it("population : comptes exclus visibles avec motif ; caisse et VMP hors de cet écran", async () => {
    await mount();
    fireEvent.click(screen.getByRole("tab", { name: /Population/ }));
    const population = screen.getByRole("table", { name: /Comptes du GL figé/ });
    expect(within(population).getByRole("row", { name: /512200.*USD.*Devise du compte non gérée/ })).toBeTruthy();
    expect(within(population).getByRole("row", { name: /530000.*Caisse/ })).toBeTruthy();
    expect(within(population).getByRole("row", { name: /503000.*VMP/ })).toBeTruthy();
    expect(screen.getByText("Caisse et VMP : procédures distinctes, non couvertes ici")).toBeTruthy();
  });
  it("brouillon : l’allocation reste un brouillon, aucun auteur n’est envoyé, « sauvegardée » seulement après l’accusé", async () => {
    let release: (r: Response) => void = () => {};
    const f = await mount({ stage: "frozen" }, () => new Promise<Response>(resolve => { release = resolve; }));
    fireEvent.click(within(table()).getByRole("row", { name: /R1/ }));
    const panel = screen.getByRole("complementary", { name: "Détail et source" });
    fireEvent.change(within(panel).getByLabelText(/Règlement postérieur/), { target: { value: "S1" } });
    fireEvent.change(within(panel).getByLabelText(/Montant alloué/), { target: { value: "15,00" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Ajouter l’allocation au brouillon" }));
    expect(within(table()).getByText(/brouillon : allocation S1 15,00/)).toBeTruthy();
    expect(within(table()).getByRole("row", { name: /R1.*non calculé/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exécuter le pont" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le brouillon d’apurement" }));
    await screen.findByText("Sauvegarde en cours…");
    expect(screen.queryByText("Sauvegardée — accusé serveur reçu")).toBeNull();
    const body = f.posts[0] as { command: string; draft: { allocations: Record<string, unknown>[] } };
    expect(body).toMatchObject({ command: "configure", expectedVersion: f.run.version, draft: { allocations: [{ itemId: "R1", settlementId: "S1", amount: { amount: "15.00", currency: "EUR" } }] } });
    expect(JSON.stringify(body)).not.toMatch(/authorId|actorId|role|approval/);
    const saved = await f.h.ok(body as never);
    release(Response.json({ run: saved }));
    await waitFor(() => expect(screen.getByText("Sauvegardée — accusé serveur reçu")).toBeTruthy());
  });
});
