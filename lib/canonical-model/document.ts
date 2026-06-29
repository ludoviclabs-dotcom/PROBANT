import {
  computeMateriality,
  enrichFinding,
  type MaterialityBasis,
} from "@/lib/audit/materiality";
import type { FecEntry } from "./fec";
import type { Finding, StatementRow } from "./finding";
import { siloById, type CloisonId } from "./taxonomy";
import type { SiloView } from "./dossier";

/**
 * Modèle de « document financier annoté » consommé par le viewer.
 *
 * Deux familles de rendu partagent la même enveloppe :
 *  - ledger-style (FEC)  : lignes d'écritures, flags reliés par n° de ligne ;
 *  - statement-style     : Bilan / Compte de résultat / Flux reconstitués,
 *    flags portés par les lignes d'état (flaggedBy).
 *
 * Le document est dérivé soit d'un dépôt réel (FEC), soit d'un scénario de
 * simulation (états reconstitués). Les constats y sont enrichis du seuil de
 * matérialité et du risque de faux positif.
 */

export type FinancialDocType =
  | "FEC"
  | "Bilan"
  | "Resultat"
  | "Flux"
  | "Balance"
  | "Liasse";

export const DOC_TYPE_LABEL: Record<FinancialDocType, string> = {
  FEC: "Grand-livre (FEC)",
  Bilan: "Bilan",
  Resultat: "Compte de résultat",
  Flux: "Tableau de flux",
  Balance: "Balance générale",
  Liasse: "Liasse fiscale",
};

export type Admissibilite = "conforme" | "alerte" | "rejete";

/** Une ligne du grand-livre prête à l'affichage annoté. */
export interface LedgerRow {
  ligne: number;
  journalCode: string;
  ecritureDate: string; // AAAAMMJJ
  compteNum: string;
  compteLib: string;
  ecritureLib: string;
  debit: number;
  credit: number;
  /** Identifiants des constats portant sur cette ligne ([] = ligne saine). */
  flagIds: string[];
}

/** Section d'un état reconstruit (Bilan / Résultat / Flux). */
export interface DocSection {
  id: string;
  label: string;
  /** Côté du bilan (pour le rendu 2 colonnes). */
  cote?: "actif" | "passif";
  unite: "EUR" | "%";
  rows: StatementRow[];
}

export interface DocumentMeta {
  nbLignes: number;
  totalDebit?: number;
  totalCredit?: number;
  equilibre?: boolean;
  admissibilite: Admissibilite;
  normesApplicables: string[];
  /** Note courte affichée sous le titre (ex. base de matérialité retenue). */
  note?: string;
}

export interface AnnotatedDocument {
  id: string;
  type: FinancialDocType;
  titre: string;
  societe: string;
  exercice: string;
  origine: "simulation" | "upload";
  /** Constats applicables au document, déjà enrichis (seuil + faux positif). */
  findings: Finding[];
  /** Présent pour les documents ligne-à-ligne (FEC). */
  ledger?: LedgerRow[];
  /** Présent pour les états structurés (Bilan, Résultat, Flux). */
  sections?: DocSection[];
  metadata: DocumentMeta;
}

/* ───────────────────────── Bases de matérialité ─────────────────────────── */

function materialityBasisFromEntries(entries: FecEntry[]): MaterialityBasis {
  let ca = 0;
  let produits = 0;
  let charges = 0;
  for (const e of entries) {
    const c = e.compteNum;
    if (c.startsWith("70")) ca += e.credit - e.debit;
    if (c.startsWith("7")) produits += e.credit - e.debit;
    if (c.startsWith("6")) charges += e.debit - e.credit;
  }
  return {
    chiffreAffaires: ca > 0 ? ca : undefined,
    totalProduits: produits > 0 ? produits : undefined,
    totalCharges: charges > 0 ? charges : undefined,
  };
}

function materialityBasisFromSilos(silos: SiloView[]): MaterialityBasis {
  let totalBilan = 0;
  let ca = 0;
  for (const v of silos) {
    const cloison = siloById(v.siloId)?.cloison;
    for (const r of v.statement.rows) {
      if (v.statement.unite !== "EUR") continue;
      if (cloison === "bilan-actif" && r.kind === "total") {
        totalBilan += Math.abs(r.valeur);
      }
      if (v.siloId === "chiffre-affaires" && r.kind === "total") {
        ca += Math.abs(r.valeur);
      }
    }
  }
  return {
    totalBilan: totalBilan > 0 ? totalBilan : undefined,
    chiffreAffaires: ca > 0 ? ca : undefined,
  };
}

/* ───────────────────────────── FEC (réel) ──────────────────────────────── */

