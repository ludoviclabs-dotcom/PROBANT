import { z } from "zod";
import { isCivilDate, periodIssues } from "@/lib/canonical-model/period";
import { knownAmountSchema } from "./model";
const text = z.string().trim().min(1).max(10000);
export const clientsPeriodSchema = z.object({ startDate: z.string().refine(isCivilDate), closingDate: z.string().refine(isCivilDate),
    asOfDate: z.string().refine(isCivilDate), currency: z.literal("EUR"), validation: z.literal("provisional").default("provisional") }).strict().refine((p) => !periodIssues(p).length);
const target = { id: z.string().min(1).max(200), expectedVersion: z.number().int().positive() };
export const clientsCommandSchema = z.discriminatedUnion("command", [
    z.object({ command: z.literal("create"), period: clientsPeriodSchema, instanceKey: text }).strict(),
    z.object({ command: z.literal("freeze"), ...target, importIds: z.array(z.string().min(1)).length(3) }).strict(),
    z.object({ command: z.literal("execute"), ...target }).strict(),
    z.object({ command: z.literal("conclude"), ...target, text }).strict(),
    z.object({ command: z.literal("note"), ...target, note: z.object({ id: text, kind: z.enum(["observation", "validated_anomaly", "missing_evidence", "limitation", "judgment"]),
            text, amount: knownAmountSchema, blocking: z.boolean() }).strict() }).strict(),
    z.object({ command: z.literal("resolve"), ...target, noteId: text, text }).strict(),
    z.object({ command: z.literal("submit"), ...target }).strict(),
    z.object({ command: z.literal("review"), ...target, decision: z.enum(["approved", "changes_requested"]), submittedHash: z.string().regex(/^[a-f0-9]{64}$/), text }).strict(),
    z.object({ command: z.literal("lock"), ...target }).strict(),
    z.object({ command: z.literal("revise"), ...target }).strict()
]);
export type ClientsCommand = z.infer<typeof clientsCommandSchema>;
export const clientsApprovalSchema = z.object({ command: z.literal("approve_import"), importId: text, previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedSourceId: z.string().min(1).nullable() }).strict();
