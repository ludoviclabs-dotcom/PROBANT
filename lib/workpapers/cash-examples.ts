/** Exemples du pack de pilotage, non vérifiés contre les PBC originaux ; jamais des règles métier. */
export const CASH_GUIDE_EXAMPLES = [
  { bank: "LCL", observation: "Sans exception dans la correction résumée du cas ; pas un verdict universel.", reference: "Pack v1.1 LOT_03 §6 / plan v1.0 §15.3", originalAvailable: false },
  { bank: "Natixis", observation: "ERB/apurement satisfaisants dans le résumé ; pouvoirs encore attendus.", reference: "Pack v1.1 LOT_03 §6 / plan v1.0 §15.3", originalAvailable: false },
  { bank: "Boursorama / BoursoBank", observation: "435,30 EUR contre lead 430,30 EUR : amplitude 5,00 EUR. Avec référence moins pont, signe -5,00 EUR.", reference: "Pack v1.1 LOT_03 §6 / plan v1.0 §15.3", originalAvailable: false },
] as const;
export const CASH_EXAMPLE_WARNING = "Exemples pédagogiques du pack de pilotage, distincts du Guide de formation Audit.pdf V1.1 (138 pages). PBC et classeurs originaux non disponibles — SOURCE REQUISE. Les lignes de recette sont entièrement synthétiques ; aucune conclusion bancaire réelle n'est autorisée.";
