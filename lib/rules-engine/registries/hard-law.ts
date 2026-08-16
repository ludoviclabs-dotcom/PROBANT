import { headerConformite } from "@/lib/fec/parser";
import { SOURCES } from "@/lib/referentiel/sources";
import type { Rule, RuleFinding } from "../types";

/**
 * Registre HARD-LAW : exigences obligatoires issues du LPF et du PCG.
 * Leur autorité normative ne préjuge ni de l'étape de contrôle ni de l'effet
 * sur l'ingestion : seul `ingestion_admissibility` peut rejeter un fichier.
 */

const VERSION = "1.0.0";

function base(
  rule: Pick<
    Rule,
    "id" | "family" | "version" | "cloison" | "severity"
  >,
  partial: Omit<
    RuleFinding,
    "family" | "ruleId" | "ruleVersion" | "cloison" | "severity"
  >,
): RuleFinding {
  return {
    family: rule.family,
    ruleId: rule.id,
    ruleVersion: rule.version,
    cloison: rule.cloison,
    severity: rule.severity,
    ...partial,
  };
}

const R_HL_001: Rule = {
  id: "R-HL-001",
  family: "hardLaw",
  version: VERSION,
  cloison: "journaux",
  severity: "bloquant",
  controlStage: "ingestion_admissibility",
  titre: "Nommage du fichier FEC",
  run(ctx) {
    const re = /^\d{9}FEC\d{8}\.(txt|csv)$/iu;
    if (re.test(ctx.nomFichier)) return [];
    return [
      base(this, {
        siloId: "journaux",
        titre: "Nommage de fichier non conforme",
        constat: `Le fichier « ${ctx.nomFichier} » ne respecte pas le format SirenFECAAAAMMJJ.`,
        explication:
          "Le nom du FEC doit être composé du SIREN (9 chiffres), de « FEC », puis de la date de clôture au format AAAAMMJJ. Un nommage incorrect empêche l'identification réglementaire du fichier.",
        mesure: { constate: 0, seuil: 1, unite: "ratio", libelle: "conformité nommage" },
        source: SOURCES.LPF_A47A1,
        comptesConcernes: [],
        lignesSource: [],
        faisceau: ["nom de fichier", "format réglementaire"],
        preuve: [
          { etape: "Lecture nom fichier", detail: ctx.nomFichier },
          { etape: "Règle appliquée", detail: "Regex SirenFECAAAAMMJJ" },
        ],
      }),
    ];
  },
};

const R_HL_002: Rule = {
  id: "R-HL-002",
  family: "hardLaw",
  version: VERSION,
  cloison: "journaux",
  severity: "bloquant",
  controlStage: "ingestion_admissibility",
  titre: "Présence des 18 rubriques",
  run(ctx) {
    const { conforme, manquantes } = headerConformite(ctx.parsed.headerColumns);
    if (conforme) return [];
    return [
      base(this, {
        siloId: "journaux",
        titre: "Rubriques FEC obligatoires manquantes",
        constat: `Colonnes absentes : ${manquantes.join(", ")}.`,
        explication:
          "Les 18 rubriques de l'article A.47 A-1 sont obligatoires. L'absence d'une rubrique rend le fichier irrecevable au sens fiscal.",
        mesure: {
          constate: 18 - manquantes.length,
          seuil: 18,
          unite: "ratio",
          libelle: "rubriques présentes",
        },
        source: SOURCES.LPF_A47A1,
        comptesConcernes: [],
        lignesSource: [],
        faisceau: ["en-tête", "rubriques manquantes"],
        preuve: [
          { etape: "En-tête lu", detail: ctx.parsed.headerColumns.join(" | ") },
          { etape: "Rubriques manquantes", detail: manquantes.join(", ") },
        ],
      }),
    ];
  },
};

