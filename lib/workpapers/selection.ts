import { cents, money } from "@/lib/canonical-model/money";
import { stableSha256 } from "@/lib/synthesis/canonical";
import type { ImportBatch } from "./imports";
import { assertScope, frozen, type Population, type SelectionSet, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";
import { registerUnits } from "./fixed-asset-sources";

/** Invoice grouping is limited to the validated Clients open-at-closing mapping. */
export function freezePopulation(scope: WorkpaperScope, imports: ImportBatch[], unit: Population["unit"], principal: Principal): Population {
  authorize(principal, scope, "prepare");
  const invoiceUnit = unit === "invoice" && imports.filter(b => b.document.documentType === "clients_invoices").length === 1 && imports.every(b => b.mapping.version === "clients-sales-1" && !!b.mapping.sales) && imports.find(b => b.document.documentType === "clients_invoices")?.mapping.sales?.basis === "open_at_closing";
  // One bank account = one row of the single closing ledger of the validated cash mapping.
  const accountUnit = unit === "account" && imports.filter(b => b.document.documentType === "cash_ledger").length === 1 && imports.every(b => b.mapping.version === "cash-reconciliation-1" && !!b.mapping.cash) && imports.find(b => b.document.documentType === "cash_ledger")?.mapping.cash?.basis === "ledger_closing";
  // One asset / component = the lines of the single register of the validated fixed-asset mapping.
  const assetUnit = unit === "asset" && imports.filter(b => b.document.documentType === "fa_register").length === 1 && imports.every(b => b.mapping.version === "fixed-assets-1" && !!b.mapping.fixedAssets) && imports.find(b => b.document.documentType === "fa_register")?.mapping.fixedAssets?.basis === "asset_register";
  const investmentUnit=unit==='security_distribution';
  if(investmentUnit && (imports.some(b=>b.mapping.version!=='investment-review-1') || imports.filter(b=>b.document.documentType==='investment_register').length!==1)) throw Error('INVESTMENT_POPULATION_MAPPING_INVALID');
  const equityUnit = unit === "equity_decision_movement";
  if(equityUnit && (imports.some(b=>b.mapping.version !== "equity-dossier-1") || !imports.some(b=>b.document.documentType === "equity_ledger"))) throw new Error("EQUITY_POPULATION_MAPPING_INVALID");
  const payablesUnit = ["purchase_entry", "subsequent_payment"].includes(unit);
  if (payablesUnit && (imports.some(b => b.mapping.version !== "payables-investigation-1" || !b.mapping.payables) || imports.filter(b => b.document.documentType === (unit === "purchase_entry" ? "purchases_ledger" : "payables_payments")).length !== 1)) throw new Error("PAYABLE_POPULATION_MAPPING_INVALID");
  if (!investmentUnit && !payablesUnit && !equityUnit && !accountUnit && !assetUnit && unit !== "row" && !invoiceUnit) throw new Error("GROUPED_POPULATION_MAPPING_NOT_VALIDATED");
  if (!imports.length || new Set(imports.map((b) => b.id)).size !== imports.length) throw new Error("POPULATION_IMPORTS_INVALID");
  imports.forEach((b) => { assertScope(scope, b.scope); if (!b.approval || !b.report.calculationAllowed || b.report.blocking.length) throw new Error("POPULATION_IMPORT_UNAPPROVED"); });
  const populationImports = investmentUnit ? imports.filter(b=>["investment_register","investment_distributions"].includes(b.document.documentType)) : equityUnit ? imports.filter(b=>["equity_ledger","equity_decisions"].includes(b.document.documentType)) : payablesUnit ? imports.filter(b => b.document.documentType === (unit === "purchase_entry" ? "purchases_ledger" : "payables_payments")) : unit === "invoice" ? imports.filter(b => b.document.documentType === "clients_invoices") : unit === "account" ? imports.filter(b => b.document.documentType === "cash_ledger") : imports;
  const items = unit === "asset" ? registerUnits(imports.find(b => b.document.documentType === "fa_register")!).map(u => {
    // The population measure is the gross closing value; an asset without one is refused rather than counted as zero.
    if (!u.grossClosing) throw new Error("FA_GROSS_CLOSING_REQUIRED");
    return { id: u.unitId, rowIds: u.rowIds, amount: u.grossClosing };
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : populationImports.flatMap((b) => b.rows.map((r) => {
    assertScope(scope, r.scope);
    if (!r.normalized || r.errors.length) throw new Error("POPULATION_ROW_INVALID");
    return { id: r.id, rowIds: [r.id], amount: r.normalized.amount };
  })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  // A second mapping of the same source must not silently count the same row twice.
  if (!items.length || new Set(items.map((i) => i.id)).size !== items.length) throw new Error("POPULATION_EMPTY_OR_DUPLICATE");
  const body = { scope, importIds: imports.map((b) => b.id).sort(), unit, items };
  const hash = stableSha256(body);
  return frozen({ ...body, hash, id: `population-${hash}` });
}
export interface SelectionRequest {
  method: "targeted" | "random"; criteria: string; requestedSize: number;
  exclusions: { id: string; reason: string }[]; selectedIds?: string[]; seed?: string;
}
export function selectPopulation(population: Population, request: SelectionRequest, principal: Principal): SelectionSet {
  authorize(principal, population.scope, "prepare");
  const { id: _id, hash, ...body } = population;
  void _id;
  if (stableSha256(body) !== hash || population.id !== `population-${hash}`) throw new Error("POPULATION_HASH_INVALID");
  if (!["targeted", "random"].includes(request.method)) throw new Error("STATISTICAL_SELECTION_DISABLED");
  if (!request.criteria.trim() || !Number.isSafeInteger(request.requestedSize) || request.requestedSize < 1) throw new Error("SELECTION_SIZE_OR_CRITERIA_INVALID");
  const all = new Set(population.items.map((i) => i.id));
  if (new Set(request.exclusions.map((e) => e.id)).size !== request.exclusions.length || request.exclusions.some((e) => !e.reason.trim() || !all.has(e.id))) throw new Error("EXCLUSIONS_INVALID");
  const exclusions = [...request.exclusions].sort((a, b) => a.id < b.id ? -1 : 1);
  const eligible = population.items.filter((i) => !exclusions.some((e) => e.id === i.id));
  if (request.requestedSize > eligible.length) throw new Error("SELECTION_SIZE_EXCEEDS_POPULATION");
  let selectedIds: string[];
  if (request.method === "random") {
    if (!request.seed?.trim() || request.selectedIds) throw new Error("RANDOM_SEED_REQUIRED");
    selectedIds = eligible.map((i) => ({ id: i.id, rank: stableSha256({ seed: request.seed, populationHash: hash, id: i.id }) }))
      .sort((a, b) => a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : 1).slice(0, request.requestedSize).map((i) => i.id);
  } else {
    selectedIds = [...(request.selectedIds ?? [])].sort();
    if (request.seed || selectedIds.length !== request.requestedSize || new Set(selectedIds).size !== selectedIds.length || selectedIds.some((id) => !eligible.some((i) => i.id === id))) throw new Error("TARGETED_SELECTION_INVALID");
  }
  const selection = { scope: population.scope, populationHash: hash, method: request.method, criteria: request.criteria,
    exclusions, requestedSize: request.requestedSize, validatedBy: principal.id, seed: request.seed,
    algorithm: request.method === "random" ? "sha256-rank-v1" : "explicit-ids-v1", selectedIds,
    selectedAmount: money(selectedIds.reduce((n, id) => n + cents(population.items.find((i) => i.id === id)!.amount), 0n)),
    limitations: ["Taille fournie et validée par le préparateur ; aucune assurance statistique ni extrapolation.", `Dénominateur : ${population.items.length} ${population.unit === "invoice" ? "factures" : population.unit === "account" ? "comptes" : population.unit === "asset" ? "actifs ou composants" : "lignes"} ; ${eligible.length} éligibles après exclusions.`] };
  return frozen({ ...selection, id: `selection-${stableSha256(selection)}` });
}
export function validateSelectionSources(population: Population, selection: SelectionSet, imports: ImportBatch[]): void {
  assertScope(population.scope, selection.scope);
  const principal: Principal = { id: selection.validatedBy, grants: [{ scope: population.scope, permissions: ["prepare"] }] };
  const rebuilt = freezePopulation(population.scope, imports, population.unit, principal);
  if (stableSha256(rebuilt) !== stableSha256(population)) throw new Error("POPULATION_SOURCES_CHANGED");
  const expected = selectPopulation(population, { method: selection.method, criteria: selection.criteria, requestedSize: selection.requestedSize,
    exclusions: selection.exclusions, seed: selection.seed, selectedIds: selection.method === "targeted" ? selection.selectedIds : undefined }, principal);
  if (stableSha256(expected) !== stableSha256(selection)) throw new Error("SELECTION_CHANGED");
}
