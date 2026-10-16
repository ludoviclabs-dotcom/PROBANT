"use client";

import { useState } from "react";
import { FamilyRule } from "@/components/charte/FamilyRule";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { SEVERITY_LABEL, type FindingFamily, type Severity } from "@/lib/canonical-model/finding";
import { formatEuroCents } from "@/lib/format/fr";
import { FAMILY_ORDER, FAMILY_TEXT, SEVERITIES, plural, type CloisonDef } from "@/lib/synthese-view/common";
import { applyJournal, type JournalFilter, type JournalRow } from "@/lib/synthese-view/journal";
import { REVIEW_WORD } from "@/lib/synthese-view/review";
import type { CrossFilter } from "./filter";
import s from "./synthese.module.css";

const PAGE = 50;

/**
 * Journal des constats : le registre dense, une ligne par constat, glyphe + mot (jamais la teinte seule). Filtres
 * textuels soulignés (gravité, famille, cloison), tri par gravité ou par effet chiffré, recherche. Les filtres de
 * gravité et de cloison sont ceux du filtre croisé de la section Analyse : ils restent synchronisés. Un clic sur une
 * ligne ouvre la chaîne de preuve du constat.
 */
export function FindingRegister({
  rows,
  clos,
  filter,
  onFilter,
  selectedId,
  onOpenChain,
}: {
  rows: readonly JournalRow[];
  clos: readonly CloisonDef[];
  filter: CrossFilter;
  onFilter: (next: CrossFilter) => void;
  selectedId: string | null;
  onOpenChain: (id: string) => void;
}) {
  const [family, setFamily] = useState<FindingFamily | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<JournalFilter["sort"]>("gravite");
  const [limit, setLimit] = useState(PAGE);
  const filtered = applyJournal(rows, { cloison: filter.clo, severity: filter.sev, family, query, sort });
  const shown = filtered.slice(0, limit);
  const reset = () => {
    onFilter({ clo: null, sev: null });
    setFamily(null);
    setQuery("");
  };
  const option = (label: string, on: boolean, onClick: () => void) => (
    <button key={label} type="button" aria-pressed={on} className={s.textToggle} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div id="journal" className={s.journal}>
      <div className={s.journalControls}>
        <span className={s.filterRow}>
          <span className={s.filterRowKey}>Gravité</span>
          {option("toutes", !filter.sev, () => onFilter({ ...filter, sev: null }))}
          {SEVERITIES.map((sev: Severity) => option(SEVERITY_LABEL[sev].toLowerCase(), filter.sev === sev, () => onFilter({ ...filter, sev: filter.sev === sev ? null : sev })))}
        </span>
        <span className={s.filterRow}>
          <span className={s.filterRowKey}>Famille</span>
          {option("toutes", !family, () => setFamily(null))}
          {FAMILY_ORDER.map((f) => option(FAMILY_TEXT[f].label.toLowerCase(), family === f, () => setFamily(family === f ? null : f)))}
        </span>
        <span className={s.filterRow}>
          <span className={s.filterRowKey}>Cloison</span>
          {option("toutes", !filter.clo, () => onFilter({ ...filter, clo: null }))}
          {clos.map((c) => option(c.short.toLowerCase(), filter.clo === c.id, () => onFilter({ ...filter, clo: filter.clo === c.id ? null : c.id })))}
        </span>
        <span className={s.filterRow}>
          <span className={s.filterRowKey}>Tri</span>
          {option("gravité", sort === "gravite", () => setSort("gravite"))}
          {option("effet chiffré", sort === "effet", () => setSort("effet"))}
        </span>
        <label className={s.searchField}>
          <span className={s.filterRowKey}>Rechercher</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="compte, intitulé, référence" />
        </label>
      </div>
      <p aria-live="polite" className={s.journalCount}>
        {filtered.length} {plural(filtered.length, "constat affiché", "constats affichés")} sur {rows.length}
      </p>
      <div role="region" aria-label="Journal des constats, défilement horizontal" tabIndex={0} className={s.scrollX}>
        <table className={s.journalTable}>
          <thead>
            <tr>
              <th scope="col">Gravité</th>
              <th scope="col">Réf.</th>
              <th scope="col">Cloison</th>
              <th scope="col">Cycle</th>
              <th scope="col">Comptes</th>
              <th scope="col">Constat</th>
              <th scope="col" className={s.alignRight}>Effet chiffré</th>
              <th scope="col">Famille</th>
              <th scope="col">Revue</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} className={s.journalRow} data-selected={selectedId === row.id ? "" : undefined} onClick={() => onOpenChain(row.id)}>
                <td className={s.nowrap}>
                  <span className={s.inlineMark}>
                    <SeverityGlyph severity={row.severity} />
                    {SEVERITY_LABEL[row.severity]}
                  </span>
                </td>
                <td className={s.nowrap}>
                  <button type="button" className={s.refButton} onClick={(event) => { event.stopPropagation(); onOpenChain(row.id); }}>{row.id}</button>
                </td>
                <td className={`${s.nowrap} ${s.soft}`}>{row.cloisonShort}</td>
                <td className={`${s.nowrap} ${s.soft}`}>{row.cycle ?? "—"}</td>
                <td className={`${s.nowrap} ${s.mono} ${s.soft}`}>{row.accounts || "—"}</td>
                <td className={s.titleCell}>{row.title}</td>
                <td className={`${s.nowrap} ${s.mono} ${s.alignRight}`} data-none={row.effectCents === null ? "" : undefined}>{row.effectCents === null ? "—" : formatEuroCents(row.effectCents, { sign: true })}</td>
                <td className={s.nowrap}>
                  <span className={`${s.inlineMark} ${s.soft}`}>
                    <FamilyRule family={row.family} />
                    {FAMILY_TEXT[row.family].label}
                  </span>
                </td>
                <td className={s.nowrap} data-validated={row.stage === "proposed" || row.stage === "corrected" ? "" : undefined}>{REVIEW_WORD[row.stage]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <button type="button" className={s.underlineToggle} onClick={() => setLimit((n) => n + PAGE)}>
          Afficher {Math.min(PAGE, filtered.length - limit)} constats de plus ({filtered.length - limit} {plural(filtered.length - limit, "restant")})
        </button>
      )}
      {filtered.length === 0 && (
        <p className={s.emptyNote}>
          Aucun constat ne correspond à ces filtres.{" "}
          <button type="button" className={s.linkButton} onClick={reset}>
            Réinitialiser
          </button>
        </p>
      )}
    </div>
  );
}
