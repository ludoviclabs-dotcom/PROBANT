/**
 * Lecture normalisée d'une CA3 ou d'une CA12.
 *
 * Les cases retenues pour la TVA brute et la TVA déductible sont exactement
 * celles que le registre déclare comme entrées de ses propres règles
 * (`vat-ca3-relationship-2026`, `vat-ca12-relationship-2026`) : le moteur ne
 * choisit pas ses cases, il suit la spécification publiée.
 *
 * Une déclaration absente est un fait, jamais une déclaration à zéro.
 */
import type { CentAmount, TaxDocumentSnapshot, TaxSourceRef } from "@/lib/canonical-model";
import { canonicalJson, stableHash } from "@/lib/synthesis/canonical";
import { amountFor, readDeclarationBoxes } from "../declaration-reading";
import type { VatDeclarationBox, VatDeclarationSnapshot, VatRegime } from "./types";

interface VatFormMapping {
  readonly formNumber: string;
  readonly vintage: number;
  readonly sourceId: string;
  readonly sourceVersionId: string;
  readonly locator: string;
  readonly grossVat: string;
  readonly deductibleVat: string;
  readonly netDue: string;
  readonly credit: string;
  readonly creditReceived: string;
  readonly creditToCarry: string;
  /** Base HT au taux normal, si le millésime l'expose. */
  readonly normalRateBase: string | null;
  readonly allBoxes: readonly string[];
}

export const VAT_FORM_MAPPINGS: Readonly<Record<VatRegime, VatFormMapping>> = {
  real_normal: {
    formNumber: "3310-CA3-SD",
    vintage: 2026,
    sourceId: "form-ca3",
    sourceVersionId: "form-ca3-v2026",
    locator: "3310-CA3-SD 2026, cases 16, 23, 25, TD, 27 et 28",
    grossVat: "16",
    deductibleVat: "23",
    netDue: "28",
    credit: "25",
    creditReceived: "22",
    creditToCarry: "27",
    normalRateBase: "08",
    allBoxes: ["08", "16", "19", "20", "22", "23", "25", "TD", "27", "28", "32"],
  },
  mini_real: {
    formNumber: "3310-CA3-SD",
    vintage: 2026,
    sourceId: "form-ca3",
    sourceVersionId: "form-ca3-v2026",
    locator: "3310-CA3-SD 2026, cases 16, 23, 25, TD, 27 et 28",
    grossVat: "16",
    deductibleVat: "23",
    netDue: "28",
    credit: "25",
    creditReceived: "22",
    creditToCarry: "27",
    normalRateBase: "08",
    allBoxes: ["08", "16", "19", "20", "22", "23", "25", "TD", "27", "28", "32"],
  },
  real_simplified: {
    formNumber: "3517-S-SD",
    vintage: 2026,
    sourceId: "form-ca12",
    sourceVersionId: "form-ca12-v2026",
    locator: "3517-S-SD 2026, cases 19, 26, 29, 51 et 54",
    grossVat: "19",
    deductibleVat: "26",
    netDue: "54",
    credit: "29",
    creditReceived: "24",
    creditToCarry: "51",
    // Le millésime publié de la CA12 n'expose aucune case de base HT.
    normalRateBase: null,
    allBoxes: ["16", "19", "20", "22", "23", "24", "26", "28", "29", "33", "51", "54", "56"],
  },
};

export function vatFormMappingFor(regime: VatRegime): VatFormMapping {
  return VAT_FORM_MAPPINGS[regime];
}

export interface VatDeclarationInput {
  readonly organizationId: string;
  readonly dossierId: string;
  readonly entityId: string;
  readonly vatPeriodId: string;
  readonly regime: VatRegime;
  readonly formVintage: number;
  readonly snapshots: readonly TaxDocumentSnapshot[];
  readonly snapshotId: string;
}

export function readVatDeclaration(input: VatDeclarationInput): VatDeclarationSnapshot {
  const mapping = vatFormMappingFor(input.regime);
  const reading = readDeclarationBoxes({
    snapshots: input.snapshots,
    formNumber: mapping.formNumber,
    formVintage: input.formVintage,
    fieldCodes: mapping.allBoxes,
  });

  // Ne jamais attribuer une référence 2026 à une déclaration d'un autre
  // millésime. Le moteur bloque cette combinaison avant lecture ; cette garde
  // évite aussi qu'un snapshot bloqué annonce une source hors période.
  const sourceRefs: readonly TaxSourceRef[] = input.formVintage === mapping.vintage
    ? [{
        sourceId: mapping.sourceId,
        sourceVersionId: mapping.sourceVersionId,
        locator: mapping.locator,
      }]
    : [];

  const boxes: VatDeclarationBox[] = reading.amounts.map((amount) => ({
    code: amount.fieldCode,
    label: `Case ${amount.fieldCode} de ${mapping.formNumber}`,
    amountCents: amount.amountCents,
    snapshotId: amount.snapshotId,
    contentHash: amount.contentHash,
  }));

  const pick = (code: string | null): CentAmount | null => {
    if (code === null) return null;
    return amountFor(reading, code)?.amountCents ?? null;
  };

  // Aucune case exploitable alors qu'aucun snapshot du formulaire n'existe :
  // la déclaration est absente, ce qui n'est pas une déclaration à zéro.
  const status: VatDeclarationSnapshot["status"] = reading.snapshotIds.length === 0
    ? "absent"
    : boxes.length === 0
      ? "unreadable"
      : "available";

  const body = {
    organizationId: input.organizationId,
    dossierId: input.dossierId,
    entityId: input.entityId,
    vatPeriodId: input.vatPeriodId,
    formNumber: mapping.formNumber,
    formVintage: input.formVintage,
    regime: input.regime,
    status,
    boxes: boxes.sort((left, right) => left.code.localeCompare(right.code)),
    grossVatCents: pick(mapping.grossVat),
    deductibleVatCents: pick(mapping.deductibleVat),
    netDueCents: pick(mapping.netDue),
    creditCents: pick(mapping.credit),
    creditCarriedForwardCents: pick(mapping.creditReceived),
    normalRateBaseCents: pick(mapping.normalRateBase),
    issues: reading.issues,
    sourceRefs,
  };

  return Object.freeze({
    ...body,
    id: input.snapshotId,
    canonicalJson: canonicalJson(body),
    snapshotHash: stableHash(body),
  }) as VatDeclarationSnapshot;
}

/** Case du crédit à reporter, utilisée par le contrôle de report. */
export function creditToCarryCents(
  declaration: VatDeclarationSnapshot,
  regime: VatRegime,
): CentAmount | null {
  const code = vatFormMappingFor(regime).creditToCarry;
  return declaration.boxes.find((box) => box.code === code)?.amountCents ?? null;
}
