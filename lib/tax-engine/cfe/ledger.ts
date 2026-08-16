/**
 * Position comptable CFE reconstruite depuis le FEC.
 *
 * Les préfixes de comptes *repèrent* des écritures ; ils ne concluent rien, et
 * aucune position n'est confirmée par un numéro de compte seul. Toute grandeur
 * produite ici reste une preuve `derived`.
 *
 * Les montants du FEC sont des euros décimaux : ils sont convertis en centimes
 * entiers une seule fois, à la frontière.
 */
import type { CentAmount, FecEntry } from "@/lib/canonical-model";
import { stableHash } from "@/lib/synthesis/canonical";
import type { CfeAccountMap, CfeLedgerCandidate, CfeLedgerPosition, CfeLedgerRole } from "./types";

export const DEFAULT_CFE_ACCOUNT_MAP: CfeAccountMap = Object.freeze({
  // 6351 — impôts directs, dont la contribution économique territoriale.
  chargeAccountPrefixes: ["6351"],
  // 447 / 4486 — autres impôts et charges à payer.
  liabilityAccountPrefixes: ["447", "4486"],
  // 512 — banques.
  settlementAccountPrefixes: ["512"],
});

function eurosToCents(amount: number): CentAmount {
  if (!Number.isFinite(amount)) throw new Error("CFE_LEDGER_NON_FINITE_AMOUNT");
  return Math.round(amount * 100);
}

function startsWithAny(account: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => account.startsWith(prefix));
}

function candidate(options: {
  readonly role: CfeLedgerRole;
  readonly line: FecEntry;
  readonly amountCents: CentAmount;
}): CfeLedgerCandidate {
  const body = {
    role: options.role,
    journalCode: options.line.journalCode,
    ecritureNum: options.line.ecritureNum,
    ecritureDate: options.line.ecritureDate,
    pieceRef: options.line.pieceRef.trim().length > 0 ? options.line.pieceRef.trim() : null,
    accountNumber: options.line.compteNum,
    amountCents: options.amountCents,
    sourceLineNumbers: [options.line.ligne],
    // Une lecture d'écritures ne dépasse jamais la preuve dérivée.
    evidenceStrength: "derived" as const,
  };
  return Object.freeze({
    ...body,
    id: `cfe-${options.role}:${options.line.journalCode}:${options.line.ecritureNum}:${options.line.ligne}`,
    candidateHash: stableHash(body),
  });
}

export interface CfeLedgerInput {
  readonly entries: readonly FecEntry[];
  readonly accountMap?: CfeAccountMap;
}

export function readCfeLedger(input: CfeLedgerInput): CfeLedgerPosition {
  const map = input.accountMap ?? DEFAULT_CFE_ACCOUNT_MAP;
  const candidates: CfeLedgerCandidate[] = [];

  let chargeCents = 0;
  let settlementCents = 0;
  let liabilityBalanceCents = 0;

  // Une écriture n'est retenue comme règlement que si elle touche à la fois un
  // compte de trésorerie et un compte de charge ou de dette CFE : un mouvement
  // de banque isolé ne prouve aucun paiement d'impôt.
  const byEcriture = new Map<string, FecEntry[]>();
  for (const entry of input.entries) {
    const key = `${entry.journalCode}\u0000${entry.ecritureNum}`;
    byEcriture.set(key, [...(byEcriture.get(key) ?? []), entry]);
  }

  for (const lines of [...byEcriture.values()]) {
    const chargeLines = lines.filter((line) => startsWithAny(line.compteNum, map.chargeAccountPrefixes));
    const liabilityLines = lines.filter((line) => startsWithAny(line.compteNum, map.liabilityAccountPrefixes));
    const treasuryLines = lines.filter((line) => startsWithAny(line.compteNum, map.settlementAccountPrefixes));

    for (const line of chargeLines) {
      // Une charge est naturellement au débit ; un avoir l'inverse.
      const amount = eurosToCents(line.debit) - eurosToCents(line.credit);
      chargeCents += amount;
      candidates.push(candidate({ role: "charge", line, amountCents: amount }));
    }

    for (const line of liabilityLines) {
      // Une dette est naturellement au crédit.
      const amount = eurosToCents(line.credit) - eurosToCents(line.debit);
      liabilityBalanceCents += amount;
      candidates.push(candidate({ role: "liability", line, amountCents: amount }));
    }

    if (chargeLines.length === 0 && liabilityLines.length === 0) continue;

    for (const line of treasuryLines) {
      // Un règlement sort de la trésorerie : le crédit est le décaissement.
      const amount = eurosToCents(line.credit) - eurosToCents(line.debit);
      settlementCents += amount;
      candidates.push(candidate({ role: "settlement", line, amountCents: amount }));
    }
  }

  return Object.freeze({
    chargeCents,
    settlementCents,
    liabilityBalanceCents,
    candidates: candidates.sort((left, right) => left.id.localeCompare(right.id)),
  });
}
