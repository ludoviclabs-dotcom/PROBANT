"use client";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { formatCents, PV_STATE_LABELS, PV_STATUS_KIND, PV_STATUS_LABELS, PV_TREATMENT_LABELS, PV_TYPE_LABELS, type ProvisionEventResult, type ProvisionResult, type ProvisionState } from "@/lib/workpapers/provision-contract";
import { KIND_LABELS, KIND_ORDER, plural, type Kind } from "./format";
import styles from "../cash/cash.module.css";
import pv from "./provisions.module.css";

export type Focus = "" | "dotation" | "utilisation" | "reprise";
export interface ProvisionFilters { kinds: Kind[]; type: string; state: string; q: string; view: "grid" | "table"; focus: Focus }
export interface ProvisionRegisterHandle { focusEvent(eventId: string): void }
const ICONS: Record<Kind, React.ReactNode> = {
  ok: <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2"/>,
  off: <path d="M2 8h12M5 4.5h6M5 11.5h6" fill="none" stroke="currentColor" strokeWidth="1.6"/>,
  difference: <path d="M2 8h12M8 2v12" fill="none" stroke="currentColor" strokeWidth="2"/>,
  annex: <path d="M3 2.5h7l3 3v8H3z M10 2.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.5"/>,
  unsupported: <path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="2"/>,
  uncertain: <path d="M6 6a2 2 0 114 0c0 1.5-2 1.5-2 3M8 12.5v.5" fill="none" stroke="currentColor" strokeWidth="1.8"/>,
  apart: <path d="M2 8h12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2"/>,
};
export const Lock = () => <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 017 0v2M3 7h10v7H3z" fill="none" stroke="currentColor" strokeWidth="1.6"/></svg>;
export const KindBadge = ({ status }: { status: ProvisionEventResult["status"] }) => <span className={pv.badge} data-kind={PV_STATUS_KIND[status]}><svg viewBox="0 0 16 16" aria-hidden="true">{ICONS[PV_STATUS_KIND[status]]}</svg>{PV_STATUS_LABELS[status]}</span>;
const sign = (d: string | null) => d === null ? "none" : d === "0" ? "zero" : d.startsWith("-") ? "neg" : "pos";
const abs = (x: string) => { const n = BigInt(x); return n < 0n ? -n : n; };
/** Amount shown on a case: the booked provision, or the commitment, or nothing (never a zero for an unknown amount). */
const headline = (e: ProvisionEventResult) => e.bridge ? (e.bridge.computedClosing !== null ? "Provision " + formatCents(e.bridge.computedClosing) : "Provision inconnue") : e.commitmentCents !== null ? "Engagement " + formatCents(e.commitmentCents) : "Sans écriture";

/** Animated provision bridge: opening → increases → used → unused reversals → computed closing, against the ledger. Each movement case filters the register. */
export function ProvisionBridgeStrip({ result, focus, onFocus }: { result: ProvisionResult; focus: Focus; onFocus(f: Focus): void }) {
  const t = result.totals;
  const steps: { key: string; label: string; detail: string; value: string | null; kind: string; focus?: Focus; sign: string }[] = [
    { key: "opening", label: "Ouverture", detail: "Provisions au registre", value: t.opening, kind: "total", sign: "" },
    { key: "dotation", label: "+ Dotations", detail: "Constituées dans l’exercice", value: t.dotations, kind: "increase", focus: "dotation", sign: "+" },
    { key: "utilisation", label: "− Utilisations", detail: "Reprises utilisées", value: t.utilisations, kind: "used", focus: "utilisation", sign: "−" },
    { key: "reprise", label: "− Reprises", detail: "Non utilisées", value: t.reprises, kind: "released", focus: "reprise", sign: "−" },
    { key: "closing", label: "= Clôture calculée", detail: t.declaredClosing === null ? "Déclarée : —" : "Déclarée " + formatCents(t.declaredClosing), value: t.computedClosing, kind: "total", sign: "" },
    { key: "ledger", label: "Grand livre", detail: "Comptes 15 à la clôture", value: t.ledgerClosing, kind: "ledger", sign: "" },
  ];
  const max = steps.reduce((m, s) => s.value === null ? m : abs(s.value) > m ? abs(s.value) : m, 1n), pct = (v: string | null) => v === null ? 0 : Number((abs(v) * 10000n) / max) / 100;
  const framed = t.computedClosing === null ? "unknown" : t.computedClosing === t.ledgerClosing ? "true" : "false";
  return <section className={styles.card} aria-labelledby="pv-bridge-title">
    <header><h2 id="pv-bridge-title">Pont de provision de l’exercice</h2>
      <span className={pv.framed} data-ok={framed}>{framed === "true" ? "Clôture calculée = grand livre" : framed === "false" ? "Clôture calculée ≠ grand livre : écart " + formatCents(String(BigInt(t.ledgerClosing) - BigInt(t.computedClosing!)), { signed: true }) : "Clôture calculée inconnue (mouvements absents)"}</span></header>
    <ol className={pv.strip}>{steps.map((s, i) => {
      const body = <><small>{s.label}</small><strong>{s.value === null ? "Inconnu" : (s.sign && s.value !== "0" ? s.sign + " " : "") + formatCents(s.value)}</strong><span className={pv.stepBar} aria-hidden="true"><span style={{ width: pct(s.value) + "%" }}/></span><small>{s.detail}</small></>;
      return <li key={s.key} style={{ "--i": i } as React.CSSProperties}>{s.focus
        ? <button type="button" className={pv.stepCase} data-kind={s.kind} aria-pressed={focus === s.focus} disabled={!s.value || s.value === "0"} onClick={() => onFocus(focus === s.focus ? "" : s.focus!)} aria-label={s.label + " " + (s.value === null ? "inconnu" : formatCents(s.value)) + " — mettre en évidence les événements concernés"}>{body}</button>
        : <div className={pv.stepCase} data-kind={s.kind}>{body}</div>}</li>;
    })}</ol>
    <p className={styles.muted}>Somme des événements de l’exercice (registre et mouvements) ; le grand livre est lu tel quel. Cliquez sur un mouvement pour mettre en évidence les événements qui y contribuent.</p>
  </section>;
}

