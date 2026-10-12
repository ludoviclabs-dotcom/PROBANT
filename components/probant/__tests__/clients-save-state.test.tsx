// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientFramingWorkspace } from "../ClientFramingWorkspace";
import { CLIENT_FRAME_TEMPLATE } from "@/lib/workpapers/clients-adapter";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";
import { period } from "@/lib/workpapers/__tests__/clients-framing-fixtures";

/** C02 — incident M20-UI-03 : une feuille chargée ou verrouillée sans saisie n'est pas « non sauvegardée ». */
const dossier = "11111111-1111-4111-8111-111111111111";
const base: WorkpaperRun = { id: "pilot", rootId: "pilot", revision: 1, version: 3, schemaVersion: "1.0.0", scope: { organizationId: "real-org", dossierId: dossier, periodId: periodId(period), mode: "real" },
  period, template: CLIENT_FRAME_TEMPLATE, state: "draft", preparedBy: "actual-preparer", importIds: [], evidence: [], findings: [], notes: [], events: [], conclusion: "Conclusion déjà enregistrée" };

function mount(run: WorkpaperRun, permissions = ["read", "prepare", "download"], requested?: { periodId: string; id?: string; version?: number }) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/auth/session") return Response.json({ authenticated: true, csrfToken: "server-csrf" });
    if (options?.method === "POST") return Response.json({ run: { ...run, version: run.version + 1, conclusion: JSON.parse(options.body as string).conclusion } });
    return Response.json({ actorId: "actual-preparer", permissions, runs: [run], imports: [], sourceHeads: [], sourcesCurrent: { [run.id]: true }, currentVersions: { [run.id]: run.version } });
  }));
  render(<ClientFramingWorkspace initialDossierId={dossier} initialPeriodValue={period} requested={requested ? { ...requested, filter: "all" } : undefined} />);
  if (!requested) fireEvent.click(screen.getByText("Charger le cadrage"));
}
const status = () => screen.getByRole("status").textContent ?? "";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("état de sauvegarde de la feuille Clients", () => {
  it("avant tout chargement, aucune feuille n'est annoncée comme non sauvegardée", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<ClientFramingWorkspace initialDossierId={dossier} initialPeriodValue={period} />);
    expect(status()).toContain("Aucune feuille chargée");
    expect(status()).not.toContain("Modifications non sauvegardées");
  });
  it("une feuille fraîchement chargée est « aucune modification en attente », puis devient non sauvegardée à la saisie et redevient propre si la saisie est annulée", async () => {
    mount(base);
    await screen.findByText(/Identité connectée : actual-preparer/);
    expect(status()).toContain("Aucune modification en attente");
    expect(status()).toContain("Version courante 3");
    const conclusion = screen.getByLabelText("Conclusion");
    fireEvent.change(conclusion, { target: { value: "Conclusion déjà enregistrée, complétée" } });
    expect(status()).toContain("Modifications non sauvegardées");
    fireEvent.change(conclusion, { target: { value: "Conclusion déjà enregistrée" } });
    expect(status()).toContain("Aucune modification en attente");
  });
  it("une version verrouillée affichée sans saisie est en lecture seule, jamais « non sauvegardée »", async () => {
    mount({ ...base, state: "locked", approval: { actorId: "reviewer", version: 3, at: "2025-02-01T00:00:00Z", note: "Revue", snapshotHash: "x" } } as WorkpaperRun, ["read", "download"]);
    await screen.findByText(/Identité connectée : actual-preparer/);
    expect(status()).toContain("Lecture seule · aucune saisie");
    expect(status()).not.toContain("Modifications non sauvegardées");
  });
  it("une version exacte demandée par l'URL est en lecture seule", async () => {
    mount(base, ["read", "prepare", "download"], { periodId: periodId(period), id: "pilot", version: 3 });
    await screen.findByText(/Identité connectée : actual-preparer/);
    expect(status()).toContain("Lecture seule · aucune saisie");
    expect(status()).toContain("Version affichée 3");
  });
  it("après une sauvegarde accusée, la feuille est propre jusqu'à la prochaine saisie", async () => {
    mount(base);
    await screen.findByText(/Identité connectée : actual-preparer/);
    fireEvent.change(screen.getByLabelText("Conclusion"), { target: { value: "Nouvelle conclusion" } });
    expect(status()).toContain("Modifications non sauvegardées");
    fireEvent.click(screen.getByText("Sauvegarder la conclusion"));
    await screen.findByText(/Sauvegardée — accusé serveur reçu/);
    fireEvent.change(screen.getByLabelText("Conclusion"), { target: { value: "Nouvelle conclusion, encore" } });
    expect(status()).toContain("Modifications non sauvegardées");
  });
});
