import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { CAPABILITY_FRAMEWORKS, CAPABILITY_REGISTRY, ENGINE_PROCEDURES, FRAMEWORK_PROCEDURES, PROCEDURE_ACTIVATION, STORE_FAMILIES, configuredProcedures } from "../registry";
import { readStoreHeads, scopedFamilyRuns } from "../store-readers";
import { capabilityReadModel } from "../read-model";
import { CL_CYCLES, CL_ENGINE_PROCEDURES, CL_FAMILIES } from "@/lib/workpapers/closing-contract";
import { AUDIT_CYCLES, DOCUMENT_TYPES } from "@/lib/rapprochement/catalog";
import { MODULE_MANIFEST } from "@/lib/workpapers/availability";
import { clientMissionFixture } from "@/lib/workpapers/__tests__/client-mission-fixture";
import { observeRuns, sheetLineages } from "@/lib/workpapers/closing-cycles";
import { LEASE_TEMPLATE } from "@/lib/workpapers/lease-adapter";
import type { WorkpaperRun } from "@/lib/workpapers/model";

describe("C01 registre et adaptateurs de lecture", () => {
  it("preserves the journal cycles (14 since C13), 18 engine procedures, 8 stores and 11 reconciliation configurations", () => {
    expect(CL_CYCLES).toHaveLength(14); expect(CL_ENGINE_PROCEDURES).toBe(ENGINE_PROCEDURES); expect(CL_FAMILIES).toBe(STORE_FAMILIES);
    expect(ENGINE_PROCEDURES).toHaveLength(18); expect(STORE_FAMILIES).toEqual(["clients", "cash", "fa", "eq", "fx", "st", "pv", "hr"]);
    expect(AUDIT_CYCLES).toHaveLength(11); expect(DOCUMENT_TYPES).toHaveLength(22);
    expect(new Set(ENGINE_PROCEDURES.map(p => p.id)).size).toBe(18);
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
    expect(capabilityReadModel({}).registryVersion).toBe("1.5.2");
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
  it("C13 : Dettes financières est un cycle du journal avec sa feuille /emprunts, sans conformité de financement ni taux par défaut", async () => {
    const debts = CAPABILITY_REGISTRY.find(c => c.id === "dettes_financieres")!;
    expect(CL_CYCLES).toContain("dettes_financieres");
    expect(debts.procedures.map(p => p.id)).toEqual(["loans.review"]);
    expect(debts.routes).toEqual(["/emprunts"]);
    expect(debts.reconciliation?.id).toBe("dettes-financieres");
    expect(debts.modes).toMatchObject({ historical: { implemented: true }, scenario: { implemented: false }, local_persistent: { implemented: true } });
    expect(debts.modes.local_persistent.scope).toContain("/emprunts");
    expect(debts.exclusions.join(" ")).toMatch(/Aucun taux ni convention par défaut ; aucun ratio de covenant calculé ni conformité de financement déduite/);
    expect(configuredProcedures({ PROBANT_LOANS_DURABLE: "disposable" })["loans.review"].activated).toBe(true);
    expect(configuredProcedures({ PROBANT_LOANS_DURABLE: "disposable", VERCEL_ENV: "production" })["loans.review"].activated).toBe(false);
    const { CYCLE_REGISTRY } = await import("@/lib/dossier/cycle-registry");
    expect(CYCLE_REGISTRY.find(c => c.id === "dettes_financieres")!.sheet).toEqual({ label: "Feuille Emprunts", href: "/emprunts" });
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

describe("IFRS C01 axe « référentiel », hors cycles du journal", () => {
  const leaseRun = (f: Awaited<ReturnType<typeof clientMissionFixture>>): WorkpaperRun => ({ id: "workpaper-ifrs16", rootId: "workpaper-ifrs16", revision: 1, version: 1, schemaVersion: "1.0.0", scope: f.scope, period: f.locked.period,
    template: LEASE_TEMPLATE, state: "draft", preparedBy: "actual-preparer", importIds: [], evidence: [], findings: [], notes: [], events: [] });
  it("ajoute ifrs16.leases sur son axe, sans toucher aux 14 cycles ni aux 18 procédures de cycle", () => {
    expect(FRAMEWORK_PROCEDURES.map(p => p.id)).toEqual(["ifrs16.leases"]);
    expect(ENGINE_PROCEDURES.some(p => (p.id as string) === "ifrs16.leases")).toBe(false);
    expect(CAPABILITY_REGISTRY.some(c => c.procedures.some(p => (p.id as string) === "ifrs16.leases") || c.routes.includes("/ifrs/locations"))).toBe(false);
    expect(CL_ENGINE_PROCEDURES.some(p => (p.id as string) === "ifrs16.leases")).toBe(false);
  });
  it("dit ce qui existe : page et scénario synthétique, persistance locale non annoncée tant que la règle n'est pas validée, jamais « IFRS complet »", () => {
    const [leases] = CAPABILITY_FRAMEWORKS;
    expect(leases).toMatchObject({ id: "ifrs16.leases", family: "clients", route: "/ifrs/locations", pageAvailable: true });
    expect(leases.modes).toMatchObject({ historical: { implemented: false }, scenario: { implemented: true }, local_persistent: { implemented: false } });
    expect(leases.modes.local_persistent.scope).toContain("exécution réelle bloquée tant que la fiche de règle n'a pas reçu sa relecture personnelle nommée");
    expect(leases.modes.local_persistent.scope).toContain("page /ifrs/locations");
    expect(leases.modes.local_persistent.scope).toContain("sans annexe exhaustive ni effet fiscal");
    expect([leases.modes.local_persistent.scope, ...leases.exclusions].join(" ")).not.toMatch(/IFRS complet(?! ?,)|conformité IFRS/);
    expect(leases.exclusions.join(" ")).toMatch(/X33/);
  });
  it("s'active par PROBANT_IFRS16_DURABLE, refusé sur Vercel production, et la configuration ne vaut pas exécution", () => {
    expect(PROCEDURE_ACTIVATION["ifrs16.leases"]).toBe("PROBANT_IFRS16_DURABLE");
    expect(configuredProcedures({})["ifrs16.leases"]).toEqual({ activated: false, databaseConfigured: false });
    expect(configuredProcedures({ PROBANT_IFRS16_DURABLE: "disposable", DATABASE_URL: "configured" })["ifrs16.leases"]).toEqual({ activated: true, databaseConfigured: true });
    expect(configuredProcedures({ PROBANT_IFRS16_DURABLE: "disposable", VERCEL_ENV: "production" })["ifrs16.leases"].activated).toBe(false);
    expect(configuredProcedures({ PROBANT_LOANS_DURABLE: "disposable" })["ifrs16.leases"].activated).toBe(false);
  });
  it("le store « clients » accepte une feuille ifrs16.leases ; une autre famille la refuse", async () => {
    const f = await clientMissionFixture(), run = leaseRun(f);
    expect(scopedFamilyRuns(f.scope, [{ family: "clients", run: f.locked }, { family: "clients", run }])).toHaveLength(2);
    expect(() => scopedFamilyRuns(f.scope, [{ family: "fa", run }])).toThrow(/PROCEDURE_MISMATCH/);
    expect(() => scopedFamilyRuns(f.scope, [{ family: "clients", run: { ...run, template: { ...run.template, id: "ifrs99.unknown" } } }])).toThrow(/PROCEDURE_MISMATCH/);
  });
  it("le dossier de clôture et la lecture des capacités se lisent à l'identique avec une feuille ifrs16.leases présente", async () => {
    const f = await clientMissionFixture(), run = leaseRun(f), without = [{ family: "clients" as const, run: f.locked }], withLease = [...without, { family: "clients" as const, run }];
    expect(sheetLineages(observeRuns(withLease))).toEqual(sheetLineages(observeRuns(without)));
    expect(observeRuns(withLease).filter(o => o.procedure !== "ifrs16.leases")).toEqual(observeRuns(without));
    expect(capabilityReadModel({}, { scope: f.scope, rows: withLease, procedures: ["clients.frame"] })).toEqual(capabilityReadModel({}, { scope: f.scope, rows: without, procedures: ["clients.frame"] }));
  });
});
