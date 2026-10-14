import { describe, expect, it } from "vitest";
import { buildEquityMissionPackage } from "@/lib/evidence/capitaux-mission-package";
import { EQ_CSV, eqScope } from "./capitaux-fixtures";
import { createEquityHarness, EQ_DOSSIER, type EquityHarness } from "./capitaux-harness";
import { eqDraft } from "./capitaux-fixtures";
import { EQ_LEGAL_TEXT_V2, EQ_LEGAL_TEXT_V3 } from "../capitaux-review";
import type { WorkpaperRun } from "../model";

const exportRequest = (body: Record<string, unknown>) => new Request("https://probant.test/api/workpapers/capitaux-propres/export", { method: "POST", headers: { "x-test-session": "preparer", "Content-Type": "application/json" }, body: JSON.stringify({ dossierId: EQ_DOSSIER, periodId: eqScope.periodId, ...body }) });

describe("Règle Capitaux propres 1.1.1 dans la synthèse : seule une feuille 1.1.0 déclarée SCA diffère du programme", () => {
  const framing = (socialForm: "sa" | "sca") => ({ socialForm, socialFormCitation: null, anticipationAnc202407: false, anticipationCitation: null });
  /** The executed version, stored as it would have been under rule 1.1.0. */
  function asRule110(h: EquityHarness, run: WorkpaperRun) {
    const list = Object.values(h.db.state.versions).map(v => (v as Record<string, WorkpaperRun[]>)[run.id]).find(Boolean)!;
    const index = list.findIndex(v => v.version === run.version), stored = list[index];
    list[index] = { ...stored, template: { ...stored.template, version: "1.1.0", rule: { ...stored.template.rule!, version: "1.1.0" } }, result: { ...stored.result!, ruleVersion: "1.1.0" } } as WorkpaperRun;
  }
  it("feuille 1.1.1 : à jour, contrôles en 1.1.1, limite juridique citant L226-1", async () => {
    const h = createEquityHarness(); await h.executed({}, { ...eqDraft(), framing: framing("sca") });
    const mission = await h.mission();
    expect([mission.procedure.stale, mission.procedure.controls.map(c => c.ruleVersion)]).toEqual([false, ["1.1.1", "1.1.1", "1.1.1", "1.1.1", "1.1.1"]]);
    expect(mission.limitations).toContain(EQ_LEGAL_TEXT_V3);
  });
  it("feuille 1.1.0 d’une SA : à jour, contrôles attribués à la règle 1.1.0 et limite juridique de cette règle", async () => {
    const h = createEquityHarness(); const { run } = await h.executed({}, { ...eqDraft(), framing: framing("sa") });
    asRule110(h, run);
    const mission = await h.mission();
    expect([mission.procedure.stale, mission.procedure.controls[0].ruleVersion]).toEqual([false, "1.1.0"]);
    expect(mission.limitations).toContain(EQ_LEGAL_TEXT_V2);
    expect(mission.limitations).not.toContain(EQ_LEGAL_TEXT_V3);
  });
  it("feuille 1.1.0 d’une SCA : périmée, motif nommant le renvoi de L226-1", async () => {
    const h = createEquityHarness(); const { run } = await h.executed({}, { ...eqDraft(), framing: framing("sca") });
    asRule110(h, run);
    const mission = await h.mission();
    expect(mission.procedure.stale).toBe(true);
    expect(mission.procedure.staleReasons).toContain("La version de règle Capitaux propres diffère du programme : règle 1.1.0, forme déclarée SCA ; la règle 1.1.1 cite l’art. L225-248 par le renvoi de l’art. L226-1 (repère « moitié du capital »).");
  });
});

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
    for (const text of ["Export diagnostic — ne constitue pas un paquet approuvé", "eq-sign-1", "36100 / 15000 (centimes)", "aucune alerte de dissolution, aucun délai calculé", "Transferts internes (effet nul sur le total)", "Les originaux binaires (PV compris) ne sont pas inclus"]) expect(html).toContain(text);
    const csv = await (await h.handlers.exportPOST(exportRequest({ kind: "diagnostic", format: "exceptions_csv", expectedSnapshotHash: mission.hash }))).text();
    expect(csv).toContain("ENTRY_WITHOUT_DECISION"); expect(csv).toContain(",'=E09,"); expect(csv).not.toMatch(/,=E09,/);
    const pdf = await h.handlers.exportPOST(exportRequest({ kind: "diagnostic", format: "pdf", expectedSnapshotHash: mission.hash }));
    expect(pdf.status).toBe(200); expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await buildEquityMissionPackage(mission, null, [], "diagnostic", mission.stateAsOf!).catch(e => e as Error)).toBeInstanceOf(Error);
  }, 60_000);
});
