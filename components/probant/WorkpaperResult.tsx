import type { WorkpaperRun } from "@/lib/workpapers/model";
import { OUTCOME_LABELS, resultPresentation } from "@/lib/workpapers/result-contract";

/** Shared, deterministic rendering of the result contract used by synthesis and exports. */
export function WorkpaperResult({ run }: { run: WorkpaperRun }) {
  const view = resultPresentation(run);
  return <div key={`${run.result?.inputHash}:${run.version}`} className="pb-result-update space-y-3 rounded-lg border p-3" aria-label="Résumé du résultat">
    <p className="flex flex-wrap gap-2 text-sm">{[run.scope.mode === "demo" ? "Mode : démonstration" : "Mode : réel", view.review, view.locking, view.staleness].map((text) => <span key={text} className="rounded border px-2 py-1">{text}</span>)}</p>
    <dl className="grid gap-3 sm:grid-cols-2">
      {[["Test exécuté", view.testExecuted], ["Résultat", view.result], ["Incertitude", view.uncertainty], ["Prochaine action", view.nextAction]].map(([label, text]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="text-sm">{text}</dd></div>)}
    </dl>
    {view.controls.length > 0 && <><h4 className="font-semibold">Sous-contrôles</h4><ul className="space-y-3">{view.controls.map((c) => <li key={c.id} data-control-id={c.id} className="rounded border p-2 text-sm">
      <p className="font-semibold">{c.label}</p>
      <p><span className="inline-block rounded border px-2 py-1">{OUTCOME_LABELS[c.outcome]}</span> · {c.execution === "completed" ? "Exécuté" : c.execution === "blocked" ? "Bloqué" : "Non exécuté"} · Disponibilité : {c.availability === "available" ? "disponible" : "bloquée"}</p>
      <p>{c.reason}</p>
      <p>Incertitude : {c.uncertainty}</p>
      <p>Prochaine action : {c.nextAction} <a className="underline" href={c.sourceHref}>Voir la source requise</a></p>
      <details><summary className="cursor-pointer">Prérequis du sous-contrôle</summary><ul>{c.prerequisites.map((p) => <li key={p.id}>{p.label} : {p.status === "met" ? "satisfait" : "manquant"} · <a href={p.sourceHref} className="underline">Source requise</a></li>)}</ul></details>
    </li>)}</ul></>}
  </div>;
}
