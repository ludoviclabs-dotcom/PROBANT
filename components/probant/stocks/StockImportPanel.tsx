"use client";
import { useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { StockMapping } from "@/lib/workpapers/stock-sources";
import { dateFr, locatorLabel, plural, SOURCE_LABELS, type StockView } from "./format";
import styles from "../cash/cash.module.css";

type Kind = "st_count" | "st_system" | "st_movements" | "st_support" | "st_costs" | "st_ledger";
type Field = "key" | "amount" | "date" | "valueColumn" | "accountColumn" | "methodColumn" | "referenceColumn" | "siteColumn" | "lotColumn" | "unitColumn" | "categoryColumn" | "reasonColumn" | "directionColumn" | "pieceColumn" | "labelColumn" | "sheet";
type Columns = Record<Field, string>;
const TYPES: Kind[] = ["st_count", "st_system", "st_movements", "st_support", "st_costs", "st_ledger"];
const LABELS: Record<Field, string> = { key: "Colonne identifiant de ligne", amount: "Colonne quantité (2 décimales au plus)", date: "Colonne date", valueColumn: "Colonne valeur théorique en euros (sous-lot 2, facultative)", accountColumn: "Colonne compte de stock (facultative)", methodColumn: "Colonne méthode de coût (cmp, peps…)", referenceColumn: "Colonne référence", siteColumn: "Colonne site", lotColumn: "Colonne lot (facultative)",
  unitColumn: "Colonne unité de comptage", categoryColumn: "Colonne statut de propriété", reasonColumn: "Colonne motif d’exclusion", directionColumn: "Colonne sens (entree / sortie)", pieceColumn: "Colonne pièce ou fiche (facultative)", labelColumn: "Colonne libellé (facultative)", sheet: "Feuille XLSX (obligatoire pour un classeur)" };
const VISIBLE: Record<Kind, Field[]> = {
  st_count: ["key", "amount", "date", "referenceColumn", "siteColumn", "lotColumn", "unitColumn", "categoryColumn", "pieceColumn", "labelColumn", "sheet"],
  st_system: ["key", "amount", "date", "referenceColumn", "siteColumn", "lotColumn", "unitColumn", "categoryColumn", "reasonColumn", "valueColumn", "accountColumn", "labelColumn", "sheet"],
  st_movements: ["key", "amount", "date", "referenceColumn", "siteColumn", "lotColumn", "unitColumn", "directionColumn", "pieceColumn", "labelColumn", "sheet"],
  st_support: ["key", "amount", "date", "referenceColumn", "labelColumn", "sheet"],
  st_costs: ["key", "amount", "date", "referenceColumn", "lotColumn", "unitColumn", "methodColumn", "pieceColumn", "labelColumn", "sheet"],
  st_ledger: ["key", "amount", "date", "labelColumn", "sheet"],
};
const REQUIRED: Record<Kind, Field[]> = { st_count: ["key", "amount", "date", "referenceColumn", "siteColumn", "unitColumn", "categoryColumn"], st_system: ["key", "amount", "date", "referenceColumn", "siteColumn", "unitColumn", "categoryColumn"],
  st_movements: ["key", "amount", "date", "referenceColumn", "siteColumn", "unitColumn", "directionColumn"], st_support: ["key", "amount", "date"],
  st_costs: ["key", "amount", "date", "referenceColumn", "unitColumn", "methodColumn"], st_ledger: ["key", "amount", "date"] };
const blank: Columns = { key: "", amount: "", date: "", valueColumn: "", accountColumn: "", methodColumn: "", referenceColumn: "", siteColumn: "", lotColumn: "", unitColumn: "", categoryColumn: "", reasonColumn: "", directionColumn: "", pieceColumn: "", labelColumn: "", sheet: "" };
const DEFAULTS: Record<Kind, Columns> = {
  st_count: { ...blank, key: "Ligne", amount: "Quantite", date: "Date", referenceColumn: "Reference", siteColumn: "Site", lotColumn: "Lot", unitColumn: "Unite", categoryColumn: "Statut", pieceColumn: "Fiche", labelColumn: "Libelle" },
  st_system: { ...blank, key: "Ligne", amount: "Quantite", date: "Date", referenceColumn: "Reference", siteColumn: "Site", lotColumn: "Lot", unitColumn: "Unite", categoryColumn: "Statut", reasonColumn: "Motif", labelColumn: "Libelle", valueColumn: "Valeur", accountColumn: "Compte" },
  st_movements: { ...blank, key: "Mouvement", amount: "Quantite", date: "Date", referenceColumn: "Reference", siteColumn: "Site", lotColumn: "Lot", unitColumn: "Unite", directionColumn: "Sens", pieceColumn: "Piece", labelColumn: "Libelle" },
  st_support: { ...blank, key: "Piece", amount: "Quantite", date: "Date", referenceColumn: "Reference", labelColumn: "Libelle" },
  st_costs: { ...blank, key: "Ligne", amount: "CoutUnitaire", date: "Date", referenceColumn: "Reference", lotColumn: "Lot", unitColumn: "Unite", methodColumn: "Methode", pieceColumn: "Piece", labelColumn: "Libelle" },
  st_ledger: { ...blank, key: "Compte", amount: "Solde", date: "Date", labelColumn: "Libelle" },
};
const MEANING: Record<Kind, string> = {
  st_count: "Une ligne par comptage : référence, site, lot, unité, quantité comptée, date (une seule date par site) et statut (propre, tiers, consignation_recue, consignation_deposee, transit, en_cours).",
  st_system: "Quantité théorique à la clôture par référence / site / lot, datée de la clôture. Les références exclues portent leur motif.",
  st_movements: "Entrées et sorties entre la date de comptage et la clôture (ou entre la clôture et un comptage postérieur). Déclarez la période que le journal couvre : hors de cette période, les mouvements restent inconnus.",
  st_support: "Pièces citables : instructions d’inventaire, fiches de comptage, bons de réception et de livraison, confirmations de tiers. Quantité à 0 si sans objet.",
  st_costs: "Coût unitaire documenté par référence (et lot), dans l’unité de comptage, avec la méthode déclarée (PCG art. 213-33 à 213-35) et la pièce. L’outil ne recalcule ni n’approuve la méthode.",
  st_ledger: "Soldes des comptes de stocks (classe 3) à la clôture, une ligne par compte : la colonne identifiant porte le compte, la colonne montant le solde en euros.",
};
const BASES = { st_count: "count", st_system: "system", st_movements: "movements", st_support: "support", st_costs: "costs", st_ledger: "ledger" } as const;
export function buildStockMapping(type: Kind, c: Columns, f: { delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY" }, coverage: { from: string; to: string }): StockMapping {
  const v = (field: Field) => VISIBLE[type].includes(field) && c[field].trim() ? c[field].trim() : undefined;
  const stocks = Object.fromEntries(Object.entries({ basis: BASES[type], valueColumn: v("valueColumn"), accountColumn: v("accountColumn"), methodColumn: v("methodColumn"), referenceColumn: v("referenceColumn"), siteColumn: v("siteColumn"), lotColumn: v("lotColumn"), unitColumn: v("unitColumn"), categoryColumn: v("categoryColumn"), reasonColumn: v("reasonColumn"),
    directionColumn: v("directionColumn"), pieceColumn: v("pieceColumn"), labelColumn: v("labelColumn"), ...(type === "st_movements" ? { coverageFrom: coverage.from, coverageTo: coverage.to } : {}) }).filter(([, x]) => x !== undefined)) as StockMapping["stocks"];
  return { version: "stocks-1", headerRow: 1, ...(c.sheet.trim() ? { sheet: c.sheet.trim() } : {}), columns: { key: c.key.trim(), amount: c.amount.trim(), date: c.date.trim() }, delimiter: f.delimiter, decimal: f.decimal, dateFormat: f.dateFormat, sign: 1, currency: "EUR", stocks };
}
export function StockImportPanel({ view, period, periodId, busy, canPrepare, dossierId, onPreview, onApprove }: { view: StockView; period: AccountingPeriod; periodId: string; busy: boolean; canPrepare: boolean; dossierId: string; onPreview(data: FormData): void; onApprove(command: { importId: string; previewHash: string; expectedSourceId: string | null }): void }) {
  const [type, setType] = useState<Kind>("st_count"), [file, setFile] = useState<File | null>(null), [columns, setColumns] = useState<Columns>(DEFAULTS.st_count);
  const [format, setFormat] = useState<{ delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY" }>({ delimiter: ";", decimal: ",", dateFormat: "ISO" });
  const [coverage, setCoverage] = useState({ from: "", to: period.closingDate });
  const headOf = (t: string) => view.sourceHeads.find(h => h.document_type === t)?.import_id ?? null;
  const download = (id: string) => "/api/workpapers/stocks?" + new URLSearchParams({ dossierId, periodId, operation: "download", id });
  const canDownload = view.permissions.includes("download");
  return <section className={styles.card} aria-labelledby="st-sources-title">
    <header><h2 id="st-sources-title">Pièces et sources qualifiées</h2><span className={styles.muted}>Comptage et état théorique requis · mouvements, pièces, coûts et grand livre conditionnels</span></header>
    <ul className={styles.list}>{TYPES.map(t => {
      const batches = view.imports.filter(b => b.document.documentType === t), current = batches.find(b => b.id === headOf(t)), history = view.versions[t] ?? [];
      return <li key={t}>
        <div className={styles.kv}><strong>{SOURCE_LABELS[t]}</strong>{!current && <span className={styles.muted}>{t === "st_count" || t === "st_system" ? "Requis — absent (bloquant)" : t === "st_costs" || t === "st_ledger" ? "Coûts et cadrage — absent (aucune valeur dérivée)" : "Conditionnel — absent"}</span>}</div>
        {current && <p className={styles.muted}>{current.document.fileName} · {plural(current.rowCount ?? current.rows.length, "ligne")} · approuvée par {current.approval?.actorId} le {dateFr(current.approval!.at.slice(0, 10))}
          {t === "st_movements" && current.mapping.stocks?.coverageFrom ? " · période couverte du " + dateFr(current.mapping.stocks.coverageFrom) + " au " + dateFr(current.mapping.stocks.coverageTo!) : ""}
          {history.length > 1 && <> · <strong>{plural(history.length - 1, "version remplacée", "versions remplacées")} conservée{history.length > 2 ? "s" : ""}</strong> ({history.filter(v => !v.current).map(v => v.fileName + " · " + v.sha256.slice(0, 10)).join(" ; ")})</>}
          {canDownload && <> · <a href={download(current.document.id)}>original</a></>}</p>}
        {batches.filter(b => !b.approval).map(b => <div key={b.id} className={styles.sourceBox}>
          <p><strong>Aperçu à approuver</strong> · {b.document.fileName} · {plural(b.rowCount ?? b.rows.length, "ligne")} · {b.report.acceptedRows} acceptée(s) · {b.report.rejectedRows} rejetée(s)</p>
          {(b.report.warnings.length > 0 || b.report.blocking.length > 0) && <p className={styles.notice} data-tone={b.report.blocking.length ? "danger" : undefined}>{[...b.report.blocking.map(x => "Bloquant : " + x), ...b.report.warnings].join(" · ")}</p>}
          {b.rows.length > 0 && <details><summary>Comparer les premières lignes : source → normalisé</summary><div className={styles.preview} tabIndex={0} role="region" aria-label={"Aperçu de " + b.document.fileName}>{b.rows.slice(0, 5).map(r => <p key={r.id}>{locatorLabel(r.locator)} · {Object.entries(r.original).map(([k, v]) => k + "=" + v).join(" ; ")} → {r.normalized ? r.normalized.key + " · quantité " + r.normalized.amount.amount.replace(/\.?0+$/, "").replace(".", ",") + " · " + r.normalized.date : "rejetée : " + r.errors.join(", ")}</p>)}</div></details>}
          {canPrepare && <button type="button" className={styles.primary} disabled={busy || b.report.blocking.length > 0} onClick={() => onApprove({ importId: b.id, previewHash: b.previewHash, expectedSourceId: headOf(t) })}>Approuver cette version{headOf(t) ? " (remplace la version courante, conservée)" : ""}</button>}
        </div>)}
      </li>;
    })}</ul>
    {canPrepare && <form onSubmit={e => {
      e.preventDefault(); if (!file) return;
      const data = new FormData(); data.set("file", file); data.set("documentType", type); data.set("period", JSON.stringify(period)); data.set("mapping", JSON.stringify(buildStockMapping(type, columns, format, coverage)));
      onPreview(data);
    }}>
      <h3>Qualifier une source</h3>
      <div className={styles.fields}>
        <label>Type de source<select value={type} disabled={busy} onChange={e => { const t = e.target.value as Kind; setType(t); setColumns(DEFAULTS[t]); }}>{TYPES.map(t => <option key={t} value={t}>{SOURCE_LABELS[t]}</option>)}</select></label>
        <label>Fichier CSV ou XLSX (3 Mio maximum)<input type="file" accept=".csv,.xlsx" required disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
      </div>
      <p className={styles.muted}>{MEANING[type]}</p>
      <div className={styles.fields}>{VISIBLE[type].map(k => <label key={k}>{LABELS[k]}<input value={columns[k]} disabled={busy} required={REQUIRED[type].includes(k) || (k === "sheet" && !!file?.name.toLowerCase().endsWith(".xlsx"))} onChange={e => setColumns(c => ({ ...c, [k]: e.target.value }))}/></label>)}</div>
      {type === "st_movements" && <div className={styles.fields}>
        <label>Journal couvrant du<input type="date" required value={coverage.from} disabled={busy} onChange={e => setCoverage(c => ({ ...c, from: e.target.value }))}/></label>
        <label>au<input type="date" required value={coverage.to} disabled={busy} onChange={e => setCoverage(c => ({ ...c, to: e.target.value }))}/></label></div>}
      <div className={styles.fields}>
        <label>Séparateur<select value={format.delimiter} onChange={e => setFormat(f => ({ ...f, delimiter: e.target.value as ";" | "," | "\t" }))}><option value=";">Point-virgule</option><option value=",">Virgule</option><option value={"\t"}>Tabulation</option></select></label>
        <label>Décimales<select value={format.decimal} onChange={e => setFormat(f => ({ ...f, decimal: e.target.value as "," | "." }))}><option value=",">Virgule</option><option value=".">Point</option></select></label>
        <label>Dates<select value={format.dateFormat} onChange={e => setFormat(f => ({ ...f, dateFormat: e.target.value as "ISO" | "DD/MM/YYYY" }))}><option value="ISO">AAAA-MM-JJ</option><option value="DD/MM/YYYY">JJ/MM/AAAA</option></select></label>
      </div>
      <button type="submit" className={styles.primary} disabled={busy || !file}>Analyser et conserver l’aperçu</button>
      <p className={styles.muted}>Un aperçu n’est pas une approbation : la source n’entre dans la feuille qu’après approbation explicite. Une ligne mal formée est refusée avec sa cellule.</p>
    </form>}
  </section>;
}
