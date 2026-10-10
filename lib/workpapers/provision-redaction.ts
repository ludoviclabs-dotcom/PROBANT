import type { ImportBatch } from "./imports";
import type { WorkpaperRun } from "./model";
import { PV_MASKED, type ProvisionResult } from "./provision-contract";
import { provisionMappingSchema } from "./provision-sources";

/**
 * Server-side masking of confidential content (Mission 16). A reader without the dedicated capability receives a
 * projection where confidential descriptions, scenarios, estimates and piece labels are REMOVED from the response —
 * not hidden by CSS. Stored runs, hashes and sources are never altered.
 */
export interface ConfidentialContext { events: Set<string>; pieces: Set<string>; registerKnown: boolean }
const YES = new Set(["oui", "o", "yes", "true", "1"]);
const flag = (v: string | undefined) => YES.has((v ?? "").trim().toLowerCase());
const masked = { kind: "unknown" as const, reason: "Montant masqué — habilitation confidentielle requise" };

/** Confidential events and pieces declared by every register and piece list of the dossier, whatever their version. */
export function confidentialContext(batches: ImportBatch[]): ConfidentialContext {
  const events = new Set<string>(), pieces = new Set<string>();
  let registerKnown = false;
  for (const b of batches) {
    const parsed = provisionMappingSchema.safeParse(b.mapping);
    if (!parsed.success) continue;
    const f = parsed.data.provisions;
    if (b.document.documentType === "pv_register") { registerKnown = true; for (const r of b.rows) if (r.normalized && flag(r.original[f.confidentialColumn ?? ""])) events.add(r.normalized.key.trim()); }
    if (b.document.documentType === "pv_support") for (const r of b.rows) if (r.normalized && flag(r.original[f.confidentialColumn ?? ""])) pieces.add(r.normalized.key.trim());
  }
  return { events, pieces, registerKnown };
}
const maskColumns = (original: Record<string, string>, columns: (string | undefined)[]) => Object.fromEntries(Object.entries(original).map(([k, v]) => [k, columns.includes(k) && v.trim() ? PV_MASKED : v]));

/** Rows of a source as a reader without the capability may see them; `maskedRows` counts the rows withheld entirely. */
export function redactProvisionBatch<T extends ImportBatch>(batch: T, ctx: ConfidentialContext): T & { maskedRows?: number } {
  const parsed = provisionMappingSchema.safeParse(batch.mapping);
  if (!parsed.success) return batch;
  const f = parsed.data.provisions, type = batch.document.documentType;
  const own = (r: ImportBatch["rows"][number]) => flag(r.original[f.confidentialColumn ?? ""]);
  const eventOf = (r: ImportBatch["rows"][number]) => (r.original[f.eventColumn ?? ""] ?? "").trim();
  if (type === "pv_register") return { ...batch, rows: batch.rows.map(r => own(r) ? { ...r, original: maskColumns(r.original, [f.obligationColumn, f.counterpartyColumn, f.methodColumn, f.decisionColumn]) } : r) };
  if (type === "pv_support") return { ...batch, rows: batch.rows.map(r => own(r) ? { ...r, original: maskColumns(r.original, [f.labelColumn]) } : r) };
  if (type === "pv_movements") return { ...batch, rows: batch.rows.map(r => ctx.events.has(eventOf(r)) ? { ...r, original: maskColumns(r.original, [f.justificationColumn, f.labelColumn]) } : r) };
  if (type === "pv_estimates") {
    // An estimate row carries its amount in the normalized pivot: a confidential row is withheld whole, never zeroed.
    const kept = batch.rows.filter(r => ctx.registerKnown && !ctx.events.has(eventOf(r)));
    return { ...batch, rows: kept, maskedRows: batch.rows.length - kept.length };
  }
  return batch;
}
/** True when the original bytes of this source contain confidential content: their download then requires the capability. */
export function provisionBatchConfidential(batch: ImportBatch, ctx: ConfidentialContext) {
  const parsed = provisionMappingSchema.safeParse(batch.mapping);
  if (!parsed.success) return false;
  const f = parsed.data.provisions, type = batch.document.documentType;
  if (type === "pv_register" || type === "pv_support") return batch.rows.some(r => flag(r.original[f.confidentialColumn ?? ""]));
  if (type === "pv_estimates") return !ctx.registerKnown || batch.rows.some(r => ctx.events.has((r.original[f.eventColumn ?? ""] ?? "").trim()));
  if (type === "pv_movements") return batch.rows.some(r => ctx.events.has((r.original[f.eventColumn ?? ""] ?? "").trim()) && !!(r.original[f.justificationColumn ?? ""] ?? "").trim());
  return false;
}

/** The provisions result as a reader without the capability may see it. */
export function redactProvisionResult(result: ProvisionResult): ProvisionResult {
  const confidentialPieces = new Set(result.events.flatMap(e => e.pieces.filter(p => p.confidential).map(p => p.key)));
  return {
    ...result,
    events: result.events.map(e => {
      const pieces = e.pieces.map(p => p.confidential ? { ...p, label: null } : p);
      const chronology = e.chronology.map(c => c.kind === "estimation" && e.confidential ? { ...c, label: "Estimation — " + PV_MASKED }
        : c.kind === "piece" && [...confidentialPieces].some(k => c.label.includes(" " + k)) ? { ...c, label: c.label.replace(/ — .*$/, "") + " — libellé masqué" } : c);
      if (!e.confidential) return { ...e, pieces, chronology };
      return { ...e, masked: true, obligation: null, counterparty: null, method: null, decision: null, estimates: [], retainedEstimateCents: null, estimateDifferenceCents: null, pieces, chronology,
        annex: { ...e.annex, lines: e.annex.lines.map(l => l.referenceKind === "estimate" ? { ...l, referenceCents: null, differenceCents: null } : l) } };
    }),
    exceptions: result.exceptions.map(x => x.sensitive ? { ...x, message: "Contenu relatif à un événement confidentiel — " + PV_MASKED + ".", amount: masked } : x),
  };
}
/**
 * A run as a reader without the capability may see it: masked result, masked copy of the source rows the calculation
 * kept as its input, and masked notes on sensitive exceptions or confidential events.
 */
export function redactProvisionRun(run: WorkpaperRun, batches: ImportBatch[]): WorkpaperRun {
  const result = run.result?.execution === "completed" && run.template.id === "provisions.register" ? run.result.result as ProvisionResult : null;
  if (!result) return run;
  const ctx = confidentialContext(batches);
  const input = run.result!.input as { imports?: { id: string; rows: ImportBatch["rows"] }[] } | undefined;
  const inputImports = input?.imports?.map(i => { const batch = batches.find(b => b.id === i.id); return { ...i, rows: batch ? redactProvisionBatch({ ...batch, rows: i.rows }, ctx).rows : [] }; });
  const sensitive = new Set(result.exceptions.filter(x => x.sensitive).map(x => "pv-exception:" + x.id));
  const confidential = new Set(result.events.filter(e => e.confidential).map(e => e.eventId));
  const hidden = (noteId: string) => sensitive.has(noteId) || [...confidential].some(id => noteId.startsWith("pv-event:" + id + ":"));
  return {
    ...run,
    result: { ...run.result!, result: redactProvisionResult(result), ...(inputImports ? { input: { ...input, imports: inputImports } } : {}) },
    notes: run.notes.map(n => hidden(n.id) ? { ...n, text: n.text.split(" — ")[0] + " — " + PV_MASKED, amount: masked, ...(n.resolution ? { resolution: { ...n.resolution, text: PV_MASKED } } : {}) } : n),
  };
}
