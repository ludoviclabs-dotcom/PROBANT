import type { ClosingHarness } from "./closing-harness";
import { CL_PERIOD } from "./closing-harness";

/**
 * Synthetic recipe of the professional file (Mission 19) — « ALPHA SAS (synthétique) », exercise 2026. No real entity, person or document.
 * Expected values are written by hand in docs/mission19/RECETTE.md; the tests compare the engine output to them.
 */
export const RISKS = [
  { riskId: "R-01", cycle: "provisions", label: "Litiges et risques non provisionnés ou mal évalués", assertions: ["solde_exhaustivite", "solde_evaluation", "annexe_exhaustivite"], assessment: { level: "eleve", rationale: "Contentieux social signalé en cours d’exercice." } },
  { riskId: "R-02", cycle: "clients", label: "Ventes rattachées au mauvais exercice", assertions: ["flux_separation", "flux_realite"], assessment: { level: "modere", rationale: "Livraisons nombreuses en fin d’année." } },
  { riskId: "R-03", cycle: "stocks", label: "Stocks inexistants ou mal valorisés", assertions: ["solde_existence", "solde_evaluation"], assessment: { level: "eleve", rationale: "Deux sites de stockage, dont un non visité." } },
  { riskId: "R-04", cycle: "tresorerie", label: "Soldes et frais bancaires non exhaustifs", assertions: ["solde_existence", "solde_exhaustivite"], assessment: { level: "faible", rationale: "Un seul compte bancaire." } },
  { riskId: "R-05", cycle: "transversal", label: "Événements postérieurs non pris en compte", assertions: ["annexe_exhaustivite", "solde_evaluation"], assessment: { level: "modere", rationale: "Arrêté des comptes tardif." } },
  { riskId: "R-06", cycle: "informatique", label: "Accès non autorisés à l’ERP modifiant des écritures", assertions: ["flux_realite", "flux_mesure"], assessment: { level: "modere", rationale: "Changement d’ERP en cours d’exercice." } },
  { riskId: "R-07", cycle: "transversal", label: "Emprunts non confirmés", assertions: ["solde_existence", "solde_droits"], assessment: { level: "faible", rationale: "Aucun financement connu." } },
] as const;
export const PROCEDURES = [
  { procedureId: "P-01", riskIds: ["R-01"], assertions: ["solde_exhaustivite", "solde_evaluation"], nature: "engine", engine: "provisions.register", label: "Registre des provisions et engagements", owner: "Chef de mission" },
  { procedureId: "P-02", riskIds: ["R-01"], assertions: ["solde_exhaustivite", "annexe_exhaustivite"], nature: "confirmation", label: "Lettres aux avocats", owner: "Collaborateur A" },
  { procedureId: "P-03", riskIds: ["R-02"], assertions: ["flux_separation", "flux_realite"], nature: "controle_interne", label: "Rapprochement mensuel bons de livraison / factures", owner: "Collaborateur B" },
  { procedureId: "P-04", riskIds: ["R-03"], assertions: ["solde_existence"], nature: "observation_physique", label: "Observation de l’inventaire physique", owner: "Collaborateur A" },
  { procedureId: "P-05", riskIds: ["R-04"], assertions: ["solde_existence", "solde_exhaustivite"], nature: "confirmation", label: "Confirmation bancaire B1", owner: "Collaborateur B" },
  { procedureId: "P-06", riskIds: ["R-05"], assertions: ["annexe_exhaustivite", "solde_evaluation"], nature: "evenements_posterieurs", label: "Revue des événements postérieurs", owner: "Chef de mission" },
  { procedureId: "P-07", riskIds: ["R-06"], assertions: ["flux_realite", "flux_mesure"], nature: "itgc", label: "ITGC — gestion des accès à l’ERP", owner: "Spécialiste SI" },
  { procedureId: "P-08", riskIds: ["R-07"], assertions: ["solde_existence", "solde_droits"], nature: "confirmation", label: "Confirmation des emprunts", owner: "Collaborateur B" },
] as const;
export const ENTITY = "ALPHA SAS (synthétique)";

