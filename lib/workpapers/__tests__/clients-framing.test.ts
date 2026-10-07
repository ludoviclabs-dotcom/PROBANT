import { describe, expect, it } from "vitest";
import { frameClients, clientReceivables } from "../clients";
import { previewImport } from "../imports";
import { CLIENT_FRAME_RULE, ClientsFramingRegistry } from "../clients-adapter";
import { freezePopulation, selectPopulation } from "../selection";
import { periodId } from "../model";
import { clientsCommandSchema } from "../clients-commands";
import { requireDisposableClients } from "../clients-http";
import type { Principal } from "../policy";
import { period, mapping, csv } from "./clients-framing-fixtures";
describe("adaptateur validé limité au cadrage Clients", () => {
    it("garde les résidus bruts malgré un écart net nul et bloque les autres règles", async () => {
        const scope = { organizationId: "org", dossierId: "dossier", periodId: periodId(period), mode: "real" as const };
        const actor: Principal = { id: "server-preparer", grants: [{ scope, permissions: ["read", "prepare"] }] };
        const imports = await Promise.all(["clients_general", "clients_auxiliary", "clients_aged"].map(async (type) => {
            const b = await previewImport(new File([csv(type)], type + ".csv", { type: "text/csv" }), scope, mapping, actor, type, "clients.frame");
            return { ...b, approval: { actorId: actor.id, at: "2025-02-01T00:00:00Z", previewHash: b.previewHash }, report: { ...b.report, calculationAllowed: true } };
        }));
        const population = freezePopulation(scope, imports, "row", actor);
        const selection = selectPopulation(population, { method: "targeted", criteria: "Toutes les lignes", exclusions: [], requestedSize: population.items.length, selectedIds: population.items.map(i => i.id) }, actor);
        const request = { scope, period, rule: CLIENT_FRAME_RULE, imports, population, selection, parameters: {} };
        const result = new ClientsFramingRegistry().execute(request);
        expect(result.execution).toBe("completed");
        expect(result.outcome).toBe("exceptions_detected");
        expect(result.result).toMatchObject({ auxiliaryToAged: { net: { kind: "known", value: { amount: "0.00" } }, gross: { kind: "known", value: { amount: "20.00" } } } });
        expect(new ClientsFramingRegistry().execute({ ...request, rule: { id: "synthetic.sum", version: "1.0.0" } }).execution).toBe("blocked");
        expect(new ClientsFramingRegistry().execute({ ...request, parameters: { approval: true, role: "reviewer" } }).execution).toBe("blocked");
        const subset = selectPopulation(population, { method: "targeted", criteria: "Partiel", exclusions: [], requestedSize: 1, selectedIds: [population.items[0].id] }, actor);
        expect(new ClientsFramingRegistry().execute({ ...request, selection: subset }).execution).toBe("failed");
    });
    it("ne débloque ni dépréciation, ni calcul de créances complet", () => {
        const context = { scope: { organizationId: "org", dossierId: "dossier", periodId: periodId(period), mode: "real" as const }, period, purpose: "real" as const, procedure: "clients.frame" as const };
        expect(() => clientReceivables({ context, invoices: [], payments: [], allocations: [], credits: [] })).toThrow("REAL_CYCLE_DISABLED");
        expect(() => frameClients(context, [], [], [], [{ kind: "FAE", booked: [], detail: [] }])).toThrow("CLIENT_ADJUSTMENTS_OUT_OF_SCOPE");
    });
    it("refuse l’autorité et les objets complets envoyés par le navigateur", () => {
        expect(clientsCommandSchema.safeParse({ command: "create", period, instanceKey: "pilot", role: "reviewer", approval: true }).success).toBe(false);
        expect(clientsCommandSchema.safeParse({ command: "freeze", id: "run", expectedVersion: 1, importIds: ["a", "b", "c"], selection: { validatedBy: "fake" } }).success).toBe(false);
        expect(clientsCommandSchema.safeParse({ command: "review", id: "run", expectedVersion: 1, decision: "approved", text: "oui", submittedHash: "a".repeat(64), actorId: "fake" }).success).toBe(false);
    });
    it("reste fermé par défaut et en production, même avec le flag de recette", () => {
        expect(() => requireDisposableClients({})).toThrow();
        expect(() => requireDisposableClients({ PROBANT_CLIENTS_DURABLE: "disposable", VERCEL_ENV: "production" })).toThrow();
        expect(() => requireDisposableClients({ PROBANT_CLIENTS_DURABLE: "disposable", VERCEL_ENV: "preview" })).not.toThrow();
    });
});
