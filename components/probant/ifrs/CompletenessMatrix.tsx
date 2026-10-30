"use client";
import { useMemo } from "react";
import type { LeaseQualification, QualifiedContract } from "@/lib/ifrs/leases/qualification";
import { CELL_GLYPH, CELL_LABELS, cellState, MATRIX_COLUMNS, reasonColumn, STATUS_GLYPH, STATUS_LABELS, plural, type MatrixColumn } from "./format";
import { FILTERS, type LeaseFilter } from "./selection-url";
import s from "./ifrs.module.css";
export type { LeaseFilter };

export function applyFilter(contracts: QualifiedContract[], filter: LeaseFilter) {
  if (filter === "all") return contracts;
  if (filter === "a_qualifier" || filter === "hors_scope_v1") return contracts.filter(c => c.status === filter);
  if (filter === "exemption") return contracts.filter(c => c.status === "exemption_documentee");
  if (filter === "rate") return contracts.filter(c => c.reasons.some(r => reasonColumn(r) === "rate" && r.effect === "a_qualifier"));
  const code = filter.slice(5);
  return contracts.filter(c => c.reasons.some(r => r.code === code));
}

/**
 * Matrice de complétude (charte § 3) : lignes = contrats, colonnes = qualification. Chaque cellule porte un libellé et une forme ;
 * « à compléter », « non applicable » et « confirmé » restent distincts, et le statut agrégé n'est pas une moyenne.
 * Cliquer une cellule ou un contrat ouvre l'inspecteur sur ce contrat ; le focus y revient à la fermeture.
 */
export function CompletenessMatrix({ qualification, filter, selected, onFilter, onOpen }: { qualification: LeaseQualification; filter: LeaseFilter; selected: string | null;
  onFilter(f: LeaseFilter): void; onOpen(contractId: string, column: MatrixColumn | null, trigger: HTMLElement): void }) {
  const rows = useMemo(() => applyFilter(qualification.contracts, filter), [qualification, filter]);
  const codes = useMemo(() => {
    const counts = new Map<string, { count: number; message: string }>();
    for (const c of qualification.contracts) for (const r of c.reasons) if (r.effect !== "info" && r.effect !== "exemption" && r.effect !== "non_location") counts.set(r.code, { count: (counts.get(r.code)?.count ?? 0) + 1, message: counts.get(r.code)?.message ?? r.message });
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1));
  }, [qualification]);
  const { registry, ledger } = qualification.coverage;
  return <section className={s.section} aria-labelledby="l16-matrix-title">
    <div className={s.sectionHead}><h2 id="l16-matrix-title">Matrice de complétude</h2>
      <span className={s.muted}>{plural(registry.contracts, "contrat")} du registre fourni · {registry.byStatus.eligible_v1} calculable(s) sur ce périmètre · {registry.byStatus.a_qualifier} à compléter</span></div>
    <div className={s.filters} role="group" aria-label="Filtrer l'affichage">
      {FILTERS.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => onFilter(f.id)}>{f.label}</button>)}
      {filter.startsWith("code:") && <button type="button" aria-pressed="true" onClick={() => onFilter("all")}>Motif {filter.slice(5)} · retirer</button>}
    </div>
    <p className={s.muted} role="status" aria-live="polite">{rows.length === qualification.contracts.length ? "Affichage : tous les contrats" : "Affichage filtré : " + plural(rows.length, "contrat") + " sur " + qualification.contracts.length + " — la population figée et l'export ne changent pas"}</p>
    {rows.length === 0 ? <p className={s.muted}>Aucun contrat pour ce filtre.</p> :
      <div className={s.scroll} role="region" aria-label="Matrice de complétude — défilement horizontal au clavier" tabIndex={0}>
        <table className={s.table}>
          <caption>Une ligne par contrat ; une cellule par famille de réponses. ✓ confirmé · △ à compléter · × hors V1 · — non applicable · ◇ documenté.</caption>
          <thead><tr><th scope="col">Contrat</th><th scope="col">Statut</th>{MATRIX_COLUMNS.map(c => <th key={c.id} scope="col">{c.label}</th>)}</tr></thead>
          <tbody>{rows.map(c => <tr key={c.contractId} aria-selected={selected === c.contractId}>
            <th scope="row" className={s.rowHead}><button type="button" onClick={e => onOpen(c.contractId, null, e.currentTarget)}>{c.contractId}</button>
              <div className={s.muted}>{c.assetCategory ?? "catégorie non renseignée"}</div></th>
            <td><span className={s.status} data-status={c.status}><span aria-hidden="true">{STATUS_GLYPH[c.status]}</span>{STATUS_LABELS[c.status]}</span></td>
            {MATRIX_COLUMNS.map(col => { const state = cellState(c, col.id);
              return <td key={col.id}><button type="button" className={s.cell} data-cell={state} aria-label={c.contractId + " · " + col.label + " : " + CELL_LABELS[state]} onClick={e => onOpen(c.contractId, col.id, e.currentTarget)}>
                <span aria-hidden="true">{CELL_GLYPH[state]}</span>{CELL_LABELS[state]}</button></td>; })}
          </tr>)}</tbody>
        </table>
      </div>}
    <h3>Motifs relevés</h3>
    {codes.length === 0 ? <p className={s.muted}>Aucun motif de qualification sur ce registre.</p> :
      <ul className={s.reasons}>{codes.map(([code, v]) => <li key={code}><button type="button" aria-pressed={filter === "code:" + code} onClick={() => onFilter(("code:" + code) as LeaseFilter)}>{code} · {v.count}</button><span>{v.message}</span></li>)}</ul>}
    <h3>Couverture</h3>
    <dl className={s.kv}>
      <dt>Registre fourni</dt><dd>{plural(registry.contracts, "contrat")} : {Object.entries(registry.byStatus).filter(([, n]) => n).map(([k, n]) => n + " · " + STATUS_LABELS[k as keyof typeof STATUS_LABELS]).join(" · ") || "aucun"}</dd>
      <dt>Population comptable fournie</dt><dd>{plural(ledger.lines, "ligne")} · {ledger.matched} rattachée(s) à un contrat · {ledger.unmatched} non rattachée(s){ledger.unknownContracts.length ? " (contrats inconnus : " + ledger.unknownContracts.join(", ") + ")" : ""}</dd>
      <dt>Lignes orphelines</dt><dd>{qualification.orphans.length ? plural(qualification.orphans.length, "ligne") + " sans contrat du registre, conservée(s), jamais appariée(s)" : "aucune"}</dd>
    </dl>
    <p className={s.muted}>Ces dénominateurs portent sur les sources fournies : ils ne prouvent pas l'exhaustivité des contrats de l'entité.</p>
  </section>;
}
