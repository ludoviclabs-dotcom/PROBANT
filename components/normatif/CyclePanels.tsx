import type {
  AnalyticalProcedure,
  DetailTest,
  IFRSvsPCGDifference,
  MaterialityBlock,
  MaterialityGuidance,
  Ratio,
  Risk,
  RiskCategory,
  ThresholdRule,
} from "@/lib/audit-cycles/types";
import p from "@/components/charte/page.module.css";
import { NormativeStatusBadge } from "./NormativeStatusBadge";
import n from "./normatif.module.css";

/**
 * Sections de la fiche cycle, en lignes continues sous filets (aucune carte). Les textes viennent tels quels des
 * fichiers YAML ; rien n'est calculé ici.
 */

function Empty({ children }: { children: React.ReactNode }) {
  return <p className={n.empty}>{children}</p>;
}

export function ThresholdLines({ thresholds }: { thresholds: ThresholdRule[] }) {
  if (!thresholds?.length) return <Empty>Aucun seuil ni règle chiffrée pour ce cycle.</Empty>;
  return (
    <ul className={n.lines}>
      {thresholds.map((t, i) => (
        <li key={i} className={n.line}>
          <div>
            <p className={n.lineTitle}>{t.label}</p>
            <p className={n.lineText}>{t.value}</p>
            {t.caveat ? <p className={n.lineNote}>{t.caveat}</p> : null}
          </div>
          <NormativeStatusBadge status={t.status} short />
        </li>
      ))}
    </ul>
  );
}

function MaterialityStep({ title, block }: { title: string; block: MaterialityBlock }) {
  return (
    <div className={n.step}>
      <div className={p.measureHead}>
        <span>{title}</span>
        <NormativeStatusBadge status={block.status} short />
      </div>
      <p className={n.stepRange}>{block.recommendedRange}</p>
      {block.benchmark ? <p className={n.lineText}>Base : {block.benchmark}</p> : null}
      <p className={n.lineText}>Méthode : {block.formula}</p>
      <p className={n.lineNote}>{block.caveat}</p>
    </div>
  );
}

/**
 * Trois niveaux de matérialité en marches : trait plein (seuil global), tirets (seuil de performance), pointillé
 * (seuil clairement insignifiant). Les fourchettes restent du texte : ce ne sont pas des seuils normatifs.
 */
export function MaterialitySteps({ materiality }: { materiality: MaterialityGuidance }) {
  if (!materiality) return <Empty>Matérialité non renseignée.</Empty>;
  return (
    <>
      <p className={p.note} style={{ marginTop: 0, marginBottom: 16 }}>
        Pratiques professionnelles paramétrables : les ISA / NEP imposent le principe et la documentation du jugement,
        mais ne fixent aucun pourcentage universel.
      </p>
      <div className={n.steps}>
        <MaterialityStep title="Seuil de signification global" block={materiality.globalMateriality} />
        <MaterialityStep title="Seuil de performance" block={materiality.performanceMateriality} />
        <MaterialityStep title="Seuil clairement insignifiant" block={materiality.clearlyTrivialThreshold} />
      </div>
    </>
  );
}

export function RatioLines({ ratios }: { ratios: Ratio[] }) {
  if (!ratios?.length) return <Empty>Aucun ratio renseigné.</Empty>;
  return (
    <ul className={n.lines}>
      {ratios.map((r, i) => (
        <li key={i} className={n.line}>
          <div>
            <p className={n.lineTitle}>{r.name}</p>
            <p className={n.lineText}>
              <span className={n.code}>{r.formula}</span>
            </p>
            <p className={n.lineText}>
              <span className={n.tag}>Alerte </span> {r.alertThreshold}
            </p>
            <p className={n.lineText}>{r.interpretation}</p>
            {r.caveat ? <p className={n.lineNote}>{r.caveat}</p> : null}
          </div>
          <NormativeStatusBadge status={r.status} short />
        </li>
      ))}
    </ul>
  );
}

