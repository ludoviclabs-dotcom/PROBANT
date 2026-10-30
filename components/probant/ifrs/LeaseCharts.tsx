"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Money } from "@/lib/canonical-model/money";
import type { LeaseCharts as Charts } from "@/lib/ifrs/leases/portfolio";
import { dateFr, groupFr, monthFr, monthShort, moneyFr, plural, RESULT_LABELS, STATUS_LABELS } from "./format";
import { ChartFrame } from "./Primitives";
import s from "./ifrs.module.css";

/**
 * Graphiques du poste visuel (L16-04) : soldes de fin de mois (dette, droit d'utilisation net), loyers de l'exercice (principal et intérêts),
 * puis deux ponts distincts, dette et droit d'utilisation. Tous lisent `LeaseCharts`, établi par le serveur depuis les lignes de l'échéancier ;
 * chaque graphique a son tableau équivalent. Le navigateur ne convertit un montant en nombre que pour placer un point : tout chiffre écrit
 * vient de la chaîne serveur. Échelles depuis zéro, jamais tronquées ; la forme et le trait distinguent les séries, pas la seule couleur.
 */
const position = (m: Money) => Number(m.amount);

/** Largeur réelle du conteneur : le texte du graphique garde sa taille au lieu d'être réduit avec la figure. */
export function useWidth(initial: number) {
  const ref = useRef<HTMLDivElement>(null), [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
/** Échelle depuis zéro : borne arrondie à 1, 2, 2,5 ou 5 × 10^k, quatre ou cinq graduations. */
function zeroScale(max: number) {
  if (!(max > 0)) return { top: 1, ticks: [0] };
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(x => x >= raw)!;
  const top = step * Math.ceil(max / step - 1e-9);
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}
const tickFr = (v: number) => groupFr(String(Math.round(v))) + " €";

/** Fins de mois parcourues au clavier : une seule tabulation, flèches, Origine et Fin ; le focus sélectionne le mois. */
function useMonthKeys(count: number, onActive: (i: number) => void) {
  const refs = useRef<(SVGRectElement | null)[]>([]);
  const move = (i: number) => { const next = Math.max(0, Math.min(count - 1, i)); refs.current[next]?.focus(); onActive(next); };
  const onKey = (i: number) => (e: KeyboardEvent<SVGRectElement>) => {
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: count - 1 }[e.key];
    if (to !== undefined) { e.preventDefault(); move(to); } else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActive(i); }
  };
  return { refs, onKey };
}

