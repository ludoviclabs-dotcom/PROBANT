import { describe, expect, it } from "vitest";
import { buildFixedAssetMissionPackage } from "@/lib/evidence/fixed-asset-mission-package";
import { FA_CSV, faScope } from "./fixed-asset-fixtures";
import { createFixedAssetHarness, FA_DOSSIER } from "./fixed-asset-harness";

const exportRequest = (body: Record<string, unknown>) => new Request("https://probant.test/api/workpapers/immobilisations/export", { method: "POST", headers: { "x-test-session": "preparer", "Content-Type": "application/json" }, body: JSON.stringify({ dossierId: FA_DOSSIER, periodId: faScope.periodId, ...body }) });

describe("FA-1006 Synthèse et export Immobilisations", () => {
  it("programme fermé : dénominateurs avant tout résultat, sources requises attendues, aucun compteur tiré des anomalies", async () => {
    const h = createFixedAssetHarness();
    const empty = await h.mission();
    expect(empty.counters).toMatchObject({ planned: 1, plannedParts: 4, executed: 0, exceptions: 0 });
    expect(empty.sources.filter(s => s.required && !s.available).map(s => s.type)).toEqual(["fa_register", "fa_ledger"]);
    expect(empty.queue.map(q => q.id)).toEqual(expect.arrayContaining(["procedure:pending", "source:expected:fa_register", "source:expected:fa_ledger", "source:parameters", "source:support"]));
    await h.executed();
    const mission = await h.mission();
    expect(mission.procedure.controls.map(c => c.id + ":" + c.coverage.numerator + "/" + c.coverage.denominator)).toEqual(["movements:15/15", "frame:8/8", "supports:3/3", "recalculation:1/3"]);
    expect(mission.queue.find(q => q.label === "Écart du pont des mouvements à expliquer")?.href).toMatch(/asset=A-001.*table=gross/);
    expect(mission.procedure.resultLabel).toBe("Exceptions maintenues");
  });
  it("export diagnostic : HTML échappé, CSV neutralisé, limites et convention présentes, binaires absents", async () => {
    const h = createFixedAssetHarness();
    // Hostile label and a line identifier starting with "=": escaped in HTML, neutralised in CSV; the piece amount differs to raise an exception on that line.
    await h.executed({ fa_register: FA_CSV.fa_register.replace("L01;100.00;2024-01-01;A-001;;Matériel industriel;brut;ouverture;en_service;2154;standard;Presse hydraulique", "L01;100.00;2024-01-01;A-001;;Matériel industriel;brut;ouverture;en_service;2154;standard;<script>alert(1)</script>").replace("L02;20.00", "=L02;20.00"), fa_support: FA_CSV.fa_support.replace("FAC-001;20.00", "FAC-001;21.00") });
    const mission = await h.mission();
    const html = await (await h.handlers.exportPOST(exportRequest({ kind: "diagnostic", format: "html", expectedSnapshotHash: mission.hash }))).text();
    expect(html).not.toContain("<script>alert(1)</script>"); expect(html).toContain("&lt;script&gt;");
    for (const text of ["Export diagnostic — ne constitue pas un paquet approuvé", "fa-sign-1", "pas une conclusion de valeur", "Les originaux binaires ne sont pas inclus"]) expect(html).toContain(text);
    const csv = await (await h.handlers.exportPOST(exportRequest({ kind: "diagnostic", format: "exceptions_csv", expectedSnapshotHash: mission.hash }))).text();
    expect(csv).toContain("MOVEMENT_DIFFERENCE"); expect(csv).toContain("SUPPORT_AMOUNT_DIFFERENCE"); expect(csv).toContain(",'=L02,"); expect(csv).not.toMatch(/,=L02,/);
    const pack = await buildFixedAssetMissionPackage(mission, null, [], "diagnostic", mission.stateAsOf!).catch(e => e as Error);
    expect(pack).toBeInstanceOf(Error);
  }, 60_000);
});
