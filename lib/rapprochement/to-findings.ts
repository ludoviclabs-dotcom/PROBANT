import type { Finding, FindingFamily, QualificationEcart } from "@/lib/canonical-model/finding";
import { QUALIFICATION_LABEL } from "@/lib/canonical-model/finding";
import { SOURCES } from "@/lib/referentiel/sources";
import {
  enrichFinding,
  type MaterialityThresholds,
} from "@/lib/audit/materiality";
import type { EcartRapprochement, ResultatRapprochement } from "./types";

/**
 * Conversion des écarts de rapprochement en `Finding` du modèle canonique.
 * Réutilise le registre de sources (aucune citation inventée) et la matérialité
 * ISA 320 existante (`enrichFinding`). Les constats produits sont identiques en
 * tout point à ceux du moteur FEC : ils s'affichent tels quels dans l'UI.
 */

type SourceKey = keyof typeof SOURCES;

/** Famille dérivée de la nature de la source (opposable vs présomption). */
function familyFromSource(key: string): FindingFamily {
  if (/^(PCG|LPF|CCOM|CGI)/.test(key)) return "hardLaw";
  if (/^(ISA|ISRE|NEP)/.test(key)) return "methodology";
  return "internal";
}

const EXPLICATION: Record<QualificationEcart, string> = {
  rapprochement_solde:
    "Un écart de solde entre deux documents censés concorder traduit un défaut de rapprochement : erreur de saisie, écriture manquante ou double comptabilisation. À investiguer avant conclusion.",
  perimetre:
    "Un élément présent dans un seul des deux documents révèle un écart de périmètre : la complétude (exhaustivité) n'est pas démontrée. À rapprocher ou justifier.",
  lettrage:
    "Un montant identique non rapproché entre les deux états doit être lettré ou expliqué : il peut masquer un règlement non imputé ou une facture en double.",
  anteriorite:
    "Un poste échu de longue date sans mouvement interroge la recouvrabilité et le rattachement. Une diligence (relance, justificatif) est attendue.",
  provision_insuffisante:
    "Une créance échue depuis longtemps sans dépréciation surévalue l'actif et le résultat. Une dépréciation doit refléter le risque de non-recouvrement apprécié à la clôture (PCG art. 214-17).",
  cutoff:
    "Un montant rattaché à la mauvaise période rompt l'indépendance des exercices. Le produit/charge doit être rattaché à l'exercice qui le concerne.",
  valorisation:
    "Un écart de valorisation entre l'état détaillé et la comptabilité doit être justifié par une règle d'évaluation documentée.",
  fiscal:
    "L'écart emporte une incidence potentielle sur une base imposable (IS, TVA) : un retraitement extra-comptable peut être requis.",
  a_justifier:
    "L'écart dépasse le seuil de signification sans cause identifiée : une diligence complémentaire est requise avant de conclure.",
};

function ecartToFinding(
  e: EcartRapprochement,
  result: ResultatRapprochement,
  index: number,
  th: MaterialityThresholds | null,
): Finding {
  const { config } = result;
  const sourceKey = (e.sourceKey in SOURCES ? e.sourceKey : "ISA_500") as SourceKey;
  const source = SOURCES[sourceKey];
  const family = familyFromSource(sourceKey);

  const faisceau: string[] = [];
  if (e.niveau === "total") faisceau.push("écart de solde global");
  if (e.ancienneteJours != null) faisceau.push(`ancienneté ${e.ancienneteJours} j`);
  if (e.qualification === "perimetre") faisceau.push("présent dans un seul document");
  if (e.qualification === "provision_insuffisante") faisceau.push("aucune dépréciation");
  faisceau.push(`écart ${Math.round(Math.abs(e.ecart)).toLocaleString("fr-FR")} €`);

  const base: Finding = {
    id: `RAPPRO-${config.cycleSlug}-${index + 1}`,
    family,
    severity: e.severite,
    ruleId: `R-RAPPRO-${e.qualification}`,
    ruleVersion: "1.0.0",
    cloison: config.cloison,
    siloId: config.siloId,
    titre: `${QUALIFICATION_LABEL[e.qualification]} — ${e.libelle}`,
    constat: e.constat,
    explication: EXPLICATION[e.qualification],
    mesure: {
      constate: e.montantSource,
      seuil: e.montantCible,
      unite: "EUR",
      libelle: e.niveau === "total" ? "solde rapproché" : "solde du poste",
    },
    source,
    comptesConcernes: [e.compte, e.tiers].filter((x): x is string => !!x),
    lignesSource: [],
    faisceau,
    annotation:
      e.qualification === "provision_insuffisante"
        ? `Dépréciation attendue ≈ ${Math.round(Math.abs(e.montantSource)).toLocaleString("fr-FR")} €`
        : `Écart ${Math.round(e.ecart).toLocaleString("fr-FR")} €`,
    preuve: [
      { etape: "Source", detail: `Rapprochement ${config.cycleSlug} — clé « ${e.cle} »` },
      {
        etape: "Transformation",
        detail: `Agrégation par ${config.cles[0]} : source ${Math.round(e.montantSource).toLocaleString("fr-FR")} € vs contrôle ${Math.round(e.montantCible).toLocaleString("fr-FR")} €`,
      },
      { etape: "Règle", detail: `${QUALIFICATION_LABEL[e.qualification]} — ${source.ref}` },
      {
        etape: "Résultat",
        detail: `Écart de ${Math.round(e.ecart).toLocaleString("fr-FR")} € ${th ? "confronté au seuil ISA 320" : "(seuil non calculé : profil entité absent)"}`,
      },
    ],
    statutRevue: "en_attente",
    origine: "rapprochement",
    qualification: e.qualification,
    cycleSlug: config.cycleSlug,
  };

  return enrichFinding(base, th);
}

/** Convertit l'ensemble des écarts d'un rapprochement en constats canoniques. */
export function resultToFindings(
  result: ResultatRapprochement,
  th: MaterialityThresholds | null = null,
): Finding[] {
  return result.ecarts.map((e, i) => ecartToFinding(e, result, i, th));
}