const M = { l: 70, r: 14, t: 14, b: 30 }, H = 236;
function Axes({ width, top, ticks, labels, x }: { width: number; top: number; ticks: number[]; labels: { i: number; text: string }[]; x(i: number): number }) {
  const y = (v: number) => M.t + (H - M.t - M.b) * (1 - v / top);
  return <g className={s.axis} aria-hidden="true">
    {ticks.map(t => <g key={t}><line x1={M.l} x2={width - M.r} y1={y(t)} y2={y(t)} data-zero={t === 0 || undefined}/><text x={M.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">{tickFr(t)}</text></g>)}
    {labels.map(l => <text key={l.i} x={x(l.i)} y={H - 8} textAnchor="middle">{l.text}</text>)}
  </g>;
}

/** Dette locative et droit d'utilisation net en fin de mois, ouverture comprise. */
function BalanceChart({ charts, active, onActive }: { charts: Charts; active: number; onActive(i: number): void }) {
  const [ref, width] = useWidth(640);
  const series = [{ date: charts.opening.date, debt: charts.opening.debt, rouNet: charts.opening.rouNet }, ...charts.points];
  const { top, ticks } = zeroScale(Math.max(...series.flatMap(p => [position(p.debt), position(p.rouNet)])));
  const n = series.length, pw = width - M.l - M.r, ph = H - M.t - M.b;
  const x = (i: number) => M.l + (n > 1 ? (i * pw) / (n - 1) : pw / 2), y = (m: Money) => M.t + ph * (1 - position(m) / top);
  const line = (k: "debt" | "rouNet") => series.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[k]).toFixed(1)).join(" ");
  const every = Math.max(1, Math.ceil((n * 46) / pw)), keys = useMonthKeys(charts.points.length, onActive);
  const labels = series.map((p, i) => ({ i, text: i === 0 ? "ouv." : monthShort(p.date) })).filter(l => l.i % every === 0 || l.i === n - 1);
  const band = n > 1 ? pw / (n - 1) : pw;
  return <div ref={ref} className={s.chart}>
    <svg width={width} height={H} role="group" aria-label="Soldes de fin de mois : dette locative (trait plein, ronds) et droit d'utilisation net (tirets, carrés). Flèches gauche et droite pour parcourir les mois.">
      <Axes width={width} top={top} ticks={ticks} labels={labels} x={x}/>
      <line className={s.cursor} x1={x(active + 1)} x2={x(active + 1)} y1={M.t} y2={H - M.b} aria-hidden="true"/>
      <path d={line("debt")} className={s.seriesDebt} aria-hidden="true"/>
      <path d={line("rouNet")} className={s.seriesRou} aria-hidden="true"/>
      <g aria-hidden="true">{series.map((p, i) => <g key={p.date}><circle cx={x(i)} cy={y(p.debt)} r={i === active + 1 ? 4.5 : 3} className={s.markDebt}/>
        <rect x={x(i) - 3} y={y(p.rouNet) - 3} width={6} height={6} className={s.markRou}/></g>)}</g>
      {charts.points.map((p, i) => <rect key={p.date} ref={el => { keys.refs.current[i] = el; }} className={s.hit} role="button" tabIndex={i === active ? 0 : -1} aria-pressed={i === active}
        aria-label={"Fin " + monthFr(p.date) + " : dette " + moneyFr(p.debt) + ", droit d'utilisation net " + moneyFr(p.rouNet)}
        x={x(i + 1) - band / 2} y={M.t} width={band} height={ph} onClick={() => onActive(i)} onFocus={() => onActive(i)} onKeyDown={keys.onKey(i)}/>)}
    </svg>
    <ul className={s.legend} aria-hidden="true"><li data-series="debt">Dette locative</li><li data-series="rou">Droit d'utilisation net</li></ul>
    <p className={s.readout} aria-live="polite"><strong>Fin {monthFr(charts.points[active].date)}</strong> · dette {moneyFr(charts.points[active].debt)} · droit d'utilisation net {moneyFr(charts.points[active].rouNet)}</p>
  </div>;
}

/** Loyers de chaque échéance de l'exercice, partagés entre principal (plein) et intérêts (hachuré). */
function FlowChart({ charts, active, onActive }: { charts: Charts; active: number; onActive(i: number): void }) {
  const [ref, width] = useWidth(640), hatch = "l16-hatch-" + useId().replace(/:/g, "");
  const { top, ticks } = zeroScale(Math.max(...charts.points.map(p => position(p.payments))));
  const n = charts.points.length, pw = width - M.l - M.r, ph = H - M.t - M.b, band = pw / n, bar = Math.max(4, Math.min(28, band * 0.6));
  const x = (i: number) => M.l + band * (i + 0.5), h = (m: Money) => ph * position(m) / top;
  const every = Math.max(1, Math.ceil(42 / band)), keys = useMonthKeys(n, onActive);
  const labels = charts.points.map((p, i) => ({ i, text: monthShort(p.date) })).filter(l => l.i % every === 0);
  const p = charts.points[active];
  return <div ref={ref} className={s.chart}>
    <svg width={width} height={H} role="group" aria-label="Loyers de l'exercice par échéance : principal (plein) et intérêts (hachuré). Flèches gauche et droite pour parcourir les mois.">
      <defs><pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" className={s.hatchBack}/><line x1="0" y1="0" x2="0" y2="6" className={s.hatchLine}/></pattern></defs>
      <Axes width={width} top={top} ticks={ticks} labels={labels} x={x}/>
      <g aria-hidden="true">{charts.points.map((q, i) => { const base = M.t + ph, hp = h(q.principal), hi = h(q.interest);
        return <g key={q.date} data-active={i === active || undefined}><rect x={x(i) - bar / 2} y={base - hp} width={bar} height={hp} className={s.barPrincipal}/>
          <rect x={x(i) - bar / 2} y={base - hp - hi} width={bar} height={hi} fill={"url(#" + hatch + ")"} className={s.barInterest}/></g>; })}</g>
      {charts.points.map((q, i) => <rect key={q.date} ref={el => { keys.refs.current[i] = el; }} className={s.hit} role="button" tabIndex={i === active ? 0 : -1} aria-pressed={i === active}
        aria-label={"Échéance " + monthFr(q.date) + " : loyer " + moneyFr(q.payments) + ", principal " + moneyFr(q.principal) + ", intérêts " + moneyFr(q.interest)}
        x={x(i) - band / 2} y={M.t} width={band} height={ph} onClick={() => onActive(i)} onFocus={() => onActive(i)} onKeyDown={keys.onKey(i)}/>)}
    </svg>
    <ul className={s.legend} aria-hidden="true"><li data-series="principal">Principal</li><li data-series="interest">Intérêts</li></ul>
    <p className={s.readout} aria-live="polite"><strong>Échéance {monthFr(p.date)}</strong> · loyer {moneyFr(p.payments)} = principal {moneyFr(p.principal)} + intérêts {moneyFr(p.interest)}</p>
  </div>;
}

type Step = { label: string; amount: Money; kind: "total" | "up" | "down" };
/** Pont horizontal : une ligne par mouvement, du solde d'ouverture au solde de clôture ; les sorties ne sont jamais des largeurs négatives. */
function Bridge({ steps, series, label }: { steps: Step[]; series: "debt" | "rou"; label: string }) {
  const [ref, width] = useWidth(640), row = 30, top = 6, lw = Math.min(150, width * 0.34), vw = 112, pw = Math.max(40, width - lw - vw - 12);
  let run = 0;
  const bars = steps.map(st => { const v = position(st.amount), from = st.kind === "total" ? 0 : st.kind === "up" ? run : run - v, to = st.kind === "total" ? v : st.kind === "up" ? run + v : run;
    run = st.kind === "total" ? v : st.kind === "up" ? run + v : run - v; return { ...st, from, to }; });
  const max = Math.max(...bars.map(b => b.to)), x = (v: number) => lw + (max > 0 ? (v / max) * pw : 0), height = top * 2 + row * steps.length;
  return <div ref={ref} className={s.chart}>
    <svg width={width} height={height} role="img" aria-label={label}>
      <line x1={x(0)} x2={x(0)} y1={0} y2={height} className={s.zeroRule}/>
      {bars.map((b, i) => { const y = top + i * row;
        return <g key={b.label}>
          <text x={0} y={y + row / 2} dominantBaseline="middle" className={s.bridgeLabel}>{b.label}</text>
          <rect x={x(b.from)} y={y + 6} width={Math.max(1, x(b.to) - x(b.from))} height={row - 12} className={s.bridgeBar} data-series={series} data-kind={b.kind}/>
          <text x={width} y={y + row / 2} dominantBaseline="middle" textAnchor="end" className={s.bridgeValue}>{(b.kind === "up" ? "+ " : b.kind === "down" ? "− " : "") + moneyFr(b.amount)}</text>
        </g>; })}
    </svg>
  </div>;
}

function Table({ caption, head, rows, foot, label, selected }: { caption: string; head: string[]; rows: ReactNode[][]; foot?: ReactNode[]; label: string; selected?: number }) {
  return <div className={s.scroll} role="region" aria-label={label + " — défilement horizontal au clavier"} tabIndex={0}>
    <table className={s.table} style={{ minWidth: 480 }}><caption>{caption}</caption>
      <thead><tr>{head.map((h, i) => <th key={h} scope="col" className={i ? s.money : undefined}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} aria-selected={selected === i || undefined}>{r.map((c, j) => j ? <td key={j} className={s.money}>{c}</td> : <th key={j} scope="row">{c}</th>)}</tr>)}</tbody>
      {foot && <tfoot><tr>{foot.map((c, j) => j ? <td key={j} className={s.money}>{c}</td> : <th key={j} scope="row">{c}</th>)}</tr></tfoot>}
    </table>
  </div>;
}

