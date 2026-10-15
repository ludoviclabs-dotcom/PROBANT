import { z } from "zod";
import { clientsApprovalSchema, clientsPeriodSchema } from "./clients-commands";
export { clientsApprovalSchema, clientsPeriodSchema };

const id = z.string().min(1).max(250), text = z.string().trim().min(1).max(12000);
const target = { id, expectedVersion: z.number().int().positive() }, citation = z.object({ documentVersionId: id, rowId: id }).strict();
/** Closed command set; no role, author or approval is accepted from the browser. */
export const loanCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("create_loans"), period: clientsPeriodSchema, instanceKey: id }).strict(),
  z.object({ command: z.literal("freeze_loans"), ...target, importIds: z.array(id).min(1).max(8), criteria: text }).strict(),
  z.object({ command: z.literal("execute"), ...target }).strict(),
  z.object({ command: z.literal("resolve"), ...target, noteId: id, text, citation }).strict(),
  z.object({ command: z.literal("conclude"), ...target, text, citation }).strict(),
  z.object({ command: z.literal("submit"), ...target }).strict(),
  z.object({ command: z.literal("review"), ...target, decision: z.enum(["approved", "changes_requested"]), text, citation, submittedHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ command: z.literal("lock"), ...target }).strict(),
  z.object({ command: z.literal("revise"), ...target }).strict(),
]);
export type LoanCommand = z.infer<typeof loanCommandSchema>;
