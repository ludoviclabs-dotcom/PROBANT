/**
 * Référentiel français — textes officiels, éditions et résolveur d'applicabilité (Mission C04).
 *
 * Résolveur PARTAGÉ : moteurs (résultat exceptionnel, fiscal), interface et exports lisent ici
 * la version applicable d'un texte à une période, la numérotation d'article qui en découle et
 * les sources lues. Il ne contient aucune règle de traitement comptable : il dit QUEL texte
 * s'applique et DEPUIS QUAND, jamais ce qu'il faut comptabiliser.
 *
 * Quatre couches sont distinguées et ne se mélangent jamais :
 *  - `official_normative`  : texte officiel (règlement ANC homologué, recueil consolidé) ;
 *  - `doctrinal_commentary`: commentaire, résumé, note d'éditeur — jamais une base d'applicabilité ;
 *  - `internal_method`     : choix de méthode PROBANT (ex. fenêtre d'une édition consolidée) ;
 *  - `dossier_piece`       : pièce du dossier (pack officiel importé, PV d'adoption) — vérifiée par
 *                            les moteurs, jamais par ce module.
 *
 * Chaque date ci-dessous est lue dans le PDF officiel de l'ANC (en-tête d'homologation et article
 * d'application) le 13 octobre 2026, ou sur la page officielle de l'ANC lorsque le texte ne la
 * porte pas (date d'entrée en vigueur du règlement 2026-04). Une source non lue reste `inaccessible`.
 * Aucune version récente n'est appliquée rétroactivement : une période est jugée à sa date
 * d'ouverture, et l'anticipation exige une option explicite.
 */

export type SourceLayer = "official_normative" | "doctrinal_commentary" | "internal_method" | "dossier_piece";

export type FrenchGaapTextId = "pcg-2024" | "anc-2022-06" | "anc-2024-07" | "pcg-2026-01-01" | "anc-2026-03" | "anc-2026-04";

/**
 * Sujets dont la numérotation d'article dépend de la version applicable.
 * `cutoff` (C11) : articles de rattachement des charges et des produits et commentaires des comptes de
 * régularisation (408, 418, 486, 487), tels que portés par chaque édition lue.
 */
export type NumberingTopic = "exceptional_result" | "income_tax" | "revenue" | "other_equity" | "cutoff";

export interface OfficialEdition {
  url: string;
  /** Empreinte SHA-256 du fichier lu, ou null s'il n'a pas pu être lu. */
  sha256: string | null;
  pages: number | null;
  /** Date de lecture (AAAA-MM-JJ). */
  readAt: string;
  access: "read_official_pdf" | "read_official_page" | "inaccessible";
  note?: string;
}

export type FirstMandatoryRule =
  /** Comptes afférents aux exercices ouverts à compter de `date`. */
  | { kind: "periods_opened_from"; date: string }
  /** Exercices en cours à `date` (entrée en vigueur) et exercices ouverts ensuite. */
  | { kind: "periods_in_progress_at"; date: string }
  /** Édition consolidée : fenêtre de lecture d'ouverture `[from, to]` (méthode interne). */
  | { kind: "consolidated_edition"; from: string; to: string | null };

export interface AnticipationRule {
  allowed: boolean;
  /** Point de départ de l'option (date de publication au JO en général). */
  from?: string;
  /** Périmètre : « à compter de la publication » ou « sur l'exercice en cours à la publication ». */
  scope?: "from_publication" | "period_in_progress_at_publication";
  /** Texte de l'article d'application, tel que lu. */
  text?: string;
}