const R_HL_003: Rule = {
  id: "R-HL-003",
  family: "hardLaw",
  version: VERSION,
  cloison: "journaux",
  severity: "majeur",
  controlStage: "ingestion_admissibility",
  titre: "Ordre des rubriques",
  run(ctx) {
    const { ordreRespecte } = headerConformite(ctx.parsed.headerColumns);
    if (ordreRespecte) return [];
    return [
      base(this, {
        siloId: "journaux",
        titre: "Ordre des rubriques non conforme",
        constat: "Les rubriques ne respectent pas l'ordre prescrit par l'A.47 A-1.",
        explication:
          "L'ordre des colonnes est normé. Un désordre complique le contrôle automatisé et peut être relevé par l'administration.",
        mesure: { constate: 0, seuil: 1, unite: "ratio", libelle: "ordre conforme" },
        source: SOURCES.LPF_A47A1,
        comptesConcernes: [],
        lignesSource: [],
        faisceau: ["ordre des colonnes"],
        preuve: [
          { etape: "En-tête lu", detail: ctx.parsed.headerColumns.join(" | ") },
        ],
      }),
    ];
  },
};

const R_HL_004: Rule = {
  id: "R-HL-004",
  family: "hardLaw",
  version: VERSION,
  cloison: "journaux",
  severity: "bloquant",
  controlStage: "ingestion_admissibility",
  titre: "Format des dates AAAAMMJJ",
  run(ctx) {
    const fautives = ctx.entries
      .filter((e) => e.ecritureDate && !/^\d{8}$/u.test(e.ecritureDate))
      .slice(0, 50);
    if (fautives.length === 0) return [];
    return [
      base(this, {
        siloId: "journaux",
        titre: "Dates au format non conforme",
        constat: `${fautives.length} écriture(s) avec une EcritureDate hors format AAAAMMJJ.`,
        explication:
          "Les dates doivent être exprimées en AAAAMMJJ sans séparateur. Un format non conforme bloque l'exploitation chronologique du fichier.",
        mesure: {
          constate: fautives.length,
          seuil: 0,
          unite: "ratio",
          libelle: "dates non conformes",
        },
        source: SOURCES.LPF_A47A1,
        comptesConcernes: [],
        lignesSource: fautives.map((e) => e.ligne),
        faisceau: ["format de date"],
        preuve: [
          {
            etape: "Échantillon",
            detail: fautives
              .slice(0, 5)
              .map((e) => `L${e.ligne}: "${e.ecritureDate}"`)
              .join(", "),
          },
        ],
      }),
    ];
  },
};

const R_HL_005: Rule = {
  id: "R-HL-005",
  family: "hardLaw",
  version: VERSION,
  cloison: "journaux",
  severity: "bloquant",
  controlStage: "ingestion_admissibility",
  titre: "Séparateur et variante de montants",
  run(ctx) {
    if (ctx.parsed.variante !== "inconnue") return [];
    return [
      base(this, {
        siloId: "journaux",
        titre: "Variante de montants indéterminée",
        constat:
          "Ni le couple Debit/Credit ni le couple Montant/Sens n'a pu être identifié.",
        explication:
          "Le FEC doit présenter les montants en Débit/Crédit ou en Montant/Sens. L'absence des deux empêche toute reconstitution des soldes.",
        mesure: { constate: 0, seuil: 1, unite: "ratio", libelle: "variante reconnue" },
        source: SOURCES.LPF_A47A1,
        comptesConcernes: [],
        lignesSource: [],
        faisceau: ["séparateur", "colonnes montants"],
        preuve: [
          { etape: "Séparateur détecté", detail: ctx.parsed.separateurNom },
          { etape: "En-tête", detail: ctx.parsed.headerColumns.join(" | ") },
        ],
      }),
    ];
  },
};

