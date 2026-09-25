import type { WorkpaperRun } from "@/lib/workpapers/model";
import { useId } from "react";
import { resultCells } from "@/lib/workpapers/mission-summary";
import { CYCLE_LEARNING, GUIDE_REFERENCE } from "@/lib/workpapers/availability";
import { CycleTechnicalPanel } from "./CycleTechnicalPanel";

const stateLabels: Record<WorkpaperRun["state"], string> = { draft: "Brouillon", ready: "Prêt", executed: "Exécuté", awaiting_review: "En revue", changes_requested: "Correction demandée", approved: "Travail approuvé", locked: "Verrouillé", superseded: "Remplacé", blocked: "Bloqué", failed: "Échec" };
/** Read-only shell: never invent a reviewer or enable real mutations without server auth. */
export function WorkpaperPanel({ runs = [], loading = false, error }: { runs?: WorkpaperRun[]; loading?: boolean; error?: string }) {
  const id = useId();
  return <section aria-labelledby={`${id}-title`} className="my-5 space-y-3 rounded-xl border border-[var(--pb-border)] p-4">
    <h2 id={`${id}-title`} className="font-semibold">Feuilles de travail</h2>
    <p id={`${id}-disabled`} className="text-sm">Usage réel désactivé : l’adaptateur durable autorisé du nouveau parcours reste à livrer ; OIDC existant conservé. Démonstrateur synthétique uniquement, sans validation multi-utilisateur réelle.</p>
    <button type="button" disabled aria-describedby={`${id}-disabled`} className="rounded border px-3 py-2 disabled:opacity-60">Préparer ou réviser une feuille</button>
    {loading ? <p role="status">Chargement des feuilles…</p> : error ? <p role="alert">Feuilles indisponibles : {error}</p> : !runs.length ? <p>Aucune feuille de travail activée. Les missions historiques ne sont pas converties automatiquement.</p> : runs.map((run) => <article key={run.id} id={`wp-${encodeURIComponent(run.id)}`} className="min-w-0 space-y-2 border-t pt-3">
      <h3 className="font-semibold">{run.template.objective} — {stateLabels[run.state]}</h3>
      <p>Mission {run.scope.dossierId} · {run.period.startDate} au {run.period.closingDate} · Revue au {run.period.asOfDate} · Révision {run.revision}, version {run.version}</p>
      <p>{run.state === "locked" ? "Conclusion verrouillée" : "Progression provisoire, non publiée"} : {run.conclusion ?? "Conclusion non renseignée"}</p>
      <p>Données : {run.importIds.length} imports · Population : {run.population?.items.length ?? "non définie"} · Sélection : {run.selection?.selectedIds.length ?? "non définie"}</p>
      <p>Calcul : {run.result ? `${run.result.calculationKey} @ ${run.result.ruleVersion} — ${run.result.execution}` : "Non exécuté"}. {run.result?.outcome === "no_exception_detected" ? "Aucune exception détectée par ce calcul ; aucune opinion sur les comptes." : run.result?.outcome === "exceptions_detected" ? "Exceptions détectées." : "Résultat non concluant ou absent."}</p>
      {run.result?.calculationKey === "cash.bridge.synthetic" && <CycleTechnicalPanel run={run} />}
      {run.result ? <details><summary>Table exacte des montants et inconnus — aucune addition entre catégories</summary><div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Table des montants — défilement clavier"><table className="w-full text-left text-xs"><caption className="break-all">Valeurs du résultat {run.result.inputHash} ; chemins vers les paramètres et preuves dans le manifeste</caption><thead><tr><th scope="col">Chemin du résultat</th><th scope="col">Valeur</th></tr></thead><tbody>{resultCells(run.result.result).map((cell) => <tr key={cell.path}><th scope="row" className="break-all p-2">{cell.path}</th><td className="p-2">{cell.value}</td></tr>)}</tbody></table></div></details> : null}
      {CYCLE_LEARNING[run.template.id.replace("demo.cycle.", "")] ? <details><summary>Comprendre la procédure — pédagogie, pas une norme</summary>{(() => { const learning = CYCLE_LEARNING[run.template.id.replace("demo.cycle.", "")]; return <><p>Objectif : {learning.objective}. Risque : {learning.risk}.</p><p>Assertions : {run.template.assertions.map((a) => `${a.label} (${a.validation})`).join(" ; ")}</p><p>Entrées et calcul : voir population, sélection, paramètres et règle {run.template.rule?.version}. Le mode pédagogique ne modifie aucun résultat.</p><p>Ce qui n’est pas prouvé : {learning.notProven}.</p><p>Source : {GUIDE_REFERENCE.document}, p.{learning.pages}, {GUIDE_REFERENCE.version}/{GUIDE_REFERENCE.date}, {GUIDE_REFERENCE.pack}. SOURCE REQUISE pour la mission réelle.</p></>; })()}</details> : null}
      {run.result && <details><summary className="cursor-pointer">Résultat et provenance du calcul</summary><pre className="overflow-auto text-xs" tabIndex={0} role="region" aria-label="Provenance — défilement clavier">{JSON.stringify({ result: run.result.result, inputHash: run.result.inputHash, sources: run.result.sourceRefs }, null, 2)}</pre></details>}
      <h4>Pièces et preuves</h4>
      {!run.evidence.length ? <p>Aucune preuve rattachée.</p> : <ul>{run.evidence.map((e) => <li key={e.id}>{e.purpose} — {e.documentVersionId}, {e.locator?.sheet ? `feuille ${e.locator.sheet}, ` : ""}{e.locator?.cell ? `cellule ${e.locator.cell}` : e.locator?.row ? `ligne ${e.locator.row}` : e.locator?.page ? `page ${e.locator.page}` : "document entier"} ({e.status === "verified" ? "provenance vérifiée" : "suggestion non vérifiée"})</li>)}</ul>}
      <h4>Limites et commentaires</h4>
      <ul>{[...(run.selection?.limitations ?? []), ...(run.result?.warnings ?? []), ...(run.result?.blockedControls ?? [])].map((limit, index) => <li key={`${index}:${limit}`}>{limit}</li>)}</ul>
      {run.notes.map((note) => <p key={note.id}>{note.kind} : {note.text} — {note.amount.kind === "known" ? `${note.amount.value.amount} EUR` : note.amount.reason}{note.resolution ? ` · Résolution : ${note.resolution.text}` : note.blocking ? " · Bloquante non résolue" : ""}</p>)}
      {run.approval && <p>Revue du travail par {run.approval.actorId}, version {run.approval.version} : {run.approval.note}. Ne vaut pas conformité des comptes.</p>}
    </article>)}
  </section>;
}
