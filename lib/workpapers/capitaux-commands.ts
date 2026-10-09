import { z } from "zod";
import { clientsPeriodSchema } from "./clients-commands";
import { equityDraftSchema } from "./capitaux-review";
import { knownAmountSchema } from "./model";

/** Strict command bodies: no role, author, approval, population, citation metadata or result can be supplied by the browser. */
const text = z.string().trim().min(1).max(10000);
const target = { id: z.string().min(1).max(200), expectedVersion: z.number().int().positive() };
/** The browser names a frozen document version (and a PDF page); file name, hash and piece are resolved by the server. */
export const equityCitationSchema = z.object({ documentId: z.string().min(1).max(200), page: z.number().int().positive().max(10000).optional() }).strict();
export type EquityCitationInput = z.infer<typeof equityCitationSchema>;
export const equityPeriodSchema = clientsPeriodSchema;
export const equityCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("create"), period: equityPeriodSchema }).strict(),
  z.object({ command: z.literal("freeze"), ...target, importIds: z.array(z.string().min(1).max(200)).min(2).max(60), draft: equityDraftSchema }).strict(),
  z.object({ command: z.literal("configure"), ...target, draft: equityDraftSchema }).strict(),
  z.object({ command: z.literal("execute"), ...target }).strict(),
  z.object({ command: z.literal("conclude"), ...target, text }).strict(),
  z.object({ command: z.literal("note"), ...target, note: z.object({ id: text, kind: z.enum(["observation", "validated_anomaly", "missing_evidence", "limitation", "judgment"]), text, amount: knownAmountSchema, blocking: z.boolean() }).strict(), citation: equityCitationSchema.optional() }).strict(),
  z.object({ command: z.literal("resolve"), ...target, noteId: text, text, citation: equityCitationSchema }).strict(),
  z.object({ command: z.literal("submit"), ...target }).strict(),
  z.object({ command: z.literal("review"), ...target, decision: z.enum(["approved", "changes_requested"]), submittedHash: z.string().regex(/^[a-f0-9]{64}$/), text }).strict(),
  z.object({ command: z.literal("lock"), ...target }).strict(),
  z.object({ command: z.literal("revise"), ...target }).strict(),
]);
export type EquityCommand = z.infer<typeof equityCommandSchema>;
export const equityApprovalSchema = z.object({ command: z.literal("approve_import"), importId: text, previewHash: z.string().regex(/^[a-f0-9]{64}$/), expectedSourceId: z.string().min(1).nullable() }).strict();
