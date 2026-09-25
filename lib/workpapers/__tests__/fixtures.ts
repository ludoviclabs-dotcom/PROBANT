import { periodId, type WorkpaperRun, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
export const period = { startDate: "2023-07-01", closingDate: "2024-06-30", asOfDate: "2024-07-31", currency: "EUR" as const, validation: "provisional" as const };
export const scope: WorkpaperScope = { organizationId: "synthetic", dossierId: "D1", periodId: periodId(period), mode: "demo" };
export const preparer: Principal = { id: "preparer", grants: [{ scope, permissions: ["read", "prepare", "download"] }] };
export const reviewer: Principal = { id: "reviewer", grants: [{ scope, permissions: ["read", "review", "download"] }] };
export function fixtureRun(overrides: Partial<WorkpaperRun> = {}): WorkpaperRun {
  return { id: "WP1", rootId: "WP1", revision: 1, version: 1, schemaVersion: "1.0.0", scope, period,
    template: { id: "synthetic.manual", version: "1", objective: "Synthetic pipeline, not an audit procedure", kind: "manual", assertions: [{ label: "Non défini", validation: "unknown" }], requiredDocumentTypes: [] },
    state: "draft", preparedBy: preparer.id, importIds: [], evidence: [], findings: [], notes: [], events: [], ...overrides };
}
