import { z } from "zod";
import { cents } from "@/lib/canonical-model/money";
import { isCivilDate, type AccountingPeriod } from "@/lib/canonical-model/period";
import { assertFields, LEASE_DICTIONARY } from "@/lib/ifrs/leases/dictionary";
import type { LeaseFacts, SourceFact } from "@/lib/ifrs/leases/qualification";
import type { ImportBatch, ImportMapping } from "./imports";
import { assertScope, type NoteCitation, type Population } from "./model";
import { LEASE_CONTRACT_ID } from "./lease-work";

/**
 * Sources de l'atelier « Locations IFRS 16 » sur le store « Clients » (C00 § 3, D05). Mapping fermé `ifrs16-leases-2` (L16-01) :
 * colonnes `Key;Amount;Date;Details`, lues par l'import existant ; `Details` porte le contrat, la pièce citée et les champs du dictionnaire
 * (`lib/ifrs/leases/dictionary.ts`). Une valeur mal formée ou un champ inconnu rejette la source ; un vide ou un jeton se qualifie ensuite.
 */
export const LEASE_TYPES = ["lease_contracts", "lease_assumptions", "lease_schedule", "lease_ledger", "lease_opening"] as const;
export type LeaseType = typeof LEASE_TYPES[number];
/** Requis au gel : contrats, hypothèses et échéances. Le grand livre sert au cadrage, l'ouverture à une reprise historique. */
export const LEASE_REQUIRED_TYPES: readonly LeaseType[] = ["lease_contracts", "lease_assumptions", "lease_schedule"];
export const LEASE_MAPPING_VERSION = "ifrs16-leases-2";
export const LEASE_MAPPING: ImportMapping = { version: LEASE_MAPPING_VERSION, headerRow: 1, delimiter: ";", decimal: ".", dateFormat: "ISO", currency: "EUR", sign: 1, columns: { key: "Key", amount: "Amount", date: "Date" } };
export const leaseMappingSchema = z.object({ version: z.literal(LEASE_MAPPING_VERSION), headerRow: z.number().int().positive(), sheet: z.string().max(200).optional(), delimiter: z.literal(";"), decimal: z.literal("."),
  dateFormat: z.literal("ISO"), currency: z.literal("EUR"), sign: z.literal(1), columns: z.object({ key: z.literal("Key"), amount: z.literal("Amount"), date: z.literal("Date") }).strict() }).strict();
const text = z.string().trim().min(1).max(500);
const detailsSchema = z.object({
  contractId: z.string().regex(LEASE_CONTRACT_ID).optional(),
  /** Pièce d'origine de la ligne : titre, pack, date de la pièce, page et clause. */
  source: z.object({ title: text, pack: text, date: z.string().refine(isCivilDate), page: z.number().int().positive().nullable(), clause: text }).strict(),
  fields: z.record(z.string().regex(/^[a-z][a-zA-Z0-9_]{0,63}$/), z.string().trim().min(1).max(2000)).refine(f => Object.keys(f).length <= 60).optional(),
}).strict();
export type LeaseDetails = z.infer<typeof detailsSchema>;
export function leaseDetails(raw: string | undefined): LeaseDetails {
  let value: unknown;
  try { value = JSON.parse(raw ?? ""); } catch { throw new Error("L16_IMPORT_SCHEMA_INVALID"); }
  const parsed = detailsSchema.safeParse(value);
  if (!parsed.success) throw new Error("L16_IMPORT_SCHEMA_INVALID");
  return parsed.data;
}
export const isLeaseType = (type: string): type is LeaseType => (LEASE_TYPES as readonly string[]).includes(type);
/** Types dont la clé de ligne est l'identifiant du contrat : une ligne par contrat. */
const KEYED_BY_CONTRACT: readonly LeaseType[] = ["lease_contracts", "lease_assumptions", "lease_opening"];

/**
 * Source approuvable : mapping fermé, lignes normalisées sans erreur, clé unique, pièce citée et datée au plus tard à la date de revue,
 * champs du dictionnaire seulement.
 * - Contrats, hypothèses, ouverture : la clé est l'identifiant du contrat ; un doublon de contrat est refusé (`L16_DUPLICATE_CONTRACT`, X26).
 * - Contrats : le montant est la somme des loyers fixes non actualisés déclarée par la pièce, jamais négative.
 * - Échéances : chaque ligne nomme son contrat, montant dû positif ou nul. Le grand livre peut porter des lignes non rattachées.
 */
