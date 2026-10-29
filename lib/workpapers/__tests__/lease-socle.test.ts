import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { stableSha256 } from "@/lib/synthesis/canonical";
import { previewImport } from "../imports";
import { ClientsConflict } from "../clients-persistence";
import { LEASE_TEMPLATE, LeaseRegistry } from "../lease-adapter";
import { LEASE_ERROR_STATUS, leaseFailure, leaseHandlers, requireLeasesChain } from "../lease-http";
import { LeaseError, LeaseImportError, type LeaseRuntime } from "../lease-runtime";
import { assertLeaseBatch, LEASE_MAPPING, resolveLeaseCitation } from "../lease-sources";
import type { LeaseResult } from "../lease-review";
import { leaseDraftOf, leaseWorkDraftSchema, stampLeaseWork, type LeaseWorkDraft } from "../lease-work";
import { contentHash, periodId, validateRun, type WorkpaperRun, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import { freezePopulation, selectPopulation } from "../selection";
import { approvedLeaseBatches, leaseFile, LEASE_PERIOD, leaseRows } from "./lease-fixture";

/** IFRS C01 — socle de la feuille « Locations IFRS 16 » : travail, sources, modèle, incapacité explicite et table d'erreurs. */
const scope: WorkpaperScope = { organizationId: "org-l16", dossierId: "dossier-l16", periodId: periodId(LEASE_PERIOD), mode: "real" };
const actor: Principal = { id: "preparer-l16", grants: [{ scope, permissions: ["read", "prepare"] }] };
const framework = { standard: "IFRS 16" as const, jurisdiction: "IASB" as const, edition: "IFRS 16, IASB 2026", editionFingerprint: null };
const firstApplication = { kind: "not_applicable" as const, reason: "Aucune méthode de transition choisie par l'outil" };
const draft = (confirmations: LeaseWorkDraft["confirmations"] = []): LeaseWorkDraft => ({ framework, firstApplication, policies: [{ kind: "short_term_exemption", assetCategory: "Matériel de bureau", answer: { kind: "value", value: "not_elected" } }], confirmations });
const leaseRun = (over: Partial<WorkpaperRun> = {}): WorkpaperRun => ({ id: "workpaper-l16", rootId: "workpaper-l16", revision: 1, version: 1, schemaVersion: "1.0.0", scope, period: LEASE_PERIOD, template: LEASE_TEMPLATE,
  state: "draft", preparedBy: actor.id, importIds: [], evidence: [], findings: [], notes: [], events: [], ...over });

describe("IFRS C01 travail de la feuille : vide ≠ zéro ≠ non applicable", () => {
  const ref = { documentVersionId: "doc", rowId: "row" };
  it("une valeur vide est refusée ; « 0.00 » reste une valeur ; inconnu et non applicable gardent leur motif ; le champ et sa forme viennent du dictionnaire", () => {
    const answers = (answer: unknown, field = "initialDirectCosts") => leaseWorkDraftSchema.safeParse(draft([{ contractId: "F01", field, answer, citation: ref } as never])).success;
    expect(answers({ kind: "value", value: "" })).toBe(false);
    expect(answers({ kind: "value", value: "   " })).toBe(false);
    expect(answers({ kind: "value", value: "0.00" })).toBe(true);
    expect(answers({ kind: "value", value: "0" })).toBe(false);
    expect(answers({ kind: "value", value: "inconnu" })).toBe(false);
    expect(answers({ kind: "value", value: "none" }, "residualValueGuarantee")).toBe(true);
    expect(answers({ kind: "value", value: "peut-être" }, "residualValueGuarantee")).toBe(false);
    expect(answers({ kind: "value", value: "3" }, "champInconnu")).toBe(false);
    expect(answers({ kind: "unknown", reason: "Clause non transmise" })).toBe(true);
    expect(answers({ kind: "not_applicable", reason: "Aucune garantie dans le contrat" })).toBe(true);
    expect(answers({ kind: "unknown", reason: "" })).toBe(false);
    expect(answers({ kind: "value", value: 0 })).toBe(false);
    expect(answers(null)).toBe(false);
  });
  it("refuse une juridiction hors liste, une confirmation ou une politique en double, un rôle ou un auteur fourni par le navigateur", () => {
    expect(leaseWorkDraftSchema.safeParse({ ...draft(), framework: { ...framework, jurisdiction: "FR" } }).success).toBe(false);
    const c = { contractId: "F01", field: "termMonths", answer: { kind: "value" as const, value: "3" }, citation: ref };
    expect(leaseWorkDraftSchema.safeParse(draft([c, c])).success).toBe(false);
    expect(leaseWorkDraftSchema.safeParse({ ...draft(), policies: [...draft().policies, ...draft().policies] }).success).toBe(false);
    expect(leaseWorkDraftSchema.safeParse({ ...draft(), authorId: "navigateur" }).success).toBe(false);
    expect(leaseWorkDraftSchema.safeParse({ ...draft(), role: "reviewer" }).success).toBe(false);
    expect(leaseWorkDraftSchema.safeParse({ ...draft(), policies: [{ kind: "short_term_exemption", assetCategory: "Matériel de bureau", answer: { kind: "value", value: "non retenue" } }] }).success).toBe(false);
  });
  it("le serveur horodate, nomme l'auteur et résout chaque citation ; une citation non résolue refuse tout le travail", () => {
    const c = { contractId: "F01", field: "termMonths", answer: { kind: "value" as const, value: "3" }, citation: ref };
    const citation = { documentVersionId: "doc", importId: "imp", fileName: "contrats.csv", sha256: "a".repeat(64), rowId: "row", row: 2 };
    const work = stampLeaseWork(draft([c]), () => citation, actor.id, "2027-02-01T10:00:00.000Z");
    expect(work).toMatchObject({ schemaVersion: "ifrs16-leases-1", authorId: actor.id, authoredAt: "2027-02-01T10:00:00.000Z", confirmations: [{ citation }] });
    expect(leaseDraftOf(work)).toEqual(draft([c]));
    expect(() => stampLeaseWork(draft([c]), () => { throw new Error("L16_CITATION_INVALID"); }, actor.id, "2027-02-01T10:00:00.000Z")).toThrow("L16_CITATION_INVALID");
  });
});

describe("IFRS C01 sources Locations sur le store « Clients »", () => {
  it("les cinq types passent la porte d'import réelle et la validation de source", async () => {
    const batches = await approvedLeaseBatches(scope, actor);
    expect(batches.map(b => b.document.documentType).sort()).toEqual(["lease_assumptions", "lease_contracts", "lease_ledger", "lease_schedule"]);
    for (const b of batches) expect(() => assertLeaseBatch(b, LEASE_PERIOD)).not.toThrow();
  });
  it("la porte refuse un autre mapping ou un type hors liste, même pour l'adaptateur Locations", async () => {
    const file = leaseFile("lease_contracts", leaseRows().lease_contracts);
    await expect(previewImport(file, scope, { ...LEASE_MAPPING, version: "loans-review-1" }, actor, "lease_contracts", "ifrs16.leases")).rejects.toThrow("REAL_IMPORT_STORAGE_DISABLED");
    await expect(previewImport(file, scope, LEASE_MAPPING, actor, "loan_contracts", "ifrs16.leases")).rejects.toThrow("REAL_IMPORT_STORAGE_DISABLED");
    await expect(previewImport(file, scope, LEASE_MAPPING, actor, "lease_contracts", "loans.review")).rejects.toThrow("REAL_IMPORT_STORAGE_DISABLED");
  });
  it("refuse un contrat en double, un identifiant discordant, une pièce postérieure à la revue, un champ vide ou numérique, une hypothèse sans contrat", async () => {
    const check = async (edit: Parameters<typeof approvedLeaseBatches>[2], type: string) => {
      const batch = (await approvedLeaseBatches(scope, actor, edit)).find(b => b.document.documentType === type)!;
      return () => assertLeaseBatch(batch, LEASE_PERIOD);
    };
    expect(await check(r => { r.lease_contracts.push({ ...r.lease_contracts[0] }); }, "lease_contracts")).toThrow("L16_DUPLICATE_CONTRACT");
    expect(await check(r => { r.lease_contracts[0].details = { ...r.lease_contracts[0].details, contractId: "F99" }; }, "lease_contracts")).toThrow("L16_CONTRACT_INVALID");
    expect(await check(r => { r.lease_contracts[0].amount = "-1.00"; }, "lease_contracts")).toThrow("L16_CONTRACT_INVALID");
    expect(await check(r => { (r.lease_assumptions[0].details.source as { date: string }).date = "2027-03-01"; }, "lease_assumptions")).toThrow("L16_IMPORT_SCHEMA_INVALID");
    expect(await check(r => { r.lease_assumptions[0].details = { ...r.lease_assumptions[0].details, fields: { annualEffectiveRate: "" } }; }, "lease_assumptions")).toThrow("L16_IMPORT_SCHEMA_INVALID");
    expect(await check(r => { r.lease_assumptions[0].details = { ...r.lease_assumptions[0].details, fields: { annualEffectiveRate: 0.05 } }; }, "lease_assumptions")).toThrow("L16_IMPORT_SCHEMA_INVALID");
    expect(await check(r => { delete r.lease_schedule[0].details.contractId; }, "lease_schedule")).toThrow("L16_IMPORT_SCHEMA_INVALID");
    expect(await check(r => { r.lease_schedule[0].details = { ...r.lease_schedule[0].details, extra: "inconnu" }; }, "lease_schedule")).toThrow("L16_IMPORT_SCHEMA_INVALID");
  });
  it("population « un contrat » par ligne du registre des contrats ; un second registre est refusé ; citation limitée aux sources admises", async () => {
    const batches = await approvedLeaseBatches(scope, actor), population = freezePopulation(scope, batches, "lease_contract", actor, LEASE_PERIOD);
    expect(population.unit).toBe("lease_contract");
    expect(population.items.map(i => [i.id, i.amount.amount])).toEqual([["F01", "3000.00"], ["F03", "36000.00"]]);
    const contracts = batches.find(b => b.document.documentType === "lease_contracts")!;
    expect(() => freezePopulation(scope, [...batches, { ...contracts, id: contracts.id + "-bis" }], "lease_contract", actor, LEASE_PERIOD)).toThrow("L16_POPULATION_MAPPING_INVALID");
    const row = contracts.rows[0], ids = batches.map(b => b.id);
    expect(resolveLeaseCitation(batches, ids, { documentVersionId: contracts.document.id, rowId: row.id })).toMatchObject({ importId: contracts.id, fileName: contracts.document.fileName, sha256: contracts.document.byteHash, rowId: row.id, row: 2 });
    expect(() => resolveLeaseCitation(batches, ids.filter(i => i !== contracts.id), { documentVersionId: contracts.document.id, rowId: row.id })).toThrow("L16_CITATION_INVALID");
    expect(() => resolveLeaseCitation(batches.map(b => ({ ...b, approval: undefined })), ids, { documentVersionId: contracts.document.id, rowId: row.id })).toThrow("L16_CITATION_INVALID");
    expect(() => resolveLeaseCitation(batches, ids, { documentVersionId: contracts.document.id, rowId: "absente" })).toThrow("L16_CITATION_INVALID");
  });
});

describe("IFRS C01 modèle de feuille", () => {
  const work = stampLeaseWork(draft(), () => { throw new Error("unused"); }, actor.id, "2027-02-01T10:00:00.000Z");
  it("un travail Locations n'appartient qu'à ifrs16.leases, et une feuille IFRS ne porte aucun travail de cycle", () => {
    expect(validateRun(leaseRun({ leaseWork: work })).leaseWork).toEqual(work);
    expect(() => validateRun(leaseRun({ template: { ...LEASE_TEMPLATE, id: "loans.review" }, leaseWork: work }))).toThrow("L16_WORK_INVALID");
    expect(() => validateRun(leaseRun({ leaseWork: { ...work, authorId: "" } }))).toThrow("L16_WORK_INVALID");
    expect(() => validateRun(leaseRun({ loanWork: { schemaVersion: "loans-review-1", authorId: "x", authoredAt: "2028-01-01T00:00:00.000Z" } as never }))).toThrow(/WORK_INVALID/);
  });
  it("le travail entre dans l'empreinte de contenu", () => {
    expect(contentHash(leaseRun({ leaseWork: work }))).not.toBe(contentHash(leaseRun()));
    expect(contentHash(leaseRun({ leaseWork: work }))).not.toBe(contentHash(leaseRun({ leaseWork: { ...work, policies: [] } })));
  });
  it("la règle du gabarit reste interne et à revoir tant que la relecture nommée n'est pas consignée : aucune exécution réelle", () => {
    expect(LEASE_TEMPLATE.rule).toMatchObject({ id: "ifrs16.leases", version: "1.0.0", authority: "internal", validation: "provisional", source: "docs/ifrs/CONTRAT_COMMUN.md" });
    expect(LEASE_TEMPLATE.requiredDocumentTypes).toEqual(["lease_contracts", "lease_assumptions", "lease_schedule"]);
  });
});

describe("L16-02 adaptateur : moteur en scénario, exécution réelle bloquée tant que la règle n'est pas validée", () => {
  const request = async (s: WorkpaperScope = scope, jurisdiction: "IASB" | "EU_adopted" = "IASB") => {
    const a: Principal = { id: actor.id, grants: [{ scope: s, permissions: ["read", "prepare"] }] };
    const batches = await approvedLeaseBatches(s, a), population = freezePopulation(s, batches, "lease_contract", a, LEASE_PERIOD);
    const selection = selectPopulation(population, { method: "targeted", criteria: "Tous les contrats", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, a);
    const work = stampLeaseWork({ ...draft(), framework: { ...framework, jurisdiction } }, () => { throw new Error("unused"); }, a.id, "2027-02-01T10:00:00.000Z");
    return { scope: s, period: LEASE_PERIOD, rule: { id: "ifrs16.leases", version: "1.0.0" }, imports: batches, population, selection, parameters: { runId: "workpaper-l16", work } };
  };
  it("réel : la règle à revoir bloque l'exécution (rule_not_applicable), sans résultat ni montant", async () => {
    const r = new LeaseRegistry().execute(await request());
    expect(r).toMatchObject({ execution: "blocked", outcome: "inconclusive", calculationKey: "ifrs16.leases", ruleVersion: "1.0.0", result: null, findings: [] });
    expect(r.blockedControls).toContain("rule_not_applicable");
    expect(r.sourceRefs).toHaveLength(4); expect(r.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("scénario : le moteur calcule F01 et F03 aux montants de l'oracle, déterministe, résultat non concluant tant que le cadrage PCG manque", async () => {
    const demo = { ...scope, mode: "demo" as const }, r = new LeaseRegistry().execute(await request(demo));
    expect(r).toMatchObject({ execution: "completed", outcome: "inconclusive" });
    const result = r.result as LeaseResult;
    expect(result.contracts.map(c => [c.contractId, c.status, c.result])).toEqual([["F01", "eligible_v1", "computed"], ["F03", "eligible_v1", "computed"]]);
    const f03 = result.contracts.find(c => c.contractId === "F03")!;
    expect(f03.closing).toMatchObject({ debtClosing: { amount: "22819.76" }, interest: { amount: "1398.49" }, depreciation: { amount: "11140.42" }, rouNetClosing: { amount: "22280.85" } });
    expect(result.portfolio.computedSubtotal).toMatchObject({ label: "contrats calculés", contracts: 2 });
    expect(result.limitations[0]).toMatch(/L16-03/);
    expect(result.evidence.every(e => e.procedureId === "workpaper-l16" && e.status === "verified")).toBe(true);
    expect(stableSha256(new LeaseRegistry().execute(await request(demo)))).toBe(stableSha256(r));
  });
  it("X33 : EU_adopted ajoute son propre motif en réel, pas en scénario ; une autre procédure ou unité est refusée", async () => {
    expect(new LeaseRegistry().execute(await request(scope, "EU_adopted")).blockedControls).toEqual(expect.arrayContaining([expect.stringContaining("X33")]));
    const demo = { ...scope, mode: "demo" as const };
    expect(new LeaseRegistry().execute(await request(demo, "EU_adopted"))).toMatchObject({ execution: "completed" });
    const base = await request();
    expect(() => new LeaseRegistry().execute({ ...base, rule: { id: "loans.review", version: "1.0.0" } })).toThrow("L16_ADAPTER_INVALID");
    expect(() => new LeaseRegistry().execute({ ...base, population: { ...base.population, unit: "row" } })).toThrow("L16_ADAPTER_INVALID");
  });
});

describe("IFRS C01 table explicite des erreurs HTTP (D21)", () => {
  const body = async (r: Response) => ({ status: r.status, json: await r.json() });
  it("reprend code par code la table du contrat commun C00 § 8", () => {
    const doc = readFileSync(resolve(__dirname, "../../../docs/ifrs/CONTRAT_COMMUN.md"), "utf8");
    const section = doc.slice(doc.indexOf("| Famille | Statut | Codes |"), doc.indexOf("## 9."));
    const rows = section.split("\n").filter(l => /^\| [^|-]/.test(l) && !l.startsWith("| Famille")).map(l => l.split("|").map(x => x.trim()));
    let checked = 0;
    for (const [, , status, codes] of rows) for (const code of codes.match(/`[A-Z0-9_]+`/g) ?? []) { expect(LEASE_ERROR_STATUS[code.slice(1, -1)], code).toBe(Number(status)); checked++; }
    expect(checked).toBe(42);
  });
  it("chaque code de la table sort avec son statut ; un code inconnu ou une exception sort en 503 technique", async () => {
    for (const [code, status] of Object.entries(LEASE_ERROR_STATUS)) expect(await body(leaseFailure(new Error(code))), code).toEqual({ status, json: { error: code } });
    expect(await body(leaseFailure(new Error("BUG_INATTENDU")))).toEqual({ status: 503, json: { error: "L16_DURABLE_UNAVAILABLE" } });
    expect(await body(leaseFailure("chaîne"))).toEqual({ status: 503, json: { error: "L16_DURABLE_UNAVAILABLE" } });
    expect(await body(leaseFailure(new z.ZodError([])))).toEqual({ status: 400, json: { error: "L16_REQUEST_INVALID" } });
    expect(await body(leaseFailure(new SyntaxError("json")))).toEqual({ status: 400, json: { error: "L16_REQUEST_INVALID" } });
    expect(await body(leaseFailure(new ApiError("CLIENT_STATE_LIMIT", "État trop volumineux.", 413)))).toEqual({ status: 413, json: { error: "CLIENT_STATE_LIMIT" } });
    expect(await body(leaseFailure(new LeaseImportError("CSV_UNCLOSED_QUOTE")))).toEqual({ status: 422, json: { error: "CSV_UNCLOSED_QUOTE" } });
    expect(await body(leaseFailure(new LeaseError("L16_CURRENT_SOURCES_REQUIRED", ["lease_schedule"])))).toEqual({ status: 422, json: { error: "L16_CURRENT_SOURCES_REQUIRED", missing: ["lease_schedule"] } });
    const current = leaseRun({ version: 4 });
    expect(await body(leaseFailure(new ClientsConflict(current, 3)))).toEqual({ status: 409, json: { error: "STALE_WORKPAPER_VERSION", current: JSON.parse(JSON.stringify(current)), expectedVersion: 3 } });
  });
  it("aucun code levé par la chaîne Locations ne retombe en 503 par défaut : il est dans la table ou classé technique", () => {
    // Invariants internes : leur échec signale un défaut du code, jamais une action de l'utilisateur.
    const TECHNICAL = ["L16_DIVISION_BY_ZERO", "L16_ROOT_INVALID", "L16_INTEGER_INVALID", "L16_FIXED_INVALID", "INVALID_EUR_MONEY", "L16_ADAPTER_INVALID",
      "L16_SCHEDULE_RESIDUAL", "L16_ROUNDING_GAP_EXCEEDED", "L16_DEPRECIATION_INVALID",
      "BLOCKED_RESULT_REQUIRED", "COMPLETED_RESULT_REQUIRED", "FAILED_RESULT_REQUIRED", "CLIENT_REAL_SCOPE_REQUIRED", "CLIENT_TEMPLATE_REQUIRED", "WORKPAPER_VERSION_INVALID", "REVISION_INVALID",
      "SOURCE_BYTES_CHANGED", "CLIENT_PROJECTION_OUT_OF_SCOPE"];
    const root = resolve(__dirname, "../../.."), files: string[] = [];
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) { if (name !== "__tests__") walk(p); } else if (p.endsWith(".ts")) files.push(p); } };
    walk(join(root, "lib/ifrs"));
    files.push(...readdirSync(join(root, "lib/workpapers")).filter(n => /^lease-.*\.ts$/.test(n)).map(n => join(root, "lib/workpapers", n)));
    files.push(...["policy.ts", "clients-persistence.ts"].map(n => join(root, "lib/workpapers", n)));
    const codes = new Set(files.flatMap(f => [...readFileSync(f, "utf8").matchAll(/(?<!Api)Error\(\s*["']([A-Z][A-Z0-9_]+)["']/g)].map(m => m[1])));
    expect(codes.size).toBeGreaterThan(30);
    for (const code of codes) expect(code in LEASE_ERROR_STATUS || TECHNICAL.includes(code), code).toBe(true);
  });
  it("chaîne fermée par défaut, en production et pour un profil personnel non marqué ; ouverte en recette jetable", async () => {
    for (const env of [{}, { PROBANT_IFRS16_DURABLE: "true" }, { PROBANT_IFRS16_DURABLE: "disposable", VERCEL_ENV: "production" }, { PROBANT_RUNTIME_PROFILE: "personal", PROBANT_IFRS16_DURABLE: "disposable" }, { PROBANT_LOANS_DURABLE: "disposable" }])
      expect(() => requireLeasesChain(env), JSON.stringify(env)).toThrow(ApiError);
    expect(() => requireLeasesChain({ PROBANT_IFRS16_DURABLE: "disposable" })).not.toThrow();
    const never = () => { throw new Error("runtime must not be created"); };
    const closed = leaseHandlers(never as () => LeaseRuntime, () => requireLeasesChain({}));
    for (const handler of [closed.GET, closed.POST, closed.importsPOST]) expect(await body(await handler(new Request("https://probant.example.test/api/workpapers/locations-ifrs16?dossierId=x&periodId=y", { method: "POST", body: "{}" })))).toEqual({ status: 503, json: { error: "L16_DURABLE_DISABLED" } });
    const open = leaseHandlers(never as () => LeaseRuntime, () => {});
    expect(await body(await open.GET(new Request("https://probant.example.test/api/workpapers/locations-ifrs16?dossierId=pas-un-uuid&periodId=p")))).toEqual({ status: 400, json: { error: "L16_QUERY_INVALID" } });
    expect(await body(await open.GET(new Request("https://probant.example.test/api/workpapers/locations-ifrs16?dossierId=11111111-1111-4111-8111-111111111111&periodId=p&periodId=q")))).toEqual({ status: 400, json: { error: "L16_QUERY_INVALID" } });
  });
});
