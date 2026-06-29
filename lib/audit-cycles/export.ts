/**
 * Exports du référentiel « Audit Normatif 360 » : JSON, CSV, Markdown.
 *
 * Fonctions pures (pas d'accès disque) — la lecture des données est faite par
 * l'appelant (route API ou page serveur) via `loader.ts`.
 */

import type { AuditCycle } from "./types";
import { CYCLE_FAMILY_LABEL } from "./types";

/** Export JSON complet (toutes les fiches). */
export function exportToJSON(cycles: AuditCycle[]): string {
  return JSON.stringify(
    {
      module: "audit-normatif-360",
      generatedFrom: "PROBANT",
      cycleCount: cycles.length,
      cycles,
    },
    null,
    2,
  );
}

function csvCell(value: string): string {
  // Échappement CSV : guillemets doublés, encadrement si séparateur/retour ligne.
  const v = value.replace(/"/g, '""');
  return `"${v}"`;
}

/** Export CSV de synthèse (une ligne par cycle). */
export function exportToCSV(cycles: AuditCycle[]): string {
  const header = [
    "slug",
    "title",
    "family",
    "pcgAccounts",
    "reviewStatus",
    "nbSources",
    "nbRatios",
    "nbTests",
    "nbRisques",
    "nbRisquesFraude",
  ].join(";");

  const rows = cycles.map((c) =>
    [
      c.slug,
      csvCell(c.title),
      CYCLE_FAMILY_LABEL[c.family] ?? c.family,
      csvCell((c.pcgAccounts ?? []).join(", ")),
      c.reviewStatus,
      String((c.applicableStandards ?? []).length),
      String((c.ratios ?? []).length),
      String((c.detailTests ?? []).length),
      String((c.risks ?? []).length),
      String((c.risks ?? []).filter((r) => r.category === "RISQUE_FRAUDE").length),
    ].join(";"),
  );

  return [header, ...rows].join("\r\n");
}

/** Export Markdown d'une fiche cycle. */
export function exportToMarkdown(cycle: AuditCycle): string {
  const L: string[] = [];
  L.push(`# ${cycle.title}`, "");
  L.push(`**Famille :** ${CYCLE_FAMILY_LABEL[cycle.family] ?? cycle.family}  `);
  L.push(`**Comptes PCG :** ${(cycle.pcgAccounts ?? []).join(", ") || "—"}  `);
  L.push(`**Statut de revue :** ${cycle.reviewStatus}`, "");
  if (cycle.summary) L.push(`> ${cycle.summary}`, "");

  L.push("## Normes applicables", "");
  for (const s of cycle.applicableStandards ?? []) {
    L.push(`- \`${s.label}\` (${s.status})${s.note ? ` — ${s.note}` : ""}`);
  }
  L.push("");

  L.push("## Seuils", "");
  for (const t of cycle.thresholds ?? []) {
    L.push(`- **${t.label}** : ${t.value} _(${t.status})_`);
  }
  if (cycle.materiality?.globalMateriality) {
    const g = cycle.materiality.globalMateriality;
    L.push(`- **Matérialité globale** : ${g.recommendedRange} _(${g.status})_`);
    L.push(`  - ⚠️ ${g.caveat}`);
  }
  L.push("");

  L.push("## Ratios clés", "");
  for (const r of cycle.ratios ?? []) {
    L.push(`- **${r.name}** = ${r.formula}`);
    L.push(`  - Alerte : ${r.alertThreshold} _(${r.status})_`);
  }
  L.push("");

  L.push("## Procédures analytiques", "");
  for (const a of cycle.analyticalProcedures ?? []) {
    L.push(`- **${a.name}** — ${a.objective}`);
  }
  L.push("");

  L.push("## Tests de détail", "");
  for (const d of cycle.detailTests ?? []) {
    L.push(
      `- **${d.name}** (${d.nature}, ${d.extent}) — assertions : ${d.assertions.join(", ")}`,
    );
  }
  L.push("");

  L.push("## Risques", "");
  for (const r of cycle.risks ?? []) {
    L.push(`- **${r.category}** — ${r.name} : ${r.description}`);
  }
  L.push("");

  if ((cycle.ifrsVsPcg ?? []).length) {
    L.push("## Différences IFRS vs PCG", "");
    for (const d of cycle.ifrsVsPcg) {
      L.push(`- **${d.topic}**`);
      L.push(`  - IFRS : ${d.ifrsTreatment}`);
      L.push(`  - PCG : ${d.pcgTreatment}`);
      L.push(`  - Impact audit : ${d.auditImpact}`);
    }
    L.push("");
  }

  L.push("## Sources officielles", "");
  for (const s of cycle.officialSources ?? []) {
    L.push(`- \`${s.label}\`${s.url ? ` — ${s.url}` : ""}`);
  }
  L.push("");

  return L.join("\n");
}

/** Export Markdown de toute la cartographie. */
export function exportAllToMarkdown(cycles: AuditCycle[]): string {
  const head = [
    "# Audit Normatif 360 — Cartographie des cycles d'audit",
    "",
    `Cartographie de ${cycles.length} cycles d'audit financier.`,
    "",
    "> ⚠️ Les pourcentages de matérialité et bornes de ratios sont des pratiques",
    "> professionnelles paramétrables. Les ISA/NEP imposent le principe et la",
    "> documentation du jugement, mais ne fixent pas de pourcentage universel.",
    "",
    "---",
    "",
  ].join("\n");
  return head + cycles.map(exportToMarkdown).join("\n---\n\n");
}
