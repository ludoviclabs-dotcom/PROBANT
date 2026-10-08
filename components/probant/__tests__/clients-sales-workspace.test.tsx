// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientFramingWorkspace } from "../ClientFramingWorkspace";
import { receivablesPresentationFixture } from "./client-receivables-fixture";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import type { ClientsSalesDraft, ClientsSalesResult } from "@/lib/workpapers/clients-sales";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function concurrent(seed: WorkpaperRun): WorkpaperRun { const amount = { amount: "200.00", currency: "EUR" as const }, value = seed.result!.result as ClientsSalesResult; return { ...seed, version: 7, clientsWork: { ...seed.clientsWork!, allocations: seed.clientsWork!.allocations.map(a => ({ ...a, amount })) }, result: { ...seed.result!, result: { ...value, allocations: value.allocations.map(a => ({ ...a, amount })), rows: value.rows.map(r => ({ ...r, subsequentPayments: amount, dueAtReview: { amount: "800.00", currency: "EUR" } })) } }, events: [{ id: "server-event-7", actorId: "actual-preparer", action: "configured_and_executed", at: "2025-03-01T12:10:00Z", version: 7 }] }; }
function mount() {
  const f = receivablesPresentationFixture(), server = concurrent(f.run), requests: Record<string, unknown>[] = [];
  let current = f.run;
  let release: (response: Response) => void = () => {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/auth/session") return Response.json({ authenticated: true, csrfToken: "server-csrf" });
    if (options?.method === "POST") { const body = JSON.parse(String(options.body)); requests.push(body); if (requests.length === 1) return Response.json({ error: "STALE_WORKPAPER_VERSION", expectedVersion: 6, current: server }, { status: 409 }); const response = await new Promise<Response>(resolve => { release = resolve; }); if (response.ok) current = (await response.clone().json()).run; return response; }
    return Response.json({ actorId: "actual-preparer", permissions: ["read", "prepare", "download"], runs: [current], imports: [], sourceHeads: [], salesFacts: { [current.id]: f.facts }, sourcesCurrent: { [current.id]: true }, currentVersions: { [current.id]: current.version } });
  }));
  render(<ClientFramingWorkspace initialDossierId={f.run.scope.dossierId} initialPeriodValue={f.period} requested={{ periodId: f.run.scope.periodId, id: f.run.id, filter: "all" }}/>);
  return { ...f, server, requests, ack: (run: WorkpaperRun) => release(Response.json({ run })) };
}
async function conflict() { await screen.findByText("Allocation validée — accusé serveur"); fireEvent.click(screen.getByRole("button", { name: "Revenir à une proposition" })); fireEvent.click(screen.getByRole("button", { name: "Sauvegarder allocations et jugement" })); await screen.findByText("Une autre modification a été sauvegardée"); }
describe("conflit Clients — allocations et montants persistés", () => {
  it("compare le brouillon et le serveur, puis garde 300 proposés sur v7 sans réécrire le reste serveur de 800", async () => { const f = mount(); await conflict(); const alert = screen.getByRole("alert"); expect(within(alert).getByText(/300.00 EUR \(proposition\)/)).toBeTruthy(); expect(within(alert).getByText(/200.00 EUR \(validation demandée\)/)).toBeTruthy(); expect(f.requests).toHaveLength(1); fireEvent.click(screen.getByRole("button", { name: "Conserver mon brouillon sur la version courante" })); await screen.findByText(/Version courante 7/); expect(screen.getByText("Proposition d’appariement")).toBeTruthy(); const row = screen.getByRole("row", { name: /Client A INV-1000/ }); expect(within(row).getByText("800.00 EUR")).toBeTruthy(); expect(within(row).getByText("1000.00 EUR")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "Sauvegarder allocations et jugement" })); await waitFor(() => expect(f.requests).toHaveLength(2)); const draft = f.requests[1].draft as ClientsSalesDraft; expect(f.requests[1].expectedVersion).toBe(7); expect(draft.allocations[0]).toMatchObject({ amount: { amount: "300.00" }, status: "proposed" }); expect(draft.allocations[0]).not.toHaveProperty("authorId"); expect(screen.queryByText(/Sauvegardée — accusé serveur reçu/)).toBeNull(); expect(within(row).getByText("800.00 EUR")).toBeTruthy(); f.ack({ ...f.server, version: 8, state: "ready", result: undefined }); await screen.findByText(/Sauvegardée — accusé serveur reçu/); });
  it("reprend explicitement 200 validés du serveur sans nouvelle requête ni sauvegarde anticipée", async () => { const f = mount(); await conflict(); fireEvent.click(screen.getByRole("button", { name: "Reprendre le contenu serveur" })); await screen.findByText(/Version courante 7/); expect(screen.queryByText("Proposition d’appariement")).toBeNull(); expect(screen.getByText("Allocation validée — accusé serveur")).toBeTruthy(); expect(f.requests).toHaveLength(1); expect(screen.queryByText(/Sauvegardée — accusé serveur reçu/)).toBeNull(); expect(within(screen.getByRole("row", { name: /Client A INV-1000/ })).getByText("800.00 EUR")).toBeTruthy(); });
});
