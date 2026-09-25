import { stableSha256 } from "@/lib/synthesis/canonical";
import { assertScope, frozen, type EvidenceLink, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";
import { assertDate, assertUnique, SOURCE_REQUIRED } from "./cycle-context";

export interface ConfirmationRecord {
  id: string; version: number; scope: WorkpaperScope; subject: "bank" | "supplier" | "customer"; subjectIds: string[];
  alternative?: { performedOn: string; note: string; evidence: EvidenceLink[] };
  request: { date: string; channel: string; evidence: EvidenceLink } | null;
  response: { date: string; confirmedAt: string; origin: "direct_documented" | "client_provided" | "unknown"; channel: string; evidence: EvidenceLink; originEvidence?: EvidenceLink } | null;
  reconciliation: { status: "not_tested" | "agrees_on_tested_items" | "differences"; evidence: EvidenceLink[]; note: string };
  powers: { status: "not_requested" | "missing" | "received_unreviewed" | "reviewed"; evidence: EvidenceLink[]; note: string };
  commitments: { status: "not_requested" | "missing" | "received_unreviewed" | "reviewed"; evidence: EvidenceLink[]; note: string };
}
export function validateConfirmation(record: ConfirmationRecord) {
  assertUnique(record.subjectIds); if (!record.subjectIds.length || !["bank", "supplier", "customer"].includes(record.subject)) throw new Error("CONFIRMATION_SUBJECT_REQUIRED");
  const links = [...record.reconciliation.evidence, ...record.powers.evidence, ...record.commitments.evidence];
  if (record.alternative) { assertDate(record.alternative.performedOn); if (!record.alternative.note.trim() || !record.alternative.evidence.some((e) => e.status === "verified")) throw new Error("ALTERNATIVE_EVIDENCE_REQUIRED"); links.push(...record.alternative.evidence); }
  if (record.request) { assertDate(record.request.date); if (!record.request.channel.trim()) throw new Error("REQUEST_CHANNEL_REQUIRED"); links.push(record.request.evidence); }
  if (record.response) {
    assertDate(record.response.date); assertDate(record.response.confirmedAt);
    if (!record.request || record.response.date < record.request.date || !record.response.channel.trim() || !["direct_documented", "client_provided", "unknown"].includes(record.response.origin)) throw new Error("RESPONSE_ORIGIN_INVALID");
    if (record.response.origin === "direct_documented" && (!record.response.originEvidence || record.response.originEvidence.status !== "verified")) throw new Error("DIRECT_ORIGIN_EVIDENCE_REQUIRED");
    links.push(record.response.evidence); if (record.response.originEvidence) links.push(record.response.originEvidence);
  }
  if (record.reconciliation.status !== "not_tested" && (!record.response || !record.reconciliation.note.trim() || !record.reconciliation.evidence.some((e) => e.status === "verified"))) throw new Error("CONFIRMATION_RECONCILIATION_EVIDENCE_REQUIRED");
  if (!["not_tested", "agrees_on_tested_items", "differences"].includes(record.reconciliation.status)) throw new Error("CONFIRMATION_STATUS_INVALID");
  for (const section of [record.powers, record.commitments]) {
    if (!["not_requested", "missing", "received_unreviewed", "reviewed"].includes(section.status)) throw new Error("CONFIRMATION_STATUS_INVALID");
    if (["received_unreviewed", "reviewed"].includes(section.status) && !section.evidence.length) throw new Error("CONFIRMATION_DOCUMENT_REQUIRED");
    if (section.status === "reviewed" && (!section.note.trim() || !section.evidence.some((e) => e.status === "verified"))) throw new Error("CONFIRMATION_REVIEW_REQUIRED");
  }
  links.forEach((e) => assertScope(record.scope, e.scope));
  return record;
}
/** Common bank/supplier register: synthetic, versioned, no outbound communication. */
export class ConfirmationRegister {
  private records = new Map<string, ConfirmationRecord[]>();
  save(record: ConfirmationRecord, expectedVersion: number, principal: Principal) {
    authorize(principal, record.scope, "prepare");
    if (record.scope.mode !== "demo") throw new Error(`${SOURCE_REQUIRED}: REAL_CONFIRMATION_DISABLED`);
    validateConfirmation(record);
    const key = stableSha256({ scope: record.scope, id: record.id }), history = this.records.get(key) ?? [];
    if (!record.id.trim() || (history.at(-1)?.version ?? 0) !== expectedVersion || record.version !== expectedVersion + 1) throw new Error("STALE_CONFIRMATION_VERSION");
    history.push(frozen(record)); this.records.set(key, history); return frozen(record);
  }
  history(scope: WorkpaperScope, id: string, principal: Principal) { authorize(principal, scope, "read"); return frozen(this.records.get(stableSha256({ scope, id })) ?? []); }
}
