import type { FecEntry } from "@/lib/canonical-model";
import { siloForCompte } from "@/lib/canonical-model";
import { SOURCES } from "@/lib/referentiel/sources";
import type { Rule, RuleFinding } from "../types";

/**
 * Registre METHODOLOGY : présomptions et procédures d'audit/révision
 * (ISA 240, 520, ISRE 2400). Ces constats ne sont pas des non-conformités
 * dures : ils déclenchent des procédures complémentaires (cf. faisceau).
 */

const VERSION = "1.0.0";

function isJournalManuel(e: FecEntry): boolean {
  return (
    /OD|DIV|EXT|OPD|RG/iu.test(e.journalCode) ||
    /divers|régularis|extra|manuel/iu.test(e.journalLib)
  );
}

function fecDateToNum(d: string): number | null {
  return /^\d{8}$/u.test(d) ? Number(d) : null;
}

function maxValidDate(entries: FecEntry[]): number | null {
  let max: number | null = null;
  for (const e of entries) {
    const n = fecDateToNum(e.validDate);
    if (n !== null && (max === null || n > max)) max = n;
  }
  return max;
}

const R_ME_001: Rule = {
  id: "R-ME-001",
  family: "methodology",
  version: VERSION,
  cloison: "journaux",
  severity: "majeur",
  controlStage: "accounting_review",
  titre: "Écritures de journal atypiques en fin de période",
  run(ctx) {
    const max = maxValidDate(ctx.entries);
    if (max === null) return [];
    // Fenêtre : écritures validées le dernier jour de validation observé.
    const cibles = ctx.entries.filter(
      (e) =>
        isJournalManuel(e) &&
        fecDateToNum(e.validDate) === max &&
        /^[67]/u.test(e.compteNum),
    );
    if (cibles.length === 0) return [];
    const montant = cibles.reduce((s, e) => s + Math.abs(e.montant), 0);
    const comptes = [...new Set(cibles.map((e) => e.compteNum))].slice(0, 12);
    return [
      {
        family: "methodology",
        ruleId: this.id,
        ruleVersion: VERSION,
        cloison: "resultat",
        severity: "majeur",
        siloId: siloForCompte(cibles[0].compteNum)?.id ?? "resultat-exceptionnel",
        titre: "Écritures manuelles tardives sur comptes de résultat",
        constat: `${cibles.length} écriture(s) manuelle(s) sur comptes 6/7 à la dernière date de validation, pour ${montant.toFixed(0)} € en valeur absolue.`,
        explication:
          "Les écritures de journal inhabituelles passées en fin de période, hors processus standard, sont un point d'attention spécifique au regard du risque de fraude (ISA 240). Elles justifient des tests complémentaires sur leur justification.",
        mesure: { constate: cibles.length, seuil: 0, unite: "ratio", libelle: "écritures atypiques" },
        source: SOURCES.ISA_240,
        comptesConcernes: comptes,
        lignesSource: cibles.map((e) => e.ligne).slice(0, 50),
        faisceau: ["journal manuel", "fin de période", "comptes de résultat"],
        preuve: [
          { etape: "Fenêtre", detail: `Date de validation = ${max}` },
          { etape: "Comptes", detail: comptes.join(", ") },
        ],
      } satisfies RuleFinding,
    ];
  },
};

const R_ME_002: Rule = {
  id: "R-ME-002",
  family: "methodology",
  version: VERSION,
  cloison: "resultat",
  severity: "majeur",
  controlStage: "accounting_review",
  titre: "Régularisations significatives sur le chiffre d'affaires",
  run(ctx) {
    const ca = ctx.entries.filter((e) => /^70/u.test(e.compteNum));
    const caManuel = ca.filter(isJournalManuel);
    if (ca.length === 0 || caManuel.length === 0) return [];
    const totalCa = ca.reduce((s, e) => s + Math.abs(e.montant), 0);
    const totalManuel = caManuel.reduce((s, e) => s + Math.abs(e.montant), 0);
    const part = totalCa > 0 ? (totalManuel / totalCa) * 100 : 0;
    if (part < 5) return [];
    return [
      {
        family: "methodology",
        ruleId: this.id,
        ruleVersion: VERSION,
        cloison: "resultat",
        severity: part >= 15 ? "majeur" : "mineur",
        siloId: "chiffre-affaires",
        titre: "Part élevée de régularisations manuelles sur le CA",
        constat: `${part.toFixed(1)} % du chiffre d'affaires (en valeur absolue) passe par des journaux manuels.`,
        explication:
          "La reconnaissance du revenu fait l'objet d'une présomption de risque de fraude. Une part importante d'écritures manuelles sur le CA appelle des procédures analytiques et un examen des justificatifs.",
        mesure: { constate: part, seuil: 5, unite: "%", libelle: "part régularisations CA" },
        source: SOURCES.ISA_240,
        comptesConcernes: [...new Set(caManuel.map((e) => e.compteNum))].slice(0, 12),
        lignesSource: caManuel.map((e) => e.ligne).slice(0, 50),
        faisceau: ["revenu", "écritures manuelles", "procédures analytiques"],
        preuve: [
          { etape: "Total CA", detail: totalCa.toFixed(0) },
          { etape: "Dont manuel", detail: totalManuel.toFixed(0) },
        ],
      } satisfies RuleFinding,
    ];
  },
};

const R_ME_003: Rule = {
  id: "R-ME-003",
  family: "methodology",
  version: VERSION,
  cloison: "bilan-actif",
  severity: "mineur",
  controlStage: "accounting_review",
  titre: "Rattachement des produits (cut-off)",
  run(ctx) {
    const has418 = ctx.entries.some((e) => /^418/u.test(e.compteNum));
    const hasCA = ctx.entries.some((e) => /^70/u.test(e.compteNum));
    if (!hasCA || has418) return [];
    return [
      {
        family: "methodology",
        ruleId: this.id,
        ruleVersion: VERSION,
        cloison: "bilan-actif",
        severity: "mineur",
        siloId: "creances-clients",
        titre: "Aucun produit non encore facturé (compte 418) détecté",
        constat:
          "Du chiffre d'affaires est enregistré mais aucun mouvement n'est observé sur le compte 418 « Clients - Produits non encore facturés ».",
        explication:
          "À la clôture, les créances acquises mais non encore facturées doivent être rattachées via le compte 418, puis contre-passées. L'absence totale de 418 peut signaler un défaut de séparation des exercices à examiner.",
        mesure: { constate: 0, seuil: 1, unite: "ratio", libelle: "présence 418" },
        source: SOURCES.PCG_CUTOFF_418,
        comptesConcernes: ["418"],
        lignesSource: [],
        faisceau: ["cut-off", "produits à recevoir"],
        preuve: [
          { etape: "Présence CA", detail: "oui (comptes 70x)" },
          { etape: "Présence 418", detail: "non" },
        ],
      } satisfies RuleFinding,
    ];
  },
};

export const METHODOLOGY_RULES: Rule[] = [R_ME_001, R_ME_002, R_ME_003];

