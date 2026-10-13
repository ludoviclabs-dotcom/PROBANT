/** Compatibility projections; definitions and scope live in the capability registry. */
import { reconciliationCycles, reconciliationDocuments } from "@/lib/capabilities/registry";
import type { AuditCycle, DocumentType } from "@/lib/capabilities/reconciliation-definitions";
export type { AuditCycle, DocumentType, DocumentFormatAccepte, ChampMappage } from "@/lib/capabilities/reconciliation-definitions";
export const AUDIT_CYCLES: AuditCycle[] = reconciliationCycles();
export const DOCUMENT_TYPES: DocumentType[] = reconciliationDocuments();
export function documentTypesForCycle(cycleId: string): DocumentType[] { return DOCUMENT_TYPES.filter(d => d.cycleId === cycleId); }
export function cycleById(id: string): AuditCycle | undefined { return AUDIT_CYCLES.find(c => c.id === id); }