/** Périmètre écrit de chaque graphique : population calculée, contrats exclus et motif ; « partiel » dès qu'un contrat bloqué manque. */
function scopeText(charts: Charts) {
  const excluded = charts.excluded.map(e => e.contractId + " (" + (e.result === "not_applicable" ? STATUS_LABELS[e.status].toLowerCase() : RESULT_LABELS[e.result]) + ")");
  return "Euros, même population pour chaque série : " + plural(charts.contracts.length, "contrat calculé", "contrats calculés") + " (" + charts.contracts.join(", ") + ")."
    + (excluded.length ? " Exclus : " + excluded.join(", ") + "." : "") + (charts.partial ? " Portefeuille partiel : des contrats bloqués n'y figurent pas." : "");
}

export function LeaseChartsPanel({ charts, empty }: { charts: Charts | null; empty: string }) {
  const [active, setActive] = useState(0);
  if (!charts) return <ChartFrame title="Dette et droit d'utilisation par fin de mois" scope="Contrats calculés seulement." empty={empty}/>;
  const scope = scopeText(charts), same = "Même population que le premier graphique : " + plural(charts.contracts.length, "contrat calculé", "contrats calculés") + (charts.partial ? ", portefeuille partiel." : "."), month = Math.min(active, charts.points.length - 1), d = charts.debtBridge, r = charts.rouBridge;
  const debtSteps: Step[] = [{ label: "Dette d'ouverture", amount: d.opening, kind: "total" }, { label: "Entrées", amount: d.additions, kind: "up" }, { label: "Intérêts", amount: d.interest, kind: "up" },
    { label: "Loyers payés", amount: d.payments, kind: "down" }, { label: "Dette de clôture", amount: d.closing, kind: "total" }];
  const rouSteps: Step[] = [{ label: "DU net d'ouverture", amount: r.opening, kind: "total" }, { label: "Entrées", amount: r.additions, kind: "up" }, { label: "Dotation", amount: r.depreciation, kind: "down" },
    { label: "DU net de clôture", amount: r.closing, kind: "total" }];
  const signed = (st: Step) => (st.kind === "up" ? "+ " : st.kind === "down" ? "− " : "") + moneyFr(st.amount);
  return <>
    <ChartFrame title="Dette et droit d'utilisation net par fin de mois" scope={scope}
      chart={<BalanceChart charts={charts} active={month} onActive={setActive}/>}
      table={<Table label="Soldes de fin de mois" caption={"Ouverture au " + dateFr(charts.opening.date) + ", puis chaque fin de mois de l'exercice ; mêmes lignes que l'échéancier."} head={["Fin de mois", "Dette locative", "Droit d'utilisation net"]}
        rows={[["Ouverture (" + dateFr(charts.opening.date) + ")", moneyFr(charts.opening.debt), moneyFr(charts.opening.rouNet)], ...charts.points.map(p => [dateFr(p.date), moneyFr(p.debt), moneyFr(p.rouNet)])]} selected={month + 1}/>}/>
    <ChartFrame title="Loyers de l'exercice : principal et intérêts" scope={same + " Les loyers payés ne sont pas la charge de la période : la charge comprend les intérêts et la dotation."}
      chart={<FlowChart charts={charts} active={month} onActive={setActive}/>}
      table={<Table label="Loyers par échéance" caption="Une ligne par échéance de l'exercice ; le principal réduit la dette, les intérêts l'augmentent." head={["Échéance", "Loyer", "Principal", "Intérêts"]}
        rows={charts.points.map(p => [dateFr(p.date), moneyFr(p.payments), moneyFr(p.principal), moneyFr(p.interest)])} selected={month}
        foot={["Exercice", moneyFr(charts.flows.payments), moneyFr(charts.flows.principal), moneyFr(charts.flows.interest)]}/>}/>
    <ChartFrame title="Pont de la dette locative" scope={same}
      chart={<Bridge series="debt" steps={debtSteps} label={"Pont de la dette : " + debtSteps.map(st => st.label + " " + signed(st)).join(", ")}/>}
      table={<Table label="Pont de la dette" caption="Ouverture + entrées + intérêts − loyers payés = clôture ; contrôlé au centime par le serveur." head={["Mouvement", "Montant"]} rows={debtSteps.map(st => [st.label, signed(st)])}/>}/>
    <ChartFrame title="Pont du droit d'utilisation net" scope={same + " Montré à part : ses mouvements ne se mêlent jamais à ceux de la dette."}
      chart={<Bridge series="rou" steps={rouSteps} label={"Pont du droit d'utilisation : " + rouSteps.map(st => st.label + " " + signed(st)).join(", ")}/>}
      table={<Table label="Pont du droit d'utilisation" caption="Ouverture nette + entrées − dotation = clôture nette ; contrôlé au centime par le serveur." head={["Mouvement", "Montant"]} rows={rouSteps.map(st => [st.label, signed(st)])}/>}/>
  </>;
}
