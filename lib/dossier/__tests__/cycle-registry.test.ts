import { describe, expect, it } from "vitest";
import { buildDemoDossierSnapshot } from "../snapshot-builder";
import { CYCLE_REGISTRY, priorityCycle, projectCycleRows, projectSourceState, sortCycleRows } from "../cycle-registry";
import { CL_CYCLES, CL_ENGINE_PROCEDURES } from "@/lib/workpapers/closing-contract";
import { CAPABILITY_REGISTRY } from "@/lib/capabilities/registry";
import { appendDemoEvent, createDemoRecord, syntheticBaseline } from "@/lib/workpapers/browser-demo";
import { demoCycleSchema } from "@/lib/workpapers/demo-cycles";
import { appendReviewDecisionToSnapshot } from "../snapshot-state";
import { CLIENT_FRAME_TEMPLATE } from "@/lib/workpapers/clients-adapter";
import { periodId, type WorkpaperRun } from "@/lib/workpapers/model";

describe("registre des cycles — projection C02 des manifestes existants", () => {
  it("projette les 14 périmètres du registre (cycles du journal, dettes financières incluses depuis C13), et chaque procédure outillée est rattachée à son cycle", () => {
    expect(CYCLE_REGISTRY.map(e => e.id).sort()).toEqual([...CL_CYCLES].sort());
    expect(CYCLE_REGISTRY).toHaveLength(14);
    expect(CYCLE_REGISTRY).toHaveLength(CAPABILITY_REGISTRY.length);
    for (const p of CL_ENGINE_PROCEDURES) expect(CYCLE_REGISTRY.find(e => e.id === p.cycle)?.procedures).toContain(p.id);
  });
  it("rattache chaque scénario du laboratoire à exactement un cycle", () => {
    for (const id of demoCycleSchema.options) expect(CYCLE_REGISTRY.filter(e => e.workshop.includes(id))).toHaveLength(1);
  });
  it("dossier historique : les constats sont lus par silo, sans somme entre cycles, et l'action prioritaire est un arbitrage", () => {
    const snapshot = buildDemoDossierSnapshot();
    const rows = projectCycleRows(snapshot);
    const counted = rows.reduce((n, r) => n + (r.gaps.findings ? Object.values(r.gaps.findings).reduce((a, b) => a + b, 0) : 0), 0);
    const matched = snapshot.findings.filter(f => CYCLE_REGISTRY.some(e => e.silos.includes(f.siloId))).length;
    expect(counted).toBe(matched);
    expect(rows.every(r => r.gaps.exceptions === null)).toBe(true);
    const top = priorityCycle(rows)!;
    expect(["findings", "blocked", "review"]).toContain(top.status);
    expect(top.nextAction.href).toBeTruthy();
    const sources = projectSourceState(snapshot);
    expect(sources.synthetic).toBe(false);
    expect(sources.fecFingerprint).toBe(snapshot.dossier.fecFingerprint);
    expect(sources.workpapers.planned).toBe(0);
  });
  it("un constat bloquant fermé par la chaîne de revue ne compte plus comme ouvert (même règle que le moteur)", () => {
    const snapshot = buildDemoDossierSnapshot();
    const before = projectCycleRows(snapshot);
    const row = before.find(r => r.gaps.openBlocking > 0)!;
    const blocking = snapshot.findings.find(f => row.entry.silos.includes(f.siloId) && f.severity === "bloquant")!;
    const reviewed = appendReviewDecisionToSnapshot(snapshot, { id: "ev-1", findingId: blocking.id, actorId: "reviewer", actorRole: "reviewer", newStatus: "dismissed", comment: "Écarté après vérification", relatedEvidenceIds: [], createdAt: "2026-10-13T00:00:00.000Z" });
    const after = projectCycleRows(reviewed).find(r => r.entry.id === row.entry.id)!;
    expect(after.gaps.openBlocking).toBe(row.gaps.openBlocking - 1);
  });
  it("une feuille durable d'une procédure outillée (clients.frame) est rattachée à son cycle", () => {
    const base = syntheticBaseline("SYN-durable");
    const run: WorkpaperRun = { id: "frame-1", rootId: "frame-1", revision: 1, version: 2, schemaVersion: "1.0.0", scope: { organizationId: "SYNTHETIC-DEMO", dossierId: "SYN-durable", periodId: periodId(base.dossier.period!), mode: "demo" },
      period: base.dossier.period!, template: CLIENT_FRAME_TEMPLATE, state: "awaiting_review", preparedBy: "preparer", importIds: [], evidence: [], findings: [], notes: [], events: [] };
    const clients = projectCycleRows({ ...base, workpapers: { version: "1.0.0", runs: [run] } }).find(r => r.entry.id === "clients")!;
    expect(clients.status).toBe("review");
    expect(clients.runs.map(r => r.id)).toEqual(["frame-1"]);
  });
  it("dossier synthétique vide : aucun constat DEMO SA n'est repris, la prochaine action est un scénario", () => {
    const rows = projectCycleRows(syntheticBaseline("SYN-test"));
    expect(rows.every(r => r.gaps.findings === null)).toBe(true);
    const clients = rows.find(r => r.entry.id === "clients")!;
    expect(clients.status).toBe("available");
    expect(clients.nextAction).toMatchObject({ kind: "work", href: "/dashboard/tests" });
    expect(rows.find(r => r.entry.id === "informatique")!.status).toBe("absent");
  });
  it("feuille exécutée dans le laboratoire : état, exceptions et action viennent du résultat, puis la preuve une fois verrouillée", async () => {
    const parameters = { cycle: "clients" as const, scenario: "exception" as const, missingEvidence: false, methodAvailable: true };
    const created = await appendDemoEvent(createDemoRecord("SYN-test"), { action: "create", parameters });
    const executed = projectCycleRows(created.snapshot).find(r => r.entry.id === "clients")!;
    expect(executed.status).toBe("executed");
    expect(executed.gaps.exceptions).toBeGreaterThan(0);
    expect(executed.nextAction).toMatchObject({ kind: "work", label: "Soumettre à la revue" });
    expect(sortCycleRows(projectCycleRows(created.snapshot))[0].entry.id).toBe("clients");
    const submitted = await appendDemoEvent(created.record, { action: "submit", cycle: "clients", note: "Préparation" });
    expect(projectCycleRows(submitted.snapshot).find(r => r.entry.id === "clients")!.nextAction.kind).toBe("review");
    const approved = await appendDemoEvent(submitted.record, { action: "approve", cycle: "clients", note: "Revue" });
    const locked = await appendDemoEvent(approved.record, { action: "lock", cycle: "clients", note: "Verrouillage" });
    const proof = projectCycleRows(locked.snapshot).find(r => r.entry.id === "clients")!;
    expect(proof.status).toBe("locked");
    expect(proof.nextAction.href).toMatch(/^#wp-/);
    expect(projectSourceState(locked.snapshot).workpapers.locked).toBe(1);
  });
});
