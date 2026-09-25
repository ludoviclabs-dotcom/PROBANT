import React from "react";
import { AVAILABILITY_LABELS, GUIDE_REFERENCE, MODULE_MANIFEST } from "@/lib/workpapers/availability";
import { summarizeWorkpapers } from "@/lib/workpapers/mission-summary";
import type { DossierSnapshot } from "@/lib/canonical-model/dossier";
import { WorkpaperPanel } from "./WorkpaperPanel";
export function ModuleAvailability({ snapshot, showWorkpapers = true }: { snapshot: DossierSnapshot; showWorkpapers?: boolean }) {
  const progress = summarizeWorkpapers(snapshot);
  const availableRuns = [...(snapshot.workpapers?.runs ?? []), ...(snapshot.workpaperProjection?.lockedRuns ?? [])];
  const displayedRuns = [...new Map(availableRuns.sort((a, b) => a.version - b.version).map((run) => [run.id, run])).values()];
  return <section aria-labelledby="availability-title" className="my-5 rounded-xl border p-4">
    <h2 id="availability-title" className="text-lg font-semibold">Disponibilité réelle des modules</h2>
    <p className="my-2">Cette version est un démonstrateur technique. Aucun cycle démonstratif n’est prêt pour la production.</p>
    <p className="text-sm">États distincts : {AVAILABILITY_LABELS.join(" · ")}</p>
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Disponibilité — défilement clavier"><table className="my-3 w-full text-left text-sm"><caption className="sr-only">Modules, disponibilité et conditions d’activation</caption><thead><tr><th scope="col">Module</th><th scope="col">Statut</th><th scope="col">Limite</th></tr></thead><tbody>{MODULE_MANIFEST.map((m) => <tr key={m.id} className="border-t"><th scope="row" className="p-2">{m.label}</th><td className="p-2">{m.status}</td><td className="p-2">{m.limitation}</td></tr>)}</tbody></table></div>
    <p>Feuilles : {progress.planned} prévues · {progress.executed} exécutées · {progress.approved} verrouillées · {progress.inconclusive} non concluantes. {"reason" in progress.coverage ? progress.coverage.reason : progress.coverage.excluded}</p>
    <p>{progress.exposures.reason}</p>
    <ul>{progress.rows.map((r) => <li key={r.id}><a className="underline" href={r.link}>{r.label}</a> — {r.state}, révision {r.revision}{r.stale ? " — projection périmée" : ""}</li>)}</ul>
    {showWorkpapers && displayedRuns.length > 0 && <WorkpaperPanel runs={displayedRuns} />}
    <p className="mt-3 text-xs">Source pédagogique : {GUIDE_REFERENCE.document}, {GUIDE_REFERENCE.version} / {GUIDE_REFERENCE.date}, pack {GUIDE_REFERENCE.pack}. Synthèse et finalisation : p.107–113 ; exercices : p.114–122. Ni norme, ni opinion automatique.</p>
  </section>;
}
