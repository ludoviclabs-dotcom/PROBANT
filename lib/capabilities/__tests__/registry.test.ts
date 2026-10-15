import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { CAPABILITY_REGISTRY, ENGINE_PROCEDURES, STORE_FAMILIES, configuredProcedures } from "../registry";
import { readStoreHeads, scopedFamilyRuns } from "../store-readers";
import { capabilityReadModel } from "../read-model";
import { CL_CYCLES, CL_ENGINE_PROCEDURES, CL_FAMILIES } from "@/lib/workpapers/closing-contract";
import { AUDIT_CYCLES, DOCUMENT_TYPES } from "@/lib/rapprochement/catalog";
import { MODULE_MANIFEST } from "@/lib/workpapers/availability";
import { clientMissionFixture } from "@/lib/workpapers/__tests__/client-mission-fixture";

describe("C01 registre et adaptateurs de lecture", () => {
  it("preserves all 13 journal cycles, 17 engine procedures, 8 stores and 11 reconciliation configurations", () => {
    expect(CL_CYCLES).toHaveLength(13); expect(CL_ENGINE_PROCEDURES).toBe(ENGINE_PROCEDURES); expect(CL_FAMILIES).toBe(STORE_FAMILIES);
    expect(ENGINE_PROCEDURES).toHaveLength(17); expect(STORE_FAMILIES).toEqual(["clients", "cash", "fa", "eq", "fx", "st", "pv", "hr"]);
    expect(AUDIT_CYCLES).toHaveLength(11); expect(DOCUMENT_TYPES).toHaveLength(22);
    expect(new Set(ENGINE_PROCEDURES.map(p => p.id)).size).toBe(17);
    for (const c of CAPABILITY_REGISTRY) { expect(c.requiredSources.length).toBeGreaterThan(0); expect(c.exclusions.length).toBeGreaterThan(0); }
  });
  it("describes Stocks as implemented locally and absent only from the workshop", () => {
    const stocks = CAPABILITY_REGISTRY.find(c => c.id === "stocks")!;
    expect(stocks.modes.local_persistent.implemented).toBe(true); expect(stocks.modes.historical.implemented).toBe(true); expect(stocks.modes.scenario.implemented).toBe(false);
    expect(stocks.procedures.map(p => p.id)).toEqual(["stocks.count"]);
    expect(MODULE_MANIFEST.find(m => m.id === "outside-stocks")!.label).toBe("Stocks · atelier");
    expect(CAPABILITY_REGISTRY.find(c => c.id === "informatique")!.exclusions).toContain("Pas de moteur ITGC");
  });
  it("C08 : la capacité Stocks dit coûts déclarés et revue bornée, jamais un inventaire physique complet", () => {
    const stocks = CAPABILITY_REGISTRY.find(c => c.id === "stocks")!, text = [stocks.modes.local_persistent.scope, ...stocks.requiredSources, ...stocks.exclusions].join(" ");
    expect(stocks.modes.local_persistent.scope).toContain("Aucun inventaire physique certifié");
    expect(stocks.exclusions).toContain("Coûts CUMP / PEPS déclarés, non reconstitués depuis les transactions");
    expect(stocks.exclusions.some(e => e.includes("Aucune dépréciation ni provision automatique"))).toBe(true);
    expect(text).not.toMatch(/inventaire (physique )?(complet|exhaustif)|présence physique (certifiée|établie)/i);
    expect(capabilityReadModel({}).registryVersion).toBe("1.3.1");
  });
  it("C09 : Capitaux propres ont une seule entrée de cycle sur deux feuilles, sans conclusion juridique ni classement par compte", async () => {
    const equity = CAPABILITY_REGISTRY.find(c => c.id === "capitaux_propres")!;
    expect(equity.procedures.map(p => p.id)).toEqual(["capitaux_propres.review", "equity.review"]);
    expect(equity.modes.local_persistent.scope).toContain("/capitaux-propres/parcours");
    expect(equity.exclusions.join(" ")).toMatch(/sans double compte ni migration/);
    expect(equity.exclusions.join(" ")).toMatch(/jamais par numéro de compte/);
    expect(equity.exclusions.join(" ")).not.toMatch(/Deux procédures distinctes/);
    const { CYCLE_REGISTRY } = await import("@/lib/dossier/cycle-registry");
    const cycle = CYCLE_REGISTRY.find(c => c.id === "capitaux_propres")!;
    expect(cycle.sheet).toEqual({ label: "Parcours Capitaux propres", href: "/capitaux-propres/parcours" });
    expect(cycle.secondary).toEqual([]);
  });
  it("does not turn activated configuration into execution or authorization", () => {
    const env = { PROBANT_STOCKS_DURABLE: "disposable", DATABASE_URL: "configured" };
    expect(configuredProcedures(env)["stocks.count"]).toEqual({ activated: true, databaseConfigured: true });
    expect(capabilityReadModel(env)).toMatchObject({ observationStatus: "not_read", observations: [] });
    expect(configuredProcedures({ ...env, VERCEL_ENV: "production" })["stocks.count"].activated).toBe(false);
  });
  it("reads existing heads of all eight families using all three scope keys and without writes", async () => {
    const f = await clientMissionFixture(), queries: { sql: string; params: unknown[] }[] = [];
    const result = await readStoreHeads({ execute: async query => { const q = new PgDialect().sqlToQuery(query); queries.push(q); return queries.length === 1 ? [{ run: f.locked }] : []; } }, f.scope);
    expect(result).toEqual([{ family: "clients", run: f.locked }]); expect(queries).toHaveLength(8);
    for (const [i, q] of queries.entries()) { expect(q.sql).toContain(STORE_FAMILIES[i] + "_workpaper_heads"); expect(q.sql).toContain(STORE_FAMILIES[i] + "_workpaper_versions"); expect(q.params).toEqual([f.scope.organizationId, f.scope.dossierId, f.scope.periodId]); expect(q.sql).not.toMatch(/INSERT|UPDATE|DELETE/); }
  });
  it("fails closed when a row belongs to another dossier, organization, period or family", async () => {
    const f = await clientMissionFixture();
    for (const key of ["organizationId", "dossierId", "periodId"] as const) expect(() => scopedFamilyRuns(f.scope, [{ family: "clients", run: { ...f.locked, scope: { ...f.scope, [key]: "different" } } }])).toThrow(/SCOPE_MISMATCH/);
    expect(() => scopedFamilyRuns(f.scope, [{ family: "st", run: f.locked }])).toThrow(/PROCEDURE_MISMATCH/);
  });
  it("keeps execution, outcome and review distinct and observes only current heads", async () => {
    const f = await clientMissionFixture();
    const read = capabilityReadModel({}, { scope: f.scope, rows: [{ family: "clients", run: f.locked }], procedures: ["clients.frame"] });
    expect(read.observationStatus).toBe("read"); expect(read.observations[0]).toMatchObject({ state: "locked", runId: f.locked.id, version: 12, outcome: f.locked.result!.outcome, approval: { actorId: "actual-reviewer" } });
    expect(capabilityReadModel({}, { scope: f.scope, rows: [], procedures: ["clients.frame"] }).observations).toEqual([]);
  });
});
