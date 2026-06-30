import type { SiloView } from "@/lib/canonical-model";
import type { MaterialityThresholds } from "@/lib/audit/materiality";
import { buildClientsRapprochementSilo } from "./clients";
import { buildFournisseursRapprochementSilo } from "./fournisseurs";
import { buildStocksRapprochementSilo } from "./stocks";
import { buildImmobilisationsRapprochementSilo } from "./immobilisations";
import { buildTresorerieRapprochementSilo } from "./tresorerie";
import { buildPaieRapprochementSilo } from "./paie";
import { buildCapitauxRapprochementSilo } from "./capitaux";
import { buildFiscalRapprochementSilo } from "./fiscal";

export { buildClientsRapprochementSilo } from "./clients";
export { buildFournisseursRapprochementSilo } from "./fournisseurs";
export { buildStocksRapprochementSilo } from "./stocks";
export { buildImmobilisationsRapprochementSilo } from "./immobilisations";
export { buildTresorerieRapprochementSilo } from "./tresorerie";
export { buildPaieRapprochementSilo } from "./paie";
export { buildCapitauxRapprochementSilo } from "./capitaux";
export { buildFiscalRapprochementSilo } from "./fiscal";

/**
 * Construit l'ensemble des silos de rapprochement de démonstration (8 cycles).
 * Le seuil ISA 320 (optionnel) pondère le risque de faux positif de chaque écart.
 */
export function buildAllRapprochementSilos(
  th: MaterialityThresholds | null = null,
): SiloView[] {
  return [
    buildClientsRapprochementSilo(th),
    buildFournisseursRapprochementSilo(th),
    buildStocksRapprochementSilo(th),
    buildImmobilisationsRapprochementSilo(th),
    buildTresorerieRapprochementSilo(th),
    buildPaieRapprochementSilo(th),
    buildCapitauxRapprochementSilo(th),
    buildFiscalRapprochementSilo(th),
  ];
}
