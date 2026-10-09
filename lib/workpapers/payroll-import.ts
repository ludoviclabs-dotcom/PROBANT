import { z } from "zod";
import { cents, type Money } from "@/lib/canonical-model/money";
import { previewImport } from "./imports";
import { frozen, type EvidenceLink, type WorkpaperScope } from "./model";
import type { Principal } from "./policy";
import {
  codeSchema,
  date,
  decimal,
  mappingSchema,
  monthSchema,
  pseudonymSchema,
  quantity,
  reasons,
  unit,
  type PayrollEvent,
  type PayrollLine,
  type PayrollMapping,
  type PayrollSource,
} from "./payroll-contract";
const nullable = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .union([z.literal(""), schema])
    .transform((v) => (v === "" ? null : v) as z.output<T> | null);
export const lineSchema = z
  .object({
    id: codeSchema,
    pseudonym: nullable(pseudonymSchema),
    establishment: codeSchema,
    month: monthSchema,
    rubric: codeSchema,
    organism: codeSchema,
    basisCode: codeSchema,
    base: nullable(decimal),
    amount: decimal,
    date,
    regularization: nullable(monthSchema),
    paymentRef: nullable(codeSchema),
    paymentStatus: nullable(z.enum(["posted", "cancelled"])),
    entryDate: nullable(date),
    exitDate: nullable(date),
  })
  .strict();
export const eventSchema = z
  .object({
    id: codeSchema,
    pseudonym: nullable(pseudonymSchema),
    establishment: codeSchema,
    month: monthSchema,
    rubric: codeSchema,
    organism: codeSchema,
    reason: z.enum(reasons),
    originMonth: nullable(monthSchema),
    pieceRef: codeSchema,
    page: z.string().regex(/^[1-9]\d{0,3}$/),
    amount: decimal,
    date,
  })
  .strict();
export const leaveSchema = z
  .object({
    id: codeSchema,
    pseudonym: pseudonymSchema,
    from: date,
    to: date,
    unit,
    acquired: quantity,
    taken: quantity,
    remaining: quantity,
    firstBase: decimal,
    secondBase: decimal,
    firstNumerator: z.string().regex(/^\d{1,8}$/),
    firstDenominator: z.string().regex(/^[1-9]\d{0,7}$/),
    secondNumerator: z.string().regex(/^\d{1,8}$/),
    secondDenominator: z.string().regex(/^[1-9]\d{0,7}$/),
    secondUnit: unit,
    secondFrom: date,
    secondTo: date,
    ruleRef: codeSchema,
    ruleVersion: codeSchema,
    validFrom: date,
    validTo: date,
    ruleApproved: z.enum(["yes", "no"]),
    pieceRef: codeSchema,
    page: z.string().regex(/^[1-9]\d{0,3}$/),
    date,
  })
  .strict();
