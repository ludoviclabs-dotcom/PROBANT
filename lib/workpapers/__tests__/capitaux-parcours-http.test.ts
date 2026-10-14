import { describe, expect, it, vi } from "vitest";
import { parcoursHandler, type ParcoursRuntimes } from "../capitaux-parcours-http";
import { parcoursViewSchema } from "../capitaux-parcours";
import { AuthorizationDenied } from "@/lib/auth/principal";
import { c09CapitauxRun, c09LegacyRun, c09Scope } from "./capitaux-c09-fixtures";

/** C09 — the single journey reads each procedure through its own runtime: flags, sessions and exact versions are theirs. */
const URL_BASE = "http://probant.local/api/workpapers/capitaux-propres/parcours?";
const request = (extra: Record<string, string> = {}) => new Request(URL_BASE + new URLSearchParams({ dossierId: c09Scope.dossierId, periodId: c09Scope.periodId, ...extra }));
const ENABLED = { PROBANT_CAPITAUX_DURABLE: "disposable", PROBANT_EQUITY_DURABLE: "disposable" };
async function runtimes(env: Record<string, string> = ENABLED, failures: { capitaux?: Error; equity?: Error } = {}) {
  const cap = await c09CapitauxRun(), leg = await c09LegacyRun();
  const capRead = vi.fn(async () => { if (failures.capitaux) throw failures.capitaux; return { runs: [cap.run], sourcesCurrent: { [cap.run.id]: true }, lineageCurrent: { [cap.run.rootId]: { id: cap.run.id, version: cap.run.version, revision: 1 } }, currentVersions: { [cap.run.id]: cap.run.version } }; });
  const eqRead = vi.fn(async () => { if (failures.equity) throw failures.equity; return { runs: [leg.run], sourcesCurrent: { [leg.run.id]: true }, lineageCurrent: { [leg.run.rootId]: { id: leg.run.id, version: leg.run.version, revision: 1 } }, currentVersions: { [leg.run.id]: leg.run.version }, imports: leg.imports }; });
  const r: ParcoursRuntimes = { capitaux: () => ({ read: capRead }) as never, equity: () => ({ equityRead: eqRead }) as never, env };
  return { r, capRead, eqRead };
}

describe("C09 — lecture serveur du parcours unique", () => {
  it("deux parcours activés : une vue, décisions comptées une fois, aucune écriture", async () => {
    const { r, capRead, eqRead } = await runtimes();
    const response = await parcoursHandler(r)(request());
    expect(response.status).toBe(200);
    const view = parcoursViewSchema.parse(await response.json());
    expect(view.totals).toMatchObject({ counted: 4, linked: 3, toReconcile: 1 });
    expect(view.journeys.map(j => [j.procedure, j.availability, j.role])).toEqual([["capitaux_propres.review", "ready", "cible"], ["equity.review", "ready", "historique"]]);
    expect(capRead).toHaveBeenCalledWith(expect.any(Request), c09Scope.dossierId, c09Scope.periodId, undefined, false, undefined);
    expect(eqRead).toHaveBeenCalledOnce();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("version exacte transmise à chaque runtime ; version sans feuille refusée", async () => {
    const { r, capRead, eqRead } = await runtimes();
    await parcoursHandler(r)(request({ capitauxId: "capitaux-c09-run", capitauxVersion: "3", equityId: "equity-c09-run", equityVersion: "2" }));
    expect(capRead).toHaveBeenCalledWith(expect.any(Request), c09Scope.dossierId, c09Scope.periodId, "capitaux-c09-run", false, 3);
    expect(eqRead).toHaveBeenCalledWith(expect.any(Request), c09Scope.dossierId, c09Scope.periodId, "equity-c09-run", false, 2);
    expect((await parcoursHandler(r)(request({ capitauxVersion: "3" }))).status).toBe(400);
    expect((await parcoursHandler(r)(request({ inconnu: "1" }))).status).toBe(400);
  });
  it("drapeaux fermés : parcours désactivés, aucun runtime appelé, aucune décision inventée", async () => {
    const { r, capRead, eqRead } = await runtimes({});
    const view = parcoursViewSchema.parse(await (await parcoursHandler(r)(request())).json());
    expect(view.journeys.map(j => [j.availability, j.code])).toEqual([["disabled", "EQ_DURABLE_DISABLED"], ["disabled", "EQUITY_DURABLE_DISABLED"]]);
    expect(view.decisions).toEqual([]);
    expect(capRead).not.toHaveBeenCalled(); expect(eqRead).not.toHaveBeenCalled();
  });
  it("session ou droit refusé par un runtime : toute la lecture est refusée (401 / 403)", async () => {
    expect((await parcoursHandler((await runtimes(ENABLED, { equity: new Error("SESSION_INVALID") })).r)(request())).status).toBe(401);
    expect((await parcoursHandler((await runtimes(ENABLED, { capitaux: new Error("WORKPAPER_FORBIDDEN") })).r)(request())).status).toBe(403);
    // A dossier outside the session scope is refused by the shared authorizer (ApiError 403): never degraded into an unavailable journey.
    const denied = await parcoursHandler((await runtimes(ENABLED, { equity: new AuthorizationDenied("DOSSIER_NOT_FOUND", "Dossier introuvable.", 403) })).r)(request());
    expect([denied.status, (await denied.json()).error]).toEqual([403, "DOSSIER_NOT_FOUND"]);
  });
  it("un parcours indisponible n’efface pas l’autre : il est signalé, ses décisions ne sont pas réputées absentes", async () => {
    const view = parcoursViewSchema.parse(await (await parcoursHandler((await runtimes(ENABLED, { equity: new Error("Connection terminated") })).r)(request())).json());
    expect(view.journeys[1]).toMatchObject({ availability: "unavailable", code: "DURABLE_UNAVAILABLE", runs: [] });
    expect(view.decisions.every(d => d.correspondence === "single")).toBe(true);
  });
});
