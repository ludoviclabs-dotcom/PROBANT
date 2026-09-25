import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { canonicalJson, sha256Hex, stableSha256 } from "@/lib/synthesis/canonical";
import { assertScope, frozen, periodId, validateRun, type WorkpaperScope } from "./model";
import { authorize, type Principal } from "./policy";
import { summarizeWorkpapers } from "./mission-summary";
import { GUIDE_REFERENCE, MODULE_MANIFEST, MODULE_MANIFEST_VERSION } from "./availability";
export const hashExportText = (text: string) => sha256Hex(text);
const escapeMarkdown = (s: string) => s.replace(/[\\`*_{}[\]<>#!|]/g, (c) => `\\${c}`).replace(/\r?\n/g, " ");
export function buildWorkpaperPackage(snapshot: DossierSnapshot, scope: WorkpaperScope, actor: Principal | null) {
  authorize(actor, scope, "read"); authorize(actor, scope, "download");
  if (scope.mode !== "demo" || !snapshot.dossier.demoMode || !snapshot.dossier.period) throw new Error("REAL_EXPORT_DISABLED");
  assertScope(scope, { organizationId: snapshot.dossier.organizationId ?? "", dossierId: snapshot.dossier.id, periodId: periodId(snapshot.dossier.period), mode: "demo" });
  if (snapshot.workpaperProjection) assertScope(scope, snapshot.workpaperProjection.scope);
  const runs = [...(snapshot.workpapers?.runs ?? []), ...(snapshot.workpaperProjection?.lockedRuns ?? [])];
  for (const run of runs) { validateRun(run); assertScope(scope, run.scope); for (const link of run.evidence) assertScope(scope, link.scope); }
  const summary = summarizeWorkpapers(snapshot);
  const body = { schemaVersion: "1.0.0", mode: "DÉMONSTRATION — PAS DE PRODUCTION", scope, snapshot: frozen(snapshot), summary, modules: MODULE_MANIFEST, moduleManifestVersion: MODULE_MANIFEST_VERSION, guide: GUIDE_REFERENCE, binaryAttachments: [] as string[], limitations: ["Pièces binaires non incluses ; localisateurs et versions conservés", "Hash = contrôle d’intégrité, pas une signature légale", "SOURCE REQUISE pour méthodes/PBC du dossier ; ce nouvel atelier n’est pas relié à l’authentification OIDC ni à la persistance durable existantes", "Seules les versions verrouillées alimentent la projection ; brouillons distincts"] };
  const json = canonicalJson(body), snapshotHash = stableSha256(body);
  const markdown = `# Dossier de travail — DÉMONSTRATION\n\nAucun usage en production. Aucun rapport officiel ni opinion d’audit.\n\nMission : ${escapeMarkdown(scope.dossierId)}\n\nPériode : ${snapshot.dossier.period.startDate} au ${snapshot.dossier.period.closingDate} ; revue ${snapshot.dossier.period.asOfDate}.\n\n## Travaux\n\n${summary.rows.map((r) => `- ${escapeMarkdown(r.label)} : ${r.state}, révision ${r.revision}, projection ${r.projectedRevision ?? "absente"}${r.stale ? " — PÉRIMÉE" : ""}`).join("\n") || "Aucun travail projeté."}\n\n## Limites\n\n${body.limitations.map((l) => `- ${l}`).join("\n")}\n\nSource pédagogique : ${GUIDE_REFERENCE.document}, ${GUIDE_REFERENCE.version}, ${GUIDE_REFERENCE.date}, pack ${GUIDE_REFERENCE.pack}. Les exemples ne sont pas des règles.\n\nLe manifeste JSON contient le snapshot intégral autorisé, paramètres, imports, population, sélection, versions, localisateurs, notes et revues.\n\nIntégrité du snapshot : ${snapshotHash}. Pas de signature légale.\n`;
  return frozen({ markdown, json, manifest: { version: "1.0.0", hashAlgorithm: "SHA-256 UTF-8 bytes", scope, mode: "demo", sourceSnapshotHash: snapshot.snapshotHash, snapshotHash, files: [{ name: "workpapers.json", hash: hashExportText(json) }, { name: "workpapers.md", hash: hashExportText(markdown) }], binaryAttachments: [], availability: MODULE_MANIFEST } });
}
