import { z } from 'zod';
import { EQUITY_FAMILIES } from './equity-program';
const text=z.string().trim().min(1).max(1000);
export const equityDraftSchema=z.object({schemaVersion:z.literal('equity-dossier-1'),method:z.object({id:text,version:text,note:text,proofRowIds:z.array(text).min(1).max(100)}).strict(),socialForm:text,completeComponentSet:z.boolean(),ledgerCoverage:z.enum(['documented','incomplete']),decisionsCoverage:z.enum(['documented','incomplete']),components:z.array(z.object({id:text,label:text,family:z.enum(EQUITY_FAMILIES),accounts:z.array(text).max(100),state:z.enum(['in_scope','not_applicable']),reason:z.string().max(2000),proofRowId:text.optional()}).strict()).min(1).max(100),interpretations:z.array(z.object({decisionId:text,proofRowId:text,note:text}).strict()).max(2000)}).strict();
export type EquityDraft=z.infer<typeof equityDraftSchema>;
export const equityWorkSchema=equityDraftSchema.extend({authorId:text,authoredAt:z.string().refine(v=>Number.isFinite(Date.parse(v)))}).strict();
export type EquityWork=z.infer<typeof equityWorkSchema>;
