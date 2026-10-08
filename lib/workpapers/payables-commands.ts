import { z } from "zod";
import { clientsPeriodSchema, clientsCommandSchema, clientsApprovalSchema } from "./clients-commands";
import { PAYABLE_PROCEDURES, payablesDraftSchema } from "./payables-investigation";
export { clientsPeriodSchema, clientsApprovalSchema };
const target = { id: z.string().min(1).max(200), expectedVersion: z.number().int().positive() };
const selection = z.object({ method: z.enum(["all", "targeted", "random"]), criteria: z.string().trim().min(1).max(10000), selectedIds: z.array(z.string()).max(2000).optional(), requestedSize: z.number().int().positive().optional(), seed: z.string().max(100).optional(), exclusions: z.array(z.object({ id: z.string().min(1), reason: z.string().trim().min(1).max(1000) }).strict()).max(2000) }).strict();
const specific = z.discriminatedUnion("command", [
    z.object({ command: z.literal("create_payables"), procedure: z.enum(PAYABLE_PROCEDURES), period: clientsPeriodSchema, instanceKey: z.string().trim().min(1).max(200) }).strict(),
    z.object({ command: z.literal("freeze_payables"), ...target, importIds: z.array(z.string()).min(3).max(11), draft: payablesDraftSchema, selection }).strict(),
    z.object({ command: z.literal("configure_payables"), ...target, draft: payablesDraftSchema }).strict(),
]);
export const payablesCommandSchema = z.union([specific, clientsCommandSchema.refine(c => !["create", "freeze", "create_sales", "freeze_sales", "configure_sales"].includes(c.command), "PAYABLE_COMMAND_OUT_OF_SCOPE")]);
export type PayablesCommand = z.infer<typeof payablesCommandSchema>;
