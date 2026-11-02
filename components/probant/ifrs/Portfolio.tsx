"use client";
import { useMemo, useState } from "react";
import { cents } from "@/lib/canonical-model/money";
import type { PortfolioRow, PortfolioSummary, VersionComparison } from "@/lib/ifrs/leases/portfolio";
import { ADJUSTMENT_LABELS, dateFr, FRAMING_LABELS, moneyFr, plural, rateFr, RESULT_LABELS, REVIEW_LABELS, STATUS_GLYPH, STATUS_LABELS } from "./format";
import { Pager } from "./Primitives";
import s from "./ifrs.module.css";

/**
 * Portefeuille du poste visuel (L16-04) : une ligne de synthèse plutôt qu'une grille de chiffres clés, la table des contrats (recherche, tri,
 * pagination : jamais tout le registre monté dans le DOM) et la comparaison de deux versions exécutées. Tout vient de la vue serveur.
 */
export function SummaryLine({ summary }: { summary: PortfolioSummary }) {
  const parts = [plural(summary.registry, "contrat") + " au registre fourni", summary.calculable + " calculable(s) sur ce périmètre",
    summary.excluded.count ? summary.excluded.count + " exclu(s) avec motif (" + summary.excluded.byStatus.map(e => e.count + " " + STATUS_LABELS[e.status].toLowerCase()).join(", ") + ")" : "aucun exclu",
    summary.toQualify + " à compléter"];
  if (summary.results) parts.push("calcul : " + summary.results.computed + " calculé(s), " + summary.results.diagnostic + " en diagnostic" + (summary.results.not_commenced ? ", " + summary.results.not_commenced + " non commencé(s)" : ""));
  const a = summary.amounts;
  return <p className={s.summary} aria-label="Synthèse du portefeuille">
    {parts.join(" · ")}
    {a ? <> · <span>dette à la clôture <strong className={s.money}>{moneyFr(a.debtClosing)}</strong>, droit d'utilisation net <strong className={s.money}>{moneyFr(a.rouNetClosing)}</strong> sur {plural(a.contracts, "contrat calculé", "contrats calculés")}</span>
      {a.partial && <span className={s.partial}> — montants partiels : {plural(a.blocked.length, "contrat bloqué exclu", "contrats bloqués exclus")} ({a.blocked.join(", ")})</span>}</>
      : <> · aucun montant : feuille non calculée</>}
  </p>;
}

type SortKey = "contract" | "debt" | "rou";
const PAGE = 25;
const amountKey = (m: PortfolioRow["debtClosing"]) => m ? cents(m) : null;

