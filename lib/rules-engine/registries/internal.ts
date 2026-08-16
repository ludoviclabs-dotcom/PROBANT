import type { FecEntry } from "@/lib/canonical-model";
import { siloForCompte, SILOS } from "@/lib/canonical-model";
import { SEUILS_INTERNES } from "@/lib/referentiel/sources";
import type { Rule, RuleFinding } from "../types";

/**
 * Registre INTERNAL : heuristiques, ratios et scoring propres à PROBANT.
 * Famille « paramètre interne » — explicitement distincte du droit dur et de
 * la méthode professionnelle, pour ne jamais présenter une heuristique comme
 * une obligation.
 */

const VERSION = "1.0.0";

/** Source interne générique (non opposable). */
function sourceInterne(libelle: string) {
  return {
    ref: "PROBANT — paramètre interne",
    citation: `${libelle} Paramètre interne, non opposable, versionné dans le référentiel PROBANT.`,
    effectiveDate: "2024-01-01",
  };
}

const R_IN_001: Rule = {
  id: "R-IN-001",
  family: "internal",
  version: VERSION,
  cloison: "resultat",
  severity: "informatif",
  controlStage: "accounting_review",
  titre: "Concentration des mouvements par silo",
  run(ctx) {
    const totalAbs = ctx.entries.reduce((s, e) => s + Math.abs(e.montant), 0);
    if (totalAbs === 0) return [];
    const parSilo = new Map<string, { montant: number; lignes: number[] }>();
    for (const e of ctx.entries) {
      const silo = siloForCompte(e.compteNum);
      if (!silo) continue;
      const cur = parSilo.get(silo.id) ?? { montant: 0, lignes: [] };
      cur.montant += Math.abs(e.montant);
      if (cur.lignes.length < 30) cur.lignes.push(e.ligne);
      parSilo.set(silo.id, cur);
    }
    const findings: RuleFinding[] = [];
    for (const [siloId, agg] of parSilo) {
      const part = (agg.montant / totalAbs) * 100;
      if (part < 35) continue; // seuil interne de concentration
      const silo = SILOS.find((s) => s.id === siloId);
      findings.push({
        family: "internal",
        ruleId: this.id,
        ruleVersion: VERSION,
        cloison: silo?.cloison ?? "resultat",
        severity: "informatif",
        siloId,
        key: siloId,
        titre: `Concentration des mouvements : ${silo?.label ?? siloId}`,
        constat: `Ce silo concentre ${part.toFixed(1)} % des mouvements (valeur absolue).`,
        explication:
          "Indicateur d'orientation des contrôles : une forte concentration n'est pas une anomalie mais oriente l'effort de revue vers les zones à fort enjeu.",
        mesure: { constate: part, seuil: 35, unite: "%", libelle: "part des mouvements" },
        source: sourceInterne("Seuil de concentration de 35 % des mouvements par silo."),
        comptesConcernes: [],
        lignesSource: agg.lignes,
        faisceau: ["concentration", "orientation des contrôles"],
        preuve: [
          { etape: "Total mouvements", detail: totalAbs.toFixed(0) },
          { etape: "Dont silo", detail: agg.montant.toFixed(0) },
        ],
      });
    }
    return findings;
  },
};

const R_IN_002: Rule = {
  id: "R-IN-002",
  family: "internal",
  version: VERSION,
  cloison: "journaux",
  severity: "mineur",
  controlStage: "accounting_review",
  titre: "Matérialité indicative",
  run(ctx) {
    // Approche du total bilan par la somme des débits de classes 1-5.
    const bilanAbs = ctx.entries
      .filter((e: FecEntry) => /^[1-5]/u.test(e.compteNum))
      .reduce((s, e) => s + Math.abs(e.debit), 0);
    if (bilanAbs === 0) return [];
    const materialite = (bilanAbs * SEUILS_INTERNES.materialitePctBilan) / 100;
    return [
      {
        family: "internal",
        ruleId: this.id,
        ruleVersion: VERSION,
        cloison: "journaux",
        severity: "informatif",
        siloId: "journaux",
        titre: "Seuil de matérialité indicatif",
        constat: `Matérialité indicative estimée à ${materialite.toFixed(0)} € (${SEUILS_INTERNES.materialitePctBilan} % du total des débits de bilan).`,
        explication:
          "Seuil d'orientation pour hiérarchiser les constats. À calibrer selon le jugement professionnel (ISA 320) ; n'a pas valeur de seuil réglementaire.",
        mesure: {
          constate: materialite,
          seuil: bilanAbs,
          unite: "EUR",
          libelle: "matérialité indicative",
        },
        source: sourceInterne(
          `Matérialité = ${SEUILS_INTERNES.materialitePctBilan} % du total des débits de bilan.`,
        ),
        comptesConcernes: [],
        lignesSource: [],
        faisceau: ["matérialité", "hiérarchisation"],
        preuve: [{ etape: "Base de calcul", detail: bilanAbs.toFixed(0) }],
      } satisfies RuleFinding,
    ];
  },
};

export const INTERNAL_RULES: Rule[] = [R_IN_001, R_IN_002];