export interface FrenchGaapText {
  id: FrenchGaapTextId;
  label: string;
  organisation: "Autorité des normes comptables";
  layer: "official_normative";
  /** Profil couvert : seul le PCG général est résolu ; un référentiel sectoriel est hors périmètre. */
  profile: "pcg_general";
  adoptionDate: string | null;
  /** Arrêté d'homologation. */
  homologationDate: string | null;
  /** Publication au Journal officiel. */
  publicationDate: string | null;
  /** Entrée en vigueur, lorsqu'elle est énoncée par une source officielle. */
  entryIntoForce: { date: string; basis: "official_text" | "official_page" } | null;
  firstMandatory: FirstMandatoryRule;
  anticipation: AnticipationRule;
  /** Champ contractuel énoncé par le texte (ex. contrats conclus ou renouvelés après l'entrée en vigueur). */
  contractualScope: string | null;
  /** Forme structurée du champ contractuel, lorsque le texte en énonce un (C11). */
  contractualScopeRule: { kind: "sales_contracts_concluded_or_renewed_after_entry_into_force" } | null;
  /** Exceptions d'application énoncées par le texte (hors comptes sociaux pour la plupart). */
  exceptions: { articles: string; rule: FirstMandatoryRule; note: string }[];
  /** Numérotation d'article que ce texte établit pour chaque sujet. */
  numbering: Partial<Record<NumberingTopic, string>>;
  /** Textes que celui-ci remplace sur ses sujets. */
  supersedes: FrenchGaapTextId[];
  editions: OfficialEdition[];
  limits: string[];
}

const ANC = "Autorité des normes comptables" as const;
const READ_AT = "2026-10-13";

/**
 * Registre des textes. Les URL sont celles de l'ANC ; les empreintes sont celles des fichiers lus
 * le 13/10/2026. Le PCG 2024 (recueil) n'a pas été relu dans ce lot : son édition reste
 * `inaccessible` ici et sa fenêtre est une méthode interne héritée de la Mission 17.
 */