export function ProcedureLines({ procedures }: { procedures: AnalyticalProcedure[] }) {
  if (!procedures?.length) return <Empty>Aucune procédure analytique renseignée.</Empty>;
  return (
    <ul className={n.lines}>
      {procedures.map((pr, i) => (
        <li key={i} className={n.line} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div>
            <p className={n.lineTitle}>{pr.name}</p>
            <dl className={n.fields}>
              <div>
                <dt>Objectif</dt>
                <dd>{pr.objective}</dd>
              </div>
              <div>
                <dt>Méthode</dt>
                <dd>{pr.method}</dd>
              </div>
              <div>
                <dt>Variation attendue</dt>
                <dd>{pr.expectedVariation}</dd>
              </div>
              <div>
                <dt>Déclencheur</dt>
                <dd>{pr.anomalyTrigger}</dd>
              </div>
            </dl>
            {pr.benchmark?.length ? (
              <ul className={n.chips}>
                {pr.benchmark.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            ) : null}
            {pr.assertions?.length ? (
              <p className={n.assertions} aria-label="Assertions">
                {pr.assertions.map((a) => (
                  <span key={a}>{a}</span>
                ))}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TestLines({ tests }: { tests: DetailTest[] }) {
  if (!tests?.length) return <Empty>Aucun test de détail renseigné.</Empty>;
  return (
    <ul className={n.lines}>
      {tests.map((t, i) => (
        <li key={i} className={n.line} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div>
            <p className={n.lineTitle}>{t.name}</p>
            <dl className={n.fields}>
              <div>
                <dt>Nature</dt>
                <dd>{t.nature}</dd>
              </div>
              <div>
                <dt>Étendue</dt>
                <dd>{t.extent}</dd>
              </div>
              <div>
                <dt>Calendrier</dt>
                <dd>{t.timing}</dd>
              </div>
              <div>
                <dt>Échantillonnage</dt>
                <dd>{t.samplingMethod}</dd>
              </div>
            </dl>
            {t.evidenceRequired?.length ? (
              <>
                <p className={n.tag} style={{ marginTop: 10 }}>
                  Éléments probants attendus
                </p>
                <ul className={n.chips} style={{ marginTop: 2 }}>
                  {t.evidenceRequired.map((e, j) => (
                    <li key={j}>{e}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {t.assertions?.length ? (
              <p className={n.assertions} aria-label="Assertions">
                {t.assertions.map((a) => (
                  <span key={a}>{a}</span>
                ))}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

const RISK_COLUMNS: { category: RiskCategory; label: string; glyph: { path: string; paint: "fill" | "stroke"; color: string } }[] = [
  { category: "RISQUE_INHERENT", label: "Risques inhérents", glyph: { path: "M5 1.4 8.6 5 5 8.6 1.4 5z", paint: "stroke", color: "var(--pb-ink-2)" } },
  { category: "RISQUE_CONTROLE", label: "Risques de contrôle", glyph: { path: "M1.7 5a3.3 3.3 0 1 0 6.6 0a3.3 3.3 0 1 0-6.6 0", paint: "stroke", color: "var(--pb-ink-2)" } },
  { category: "RISQUE_FRAUDE", label: "Risques de fraude", glyph: { path: "M5 1.2 9.2 8.8H.8z", paint: "fill", color: "var(--pb-sev-majeur)" } },
];

/** Matrice des risques : trois colonnes (inhérent, contrôle, fraude), chacune avec indices et réponse d'audit. */
export function RiskColumns({ risks }: { risks: Risk[] }) {
  return (
    <div className={n.riskCols}>
      {RISK_COLUMNS.map((col) => {
        const items = (risks ?? []).filter((r) => r.category === col.category);
        return (
          <div key={col.category}>
            <div className={n.riskHead}>
              <h3>
                <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                  <path
                    d={col.glyph.path}
                    strokeWidth={1.5}
                    style={col.glyph.paint === "fill" ? { fill: col.glyph.color } : { fill: "none", stroke: col.glyph.color }}
                  />
                </svg>
                {col.label}
              </h3>
              <span className={n.itemNum}>{items.length}</span>
            </div>
            {items.length === 0 ? (
              <p className={n.empty} style={{ borderTop: 0 }}>
                Aucun risque identifié dans cette catégorie.
              </p>
            ) : (
              items.map((r, i) => (
                <div key={i} className={n.risk}>
                  <h4>{r.name}</h4>
                  <p className={n.lineText}>{r.description}</p>
                  {r.indicators?.length ? (
                    <>
                      <p className={n.tag} style={{ marginTop: 8 }}>
                        Indices
                      </p>
                      <ul className={n.riskList}>
                        {r.indicators.map((x, j) => (
                          <li key={j}>· {x}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {r.response?.length ? (
                    <>
                      <p className={n.tag} style={{ marginTop: 8 }}>
                        Réponse d&apos;audit
                      </p>
                      <ul className={n.riskList}>
                        {r.response.map((x, j) => (
                          <li key={j}>→ {x}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

export function IfrsPcgRegister({ differences }: { differences: IFRSvsPCGDifference[] }) {
  if (!differences?.length) {
    return <Empty>Aucune différence significative IFRS / PCG identifiée pour ce cycle, ou cycle relevant uniquement du référentiel français.</Empty>;
  }
  return (
    // Défile plutôt que de rogner la colonne « Impact audit » quand la colonne est étroite.
    <div className={p.scrollX} tabIndex={0} role="region" aria-label="Différences IFRS / PCG — défilement horizontal">
      <table className={p.register} style={{ minWidth: 720 }}>
        <thead>
          <tr>
            <th scope="col">Thème</th>
            <th scope="col">Traitement IFRS</th>
            <th scope="col">Traitement PCG</th>
            <th scope="col">Impact audit</th>
          </tr>
        </thead>
        <tbody>
          {differences.map((d, i) => (
            <tr key={i}>
              <th scope="row" style={{ fontWeight: 500 }}>
                {d.topic}
              </th>
              <td className={p.soft}>{d.ifrsTreatment}</td>
              <td className={p.soft}>{d.pcgTreatment}</td>
              <td>{d.auditImpact}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
