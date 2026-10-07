import { z } from "zod";
import { CalculationRegistry, type CalculationRequest } from "./calculations";
import { frameClients } from "./clients";
import { knownAmountSchema, moneySchema, type ProcedureTemplate, type RuleReference } from "./model";
import { cents } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import type { BalanceLine } from "./cycle-review";
import type { ImportBatch } from "./imports";
export const CLIENT_TYPES = ["clients_general", "clients_auxiliary", "clients_aged"] as const;
export const CLIENT_FRAME_RULE: RuleReference = { id: "clients.frame", version: "1.0.0", authority: "internal",
    source: "docs/mission05/CLIENTS_FRAME_CONTRACT.md", effectiveFrom: "2000-01-01", validation: "validated" };
export const CLIENT_FRAME_TEMPLATE: ProcedureTemplate = { id: "clients.frame", version: "1.0.0",
    objective: "Cadrage Clients — GL / auxiliaire / balance âgée", kind: "calculated", assertions: [],
    requiredDocumentTypes: [...CLIENT_TYPES], rule: CLIENT_FRAME_RULE };
export const clientsMappingSchema = z.object({
    version: z.literal("clients-frame-1"), headerRow: z.number().int().positive(), sheet: z.string().optional(),
    columns: z.object({ key: z.string().min(1), amount: z.string().min(1), date: z.string().min(1) }).strict(),
    delimiter: z.enum([";", ",", "\t"]), decimal: z.enum([",", "."]), dateFormat: z.enum(["ISO", "DD/MM/YYYY"]),
    sign: z.union([z.literal(1), z.literal(-1)]), currency: z.literal("EUR"), expectedTotal: moneySchema.optional(),
    clients: z.object({ accountColumn: z.string().min(1), partyColumn: z.string().min(1).optional(),
        basis: z.literal("closing_balance") }).strict(),
}).strict();
export function assertClientsBatch(batch: ImportBatch, closingDate: string) {
    const mapping = clientsMappingSchema.parse(batch.mapping);
    if (!CLIENT_TYPES.includes(batch.document.documentType as typeof CLIENT_TYPES[number]))
        throw new Error("CLIENT_DOCUMENT_TYPE_INVALID");
    if (batch.document.documentType !== "clients_general" && !mapping.clients.partyColumn)
        throw new Error("CLIENT_PARTY_COLUMN_REQUIRED");
    for (const row of batch.rows) {
        if (!row.normalized || row.errors.length || row.normalized.date !== closingDate)
            throw new Error("CLIENT_CLOSING_BALANCE_REQUIRED");
        const account = row.original[mapping.clients.accountColumn]?.trim();
        if (!account || !/^41\d{1,8}$/.test(account))
            throw new Error("CLIENT_ACCOUNT_REQUIRED");
        if (mapping.clients.partyColumn && !row.original[mapping.clients.partyColumn]?.trim())
            throw new Error("CLIENT_PARTY_REQUIRED");
    }
}
function balances(batch: ImportBatch, procedureId: string): BalanceLine[] {
    const mapping = clientsMappingSchema.parse(batch.mapping);
    return batch.rows.map((row) => ({ id: row.id, key: row.normalized!.key,
        account: row.original[mapping.clients.accountColumn].trim(), party: mapping.clients.partyColumn ? row.original[mapping.clients.partyColumn].trim() : undefined,
        value: { amount: row.normalized!.amount, date: row.normalized!.date, basis: mapping.clients.basis,
            evidence: [{ id: "proof-" + row.id, scope: batch.scope, procedureId, documentVersionId: batch.document.id, rowId: row.id,
                    locator: row.locator, precision: "row", status: "verified", purpose: "Solde source du cadrage Clients" }] } }));
}
const comparison = z.object({ rows: z.array(z.object({ key: z.string(), left: moneySchema, right: moneySchema,
        difference: knownAmountSchema, sourceLines: z.array(z.unknown()) })), net: knownAmountSchema, gross: knownAmountSchema,
    inputHash: z.string(), convention: z.string() });
const output = z.object({ generalToAuxiliary: comparison, auxiliaryToAged: comparison,
    adjustments: z.array(z.never()), creditBalances: z.array(z.unknown()) });
/** A fresh, closed registry per call: no synthetic engine is registered in the real runtime. */
export class ClientsFramingRegistry extends CalculationRegistry {
    override execute(request: CalculationRequest) {
        const registry = new CalculationRegistry();
        registry.register(CLIENT_FRAME_RULE, z.array(z.object({ id: z.string(), amount: moneySchema }).strict()), z.object({}).strict(), output, () => {
            const find = (type: typeof CLIENT_TYPES[number]) => request.imports.find((b) => b.document.documentType === type)!;
            return output.parse(frameClients({ scope: request.scope, period: request.period, purpose: "real", procedure: "clients.frame" }, balances(find("clients_general"), request.population.id), balances(find("clients_auxiliary"), request.population.id), balances(find("clients_aged"), request.population.id), []));
        }, (result) => {
            const comparisons = [result.generalToAuxiliary, result.auxiliaryToAged];
            if (comparisons.some((c) => c.gross.kind !== "known"))
                return "inconclusive";
            return comparisons.some((c) => c.gross.kind === "known" && cents(c.gross.value) !== 0n) ? "exceptions_detected" : "no_exception_detected";
        }, (r) => {
            if (r.scope.mode !== "real" || r.imports.length !== 3 || CLIENT_TYPES.some((type) => r.imports.filter((b) => b.document.documentType === type).length !== 1))
                throw new Error("CLIENT_THREE_SOURCES_REQUIRED");
            r.imports.forEach((b) => assertClientsBatch(b, r.period.closingDate));
            if (r.selection.exclusions.length || r.selection.selectedIds.length !== r.population.items.length ||
                stableSha256([...r.selection.selectedIds].sort()) !== stableSha256(r.population.items.map((i) => i.id).sort()))
                throw new Error("CLIENT_FULL_POPULATION_REQUIRED");
        });
        return registry.execute(request);
    }
}
