"use client";
import { useState } from "react";
import { assertionLabel, CL_ASSERTION_GROUPS, CL_ASSERTION_LABELS, CL_ASSERTIONS, CL_CYCLE_LABELS, CL_CYCLES, CL_ENGINE_PROCEDURES, CL_NATURE_LABELS, CL_NATURES, CL_RISK_LEVEL_LABELS, CL_RISK_LEVELS, CL_STEP_LABELS, type ClosingAssertion } from "@/lib/workpapers/closing-contract";
import { STATUS_LABELS, type PairView, type ProcedureStatus, type ProcedureView, type RiskView } from "@/lib/workpapers/closing-evaluate";
import { STEP_STATE_LABELS, stampFr, TONE, type ClosingView } from "./format";
import cl from "./closing.module.css";

export interface ProgramFilters { nature: string; status: string; owner: string; q: string }
const PAIR_SYMBOL: Record<PairView["status"], string> = { revue: "✓", en_cours: "◐", aucune: "✕", non_applicable: "—" };
const SHORT_GROUP: Record<string, string> = { flux: "Flux", solde: "Soldes", annexe: "Annexe" };
const PAIR_TEXT: Record<PairView["status"], string> = { revue: "au moins une procédure revue", en_cours: "procédure en cours", aucune: "aucune procédure applicable", non_applicable: "non applicable motivé" };
type Send = (body: Record<string, unknown>) => Promise<boolean>;

export function matches(p: ProcedureView, f: ProgramFilters) {
  const q = f.q.trim().toLowerCase();
  return (!f.nature || p.nature === f.nature) && (!f.status || p.status === f.status) && (!f.owner || p.owner === f.owner) && (!q || (p.procedureId + " " + p.label + " " + p.owner).toLowerCase().includes(q));
}

