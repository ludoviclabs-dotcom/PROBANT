import { z } from "zod";
import { clientsPeriodSchema } from "./clients-commands";
import { provisionCitationInputSchema, provisionDraftSchema } from "./provision-contract";
import { knownAmountSchema } from "./model";

/** Strict command bodies: no role, author, approval, population, citation metadata or result can be supplied by the browser. */
const text = z.string().trim().min(1).max(10000);
const target = { id: z.string().min(1).max(200), expectedVersion: z.number().int().positive() };
export const provisionPeriodSchema = clientsPeriodSchema;
export const provisionCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("create"), period: provisionPeriodSchema }).strict(),
  z.object({ command: z.literal("freeze"), ...target, importIds: z.array(z.string().min(1).max(200)).min(2).max(6), draft: provisionDraftSchema }).strict(),
  z.object({ command: z.literal("configure"), ...target, draft: provisionDraftSchema }).strict(),
  z.object({ command: z.literal("execute"), ...target }).strict(),
  z.object({ command: z.literal("conclude"), ...target, text }).strict(),
  z.object({ command: z.literal("note"), ...target, note: z.object({ id: text, kind: z.enum(["observation", "validated_anomaly", "missing_evidence", "limitation", "judgment"]), text, amount: knownAmountSchema, blocking: z.boolean() }).strict(), citation: provisionCitationInputSchema.optional() }).strict(),
  z.object({ command: z.literal("resolve"), ...target, noteId: text, text, citation: provisionCitationInputSchema }).strict(),
  z.object({ command: z.literal("submit"), ...target }).strict(),
  z.object({ command: z.literal("review"), ...target, decision: z.enum(["approved", "changes_requested"]), submittedHash: z.string().regex(/^[a-f0-9]{64}$/), text }).strict(),
  z.object({ command: z.literal("lock"), ...target }).strict(),
  z.object({ command: z.literal("revise"), ...target }).strict(),
]);
export type ProvisionCommand = z.infer<typeof provisionCommandSchema>;
export const provisionApprovalSchema = z.object({ command: z.literal("approve_import"), importId: text, previewHash: z.string().regex(/^[a-f0-9]{64}$/), expectedSourceId: z.string().min(1).nullable() }).strict();
