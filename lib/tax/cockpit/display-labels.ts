/**
 * Libellés d'affichage du cockpit fiscalité : diacritiques restitués.
 *
 * Les moteurs IS (TAX-05), TVA (TAX-06) et CFE (TAX-07) écrivent leurs libellés
 * sans accents (« Resultat comptable », « TVA collectee comptabilisee »). Ces
 * chaînes entrent dans des empreintes et des exports — elles ne sont donc JAMAIS
 * modifiées : ni dans les moteurs, ni dans les datasets du cockpit.
 *   - `waterfall.steps[].label` est dans le corps haché de l'instantané IS
 *     (`snapshotHash = stableHash(body)`, lib/tax/corporate-tax/engine.ts) ;
 *   - `TaxReconciliationLine.label` est haché (`lineHash`, lib/tax/canonical.ts)
 *     et exporté dans `tax-reconciliation-lines.csv` (lib/evidence/tax-package.ts) ;
 *   - les titres et détails de contrôle TVA/CFE entrent dans `resultHash` et dans
 *     l'instantané exporté (`tax-findings.csv`, `tax-computation.json`).
 *
 * Ce module ne fait qu'une projection d'AFFICHAGE, au rendu, indexée par des
 * codes stables (code d'étape, `lineKey`, `controlId`, code de limitation).
 * Garde-fou : une entrée ne s'applique que si le texte du moteur correspond
 * exactement au libellé attendu, et le résultat ne diffère du texte du moteur
 * QUE par ses diacritiques (vérifié à chaque appel). Un libellé inconnu, ou dont
 * le moteur a changé la formulation, s'affiche tel que le moteur l'a écrit :
 * jamais un libellé périmé, jamais un mot ajouté.
 */
import { TAX_RECOMMENDATION_RULES } from "../recommendations";

/** Texte exact du moteur (chaîne) ou motif ancré ; le rendu peut citer les groupes (`$1`). */
type Entry = readonly [engine: string | RegExp, display: string];
type Table = Readonly<Record<string, readonly Entry[]>>;

/** Retire les diacritiques (NFD puis marques combinantes) : sert au garde-fou. */
export function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/gu, "");
}

function project(table: Table, code: string | null | undefined, engineText: string): string {
  if (!code) return engineText;
  for (const [engine, display] of table[code] ?? []) {
    let candidate: string | null = null;
    if (typeof engine === "string") {
      if (engine === engineText) candidate = display;
    } else if (engine.test(engineText)) {
      candidate = engineText.replace(engine, display);
    }
    if (candidate !== null && stripDiacritics(candidate) === stripDiacritics(engineText)) return candidate;
  }
  return engineText;
}

/** Étapes du waterfall IS, par code d'étape (lib/tax/corporate-tax/waterfall.ts). */
export const WATERFALL_STEP_DISPLAY: Table = {
  accounting_result: [["Resultat comptable", "Résultat comptable"]],
  reintegrations_confirmed: [["Reintegrations confirmees", "Réintégrations confirmées"]],
  reintegrations_proposed: [["Reintegrations proposees", "Réintégrations proposées"]],
  deductions_confirmed: [["Deductions confirmees", "Déductions confirmées"]],
  deductions_proposed: [["Deductions proposees", "Déductions proposées"]],
  tax_result_before_deficits: [["Resultat fiscal avant deficits", "Résultat fiscal avant déficits"]],
  deficits_offset: [["Deficits imputes", "Déficits imputés"]],
  taxable_base: [["Base imposable", "Base imposable"]],
  gross_tax: [["Impot sur les societes brut", "Impôt sur les sociétés brut"]],
};