const R_HL_006: Rule = {
  id: "R-HL-006",
  family: "hardLaw",
  version: VERSION,
  cloison: "journaux",
  severity: "majeur",
  controlStage: "tax_review",
  titre: "Codification des numéros de compte (FEC)",
  run(ctx) {
    const fautifs = ctx.entries
      .filter((e) => {
        const c = e.compteNum?.trim() ?? "";
        return c.length === 0 || !/^[1-8]/u.test(c);
      })
      .slice(0, 50);
    if (fautifs.length === 0) return [];
    const comptes = [...new Set(fautifs.map((e) => e.compteNum))].slice(0, 10);
    return [
      base(this, {
        siloId: "journaux",
        titre: "Numéros de compte à rapprocher du plan comptable français",
        constat: `${fautifs.length} ligne(s) dont le compte ne débute pas par une classe PCG 1 à 8 attendue.`,
        explication:
          "Le FEC doit restituer un numéro de compte dont les trois premiers caractères respectent les normes du plan comptable français. Ce pré-contrôle ne remplace pas le rapprochement avec le plan de comptes de l'entité ou son référentiel sectoriel et ne rejette pas techniquement le FEC.",
        mesure: {
          constate: fautifs.length,
          seuil: 0,
          unite: "ratio",
          libelle: "comptes non conformes",
        },
        source: SOURCES.LPF_A47A1_ACCOUNT_NUMBER,
        comptesConcernes: comptes,
        lignesSource: fautifs.map((e) => e.ligne),
        faisceau: ["plan de comptes", "classe invalide"],
        preuve: [
          { etape: "Comptes en cause", detail: comptes.join(", ") },
        ],
      }),
    ];
  },
};

const R_HL_007: Rule = {
  id: "R-HL-007",
  family: "hardLaw",
  version: VERSION,
  cloison: "journaux",
  severity: "majeur",
  controlStage: "tax_review",
  titre: "Ordre chronologique de validation",
  run(ctx) {
    const dated = ctx.entries.filter((e) => /^\d{8}$/u.test(e.validDate));
    let ruptures = 0;
    let last = "";
    const lignes: number[] = [];
    for (const e of dated) {
      if (last && e.validDate < last) {
        ruptures++;
        if (lignes.length < 50) lignes.push(e.ligne);
      }
      last = e.validDate > last ? e.validDate : last;
    }
    if (ruptures === 0) return [];
    return [
      base(this, {
        siloId: "journaux",
        titre: "Ordre de validation à justifier",
        constat: `${ruptures} rupture(s) d'ordre chronologique sur ValidDate.`,
        explication:
          "Le FEC remis lors d'un contrôle fiscal est classé par ordre chronologique de validation des écritures. Une rupture est un signal de conformité fiscale à documenter ; elle ne rend pas le fichier techniquement illisible.",
        mesure: { constate: ruptures, seuil: 0, unite: "ratio", libelle: "ruptures d'ordre" },
        source: SOURCES.LPF_A47A1_CHRONOLOGY,
        comptesConcernes: [],
        lignesSource: lignes,
        faisceau: ["chronologie", "ValidDate"],
        preuve: [{ etape: "Nb ruptures", detail: String(ruptures) }],
      }),
    ];
  },
};

const R_HL_008: Rule = {
  id: "R-HL-008",
  family: "hardLaw",
  version: VERSION,
  cloison: "journaux",
  severity: "majeur",
  controlStage: "accounting_review",
  titre: "Équilibre débit / crédit par écriture",
  run(ctx) {
    const soldes = new Map<string, number>();
    const lignesByEcriture = new Map<string, number[]>();
    for (const e of ctx.entries) {
      soldes.set(e.ecritureNum, (soldes.get(e.ecritureNum) ?? 0) + e.montant);
      const arr = lignesByEcriture.get(e.ecritureNum) ?? [];
      arr.push(e.ligne);
      lignesByEcriture.set(e.ecritureNum, arr);
    }
    const desequilibrees = [...soldes.entries()].filter(
      ([, s]) => Math.abs(s) > 0.005,
    );
    if (desequilibrees.length === 0) return [];
    const lignes = desequilibrees
      .flatMap(([num]) => lignesByEcriture.get(num) ?? [])
      .slice(0, 50);
    return [
      base(this, {
        siloId: "journaux",
        titre: "Écritures déséquilibrées à revoir",
        constat: `${desequilibrees.length} écriture(s) dont la somme des débits ≠ somme des crédits.`,
        explication:
          "Le système de partie double impose une équivalence entre les montants portés au débit et au crédit des comptes affectés par une écriture. Un déséquilibre appelle une revue comptable ; il ne constitue pas un rejet technique du FEC.",
        mesure: {
          constate: desequilibrees.length,
          seuil: 0,
          unite: "ratio",
          libelle: "écritures déséquilibrées",
        },
        source: SOURCES.PCG_DOUBLE_ENTRY,
        comptesConcernes: [],
        lignesSource: lignes,
        faisceau: ["partie double", "équilibre"],
        preuve: [
          {
            etape: "Échantillon",
            detail: desequilibrees
              .slice(0, 5)
              .map(([num, s]) => `Éc.${num}: ${s.toFixed(2)}`)
              .join(", "),
          },
        ],
      }),
    ];
  },
};

