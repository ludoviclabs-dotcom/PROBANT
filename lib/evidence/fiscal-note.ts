import type { ReviewEvent, TaxProfile } from "@/lib/canonical-model";
import { formatCents } from "@/lib/synthesis/money";
import type { TaxCockpitSource } from "@/lib/tax/cockpit";
import {
  EVIDENCE_STRENGTH_LABEL,
  TAX_OUTCOME_LABEL,
  TAX_TYPE_LABEL,
} from "@/lib/tax/cockpit/labels";
import type {
  TaxEvidenceFinding,
  TaxEvidenceManifest,
  TaxEvidenceSource,
  TaxEvidenceSourceDocument,
} from "./tax-types";

export interface FiscalNoteInput {
  readonly source: TaxCockpitSource;
  readonly profile: TaxProfile;
  readonly documents: readonly TaxEvidenceSourceDocument[];
  readonly findings: readonly TaxEvidenceFinding[];
  readonly reviewEvents: readonly ReviewEvent[];
  readonly sources: readonly TaxEvidenceSource[];
  readonly manifestSummary: Pick<
    TaxEvidenceManifest,
    "manifestVersion" | "fiscalSnapshotSha256" | "reviewEventsDigest" | "limitations"
  >;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cells(values: readonly unknown[]): string {
  return values.map((value) => `<td>${escapeHtml(value)}</td>`).join("");
}

function table(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const body = rows.length > 0
    ? rows.map((row) => `<tr>${cells(row)}</tr>`).join("")
    : `<tr><td colspan="${headers.length}">Aucune donnée disponible dans le périmètre.</td></tr>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) =>
    `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function list(items: readonly string[]): string {
  return items.length > 0
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "<p>Aucun élément dans le périmètre.</p>";
}

function nullableAmount(amount: number | null | undefined): string {
  return amount === null || amount === undefined ? "non disponible" : formatCents(amount);
}

const USER_LABELS: Readonly<Record<string, string>> = {
  active: "actif",
  annual: "annuel",
  attach_evidence: "rattacher un justificatif",
  available: "disponible",
  blocked: "bloqué",
  computed: "calculé",
  confirm: "confirmer",
  confirmed: "confirmé",
  correct: "corriger",
  dismissed: "écarté",
  dismiss: "écarter",
  effective: "en vigueur",
  estimated: "estimé",
  filed: "déposé",
  fully_paid: "entièrement libéré",
  future: "futur",
  known: "renseigné",
  mark_inconclusive: "marquer non concluant",
  mark_not_applicable: "marquer non applicable",
  mini_real: "mini-réel",
  monthly: "mensuel",
  none: "hors groupe",
  not_computed: "non calculé",
  partially_paid: "partiellement libéré",
  pending: "en attente",
  quarterly: "trimestriel",
  real_normal: "réel normal",
  real_simplified: "réel simplifié",
  reconcile: "rapprochement disponible",
  reconciled: "rapproché",
  replace: "remplacer",
  request_evidence: "demander une preuve",
  review_required: "à valider (review_required)",
  standard: "régime standard",
  superseded: "remplacé",
  unknown: "non renseigné",
  unresolved: "non résolu",
  verified: "vérifié",
};

function userLabel(value: string | null | undefined): string {
  if (value === null || value === undefined) return "non disponible";
  return USER_LABELS[value] ?? value;
}

/** Note déterministe. Aucun texte n'est généré par un modèle de langage. */
export function buildFiscalNoteHtml(input: FiscalNoteInput): string {
  const { source, profile } = input;
  const corporate = source.corporateTax?.snapshot ?? null;
  const vat = source.vat?.snapshot ?? null;
  const cfe = source.cfe?.snapshot ?? null;
  const recommendations = [...new Map(
    source.capabilityMatrices.flatMap((matrix) => matrix.recommendations)
      .map((recommendation) => [recommendation.recommendationId, recommendation]),
  ).values()].sort((left, right) => left.recommendationId.localeCompare(right.recommendationId));
  const limitations = [
    ...source.synthesis.limitations.map((limitation) => `${limitation.code} — ${limitation.message}`),
    ...input.manifestSummary.limitations.map((limitation) =>
      `${limitation.code} — ${limitation.message}`),
  ];

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Note fiscale PROBANT — ${escapeHtml(source.entityName)}</title>
  <style>
    :root{color-scheme:light;--ink:#172033;--muted:#5b6578;--line:#cfd6e2;--wash:#f5f7fa}
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:var(--ink);margin:32px;line-height:1.45}
    h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;border-bottom:1px solid var(--line);padding-bottom:5px;margin-top:28px}
    p,li,td,th{font-size:11px}.meta{color:var(--muted);margin:0}.notice{padding:10px;border:1px solid var(--line);background:var(--wash)}
    .table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;margin:8px 0}th,td{border:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}th{background:var(--wash)}
    code{overflow-wrap:anywhere;font-size:10px}.hash{font-family:monospace;overflow-wrap:anywhere}
    @media print{body{margin:15mm}.table-wrap{overflow:visible}h2{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}
  </style>
</head>
<body>
  <header>
    <h1>Note fiscale analytique</h1>
    <p class="meta">${escapeHtml(source.entityName)} · exercice ${source.fiscalYear} · dossier ${escapeHtml(source.dossierId)}</p>
    <p class="notice"><strong>Portée.</strong> Cette note restitue des calculs, rapprochements, limites et décisions de revue dans le périmètre décrit. Elle ne constitue pas un avis juridique et n'attribue aucun label global de conformité.</p>
  </header>

  <section><h2>Contexte</h2>
    ${table(["Organisation", "Dossier", "Entité", "Généré le"], [[source.organizationId, source.dossierId, source.entityId, source.generatedAt]])}
  </section>

  <section><h2>Régime</h2>
    ${table(["Juridiction", "IS", "TVA", "Groupe IS", "Groupe TVA", "Statut profil"], [[
      profile.jurisdiction, userLabel(profile.corporateIncomeTaxRegime), userLabel(profile.vatRegime),
      userLabel(profile.corporateIncomeTaxGroupStatus), userLabel(profile.vatGroupStatus), userLabel(profile.status),
    ]])}
  </section>

  <section><h2>Documents</h2>
    ${table(["Document source", "Type", "Snapshot", "SHA-256", "Parseur"], input.documents.map((document) => [
      document.fileName, document.documentType, document.snapshotId ?? "—", document.sha256,
      [document.parserName, document.parserVersion].filter(Boolean).join(" ") || "non renseigné",
    ]))}
  </section>

  <section><h2>Couverture</h2>
    ${table(["Contrôles applicables", "Exécutés", "Bloqués", "Documents requis", "Disponibles", "Champs vérifiés"], [[
      source.synthesis.coverage.applicableControlCount,
      source.synthesis.coverage.executedControlCount,
      source.synthesis.coverage.blockedControlCount,
      source.synthesis.coverage.requiredDocumentCount,
      source.synthesis.coverage.availableDocumentCount,
      `${source.synthesis.coverage.verifiedFieldCount}/${source.synthesis.coverage.requiredFieldCount}`,
    ]])}
    ${list(source.synthesis.coverage.excludedScopes)}
  </section>

  <section><h2>Résultat fiscal</h2>
    ${table(["Grandeur", "Montant", "Statut"], [[
      "Résultat fiscal retenu avant déficits", nullableAmount(corporate?.taxResultBeforeDeficitsCents), userLabel(corporate?.status),
    ], [
      "Base imposable", nullableAmount(corporate?.taxableBaseCents), userLabel(corporate?.taxImpactStatus),
    ]])}
  </section>

  <section><h2>IS</h2>
    ${table(["Calcul", "Montant", "Niveau de preuve", "Conclusion élémentaire"], [[
      "Impôt brut calculé dans le périmètre des données disponibles",
      nullableAmount(corporate?.grossTaxCents),
      corporate ? EVIDENCE_STRENGTH_LABEL[corporate.evidenceStrength] : "non disponible",
      corporate ? TAX_OUTCOME_LABEL[corporate.outcome] : "non disponible",
    ]])}
    <p>Aucune pénalité n'est calculée par ce paquet de preuve.</p>
  </section>

  <section><h2>TVA</h2>
    ${table(["Grandeur", "Comptabilisé", "Déclaré", "Niveau de preuve"], [[
      "TVA nette", nullableAmount(vat?.netAccountedCents), nullableAmount(vat?.netDeclaredCents),
      vat ? EVIDENCE_STRENGTH_LABEL[vat.evidenceStrength] : "non disponible",
    ]])}
  </section>

  <section><h2>Autres taxes</h2>
    ${table(["Taxe", "Capacité", "Avis", "Charge comptable", "Conclusion élémentaire"], [[
      "CFE", userLabel(cfe?.capability), nullableAmount(cfe?.noticeTotalCents),
      nullableAmount(cfe?.ledger.chargeCents), cfe ? TAX_OUTCOME_LABEL[cfe.outcome] : "non disponible",
    ]])}
  </section>

  <section><h2>Constats</h2>
    ${table(["Identifiant", "Impôt", "Règle/version", "Résultat", "Preuve", "Décision", "Formule"], input.findings.map((finding) => [
      finding.id, TAX_TYPE_LABEL[finding.taxType],
      `${finding.rule.id}@${finding.rule.version} — statut ${userLabel(finding.rule.status)}`,
      TAX_OUTCOME_LABEL[finding.result.outcome],
      EVIDENCE_STRENGTH_LABEL[finding.evidenceLevel], userLabel(finding.decision), finding.formula,
    ]))}
  </section>

  <section><h2>Analyses recommandées</h2>
    ${list(recommendations.map((recommendation) => `${recommendation.title} — ${recommendation.action}`))}
  </section>

  <section><h2>Limitations</h2>${list([...new Set(limitations)].sort())}</section>

  <section><h2>Décisions</h2>
    ${table(["Événement", "Constat", "Action", "Statut", "Auteur", "Date", "Commentaire", "Justificatifs"], input.reviewEvents.map((event) => [
      event.id, event.findingId, event.action ? userLabel(event.action) : "action historique", userLabel(event.newStatus),
      `${event.actorId} (${event.actorRole})`, event.createdAt, event.comment, event.relatedEvidenceIds.join("; "),
    ]))}
  </section>

  <section><h2>Sources</h2>
    ${table(["Source", "Version", "Paragraphe", "Effet", "Statut", "URL"], input.sources.map((sourceRef) => [
      sourceRef.title ?? sourceRef.sourceId, sourceRef.sourceVersionId, sourceRef.locator,
      [sourceRef.effectiveFrom, sourceRef.effectiveTo].filter(Boolean).join(" → ") || "non renseigné",
      userLabel(sourceRef.status), sourceRef.documentUrl ?? sourceRef.canonicalUrl ?? "non renseignée",
    ]))}
  </section>

  <section><h2>Manifeste</h2>
    ${table(["Version", "Snapshot fiscal SHA-256", "Chaîne de revue SHA-256"], [[
      input.manifestSummary.manifestVersion,
      input.manifestSummary.fiscalSnapshotSha256,
      input.manifestSummary.reviewEventsDigest,
    ]])}
    <p>Le manifeste canonique livré avec le paquet porte les empreintes et tailles de chaque artefact. Il ne se référence pas lui-même afin d'éviter une dépendance circulaire.</p>
  </section>

  <footer><p class="meta">PDF standard dérivé de cette représentation HTML. Aucune conformité PDF/A n'est revendiquée sans validation machine consignée dans le manifeste.</p></footer>
</body>
</html>`;
}
