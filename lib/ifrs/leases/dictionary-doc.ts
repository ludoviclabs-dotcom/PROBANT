import { LEASE_DICTIONARY, NOT_APPLICABLE_TOKEN, UNKNOWN_TOKEN, type FieldSpec, type LeaseDocumentType } from "./dictionary";

/**
 * Documentation et modèles CSV du dictionnaire, produits depuis le code (`npm run ifrs:l16-docs`) : un test vérifie que les fichiers
 * versionnés sont identiques à cette sortie, pour qu'ils ne divergent jamais du contrôle réellement appliqué.
 */
const TITLES: Record<LeaseDocumentType, string> = {
  lease_contracts: "Contrats (`lease_contracts`) — une ligne par contrat ; `Key` = identifiant du contrat ; `Amount` = somme des loyers fixes non actualisés ; `Date` = commencement",
  lease_assumptions: "Hypothèses (`lease_assumptions`) — une ligne par contrat ; `Key` = identifiant du contrat ; `Amount` = 0.00 ; `Date` = commencement",
  lease_schedule: "Échéances et règlements (`lease_schedule`) — une ligne par échéance ; `Amount` = loyer dû hors TVA ; `Date` = date exigible",
  lease_ledger: "Comptabilité (`lease_ledger`) — une ligne par charge ou paiement de loyer ; `Amount` = montant ; `Date` = date d'écriture",
  lease_opening: "Ouverture historique (`lease_opening`) — une ligne par contrat repris ; `Key` = identifiant du contrat ; `Amount` = 0.00 ; `Date` = date d'ouverture",
};
const kindLabel = (s: FieldSpec) => s.kind === "enum" ? "liste : " + s.values!.map(v => "`" + v + "`").join(", ") : { text: "texte", date: "date ISO", amount: "montant `0.00`", integer: "entier", rate: "taux décimal" }[s.kind];
const cell = (text: string) => text.replaceAll("|", "\\|");
export function renderDictionaryMarkdown(): string {
  const lines = ["# Dictionnaire des sources IFRS 16 — mapping `ifrs16-leases-2` (L16-01)", "",
    "Fichier produit par `npm run ifrs:l16-docs` depuis `lib/ifrs/leases/dictionary.ts` ; ne pas le modifier à la main.", "",
    "## Format", "",
    "- CSV UTF-8, séparateur `;`, guillemets doubles, décimal `.`, dates ISO `AAAA-MM-JJ`, euros. Colonnes : `Key;Amount;Date;Details`, lues par l'import existant.",
    "- `Details` est un objet JSON : `contractId` (sauf grand livre, facultatif), `source` (`title`, `pack`, `date` au plus tard à la date de revue, `page` ou `null`, `clause`) et `fields`, les champs ci-dessous, tous en chaînes.",
    "- Un champ inconnu du dictionnaire ou une valeur mal formée rejette la source (`L16_IMPORT_SCHEMA_INVALID`). Un doublon de contrat est refusé (`L16_DUPLICATE_CONTRACT`).", "",
    "## Vide, zéro, inconnu, non applicable", "",
    "| Forme | Sens | Effet |", "|---|---|---|",
    "| Champ absent | Vide : aucune réponse | Obligatoire → contrat `a_qualifier` (X25) |",
    "| `" + UNKNOWN_TOKEN + "` | Réponse explicite « on ne sait pas » | Comme un vide, motif distinct |",
    "| `" + NOT_APPLICABLE_TOKEN + "` | Le champ ne s'applique pas | Admis seulement si la colonne « n/a » l'indique ; sinon `a_qualifier` (Q07) |",
    "| `0.00`, `none` | Zéro ou absence déclarés | Une valeur, jamais déduite d'un vide |", ""];
  for (const type of Object.keys(LEASE_DICTIONARY) as LeaseDocumentType[]) {
    lines.push("## " + TITLES[type], "", "| Champ | Libellé | Type | Unité | Obligatoire | n/a | Contrôle et blocage |", "|---|---|---|---|---|---|---|");
    for (const s of LEASE_DICTIONARY[type] as readonly FieldSpec[])
      lines.push("| `" + s.key + "` | " + cell(s.label) + " | " + kindLabel(s) + " | " + (s.unit ?? "—") + " | " + (s.required ? "oui" : "non") + " | " + (s.naAllowed ? "oui" : "non") + " | " + cell(s.blocking) + " |");
    lines.push("");
  }
  lines.push("## Contrôles de cohérence (Qnn)", "",
    "Codes internes, en plus des cas exclus X01-X34 de `docs/ifrs/SCOPE_V1.md` :", "",
    "| Code | Contrôle | Effet |", "|---|---|---|",
    "| Q01 | Signature postérieure au commencement | `a_qualifier` |",
    "| Q02 | Fin du contrat différente de la fin du mois n | `a_qualifier` |",
    "| Q03 | Total de la pièce ≠ loyer × durée | `a_qualifier` |",
    "| Q04 | Durée d'utilité inférieure à un mois | `a_qualifier` |",
    "| Q05 | Amortissement non linéaire | `hors_scope_v1` |",
    "| Q06 | Règlement supérieur au loyer dû | `a_qualifier` |",
    "| Q07 | « non applicable » sur un champ qui ne l'admet pas | `a_qualifier` |",
    "| Q08 | Contrat de 12 mois au plus sans politique court terme déclarée pour sa catégorie (§ 8) | `a_qualifier` |",
    "| Q09 | Échéance rattachée à une autre version du contrat | `a_qualifier` |",
    "| Q10 | Échéancier incomplet ou décalé | `a_qualifier` |", "");
  return lines.join("\n");
}
const EXAMPLE: Record<LeaseDocumentType, { key: string; amount: string; date: string; contractId?: string; fields: Record<string, string> }> = {
  lease_contracts: { key: "CTR-001", amount: "36000.00", date: "2026-01-01", contractId: "CTR-001", fields: { lessor: "Bailleur (exemple)", assetCategory: "Véhicules utilitaires", contractVersion: "v1", versionNature: "initial", role: "lessee",
    contractCurrency: "EUR", signatureDate: "2025-12-15", endDate: "2028-12-31", termMonths: "36", payment: "1000.00", paymentFrequency: "monthly", paymentTiming: "arrears", vatTreatment: "excluded_recoverable",
    identifiedAsset: "yes", controlOfUse: "yes", identificationEvidence: "Actif désigné, sans substitution substantielle", serviceComponents: "none", usefulLifeMonths: "36", depreciationMethod: "straight_line", depreciationJustification: "Durée d'utilité ≥ durée du contrat" } },
  lease_assumptions: { key: "CTR-001", amount: "0.00", date: "2026-01-01", contractId: "CTR-001", fields: { rateKind: "incremental_borrowing", rateBasis: "annual_effective", annualEffectiveRate: "0.05", rateDate: "2025-12-31",
    rateJustification: "Emprunt de même durée et sûreté", termJudgement: "Aucune option", lowValueExemption: "not_elected", lowValueNewValue: NOT_APPLICABLE_TOKEN, lowValueJudgement: NOT_APPLICABLE_TOKEN, variablePayments: "none",
    prepaidPayments: "0.00", leaseIncentives: "0.00", initialDirectCosts: "0.00", restorationCosts: "0.00", deposit: "none", residualValueGuarantee: "none", purchaseOption: "none", ownershipTransfer: "none",
    terminationPenalty: "none", modification: "none", impairmentIndicator: "none", capitalizedInOtherAsset: "none" } },
  lease_schedule: { key: "CTR-001-2026-01-31", amount: "1000.00", date: "2026-01-31", contractId: "CTR-001", fields: { contractVersion: "v1", paidDate: "2026-01-31", paidAmount: "1200.00", paidVat: "200.00" } },
  lease_ledger: { key: "GL-613-2026-01", amount: "1000.00", date: "2026-01-31", contractId: "CTR-001", fields: { account: "613500", periodStart: "2026-01-01", periodEnd: "2026-01-31", piece: "AC-2026-0001" } },
  lease_opening: { key: "CTR-001", amount: "0.00", date: "2025-12-31", contractId: "CTR-001", fields: { openingDate: "2025-12-31", debt: "0.00", rouGross: "0.00", rouAccumulated: "0.00", rouNet: "0.00", reportingRef: "Reporting IFRS 2025 validé", reviewEvidence: "Note de revue" } },
};
export function templateCsv(type: LeaseDocumentType): string {
  const e = EXAMPLE[type], details = { ...(e.contractId ? { contractId: e.contractId } : {}), source: { title: "Pièce (exemple)", pack: "Pack", date: "2026-01-02", page: 1, clause: "Article" }, fields: e.fields };
  return "Key;Amount;Date;Details\n" + [e.key, e.amount, e.date, JSON.stringify(details)].map(v => "\"" + v.replaceAll("\"", "\"\"") + "\"").join(";") + "\n";
}
