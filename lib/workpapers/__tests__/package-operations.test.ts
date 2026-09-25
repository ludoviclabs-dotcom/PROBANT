import { expect, it } from "vitest";
import { createDemoHttp } from "../demo-http";
import { buildWorkpaperPackage, hashExportText } from "../package";
import { summarizeWorkpapers } from "../mission-summary";
import { DemoTelemetry, parseDemoFlags, restoreProjection, retentionPlan } from "../operations";
import { neutralizeSpreadsheetText } from "@/lib/security/export-text";
import { stableSha256 } from "@/lib/synthesis/canonical";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
function req(body: unknown) { return new Request("http://local/api/workpapers", { method: "PUT", headers: { "content-type": "application/json", "x-probant-demonstration": "synthetic-only" }, body: JSON.stringify(body) }); }
it("export figé idempotent, permissions, intégrité et rollback sans mutation", async () => {
  const h = createDemoHttp(() => true); let r = await (await h(req({ action: "create", parameters: { cycle: "clients", missingEvidence: true, methodAvailable: false } }))).json();
  expect((await h(req({ action: "export", token: r.token, version: r.run.version, note: "demo" }))).status).toBe(409);
  for (const action of ["submit", "approve", "lock", "export"]) { const res = await h(req({ action, token: r.token, version: r.run.version, note: "Synthétique sans conclusion métier" })); expect(res.status).toBe(200); r = await res.json(); }
  const again = await (await h(req({ action: "export", token: r.token, version: r.run.version, note: "demo" }))).json(); expect(again.package).toEqual(r.package);
  expect(hashExportText(r.package.json)).toBe(r.package.manifest.files[0].hash);
  const snapshot: DossierSnapshot = JSON.parse(r.package.json).snapshot, scope = snapshot.workpaperProjection!.scope;
  expect(() => buildWorkpaperPackage(snapshot, scope, null)).toThrow();
  expect(() => buildWorkpaperPackage(snapshot, { ...scope, dossierId: "OTHER" }, { id: "SYN", grants: [{ scope, permissions: ["read", "download"] }] })).toThrow();
  expect(summarizeWorkpapers(snapshot).approved).toBe(1);
  expect(() => summarizeWorkpapers({ ...snapshot, dossier: { ...snapshot.dossier, id: "OTHER" } })).toThrow();
  expect(summarizeWorkpapers(snapshot).rows[0].link).toBe(`#wp-${encodeURIComponent(r.run.id)}`);
  expect(restoreProjection(snapshot.workpaperProjection!, snapshot.workpaperProjection!)).toEqual(snapshot.workpaperProjection);
  const stale = { ...snapshot.workpaperProjection!, lockedRuns: [], sourceRevisions: [] }; const { hash: _hash, ...body } = stale; void _hash; stale.hash = stableSha256(body); expect(() => restoreProjection(stale, snapshot.workpaperProjection!)).toThrow("STALE");
});
it("neutralise textes tableurs, refuse logs sensibles et politiques inventées", () => {
  for (const value of ["=SUM(A1)", "+1+2", "-cmd", "@SUM", "\t=1", "\u0000\t@SUM"]) expect(neutralizeSpreadsheetText(value)).toBe(`'${value}`);
  expect(neutralizeSpreadsheetText("0.10")).toBe("0.10"); expect(neutralizeSpreadsheetText("")).toBe("");
  const t = new DemoTelemetry(); expect(() => t.record({ event: "export", cycle: "conges", durationMs: 1, rows: 1, status: "completed", salary: 4000 })).toThrow();
  expect(retentionPlan(null).deletionEnabled).toBe(false); expect(parseDemoFlags(undefined, undefined).enabled).toBe(false); expect(parseDemoFlags("true", "clients").disabledCycles).toEqual(["clients"]);
});
