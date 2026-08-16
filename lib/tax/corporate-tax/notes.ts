/**
 * Notes explicatives du calcul d'IS.
 *
 * Une note `method` enonce une regle applicable : elle ne peut pas etre produite
 * sans citation. Une note `prudence` ou `limitation` decrit ce que le moteur
 * s'interdit ; elle documente un comportement, pas une norme, et n'exige donc
 * pas de source.
 */
import type { TaxSourceRef } from "@/lib/canonical-model";
import { stableHash } from "@/lib/synthesis/canonical";
import type { CorporateTaxNote, CorporateTaxNoteKind, CorporateTaxStepCode } from "./types";

export interface CorporateTaxNoteInput {
  readonly code: string;
  readonly kind: CorporateTaxNoteKind;
  readonly message: string;
  readonly relatedStepCodes?: readonly CorporateTaxStepCode[];
  readonly sourceRefs?: readonly TaxSourceRef[];
}

function sortSourceRefs(sourceRefs: readonly TaxSourceRef[]): readonly TaxSourceRef[] {
  return [...sourceRefs].sort((left, right) =>
    `${left.sourceVersionId}:${left.locator}`.localeCompare(`${right.sourceVersionId}:${right.locator}`));
}

export function createCorporateTaxNote(input: CorporateTaxNoteInput): CorporateTaxNote {
  const sourceRefs = sortSourceRefs(input.sourceRefs ?? []);
  if (input.kind === "method" && sourceRefs.length === 0) {
    throw new Error(`TAX_NOTE_UNCITED_METHOD:${input.code}`);
  }
  const note = {
    id: `corporate-tax-note:${input.code}`,
    code: input.code,
    kind: input.kind,
    message: input.message,
    relatedStepCodes: [...(input.relatedStepCodes ?? [])].sort(),
    sourceRefs,
  } satisfies Omit<CorporateTaxNote, "noteHash">;
  return Object.freeze({ ...note, noteHash: stableHash(note) });
}

export class CorporateTaxNoteCollector {
  private readonly notes = new Map<string, CorporateTaxNote>();

  add(input: CorporateTaxNoteInput): void {
    const note = createCorporateTaxNote(input);
    this.notes.set(note.code, note);
  }

  all(): readonly CorporateTaxNote[] {
    return [...this.notes.values()].sort((left, right) => left.code.localeCompare(right.code));
  }
}