export const FRENCH_GAAP_TEXTS: readonly FrenchGaapText[] = [
  {
    id: "pcg-2024",
    label: "Recueil des normes comptables — PCG au 1er janvier 2024",
    organisation: ANC,
    layer: "official_normative",
    profile: "pcg_general",
    adoptionDate: null,
    homologationDate: null,
    publicationDate: null,
    entryIntoForce: null,
    firstMandatory: { kind: "consolidated_edition", from: "2024-01-01", to: "2024-12-31" },
    anticipation: { allowed: false },
    contractualScope: null,
    contractualScopeRule: null,
    exceptions: [],
    numbering: {
      exceptional_result: "946-67 / 947-77 (PCG au 01/01/2024)",
      cutoff: "511-3, 512-3, 512-4, 513-3, 513-4 ; comptes 408 (art. 944-40), 418 et 4191 (art. 944-41), 486 et 487 (art. 944-48) (PCG au 01/01/2024)",
    },
    supersedes: [],
    editions: [
      {
        url: "https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/Reglements/Recueils/Recueil%20comptable%20entreprises/2024/Recueil_normes-comptables2024.pdf",
        sha256: "f608f78f76c32fea2cad4226e089c1ba2c22f52beefbc422dd112db682479303",
        pages: 677,
        readAt: "2026-10-15",
        access: "read_official_pdf",
        note: "Lu en C11 (même empreinte que la lecture C06 du 14/10/2026) : art. 511-3 (p. 188), 512-3 et 512-4 (p. 191), 513-3 et 513-4 (p. 191-192), 944-40 (408), 944-41 (418, 4191), 944-48 (486, 487). Mission 17 : pages PDF 563 / 567.",
      },
    ],
    limits: ["Fenêtre d'ouverture 2024 = méthode interne : l'édition consolidée n'a pas d'article d'application propre."],
  },
  {
    id: "anc-2022-06",
    label: "Règlement ANC n° 2022-06 du 4 novembre 2022 modifiant le règlement ANC n° 2014-03 (résultat exceptionnel, modèles de comptes)",
    organisation: ANC,
    layer: "official_normative",
    profile: "pcg_general",
    adoptionDate: "2022-11-04",
    homologationDate: "2023-12-26",
    publicationDate: "2023-12-30",
    entryIntoForce: null,
    firstMandatory: { kind: "periods_opened_from", date: "2025-01-01" },
    anticipation: {
      allowed: true,
      from: "2023-12-30",
      scope: "from_publication",
      text: "Art. 27 : s'applique aux comptes afférents aux exercices ouverts à compter du 1er janvier 2025 ; peut être appliqué par anticipation à compter de sa date de publication au Journal officiel.",
    },
    contractualScope: null,
    contractualScopeRule: null,
    exceptions: [],
    numbering: {
      exceptional_result: "513-5 (ANC 2022-06)",
      cutoff: "511-3, 512-3, 512-4, 513-3, 513-4 (texte inchangé) ; comptes 408 (art. 1214-40), 418 et 4191 (art. 1214-41), 486 et 487 (art. 1214-48) (ANC 2022-06)",
    },
    supersedes: ["pcg-2024"],
    editions: [
      {
        url: "https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/Reglements/2022/R2022_06/R2022_06.pdf",
        sha256: "aeaa05cfd26ab4aa032ab7f7bb5bf8c5bb3578e197a9a3c89a5ab4610c07ca1b",
        pages: 106,
        readAt: READ_AT,
        access: "read_official_pdf",
        note: "En-tête : homologué par arrêté du 26/12/2023, JO du 30/12/2023 ; art. 513-5 créé ; art. 27 lu. Relu le 15/10/2026 (C11, même empreinte) : art. 1214-40 (408), 1214-41 (418, 4191), 1214-48 (486, 487).",
      },
    ],
    limits: ["Entrée en vigueur non énoncée par le texte lu ; seule la date de publication au JO est portée."],
  },
  {
    id: "anc-2024-07",
    label: "Règlement ANC n° 2024-07 du 6 décembre 2024 relatif à la distinction dettes – autres fonds propres",
    organisation: ANC,
    layer: "official_normative",
    profile: "pcg_general",
    adoptionDate: "2024-12-06",
    homologationDate: "2025-12-26",
    publicationDate: "2025-12-27",
    entryIntoForce: null,
    firstMandatory: { kind: "periods_opened_from", date: "2026-01-01" },
    anticipation: {
      allowed: true,
      from: "2025-12-27",
      scope: "period_in_progress_at_publication",
      text: "Art. 6-1 : s'applique aux comptes afférents aux exercices ouverts à compter du 1er janvier 2026 ; peut être appliqué par anticipation, à compter de sa date de publication au Journal officiel, aux exercices en cours à cette date.",
    },
    contractualScope: null,
    contractualScopeRule: null,
    exceptions: [
      {
        articles: "art. 4, 1° et 2° (règlement ANC 2020-01, comptes consolidés, art. 232-5 et 232-12)",
        rule: { kind: "periods_opened_from", date: "2025-01-01" },
        note: "Art. 6-2 : hors comptes sociaux ; non résolu par ce module.",
      },
    ],
    numbering: { other_equity: "314-1 à 316-1 (chapitre I bis « Autres fonds propres », ANC 2024-07)" },
    supersedes: [],
    editions: [
      {
        url: "https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/Reglements/2024/R2024-07/REGLT_2024_07_web.pdf",
        sha256: "19288fed0e942ee89c03e0e2fde129245ddab5af65e6b1bc90b7d615353fe4c6",
        pages: 13,
        readAt: READ_AT,
        access: "read_official_pdf",
        note: "En-tête : homologué par arrêté du 26/12/2025, JO du 27/12/2025 ; art. 1er (314-1 à 316-1, tableau du passif 821-1 avec « Total des autres fonds propres (II) ») ; art. 6 lu. Listé sur la page officielle des règlements de l'ANC le 13/10/2026.",
      },
    ],
    limits: ["Aucune règle de classement dettes / autres fonds propres n'est tirée du texte : seule son applicabilité est résolue."],
  },
  {
    id: "pcg-2026-01-01",
    label: "Règlement ANC n° 2014-03 — version consolidée au 1er janvier 2026",
    organisation: ANC,
    layer: "official_normative",
    profile: "pcg_general",
    adoptionDate: null,
    homologationDate: null,
    publicationDate: null,
    entryIntoForce: null,
    firstMandatory: { kind: "consolidated_edition", from: "2026-01-01", to: null },
    anticipation: { allowed: false },
    contractualScope: null,
    contractualScopeRule: null,
    exceptions: [],
    numbering: {
      exceptional_result: "513-5 (PCG consolidé au 01/01/2026)", income_tax: "515-1 (PCG consolidé au 01/01/2026)", other_equity: "314-1 à 316-1 (PCG consolidé au 01/01/2026, chapitre I bis)",
      cutoff: "511-3, 512-3, 512-4, 513-3, 513-4 ; comptes 408 (art. 1214-40), 418 et 4191 (art. 1214-41), 486 et 487 (art. 1214-48) (PCG consolidé au 01/01/2026)",
    },
    supersedes: [],
    editions: [
      {
        url: "https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/Reglements/Recueils/PCG_janvier2026/PCG--1er-janvier-2026.pdf",
        sha256: "b9e7a732cea2f16d46df6d34b0dd8fa3e75e2791d0a2c1ff06204bdb3ff2766e",
        pages: 183,
        readAt: READ_AT,
        access: "read_official_pdf",
        note: "Fichier généré le 17/02/2026 (métadonnées PDF) ; porte l'art. 513-5 et le chapitre I bis « Autres fonds propres » ; aucun art. 531-5. Relu le 15/10/2026 (C11, même empreinte) : 511-3 (p. 41), 512-3, 512-4, 513-3, 513-4 (p. 42), 1214-40 (p. 164), 1214-41 (p. 165), 1214-48 (p. 171).",
      },
      {
        url: "https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/recueil/2026/PCG--1er-janvier-2026.pdf",
        sha256: "55c824b25472fb4f9e8aaafd8b88112805d95f12615f5d00bf373231e806fc1e",
        pages: 183,
        readAt: READ_AT,
        access: "read_official_pdf",
        note: "Même version consolidée, fichier regénéré le 20/04/2026 (mise en page, pieds de page) ; articles identiques sur 513-5, 515-1 et le chapitre I bis.",
      },
    ],
    limits: [
      "Édition de lecture : elle intègre ANC 2022-06 et ANC 2024-07 mais ne porte pas ANC 2026-03 (applicable aux exercices ouverts dès 2027) ni la rédaction 2026-04 de l'art. 515-1.",
      "Fenêtre d'ouverture dès le 01/01/2026 = méthode interne ; une période 2024 ou 2025 se lit dans l'édition ou le règlement de sa date d'ouverture.",
    ],
  },
  {
    id: "anc-2026-03",
    label: "Règlement ANC n° 2026-03 du 6 mars 2026 modifiant divers règlements (produits des ventes, contrats à long terme, renumérotation du titre V)",
    organisation: ANC,
    layer: "official_normative",
    profile: "pcg_general",
    adoptionDate: "2026-03-06",
    homologationDate: "2026-08-12",
    publicationDate: "2026-09-03",
    // C11 : l'arrêté d'homologation lu sur Légifrance le 15/10/2026 porte « Entrée en vigueur : l'arrêté entre en vigueur
    // le lendemain de sa publication » (JORF n° 0205 du 03/09/2026). Le règlement ne fixe pas lui-même cette date.
    entryIntoForce: { date: "2026-09-04", basis: "official_text" },
    firstMandatory: { kind: "periods_opened_from", date: "2027-01-01" },
    anticipation: {
      allowed: true,
      from: "2026-09-03",
      scope: "period_in_progress_at_publication",
      text: "Art. 4 : s'applique aux comptes afférents aux exercices ouverts à compter du 1er janvier 2027 ; peut être appliqué par anticipation sur l'exercice en cours à sa date de publication au Journal officiel.",
    },
    contractualScope: "Art. 4, al. 2 : s'applique aux contrats de vente conclus ou renouvelés postérieurement à son entrée en vigueur (04/09/2026, lendemain de la publication de l'arrêté d'homologation).",
    contractualScopeRule: { kind: "sales_contracts_concluded_or_renewed_after_entry_into_force" },
    exceptions: [],
    numbering: {
      exceptional_result: "531-5 (ANC 2026-03)", income_tax: "542-1 (ANC 2026-03)", revenue: "521-1 à 523-7 (ANC 2026-03)",
      cutoff: "511-3, 521-4, 522-2, 522-3, 522-7, 522-11, 522-12 (ANC 2026-03)",
    },
    supersedes: ["anc-2022-06", "pcg-2026-01-01", "anc-2026-04"],
    editions: [
      {
        url: "https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/Reglements/2026/2026%20homologu%C3%A9/2026_03-JO.pdf",
        sha256: "59330e81ee5ab37c59fc919778130e61e6b18f2eaf87898b4984f02d5e8e0bd2",
        pages: 10,
        readAt: READ_AT,
        access: "read_official_pdf",
        note: "En-tête : homologué par arrêté du 12/08/2026, JO du 03/09/2026 ; art. 1er-3 (chapitre I du titre V remplacé : 511-1 à 542-2, dont 531-5 et 542-1) ; art. 4 lu. Relu le 15/10/2026 (C11, même empreinte) : 511-3, 521-4, 522-2, 522-3, 522-5 à 522-7, 522-11, 522-12.",
      },
      {
        url: "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054791025",
        sha256: null,
        pages: null,
        readAt: "2026-10-15",
        access: "read_official_page",
        note: "Arrêté du 12/08/2026 (NOR ECOT2617843A, JORF n° 0205 du 03/09/2026, texte n° 18) lu dans le navigateur le 15/10/2026 : « Entrée en vigueur : l'arrêté entre en vigueur le lendemain de sa publication » ; art. 1er homologue les règlements 2026-01 à 2026-04. Le 13/10/2026, une lecture automatisée avait reçu une réponse 403.",
      },
    ],
    limits: [
      "Entrée en vigueur datée par l'arrêté d'homologation (lendemain de la publication) : le règlement ne la fixe pas lui-même. Un contrat conclu ou renouvelé le jour même (04/09/2026) reste à apprécier : « postérieurement » n'est pas tranché ici.",
      "Rattachement (C11) : la grille de cut-off cite 511-3, 521-4, 522-2, 522-3, 522-7, 522-11 et 522-12 ; prix variables, contrats à long terme, droits de retour et avantages accordés (522-4 à 522-10, 523-1 et suivants) ne sont pas implémentés.",
    ],
  },
  {
    id: "anc-2026-04",
    label: "Règlement ANC n° 2026-04 du 4 mai 2026 modifiant le règlement ANC n° 2014-03 (impôt sur les bénéfices, art. 515-1)",
    organisation: ANC,
    layer: "official_normative",
    profile: "pcg_general",
    adoptionDate: "2026-05-06",
    homologationDate: "2026-08-12",
    publicationDate: "2026-09-03",
    entryIntoForce: { date: "2026-09-04", basis: "official_page" },
    firstMandatory: { kind: "periods_in_progress_at", date: "2026-09-04" },
    anticipation: { allowed: false, text: "Aucune disposition d'anticipation : le règlement s'applique aux exercices en cours à son entrée en vigueur." },
    contractualScope: null,
    contractualScopeRule: null,
    exceptions: [],
    numbering: { income_tax: "515-1 (rédaction ANC 2026-04 ; 542-1 à compter d'ANC 2026-03)" },
    supersedes: ["pcg-2026-01-01"],
    editions: [
      {
        url: "https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/Reglements/2026/2026%20homologu%C3%A9/REGLT_2026_04_JO-SITE.pdf",
        sha256: "c81fb2e9b41232e18d59703bd54cdb3f35dc3cea250df26890979f4d344a5b0f",
        pages: 2,
        readAt: READ_AT,
        access: "read_official_pdf",
        note: "En-tête : homologué par arrêté du 12/08/2026, JO du 03/09/2026 ; art. 1er (515-1 remplacé : taux en vigueur à la clôture) ; art. 2 (515-1-1 abrogé). Le texte ne porte pas d'article d'application.",
      },
      {
        url: "https://www.anc.gouv.fr/reglement-anc-ndeg-2026-04-du-4-mai-2026",
        sha256: null,
        pages: null,
        readAt: READ_AT,
        access: "read_official_page",
        note: "Annonce officielle d'effet : « entrera en vigueur le lendemain du jour de sa publication au Journal officiel et s'appliquera aux exercices en cours à cette date » ; adoption par le Collège le 6 mai 2026.",
      },
    ],
    limits: ["Le titre porte « du 4 mai 2026 » et la page officielle « adopté le 6 mai 2026 » : les deux dates sont conservées telles quelles."],
  },
];

