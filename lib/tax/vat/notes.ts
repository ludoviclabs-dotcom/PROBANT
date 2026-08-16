/**
 * Notes explicatives de la réconciliation TVA.
 *
 * Même discipline qu'en TAX-05 : une note `method` énonce une règle applicable
 * et exige donc une citation ; une note `prudence` ou `limitation` décrit ce que
 * le moteur s'interdit et n'en exige pas.
 */
import type { TaxSourceRef } from "@/lib/canonical-model";
import { stableHash } from "@/lib/synthesis/canonical";
import type { VatNote, VatNoteKind } from "./types";

export interface VatNoteInput {
  readonly code: string;
  readonly kind: VatNoteKind;
  readonly message: string;
  readonly relatedControlIds?: readonly string[];
  readonly sourceRefs?: readonly TaxSourceRef[];
}

export function createVatNote(input: VatNoteInput): VatNote {
  const sourceRefs = [...(input.sourceRefs ?? [])].sort((left, right) =>
    `${left.sourceVersionId}:${left.locator}`.localeCompare(`${right.sourceVersionId}:${right.locator}`));
  if (input.kind === "method" && sourceRefs.length === 0) {
    throw new Error(`VAT_NOTE_UNCITED_METHOD:${input.code}`);
  }
  const note = {
    id: `vat-note:${input.code}`,
    code: input.code,
    kind: input.kind,
    message: input.message,
    relatedControlIds: [...(input.relatedControlIds ?? [])].sort(),
    sourceRefs,
  } satisfies Omit<VatNote, "noteHash">;
  return Object.freeze({ ...note, noteHash: stableHash(note) });
}

export class VatNoteCollector {
  private readonly notes = new Map<string, VatNote>();

  add(input: VatNoteInput): void {
    const note = createVatNote(input);
    this.notes.set(note.code, note);
  }

  all(): readonly VatNote[] {
    return [...this.notes.values()].sort((left, right) => left.code.localeCompare(right.code));
  }
}