/** Lignes de rapprochement IS, TVA et CFE, par `lineKey`. */
export const RECONCILIATION_LINE_DISPLAY: Table = {
  declared_tax_result_before_deficits: [
    ["Resultat fiscal avant deficits : recalcule et declare", "Résultat fiscal avant déficits : recalculé et déclaré"],
  ],
  declared_final_tax_result: [
    [
      "Resultat fiscal apres imputation des deficits : recalcule et declare",
      "Résultat fiscal après imputation des déficits : recalculé et déclaré",
    ],
  ],
  declared_normal_rate_base: [
    ["Base au taux normal : recalculee et declaree sur la 2065", "Base au taux normal : recalculée et déclarée sur la 2065"],
  ],
  declared_reduced_rate_base: [
    ["Base au taux reduit : recalculee et declaree sur la 2065", "Base au taux réduit : recalculée et déclarée sur la 2065"],
  ],
  accounted_tax_charge: [
    ["Impot liquide estime et charge d'impot comptabilisee", "Impôt liquidé estimé et charge d'impôt comptabilisée"],
  ],
  accounted_tax_liability: [
    ["Impot liquide estime et dette d'impot comptabilisee", "Impôt liquidé estimé et dette d'impôt comptabilisée"],
  ],
  vat_normal_rate_base: [
    ["Base HT au taux dominant : comptabilisee et declaree", "Base HT au taux dominant : comptabilisée et déclarée"],
  ],
  vat_net: [["TVA nette : comptabilisee et declaree", "TVA nette : comptabilisée et déclarée"]],
  vat_form_coherence: [
    [
      /^Coherence interne (.+) : brute moins deductible et net declare$/u,
      "Cohérence interne $1 : brute moins déductible et net déclaré",
    ],
  ],
  cfe_notice_vs_charge: [["Avis de CFE et charge comptabilisee", "Avis de CFE et charge comptabilisée"]],
  cfe_notice_vs_settlement: [["Avis de CFE et reglements", "Avis de CFE et règlements"]],
  cfe_charge_vs_settlement: [["Charge comptabilisee et reglements", "Charge comptabilisée et règlements"]],
};

/** Agrégats du jeu `comparison` du moteur TVA, par clé. */
export const VAT_COMPARISON_DISPLAY: Table = {
  collected: [["TVA collectee", "TVA collectée"]],
  deductible: [["TVA deductible", "TVA déductible"]],
  net: [["TVA nette", "TVA nette"]],
};

/** Titres des contrôles TVA et CFE, par `controlId`. */
export const CONTROL_TITLE_DISPLAY: Table = {
  "VAT.ACCOUNT.ABNORMAL_BALANCE": [["Compte de TVA au sens anormal", "Compte de TVA au sens anormal"]],
  "VAT.BASE.BY_RATE": [["Bases HT par taux", "Bases HT par taux"]],
  "VAT.COLLECTED.ACCOUNTED": [["TVA collectee comptabilisee", "TVA collectée comptabilisée"]],
  "VAT.CREDIT": [["Credit de TVA", "Crédit de TVA"]],
  "VAT.CREDIT.CARRYFORWARD": [["Report de credit", "Report de crédit"]],
  "VAT.DECLARED": [["TVA declaree", "TVA déclarée"]],
  "VAT.DEDUCTIBLE.ACCOUNTED": [["TVA deductible comptabilisee", "TVA déductible comptabilisée"]],
  "VAT.ENTRY.NO_REFERENCE": [["Ecriture sans reference de piece", "Écriture sans référence de pièce"]],
  "VAT.FORM.COHERENCE": [["Coherence CA3/CA12 selon le regime", "Cohérence CA3/CA12 selon le régime"]],
  "VAT.NET": [["TVA nette", "TVA nette"]],
  "VAT.PERIOD.SHIFT": [["Decalage de periode", "Décalage de période"]],
  "VAT.PIECE.DUPLICATE": [["Doublons de pieces", "Doublons de pièces"]],
  "VAT.PIECE.MISSING": [["Piece absente", "Pièce absente"]],
  "VAT.RATE.UNUSUAL": [["Taux inhabituel", "Taux inhabituel"]],
  "VAT.REVERSE_CHARGE.CANDIDATE": [["Operations potentiellement autoliquidees", "Opérations potentiellement autoliquidées"]],
  "VAT.THEORETICAL.BY_RATE": [["TVA theorique par taux", "TVA théorique par taux"]],
  "CFE.NOTICE.AVAILABLE": [["Avis de CFE disponible", "Avis de CFE disponible"]],
  "CFE.NOTICE.INTERNAL_CONSISTENCY": [["Coherence interne de l'avis", "Cohérence interne de l'avis"]],
  "CFE.NOTICE.VS.CHARGE": [["Avis et charge comptabilisee", "Avis et charge comptabilisée"]],
  "CFE.NOTICE.VS.PAYMENT": [["Avis et reglements", "Avis et règlements"]],
  "CFE.CHARGE.VS.PAYMENT": [["Charge et reglements", "Charge et règlements"]],
  "CFE.ESTABLISHMENT.COHERENCE": [["Coherence des etablissements", "Cohérence des établissements"]],
  "CFE.PERIOD.COHERENCE": [["Coherence des periodes", "Cohérence des périodes"]],
  "CFE.EXEMPTION.CONSISTENCY": [["Coherence de l'exoneration", "Cohérence de l'exonération"]],
};