export const frenchGaapText = (id: FrenchGaapTextId): FrenchGaapText => FRENCH_GAAP_TEXTS.find((t) => t.id === id)!;

export type ApplicabilityStatus =
  | "mandatory"
  | "anticipation_elected"
  | "anticipation_available"
  | "not_yet_applicable"
  | "superseded"
  | "out_of_scope_sector"
  | "unknown";

export interface ApplicabilityQuery {
  /** Date d'ouverture de l'exercice (AAAA-MM-JJ). */
  startDate: string;
  /** Date de clôture (AAAA-MM-JJ). */
  closingDate: string;
  /** Profil du référentiel ; `sector_specific` est hors périmètre. */
  profile?: "pcg_general" | "sector_specific";
  /** Options d'anticipation déclarées pour le dossier. L'existence d'une pièce d'adoption est vérifiée par le moteur, pas ici. */
  anticipated?: readonly FrenchGaapTextId[];
}

export interface TextApplicability {
  textId: FrenchGaapTextId;
  label: string;
  status: ApplicabilityStatus;
  reasons: string[];
  /** Première période obligatoire, formulée. */
  mandatoryFrom: string;
  /** Fenêtre d'anticipation pour cette période, si l'option existe et que la période y est éligible. */
  anticipationWindow: { from: string; scope: AnticipationRule["scope"] } | null;
  contractualScope: string | null;
  numbering: Partial<Record<NumberingTopic, string>>;
  editions: OfficialEdition[];
  limits: string[];
}

