import { beforeEach, describe, expect, it } from "vitest";
import { requireDisposableStocks, stockFailureStatus } from "../stock-http";
import type { StockResult } from "../stock-contract";
import type { WorkpaperRun } from "../model";
import { COST_ROWS, costCsv, COUNT_ROWS, countCsv, stPeriod, VALUE_ROWS, valueCsv } from "./stock-fixtures";
import { createStockHarness, ST_OTHER_DOSSIER, type StockHarness } from "./stock-harness";

let h: StockHarness;
beforeEach(() => { h = createStockHarness(); });
const resultOf = (run: WorkpaperRun) => run.result!.result as StockResult;

describe("ST-1511 chaîne serveur : sources → population figée → calcul → notes → revue distincte → verrouillage", () => {
  it("parcours complet : 15 unités, 9 testées, 6 exclues avec motif ; exceptions en notes d’une seule version ; revue par une autre identité", async () => {
    const { sources, run: frozen } = await h.frozen();
    expect(frozen).toMatchObject({ state: "ready", template: { id: "stocks.count" }, population: { unit: "stock_unit" }, stockWork: { sameDay: "before_count", instructions: { fileName: "st_support.csv", row: 2 } } });
    expect(frozen.population!.items).toHaveLength(15);
    expect(frozen.selection!.selectedIds).toHaveLength(9);
    expect(frozen.selection!.exclusions.map(e => e.id).sort()).toEqual(["REF-K|ENTREPOT-SUD|", "REF-T|ENTREPOT-NORD|", "REF-W|DEPOT-OUEST|", "REF-X|ENTREPOT-NORD|", "REF-Y|ENTREPOT-SUD|", "REF-Z|ENTREPOT-NORD|"]);
    expect(frozen.importIds.sort()).toEqual(Object.values(sources).map(b => b!.id).sort());
    let run = await h.ok({ command: "execute", id: frozen.id, expectedVersion: frozen.version });
    expect(run.result!.outcome).toBe("exceptions_detected");
    expect(run.version).toBe(frozen.version + 2);
    expect(run.notes).toHaveLength(9);
    expect(run.notes.find(n => n.id === "st-exception:QTY:REF-A|ENTREPOT-NORD|L1")).toMatchObject({ kind: "observation", blocking: true, amount: { kind: "unknown" } });
    expect(run.notes.find(n => n.id === "st-exception:SITE:DEPOT-OUEST")!.kind).toBe("missing_evidence");
    expect(run.evidence.some(e => e.purpose === "Ligne de comptage")).toBe(true);
    // Every open point is resolved by a decision citing a frozen piece and its row.
    const support = sources.st_support!, fiche = support.rows.find(r => r.original.Piece === "FC-01")!;
    for (const n of run.notes) run = await h.ok({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: n.id, text: "Explication documentée par la fiche de comptage.", citation: { documentId: support.document.id, rowId: fiche.id } });
    expect(run.notes.every(n => n.resolution?.citation?.fileName === "st_support.csv" && n.resolution.citation.row === 6)).toBe(true);
    run = await h.ok({ command: "conclude", id: run.id, expectedVersion: run.version, text: "Écarts de quantité expliqués ; aucune valeur établie à ce stade ; présence physique non certifiée." });
    run = await h.ok({ command: "submit", id: run.id, expectedVersion: run.version });
    expect((await h.command({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Auto-revue" })).status).toBe(403);
    run = await h.ok({ command: "review", id: run.id, expectedVersion: run.version, decision: "approved", submittedHash: run.submittedHash!, text: "Revue indépendante des quantités." }, "reviewer");
    run = await h.ok({ command: "lock", id: run.id, expectedVersion: run.version }, "reviewer");
    expect(run.state).toBe("locked");
  });
  it("la citation d’un traitement doit viser une source figée de la feuille", async () => {
    const { run } = await h.executed();
    const note = run.notes[0];
    expect((await h.command({ command: "resolve", id: run.id, expectedVersion: run.version, noteId: note.id, text: "x", citation: { documentId: "source-hors-feuille" } })).body.error).toBe("ST_CITATION_SOURCE_REQUIRED");
    expect((await h.command({ command: "note", id: run.id, expectedVersion: run.version, note: { id: "j1", kind: "judgment", text: "Jugement", amount: { kind: "unknown", reason: "—" }, blocking: false } })).body.error).toBe("ST_CITATION_REQUIRED");
  });
  it("gel refusé si les sources nommées ne sont pas exactement les têtes approuvées ; sans comptage ni théorique, rien n’est figé", async () => {
    const sources = await h.importAll(["st_count", "st_system", "st_support"]);
    const run = await h.create();
    expect((await h.command({ command: "freeze", id: run.id, expectedVersion: run.version, importIds: [sources.st_count!.id, sources.st_system!.id], draft: h.draft(sources) })).body.error).toBe("ST_CURRENT_SOURCES_REQUIRED");
    const only = createStockHarness(), counts = await only.importAll(["st_count", "st_support"]), r2 = await only.create();
    expect((await only.command({ command: "freeze", id: r2.id, expectedVersion: r2.version, importIds: Object.values(counts).map(b => b!.id), draft: only.draft(counts) })).body.error).toBe("ST_SOURCES_REQUIRED");
  });
});

describe("ST-1512 versions, péremption et convention", () => {
  it("feuille de comptage remplacée : feuille périmée, ancienne version conservée avec son empreinte, révision sur les sources courantes", async () => {
    const { sources, run } = await h.executed();
    const corrected = countCsv(COUNT_ROWS.map(r => r[0] === "C001" ? [...r.slice(0, 5), "100", ...r.slice(6)] : r));
    h.clock.now += 60;
    const replacement = await h.accept(await h.preview("st_count", corrected));
    const view = (await h.read()).body;
    expect(view.sourcesCurrent[run.id]).toBe(false);
    expect(view.versions.st_count.map((v: { importId: string; current: boolean }) => [v.importId, v.current])).toEqual([[sources.st_count!.id, false], [replacement.id, true]]);
    expect((await h.command({ command: "conclude", id: run.id, expectedVersion: run.version, text: "x" })).body.error).toBe("ST_SOURCE_REPLACED_REVISION_REQUIRED");
    const revised = await h.ok({ command: "revise", id: run.id, expectedVersion: run.version });
    expect(revised).toMatchObject({ revision: 2, state: "draft", importIds: [], notes: [] });
    expect(revised.stockWork).toBeUndefined();
    const current = { ...sources, st_count: replacement };
    const refrozen = await h.ok({ command: "freeze", id: revised.id, expectedVersion: revised.version, importIds: Object.values(current).map(b => b!.id), draft: h.draft(current) });
    const executed = await h.ok({ command: "execute", id: refrozen.id, expectedVersion: refrozen.version });
    expect(resultOf(executed).units.find(u => u.unitId === "REF-A|ENTREPOT-NORD|L1")).toMatchObject({ status: "matched", difference: "0" });
  });
  it("journal de mouvements ajouté après le gel : la feuille devient périmée", async () => {
    const sources = await h.importAll(["st_count", "st_system", "st_support"]);
    const { run } = await h.executed(sources);
    expect(resultOf(run).units.find(u => u.unitId === "REF-D|ENTREPOT-SUD|")!.status).toBe("movements_incomplete");
    await h.accept(await h.preview("st_movements"));
    expect((await h.read()).body.sourcesCurrent[run.id]).toBe(false);
  });
  it("changer la convention du jour de comptage invalide le résultat, les notes et la revue : nouvelle exécution requise", async () => {
    const { sources, run } = await h.executed();
    const configured = await h.ok({ command: "configure", id: run.id, expectedVersion: run.version, draft: h.draft(sources, { sameDay: "after_count" }) });
    expect(configured).toMatchObject({ state: "ready", notes: [], stockWork: { sameDay: "after_count" } });
    expect(configured.result).toBeUndefined();
    const executed = await h.ok({ command: "execute", id: configured.id, expectedVersion: configured.version });
    expect(resultOf(executed).units.find(u => u.unitId === "REF-D|ENTREPOT-SUD|")).toMatchObject({ difference: "-300" });
  });
  it("aperçu refusé avec la cellule en cause ; rien n’est conservé", async () => {
    const bad = countCsv([["C1", "REF-A", "N", "", "unite", "1", "2026-12-31", "louee", "", ""]]);
    const r = await h.preview("st_count", bad);
    expect(r).toMatchObject({ status: 422, body: { error: "ST_CATEGORY_INVALID", locator: { row: 2, column: "Statut", value: "louee" } } });
    expect((await h.read()).body.imports).toEqual([]);
  });
});

describe("ST-1514 sous-lot 2 : coûts et cadrage dans la chaîne serveur", () => {
  it("six sources figées ; écart de REF-A valorisé −24,00 € sur la note ; cadrage et propriété valorisée en notes ; coût remplacé → feuille périmée", async () => {
    const v = createStockHarness(1_801_000_000, { valued: true });
    const sources = await v.importAll(["st_count", "st_system", "st_movements", "st_support", "st_costs", "st_ledger"]);
    const { run } = await v.executed(sources);
    expect(run.importIds).toHaveLength(6);
    expect(run.notes).toHaveLength(14);
    expect(run.notes.find(n => n.id === "st-exception:QTY:REF-A|ENTREPOT-NORD|L1")!.amount).toEqual({ kind: "known", value: { amount: "-24.00", currency: "EUR" } });
    expect(run.notes.find(n => n.id === "st-exception:FRAME:321000")!.amount).toEqual({ kind: "known", value: { amount: "10.00", currency: "EUR" } });
    expect(run.notes.find(n => n.id === "st-exception:COST:REF-H|ENTREPOT-NORD|")!.kind).toBe("missing_evidence");
    expect(run.evidence.some(e => e.purpose === "Coût unitaire documenté")).toBe(true);
    v.clock.now += 60;
    await v.accept(await v.preview("st_costs", costCsv(COST_ROWS.map(c => c[0] === "K01" ? [...c.slice(0, 4), "11,50", ...c.slice(5)] : c))));
    expect((await v.read()).body.sourcesCurrent[run.id]).toBe(false);
  });
});

describe("ST-1515 sous-lot 3 : revue de valeur dans la chaîne serveur", () => {
  it("sept sources figées ; différence REF-C −25,00 € et cadrage des comptes 39 −20,00 € en notes ; hypothèse remplacée → feuille périmée", async () => {
    const v = createStockHarness(1_801_000_000, { valued: true });
    const sources = await v.importAll(["st_count", "st_system", "st_movements", "st_support", "st_costs", "st_ledger", "st_value"]);
    const { run } = await v.executed(sources);
    expect(run.importIds).toHaveLength(7);
    expect(run.notes).toHaveLength(17);
    expect(run.notes.find(n => n.id === "st-exception:VREV:REF-C|ENTREPOT-NORD|")).toMatchObject({ kind: "observation", amount: { kind: "known", value: { amount: "-25.00" } } });
    expect(run.notes.find(n => n.id === "st-exception:VHYP:REF-E|ENTREPOT-NORD|L7")!.kind).toBe("missing_evidence");
    expect(run.evidence.some(e => e.purpose === "Hypothèse de valeur actuelle")).toBe(true);
    v.clock.now += 60;
    await v.accept(await v.preview("st_value", valueCsv(VALUE_ROWS.map(r => r[0] === "V02" ? [...r.slice(0, 4), "7,00", ...r.slice(5)] : r))));
    expect((await v.read()).body.sourcesCurrent[run.id]).toBe(false);
  });
});

describe("ST-1513 autorisations, idempotence et garde de recette", () => {
  it("autre organisation refusée, session expirée refusée, rejeu idempotent, clé réutilisée refusée", async () => {
    expect((await h.read("outsider")).status).toBe(403);
    expect((await h.json(await h.handlers.GET(h.request("preparer", "GET", undefined, ST_OTHER_DOSSIER)))).status).toBe(403);
    expect((await h.read("expired")).status).toBe(401);
    const body = { command: "create", period: stPeriod };
    const first = await h.command(body, "preparer", "cle-idempotence-1"), again = await h.command(body, "preparer", "cle-idempotence-1");
    expect(again.body.run.id).toBe(first.body.run.id);
    expect((await h.command({ ...body, period: { ...stPeriod, asOfDate: "2027-04-30" } }, "preparer", "cle-idempotence-1")).body.error).toBe("IDEMPOTENCY_KEY_REUSED");
  });
  it("conflit de version explicite, sans écrasement", async () => {
    const { run } = await h.frozen();
    const stale = await h.command({ command: "execute", id: run.id, expectedVersion: run.version - 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.current.version).toBe(run.version);
  });
  it("garde de recette : fermée sans le drapeau, toujours fermée en production ; codes HTTP", () => {
    expect(() => requireDisposableStocks({})).toThrow();
    expect(() => requireDisposableStocks({ PROBANT_STOCKS_DURABLE: "disposable", VERCEL_ENV: "production" })).toThrow();
    expect(() => requireDisposableStocks({ PROBANT_STOCKS_DURABLE: "disposable" })).not.toThrow();
    expect([stockFailureStatus("ST_SOURCE_REPLACED_REVISION_REQUIRED"), stockFailureStatus("ST_CITATION_REQUIRED"), stockFailureStatus("SELF_APPROVAL_FORBIDDEN"), stockFailureStatus("boom")]).toEqual([409, 422, 403, 503]);
  });
});