/**
 * Lectures (détail) des contrôles TVA et CFE, par `controlId`. Seules les phrases
 * relevées sur les moteurs sont projetées ; une autre phrase reste telle quelle.
 */
export const CONTROL_DETAIL_DISPLAY: Table = {
  "VAT.ACCOUNT.ABNORMAL_BALANCE": [
    ["Les comptes de TVA presentent le sens attendu sur la periode.", "Les comptes de TVA présentent le sens attendu sur la période."],
  ],
  "VAT.BASE.BY_RATE": [
    [/^Base au taux dominant Taux constate (.+) comparee a la case (.+)\.$/u, "Base au taux dominant Taux constaté $1 comparée à la case $2."],
  ],
  "VAT.COLLECTED.ACCOUNTED": [
    [
      "Total de la TVA collectee reconstruite depuis les ecritures. Estimation issue du FEC seul.",
      "Total de la TVA collectée reconstruite depuis les écritures. Estimation issue du FEC seul.",
    ],
  ],
  "VAT.CREDIT": [
    ["La comptabilite ne fait pas ressortir de position crediteur.", "La comptabilité ne fait pas ressortir de position créditeur."],
  ],
  "VAT.CREDIT.CARRYFORWARD": [
    [
      "Report recu et credit a reporter lus sur la declaration. La continuite avec la periode precedente releve de la synthese pluri-periodes.",
      "Report reçu et crédit à reporter lus sur la déclaration. La continuité avec la période précédente relève de la synthèse pluri-périodes.",
    ],
  ],
  "VAT.DECLARED": [[/^Declaration (\S+) exploitable pour la periode\.$/u, "Déclaration $1 exploitable pour la période."]],
  "VAT.DEDUCTIBLE.ACCOUNTED": [
    [
      "Total de la TVA deductible reconstruite depuis les ecritures. Le droit a deduction n'est pas qualifie ici.",
      "Total de la TVA déductible reconstruite depuis les écritures. Le droit à déduction n'est pas qualifié ici.",
    ],
  ],
  "VAT.ENTRY.NO_REFERENCE": [
    [/^(\d+) ecriture\(s\) de TVA sans reference de piece\.$/u, "$1 écriture(s) de TVA sans référence de pièce."],
  ],
  "VAT.FORM.COHERENCE": [
    [/^Relation interne du formulaire (\S+) du millesime (\d{4})\.$/u, "Relation interne du formulaire $1 du millésime $2."],
  ],
  "VAT.NET": [
    [
      "Difference entre TVA collectee et deductible comptabilisees, comparee a la TVA nette declaree.",
      "Différence entre TVA collectée et déductible comptabilisées, comparée à la TVA nette déclarée.",
    ],
  ],
  "VAT.PERIOD.SHIFT": [
    [
      /^(\d+) operation\(s\) dont la piece est datee hors periode\. L'exigibilite reste a qualifier\.$/u,
      "$1 opération(s) dont la pièce est datée hors période. L'exigibilité reste à qualifier.",
    ],
  ],
  "VAT.PIECE.DUPLICATE": [
    ["Aucune reference de piece repetee a montant identique.", "Aucune référence de pièce répétée à montant identique."],
  ],
  "VAT.PIECE.MISSING": [
    [
      "Aucun inventaire de pieces n'est fourni : le droit a deduction ne peut pas etre conclu. L'absence de piece dans PROBANT ne vaut pas absence de piece.",
      "Aucun inventaire de pièces n'est fourni : le droit à déduction ne peut pas être conclu. L'absence de pièce dans PROBANT ne vaut pas absence de pièce.",
    ],
  ],
  "VAT.RATE.UNUSUAL": [
    ["Aucun taux constate marginal au regard des autres taux du dossier.", "Aucun taux constaté marginal au regard des autres taux du dossier."],
  ],
  "VAT.REVERSE_CHARGE.CANDIDATE": [
    [
      "Aucune ecriture ne presente simultanement TVA collectee et deductible de meme montant.",
      "Aucune écriture ne présente simultanément TVA collectée et déductible de même montant.",
    ],
  ],
  "VAT.THEORETICAL.BY_RATE": [
    [
      "TVA recalculee par application du taux constate a la base de chaque tranche, comparee a la TVA comptabilisee.",
      "TVA recalculée par application du taux constaté à la base de chaque tranche, comparée à la TVA comptabilisée.",
    ],
  ],
  "CFE.CHARGE.VS.PAYMENT": [
    ["Difference entre charge et reglements, rapprochee du solde de dette.", "Différence entre charge et règlements, rapprochée du solde de dette."],
  ],
  "CFE.ESTABLISHMENT.COHERENCE": [
    ["Chaque etablissement du profil porte un avis et reciproquement.", "Chaque établissement du profil porte un avis et réciproquement."],
  ],
  "CFE.EXEMPTION.CONSISTENCY": [["Aucune exoneration n'est declaree.", "Aucune exonération n'est déclarée."]],
  "CFE.NOTICE.AVAILABLE": [[/^(\d+) avis exploitable\(s\) pour la periode\.$/u, "$1 avis exploitable(s) pour la période."]],
  "CFE.NOTICE.INTERNAL_CONSISTENCY": [["Le detail de chaque avis totalise le montant du.", "Le détail de chaque avis totalise le montant dû."]],
  "CFE.NOTICE.VS.CHARGE": [
    ["Total des avis confronte a la charge reconstruite depuis les ecritures.", "Total des avis confronté à la charge reconstruite depuis les écritures."],
  ],
  "CFE.NOTICE.VS.PAYMENT": [
    ["Total des avis confronte aux decaissements rattaches a la CFE.", "Total des avis confronté aux décaissements rattachés à la CFE."],
  ],
  "CFE.PERIOD.COHERENCE": [
    ["Chaque avis porte exactement la periode et l'exercice controles.", "Chaque avis porte exactement la période et l'exercice contrôlés."],
  ],
};