export function PortfolioTable({ rows, selected, onOpen }: { rows: PortfolioRow[]; selected: string | null; onOpen(contractId: string, trigger: HTMLElement): void }) {
  const [query, setQuery] = useState(""), [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "contract", dir: 1 }), [page, setPage] = useState(0);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q ? rows.filter(r => [r.contractId, r.lessor ?? "", r.assetCategory ?? ""].some(v => v.toLowerCase().includes(q))) : rows;
    // Unknown amounts sort last in both directions: an absent figure is never ranked as a zero.
    const cmp = (a: PortfolioRow, b: PortfolioRow) => {
      if (sort.key === "contract") return sort.dir * (a.contractId < b.contractId ? -1 : a.contractId > b.contractId ? 1 : 0);
      const ka = amountKey(sort.key === "debt" ? a.debtClosing : a.rouNetClosing), kb = amountKey(sort.key === "debt" ? b.debtClosing : b.rouNetClosing);
      if (ka === null || kb === null) return ka === kb ? 0 : ka === null ? 1 : -1;
      return sort.dir * (ka < kb ? -1 : ka > kb ? 1 : 0);
    };
    return [...found].sort(cmp);
  }, [rows, query, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)), current = Math.min(page, pages - 1), slice = shown.slice(current * PAGE, current * PAGE + PAGE);
  const header = (key: SortKey, label: string, money = false) => <th scope="col" className={money ? s.money : undefined} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
    <button type="button" className={s.sortButton} onClick={() => { setSort(p => ({ key, dir: p.key === key ? (p.dir === 1 ? -1 : 1) : 1 })); setPage(0); }}>{label}<span aria-hidden="true">{sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</span></button></th>;
  return <>
    <div className={s.tableTools}>
      <label>Rechercher un contrat, un bailleur ou une catégorie<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/></label>
      <p className={s.muted} role="status" aria-live="polite">{shown.length === rows.length ? plural(rows.length, "contrat") : "Recherche : " + plural(shown.length, "contrat") + " sur " + rows.length + " — la population figée ne change pas"}</p>
    </div>
    {shown.length === 0 ? <p className={s.muted}>Aucun contrat pour cette recherche.</p> :
      <div className={s.scroll} role="region" aria-label="Table du portefeuille — défilement horizontal au clavier" tabIndex={0}>
        <table className={s.table} style={{ minWidth: 1080 }}>
          <caption>Une ligne par contrat ; termes qualifiés, chiffres du moteur à la clôture, cadrage PCG et points de revue. « — » : pas de chiffre déterminé.</caption>
          <thead><tr>{header("contract", "Contrat")}<th scope="col">Bailleur</th><th scope="col">Échéances</th><th scope="col" className={s.money}>Loyer mensuel</th><th scope="col" className={s.money}>Taux qualifié</th>
            <th scope="col">Statut</th>{header("debt", "Dette à la clôture", true)}{header("rou", "DU net à la clôture", true)}<th scope="col">Cadrage PCG</th><th scope="col">Revue</th></tr></thead>
          <tbody>{slice.map(r => <tr key={r.contractId} aria-selected={selected === r.contractId}>
            <th scope="row" className={s.rowHead}><button type="button" onClick={e => onOpen(r.contractId, e.currentTarget)}>{r.contractId}</button><div className={s.muted}>{r.assetCategory ?? "catégorie non renseignée"}</div></th>
            <td>{r.lessor ?? "non renseigné"}</td>
            <td className={s.nowrap}>{r.commencement && r.lastDue ? dateFr(r.commencement) + " → " + dateFr(r.lastDue) : "—"}{r.months ? <div className={s.muted}>{r.months} mois</div> : null}</td>
            <td className={s.money}>{moneyFr(r.payment)}</td><td className={s.money}>{rateFr(r.annualRate)}</td>
            <td><span className={s.status} data-status={r.status}><span aria-hidden="true">{STATUS_GLYPH[r.status]}</span>{STATUS_LABELS[r.status]}</span>{r.result && <div className={s.muted}>{RESULT_LABELS[r.result]}</div>}</td>
            <td className={s.money}>{moneyFr(r.debtClosing)}</td><td className={s.money}>{moneyFr(r.rouNetClosing)}</td>
            <td>{r.framing ? <span className={s.status} data-framing={r.framing}>{FRAMING_LABELS[r.framing]}</span> : "—"}{r.adjustment && r.adjustment !== "not_applicable" && <div className={s.muted}>retraitement : {ADJUSTMENT_LABELS[r.adjustment]}</div>}</td>
            <td>{r.review ? REVIEW_LABELS[r.review] : "avant calcul"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    <Pager page={current} pages={pages} total={shown.length} size={PAGE} label="Pages du portefeuille" onPage={setPage}/>
  </>;
}

export function ComparisonPanel({ comparison }: { comparison: VersionComparison }) {
  const { previous: p, current: c } = comparison;
  return <>
    <p className={s.muted}>Révision r{p.revision} · v{p.version} (antérieure) comparée à r{c.revision} · v{c.version} (courante), deux versions exécutées et figées.</p>
    <div className={s.scroll} role="region" aria-label="Comparaison de versions — défilement horizontal au clavier" tabIndex={0}>
      <table className={s.table} style={{ minWidth: 880 }}><caption>Montant antérieur, courant et écart ; faits observés dans les versions figées, sans attribution d'effet.</caption>
        <thead><tr><th scope="col">Contrat</th><th scope="col" className={s.money}>Dette antérieure</th><th scope="col" className={s.money}>Dette courante</th><th scope="col" className={s.money}>Écart</th>
          <th scope="col" className={s.money}>DU net antérieur</th><th scope="col" className={s.money}>DU net courant</th><th scope="col" className={s.money}>Écart</th><th scope="col">Faits observés</th></tr></thead>
        <tbody>{comparison.rows.map(r => <tr key={r.contractId}><th scope="row" className={s.mono}>{r.contractId}</th>
          <td className={s.money}>{moneyFr(r.previous?.debtClosing)}</td><td className={s.money}>{moneyFr(r.current?.debtClosing)}</td><td className={s.money}>{r.delta ? moneyFr(r.delta.debtClosing) : "—"}</td>
          <td className={s.money}>{moneyFr(r.previous?.rouNetClosing)}</td><td className={s.money}>{moneyFr(r.current?.rouNetClosing)}</td><td className={s.money}>{r.delta ? moneyFr(r.delta.rouNetClosing) : "—"}</td>
          <td>{r.changes.length ? r.changes.join(" ; ") : "aucun changement observé"}</td></tr>)}</tbody>
      </table>
    </div>
    <ul className={s.limits}>{comparison.limits.map(l => <li key={l}>{l}</li>)}</ul>
  </>;
}
