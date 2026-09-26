import React from "react";
import { AVAILABILITY_LABELS, GUIDE_REFERENCE, MODULE_MANIFEST } from "@/lib/workpapers/availability";
import { summarizeWorkpapers } from "@/lib/workpapers/mission-summary";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { WorkpaperPanel } from "./WorkpaperPanel";
export function ModuleAvailability({ snapshot, showWorkpapers = true }: { snapshot: DossierSnapshot; showWorkpapers?: boolean }) {
  const progress = summarizeWorkpapers(snapshot);
  const availableRuns = [...(snapshot.workpapers?.runs ?? []), ...(snapshot.workpaperProjection?.lockedRuns ?? [])];
  const displayedRuns = [...new Map(availableRuns.sort((a, b) => a.revision - b.revision || a.version - b.version).map((run) => [run.rootId, run])).values()];
  return <section aria-labelledby="availability-title" className="my-5 rounded-xl border p-4">
    <h2 id="availability-title" className="text-lg font-semibold">Travaux du dossier {snapshot.dossier.id}</h2>
    <p className="my-2">Démonstration synthétique uniquement. Les résultats des feuilles restent distincts des constats historiques.</p>
    <p>Feuilles : {progress.planned} prévues · {progress.executed} exécutées · {progress.approved} verrouillées · {progress.inconclusive} non concluantes. {"reason" in progress.coverage ? progress.coverage.reason : progress.coverage.excluded}</p>
    <p>{progress.exposures.reason}</p>
    <ul>{progress.rows.map((r) => <li key={r.id}><a className="underline" href={r.link}>{r.label}</a> — {r.state}, révision {r.revision}{r.stale ? " — projection périmée" : ""}</li>)}</ul>
    {showWorkpapers && displayedRuns.length > 0 && <WorkpaperPanel runs={displayedRuns} />}
    <details className="mt-4"><summary className="cursor-pointer">Disponibilité et limites par module</summary>
      <p className="text-sm">États de disponibilité : {AVAILABILITY_LABELS.join(" · ")}. La maturité, le mode, l’état du travail et la conclusion sont distincts.</p>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Disponibilité — défilement clavier"><table className="my-3 w-full text-left text-sm"><caption className="sr-only">Modules, maturité, mode, travail et limites</caption><thead><tr><th scope="col">Module</th><th scope="col">Maturité</th><th scope="col">Mode</th><th scope="col">Travail / conclusion</th><th scope="col">Limite</th></tr></thead><tbody>{MODULE_MANIFEST.map((m) => { const run = displayedRuns.find((r) => r.template.id === `demo.cycle.${m.id.replace("cycle-", "")}`); return <tr key={m.id} className="border-t"><th scope="row" className="p-2">{m.label}</th><td className="p-2">{m.maturity}</td><td className="p-2">{m.mode}</td><td className="p-2">{run ? `${run.state} · ${run.result?.outcome ?? "aucune conclusion"}` : "non exécuté"}</td><td className="p-2">{m.limitation}</td></tr>; })}</tbody></table></div>
      <p className="text-xs">Référence pédagogique déclarée : {GUIDE_REFERENCE.document} {GUIDE_REFERENCE.version}, SHA-256 {GUIDE_REFERENCE.sha256}. Fichier V1.1 inaccessible ici : pagination non vérifiée pendant ce lot. Ni norme ni opinion automatique.</p>
    </details>
  </section>;
}