export interface FrenchGaapResolution {
  query: Required<Pick<ApplicabilityQuery, "startDate" | "closingDate" | "profile">> & { anticipated: FrenchGaapTextId[] };
  texts: TextApplicability[];
  /** Numérotation retenue par sujet, avec le texte qui la porte. */
  numbering: Partial<Record<NumberingTopic, { article: string; textId: FrenchGaapTextId; basis: ApplicabilityStatus }>>;
  limits: string[];
}

const isoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function mandatoryLabel(rule: FirstMandatoryRule): string {
  if (rule.kind === "periods_opened_from") return `exercices ouverts à compter du ${rule.date}`;
  if (rule.kind === "periods_in_progress_at") return `exercices en cours au ${rule.date} et exercices ouverts ensuite`;
  return `édition de lecture pour les exercices ouverts du ${rule.from} au ${rule.to ?? "(sans terme)"}`;
}

function appliesMandatorily(rule: FirstMandatoryRule, startDate: string, closingDate: string): boolean {
  if (rule.kind === "periods_opened_from") return startDate >= rule.date;
  if (rule.kind === "periods_in_progress_at") return closingDate >= rule.date; // en cours à la date, ou ouvert ensuite
  return startDate >= rule.from && (rule.to === null || startDate <= rule.to);
}

