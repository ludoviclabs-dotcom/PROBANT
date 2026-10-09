import { z } from "zod";
import { clientsPeriodSchema } from "./clients-commands";
import { stockCitationInputSchema, stockDraftSchema } from "./stock-contract";
import { knownAmountSchema } from "./model";

/** Strict command bodies: no role, author, approval, population, citation metadata or result can be supplied by the browser. */
const text = z.string().trim().min(1).max(10000);
const target = { id: z.string().min(1).max(200), expectedVersion: z.number().int().positive() };
export const stockPeriodSchema = clientsPeriodSchema;
export const stockCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("create"), period: stockPeriodSchema }).strict(),
  z.object({ command: z.literal("freeze"), ...target, importIds: z.array(z.string().min(1).max(200)).min(2).max(7), draft: stockDraftSchema }).strict(),
  z.object({ command: z.literal("configure"), ...target, draft: stockDraftSchema }).strict(),
  z.object({ command: z.literal("execute"), ...target }).strict(),
  z.object({ command: z.literal("conclude"), ...target, text }).strict(),
  z.object({ command: z.literal("note"), ...target, note: z.object({ id: text, kind: z.enum(["observation", "validated_anomaly", "missing_evidence", "limitation", "judgment"]), text, amount: knownAmountSchema, blocking: z.boolean() }).strict(), citation: stockCitationInputSchema.optional() }).strict(),
  z.object({ command: z.literal("resolve"), ...target, noteId: text, text, citation: stockCitationInputSchema }).strict(),
  z.object({ command: z.literal("submit"), ...target }).strict(),
  z.object({ command: z.literal("review"), ...target, decision: z.enum(["approved", "changes_requested"]), submittedHash: z.string().regex(/^[a-f0-9]{64}$/), text }).strict(),
  z.object({ command: z.literal("lock"), ...target }).strict(),
  z.object({ command: z.literal("revise"), ...target }).strict(),
]);
export type StockCommand = z.infer<typeof stockCommandSchema>;
export const stockApprovalSchema = z.object({ command: z.literal("approve_import"), importId: text, previewHash: z.string().regex(/^[a-f0-9]{64}$/), expectedSourceId: z.string().min(1).nullable() }).strict();
