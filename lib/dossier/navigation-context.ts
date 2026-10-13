import type { DossierContext, DossierSnapshot } from "./types";
import { isCivilDate, type AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId } from "@/lib/workpapers/model";
import type { CapabilityMode } from "@/lib/capabilities/registry";

/** Navigation identity, not an authorization token or an accounting result. Unknown dates stay null. */
export interface DossierNavigationContext extends DossierContext {
  entity: { label: string; siren: string | null };
  exercise: { label: string; startDate: string | null; closingDate: string | null };
  reference: string;
  mode: CapabilityMode;
  procedurePeriod: { kind: "exercise" | "vat" | "payroll"; startDate: string; endDate: string; asOfDate: string; id: string } | null;
}
export const NAVIGATION_CONTEXT_VERSION = "1";
export const CONTEXT_KEYS = ["context", "organizationId", "dossierId", "entity", "siren", "exercise", "exerciseStart", "exerciseEnd", "reference", "dossierMode", "procedurePeriod", "procedureStart", "procedureEnd", "reviewDate", "periodId"] as const;
/** Only scope changes resolve a dossier again; view filters must preserve mounted work. */
export function dossierResolutionKey(params: URLSearchParams): string {
  const scope = new URLSearchParams();
  for (const key of [...CONTEXT_KEYS, "dossier", "organization", "scenario"]) {
    for (const value of params.getAll(key)) scope.append(key, value);
  }
  return scope.toString();
}
export function navigationContext(snapshot: DossierSnapshot, context: DossierContext): DossierNavigationContext {
  const d = snapshot.dossier, p = d.period;
  const close = d.societe.dateCloture.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  const procedurePeriod = p && isCivilDate(p.startDate) && isCivilDate(p.closingDate) && isCivilDate(p.asOfDate)
    ? { kind: "exercise" as const, startDate: p.startDate, endDate: p.closingDate, asOfDate: p.asOfDate, id: periodId(p) } : null;
  return { ...context, entity: { label: d.societe.raisonSociale, siren: d.societe.siren || null },
    exercise: { label: d.societe.exercice, startDate: p?.startDate ?? null, closingDate: p?.closingDate ?? (isCivilDate(close) ? close : null) },
    reference: d.referentielVersion, mode: snapshot.sourceKind === "persistent" ? "local_persistent" : d.demoMode && (d.id.startsWith("demo-scenario-") || d.id.startsWith("SYN-")) ? "scenario" : "historical", procedurePeriod };
}
export function contextParams(c: DossierNavigationContext): URLSearchParams {
  const q = new URLSearchParams({ context: NAVIGATION_CONTEXT_VERSION, organizationId: c.organizationId, dossierId: c.dossierId, entity: c.entity.label,
    exercise: c.exercise.label, reference: c.reference, dossierMode: c.mode });
  if (c.entity.siren) q.set("siren", c.entity.siren);
  if (c.exercise.startDate) q.set("exerciseStart", c.exercise.startDate);
  if (c.exercise.closingDate) q.set("exerciseEnd", c.exercise.closingDate);
  if (c.procedurePeriod) for (const [key, value] of Object.entries({ procedurePeriod: c.procedurePeriod.kind, procedureStart: c.procedurePeriod.startDate,
    procedureEnd: c.procedurePeriod.endDate, reviewDate: c.procedurePeriod.asOfDate, periodId: c.procedurePeriod.id })) q.set(key, value);
  return q;
}
export function parseNavigationContext(q: URLSearchParams): DossierNavigationContext | null {
  if (!q.has("context")) return null;
  if (q.get("context") !== NAVIGATION_CONTEXT_VERSION || CONTEXT_KEYS.some(k => q.getAll(k).length > 1)) throw new Error("Contexte de navigation invalide.");
  const text = (k: string, required = true) => { const value = q.get(k)?.trim() ?? ""; if ((required && !value) || value.length > 300) throw new Error("Contexte incomplet : " + k); return value; };
  const date = (k: string) => { const v = text(k, false); if (v && !isCivilDate(v)) throw new Error("Date de contexte invalide."); return v || null; };
  const mode = text("dossierMode");
  if (!["historical", "scenario", "local_persistent"].includes(mode)) throw new Error("Mode de dossier invalide.");
  const startDate = date("exerciseStart"), closingDate = date("exerciseEnd");
  if (startDate && closingDate && startDate > closingDate) throw new Error("Exercice inversé.");
  const c: DossierNavigationContext = { organizationId: text("organizationId"), dossierId: text("dossierId"), entity: { label: text("entity"), siren: text("siren", false) || null },
    exercise: { label: text("exercise"), startDate, closingDate }, reference: text("reference"), mode: mode as CapabilityMode, procedurePeriod: null };
  const kind = text("procedurePeriod", false);
  if (kind) {
    const start = date("procedureStart"), end = date("procedureEnd"), review = date("reviewDate");
    if (!["exercise", "vat", "payroll"].includes(kind) || !start || !end || !review || start > end || end > review || !startDate || !closingDate || start < startDate || end > closingDate) throw new Error("Période de procédure hors exercice ou incomplète.");
    if (kind === "exercise" && (start !== startDate || end !== closingDate)) throw new Error("La période annuelle ne correspond pas à l’exercice.");
    const id = periodId({ startDate: startDate, closingDate, asOfDate: review, currency: "EUR", validation: "provisional" });
    if (text("periodId") !== id) throw new Error("Identifiant de période incompatible avec l’exercice.");
    c.procedurePeriod = { kind: kind as "exercise" | "vat" | "payroll", startDate: start, endDate: end, asOfDate: review, id };
  } else if (["procedureStart", "procedureEnd", "reviewDate", "periodId"].some(k => q.has(k))) throw new Error("Nature de période absente.");
  return c;
}
export function accountingPeriodFromContext(c: DossierNavigationContext | null): AccountingPeriod | undefined {
  if (!c?.exercise.startDate || !c.exercise.closingDate || !c.procedurePeriod) return undefined;
  return { startDate: c.exercise.startDate, closingDate: c.exercise.closingDate, asOfDate: c.procedurePeriod.asOfDate, currency: "EUR", validation: "provisional" };
}
export function withDossierContext(href: string, c: DossierNavigationContext | null): string {
  if (!c || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/viewer")) return href;
  const url = new URL(href, "http://probant.local");
  if (url.pathname === "/api/auth/login" && url.searchParams.has("returnTo")) {
    url.searchParams.set("returnTo", withDossierContext(url.searchParams.get("returnTo")!, c));
    return url.pathname + "?" + url.searchParams;
  }
  if (url.pathname.startsWith("/api/")) return href;
  // These links deliberately open a different scenario/independent recipe, never under the current dossier identity.
  if (url.searchParams.has("scenario") || url.searchParams.get("demo") === "1") return href;
  // A server link to another scope never inherits the current entity or exercise.
  const dossier = url.searchParams.get("dossierId") ?? url.searchParams.get("dossier"), organization = url.searchParams.get("organizationId") ?? url.searchParams.get("organization");
  if ((dossier && dossier !== c.dossierId) || (organization && organization !== c.organizationId) || (url.searchParams.has("periodId") && url.searchParams.get("periodId") !== c.procedurePeriod?.id)) return href;
  let target = c;
  const range = url.searchParams.get("period");
  if (url.pathname.startsWith("/fiscal") && url.searchParams.get("tax") === "vat" && range && /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(range) && c.procedurePeriod) {
    target = { ...c, procedurePeriod: { ...c.procedurePeriod, kind: "vat", startDate: range.slice(0, 10), endDate: range.slice(11) } };
  } else if (!url.pathname.startsWith("/dashboard") && !url.pathname.startsWith("/fiscal") && !url.pathname.startsWith("/paie-personnel") && c.procedurePeriod && c.exercise.startDate && c.exercise.closingDate) {
    target = { ...c, procedurePeriod: { ...c.procedurePeriod, kind: "exercise", startDate: c.exercise.startDate, endDate: c.exercise.closingDate } };
  }
  for (const [key, value] of contextParams(target)) if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  return url.pathname + "?" + url.searchParams + url.hash;
}
/** Change scope deliberately: old run, version, proof and declarative period are not transferable. */
export function switchDossierContext(path: string, c: DossierNavigationContext): string {
  return new URL(path, "http://probant.local").pathname + "?" + contextParams(c);
}

export function periodHintFromSearch(params: Record<string, string | string[] | undefined>): AccountingPeriod | undefined {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string") q.set(k, v); else if (v) v.forEach(value => q.append(k, value));
  try { return accountingPeriodFromContext(parseNavigationContext(q)); } catch { return undefined; }
}
