import { z } from "zod";
import {
  isCivilDate,
  type AccountingPeriod,
} from "@/lib/canonical-model/period";
import type { Money } from "@/lib/canonical-model/money";
import { assertScope, type WorkpaperScope, type EvidenceLink } from "./model";
import { authorize, type Principal } from "./policy";
import type { ImportBatch } from "./imports";
export const PAYROLL_VERSION = "payroll-review-1";
export const payrollKinds = [
  "journal",
  "ledger",
  "declaration",
  "payments",
  "events",
  "leave",
] as const;
export const payrollModules = ["framing", "settlements", "leave"] as const;
export type PayrollKind = (typeof payrollKinds)[number];
export type PayrollModule = (typeof payrollModules)[number];
export const reasons = [
  "recall",
  "entry",
  "exit",
  "bonus",
  "timing",
  "other",
] as const;
export type PayrollReason = (typeof reasons)[number];
export const codeSchema = z.string().regex(/^[A-Z0-9_-]{1,40}$/);
export const pseudonymSchema = z.string().regex(/^SYN-[A-Z0-9-]{1,24}$/);
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const date = z.string().refine(isCivilDate);
export const decimal = z.string().regex(/^-?(0|[1-9]\d*)\.\d{2}$/);
export const quantity = z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/);
export const unit = z.enum(["working_days", "business_days", "hours"]);
export const mappingSchema = z
  .object({
    version: z.literal(PAYROLL_VERSION),
    kind: z.enum(payrollKinds),
    synthetic: z.literal(true),
    qualified: z.boolean(),
    coverage: z.enum(["complete", "partial", "unknown"]),
    packId: codeSchema,
    sourceVersion: codeSchema,
    generatedAt: date,
  })
  .strict();
export type PayrollMapping = z.infer<typeof mappingSchema>;
export interface PayrollSource {
  mapping: PayrollMapping;
  batch: ImportBatch;
}
export interface PayrollLine {
  id: string;
  kind: "journal" | "ledger" | "declaration" | "payments";
  pseudonym: string | null;
  establishment: string;
  month: string;
  rubric: string;
  organism: string;
  basisCode: string;
  base: Money | null;
  amount: Money;
  date: string;
  regularization: string | null;
  paymentRef: string | null;
  paymentStatus: "posted" | "cancelled" | null;
  entryDate: string | null;
  exitDate: string | null;
  proof: EvidenceLink;
}
export interface PayrollEvent {
  id: string;
  pseudonym: string | null;
  establishment: string;
  month: string;
  rubric: string;
  organism: string;
  reason: PayrollReason;
  originMonth: string | null;
  pieceRef: string;
  page: number;
  proof: EvidenceLink;
}
export interface PayrollExclusion {
  unitId: string;
  reason: "outside_scope" | "duplicate_source";
  evidenceId: string;
}
export interface PayrollReview {
  module: PayrollModule;
  targetId: string;
  inputHash: string;
  reason: PayrollReason;
  evidenceId: string;
  authorId: string;
  at: string;
}
export interface PayrollState {
  scope: WorkpaperScope;
  period: AccountingPeriod;
  version: number;
  sources: Partial<Record<PayrollKind, PayrollSource>>;
  exclusions: PayrollExclusion[];
  reviews: PayrollReview[];
}
export interface HRPrincipal extends Principal {
  hrGrants: {
    scope: WorkpaperScope;
    permissions: ("read" | "prepare" | "export")[];
  }[];
}
/** Separate capability supplied by the trusted server, never inferred from a dossier role or request JSON. */
export function authorizePayroll(
  actor: HRPrincipal | null,
  scope: WorkpaperScope,
  permission: "read" | "prepare" | "export",
) {
  authorize(actor, scope, permission === "export" ? "download" : permission);
  if (
    !actor?.hrGrants.some((g) => {
      try {
        assertScope(scope, g.scope);
        return g.permissions.includes(permission);
      } catch {
        return false;
      }
    })
  )
    throw Error("HR_FORBIDDEN");
  if (scope.mode !== "demo") throw Error("HR_REAL_DISABLED");
}
export const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("document"),
      version: z.number().int().positive(),
      module: z.enum(["framing", "settlements"]),
      targetId: z.string().regex(/^[a-f0-9]{64}$/),
      inputHash: z.string().regex(/^[a-f0-9]{64}$/),
      reason: z.enum(reasons),
      evidenceId: z.string().min(1).max(150),
    })
    .strict(),
  z
    .object({
      action: z.literal("exclude"),
      version: z.number().int().positive(),
      unitId: z.string().regex(/^[a-f0-9]{64}$/),
      reason: z.enum(["outside_scope", "duplicate_source"]),
      evidenceId: z.string().min(1).max(150),
    })
    .strict(),
  z
    .object({
      action: z.literal("restore"),
      version: z.number().int().positive(),
      unitId: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("approve_import"),
      version: z.number().int().positive(),
      previewId: z.string().regex(/^[a-f0-9]{64}$/),
      previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
]);
export type PayrollCommand = z.infer<typeof commandSchema>;
export const payrollSourceLabels: Record<PayrollKind, string> = {
  journal: "Journal de paie",
  ledger: "Grand livre",
  declaration: "Export déclaratif qualifié",
  payments: "Paiements",
  events: "Pièces et événements",
  leave: "Droits et méthodes de congés",
};
