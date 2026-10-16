"use client";

import { Fragment, useId, useState } from "react";
import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { CYCLE_STATUS_LABELS, type CycleRow } from "@/lib/dossier/cycle-registry";
import { SEVERITIES } from "@/lib/synthese-view/common";
import s from "./synthese.module.css";

const DEFAULT_ROWS = 5;
const MODE_LABEL = { historique: "Historique", scenario: "Scénario", persistant: "Local persistant" } as const;
const CAPABILITY_LABEL = { implemented: "implémentée", configured: "configurée — activation requise", absent: "absente" } as const;

/**
 * Registre des cycles du dossier : état, étendue, écarts et prochaine action, une ligne continue par cycle, les
 * cycles qui demandent une action en premier. Tout vient de la projection du registre (`projectCycleRows`) ;
 * exclusions, sources, feuilles et accès s'ouvrent à la demande dans la ligne.
 */
export function CycleRegister({ rows, onProof }: { rows: readonly CycleRow[]; onProof: (hash: string) => void }) {
  const id = useId();
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shown = all ? rows : rows.slice(0, DEFAULT_ROWS);
  const hidden = rows.length - DEFAULT_ROWS;

  return (
    <section id="registre" aria-labelledby={`${id}-t`} className={s.register}>
      <div className={s.registerHead}>
        <h3 id={`${id}-t`} className={s.h3}>Registre des cycles du dossier</h3>
        <span className={s.registerNote}>État, étendue, écarts et prochaine action par cycle</span>
      </div>
      <div role="region" aria-label="Registre des cycles, défilement horizontal" tabIndex={0} className={s.scrollX}>
        <table className={s.registerTable}>
          <thead>
            <tr>
              <th scope="col">Cycle</th>
              <th scope="col">État</th>
              <th scope="col">Étendue</th>
              <th scope="col" className={s.alignRight}>Écarts</th>
              <th scope="col">Prochaine action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const expanded = open === row.entry.id;
              const panel = `${id}-${row.entry.id}`;
              const { findings, exceptions, openBlocking } = row.gaps;
              return (
                <Fragment key={row.entry.id}>
                  <tr className={s.registerRow} data-open={expanded ? "" : undefined}>
                    <th scope="row">
                      <button type="button" className={s.cycleButton} aria-expanded={expanded} aria-controls={panel} onClick={() => setOpen(expanded ? null : row.entry.id)}>
                        <span aria-hidden="true" className={s.toggleSign}>{expanded ? "−" : "+"}</span>
                        {row.entry.label}
                      </button>
                    </th>
                    <td className={s.stateCell}>
                      {CYCLE_STATUS_LABELS[row.status]}
                      {row.statusDetail && <span className={s.stateDetail}>{row.statusDetail}</span>}
                    </td>
                    <td className={s.scopeCell}>{row.entry.scope}</td>
                    <td className={`${s.gapsCell} ${s.alignRight}`}>
                      {findings || exceptions !== null ? (
                        <>
                          {exceptions !== null && (
                            <span className={s.gap}>
                              <span className={s.mono}>{exceptions}</span>
                              <span className={s.gapWord}>{exceptions > 1 ? "exceptions" : "exception"}</span>
                            </span>
                          )}
                          {findings &&
                            SEVERITIES.filter((sev) => findings[sev] > 0).map((sev) => (
                              <span key={sev} className={s.gap}>
                                <SeverityGlyph severity={sev} />
                                <span className={s.mono}>{findings[sev]}</span>
                                <span className={s.gapWord}>{sev}</span>
                              </span>
                            ))}
                          {openBlocking > 0 && (
                            <span className={s.gap}>
                              <span className={s.mono}>{openBlocking}</span>
                              <span className={s.gapWord}>{openBlocking > 1 ? "ouverts" : "ouvert"}</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className={s.soft}>—</span>
                      )}
                    </td>
                    <td className={s.actionCell}>
                      <ActionLink row={row} onProof={onProof} />
                    </td>
                  </tr>
                  <tr hidden={!expanded} className={s.registerPanelRow}>
                    <td colSpan={5}>
                      {expanded && (
                        <div id={panel} className={s.registerPanel}>
                          <div>
                            <h4 className={s.panelTitle}>Exclusions et limites</h4>
                            <ul className={s.panelList}>
                              {row.entry.exclusions.map((e) => (
                                <li key={e}>{e}</li>
                              ))}
                            </ul>
                            <h4 className={s.panelTitle}>Sources requises</h4>
                            <p className={s.panelText}>{row.entry.sources.join(" · ")}</p>
                            {row.runs.length > 0 && (
                              <>
                                <h4 className={s.panelTitle}>Feuilles du laboratoire</h4>
                                <ul className={s.panelList}>
                                  {row.runs.map((r) => (
                                    <li key={r.id} className={s.mono}>
                                      <a href={`#wp-${encodeURIComponent(r.id)}`} onClick={() => onProof(`#wp-${encodeURIComponent(r.id)}`)}>{r.id}</a>
                                      <span className={s.soft}> · {r.state} · révision {r.revision}{r.stale ? " · périmée" : ""}{r.blocked ? " · bloquée" : ""}</span>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </div>
                          <div>
                            <h4 className={s.panelTitle}>Accès</h4>
                            <ul className={s.panelList}>
                              {row.entry.sheet && (
                                <li>
                                  <Link href={row.entry.sheet.href}>{row.entry.sheet.label}</Link>
                                </li>
                              )}
                              {row.entry.synthesis && (
                                <li>
                                  <Link href={row.entry.synthesis.href}>{row.entry.synthesis.label}</Link>
                                </li>
                              )}
                              {row.entry.secondary.map((l) => (
                                <li key={l.href}>
                                  <Link href={l.href}>{l.label}</Link>
                                </li>
                              ))}
                              {!row.entry.sheet && !row.entry.synthesis && row.entry.secondary.length === 0 && <li className={s.soft}>Aucune route : capacité absente.</li>}
                            </ul>
                            <h4 className={s.panelTitle}>Capacité par mode</h4>
                            <dl className={s.capability}>
                              {(Object.keys(MODE_LABEL) as (keyof typeof MODE_LABEL)[]).map((mode) => (
                                <Fragment key={mode}>
                                  <dt>{MODE_LABEL[mode]}</dt>
                                  <dd>{CAPABILITY_LABEL[row.entry.capability[mode]]}</dd>
                                </Fragment>
                              ))}
                            </dl>
                            {row.entry.procedures.length > 0 && <p className={s.panelHint}>Procédures outillées : {row.entry.procedures.join(", ")}</p>}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <button type="button" className={s.underlineToggle} aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? "Replier le registre" : `Afficher les ${rows.length} cycles`}
        </button>
      )}
    </section>
  );
}

function ActionLink({ row, onProof }: { row: CycleRow; onProof: (hash: string) => void }) {
  const { nextAction } = row;
  const text = `${nextAction.label} →`;
  if (!nextAction.href) return <span className={s.actionPlain}>{nextAction.label}</span>;
  if (nextAction.href.startsWith("#")) {
    const hash = nextAction.href;
    return (
      <a href={hash} className={s.actionLink} onClick={() => onProof(hash)}>
        {text}
      </a>
    );
  }
  return (
    <Link href={nextAction.href} className={s.actionLink}>
      {text}
    </Link>
  );
}
