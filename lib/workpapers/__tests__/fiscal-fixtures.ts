import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { periodId, type WorkpaperScope } from "../model";
import type { Principal } from "../policy";
import type { FiscalMapping, FiscalTabularType } from "../fiscal-sources";

/**
 * Synthetic VAT recipe only (Mission 13). Exercise 2026, quarterly CA3, regime « réel normal », amounts in EUR.
 * T1 2026 : ventes 500 HT / 100 TVA, immobilisation 1 000 HT / 200 TVA → crédit 100 à reporter (case 27).
 * T2 2026 (cas de référence) : ventes 1 000 HT à 20 % + 500 HT à 10 %, avoir de 100 HT / 20 TVA, achats 400 + 150 HT (80 + 30 TVA).
 *   Collectée 230,00 · déductible 110,00 · net comptabilisé 120,00 ; CA3 : 16 = 230, 20 = 110, 22 = 100 (crédit T1), 23 = 210, 28 = 20.
 *   Pont : 120 − 100 (crédit reporté cité) = 20 = case 28. Paiement de 20 rattaché au T2. Continuité 27 (T1) = 22 (T2) = 100.
 * T3 2026 : ventes de juillet (200 HT / 40 TVA) et de septembre (300 HT / 60 TVA) ; les sources du fait générateur et de la facturation expirent le 31/08/2026.
 */
export const fxPeriod = { startDate: "2026-01-01", closingDate: "2026-12-31", asOfDate: "2027-03-31", currency: "EUR", validation: "provisional" } as const satisfies AccountingPeriod;
export const fxScope: WorkpaperScope = { organizationId: "org-fx-synthetic", dossierId: "77777777-7777-4777-8777-777777777777", periodId: periodId(fxPeriod), mode: "real" };
export const fxPreparer: Principal = { id: "preparer-fx", grants: [{ scope: fxScope, permissions: ["read", "prepare", "download"] }] };
export const T1 = { startDate: "2026-01-01", endDate: "2026-03-31" } as const;
export const T2 = { startDate: "2026-04-01", endDate: "2026-06-30" } as const;
export const T3 = { startDate: "2026-07-01", endDate: "2026-09-30" } as const;
export const SEPT = { startDate: "2026-09-01", endDate: "2026-09-30" } as const;
export const FX_SIREN = "123456789";

const FEC_HEADER = ["JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise"];
type Line = [journal: string, num: string, date: string, account: string, label: string, piece: string, debit: string, credit: string];
const line = ([journal, num, date, account, label, piece, debit, credit]: Line) =>
  [journal, journal === "VE" ? "Ventes" : journal === "AC" ? "Achats" : "Opérations diverses", num, date, account, label, "", "", piece, piece ? date : "", label, debit, credit, "", "", date, "", ""].join(";");
