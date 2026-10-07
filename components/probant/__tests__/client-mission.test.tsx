// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientMissionSynthesis } from "../ClientMissionSynthesis";
import { ClientFramingWorkspace } from "../ClientFramingWorkspace";
import { buildClientMission } from "@/lib/workpapers/client-mission";
import { clientMissionFixture } from "@/lib/workpapers/__tests__/client-mission-fixture";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("Synthèse de mission — navigation, preuve et lecture seule", () => {
  it("présente le programme, filtre les exceptions et rattache les preuves à leur version", async () => {
    const f = await clientMissionFixture(), mission = buildClientMission(f.scope, [f.run, f.approved, f.locked], f.imports, f.heads);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ actorId: "actual-reviewer", permissions: ["read", "review", "download"], mission })));
    render(<ClientMissionSynthesis initialDossierId={f.scope.dossierId} initialPeriodId={f.scope.periodId}/>);
    await screen.findByText("1/1 procédure exécutée"); expect(screen.getByText("2/2 rapprochements complets")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Exceptions à expliquer" }));
    expect(screen.getAllByText("Exception maintenue")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Examiner les preuves de A" }));
    const links = screen.getAllByText("Télécharger l’original séparément");
    expect(links).toHaveLength(2); expect(links[0].getAttribute("href")).toContain("operation=download");
    const sheet = screen.getAllByText("Ouvrir la feuille v12")[0];
    expect(sheet.getAttribute("href")).toContain("version=12&filter=exceptions");
    expect(screen.getByText("Version soumise 10")).toBeTruthy(); expect(screen.getByText("Après revue · version 12")).toBeTruthy();
    expect(screen.queryByText(/^Conforme$/)).toBeNull();
  });
  it("affiche la source périmée et interdit les boutons de paquet approuvé", async () => {
    const f = await clientMissionFixture(), mission = buildClientMission(f.scope, [f.locked], f.imports, f.heads.slice(1));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ actorId: "actual-preparer", permissions: ["read", "download"], mission })));
    render(<ClientMissionSynthesis initialDossierId={f.scope.dossierId} initialPeriodId={f.scope.periodId}/>);
    await screen.findByText(/Travail périmé —/);
    const htmlButtons = screen.getAllByText("HTML imprimable") as HTMLButtonElement[];
    expect(htmlButtons[0].disabled).toBe(false); expect(htmlButtons[1].disabled).toBe(true);
    expect(screen.getByText("Périmée · binaire absent du paquet")).toBeTruthy();
  });
  it("refuse l’accès et ne présente aucune décision issue d’un autre dossier", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "FORBIDDEN" }, { status: 403 })));
    render(<ClientMissionSynthesis initialDossierId="blocked" initialPeriodId="period"/>);
    await screen.findByText("Accès refusé à ce dossier."); expect(screen.queryByRole("table")).toBeNull();
  });
  it("ouvre exactement la version demandée et son filtre, avec auteurs serveur et commandes désactivées", async () => {
    const f = await clientMissionFixture(), mock = vi.fn(async (url: string) => url === "/api/auth/session" ? Response.json({ authenticated: true, csrfToken: "csrf" }) : Response.json({ actorId: "actual-reviewer", permissions: ["read", "review", "download"], runs: [f.run], imports: [], sourceHeads: f.heads, sourcesCurrent: { [f.run.id]: true }, currentVersions: { [f.run.id]: 12 } }));
    vi.stubGlobal("fetch", mock);
    render(<ClientFramingWorkspace initialDossierId={f.scope.dossierId} requested={{ periodId: f.scope.periodId, id: f.run.id, version: 10, filter: "review" }}/>);
    await screen.findByText(/Examen de la version 10 · version courante 12/);
    expect(mock.mock.calls[1][0]).toContain("operation=version&id=real-pilot&version=10");
    expect(screen.queryByText("Approuver le cadrage")).toBeNull();
    expect(screen.getByRole("button", { name: "Revue", pressed: true })).toBeTruthy();
  });
});
