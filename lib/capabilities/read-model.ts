import { CAPABILITY_REGISTRY_VERSION, configuredProcedures, type StoreFamily } from "./registry";
import { scopedFamilyRuns } from "./store-readers";
import { observeRuns, type CycleObservation } from "@/lib/workpapers/closing-cycles";
import type { WorkpaperScope, WorkpaperRun } from "@/lib/workpapers/model";

export interface CapabilityReadModel {
  registryVersion: string;
  configuration: ReturnType<typeof configuredProcedures>;
  observationStatus: "not_read" | "read";
  observedProcedures: string[];
  observations: CycleObservation[];
}
export function capabilityReadModel(env: Record<string, string | undefined>, scoped?: { scope: WorkpaperScope; rows: { family: StoreFamily; run: WorkpaperRun }[]; procedures?: string[] }): CapabilityReadModel {
  return { registryVersion: CAPABILITY_REGISTRY_VERSION, configuration: configuredProcedures(env), observationStatus: scoped ? "read" : "not_read",
    observedProcedures: scoped?.procedures ?? [], observations: scoped ? observeRuns(scopedFamilyRuns(scoped.scope, scoped.rows)).filter(o => !scoped.procedures || scoped.procedures.includes(o.procedure)) : [] };
}