function anticipationEligible(rule: AnticipationRule, startDate: string, closingDate: string): boolean {
  if (!rule.allowed || !rule.from) return false;
  if (rule.scope === "period_in_progress_at_publication") return startDate <= rule.from && closingDate >= rule.from;
  // « à compter de sa date de publication » : la période doit être ouverte à la publication ou après.
  return closingDate >= rule.from;
}

/**
 * Résout, pour une période, le statut de chaque texte et la numérotation d'article par sujet.
 * Une période est jugée à sa date d'ouverture : aucun texte postérieur n'est appliqué sans option.
 */
export function resolveFrenchGaap(input: ApplicabilityQuery): FrenchGaapResolution {
  const profile = input.profile ?? "pcg_general";
  const anticipated = [...(input.anticipated ?? [])];
  const limits: string[] = [];
  if (!isoDate(input.startDate) || !isoDate(input.closingDate) || input.startDate > input.closingDate) {
    limits.push("Période invalide : ouverture et clôture AAAA-MM-JJ requises, ouverture ≤ clôture.");
    return {
      query: { startDate: input.startDate, closingDate: input.closingDate, profile, anticipated },
      texts: FRENCH_GAAP_TEXTS.map((t) => ({ textId: t.id, label: t.label, status: "unknown", reasons: ["Période invalide."], mandatoryFrom: mandatoryLabel(t.firstMandatory), anticipationWindow: null, contractualScope: t.contractualScope, numbering: {}, editions: t.editions, limits: t.limits })),
      numbering: {},
      limits,
    };
  }
  const texts: TextApplicability[] = FRENCH_GAAP_TEXTS.map((t) => {
    const reasons: string[] = [];
    let status: ApplicabilityStatus;
    const elected = anticipated.includes(t.id);
    const eligible = anticipationEligible(t.anticipation, input.startDate, input.closingDate);
    if (profile !== "pcg_general") {
      status = "out_of_scope_sector";
      reasons.push("Référentiel sectoriel : hors périmètre du résolveur PCG général ; référentiel propre à établir.");
    } else if (appliesMandatorily(t.firstMandatory, input.startDate, input.closingDate)) {
      status = "mandatory";
      reasons.push(`${t.firstMandatory.kind === "consolidated_edition" ? "Édition applicable" : "Application obligatoire"} : ${mandatoryLabel(t.firstMandatory)}.`);
      if (elected) reasons.push("Option d'anticipation déclarée sans objet : le texte s'applique de plein droit.");
    } else if (elected && eligible) {
      status = "anticipation_elected";
      reasons.push(`Option d'anticipation déclarée ; ${t.anticipation.text ?? "anticipation admise par le texte"}`);
    } else if (elected && !eligible) {
      status = "not_yet_applicable";
      reasons.push(t.anticipation.allowed ? `Option déclarée mais période inéligible : l'anticipation vise ${t.anticipation.scope === "period_in_progress_at_publication" ? "l'exercice en cours" : "les exercices ouverts ou en cours"} à la publication du ${t.anticipation.from}.` : "Option déclarée mais le texte n'admet aucune anticipation.");
    } else if (eligible) {
      status = "anticipation_available";
      reasons.push(`Option d'anticipation ouverte et non déclarée : le texte n'est pas appliqué. ${t.anticipation.text ?? ""}`.trim());
    } else {
      status = "not_yet_applicable";
      reasons.push(`Non applicable à une période ouverte le ${input.startDate} : ${mandatoryLabel(t.firstMandatory)}.`);
    }
    return {
      textId: t.id,
      label: t.label,
      status,
      reasons,
      mandatoryFrom: mandatoryLabel(t.firstMandatory),
      anticipationWindow: eligible && t.anticipation.from ? { from: t.anticipation.from, scope: t.anticipation.scope } : null,
      contractualScope: t.contractualScope,
      numbering: status === "mandatory" || status === "anticipation_elected" ? { ...t.numbering } : {},
      editions: t.editions,
      limits: t.limits,
    };
  });

  // Supersession : un texte appliqué (de plein droit ou par option) remplace, sur ses sujets, ceux qu'il désigne.
  const applied = new Set(texts.filter((t) => t.status === "mandatory" || t.status === "anticipation_elected").map((t) => t.textId));
  for (const t of texts) {
    if (!applied.has(t.textId)) continue;
    for (const other of FRENCH_GAAP_TEXTS.filter((o) => applied.has(o.id) && o.supersedes.includes(t.textId))) {
      const topics = Object.keys(other.numbering) as NumberingTopic[];
      for (const topic of topics) delete t.numbering[topic];
      if (Object.keys(t.numbering).length === 0 && t.status === "mandatory") {
        t.status = "superseded";
        t.reasons.push(`Remplacé sur ses sujets par ${other.label}.`);
      }
    }
  }

  const numbering: FrenchGaapResolution["numbering"] = {};
  for (const t of texts) {
    if (t.status !== "mandatory" && t.status !== "anticipation_elected") continue;
    for (const [topic, article] of Object.entries(t.numbering) as [NumberingTopic, string][]) numbering[topic] = { article, textId: t.textId, basis: t.status };
  }
  if (profile !== "pcg_general") limits.push("Référentiel sectoriel : aucune numérotation résolue.");
  for (const t of texts) if (t.status === "anticipation_available") limits.push(`${t.textId} : option d'anticipation non déclarée, texte non appliqué.`);
  for (const t of FRENCH_GAAP_TEXTS) for (const e of t.editions) if (e.access === "inaccessible") limits.push(`${t.id} : source ${e.url} non lue (${e.note ?? "inaccessible"}).`);
  return { query: { startDate: input.startDate, closingDate: input.closingDate, profile, anticipated }, texts, numbering, limits };
}