/** Messages de limitation des moteurs, par code (`<moteur>-limitation:<code>`). */
export const LIMITATION_MESSAGE_DISPLAY: Table = {
  REDUCED_RATE_ELIGIBILITY_UNKNOWN: [
    [
      "Une condition du taux reduit n'est pas renseignee : le taux reduit n'est pas applique et l'impot reste une estimation au taux normal.",
      "Une condition du taux réduit n'est pas renseignée : le taux réduit n'est pas appliqué et l'impôt reste une estimation au taux normal.",
    ],
  ],
  ACCOUNTING_RESULT_UNAVAILABLE: [
    [
      /^Les cases (\S+) ne permettent pas d'etablir le resultat comptable sans supposer qu'une absence vaut zero\.(.*)$/su,
      "Les cases $1 ne permettent pas d'établir le résultat comptable sans supposer qu'une absence vaut zéro.$2",
    ],
  ],
  VAT_DECLARATION_UNAVAILABLE: [
    [
      /^Aucune (\S+) exploitable pour la periode : l'absence de declaration n'est pas assimilee a une declaration a zero\.$/u,
      "Aucune $1 exploitable pour la période : l'absence de déclaration n'est pas assimilée à une déclaration à zéro.",
    ],
  ],
  CFE_BASE_NOT_RECOMPUTABLE: [
    [
      "La cotisation CFE n'est pas recalculee : base locative, taux communal et deliberations ne sont pas modelisees. Le module rapproche l'avis, il ne le reconstitue pas.",
      "La cotisation CFE n'est pas recalculée : base locative, taux communal et délibérations ne sont pas modélisées. Le module rapproche l'avis, il ne le reconstitue pas.",
    ],
  ],
  CFE_NOTICE_UNAVAILABLE: [
    [
      "Aucun avis de CFE n'est importe ni saisi : l'absence d'avis dans PROBANT ne vaut pas absence d'avis.",
      "Aucun avis de CFE n'est importé ni saisi : l'absence d'avis dans PROBANT ne vaut pas absence d'avis.",
    ],
  ],
};

