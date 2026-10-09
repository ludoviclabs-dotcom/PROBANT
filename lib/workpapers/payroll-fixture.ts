import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId, type WorkpaperScope } from "./model";
import {
  PAYROLL_VERSION,
  type HRPrincipal,
  type PayrollKind,
  type PayrollMapping,
} from "./payroll-contract";
export const payrollPeriod: AccountingPeriod = {
  startDate: "2026-01-01",
  closingDate: "2026-12-31",
  asOfDate: "2027-02-01",
  currency: "EUR",
  validation: "confirmed",
};
export const payrollScope: WorkpaperScope = {
  organizationId: "SYN-HR-ORG",
  dossierId: "SYN-HR-DOSSIER",
  periodId: periodId(payrollPeriod),
  mode: "demo",
};
export const payrollActor: HRPrincipal = {
  id: "SYN-HR-PREPARER",
  grants: [
    { scope: payrollScope, permissions: ["read", "prepare", "download"] },
  ],
  hrGrants: [
    { scope: payrollScope, permissions: ["read", "prepare", "export"] },
  ],
};
const headers =
  "id;pseudonym;establishment;month;rubric;organism;basisCode;base;amount;date;regularization;paymentRef;paymentStatus;entryDate;exitDate";
const row = (
  id: string,
  pseudo: string,
  month: string,
  rubric: string,
  org: string,
  amount: string,
  reg = "",
  ref = "",
  status = "",
  date = `${month}-28`,
  entry = "",
  exit = "",
) =>
  [
    id,
    pseudo,
    "SYN-SITE",
    month,
    rubric,
    org,
    "CONTRIBUTION",
    "100.00",
    amount,
    date,
    reg,
    ref,
    status,
    entry,
    exit,
  ].join(";");
