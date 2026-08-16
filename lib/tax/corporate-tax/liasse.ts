/**
 * Lecture de la liasse fiscale pour le calcul d'IS.
 *
 * Les codes de case ne sont pas ecrits en dur dans le moteur : ils sont resolus
 * contre le millesime publie par le registre. Une case absente du millesime
 * produit une limitation, jamais une valeur supposee ni un repli sur un autre
 * millesime.
 */
import {
  amountFor,
  readDeclarationBoxes,
  type DeclarationAmount,
  type DeclarationReading,
  type DeclarationReadingIssue,
} from "../declaration-reading";
import type { CorporateTaxAdjustmentCategory } from "./types";

// La lecture generique d'un formulaire est partagee avec le moteur TVA.
// Elle reste exportee ici pour ne pas casser les importateurs de TAX-05.
export { amountFor, readDeclarationBoxes };
export type { DeclarationAmount, DeclarationReading, DeclarationReadingIssue };

export type CorporateTaxRegime = "standard" | "simplified";

interface DetailBoxMapping {
  readonly code: string;
  readonly category: CorporateTaxAdjustmentCategory;
  readonly direction: "reintegration" | "deduction";
}

interface RegimeFormMapping {
  readonly formNumber: string;
  readonly accountingProfit: string;
  readonly accountingLoss: string;
  /** Total declare des reintegrations, `null` si le millesime ne l'expose pas. */
  readonly reintegrationsTotal: string | null;
  readonly deductionsTotal: string | null;
  /** Cases detaillees, utilisees lorsque le total agrege n'existe pas. */
  readonly detailBoxes: readonly DetailBoxMapping[];
  readonly resultBeforeDeficitsProfit: string;
  readonly resultBeforeDeficitsDeficit: string;
  readonly deficitsOffset: string;
  readonly finalProfit: string;
  readonly finalDeficit: string;
}

export const CORPORATE_TAX_FORM_MAPPINGS: Readonly<Record<CorporateTaxRegime, RegimeFormMapping>> = {
  standard: {
    formNumber: "2058-A-SD",
    accountingProfit: "WA",
    accountingLoss: "WS",
    reintegrationsTotal: "WR",
    deductionsTotal: "XH",
    detailBoxes: [],
    resultBeforeDeficitsProfit: "XI",
    resultBeforeDeficitsDeficit: "XJ",
    deficitsOffset: "XL",
    finalProfit: "XN",
    finalDeficit: "XO",
  },
  simplified: {
    formNumber: "2033-B-SD",
    accountingProfit: "312",
    accountingLoss: "314",
    // Le millesime 2033-B publie n'expose pas de total agrege : le moteur
    // additionne les cases detaillees et le declare explicitement dans la trace.
    reintegrationsTotal: null,
    deductionsTotal: null,
    detailBoxes: [
      { code: "316", category: "explicit_non_deductible", direction: "reintegration" },
      { code: "318", category: "depreciation", direction: "reintegration" },
      { code: "322", category: "provisions", direction: "reintegration" },
      { code: "324", category: "accounted_tax", direction: "reintegration" },
    ],
    resultBeforeDeficitsProfit: "352",
    resultBeforeDeficitsDeficit: "354",
    deficitsOffset: "360",
    finalProfit: "370",
    finalDeficit: "372",
  },
} as const;

export const DEFICIT_FOLLOW_UP_FORM = "2058-B-SD";
export const DEFICIT_BOXES = {
  openingStock: "K4",
  transferred: "K4bis",
  offset: "K5",
  currentDeficit: "YJ",
  closingStock: "YK",
} as const;

export const DECLARATION_FORM = "2065-SD";
export const DECLARATION_BOXES = {
  normalRateBase: "C.RESULTAT_TAUX_NORMAL",
  reducedRateBase: "C.RESULTAT_TAUX_REDUIT",
  taxResultProfit: "C.RESULTAT_FISCAL_BENEFICE",
  taxResultDeficit: "C.RESULTAT_FISCAL_DEFICIT",
} as const;