export function buildFecDocument(input: {
  id?: string;
  societe: string;
  exercice: string;
  origine?: "simulation" | "upload";
  entries: FecEntry[];
  findings: Finding[];
  admissibilite?: Finding[];
}): AnnotatedDocument {
  const th = computeMateriality(materialityBasisFromEntries(input.entries));
  const enriched = input.findings.map((f) => enrichFinding(f, th));

  const flagsByLigne = new Map<number, string[]>();
  for (const f of enriched) {
    for (const ln of f.lignesSource) {
      const arr = flagsByLigne.get(ln) ?? [];
      arr.push(f.id);
      flagsByLigne.set(ln, arr);
    }
  }

  const ledger: LedgerRow[] = input.entries.map((e) => ({
    ligne: e.ligne,
    journalCode: e.journalCode,
    ecritureDate: e.ecritureDate,
    compteNum: e.compteNum,
    compteLib: e.compteLib,
    ecritureLib: e.ecritureLib,
    debit: e.debit,
    credit: e.credit,
    flagIds: flagsByLigne.get(e.ligne) ?? [],
  }));

  const totalDebit = input.entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = input.entries.reduce((s, e) => s + e.credit, 0);
  const hasBloquant = (input.admissibilite ?? []).some(
    (f) => f.severity === "bloquant",
  );

  return {
    id: input.id ?? "fec",
    type: "FEC",
    titre: DOC_TYPE_LABEL.FEC,
    societe: input.societe,
    exercice: input.exercice,
    origine: input.origine ?? "upload",
    findings: enriched,
    ledger,
    metadata: {
      nbLignes: ledger.length,
      totalDebit,
      totalCredit,
      equilibre: Math.abs(totalDebit - totalCredit) < 1,
      admissibilite: hasBloquant ? "rejete" : "conforme",
      normesApplicables: ["LPF art. A.47 A-1", "PCG 2025"],
    },
  };
}

/* ───────────────────── États reconstitués (simulation) ──────────────────── */

const CLOISON_TO_DOCTYPE: Partial<Record<CloisonId, FinancialDocType>> = {
  "bilan-actif": "Bilan",
  "bilan-passif": "Bilan",
  resultat: "Resultat",
  flux: "Flux",
};

interface ScenarioMetaLike {
  label: string;
  exercice: string;
}

/**
 * Construit les documents d'états reconstitués (Bilan, Résultat, Flux) à partir
 * des silos d'un scénario. Aucune donnée n'est fabriquée : on regroupe les
 * états déjà reconstruits par cloison. Seuls les documents non vides sont
 * retournés.
 */
export function buildStatementDocuments(
  silos: SiloView[],
  meta: ScenarioMetaLike,
): AnnotatedDocument[] {
  const th = computeMateriality(materialityBasisFromSilos(silos));

  const groups = new Map<FinancialDocType, SiloView[]>();
  for (const v of silos) {
    const cloison = siloById(v.siloId)?.cloison;
    const docType = cloison ? CLOISON_TO_DOCTYPE[cloison] : undefined;
    if (!docType) continue;
    const arr = groups.get(docType) ?? [];
    arr.push(v);
    groups.set(docType, arr);
  }

  const order: FinancialDocType[] = ["Bilan", "Resultat", "Flux"];
  const docs: AnnotatedDocument[] = [];

  for (const docType of order) {
    const views = groups.get(docType);
    if (!views || views.length === 0) continue;

    const sections: DocSection[] = views.map((v) => {
      const silo = siloById(v.siloId);
      const cote: DocSection["cote"] =
        silo?.cloison === "bilan-actif"
          ? "actif"
          : silo?.cloison === "bilan-passif"
            ? "passif"
            : undefined;
      return {
        id: v.siloId,
        label: v.statement.titre || silo?.label || v.siloId,
        cote,
        unite: v.statement.unite,
        rows: v.statement.rows,
      };
    });

    const findings = views
      .flatMap((v) => v.findings)
      .map((f) => enrichFinding(f, th));

    const hasBloquant = findings.some((f) => f.severity === "bloquant");
    const nbLignes = sections.reduce((n, s) => n + s.rows.length, 0);

    docs.push({
      id: docType.toLowerCase(),
      type: docType,
      titre: DOC_TYPE_LABEL[docType],
      societe: meta.label,
      exercice: meta.exercice,
      origine: "simulation",
      findings,
      sections,
      metadata: {
        nbLignes,
        admissibilite: hasBloquant ? "alerte" : "conforme",
        normesApplicables: ["PCG 2025"],
        note: "États reconstitués sur les postes sous revue.",
      },
    });
  }

  return docs;
}