export function payrollFixture(scenario = "standard") {
  const journal = [
    row("J01", "SYN-A01", "2026-08", "SOC", "SYN-URSSAF", "20.00"),
    row(
      "J02",
      "SYN-A02",
      "2026-08",
      "SOC",
      "SYN-URSSAF",
      "27.00",
      "",
      "",
      "",
      "2026-08-28",
      "",
      "2026-08-31",
    ),
    row("J03", "SYN-A01", "2026-09", "SOC", "SYN-URSSAF", "20.00"),
    row(
      "J04",
      "SYN-A03",
      "2026-09",
      "SOC",
      "SYN-URSSAF",
      "25.00",
      "",
      "",
      "",
      "2026-09-28",
      "2026-09-01",
    ),
    row(
      "J05",
      "SYN-A02",
      "2026-09",
      "SOC",
      "SYN-URSSAF",
      "5.00",
      "2026-08",
      "",
      "",
      "2026-09-28",
      "",
      "2026-08-31",
    ),
    row("J06", "SYN-A01", "2026-10", "SOC", "SYN-URSSAF", "22.00"),
    row("J07", "SYN-A03", "2026-10", "SOC", "SYN-URSSAF", "25.00"),
    ...["08", "09", "10"].map((m, i) =>
      row(
        `JR${i}`,
        "SYN-A01",
        `2026-${m}`,
        "RET",
        "SYN-RETRAITE",
        i === 2 ? "12.00" : "10.00",
      ),
    ),
  ];
  const aggregate = (prefix: string) => [
    row(prefix + "1", "", "2026-08", "SOC", "SYN-URSSAF", "47.00"),
    row(
      prefix + "2",
      "",
      "2026-09",
      "SOC",
      "SYN-URSSAF",
      prefix === "GL" ? "48.00" : "50.00",
    ),
    row(prefix + "3", "", "2026-10", "SOC", "SYN-URSSAF", "47.00"),
    ...["08", "09", "10"].map((m, i) =>
      row(
        `${prefix}R${i}`,
        "",
        `2026-${m}`,
        "RET",
        "SYN-RETRAITE",
        i === 2 ? "12.00" : "10.00",
      ),
    ),
  ];
  const payments = [
    row(
      "P1",
      "",
      "2026-08",
      "SOC",
      "SYN-URSSAF",
      "47.00",
      "",
      "SYN-P1",
      "posted",
      "2026-09-10",
    ),
    row(
      "P2",
      "",
      "2026-09",
      "SOC",
      "SYN-URSSAF",
      "50.00",
      "",
      "SYN-P2",
      "posted",
      "2026-10-10",
    ),
    row(
      "P3",
      "",
      "2026-09",
      "SOC",
      "SYN-URSSAF",
      "50.00",
      "",
      "SYN-P2",
      "posted",
      "2026-10-10",
    ),
    row(
      "P4",
      "",
      "2026-10",
      "SOC",
      "SYN-URSSAF",
      "47.00",
      "",
      "SYN-P4",
      "posted",
      "2026-11-10",
    ),
    ...["08", "09", "10"].map((m, i) =>
      row(
        `PR${i}`,
        "",
        `2026-${m}`,
        "RET",
        "SYN-RETRAITE",
        i === 2 ? "12.00" : "10.00",
        "",
        `SYN-PR${i}`,
        "posted",
        `2026-${String(Number(m) + 1).padStart(2, "0")}-15`,
      ),
    ),
  ];
  const eventHeader =
    "id;pseudonym;establishment;month;rubric;organism;reason;originMonth;pieceRef;page;amount;date";
  const event = (
    id: string,
    pseudo: string,
    month: string,
    reason: string,
    origin: string,
    amount: string,
    rubric = "SOC",
    org = "SYN-URSSAF",
  ) =>
    [
      id,
      pseudo,
      "SYN-SITE",
      month,
      rubric,
      org,
      reason,
      origin,
      `SYN-PROOF-${id}`,
      "1",
      amount,
      `${month}-28`,
    ].join(";");
  const ev = [
    event("E1", "SYN-A02", "2026-09", "recall", "2026-08", "5.00"),
    event("E2", "SYN-A03", "2026-09", "entry", "", "25.00"),
    event("E3", "SYN-A02", "2026-08", "exit", "", "27.00"),
    event("E4", "SYN-A01", "2026-10", "bonus", "", "2.00"),
    event("E5", "", "2026-09", "timing", "", "10.00", "RET", "SYN-RETRAITE"),
  ];
  const leaveHeader =
    "id;pseudonym;from;to;unit;acquired;taken;remaining;firstBase;secondBase;firstNumerator;firstDenominator;secondNumerator;secondDenominator;secondUnit;secondFrom;secondTo;ruleRef;ruleVersion;validFrom;validTo;ruleApproved;pieceRef;page;date";
  const leave = (id: string, pseudo: string, secondUnit: string) =>
    [
      id,
      pseudo,
      "2026-01-01",
      "2026-12-31",
      "working_days",
      "30.00",
      "20.00",
      "10.00",
      "100.00",
      "120.00",
      "1",
      "10",
      "1",
      "10",
      secondUnit,
      "2026-01-01",
      "2026-12-31",
      "SYN-LEAVE-METHOD",
      "V1",
      "2026-01-01",
      "2026-12-31",
      scenario === "rules_unknown" ? "no" : "yes",
      "SYN-LEAVE-PROOF",
      "1",
      "2026-12-31",
    ].join(";");
  const strings: Record<PayrollKind, string> = {
    journal: [headers, ...journal].join("\n"),
    ledger: [headers, ...aggregate("GL")].join("\n"),
    declaration: [headers, ...aggregate("D")].join("\n"),
    payments: [headers, ...payments].join("\n"),
    events: [eventHeader, ...ev].join("\n"),
    leave: [
      leaveHeader,
      leave("L1", "SYN-A01", "working_days"),
      leave("L2", "SYN-A02", "hours"),
    ].join("\n"),
  };
  return {
    files: Object.fromEntries(
      Object.entries(strings).map(([kind, content]) => [
        kind,
        new File([content], `SYN-${kind}.csv`, { type: "text/csv" }),
      ]),
    ) as Record<PayrollKind, File>,
    mapping: (kind: PayrollKind): PayrollMapping => ({
      version: PAYROLL_VERSION,
      kind,
      synthetic: true,
      qualified: scenario !== "mapping_unknown",
      coverage: scenario === "partial" ? "partial" : "complete",
      packId: "SYN-PACK18",
      sourceVersion: "V1",
      generatedAt: "2027-02-01",
    }),
  };
}
