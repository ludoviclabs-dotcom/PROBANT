import { knowledgeRegistry } from "./registry";
import type { CrosswalkEntry } from "./types";

export function findCrosswalks(
  fromKind: CrosswalkEntry["fromKind"],
  fromId: string,
): CrosswalkEntry[] {
  return knowledgeRegistry.crosswalks.filter(
    (entry) => entry.fromKind === fromKind && entry.fromId === fromId,
  );
}

export function isInternationalCorrespondence(entry: CrosswalkEntry): boolean {
  return (
    entry.relation === "corresponds_to" &&
    ((entry.fromKind === "NEP" && entry.toKind === "ISA") ||
      (entry.fromKind === "ISA" && entry.toKind === "NEP"))
  );
}
