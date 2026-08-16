import type {
  FiscalSynthesisSnapshot,
  TaxAdjustment,
  TaxComputationSnapshot,
  TaxControlExecution,
  TaxDeclarationField,
  TaxDocumentSnapshot,
  TaxPeriod,
  TaxProfile,
  TaxReconciliationLine,
} from "@/lib/canonical-model";
import { canonicalJson, stableHash } from "@/lib/synthesis/canonical";
import {
  FiscalSynthesisSnapshotSchema,
  TaxAdjustmentSchema,
  TaxComputationSnapshotSchema,
  TaxControlExecutionSchema,
  TaxDeclarationFieldSchema,
  TaxDocumentSnapshotSchema,
  TaxPeriodSchema,
  TaxProfileSchema,
  TaxReconciliationLineSchema,
} from "./schemas";

type WithoutCanonical<T, HashKey extends keyof T> = Omit<T, "canonicalJson" | HashKey>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function finalize<T extends object, K extends keyof T>(
  input: Omit<T, "canonicalJson" | K>,
  hashKey: K,
  parse: (value: unknown) => T,
): T {
  const serialized = canonicalJson(input);
  const result = {
    ...input,
    canonicalJson: serialized,
    [hashKey]: stableHash(input),
  } as unknown as T;
  return deepFreeze(parse(result));
}

export type TaxProfileInput = WithoutCanonical<TaxProfile, "contentHash">;
export function createTaxProfile(input: TaxProfileInput): TaxProfile {
  return finalize(input, "contentHash", (value) => TaxProfileSchema.parse(value) as TaxProfile);
}

export type TaxPeriodInput = WithoutCanonical<TaxPeriod, "contentHash">;
export function createTaxPeriod(input: TaxPeriodInput): TaxPeriod {
  return finalize(input, "contentHash", (value) => TaxPeriodSchema.parse(value) as TaxPeriod);
}

export type TaxDeclarationFieldInput = Omit<TaxDeclarationField, "fieldHash">;
export function createTaxDeclarationField(input: TaxDeclarationFieldInput): TaxDeclarationField {
  return deepFreeze(TaxDeclarationFieldSchema.parse({
    ...input,
    fieldHash: stableHash(input),
  }) as TaxDeclarationField);
}

export type TaxDocumentSnapshotInput = WithoutCanonical<TaxDocumentSnapshot, "snapshotHash">;
export function createTaxDocumentSnapshot(input: TaxDocumentSnapshotInput): TaxDocumentSnapshot {
  return finalize(input, "snapshotHash", (value) => TaxDocumentSnapshotSchema.parse(value) as TaxDocumentSnapshot);
}

export type TaxControlExecutionInput = WithoutCanonical<TaxControlExecution, "executionHash">;
export function createTaxControlExecution(input: TaxControlExecutionInput): TaxControlExecution {
  return finalize(input, "executionHash", (value) => TaxControlExecutionSchema.parse(value) as TaxControlExecution);
}

export type TaxReconciliationLineInput = WithoutCanonical<TaxReconciliationLine, "lineHash">;
export function createTaxReconciliationLine(input: TaxReconciliationLineInput): TaxReconciliationLine {
  return finalize(input, "lineHash", (value) => TaxReconciliationLineSchema.parse(value) as TaxReconciliationLine);
}

export type TaxAdjustmentInput = WithoutCanonical<TaxAdjustment, "adjustmentHash">;
export function createTaxAdjustment(input: TaxAdjustmentInput): TaxAdjustment {
  return finalize(input, "adjustmentHash", (value) => TaxAdjustmentSchema.parse(value) as TaxAdjustment);
}

export type TaxComputationSnapshotInput = WithoutCanonical<TaxComputationSnapshot, "snapshotHash">;
export function createTaxComputationSnapshot(input: TaxComputationSnapshotInput): TaxComputationSnapshot {
  return finalize(input, "snapshotHash", (value) => TaxComputationSnapshotSchema.parse(value) as TaxComputationSnapshot);
}

export type FiscalSynthesisSnapshotInput = WithoutCanonical<FiscalSynthesisSnapshot, "snapshotHash">;
export function createFiscalSynthesisSnapshot(input: FiscalSynthesisSnapshotInput): FiscalSynthesisSnapshot {
  return finalize(input, "snapshotHash", (value) => FiscalSynthesisSnapshotSchema.parse(value) as FiscalSynthesisSnapshot);
}

export function serializeCanonicalTaxModel(value: unknown): string {
  return canonicalJson(value);
}

