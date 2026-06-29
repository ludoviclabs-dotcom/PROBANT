/**
 * Contrôles qualité du référentiel « Audit Normatif 360 ».
 *
 * Objectif : garantir la fiabilité de la base de connaissance — pas d'exigence
 * inventée, pas de seuil chiffré présenté comme obligatoire sans source, pas de
 * source orpheline. Les contrôles produisent un rapport structuré (jamais
 * d'exception), exploitable par l'UI (`ValidationReport`) et les tests.
 */

import type { AuditCycle, NormativeSource } from "./types";

export interface ValidationIssue {
  cycle?: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: {
    cycles: number;
    sources: number;
    validated: number;
    reviewRequired: number;
  };
}

/** Cycles dont le sujet impose une analyse du risque de fraude (ISA 240). */
const FRAUD_SENSITIVE = [
  "chiffre-affaires",
  "achats",
  "cutoff",
  "ecritures",
  "tresorerie",
  "disponibilites",
  "banques",
  "parties-liees",
  "controle-interne-fraude",
];

function cycleIsFraudSensitive(slug: string): boolean {
  return FRAUD_SENSITIVE.some((kw) => slug.includes(kw));
}

/** Valide un cycle isolément. */
export function validateCycle(c: AuditCycle): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const ctx = c.slug || "(slug manquant)";

  // 1-2. Champs structurants.
  if (!c.slug) errors.push({ cycle: ctx, field: "slug", message: "slug manquant" });
  if (!c.family)
    errors.push({ cycle: ctx, field: "family", message: "family manquante" });
  if (!c.title)
    errors.push({ cycle: ctx, field: "title", message: "title manquant" });

  // 3. Au moins une source ISA ou NEP dans les normes applicables.
  const hasIsaNep = (c.applicableStandards ?? []).some(
    (s) => s.type === "ISA" || s.type === "NEP" || /^(isa|nep)-/i.test(s.id),
  );
  if (!hasIsaNep) {
    errors.push({
      cycle: ctx,
      field: "applicableStandards",
      message: "aucune source ISA ou NEP rattachée",
    });
  }

  // 5. Compte PCG attendu (sauf cycles purement transversaux).
  if (c.family !== "TRANSVERSAL" && (c.pcgAccounts ?? []).length === 0) {
    warnings.push({
      cycle: ctx,
      field: "pcgAccounts",
      message: "aucun compte PCG renseigné",
    });
  }

  // 7. Une règle/seuil OBLIGATOIRE doit citer une source.
  (c.thresholds ?? []).forEach((t, i) => {
    if (t.status === "OBLIGATOIRE" && (t.sourceIds ?? []).length === 0) {
      errors.push({
        cycle: ctx,
        field: `thresholds[${i}]`,
        message: `seuil obligatoire "${t.label}" sans source`,
      });
    }
  });

  // 8-9. Un ratio OBLIGATOIRE doit citer une source ; une borne chiffrée ne doit
  // jamais être marquée OBLIGATOIRE à tort.
  (c.ratios ?? []).forEach((r, i) => {
    if (r.status === "OBLIGATOIRE" && (r.sourceIds ?? []).length === 0) {
      errors.push({
        cycle: ctx,
        field: `ratios[${i}]`,
        message: `ratio obligatoire "${r.name}" sans source officielle`,
      });
    }
    if (r.status === "OBLIGATOIRE" && /[<>]|\d\s*%|\bjours\b/i.test(r.alertThreshold)) {
      warnings.push({
        cycle: ctx,
        field: `ratios[${i}]`,
        message: `borne chiffrée "${r.name}" marquée OBLIGATOIRE — vérifier (souvent BONNE_PRATIQUE/PARAMETRABLE)`,
      });
    }
  });

  // Matérialité : caveat obligatoire + toutes les plages en BONNE_PRATIQUE.
  const m = c.materiality;
  if (!m) {
    errors.push({
      cycle: ctx,
      field: "materiality",
      message: "bloc materiality manquant",
    });
  } else {
    for (const [key, block] of Object.entries(m)) {
      if (!block?.caveat) {
        errors.push({
          cycle: ctx,
          field: `materiality.${key}.caveat`,
          message: "caveat ISA/NEP obligatoire manquant",
        });
      }
      if (block && block.status === "OBLIGATOIRE") {
        errors.push({
          cycle: ctx,
          field: `materiality.${key}.status`,
          message:
            "un pourcentage de matérialité ne peut être OBLIGATOIRE (BONNE_PRATIQUE/PARAMETRABLE attendu)",
        });
      }
    }
  }

  // 10. Si une différence IFRS/PCG existe, elle doit distinguer les deux traitements.
  (c.ifrsVsPcg ?? []).forEach((d, i) => {
    if (!d.ifrsTreatment || !d.pcgTreatment) {
      errors.push({
        cycle: ctx,
        field: `ifrsVsPcg[${i}]`,
        message: `différence "${d.topic}" : traitement IFRS ou PCG manquant`,
      });
    }
  });

  // 11. Risque de fraude obligatoire pour les cycles sensibles.
  if (cycleIsFraudSensitive(c.slug)) {
    const hasFraud = (c.risks ?? []).some((r) => r.category === "RISQUE_FRAUDE");
    if (!hasFraud) {
      errors.push({
        cycle: ctx,
        field: "risks",
        message: "cycle sensible : aucun risque de fraude (ISA 240) identifié",
      });
    }
  }

  // 12. Sections obligatoires du tableau standard.
  const required: (keyof AuditCycle)[] = [
    "applicableStandards",
    "materiality",
    "ratios",
    "analyticalProcedures",
    "detailTests",
    "risks",
    "officialSources",
  ];
  for (const f of required) {
    const v = c[f];
    if (v === undefined || v === null) {
      errors.push({
        cycle: ctx,
        field: String(f),
        message: `section obligatoire "${String(f)}" absente`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      cycles: 1,
      sources: 0,
      validated: c.reviewStatus === "VALIDATED" ? 1 : 0,
      reviewRequired: c.reviewStatus === "REVIEW_REQUIRED" ? 1 : 0,
    },
  };
}

/** Vérifie l'intégrité référentielle des sources citées par les cycles. */
export function validateSources(
  cycles: AuditCycle[],
  sources: NormativeSource[],
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const known = new Set(sources.map((s) => s.id));

  // 6. Une source obligatoire doit avoir une URL ou un identifiant.
  for (const s of sources) {
    if (!s.id) {
      errors.push({ field: "sources", message: "source sans identifiant" });
    }
    if (s.status === "OBLIGATOIRE" && !s.url) {
      warnings.push({
        field: `source:${s.id}`,
        message: "source obligatoire sans URL",
      });
    }
  }

  // 1. Tous les sourceIds référencés existent dans le registre.
  for (const c of cycles) {
    const refs = new Set<string>([
      ...(c.applicableStandards ?? []).map((s) => s.id),
      ...(c.officialSources ?? []).map((s) => s.id),
      ...(c.thresholds ?? []).flatMap((t) => t.sourceIds ?? []),
      ...(c.ratios ?? []).flatMap((r) => r.sourceIds ?? []),
      ...(c.analyticalProcedures ?? []).flatMap((a) => a.sourceIds ?? []),
      ...(c.detailTests ?? []).flatMap((d) => d.sourceIds ?? []),
      ...(c.risks ?? []).flatMap((r) => r.sourceIds ?? []),
      ...(c.ifrsVsPcg ?? []).flatMap((d) => d.sourceIds ?? []),
      ...Object.values(c.materiality ?? {}).flatMap(
        (b) => (b as { sourceIds?: string[] })?.sourceIds ?? [],
      ),
    ]);
    for (const ref of refs) {
      if (ref && !known.has(ref)) {
        warnings.push({
          cycle: c.slug,
          field: "sourceIds",
          message: `source "${ref}" référencée mais absente du registre data/sources/`,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: { cycles: cycles.length, sources: sources.length, validated: 0, reviewRequired: 0 },
  };
}

/** Lance la validation complète (cycles + intégrité des sources). */
export async function validateAll(): Promise<ValidationResult> {
  const { loadAllCycles, loadAllSources } = await import("./loader");
  const [cycles, sources] = await Promise.all([loadAllCycles(), loadAllSources()]);

  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  let validated = 0;
  let reviewRequired = 0;

  for (const c of cycles) {
    const r = validateCycle(c);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    validated += r.stats.validated;
    reviewRequired += r.stats.reviewRequired;
  }

  const crossRef = validateSources(cycles, sources);
  errors.push(...crossRef.errors);
  warnings.push(...crossRef.warnings);

  // Doublons de slug.
  const slugs = cycles.map((c) => c.slug);
  const dupes = [...new Set(slugs.filter((s, i) => slugs.indexOf(s) !== i))];
  if (dupes.length) {
    errors.push({ field: "slug", message: `slugs dupliqués : ${dupes.join(", ")}` });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      cycles: cycles.length,
      sources: sources.length,
      validated,
      reviewRequired,
    },
  };
}
