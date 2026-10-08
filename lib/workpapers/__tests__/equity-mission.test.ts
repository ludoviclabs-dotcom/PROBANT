import { describe, expect, it } from "vitest";
import { buildEquityMissionPackage } from "@/lib/evidence/equity-mission-package";
import { EQ_CSV, eqScope } from "./equity-fixtures";
import { createEquityHarness, EQ_DOSSIER } from "./equity-harness";

const exportRequest = (body: Record<string, unknown>) => new Request("https://probant.test/api/workpapers/capitaux-propres/export", { method: "POST", headers: { "x-test-session": "preparer", "Content-Type": "application/json" }, body: JSON.stringify({ dossierId: EQ_DOSSIER, periodId: eqScope.periodId, ...body }) });

describe("EQ-1106 Synthèse et export Capitaux propres", () => {
  it("programme fermé : dénominateurs avant tout résultat, sources attendues, liens vers la feuille, aucun feu vert juridique", async () => {
    const h = createEquityHarness();
    const empty = await h.mission();
    expect(empty.counters).toMatchObject({ planned: 1, plannedParts: 5, executed: 0, exceptions: 0 });
    expect(empty.sources.filter(s => s.required && !s.available).map(s => s.type)).toEqual(["eq_balances", "eq_entries"]);
    expect(empty.queue.map(q => q.id)).toEqual(expect.arrayContaining(["procedure:pending", "source:expected:eq_balances", "source:expected:eq_entries", "source:decisions", "source:minutes", "source:variation"]));
    await h.executed();
    const mission = await h.mission();
    expect(mission.procedure.controls.map(c => c.id + ":" + c.coverage.numerator + "/" + c.coverage.denominator)).toEqual(["bridge:8/8", "statement:28/28", "decisions:9/9", "entries:12/12", "minutes:8/10"]);
    expect(mission.queue.find(q => q.label === "Montant divergent entre décision et comptabilisation")?.href).toMatch(/^\/capitaux-propres\?.*filter=exceptions.*component=resultat.*item=D%3AD1-DIV/);
    expect(mission.queue.find(q => q.label === "Écriture sans décision")?.href).toMatch(/item=M%3AE09/);
    expect(mission.sources.filter(s => s.type === "eq_minutes").map(s => s.label)).toEqual(["PV et actes (PDF versionnés) — PV-AGE-2024-09", "PV et actes (PDF versionnés) — PV-AGO-2024", "PV et actes (PDF versionnés) — PV-AGO-2025"]);
    expect(mission.procedure.resultLabel).toBe("Exceptions maintenues");
    expect(JSON.stringify(mission)).not.toMatch(/conforme|feu vert accordé|régulier/i);
  });
  it("export diagnostic : HTML échappé, CSV neutralisé, limites et rapports arithmétiques présents, binaires absents", async () => {
    const h = createEquityHarness();
    await h.executed({ eq_entries: EQ_CSV.eq_entries.replace("Distribution sur autres réserves", "<script>alert(1)</script>").replace("E09;-4.00", "=E09;-4.00") });
    const mission = await h.mission();
    const html = await (await h.handlers.exportPOST(exportRequest({ kind: "diagnostic", format: "html", expectedSnapshotHash: mission.hash }))).text();
    expect(html).not.toContain("<script>alert(1)</script>"); expect(html).toContain("&lt;script&gt;");
    for (const text of ["Export diagnostic — ne constitue pas un paquet approuvé", "eq-sign-1", "36100 / 15000 (centimes)", "Aucune règle juridique n’est implémentée", "Transferts internes (effet nul sur le total)", "Les originaux binaires (PV compris) ne sont pas inclus"]) expect(html).toContain(text);
    const csv = await (await h.handlers.exportPOST(exportRequest({ kind: "diagnostic", format: "exceptions_csv", expectedSnapshotHash: mission.hash }))).text();
    expect(csv).toContain("ENTRY_WITHOUT_DECISION"); expect(csv).toContain(",'=E09,"); expect(csv).not.toMatch(/,=E09,/);
    const pdf = await h.handlers.exportPOST(exportRequest({ kind: "diagnostic", format: "pdf", expectedSnapshotHash: mission.hash }));
    expect(pdf.status).toBe(200); expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await buildEquityMissionPackage(mission, null, [], "diagnostic", mission.stateAsOf!).catch(e => e as Error)).toBeInstanceOf(Error);
  }, 60_000);
});
