import {
  allFindings,
  computeCounts,
  type CloisonId,
  type Dossier,
  type Finding,
  type ReviewPack,
} from "@/lib/canonical-model";

/** Construit le paquet de revue exportable à partir d'un dossier. */
export function buildReviewPack(d: Dossier, dateExport: string): ReviewPack {
  const findings = allFindings(d);
  const findingsParCloison: Partial<Record<CloisonId, Finding[]>> = {};
  for (const f of findings) {
    (findingsParCloison[f.cloison] ??= []).push(f);
  }

  return {
    probantVersion: "1.0",
    referentielVersion: d.referentielVersion,
    societe: d.societe,
    dateExport,
    counts: computeCounts(d),
    alertesBloquantes: findings.filter((f) => f.severity === "bloquant"),
    findingsParCloison,
    decisionsHumaines: findings
      .filter((f) => f.statutRevue !== "en_attente")
      .map((f) => ({
        findingId: f.id,
        titre: f.titre,
        statut: f.statutRevue,
        commentaire: f.commentaireRevue,
      })),
  };
}