/** Risks × NEP 500 assertions: each cell says whether the couple has a reviewed procedure, work in progress, nothing, or only motivated non-applicable procedures. */
function CoverageMap({ risks, pair, onPair }: { risks: RiskView[]; pair: string | null; onPair: (key: string | null) => void }) {
  if (!risks.length) return <p className={cl.small}>Aucun risque au programme : la carte de couverture est vide, pas couverte.</p>;
  return <div className={cl.mapWrap} role="region" aria-label="Carte de couverture risques × assertions" tabIndex={0}>
    <table className={cl.coverage}>
      <caption className="sr-only">Couverture des couples risque × assertion (NEP 500 §09). ✓ procédure revue, ◐ en cours, ✕ aucune procédure applicable, — non applicable motivé.</caption>
      <thead>
        <tr><td/>{CL_ASSERTION_GROUPS.map(g => <th key={g.id} scope="colgroup" colSpan={CL_ASSERTIONS.filter(a => a.startsWith(g.id + "_")).length} title={g.label}>{SHORT_GROUP[g.id]}<span className="sr-only"> — {g.label}</span></th>)}</tr>
        <tr><td/>{CL_ASSERTIONS.map(a => <th key={a} scope="col"><span className={cl.vhead}>{CL_ASSERTION_LABELS[a]}</span></th>)}</tr>
      </thead>
      <tbody>
        {risks.map(r => <tr key={r.riskId}>
          <th scope="row"><b>{r.riskId}</b>{r.label}</th>
          {CL_ASSERTIONS.map(a => {
            const p = r.pairs.find(x => x.assertion === a);
            if (!p) return <td key={a}><span className={cl.void} aria-hidden="true">·</span><span className="sr-only">non concerné</span></td>;
            const key = r.riskId + ":" + a;
            return <td key={a}><button type="button" className={cl.cell} data-status={p.status} aria-pressed={pair === key}
              aria-label={r.riskId + " · " + assertionLabel(a) + " : " + PAIR_TEXT[p.status] + (p.procedures.length ? " (" + p.procedures.join(", ") + ")" : "")}
              title={assertionLabel(a) + " — " + PAIR_TEXT[p.status]} onClick={() => onPair(pair === key ? null : key)}>{PAIR_SYMBOL[p.status]}</button></td>;
          })}
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function ProcedureRow({ p, lit, selected, onOpen }: { p: ProcedureView; lit: boolean; selected: boolean; onOpen: (id: string, origin: HTMLElement) => void }) {
  const control = p.steps.length === 3;
  return <tr data-lit={lit} aria-selected={selected}>
    <td><span className={cl.statusText}><span className={cl.station} data-tone={TONE[p.status]} aria-hidden="true"/>{p.statusLabel}</span></td>
    <td><button type="button" className={cl.link} onClick={e => onOpen(p.procedureId, e.currentTarget)} aria-label={"Ouvrir la fiche " + p.procedureId + " · " + p.label}>{p.procedureId} · {p.label}</button></td>
    <td>{p.natureLabel}{p.engine ? <><br/><a href={p.engine.route} className={cl.small}>Feuille « {p.engine.label} »</a></> : null}</td>
    <td><ul className={cl.chips}>{p.assertions.map(a => <li key={a} className={cl.chip}>{assertionLabel(a)}</li>)}</ul></td>
    <td>{p.owner}</td>
    <td>{p.engine ? (p.engine.best ? <span>v{p.engine.best.version} · r{p.engine.best.revision}{p.engine.best.populationSize !== null ? " · " + p.engine.best.populationSize + " éléments" : ""}</span> : <span className={cl.small}>aucune feuille</span>)
      : <span>{control ? <span className={cl.steps} role="img" aria-label={p.steps.map(s => CL_STEP_LABELS[s.step] + " : " + STEP_STATE_LABELS[s.state]).join(" ; ")}>{p.steps.map(s => <i key={s.step} className={cl.dot} data-state={s.state}/>)}</span> : null}
        {" "}{p.records.length} trav. · {p.evidence.pieces} pièce{p.evidence.pieces > 1 ? "s" : ""}</span>}
      {p.remaining.length ? <><br/><span className={cl.small}>{p.remaining.length} reste{p.remaining.length > 1 ? "nt" : ""} à faire</span></> : null}</td>
    <td className={cl.small}>{p.updatedBy}<br/>{stampFr(p.updatedAt)}</td>
  </tr>;
}

/** Work programme by risk and assertion, with state and owner; each procedure opens its traceability sheet. */
export function ClosingProgram({ view, filters, setFilters, selected, onOpen, canPrepare, send, busy }: { view: ClosingView; filters: ProgramFilters; setFilters: (f: ProgramFilters) => void; selected: string | null;
  onOpen: (id: string, origin: HTMLElement) => void; canPrepare: boolean; send: Send; busy: boolean }) {
  const e = view.evaluation, [pair, setPair] = useState<string | null>(null);
  const lit = new Set(pair ? e.risks.find(r => r.riskId === pair.split(":")[0])?.pairs.find(x => x.riskId + ":" + x.assertion === pair)?.procedures ?? [] : []);
  const owners = [...new Set(e.procedures.map(p => p.owner))].sort(), statuses = [...new Set(e.procedures.map(p => p.status))] as ProcedureStatus[];
  const filtering = !!(filters.nature || filters.status || filters.owner || filters.q);
  return <div>
    <h2>Carte de couverture</h2>
    <p className={cl.small}>Une case par couple risque × assertion retenu au programme. Sélectionner une case met en évidence les procédures qui la couvrent ; une case ✕ est un trou du programme, pas un oubli silencieux.</p>
    <CoverageMap risks={e.risks} pair={pair} onPair={setPair}/>
    {pair ? <p className={cl.small} role="status">Mise en évidence : {lit.size ? [...lit].join(", ") : "aucune procédure"} pour {pair.split(":")[0]} · {assertionLabel(pair.split(":")[1] as ClosingAssertion)}. <button type="button" className={cl.link} onClick={() => setPair(null)}>Effacer</button></p> : null}
    <h2>Programme de travail</h2>
    <div className={cl.toolbar} role="search">
      <label>Nature<select value={filters.nature} onChange={ev => setFilters({ ...filters, nature: ev.target.value })}><option value="">Toutes</option>{CL_NATURES.map(n => <option key={n} value={n}>{CL_NATURE_LABELS[n]}</option>)}</select></label>
      <label>État<select value={filters.status} onChange={ev => setFilters({ ...filters, status: ev.target.value })}><option value="">Tous</option>{statuses.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label>
      <label>Responsable<select value={filters.owner} onChange={ev => setFilters({ ...filters, owner: ev.target.value })}><option value="">Tous</option>{owners.map(o => <option key={o}>{o}</option>)}</select></label>
      <label>Recherche<input type="search" value={filters.q} onChange={ev => setFilters({ ...filters, q: ev.target.value })} placeholder="P-03, libellé…"/></label>
    </div>
    {e.risks.map(r => {
      const ps = e.procedures.filter(p => p.riskIds.includes(r.riskId) && matches(p, filters));
      if (filtering && !ps.length) return null;
      return <section key={r.riskId} className={cl.lane} aria-labelledby={"lane-" + r.riskId}>
        <div className={cl.laneHead}>
          <h3 id={"lane-" + r.riskId}>{r.riskId} · {r.label}</h3>
          <span className={cl.small}>{r.cycleLabel}</span>
          <span className={cl.level} data-level={r.assessment?.level ?? "none"}>{r.assessment ? "Risque " + CL_RISK_LEVEL_LABELS[r.assessment.level].toLowerCase() : "Non évalué"}</span>
          <ul className={cl.chips} aria-label="Assertions du risque">{r.pairs.map(x => <li key={x.assertion} className={cl.chip} data-gap={x.status === "aucune"}>{assertionLabel(x.assertion)}{x.status === "aucune" ? " — aucune procédure" : ""}</li>)}</ul>
        </div>
        {ps.length ? <div className={cl.tableScroll}><table className={cl.program}>
          <caption className="sr-only">Procédures du risque {r.riskId}</caption>
          <colgroup><col style={{ width: "15%" }}/><col style={{ width: "21%" }}/><col style={{ width: "13%" }}/><col style={{ width: "19%" }}/><col style={{ width: "10%" }}/><col style={{ width: "11%" }}/><col style={{ width: "11%" }}/></colgroup>
          <thead><tr><th scope="col">État</th><th scope="col">Procédure</th><th scope="col">Nature</th><th scope="col">Assertions</th><th scope="col">Responsable</th><th scope="col">Travaux et pièces</th><th scope="col">Dernière action</th></tr></thead>
          <tbody>{ps.map(p => <ProcedureRow key={p.procedureId} p={p} lit={lit.has(p.procedureId)} selected={selected === p.procedureId} onOpen={onOpen}/>)}</tbody>
        </table></div> : <p className={cl.small}>Aucune procédure rattachée à ce risque.</p>}
      </section>;
    })}
    {canPrepare ? <ProgramEditor view={view} send={send} busy={busy}/> : null}
  </div>;
}

function checked(form: FormData, name: string) { return form.getAll(name).map(String); }
/** Programme editing: risks with their assertions and human assessment, procedures with their risks, assertions, nature and owner. */
function ProgramEditor({ view, send, busy }: { view: ClosingView; send: Send; busy: boolean }) {
  const e = view.evaluation, [riskEdit, setRiskEdit] = useState(""), [procEdit, setProcEdit] = useState(""), [nature, setNature] = useState("detail");
  const risk = e.risks.find(r => r.riskId === riskEdit), proc = e.procedures.find(p => p.procedureId === procEdit);
  const nextRisk = "R-" + String(e.risks.length + 1).padStart(2, "0"), nextProc = "P-" + String(e.procedures.length + 1).padStart(2, "0");
  const assertionBoxes = (name: string, initial: ClosingAssertion[], allowed?: ClosingAssertion[]) => <fieldset className={cl.form}><legend className={cl.small}>Assertions (NEP 500 §09)</legend>
    {CL_ASSERTION_GROUPS.map(g => <div key={g.id} className={cl.row}><span className={cl.small} style={{ flexBasis: "100%" }}>{g.label}</span>
      {CL_ASSERTIONS.filter(a => a.startsWith(g.id + "_") && (!allowed || allowed.includes(a))).map(a => <label key={a} style={{ display: "inline-flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
        <input type="checkbox" name={name} value={a} defaultChecked={initial.includes(a)} style={{ width: "auto" }}/>{CL_ASSERTION_LABELS[a]}</label>)}</div>)}
  </fieldset>;
  return <details className={cl.section}>
    <summary><strong>Modifier le programme</strong> <span className={cl.small}>— risques, assertions, procédures et responsables</span></summary>
    <div className={cl.groups}>
      <form key={"r" + riskEdit + view.seq} className={cl.form} onSubmit={async ev => { ev.preventDefault(); const f = new FormData(ev.currentTarget), level = String(f.get("level"));
        if (await send({ command: "set_risk", riskId: String(f.get("riskId")), cycle: f.get("cycle"), label: f.get("label"), assertions: checked(f, "assertions"), assessment: level ? { level, rationale: f.get("rationale") } : null })) setRiskEdit(""); }}>
        <h3>Risque</h3>
        <label>Modifier un risque existant<select value={riskEdit} onChange={ev => setRiskEdit(ev.target.value)}><option value="">Nouveau risque ({nextRisk})</option>{e.risks.map(r => <option key={r.riskId} value={r.riskId}>{r.riskId} · {r.label}</option>)}</select></label>
        <input type="hidden" name="riskId" value={risk?.riskId ?? nextRisk}/>
        <div className={cl.row}><label>Cycle<select name="cycle" defaultValue={risk?.cycle ?? "transversal"}>{CL_CYCLES.map(c => <option key={c} value={c}>{CL_CYCLE_LABELS[c]}</option>)}</select></label>
          <label>Évaluation (méthode du cabinet)<select name="level" defaultValue={risk?.assessment?.level ?? ""}><option value="">Non évalué</option>{CL_RISK_LEVELS.map(l => <option key={l} value={l}>{CL_RISK_LEVEL_LABELS[l]}</option>)}</select></label></div>
        <label>Libellé du risque<input name="label" required maxLength={200} defaultValue={risk?.label}/></label>
        <label>Motif de l’évaluation<textarea name="rationale" maxLength={1000} defaultValue={risk?.assessment?.rationale}/></label>
        {assertionBoxes("assertions", risk?.assertions ?? [])}
        <button className={cl.submit} disabled={busy}>Enregistrer le risque</button>
      </form>
      <form key={"p" + procEdit + view.seq} className={cl.form} onSubmit={async ev => { ev.preventDefault(); const f = new FormData(ev.currentTarget), n = String(f.get("nature"));
        if (await send({ command: "set_procedure", procedureId: String(f.get("procedureId")), riskIds: checked(f, "riskIds"), assertions: checked(f, "passertions"), nature: n, label: f.get("label"), owner: f.get("owner"), ...(n === "engine" ? { engine: f.get("engine") } : {}) })) setProcEdit(""); }}>
        <h3>Procédure</h3>
        <label>Modifier une procédure existante<select value={procEdit} onChange={ev => { setProcEdit(ev.target.value); setNature(e.procedures.find(p => p.procedureId === ev.target.value)?.nature ?? "detail"); }}><option value="">Nouvelle procédure ({nextProc})</option>{e.procedures.map(p => <option key={p.procedureId} value={p.procedureId}>{p.procedureId} · {p.label}</option>)}</select></label>
        <input type="hidden" name="procedureId" value={proc?.procedureId ?? nextProc}/>
        <div className={cl.row}><label>Nature<select name="nature" value={nature} onChange={ev => setNature(ev.target.value)}>{CL_NATURES.map(n => <option key={n} value={n}>{CL_NATURE_LABELS[n]}</option>)}</select></label>
          {nature === "engine" ? <label>Feuille de cycle observée<select name="engine" defaultValue={proc?.engine?.id}>{CL_ENGINE_PROCEDURES.map(p => <option key={p.id} value={p.id}>{CL_CYCLE_LABELS[p.cycle]} · {p.label}</option>)}</select></label> : null}</div>
        <label>Libellé<input name="label" required maxLength={200} defaultValue={proc?.label}/></label>
        <label>Responsable (affectation)<input name="owner" required maxLength={80} defaultValue={proc?.owner}/></label>
        <fieldset className={cl.form}><legend className={cl.small}>Risques couverts</legend><div className={cl.row}>{e.risks.map(r => <label key={r.riskId} style={{ display: "inline-flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
          <input type="checkbox" name="riskIds" value={r.riskId} defaultChecked={proc?.riskIds.includes(r.riskId)} style={{ width: "auto" }}/>{r.riskId}</label>)}</div></fieldset>
        {assertionBoxes("passertions", proc?.assertions ?? [])}
        <button className={cl.submit} disabled={busy || !e.risks.length}>Enregistrer la procédure</button>
      </form>
    </div>
  </details>;
}
