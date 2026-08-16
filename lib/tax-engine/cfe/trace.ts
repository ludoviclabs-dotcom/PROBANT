/**
 * Trace du module CFE.
 *
 * Chaque étape conserve ses entrées, son opération, sa sortie et l'empreinte
 * canonique des données consommées. Une étape qui *ne calcule pas* est tracée
 * comme telle : le module doit pouvoir prouver qu'il s'est abstenu autant qu'il
 * prouve ce qu'il a rapproché.
 */
import type { TaxSourceRef, TaxTraceStep } from "@/lib/canonical-model";
import { stableHash } from "@/lib/synthesis/canonical";
import type { CfeNote, CfeNoteKind } from "./types";

export interface CfeTraceInput {
  readonly id: string;
  readonly operation: string;
  readonly inputRefs: readonly string[];
  readonly outputRef: string;
  readonly sourceRefs?: readonly TaxSourceRef[];
  readonly inputs: unknown;
}

export class CfeTraceRecorder {
  private readonly steps: TaxTraceStep[] = [];

  record(input: CfeTraceInput): void {
    this.steps.push(Object.freeze({
      id: input.id,
      operation: input.operation,
      inputRefs: [...input.inputRefs],
      outputRef: input.outputRef,
      sourceRefs: [...(input.sourceRefs ?? [])],
      canonicalInputHash: stableHash(input.inputs),
    }));
  }

  /**
   * Trace une abstention explicite. Le module doit consigner qu'il n'a pas
   * recalculé la cotisation, faute de base locative et de taux local.
   */
  recordAbstention(input: {
    readonly id: string;
    readonly reason: string;
    readonly missingInputs: readonly string[];
  }): void {
    this.record({
      id: input.id,
      operation: "abstain_from_computation",
      inputRefs: [...input.missingInputs].sort(),
      outputRef: "no_computation",
      inputs: { reason: input.reason, missingInputs: [...input.missingInputs].sort() },
    });
  }

  all(): readonly TaxTraceStep[] {
    return [...this.steps];
  }
}

export interface CfeNoteInput {
  readonly code: string;
  readonly kind: CfeNoteKind;
  readonly message: string;
  readonly relatedControlIds?: readonly string[];
  readonly sourceRefs?: readonly TaxSourceRef[];
}

export function createCfeNote(input: CfeNoteInput): CfeNote {
  const sourceRefs = [...(input.sourceRefs ?? [])].sort((left, right) =>
    `${left.sourceVersionId}:${left.locator}`.localeCompare(`${right.sourceVersionId}:${right.locator}`));
  // Une note qui énonce une règle doit la citer ; une note de prudence décrit le
  // comportement du moteur et n'en exige pas.
  if (input.kind === "method" && sourceRefs.length === 0) {
    throw new Error(`CFE_NOTE_UNCITED_METHOD:${input.code}`);
  }
  const note = {
    id: `cfe-note:${input.code}`,
    code: input.code,
    kind: input.kind,
    message: input.message,
    relatedControlIds: [...(input.relatedControlIds ?? [])].sort(),
    sourceRefs,
  } satisfies Omit<CfeNote, "noteHash">;
  return Object.freeze({ ...note, noteHash: stableHash(note) });
}

export class CfeNoteCollector {
  private readonly notes = new Map<string, CfeNote>();

  add(input: CfeNoteInput): void {
    const note = createCfeNote(input);
    this.notes.set(note.code, note);
  }

  all(): readonly CfeNote[] {
    return [...this.notes.values()].sort((left, right) => left.code.localeCompare(right.code));
  }
}