export function assertLeaseBatch(batch: ImportBatch, period: AccountingPeriod) {
  if (!leaseMappingSchema.safeParse(batch.mapping).success) throw new Error("L16_IMPORT_SCHEMA_INVALID");
  const type = batch.document.documentType;
  if (!isLeaseType(type)) throw new Error("L16_IMPORT_SCHEMA_INVALID");
  if (!batch.rows.length) throw new Error("L16_IMPORT_SCHEMA_INVALID");
  const keys = new Set<string>();
  for (const row of batch.rows) {
    assertScope(batch.scope, row.scope);
    if (!row.normalized || row.errors.length) throw new Error("L16_IMPORT_SCHEMA_INVALID");
    if (keys.has(row.normalized.key)) throw new Error(KEYED_BY_CONTRACT.includes(type) ? "L16_DUPLICATE_CONTRACT" : "L16_IMPORT_SCHEMA_INVALID");
    keys.add(row.normalized.key);
    const d = leaseDetails(row.original.Details);
    if (d.source.date > period.asOfDate) throw new Error("L16_IMPORT_SCHEMA_INVALID");
    assertFields(type, d.fields);
    if (KEYED_BY_CONTRACT.includes(type) && (d.contractId !== row.normalized.key || !LEASE_CONTRACT_ID.test(row.normalized.key))) throw new Error("L16_CONTRACT_INVALID");
    if (type === "lease_contracts" && cents(row.normalized.amount) < 0n) throw new Error("L16_CONTRACT_INVALID");
    if (type === "lease_schedule" && (!d.contractId || cents(row.normalized.amount) < 0n)) throw new Error("L16_IMPORT_SCHEMA_INVALID");
  }
}

/** Population « un contrat » : les lignes du seul registre de contrats du mapping Locations. */
export function isLeasePopulation(imports: ImportBatch[]) {
  return imports.every(b => b.mapping.version === LEASE_MAPPING_VERSION && isLeaseType(b.document.documentType)) && imports.filter(b => b.document.documentType === "lease_contracts").length === 1;
}
export function leasePopulationItems(imports: ImportBatch[]): Population["items"] {
  const contracts = imports.find(b => b.document.documentType === "lease_contracts")!;
  return contracts.rows.map(r => {
    if (!r.normalized || r.errors.length) throw new Error("POPULATION_ROW_INVALID");
    return { id: r.normalized.key, rowIds: [r.id], amount: r.normalized.amount };
  }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Faits sources des lots approuvés, une seule tête par type, avec la preuve de chaque ligne (pièce, version, ligne). */
export function leaseFacts(batches: ImportBatch[]): LeaseFacts {
  const out: LeaseFacts = { lease_contracts: [], lease_assumptions: [], lease_schedule: [], lease_ledger: [], lease_opening: [] };
  const seen = new Set<string>();
  for (const b of batches) {
    const type = b.document.documentType;
    if (!isLeaseType(type) || !b.approval) continue;
    if (seen.has(type)) throw new Error("L16_CURRENT_SOURCES_REQUIRED");
    seen.add(type);
    for (const r of b.rows) {
      if (!r.normalized || r.errors.length) throw new Error("L16_IMPORT_SCHEMA_INVALID");
      const d = leaseDetails(r.original.Details);
      const fact: SourceFact = { key: r.normalized.key, ...(d.contractId ? { contractId: d.contractId } : {}), amount: r.normalized.amount, date: r.normalized.date, fields: { ...(d.fields ?? {}) },
        source: d.source, proof: { importId: b.id, documentVersionId: b.document.id, rowId: r.id, fileName: b.document.fileName, sha256: b.document.byteHash, ...(r.locator.row ? { row: r.locator.row } : {}) } };
      out[type].push(fact);
    }
  }
  for (const type of LEASE_TYPES) out[type].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}
export { LEASE_DICTIONARY };

/** Citation d'une ligne approuvée d'une source Locations admise ; résolue par le serveur, jamais saisie par le navigateur. */
export function resolveLeaseCitation(imports: ImportBatch[], allowedImportIds: readonly string[], ref: { documentVersionId: string; rowId: string }): NoteCitation {
  const batch = imports.find(b => allowedImportIds.includes(b.id) && b.approval && isLeaseType(b.document.documentType) && b.document.id === ref.documentVersionId);
  const row = batch?.rows.find(r => r.id === ref.rowId);
  if (!batch || !row || row.errors.length) throw new Error("L16_CITATION_INVALID");
  return { documentVersionId: batch.document.id, importId: batch.id, fileName: batch.document.fileName, sha256: batch.document.byteHash, rowId: row.id, ...(row.locator.row ? { row: row.locator.row } : {}) };
}