const R_HL_009: Rule = {
  id: "R-HL-009",
  family: "hardLaw",
  version: VERSION,
  cloison: "journaux",
  severity: "bloquant",
  controlStage: "ingestion_admissibility",
  titre: "Montants numériques",
  run(ctx) {
    if (ctx.parsed.parseErrors.length === 0) return [];
    const montantErr = ctx.parsed.parseErrors.filter((e) =>
      /non numérique|colonnes/u.test(e),
    );
    if (montantErr.length === 0) return [];
    return [
      base(this, {
        siloId: "journaux",
        titre: "Montants non numériques ou lignes incomplètes",
        constat: `${montantErr.length} anomalie(s) de valeur détectée(s) au parsing.`,
        explication:
          "Les zones Débit/Crédit doivent contenir des valeurs numériques sans séparateur de milliers. Des valeurs non numériques empêchent les calculs.",
        mesure: {
          constate: montantErr.length,
          seuil: 0,
          unite: "ratio",
          libelle: "erreurs de valeur",
        },
        source: SOURCES.LPF_A47A1,
        comptesConcernes: [],
        lignesSource: [],
        faisceau: ["valeurs numériques"],
        preuve: montantErr.slice(0, 5).map((e) => ({ etape: "Parsing", detail: e })),
      }),
    ];
  },
};

const R_HL_010: Rule = {
  id: "R-HL-010",
  family: "hardLaw",
  version: VERSION,
  cloison: "journaux",
  severity: "mineur",
  controlStage: "tax_review",
  titre: "Reprise des soldes en ouverture",
  run(ctx) {
    if (ctx.entries.length === 0) return [];
    const first = ctx.entries[0];
    const looksAN =
      /AN|A-?NOUVEAU|REPORT|OUV/iu.test(first.journalCode) ||
      /A.?NOUVEAU|REPRISE|REPORT/iu.test(first.journalLib);
    if (looksAN) return [];
    return [
      base(this, {
        siloId: "journaux",
        titre: "Reprise des soldes non identifiée en tête",
        constat:
          "Le premier enregistrement ne semble pas correspondre à une reprise des soldes (journal A-Nouveau).",
        explication:
          "Le FEC débute usuellement par la reprise des soldes d'ouverture. Son absence en tête peut indiquer un fichier tronqué ou mal trié.",
        mesure: { constate: 0, seuil: 1, unite: "ratio", libelle: "reprise détectée" },
        source: SOURCES.LPF_A47A1,
        comptesConcernes: [],
        lignesSource: [first.ligne],
        faisceau: ["à-nouveaux", "ouverture"],
        preuve: [
          {
            etape: "Première ligne",
            detail: `Journal ${first.journalCode} — ${first.journalLib}`,
          },
        ],
      }),
    ];
  },
};

export const HARD_LAW_RULES: Rule[] = [
  R_HL_001,
  R_HL_002,
  R_HL_003,
  R_HL_004,
  R_HL_005,
  R_HL_006,
  R_HL_007,
  R_HL_008,
  R_HL_009,
  R_HL_010,
];

