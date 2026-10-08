import { z } from 'zod';
import { clientsPeriodSchema,clientsApprovalSchema } from './clients-commands';
import { investmentDraftSchema } from './investment-dossier';
export {clientsPeriodSchema,clientsApprovalSchema};
const target={id:z.string().min(1).max(200),expectedVersion:z.number().int().positive()},citation=z.object({documentVersionId:z.string().min(1),rowId:z.string().min(1)}).strict();
export const investmentCommandSchema=z.discriminatedUnion('command',[
 z.object({command:z.literal('create_investment'),period:clientsPeriodSchema,instanceKey:z.string().min(1).max(200)}).strict(),
 z.object({command:z.literal('freeze_investment'),...target,importIds:z.array(z.string()).min(1).max(7),draft:investmentDraftSchema,criteria:z.string().trim().min(1).max(2000),excluded:z.array(z.object({id:z.string().min(1),reason:z.string().trim().min(1).max(1000)}).strict()).max(2000)}).strict(),
 z.object({command:z.literal('configure_investment'),...target,draft:investmentDraftSchema}).strict(),
 z.object({command:z.literal('execute'),...target}).strict(),
 z.object({command:z.literal('resolve'),...target,noteId:z.string().min(1),text:z.string().trim().min(1).max(10000),citation}).strict(),
 z.object({command:z.literal('conclude'),...target,text:z.string().trim().min(1).max(10000),citation}).strict(),
 z.object({command:z.literal('review'),...target,decision:z.enum(['approved','changes_requested']),text:z.string().trim().min(1).max(10000),submittedHash:z.string().regex(/^[a-f0-9]{64}$/),citation}).strict(),
 z.object({command:z.literal('submit'),...target}).strict(),z.object({command:z.literal('lock'),...target}).strict(),z.object({command:z.literal('revise'),...target}).strict()
]);
export type InvestmentCommand=z.infer<typeof investmentCommandSchema>;
