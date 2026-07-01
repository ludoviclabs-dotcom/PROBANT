import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildRapprochementSilo } from "./build";
import type { DocumentSource } from "./types";
import { cycleById } from "./catalog";

export function buildRapprochementDepuisDepot(
  cycleId: string,
  source: DocumentSource,
  cible: DocumentSource,
  th: MaterialityThresholds | null = null,
  dateCloture?: string,
): SiloView {
  const cycle = cycleById(cycleId);
  if (!cycle) throw new Error(`Cycle d'audit inconnu : ${cycleId}`);
  return buildRapprochementSilo(source, cible, cycle.config, th, { dateReference: dateCloture });
}

// Spécialisation utile uniquement quand l'appelant doit rester agnostique du
// cycleId ; pour tout nouveau cycle déjà présent dans AUDIT_CYCLES,
// buildRapprochementDepuisDepot(cycleId, ...) suffit.
export function buildRapprochementImmos(
  tableauImmos: DocumentSource,
  balanceImmos: DocumentSource,
  th: MaterialityThresholds | null = null,
  dateCloture?: string,
): SiloView {
  return buildRapprochementDepuisDepot("immobilisations", tableauImmos, balanceImmos, th, dateCloture);
}