export const FEC_LINES: Line[] = [
  ["VE", "VE1001", "20260210", "411000", "Client Alpha", "F-1001", "600,00", "0,00"], ["VE", "VE1001", "20260210", "706000", "Prestations", "F-1001", "0,00", "500,00"], ["VE", "VE1001", "20260210", "445710", "TVA collectée", "F-1001", "0,00", "100,00"],
  ["AC", "AC1001", "20260310", "215400", "Matériel", "FA-1001", "1000,00", "0,00"], ["AC", "AC1001", "20260310", "445620", "TVA sur immobilisations", "FA-1001", "200,00", "0,00"], ["AC", "AC1001", "20260310", "404000", "Fournisseur immo", "FA-1001", "0,00", "1200,00"],
  ["VE", "VE2001", "20260410", "411000", "Client Beta", "F-2001", "1200,00", "0,00"], ["VE", "VE2001", "20260410", "706000", "Prestations", "F-2001", "0,00", "1000,00"], ["VE", "VE2001", "20260410", "445710", "TVA collectée 20", "F-2001", "0,00", "200,00"],
  ["VE", "VE2002", "20260515", "411000", "Client Gamma", "F-2002", "550,00", "0,00"], ["VE", "VE2002", "20260515", "707000", "Ventes marchandises", "F-2002", "0,00", "500,00"], ["VE", "VE2002", "20260515", "445712", "TVA collectée 10", "F-2002", "0,00", "50,00"],
  ["VE", "VE2003", "20260605", "706000", "Avoir prestations", "AV-2003", "100,00", "0,00"], ["VE", "VE2003", "20260605", "445710", "TVA sur avoir", "AV-2003", "20,00", "0,00"], ["VE", "VE2003", "20260605", "411000", "Client Beta", "AV-2003", "0,00", "120,00"],
  ["AC", "AC2001", "20260420", "607000", "Achats marchandises", "FA-2001", "400,00", "0,00"], ["AC", "AC2001", "20260420", "445660", "TVA déductible", "FA-2001", "80,00", "0,00"], ["AC", "AC2001", "20260420", "401000", "Fournisseur Delta", "FA-2001", "0,00", "480,00"],
  ["AC", "AC2002", "20260528", "622600", "Honoraires", "FA-2002", "150,00", "0,00"], ["AC", "AC2002", "20260528", "445660", "TVA déductible", "FA-2002", "30,00", "0,00"], ["AC", "AC2002", "20260528", "401000", "Cabinet Epsilon", "FA-2002", "0,00", "180,00"],
  ["BQ", "BQ2001", "20260520", "512000", "Banque", "", "0,00", "50,00"], ["BQ", "BQ2001", "20260520", "627000", "Frais bancaires", "", "50,00", "0,00"],
  ["VE", "VE3001", "20260703", "411000", "Client Zeta", "F-3001", "240,00", "0,00"], ["VE", "VE3001", "20260703", "706000", "Prestations", "F-3001", "0,00", "200,00"], ["VE", "VE3001", "20260703", "445710", "TVA collectée", "F-3001", "0,00", "40,00"],
  ["VE", "VE3002", "20260915", "411000", "Client Eta", "F-3002", "360,00", "0,00"], ["VE", "VE3002", "20260915", "706000", "Prestations", "F-3002", "0,00", "300,00"], ["VE", "VE3002", "20260915", "445710", "TVA collectée", "F-3002", "0,00", "60,00"],
  // IS recipe (exercise 2026): annual service contract, salaries, a non-deductible penalty and the recorded corporate income tax.
  ["VE", "VE9001", "20261130", "411000", "Client Theta", "F-9001", "120000,00", "0,00"], ["VE", "VE9001", "20261130", "706000", "Contrat annuel", "F-9001", "0,00", "100000,00"], ["VE", "VE9001", "20261130", "445710", "TVA collectée", "F-9001", "0,00", "20000,00"],
  ["OD", "OD9001", "20261231", "641000", "Salaires", "PAIE-12", "30000,00", "0,00"], ["OD", "OD9001", "20261231", "421000", "Personnel", "PAIE-12", "0,00", "30000,00"],
  ["OD", "OD9002", "20261215", "671200", "Pénalité de retard", "AMENDE-1", "1000,00", "0,00"], ["OD", "OD9002", "20261215", "512000", "Banque", "AMENDE-1", "0,00", "1000,00"],
  ["OD", "OD9003", "20261231", "695000", "Impôt sur les bénéfices", "IS-2026", "17950,00", "0,00"], ["OD", "OD9003", "20261231", "444000", "État — impôt sur les bénéfices", "IS-2026", "0,00", "17950,00"],
];
export const fecText = (lines: Line[] = FEC_LINES) => [FEC_HEADER.join(";"), ...lines.map(line)].join("\n") + "\n";

const DECL_HEADER = "documentType;formNumber;formVintage;siren;periodStart;periodEnd;fiscalYear;fieldCode;rawValue;page;box";
export function ca3Text(period: { startDate: string; endDate: string }, boxes: Record<string, string>, options: { vintage?: number; siren?: string; formNumber?: string; documentType?: string } = {}) {
  const meta = [options.documentType ?? "declaration_tva_ca3", options.formNumber ?? "3310-CA3-SD", String(options.vintage ?? 2026), options.siren ?? FX_SIREN, period.startDate, period.endDate, period.endDate.slice(0, 4)];
  return [DECL_HEADER, ...Object.entries(boxes).map(([code, value]) => [...meta, code, value, "1", code].join(";"))].join("\n") + "\n";
}
export const CA3_T1 = { "08": "500,00", "16": "100,00", "19": "200,00", "20": "0,00", "22": "0,00", "23": "200,00", "25": "100,00", "27": "100,00", "28": "0,00" };
export const CA3_T2 = { "08": "900,00", "16": "230,00", "19": "0,00", "20": "110,00", "22": "100,00", "23": "210,00", "25": "0,00", "27": "0,00", "28": "20,00" };
/** Corrected T2 return (« déclaration remplacée ») : the credit received was omitted, net due 120. */
export const CA3_T2_CORRECTED = { ...CA3_T2, "22": "0,00", "23": "110,00", "28": "120,00" };
export const CA3_T3 = { "08": "500,00", "16": "100,00", "19": "0,00", "20": "0,00", "22": "0,00", "23": "0,00", "25": "0,00", "27": "0,00", "28": "100,00" };

