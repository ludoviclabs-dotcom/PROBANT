import type { CloisonId } from "./taxonomy";
import type {
  Finding,
  FindingFamily,
  ReconstitutedStatement,
  Severity,
} from "./finding";

/**
 * Un dossier représente une exécution d'analyse sur un jeu de comptes
 * (un FEC, un exercice). Il agrège l'état financier reconstruit par silo,
 * les constats et les alertes d'admissibilité.
 */

export interface Societe {
  raisonSociale: string;
  siren: string;
  exercice: string; // ex. "2024"
  dateCloture: string; // AAAAMMJJ
}

/** Vue d'un silo : état reconstruit + constats rattachés. */
export interface SiloView {
  siloId: string;
  statement: ReconstitutedStatement;
  findings: Finding[];
}

export interface Dossier {
  id: string;
  societe: Societe;
  demoMode: boolean;
  fecFingerprint: string;
  referentielVersion: string;
  createdAt: string; // ISO, injecté à la génération (jamais Date.now() ici)

  /**
   * Alertes bloquantes d'admissibilité (conformité d'ingestion FEC).
   * Traitées en amont de toute analyse financière.
   */
  admissibilite: Finding[];

  /** Vues par silo, contenant l'état reconstruit et les constats. */
  silos: SiloView[];
}

export interface DossierCounts {
  parSeverite: Record<Severity, number>;
  parFamille: Record<FindingFamily, number>;
  parStatut: { en_attente: number; valide: number; ecarte: number };
  bloquantesAdmissibilite: number;
  totalFindings: number;
  /** Incidence potentielle estimée (somme |écart EUR|) par cloison. */
  incidenceParCloison: Partial<Record<CloisonId, number>>;
}

export function allFindings(d: Dossier): Finding[] {
  return [...d.admissibilite, ...d.silos.flatMap((s) => s.findings)];
}

export function computeCounts(d: Dossier): DossierCounts {
  const findings = allFindings(d);
  const parSeverite: Record<Severity, number> = {
    bloquant: 0,
    majeur: 0,
    mineur: 0,
    informatif: 0,
  };
  const parFamille: Record<FindingFamily, number> = {
    hardLaw: 0,
    methodology: 0,
    internal: 0,
  };
  const parStatut = { en_attente: 0, valide: 0, ecarte: 0 };
  const incidenceParCloison: Partial<Record<CloisonId, number>> = {};

  for (const f of findings) {
    parSeverite[f.severity]++;
    parFamille[f.family]++;
    parStatut[f.statutRevue]++;
    if (f.mesure.unite === "EUR") {
      const ecart = Math.abs(f.mesure.constate - f.mesure.seuil);
      incidenceParCloison[f.cloison] =
        (incidenceParCloison[f.cloison] ?? 0) + ecart;
    }
  }

  return {
    parSeverite,
    parFamille,
    parStatut,
    bloquantesAdmissibilite: d.admissibilite.length,
    totalFindings: findings.length,
    incidenceParCloison,
  };
}

/** Paquet de revue exportable (PDF/JSON). */
export interface ReviewPack {
  probantVersion: string;
  referentielVersion: string;
  societe: Societe;
  dateExport: string;
  counts: DossierCounts;
  alertesBloquantes: Finding[];
  findingsParCloison: Partial<Record<CloisonId, Finding[]>>;
  decisionsHumaines: {
    findingId: string;
    titre: string;
    statut: string;
    commentaire?: string;
  }[];
}
