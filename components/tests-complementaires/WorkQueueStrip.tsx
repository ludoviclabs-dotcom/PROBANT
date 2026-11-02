import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { severityWord } from "@/components/charte/severity";
import p from "@/components/charte/page.module.css";
import { plural } from "@/lib/synthese-view/common";
import { exclusionSentence, severityTally, type WorkQueue } from "@/lib/tests-view/queue";
import x from "./tests.module.css";

/**
 * Bandeau de la file de travail : constats à couvrir (et ceux exclus, par famille et gravité), procédures proposées
 * contre procédures à définir (barre proportionnelle, décorative : les nombres sont écrits dessous), répartition par
 * gravité. Les nombres viennent de `buildWorkQueue`.
 */
export function WorkQueueStrip({ queue }: { queue: WorkQueue }) {
  const covered = queue.items.length;
  return (
    <div className={p.measures}>
      <div className={p.measure}>
        <div className={p.measureHead}>Constats à couvrir</div>
        <p className={x.measureValue}>
          {covered}
          <span className={x.measureOf}> sur {queue.total}</span>
        </p>
        <p className={p.measureText}>{exclusionSentence(queue.excluded)}</p>
      </div>
      <div className={`${p.measure} ${x.measureWide}`}>
        <div className={p.measureHead}>Procédures</div>
        {covered > 0 && (
          <div className={x.bar} aria-hidden="true">
            {queue.resolved > 0 && <span className={x.barResolved} style={{ flex: `${queue.resolved} 1 0` }} />}
            {queue.toDefine > 0 && <span className={x.barToDefine} style={{ flex: `${queue.toDefine} 1 0` }} />}
          </div>
        )}
        <p className={x.barLegend}>
          <span>
            <span className={x.figure}>{queue.resolved}</span> {plural(queue.resolved, "proposée")}
          </span>
          <span>
            <span className={x.figure}>{queue.toDefine}</span> à définir par le professionnel
          </span>
        </p>
      </div>
      <div className={p.measure}>
        <div className={p.measureHead}>Par gravité</div>
        {covered > 0 ? (
          <ul className={x.sevList}>
            {severityTally(queue.bySeverity).map(({ severity, count }) => (
              <li key={severity} className={p.mark}>
                <SeverityGlyph severity={severity} />
                <span>
                  <span className={x.figure}>{count}</span> {plural(count, severityWord(severity))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={p.measureText}>Aucun constat à couvrir.</p>
        )}
      </div>
    </div>
  );
}
