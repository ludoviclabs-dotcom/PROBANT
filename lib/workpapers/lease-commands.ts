import { z } from "zod";
import { clientsApprovalSchema, clientsPeriodSchema } from "./clients-commands";
import { leaseCitationRefSchema, leaseWorkDraftSchema } from "./lease-work";
export { clientsApprovalSchema, clientsPeriodSchema };

const id = z.string().min(1).max(250), text = z.string().trim().min(1).max(12000);
const target = { id, expectedVersion: z.number().int().positive() };
/** Jeu de commandes fermé (C00 § 8) ; aucun rôle, auteur, horodatage ou approbation n'est accepté du navigateur. */
export const leaseCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("create_leases"), period: clientsPeriodSchema, instanceKey: id }).strict(),
  z.object({ command: z.literal("configure_leases"), ...target, work: leaseWorkDraftSchema }).strict(),
  z.object({ command: z.literal("freeze_leases"), ...target, importIds: z.array(id).min(1).max(5), criteria: text }).strict(),
  z.object({ command: z.literal("execute"), ...target }).strict(),
  z.object({ command: z.literal("resolve"), ...target, noteId: id, text, citation: leaseCitationRefSchema }).strict(),
  z.object({ command: z.literal("conclude"), ...target, text, citation: leaseCitationRefSchema }).strict(),
  z.object({ command: z.literal("submit"), ...target }).strict(),
  z.object({ command: z.literal("review"), ...target, decision: z.enum(["approved", "changes_requested"]), text, citation: leaseCitationRefSchema, submittedHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ command: z.literal("lock"), ...target }).strict(),
  z.object({ command: z.literal("revise"), ...target }).strict(),
]);
export type LeaseCommand = z.infer<typeof leaseCommandSchema>;
