import type { Finding } from "@/lib/canonical-model";
import { SEVERITY_ORDER } from "@/lib/canonical-model";
import type { Rule, RuleContext } from "./types";
import { HARD_LAW_RULES } from "./registries/hard-law";
import { METHODOLOGY_RULES } from "./registries/methodology";
import { INTERNAL_RULES } from "./registries/internal";

export const ALL_REGISTRIES: Rule[] = [
  ...HARD_LAW_RULES,
  ...METHODOLOGY_RULES,
  ...INTERNAL_RULES,
];

/**
 * Exécute un ensemble de règles sur un contexte et retourne des constats
 * complets (id déterministe, statut initial « en_attente »), triés par gravité.
 */
export function runRules(
  ctx: RuleContext,
  registries: Rule[] = ALL_REGISTRIES,
): Finding[] {
  const findings: Finding[] = [];
  for (const rule of registries) {
    let emitted: ReturnType<Rule["run"]>;
    try {
      emitted = rule.run(ctx);
    } catch (err) {
      // Une règle qui échoue ne doit pas casser l'analyse : on la signale.
      findings.push({
        id: `${rule.id}#error`,
        family: rule.family,
        severity: "informatif",
        controlStage: rule.controlStage,
        ruleId: rule.id,
        ruleVersion: rule.version,
        cloison: rule.cloison,
        siloId: "journaux",
        titre: `Règle ${rule.id} non exécutée`,
        constat: "La règle a rencontré une erreur d'exécution.",
        explication: String(err instanceof Error ? err.message : err),
        mesure: { constate: 0, seuil: 0, unite: "ratio", libelle: "n/a" },
        source: {
          ref: rule.id,
          citation: "—",
          effectiveDate: ctx.referentielVersion,
        },
        comptesConcernes: [],
        lignesSource: [],
        faisceau: [],
        preuve: [],
        statutRevue: "en_attente",
      });
      continue;
    }
    emitted.forEach((rf, i) => {
      const suffix = rf.key ?? String(i);
      const { key: _key, ...rest } = rf;
      findings.push({
        ...rest,
        id: `${rule.id}#${suffix}`,
        controlStage: rule.controlStage,
        statutRevue: "en_attente",
      });
    });
  }

  return findings.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

/**
 * Sépare les seuls motifs d'admissibilité technique des constats de revue.
 * La famille normative et la gravité ne participent pas à cette décision.
 */
export function splitAdmissibilite(findings: Finding[]): {
  admissibilite: Finding[];
  analyse: Finding[];
} {
  const admissibilite: Finding[] = [];
  const analyse: Finding[] = [];
  for (const f of findings) {
    if (f.controlStage === "ingestion_admissibility") {
      admissibilite.push(f);
    } else {
      analyse.push(f);
    }
  }
  return { admissibilite, analyse };
}

/** Un rejet technique ne peut être déclenché que pendant l'admissibilité. */
export function hasBlockingIngestionFinding(findings: Finding[]): boolean {
  return findings.some(
    (finding) =>
      finding.controlStage === "ingestion_admissibility" &&
      finding.severity === "bloquant",
  );
}

