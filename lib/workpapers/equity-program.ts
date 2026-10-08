export const EQUITY_TYPES=['equity_balances','equity_ledger','equity_variation','equity_decisions','equity_payments','equity_minutes','equity_acts'] as const;
export const EQUITY_LABELS:Record<string,string>={equity_balances:'Ouverture et clôture par compte',equity_ledger:'GL — mouvements',equity_variation:'Tableau de variation',equity_decisions:'Registre des décisions',equity_payments:'Règlements distincts',equity_minutes:'PV et pages',equity_acts:'Actes et méthode'};
export const EQUITY_FAMILIES=['capital','primes','reserves','report','result','revaluation','subventions','regulated','other'] as const;
export const EQUITY_FAMILY_LABELS:Record<string,string>={capital:'Capital',primes:'Primes',reserves:'Réserves',report:'Report à nouveau',result:'Résultat',revaluation:'Écarts déclarés',subventions:'Subventions déclarées',regulated:'Provisions réglementées déclarées',other:'Autres composantes pertinentes'};
export const EQUITY_STATUS:Record<string,string>={decision_unbooked:'Décision sans écriture dans la période testée',entry_undecided:'Écriture sans décision',divergent:'Montant divergent',missing_minutes:'PV absent ou lecture manquante',outside:'Effet hors période',matched:'Montants rapprochés — sans avis juridique',transfer:'Transfert interne équilibré — effet total nul',inconclusive:'Non concluant',accounting_only:'Mouvement comptable distinct',not_tested:'Non testé / exclu'};

export function equityEventTarget(point:{id:string;targetId:string}) {
 if(point.id.endsWith(':mapping'))return 'row:'+point.id.slice(0,-':mapping'.length);
 if(point.id.endsWith(':bridge')||point.id==='inventory')return 'component:'+point.targetId;
 if(point.id.endsWith(':orphan'))return 'movement:'+point.targetId;
 return 'decision:'+point.targetId;
}
export function equityEventSelection(value:string) {
 const match=/^(decision|movement|component|row):/.exec(value);
 return {unit:match?.[1],id:match?value.slice(match[0].length):value};
}

export const EQUITY_FAILURES:Record<string,string>={
 EQUITY_CAPITAL_GROUPING_REQUIRED:'Regroupez les comptes du capital dans une seule composante avant de calculer les ratios techniques.',
 EQUITY_COMPONENT_INVENTORY_INCOMPLETE:'Complétez toutes les familles de la cartographie, ou justifiez leur non-applicabilité par une pièce.',
 EQUITY_COMPONENT_ACCOUNTS_REQUIRED:'Renseignez les comptes des composantes à inclure.',
 EQUITY_EXCLUSION_PROOF_REQUIRED:'Une composante non applicable nécessite une justification et une pièce versionnée.',
 EQUITY_METHOD_PROOF_REQUIRED:'Reliez la convention de travail à une pièce de la population figée.',
 EQUITY_PV_VERSION_PAGE_REQUIRED:'Choisissez une page réelle du PV ou de l’acte versionné pour cette lecture.',
 EQUITY_CITATION_VERSION_INVALID:'La citation ne correspond pas à une pièce figée, sa ligne ou sa page. Choisissez la version exacte.',
 EQUITY_EFFECT_DATE_INVALID:'Corrigez la date d’effet et son format dans la source ou le mapping.',
 EQUITY_BALANCE_SCOPE_INVALID:'Les soldes doivent porter les dates exactes d’ouverture et de clôture, avec compte et composante.',
 EQUITY_SOURCE_AFTER_REVIEW:'Une source est datée après la date de revue. Vérifiez la période de cette révision.',
 EQUITY_SOURCE_DUPLICATE_ID:'Plusieurs lignes de cette source portent la même identité. Corrigez le fichier avant approbation.',
 EQUITY_ACCOUNT_DUPLICATE:'Un compte est affecté à plusieurs composantes. Corrigez la cartographie.',
 EQUITY_COMPONENT_DUPLICATE:'Chaque composante doit avoir une identité distincte.',
 EQUITY_CURRENCY_UNSUPPORTED:'Ce calcul accepte uniquement EUR, sans conversion implicite.',
 UNBALANCED_INTERNAL_TRANSFER:'Un transfert interne doit avoir au moins deux jambes sur des composantes distinctes et un effet total nul. Vérifiez les mouvements.',
 UNRESOLVED_BLOCKING_NOTE:'Documentez le traitement des observations bloquantes avant la soumission.',
 PREPARATION_EDIT_FORBIDDEN:'Cette révision est réservée à son préparateur. Créez une nouvelle révision pour reprendre les travaux.',
 INPUTS_ALREADY_FROZEN:'La population et la sélection sont figées. Créez une nouvelle révision pour les modifier.',
 REQUIRED_DOCUMENT_MISSING:'Approuvez les sources d’ouverture/clôture et le GL avant de figer la feuille.',
 EQUITY_CURRENT_SOURCES_REQUIRED:'Utilisez les imports approuvés courants de ce dossier de décisions.',
 EQUITY_FROZEN_INPUTS_REQUIRED:'Figez la population et la sélection avant de modifier la convention.',
 CALCULATION_VALIDATION_OR_EXECUTION_FAILED:'La validation ou le calcul a échoué. Vérifiez les sources, les transferts et la convention, puis préparez une nouvelle révision.',
 CALCULATION_INPUT_INVALID:'Les paramètres du calcul sont incomplets ou invalides. Vérifiez la convention et les pièces.',
 population_or_selection_not_reproducible:'La population ou la sélection ne peut pas être reproduite à cette version.',
 unapproved_import:'Un import doit être approuvé avant le calcul.',
 stale_selection:'La sélection ne correspond plus à la population figée.',
 source_row_missing:'Une ligne source de la sélection est absente ou invalide.'
};