/** Builds the reference file through the real handlers, as the preparer and the reviewer would. Returns the piece version ids. */
export async function buildRecipe(h: ClosingHarness) {
  await h.ok({ command: "open", period: CL_PERIOD, entity: ENTITY });
  for (const r of RISKS) await h.ok({ command: "set_risk", ...r, assertions: [...r.assertions] });
  for (const p of PROCEDURES) await h.ok({ command: "set_procedure", ...p, riskIds: [...p.riskIds], assertions: [...p.assertions] });
  const pc: Record<string, string> = {};
  // P-03 — control described and implemented, operating test not performed.
  pc.procedure = await h.piece("Procédure écrite — rapprochement BL / factures");
  pc.walkthrough = await h.piece("Compte rendu de walkthrough — rapprochement de mars");
  await h.ok({ command: "set_population", procedureId: "P-03", population: { status: "defined", description: "Rapprochements mensuels BL / factures de l’exercice 2026", size: 12, citations: [] } });
  await h.ok({ command: "record_work", procedureId: "P-03", step: "description", performedOn: "2027-01-08", object: "Procédure écrite du service facturation", done: "Lecture de la procédure et entretien avec la responsable facturation", itemsExamined: null, result: "sans_exception", citations: [{ pieceVersionId: pc.procedure }] });
  await h.ok({ command: "record_work", procedureId: "P-03", step: "mise_en_oeuvre", performedOn: "2027-01-09", object: "Rapprochement du mois de mars 2026", done: "Suivi d’un rapprochement de bout en bout (walkthrough)", itemsExamined: 1, result: "sans_exception", citations: [{ pieceVersionId: pc.walkthrough, page: 2 }] });
  await h.ok({ command: "request_piece", procedureId: "P-03", description: "Échantillon de rapprochements mensuels pour le test de fonctionnement", requestedFrom: "Contrôle de gestion" });
  // P-05 — bank confirmation received after its request, misstatement found then corrected with new evidence, review point closed, reviewed.
  await h.ok({ command: "request_piece", procedureId: "P-05", description: "Réponse de la banque B1 à la demande de confirmation", requestedFrom: "Banque B1 (envoi direct au cabinet)" });
  await h.ok({ command: "set_population", procedureId: "P-05", population: { status: "defined", description: "Comptes bancaires ouverts au 31/12/2026", size: 1, citations: [] } });
  pc.bank = await h.piece("Réponse de la banque B1 — confirmation au 31/12/2026", "reponse_tiers");
  await h.ok({ command: "close_piece_request", requestId: "D-02", outcome: "received", pieceVersionId: pc.bank });
  await h.ok({ command: "record_work", procedureId: "P-05", step: "execution", performedOn: "2027-01-12", object: "Compte B1, solde et frais au 31/12/2026", done: "Rapprochement de la réponse de la banque avec le solde comptable et les frais", itemsExamined: 1, result: "exceptions", citations: [{ pieceVersionId: pc.bank, page: 1 }] });
  await h.ok({ command: "record_misstatement", procedureId: "P-05", cycle: "tresorerie", description: "Frais bancaires de décembre non comptabilisés", amount: { kind: "known", value: { amount: "1240.00", currency: "EUR" } }, citations: [{ pieceVersionId: pc.bank, page: 1 }] });
  pc.correction = await h.piece("Écriture de correction OD-2027-014");
  await h.ok({ command: "correct_misstatement", misstatementId: "A-01", text: "Écriture de correction passée par l’entité le 14/01/2027", citations: [{ pieceVersionId: pc.correction }] });
  await h.ok({ command: "conclude_procedure", procedureId: "P-05", text: "Solde confirmé par la banque ; frais non comptabilisés corrigés par l’entité.", citations: [{ pieceVersionId: pc.correction }] });
  await h.ok({ command: "raise_review_point", target: { kind: "procedure", id: "P-05" }, text: "Joindre l’écriture de correction des frais de décembre." }, "reviewer");
  await h.ok({ command: "answer_review_point", pointId: "RP-01", text: "Écriture OD-2027-014 jointe.", citations: [{ pieceVersionId: pc.correction }] });
  await h.ok({ command: "close_review_point", pointId: "RP-01", text: "Pièce vérifiée." }, "reviewer");
  await h.ok({ command: "review_procedure", procedureId: "P-05", decision: "approved", text: "Travail et conclusion revus." }, "reviewer");
  // P-02 — first lawyer answered (litigation), second answer awaited.
  await h.ok({ command: "set_population", procedureId: "P-02", population: { status: "defined", description: "Avocats et conseils juridiques de l’entité (liste fournie par la direction)", size: 2, citations: [] } });
  pc.lawyer = await h.piece("Réponse de l’avocat 1 — litige prud’homal en cours", "reponse_tiers");
  await h.ok({ command: "record_work", procedureId: "P-02", step: "execution", performedOn: "2027-01-15", object: "Avocat 1 (contentieux social)", done: "Demande envoyée par le cabinet, réponse reçue directement", itemsExamined: 1, result: "exceptions", citations: [{ pieceVersionId: pc.lawyer }] });
  await h.ok({ command: "request_piece", procedureId: "P-02", description: "Réponse de l’avocat 2 (conseil en droit des affaires)", requestedFrom: "Cabinet d’avocats 2" });
  // P-06 — the only evidence is the management representation letter, which contradicts the lawyer's answer.
  await h.ok({ command: "set_population", procedureId: "P-06", population: { status: "defined", description: "Procès-verbaux, situations intermédiaires et correspondance du 01/01/2027 au 20/01/2027", size: null, citations: [] } });
  pc.representation = await h.piece("Lettre d’affirmation de la direction", "declaration_direction", "Lettre d'affirmation synthétique : la direction déclare qu'aucun litige n'est en cours.\n");
  await h.ok({ command: "record_work", procedureId: "P-06", step: "execution", performedOn: "2027-01-20", object: "Événements du 01/01/2027 au 20/01/2027", done: "Entretien avec la direction et lecture de sa lettre d’affirmation", itemsExamined: null, result: "sans_exception", citations: [{ pieceVersionId: pc.representation }] });
  await h.ok({ command: "record_contradiction", left: { pieceVersionId: pc.representation }, right: { pieceVersionId: pc.lawyer }, description: "La direction déclare qu’aucun litige n’est en cours ; l’avocat 1 signale un litige prud’homal en cours.", procedureIds: ["P-02", "P-06"] });
  // P-04 — population absent: the list of storage sites was not provided.
  await h.ok({ command: "set_population", procedureId: "P-04", population: { status: "absent", reason: "Liste des sites de stockage au 31/12/2026 non transmise : le site B n’est pas identifié" } });
  pc.inventory = await h.piece("Procès-verbal d’inventaire du site A");
  pc.accruals = await h.piece("Extrait des charges à payer — honoraires");
  await h.ok({ command: "record_misstatement", cycle: "achats", description: "Charges à payer d’honoraires sous-estimées", amount: { kind: "known", value: { amount: "3000.00", currency: "EUR" } }, citations: [{ pieceVersionId: pc.accruals }] });
  await h.ok({ command: "assess_misstatement", misstatementId: "A-02", text: "Non corrigée à la date de revue ; portée à l’état des anomalies non corrigées. Appréciation du caractère significatif réservée au professionnel." }, "reviewer");
  await h.ok({ command: "record_misstatement", procedureId: "P-04", cycle: "stocks", description: "Écart d’inventaire possible sur le site B, non chiffré", amount: { kind: "unknown", reason: "Site B non observé : population absente" }, citations: [{ pieceVersionId: pc.inventory }] });
  await h.ok({ command: "record_limitation", cycle: "stocks", description: "Observation de l’inventaire du site B impossible : accès refusé le 31/12/2026", procedureIds: ["P-04"] });
  // P-08 — not applicable, with its reason and its piece.
  pc.loans = await h.piece("Grand livre 164 au 31/12/2026");
  await h.ok({ command: "set_applicability", procedureId: "P-08", applicable: false, reason: "Aucun emprunt à la clôture : compte 164 soldé au 31/12/2026", citations: [{ pieceVersionId: pc.loans }] });
  await h.ok({ command: "raise_review_point", target: { kind: "procedure", id: "P-03" }, text: "Préciser la période couverte par le walkthrough et l’identité du contrôleur." }, "reviewer");
  return pc;
}