const csv = (rows: string[][]) => rows.map(r => r.join(";")).join("\n") + "\n";
export const FX_CSV: Record<FiscalTabularType, string> = {
  fx_invoices: csv([["piece", "tva", "date", "sens", "base_ht", "libelle"],
    ["F-1001", "100,00", "2026-02-10", "vente", "500,00", "Facture Alpha"], ["FA-1001", "200,00", "2026-03-10", "achat", "1000,00", "Matériel"],
    ["F-2001", "200,00", "2026-04-10", "vente", "1000,00", "Facture Beta"], ["F-2002", "50,00", "2026-05-15", "vente", "500,00", "Facture Gamma"], ["AV-2003", "-20,00", "2026-06-05", "vente", "-100,00", "Avoir Beta"],
    ["FA-2001", "80,00", "2026-04-20", "achat", "400,00", "Facture Delta"], ["FA-2002", "30,00", "2026-05-28", "achat", "150,00", "Honoraires Epsilon"], ["F-3001", "40,00", "2026-07-03", "vente", "200,00", "Facture Zeta"], ["F-3002", "60,00", "2026-09-15", "vente", "300,00", "Facture Eta"]]),
  fx_vat_payments: csv([["reference", "montant", "date", "debut", "fin", "libelle"], ["PAY-T2", "20,00", "2026-07-20", "2026-04-01", "2026-06-30", "Paiement CA3 T2"], ["PAY-T3", "100,00", "2026-10-20", "2026-07-01", "2026-09-30", "Paiement CA3 T3"]]),
  fx_support: csv([["ref", "montant", "date", "libelle"], ["ATT-REGIME", "0,00", "2026-01-15", "Attestation de régime réel normal, dépôt trimestriel"], ["NOTE-CREDIT", "100,00", "2026-04-30", "Note de report du crédit du T1"]]),
};
export function fxMapping(type: FiscalTabularType): FiscalMapping {
  const base = { version: "fiscal-1" as const, headerRow: 1, delimiter: ";" as const, decimal: "," as const, dateFormat: "ISO" as const, sign: 1 as const, currency: "EUR" as const };
  if (type === "fx_invoices") return { ...base, columns: { key: "piece", amount: "tva", date: "date" }, fiscal: { basis: "invoices", directionColumn: "sens", baseColumn: "base_ht", labelColumn: "libelle" } };
  if (type === "fx_vat_payments") return { ...base, columns: { key: "reference", amount: "montant", date: "date" }, fiscal: { basis: "payments", periodStartColumn: "debut", periodEndColumn: "fin", labelColumn: "libelle" } };
  return { ...base, columns: { key: "ref", amount: "montant", date: "date" }, fiscal: { basis: "support", labelColumn: "libelle" } };
}

/**
 * IS recipe, exercise 2026 (régime réel normal, 2058-A). Hand computation:
 * produits 500 + 1 000 − 100 + 500 + 200 + 300 + 100 000 = 102 400 ; charges 400 + 150 + 50 + 30 000 + 1 000 = 31 600 ;
 * résultat avant impôt 70 800 ; IS comptabilisé (695) 17 950 ; résultat après impôt 52 850 = WA.
 * WR = 17 950 (IS) + 1 000 (pénalité) = 18 950 ; XI = XN = 71 800. Profil confirmé, capital partiellement libéré : taux réduit non applicable,
 * 71 800 × 25 % = 17 950 = charge comptabilisée = dette 444.
 */
export const LIASSE_2058A = { WA: "52850,00", WR: "18950,00", XH: "0,00", XI: "71800,00", XL: "0,00", XN: "71800,00" };
export const DECL_2065 = { "C.RESULTAT_FISCAL_BENEFICE": "71800,00", "C.RESULTAT_TAUX_NORMAL": "71800,00", "C.RESULTAT_TAUX_REDUIT": "0,00" };
export function citText(boxes: Record<string, string>, options: { documentType?: string; formNumber?: string; vintage?: number; start?: string; end?: string } = {}) {
  const start = options.start ?? fxPeriod.startDate, end = options.end ?? fxPeriod.closingDate;
  const meta = [options.documentType ?? "liasse_2050_2059", options.formNumber ?? "2058-A-SD", String(options.vintage ?? 2026), FX_SIREN, start, end, end.slice(0, 4)];
  return [DECL_HEADER, ...Object.entries(boxes).map(([code, value]) => [...meta, code, value, "1", code].join(";"))].join("\n") + "\n";
}
/** Exercise 2024: no rate schedule and no form vintage are published for it; the computation must stay blocked. */
export const fx2024Period = { startDate: "2024-01-01", closingDate: "2024-12-31", asOfDate: "2025-03-31", currency: "EUR", validation: "provisional" } as const satisfies AccountingPeriod;
export const fx2024Scope: WorkpaperScope = { organizationId: "org-fx-synthetic", dossierId: "77777777-7777-4777-8777-777777777777", periodId: periodId(fx2024Period), mode: "real" };
export const FEC_2024: Line[] = [
  ["VE", "V24001", "20240630", "411000", "Client", "F24-1", "60000,00", "0,00"], ["VE", "V24001", "20240630", "706000", "Prestations", "F24-1", "0,00", "50000,00"], ["VE", "V24001", "20240630", "445710", "TVA", "F24-1", "0,00", "10000,00"],
  ["OD", "O24001", "20241231", "695000", "Impôt sur les bénéfices", "IS-2024", "12500,00", "0,00"], ["OD", "O24001", "20241231", "444000", "État — IS", "IS-2024", "0,00", "12500,00"],
];
export const LIASSE_2024 = { WA: "37500,00", WR: "12500,00", XH: "0,00", XI: "50000,00", XL: "0,00", XN: "50000,00" };
