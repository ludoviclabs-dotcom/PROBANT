import { z } from "zod";
import { clientsPeriodSchema } from "./clients-commands";
import { fiscalCitationInputSchema, declarativePeriodSchema, FX_FREQUENCIES } from "./fiscal-work";
import { vatDraftSchema } from "./fiscal-vat";
import { knownAmountSchema } from "./model";

/** Strict command bodies: no role, author, approval, population, citation metadata or result can be supplied by the browser. */
const text = z.string().trim().min(1).max(10000);
const target = { id: z.string().min(1).max(200), expectedVersion: z.number().int().positive() };
export const fiscalPeriodSchema = clientsPeriodSchema;
export const fiscalCommandSchema = z.discriminatedUnion("command", [
  // A VAT run is created for one declarative period of the exercise; that period identifies it and never changes.
  z.object({ command: z.literal("create"), period: fiscalPeriodSchema, tax: z.literal("vat"), declarativePeriod: declarativePeriodSchema, frequency: z.enum(FX_FREQUENCIES), formVintage: z.number().int().min(2000).max(2200) }).strict(),
  z.object({ command: z.literal("freeze"), ...target, importIds: z.array(z.string().min(1).max(200)).min(1).max(20), draft: vatDraftSchema }).strict(),
  z.object({ command: z.literal("configure"), ...target, draft: vatDraftSchema }).strict(),
  z.object({ command: z.literal("execute"), ...target }).strict(),
  z.object({ command: z.literal("conclude"), ...target, text }).strict(),
  z.object({ command: z.literal("note"), ...target, note: z.object({ id: text, kind: z.enum(["observation", "validated_anomaly", "missing_evidence", "limitation", "judgment"]), text, amount: knownAmountSchema, blocking: z.boolean() }).strict(), citation: fiscalCitationInputSchema.optional() }).strict(),
  z.object({ command: z.literal("resolve"), ...target, noteId: text, text, citation: fiscalCitationInputSchema }).strict(),
  z.object({ command: z.literal("submit"), ...target }).strict(),
  z.object({ command: z.literal("review"), ...target, decision: z.enum(["approved", "changes_requested"]), submittedHash: z.string().regex(/^[a-f0-9]{64}$/), text }).strict(),
  z.object({ command: z.literal("lock"), ...target }).strict(),
  z.object({ command: z.literal("revise"), ...target }).strict(),
]);
export type FiscalCommand = z.infer<typeof fiscalCommandSchema>;
export const fiscalApprovalSchema = z.object({ command: z.literal("approve_import"), importId: text, previewHash: z.string().regex(/^[a-f0-9]{64}$/), expectedSourceId: z.string().min(1).nullable() }).strict();