/** Article applicable pour un sujet, ou null si aucun texte appliqué ne le porte. */
export function applicableArticle(topic: NumberingTopic, input: ApplicabilityQuery): { article: string; textId: FrenchGaapTextId; basis: ApplicabilityStatus } | null {
  return resolveFrenchGaap(input).numbering[topic] ?? null;
}

export type ContractualScopeStatus =
  /** Contrat conclu ou renouvelé après l'entrée en vigueur : le texte s'applique au contrat. */
  | "in_scope"
  /** Contrat conclu ou renouvelé avant l'entrée en vigueur : le texte antérieur continue de régir le contrat. */
  | "out_of_scope"
  /** Contrat conclu ou renouvelé le jour même de l'entrée en vigueur : « postérieurement » n'est pas tranché. */
  | "entry_day"
  /** Date de conclusion ou de renouvellement absente ou invalide : le texte applicable au contrat reste inconnu. */
  | "contract_date_required"
  /** Le texte n'énonce aucun champ contractuel. */
  | "no_contractual_scope";

/**
 * Champ contractuel d'un texte (C11) : dit si un contrat de vente, daté de sa conclusion ou de son dernier
 * renouvellement, relève du texte. N'est consulté que si le texte s'applique à l'exercice. Aucune date n'est supposée.
 */