export type LeaveRow = z.infer<typeof leaveSchema>;
const money = (amount: string): Money => ({ amount, currency: "EUR" });
export function payrollProof(
  source: PayrollSource,
  rowId: string,
): EvidenceLink {
  const row = source.batch.rows.find((r) => r.id === rowId);
  if (!row) throw Error("HR_SOURCE_NOT_FOUND");
  return {
    id: row.id,
    scope: source.batch.scope,
    procedureId: "payroll.review",
    documentVersionId: source.batch.document.id,
    rowId: row.id,
    locator: row.locator,
    precision: "row",
    status: "verified",
    purpose: "Source structurée synthétique qualifiée",
  };
}
export function qualifyPayrollSource(source: PayrollSource): void {
  mappingSchema.parse(source.mapping);
  if (
    source.batch.document.documentType !== "payroll_" + source.mapping.kind ||
    source.batch.mapping.version !==
      source.mapping.version + ":" + source.mapping.kind ||
    source.batch.report.rejectedRows ||
    source.batch.report.duplicateRows ||
    source.batch.report.blocking.length
  )
    throw Error("HR_IMPORT_INVALID");
  if (source.batch.rows.length > 5000) throw Error("HR_IMPORT_LIMIT");
  const ids = new Set<string>();
  for (const row of source.batch.rows) {
    if (row.errors.length || !row.normalized) throw Error("HR_IMPORT_INVALID");
    const parsed =
      source.mapping.kind === "events"
        ? eventSchema.parse(row.original)
        : source.mapping.kind === "leave"
          ? leaveSchema.parse(row.original)
          : lineSchema.parse(row.original);
    if (ids.has(parsed.id)) throw Error("HR_DUPLICATE_ROW");
    ids.add(parsed.id);
    if (source.mapping.kind === "leave") {
      const p = parsed as LeaveRow;
      if (
        p.from > p.to ||
        p.secondFrom > p.secondTo ||
        p.validFrom > p.validTo ||
        cents(money(p.firstBase)) < 0n ||
        cents(money(p.secondBase)) < 0n
      )
        throw Error("HR_LEAVE_INVALID");
    } else if (source.mapping.kind === "events") {
      const p = parsed as z.infer<typeof eventSchema>;
      if (
        (p.reason === "recall" && !p.originMonth) ||
        (p.originMonth && p.originMonth > p.month)
      )
        throw Error("HR_MAPPING_INVALID");
    } else {
      const p = parsed as z.infer<typeof lineSchema>;
      if (
        (source.mapping.kind === "journal" && !p.pseudonym) ||
        (source.mapping.kind === "payments" &&
          (!p.paymentRef || !p.paymentStatus || cents(money(p.amount)) < 0n)) ||
        (p.regularization && p.regularization > p.month) ||
        (p.entryDate && p.exitDate && p.entryDate > p.exitDate)
      )
        throw Error("HR_MAPPING_INVALID");
    }
  }
}
/** CSV only. A filename containing DSN conveys no native format or semantic certification. */
export async function previewPayroll(
  file: File,
  scope: WorkpaperScope,
  mapping: PayrollMapping,
  actor: Principal,
): Promise<PayrollSource> {
  mappingSchema.parse(mapping);
  if (scope.mode !== "demo") throw Error("HR_REAL_DISABLED");
  if (!file.name.toLowerCase().endsWith(".csv") || file.size > 1024 * 1024)
    throw Error("HR_FORMAT_UNSUPPORTED");
  // Never store an arbitrary client filename; preserve original bytes and the shared parser.
  const neutral = new File(
    [await file.arrayBuffer()],
    "source-synthetique.csv",
    { type: "text/csv" },
  );
  const batch = await previewImport(
    neutral,
    scope,
    {
      version: mapping.version + ":" + mapping.kind,
      headerRow: 1,
      columns: {
        key: "id",
        amount: mapping.kind === "leave" ? "firstBase" : "amount",
        date: "date",
      },
      delimiter: ";",
      decimal: ".",
      dateFormat: "ISO",
      sign: 1,
      currency: "EUR",
    },
    actor,
    "payroll_" + mapping.kind,
  );
  const source = { mapping, batch };
  qualifyPayrollSource(source);
  return frozen(source);
}
export function payrollLines(source: PayrollSource): PayrollLine[] {
  if (
    !["journal", "ledger", "declaration", "payments"].includes(
      source.mapping.kind,
    )
  )
    throw Error("HR_SOURCE_KIND_INVALID");
  return source.batch.rows.map((row) => {
    const p = lineSchema.parse(row.original);
    return {
      ...p,
      id: row.id,
      kind: source.mapping.kind as PayrollLine["kind"],
      amount: money(p.amount),
      base: p.base === null ? null : money(p.base),
      proof: payrollProof(source, row.id),
    };
  });
}
export function payrollEvents(source: PayrollSource): PayrollEvent[] {
  return source.batch.rows.map((row) => {
    const p = eventSchema.parse(row.original);
    return {
      ...p,
      id: row.id,
      page: Number(p.page),
      proof: payrollProof(source, row.id),
    };
  });
}