interface Props { result: ProvisionResult; filters: ProvisionFilters; selected: string | null; onFilters(next: ProvisionFilters): void; onOpen(eventId: string): void }
const LANES: { state: ProvisionState; title: string }[] = [{ state: "ouvert", title: "Ouverts à l’ouverture" }, { state: "nouveau", title: "Nouveaux dans l’exercice" }, { state: "clos", title: "Clos pendant l’exercice" }];
/** Register as cases in three lanes (open, new, closed) or as a dense table; every number comes from the server result. */
export const ProvisionRegister = forwardRef<ProvisionRegisterHandle, Props>(function ProvisionRegister({ result, filters, selected, onFilters, onOpen }, ref) {
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  useImperativeHandle(ref, () => ({ focusEvent: id => buttons.current.get(id)?.focus() }), []);
  const counts = useMemo(() => Object.fromEntries(KIND_ORDER.map(k => [k, result.events.filter(e => PV_STATUS_KIND[e.status] === k).length])) as Record<Kind, number>, [result]);
  const types = useMemo(() => [...new Set(result.events.map(e => e.type))], [result]);
  const visible = result.events.filter(e => (!filters.kinds.length || filters.kinds.includes(PV_STATUS_KIND[e.status])) && (!filters.type || e.type === filters.type) && (!filters.state || e.state === filters.state)
    && (!filters.q || (e.eventId + " " + e.label + " " + PV_TYPE_LABELS[e.type]).toLowerCase().includes(filters.q.toLowerCase())));
  const lit = (e: ProvisionEventResult) => !filters.focus || e.movements.some(m => m.kind === filters.focus);
  const toggle = (k: Kind) => onFilters({ ...filters, kinds: filters.kinds.includes(k) ? filters.kinds.filter(x => x !== k) : [...filters.kinds, k] });
  // The animation key changes with the question only: cases re-enter when the filters change, never on a mere refresh.
  const animationKey = JSON.stringify([filters.kinds, filters.type, filters.state, filters.q]);
  const tile = (e: ProvisionEventResult) => {
    const kind = PV_STATUS_KIND[e.status], booked = e.bridge?.computedClosing ?? null, estimate = e.retainedEstimateCents;
    const max = [booked, estimate].filter((x): x is string => x !== null).reduce((m, x) => abs(x) > m ? abs(x) : m, 0n), w = (x: string | null) => x === null || max === 0n ? 0 : Number((abs(x) * 10000n) / max) / 100;
    return <li key={e.eventId}>
      <button type="button" ref={el => { buttons.current.set(e.eventId, el); }} className={pv.tile} data-kind={kind} data-dim={!lit(e)} aria-pressed={selected === e.eventId} onClick={() => onOpen(e.eventId)}
        aria-label={e.eventId + " " + e.label + " — " + PV_STATUS_LABELS[e.status] + (e.estimateDifferenceCents && e.estimateDifferenceCents !== "0" ? ", différence " + formatCents(e.estimateDifferenceCents, { signed: true }) : "") + (e.confidential ? ", confidentiel" : "")}>
        <span className={pv.tileTop}><strong>{e.eventId}</strong><span className={pv.amount}>{headline(e)}</span></span>
        <small>{e.label}</small>
        <span className={pv.chips}><span className={pv.chip}>{PV_TYPE_LABELS[e.type]}</span><span className={pv.chip}>{PV_TREATMENT_LABELS[e.treatment].split(" (")[0].split(" — ")[0]}</span>{e.confidential && <span className={pv.lock}><Lock/>{e.masked ? "Masqué" : "Confidentiel"}</span>}</span>
        {(booked !== null || estimate !== null) && <span className={pv.mini} aria-hidden="true"><span style={{ width: w(booked) + "%" }}/>{estimate !== null && <span data-kind="estimate" style={{ width: w(estimate) + "%" }}/>}</span>}
        {e.estimateDifferenceCents && e.estimateDifferenceCents !== "0" && <small>Estimation − provision : <span className={pv.delta} data-sign={sign(e.estimateDifferenceCents)}>{formatCents(e.estimateDifferenceCents, { signed: true })}</span> à examiner</small>}
        {e.findings.length > 0 && <small>{e.findings.map(f => f.label).join(" · ")}</small>}
        <KindBadge status={e.status}/>
      </button></li>;
  };
  const excluded = visible.filter(e => !e.inScope);
  return <section className={styles.card} aria-labelledby="pv-register-title">
    <header><h2 id="pv-register-title">Registre des risques et engagements</h2><span className={styles.muted}>{plural(visible.length, "événement affiché", "événements affichés")} sur {result.events.length} · {plural(result.totals.noEntry, "sans écriture", "sans écriture")}</span></header>
    <div className={pv.kindBar} role="group" aria-label="Filtrer par nature d’écart">{KIND_ORDER.map(k => <button key={k} type="button" aria-pressed={filters.kinds.includes(k)} onClick={() => toggle(k)} disabled={!counts[k]}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">{ICONS[k]}</svg>{KIND_LABELS[k]} <strong>{counts[k]}</strong></button>)}</div>
    <div className={pv.toolbar}>
      <label>Type<select value={filters.type} onChange={ev => onFilters({ ...filters, type: ev.target.value })}><option value="">Tous les types</option>{types.map(t => <option key={t} value={t}>{PV_TYPE_LABELS[t]}</option>)}</select></label>
      <label>État<select value={filters.state} onChange={ev => onFilters({ ...filters, state: ev.target.value })}><option value="">Tous les états</option>{(["ouvert", "nouveau", "clos", "exclu"] as const).map(s => <option key={s} value={s}>{PV_STATE_LABELS[s]}</option>)}</select></label>
      <label>Événement ou libellé<input type="search" value={filters.q} onChange={ev => onFilters({ ...filters, q: ev.target.value })} placeholder="Ex. EV-01, garantie…"/></label>
      <span className={pv.views} role="group" aria-label="Présentation"><button type="button" aria-pressed={filters.view === "grid"} onClick={() => onFilters({ ...filters, view: "grid" })}>Cases</button><button type="button" aria-pressed={filters.view === "table"} onClick={() => onFilters({ ...filters, view: "table" })}>Tableau</button></span>
    </div>
    {filters.focus && <p className={styles.notice} data-tone="info">Mise en évidence : événements portant {filters.focus === "dotation" ? "une dotation" : filters.focus === "utilisation" ? "une utilisation" : "une reprise non utilisée"}. <button type="button" className={pv.link} onClick={() => onFilters({ ...filters, focus: "" })}>Retirer la mise en évidence</button></p>}
    {!visible.length && <p className={styles.muted} role="status">Aucun événement pour ces filtres. <button type="button" className={pv.link} onClick={() => onFilters({ ...filters, kinds: [], type: "", state: "", q: "" })}>Effacer les filtres</button></p>}
    {filters.view === "grid" ? <>
      <div className={pv.lanes} key={animationKey}>{LANES.map(l => { const list = visible.filter(e => e.state === l.state); return <section key={l.state} className={pv.lane} aria-label={l.title}>
        <div className={pv.laneHead}><h3>{l.title}</h3><span>{plural(list.length, "événement")}</span></div>
        {list.length ? <ul className={pv.cases}>{list.map(tile)}</ul> : <p className={styles.muted}>Aucun.</p>}</section>; })}</div>
      {excluded.length > 0 && <section className={pv.lane} style={{ marginTop: 12 }} aria-label="Hors population"><div className={pv.laneHead}><h3>Hors population (motif conservé)</h3><span>{plural(excluded.length, "événement")}</span></div><ul className={pv.cases}>{excluded.map(tile)}</ul></section>}
    </> : <div className={styles.tableScroll} role="region" aria-label="Tableau du registre — défilement clavier" tabIndex={0}><table className={pv.registerTable}>
      <caption>Montants en euros ; différence = estimation retenue − provision de clôture calculée (à examiner, jamais une anomalie validée). « Inconnu » : non établi, jamais zéro.</caption>
      <thead><tr><th scope="col">Événement</th><th scope="col">Type</th><th scope="col">État</th><th scope="col">Traitement retenu</th><th scope="col" className={pv.num}>Ouverture</th><th scope="col" className={pv.num}>Dotations</th><th scope="col" className={pv.num}>Utilisations</th><th scope="col" className={pv.num}>Reprises</th><th scope="col" className={pv.num}>Clôture calculée</th><th scope="col" className={pv.num}>Estimation retenue</th><th scope="col" className={pv.num}>Différence</th><th scope="col">Annexe</th><th scope="col">Statut</th></tr></thead>
      <tbody>{visible.map(e => <tr key={e.eventId} className={pv.rowKind} data-kind={PV_STATUS_KIND[e.status]} aria-selected={selected === e.eventId}>
        <td><button type="button" className={pv.link} onClick={() => onOpen(e.eventId)}>{e.eventId}</button><span className={pv.sub}>{e.label}{e.confidential ? " · confidentiel" : ""}</span></td><td>{PV_TYPE_LABELS[e.type]}</td><td>{PV_STATE_LABELS[e.state]}</td><td>{PV_TREATMENT_LABELS[e.treatment]}</td>
        {e.bridge ? <><td className={pv.num}>{formatCents(e.bridge.opening)}</td><td className={pv.num}>{formatCents(e.bridge.dotations)}</td><td className={pv.num}>{formatCents(e.bridge.utilisations)}</td><td className={pv.num}>{formatCents(e.bridge.reprises)}</td><td className={pv.num}>{formatCents(e.bridge.computedClosing)}</td></>
          : <td colSpan={5}>Sans écriture{e.commitmentCents !== null ? " — engagement " + formatCents(e.commitmentCents) : ""}</td>}
        <td className={pv.num}>{e.masked ? "Masqué" : e.retainedEstimateCents === null ? "—" : formatCents(e.retainedEstimateCents)}</td>
        <td className={pv.num}><span className={pv.delta} data-sign={sign(e.estimateDifferenceCents)}>{e.masked ? "Masqué" : e.estimateDifferenceCents === null ? "—" : formatCents(e.estimateDifferenceCents, { signed: true })}</span></td>
        <td>{({ not_provided: "Annexe non fournie", not_expected: "Non attendue", missing: "Absent", present: "Mentionné" } as const)[e.annex.status]}</td>
        <td><KindBadge status={e.status}/></td></tr>)}</tbody></table></div>}
    <ul className={pv.legend} aria-label="Légende">{KIND_ORDER.map(k => <li key={k} data-kind={k}><i aria-hidden="true"/>{KIND_LABELS[k]}</li>)}</ul>
  </section>;
});

/** Commitments and contingent liabilities without any entry: followed off balance sheet, compared with the annex only. */
export function NoEntryList({ result, onOpen }: { result: ProvisionResult; onOpen(eventId: string): void }) {
  const list = result.events.filter(e => e.inScope && !e.bridge);
  return <section className={styles.card} aria-labelledby="pv-noentry-title"><header><h2 id="pv-noentry-title">Engagements et passifs sans écriture</h2><span className={styles.muted}>{plural(list.length, "événement")} · comparés à l’annexe, jamais au grand livre</span></header>
    {list.length ? <ul className={pv.noEntry}>{list.map(e => <li key={e.eventId}><button type="button" className={pv.tile} data-kind={PV_STATUS_KIND[e.status]} onClick={() => onOpen(e.eventId)} aria-label={e.eventId + " " + e.label + " — sans écriture, " + PV_STATUS_LABELS[e.status]}>
      <span className={pv.tileTop}><strong>{e.eventId}</strong><span className={pv.amount}>{e.commitmentCents !== null ? formatCents(e.commitmentCents) : e.masked ? "Masqué" : e.retainedEstimateCents !== null ? "Estimé " + formatCents(e.retainedEstimateCents) : "Non chiffré"}</span></span>
      <small>{e.label} · {PV_TREATMENT_LABELS[e.treatment]}</small>
      <small>Annexe : {({ not_provided: "non fournie — comparaison non réalisée", not_expected: "non attendue", missing: "absent — à examiner", present: "mentionné" } as const)[e.annex.status]}</small>
      <KindBadge status={e.status}/></button></li>)}</ul> : <p className={styles.muted}>Aucun événement sans écriture dans l’exercice.</p>}
  </section>;
}