export function contractualApplicability(textId: FrenchGaapTextId, contractDate: string | null): { status: ContractualScopeStatus; entryIntoForce: string | null; reason: string } {
  const t = frenchGaapText(textId);
  if (!t.contractualScopeRule) return { status: "no_contractual_scope", entryIntoForce: t.entryIntoForce?.date ?? null, reason: "Le texte n'énonce aucun champ contractuel." };
  const entry = t.entryIntoForce?.date ?? null;
  if (!entry) return { status: "contract_date_required", entryIntoForce: null, reason: "Entrée en vigueur non datée : le champ contractuel ne peut pas être apprécié." };
  if (!contractDate || !isoDate(contractDate)) return { status: "contract_date_required", entryIntoForce: entry, reason: `Date de conclusion ou de renouvellement du contrat requise : ${t.contractualScope ?? "champ contractuel du texte"}` };
  if (contractDate > entry) return { status: "in_scope", entryIntoForce: entry, reason: `Contrat conclu ou renouvelé le ${contractDate}, après l'entrée en vigueur du ${entry}.` };
  if (contractDate < entry) return { status: "out_of_scope", entryIntoForce: entry, reason: `Contrat conclu ou renouvelé le ${contractDate}, avant l'entrée en vigueur du ${entry} : le texte antérieur continue de le régir.` };
  return { status: "entry_day", entryIntoForce: entry, reason: `Contrat conclu ou renouvelé le jour de l'entrée en vigueur (${entry}) : « postérieurement » est à apprécier par le professionnel.` };
}
