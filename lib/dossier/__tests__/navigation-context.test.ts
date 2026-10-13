import { describe, expect, it } from "vitest";
import { periodId } from "@/lib/workpapers/model";
import { buildDemoDossierSnapshot } from "../snapshot-builder";
import { navigationContext, contextParams, parseNavigationContext, withDossierContext, switchDossierContext, type DossierNavigationContext } from "../navigation-context";

const period = { startDate: "2024-04-01", closingDate: "2025-03-31", asOfDate: "2025-06-30", currency: "EUR" as const, validation: "provisional" as const };
const context: DossierNavigationContext = { organizationId: "org-local", dossierId: "dossier-avril", entity: { label: "Entité A", siren: null },
  exercise: { label: "2024–2025", startDate: period.startDate, closingDate: period.closingDate }, reference: "pcg-version-dossier", mode: "local_persistent",
  procedurePeriod: { kind: "exercise", startDate: period.startDate, endDate: period.closingDate, asOfDate: period.asOfDate, id: periodId(period) } };
describe("C01 contexte de navigation", () => {
  it("preserves a non-calendar exercise, reference and exact run version in both directions", () => {
    const href = withDossierContext("/clients-framing?id=run-a&version=12&filter=evidence#proof", context), url = new URL(href, "http://local");
    expect(parseNavigationContext(url.searchParams)).toEqual(context);
    expect(url.searchParams.get("version")).toBe("12"); expect(url.hash).toBe("#proof");
    expect(parseNavigationContext(new URL(withDossierContext("/dashboard/synthese", context), "http://local").searchParams)).toEqual(context);
  });
  it("does not invent the beginning or review date of historical DEMO SA", () => {
    const snapshot = buildDemoDossierSnapshot(), c = navigationContext(snapshot, { organizationId: "demo", dossierId: snapshot.dossier.id });
    expect(c.entity.label).toBe("DEMO SA"); expect(c.exercise).toEqual({ label: "2024", startDate: null, closingDate: "2024-12-31" });
    expect(c.procedurePeriod).toBeNull(); expect(parseNavigationContext(contextParams(c))).toEqual(c);
  });
  it("keeps the TVA month separate from the annual store scope", () => {
    const monthly = { ...context, procedurePeriod: { ...context.procedurePeriod!, kind: "vat" as const, startDate: "2024-12-01", endDate: "2024-12-31" } };
    const parsed = parseNavigationContext(contextParams(monthly))!;
    expect(parsed.exercise.startDate).toBe("2024-04-01"); expect(parsed.procedurePeriod!.startDate).toBe("2024-12-01"); expect(parsed.procedurePeriod!.id).toBe(periodId(period));
  });
  it("rejects impossible civil dates, duplicate identity keys, missing periods and a month outside the exercise", () => {
    for (const change of [(q: URLSearchParams) => q.set("exerciseStart", "2024-02-30"), (q: URLSearchParams) => q.append("dossierId", "another"),
      (q: URLSearchParams) => q.delete("procedurePeriod"), (q: URLSearchParams) => { q.set("procedurePeriod", "payroll"); q.set("procedureStart", "2023-12-01"); }]) {
      const q = contextParams(context); change(q); expect(() => parseNavigationContext(q)).toThrow();
    }
  });
  it("rejects a store period from another exercise", () => {
    const q = contextParams(context); q.set("periodId", periodId({ ...period, startDate: "2025-04-01", closingDate: "2026-03-31" }));
    expect(() => parseNavigationContext(q)).toThrow(/incompatible/);
  });
  it("preserves the legacy display mode and keeps the dossier mode in its own key", () => {
    const url = new URL(withDossierContext("/dashboard/cloisons?mode=live", context), "http://local");
    expect(url.searchParams.get("mode")).toBe("live"); expect(url.searchParams.get("dossierMode")).toBe("local_persistent"); expect(parseNavigationContext(url.searchParams)).toEqual(context);
  });
  it("preserves context through login and uses the declarative month only for TVA", () => {
    const login = new URL(withDossierContext("/api/auth/login?returnTo=" + encodeURIComponent("/clients-framing/synthesis"), context), "http://local");
    expect(parseNavigationContext(new URL(login.searchParams.get("returnTo")!, "http://local").searchParams)).toEqual(context);
    const vat = new URL(withDossierContext("/fiscal?tax=vat&period=2024-12-01_2024-12-31", context), "http://local");
    const monthly = parseNavigationContext(vat.searchParams)!; expect(monthly.procedurePeriod!.kind).toBe("vat"); expect(monthly.exercise.startDate).toBe("2024-04-01");
    const clients = new URL(withDossierContext("/clients-framing", monthly), "http://local");
    expect(parseNavigationContext(clients.searchParams)!.procedurePeriod!.kind).toBe("exercise");
  });
  it("drops run, root, version, proof and TVA month on an explicit exercise switch", () => {
    const next = { ...context, dossierId: "dossier-suivant", exercise: { label: "2025–2026", startDate: "2025-04-01", closingDate: "2026-03-31" }, procedurePeriod: null };
    const url = new URL(switchDossierContext("/clients-framing?id=old&version=12&rootId=old&item=proof&tax=vat&period=2024-12-01_2024-12-31", next), "http://local");
    for (const key of ["id", "version", "rootId", "item", "tax", "period", "periodId"]) expect(url.searchParams.has(key)).toBe(false);
    expect(parseNavigationContext(url.searchParams)).toEqual(next);
  });
  it("does not stamp another dossier or period, API downloads, remote URLs or blobs", () => {
    for (const href of ["/stocks?dossierId=other", "/stocks?dossier=other", "/stocks?organization=other", "/fiscal?periodId=other", "/api/workpapers/clients?operation=download&id=proof", "https://example.test", "//example.test", "blob:proof"])
      expect(withDossierContext(href, context)).toBe(href);
  });
  it("does not display an independent scenario or recipe under the current dossier identity", () => {
    for (const href of ["/dashboard/risques?scenario=beta", "/equity?demo=1", "/resultat-exceptionnel?demo=1&case=old"])
      expect(withDossierContext(href, context)).toBe(href);
  });
});
