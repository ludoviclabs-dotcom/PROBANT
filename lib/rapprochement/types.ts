import type { CloisonId } from "@/lib/canonical-model/taxonomy";
import type { QualificationEcart, Severity } from "@/lib/canonical-model/finding";

/**
 * Module « Rapprochement & Retraitements ».
 *
 * Moteur de confrontation de DEUX documents comptables/d'audit (ex. balance
 * âgée ↔ grand-livre auxiliaire, FEC ↔ balance) produisant des écarts qualifiés.
 *
 * Conception cycle-AGNOSTIQUE : le moteur ne connaît aucun cycle en particulier.
 * Étendre PROBANT à un nouveau cycle d'audit = fournir une `RapprochementConfig`
 * et des documents — aucune modification du moteur.
 *
 * Les écarts produits sont convertis en `Finding` du modèle canonique
 * (cf. to-findings.ts), donc rendus tels quels par Synthèse / Cloisons / Rail.
 */

/** Clé de rapprochement disponible pour le matching. */
export type CleRapprochement = "compte" | "tiers" | "piece" | "periode" | "montant";

/** Une ligne normalisée d'un document, quel que soit son format d'origine. */
export interface DocumentLigne {
  /** Numéro de compte général PCG (ex. "411DUPONT" → compte "411"). */
  compte?: string;
  /** Code tiers / auxiliaire (client, fournisseur). */
  tiers?: string;
  /** Référence de pièce / facture. */
  piece?: string;
  /** Date d'écriture ou de pièce (AAAAMMJJ). */
  date?: string;
  /** Échéance (AAAAMMJJ) — utile pour l'antériorité. */
  echeance?: string;
  /** Montant signé en euros (débiteur > 0 côté actif). */
  montant: number;
  /** Libellé court. */
  libelle?: string;
  /** Indique une dépréciation/lettrage déjà constaté (selon le document). */
  lettre?: boolean;
}

/** Type de document source, pour l'affichage et le choix d'adapter. */
export type TypeDocument =
  | "balance_generale"
  | "balance_auxiliaire"
  | "balance_agee"
  | "grand_livre"
  | "fec"
  | "inventaire"
  | "tableau_immobilisations"
  | "rapprochement_bancaire"
  | "liasse_fiscale"
  | "etat_paie"
  | "autre";

export type FormatDocument = "fec" | "xlsx" | "csv" | "pdf" | "edi" | "demo";

/** Un document normalisé prêt à être rapproché. */
export interface DocumentSource {
  id: string;
  label: string;
  type: TypeDocument;
  format: FormatDocument;
  lignes: DocumentLigne[];
}

/**
 * Configuration d'un rapprochement. C'est l'unique point d'extension :
 * un nouveau cycle = une nouvelle config (+ documents), pas de code moteur.
 */
export interface RapprochementConfig {
  /** Slug de la fiche cycle (lib/audit-cycles) qui fonde la justification. */
  cycleSlug: string;
  /** Silo PROBANT de rattachement des constats produits. */
  siloId: string;
  /** Cloison de rattachement. */
  cloison: CloisonId;
  /** Clés de matching, par ordre de priorité. */
  cles: CleRapprochement[];
  /** Tolérance d'écart en euros sous laquelle on ne signale rien. */
  toleranceEur: number;
  /** Seuil d'antériorité (jours) au-delà duquel un poste est ancien. */
  seuilAncienneteJours?: number;
  /**
   * Active la détection de dépréciation insuffisante sur les postes anciens
   * non lettrés (pertinent pour les créances ; faux pour les autres cycles).
   */
  detecterProvision?: boolean;
  /**
   * Surcharge de la clé de source normative par qualification (sinon défaut :
   * provision/antériorité → PCG_CREANCES, reste → ISA_500). Permet d'aligner
   * la référence sur le cycle (ex. trésorerie → ISA_505).
   */
  sources?: Partial<Record<QualificationEcart, string>>;
  /** Libellé court de l'état source (affichage). */
  labelSource?: string;
  /** Libellé court de l'état de contrôle (affichage). */
  labelCible?: string;
}

/** Niveau auquel un écart est détecté. */
export type NiveauEcart = "total" | "compte" | "granulaire";

/** Un écart de rapprochement brut (avant conversion en Finding). */
export interface EcartRapprochement {
  /** Clé d'identification (tiers/compte/pièce selon le niveau). */
  cle: string;
  niveau: NiveauEcart;
  qualification: QualificationEcart;
  severite: Severity;
  /** Libellé lisible de l'entité concernée (ex. nom du client). */
  libelle: string;
  compte?: string;
  tiers?: string;
  piece?: string;
  /** Montant côté document source (A). */
  montantSource: number;
  /** Montant côté document cible (B). */
  montantCible: number;
  /** Écart = source − cible. */
  ecart: number;
  /** Ancienneté en jours, si calculable. */
  ancienneteJours?: number;
  /** Clé de la source normative (registre lib/referentiel/sources). */
  sourceKey: string;
  /** Phrase de constat générée. */
  constat: string;
}

/** Résultat complet d'un rapprochement. */
export interface ResultatRapprochement {
  config: RapprochementConfig;
  /** Solde total document source. */
  totalSource: number;
  /** Solde total document cible. */
  totalCible: number;
  /** Écart global (doit tendre vers 0). */
  ecartGlobal: number;
  /** Taux de rapprochement : 1 − |écartGlobal| / max(|totaux|). */
  tauxRapprochement: number;
  ecarts: EcartRapprochement[];
}
