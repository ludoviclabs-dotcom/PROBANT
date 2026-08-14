import type { CanonicalEvidenceExport } from "./types";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function table(
  caption: string,
  headers: string[],
  rows: string[][],
): string {
  return `<div class="table-wrap"><table><caption>${esc(caption)}</caption><thead><tr>${headers
    .map((header) => `<th scope="col">${esc(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

export function buildAccessibleEvidenceHtml(report: CanonicalEvidenceExport): string {
  const synthesis = report.synthesisSnapshot;
  const findingsRows = report.findings.map((finding) => [
    `<code>${esc(finding.id)}</code>`,
    esc(finding.titre),
    esc(finding.severity),
    esc(finding.family),
    `<code>${esc(finding.ruleId)}@${esc(finding.ruleVersion)}</code>`,
    esc(finding.source.ref),
    esc(finding.source.effectiveDate),
  ]);
  const eventRows = report.reviewEvents.map((event) => [
    `<code>${esc(event.id)}</code>`,
    esc(event.findingId),
    esc(event.actorId),
    esc(event.actorRole),
    `${esc(event.previousStatus)} → ${esc(event.newStatus)}`,
    esc(event.comment),
    `<code>${esc(event.eventHash)}</code>`,
  ]);
  const sourceRows = report.sourceDocuments.map((source) => [
    `<code>${esc(source.id)}</code>`,
    esc(source.fileName),
    esc(source.documentType),
    `<code>${esc(source.sha256)}</code>`,
    esc(source.parserVersion ?? "non renseigné"),
    esc(source.location ? `${source.location.provider}:${source.location.key}` : "non renseignée"),
  ]);
  const limitationItems = synthesis.limitations.length
    ? synthesis.limitations
        .map((limitation) => `<li><strong>${esc(limitation.code)}</strong> — ${esc(limitation.message)}</li>`)
        .join("")
    : "<li>Aucune limitation déclarée.</li>";

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dossier de preuve PROBANT — ${esc(report.dossier.societe.raisonSociale)}</title>
  <style>
    :root{color-scheme:light;--ink:#172033;--muted:#526076;--line:#cbd3df;--accent:#174ea6;--soft:#f2f5f9}
    *{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:14px/1.5 Arial,sans-serif}
    main{max-width:1120px;margin:0 auto;padding:32px}h1,h2{color:#102a56;line-height:1.2}h1{font-size:28px;margin:0 0 8px}h2{font-size:19px;margin:28px 0 10px}
    .meta{color:var(--muted);margin:0}.hash{overflow-wrap:anywhere;font:12px/1.5 Consolas,monospace}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:20px 0}.card{border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--soft)}.card strong{display:block;font-size:18px}
    .table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px}table{border-collapse:collapse;width:100%;font-size:12px}caption{text-align:left;font-weight:700;padding:10px;background:var(--soft)}th,td{padding:8px;border-top:1px solid var(--line);text-align:left;vertical-align:top}th{background:#f8fafc}code{font-size:11px;overflow-wrap:anywhere}footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:11px}
    @media print{@page{size:A4;margin:14mm}main{max-width:none;padding:0}.table-wrap{overflow:visible}table{break-inside:auto}tr{break-inside:avoid}h2{break-after:avoid}.no-print{display:none}}
    @media (max-width:640px){main{padding:18px}.table-wrap{border:0}table,thead,tbody,tr,th,td{display:block}thead{position:absolute;left:-9999px}tr{border:1px solid var(--line);margin-bottom:10px}td{border-top:0}}
  </style>
</head>
<body>
<main>
  <header>
    <p class="meta">PROBANT · dossier de preuve reproductible</p>
    <h1>${esc(report.dossier.societe.raisonSociale)}</h1>
    <p class="meta">SIREN ${esc(report.dossier.societe.siren)} · exercice ${esc(report.dossier.societe.exercice)} · généré le ${esc(synthesis.generatedAt)}</p>
    <p class="hash">Snapshot <strong>${esc(synthesis.snapshotId)}</strong></p>
  </header>
  <section aria-labelledby="resume"><h2 id="resume">Synthèse</h2><div class="summary">
    <div class="card">Verdict<strong>${esc(synthesis.verdict.headline)}</strong></div>
    <div class="card">Constats<strong>${synthesis.risk.totalFindings}</strong></div>
    <div class="card">Revue<strong>${synthesis.review.reviewedCount}/${synthesis.review.totalCount} (${synthesis.review.pct} %)</strong></div>
    <div class="card">Couverture<strong>${esc(synthesis.coverage.status)}</strong></div>
  </div><p>${esc(synthesis.verdict.detail)}</p></section>
  <section aria-labelledby="limites"><h2 id="limites">Limitations</h2><ul>${limitationItems}</ul></section>
  <section aria-labelledby="sources"><h2 id="sources">Documents sources</h2>${table("Sources et empreintes", ["ID", "Document", "Type", "SHA-256", "Parser", "Localisation"], sourceRows)}</section>
  <section aria-labelledby="constats"><h2 id="constats">Constats</h2>${table("Constats, contrôles et sources normatives", ["ID", "Titre", "Gravité", "Famille", "Contrôle/version", "Source", "Version source"], findingsRows)}</section>
  <section aria-labelledby="revue"><h2 id="revue">Historique de revue</h2>${table("Événements append-only", ["ID", "Constat", "Acteur", "Rôle", "Transition", "Commentaire", "Hash"], eventRows)}</section>
  <section aria-labelledby="integrite"><h2 id="integrite">Intégrité</h2>
    <p class="hash">SHA-256 du snapshot : ${esc(synthesis.snapshotHash)}</p>
    <p class="hash">Digest des événements : ${esc(synthesis.reviewEventsDigest)}</p>
  </section>
  <footer>PDF standard dérivé de cette représentation HTML. Aucune conformité d'archivage n'est revendiquée sans validation machine enregistrée dans le manifeste.</footer>
</main>
</body>
</html>`;
}