export function displayWaterfallStepLabel(code: string, engineLabel: string): string {
  return project(WATERFALL_STEP_DISPLAY, code, engineLabel);
}

export function displayReconciliationLineLabel(lineKey: string | null | undefined, engineLabel: string): string {
  return project(RECONCILIATION_LINE_DISPLAY, lineKey, engineLabel);
}

export function displayVatComparisonLabel(key: string, engineLabel: string): string {
  return project(VAT_COMPARISON_DISPLAY, key, engineLabel);
}

export function displayControlTitle(controlId: string | null | undefined, engineTitle: string): string {
  return project(CONTROL_TITLE_DISPLAY, controlId, engineTitle);
}

export function displayControlDetail(controlId: string | null | undefined, engineDetail: string): string {
  return project(CONTROL_DETAIL_DISPLAY, controlId, engineDetail);
}

/** `corporate-tax-limitation:REDUCED_RATE_ELIGIBILITY_UNKNOWN` → message accentué si la phrase est connue. */
export function displayLimitationMessage(limitationId: string, engineMessage: string): string {
  const separator = limitationId.indexOf(":");
  const code = separator === -1 ? limitationId : limitationId.slice(separator + 1);
  return project(LIMITATION_MESSAGE_DISPLAY, code, engineMessage);
}

/**
 * Donnée attendue par le planificateur (`profile:ownershipStatus`, `field:16`…) :
 * aucune table de libellés de faits n'est publiée par lib/tax, mais la règle de
 * recommandation déclenchée par ce code porte une phrase humaine. Le code reste
 * restitué tel quel, en petit, à côté de la phrase.
 */
export interface RequiredInputDescription {
  readonly code: string;
  /** Titre de la recommandation (« Confirmer le taux de détention »), `null` si aucune règle. */
  readonly title: string | null;
  /** Phrase d'action de la recommandation, `null` si aucune règle ne porte ce code. */
  readonly sentence: string | null;
}

export function describeRequiredInput(code: string): RequiredInputDescription {
  const rule =
    TAX_RECOMMENDATION_RULES.find((candidate) => candidate.triggerInputCodes.includes(code) && candidate.kind === "human_confirmation") ??
    TAX_RECOMMENDATION_RULES.find((candidate) => candidate.triggerInputCodes.includes(code));
  return { code, title: rule?.title ?? null, sentence: rule?.action ?? null };
}
