// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProvisionMissionSynthesis } from "../provisions/ProvisionMissionSynthesis";
import { PV_MASKED } from "@/lib/workpapers/provision-contract";
import type { WorkpaperRun } from "@/lib/workpapers/model";
import { pvScope } from "@/lib/workpapers/__tests__/provision-fixtures";
import { createProvisionHarness, type ProvisionHarness } from "@/lib/workpapers/__tests__/provision-harness";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const KEY = [pvScope.organizationId, pvScope.dossierId, pvScope.periodId].join("|");
/** The component only displays the server restitution: the fetch double returns the real runtime response. */
async function serve(h: ProvisionHarness, session: string, extra = "") {
  const { status, body } = await h.read(session, "&operation=mission" + extra);
  expect(status).toBe(200);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
  return body;
}
const SECRETS = ["Client Alpha", "assignation devant le tribunal", "Issue défavorable", "Central — hypothèse la plus probable", "Lettre de l’avocat — litige", "SYN-06", "Convocation devant le conseil", "Complément au vu de la lettre"];

describe("Synthèse Provisions — restitution serveur à version exacte", () => {
  it("lecteur sans habilitation : contenu confidentiel absent du DOM, estimation masquée, original confidentiel non proposé, paquet approuvé fermé", async () => {
    const h = createProvisionHarness(1_801_000_000, { directImports: true }), { run } = await h.executed();
    await serve(h, "reviewer");
    render(<ProvisionMissionSynthesis initialDossierId={pvScope.dossierId} initialPeriodId={pvScope.periodId}/>);
    await screen.findByRole("heading", { name: "Registre restitué — un événement par ligne" });
    const text = document.body.textContent ?? "";
    for (const secret of SECRETS) expect(text).not.toContain(secret);
    expect(screen.getAllByText(PV_MASKED).length).toBe(2);
    expect(screen.getAllByText("Original confidentiel : habilitation dédiée requise.").length).toBeGreaterThan(0);
    expect(text).toContain("Sans habilitation confidentielle");
    // Counts come from the programme: six planned controls, four complete.
    expect(screen.getByText("4/6")).toBeTruthy();
    const sheet = screen.getAllByText("Ouvrir la fiche (v" + run.version + ")")[0];
    expect(sheet.getAttribute("href")).toContain("item=EV-01");
    expect(sheet.getAttribute("href")).toContain("version=" + run.version);
    const html = screen.getAllByText("HTML imprimable") as HTMLButtonElement[];
    expect([html[0].disabled, html[1].disabled]).toEqual([false, true]);
  });
  it("lecteur habilité : estimation et écart du serveur affichés tels quels sur leur événement", async () => {
    const h = createProvisionHarness(1_801_000_000, { directImports: true });
    await h.executed();
    await serve(h, "counsel");
    render(<ProvisionMissionSynthesis initialDossierId={pvScope.dossierId} initialPeriodId={pvScope.periodId}/>);
    await screen.findByRole("heading", { name: "Registre restitué — un événement par ligne" });
    const row = screen.getByRole("rowheader", { name: /EV-01 · Litige commercial n°1/ }).closest("tr")!;
    expect(row.textContent).toMatch(/80,00/);
    expect(row.textContent).toMatch(/écart \+30,00/);
    expect(screen.queryAllByText(PV_MASKED)).toHaveLength(0);
  });
  it("version antérieure signalée avec un lien vers la version courante ; deux lignées : affectation explicite", async () => {
    const h = createProvisionHarness(1_801_000_000, { directImports: true }), { run } = await h.executed();
    const concluded = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Conclusion de préparation." });
    await serve(h, "preparer", "&id=" + run.id + "&version=" + run.version);
    render(<ProvisionMissionSynthesis initialDossierId={pvScope.dossierId} initialPeriodId={pvScope.periodId} initialRunId={run.id} initialVersion={run.version}/>);
    const current = await screen.findByText("Afficher la version courante (v" + concluded.version + ")");
    expect(current.getAttribute("href")).toContain("version=" + concluded.version);
    cleanup();
    const draft = h.db.state.versions[KEY][run.id][0], other: WorkpaperRun = { ...draft, id: "workpaper-lignee-heritee", rootId: "workpaper-lignee-heritee" };
    h.db.state.versions[KEY][other.id] = [other]; h.db.state.runHeads[KEY][other.id] = other.version;
    await serve(h, "preparer");
    render(<ProvisionMissionSynthesis initialDossierId={pvScope.dossierId} initialPeriodId={pvScope.periodId}/>);
    await screen.findByRole("heading", { name: "Affecter une feuille au programme" });
    const links = screen.getAllByText(/^Restituer la feuille /);
    expect(links.map(l => new URL("https://x" + l.getAttribute("href")).searchParams.get("rootId")).sort()).toEqual([run.rootId, other.rootId].sort());
    expect(screen.queryByRole("heading", { name: "Registre restitué — un événement par ligne" })).toBeNull();
  });
});
