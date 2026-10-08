"use client";
import { useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { FA_BASES, type FixedAssetMapping, type FixedAssetSourceType } from "@/lib/workpapers/fixed-asset-sources";
import { eur, locatorText, plural, SOURCE_TYPE_LABELS } from "./format";
import type { FixedAssetView } from "./types";
import styles from "../cash/cash.module.css";

type Field = "key" | "amount" | "date" | "asset" | "component" | "family" | "table" | "movement" | "status" | "account" | "treatment" | "method" | "duration" | "prorataN" | "prorataD" | "kind" | "label" | "piece" | "sheet";
type Columns = Record<Field, string>;
const blank: Columns = { key: "", amount: "", date: "", asset: "", component: "", family: "", table: "", movement: "", status: "", account: "", treatment: "", method: "", duration: "", prorataN: "", prorataD: "", kind: "", label: "", piece: "", sheet: "" };
const DEFAULTS: Record<FixedAssetSourceType, Columns> = {
  fa_register: { ...blank, key: "ligne", amount: "montant", date: "date", asset: "actif", component: "composant", family: "famille", table: "tableau", movement: "mouvement", status: "statut", account: "compte", treatment: "traitement", label: "libelle", piece: "piece" },
  fa_ledger: { ...blank, key: "compte", amount: "solde", date: "date", table: "tableau", label: "libelle" },
  fa_parameters: { ...blank, key: "ref", amount: "residuel", date: "mise_en_service", asset: "actif", component: "composant", method: "methode", duration: "duree_mois", prorataN: "prorata_n", prorataD: "prorata_d" },
  fa_support: { ...blank, key: "piece", amount: "montant", date: "date", asset: "actif", component: "composant", kind: "nature", label: "libelle" },
};
const MEANING: Record<FixedAssetSourceType, string> = {
  fa_register: "Une ligne = un mouvement d’un tableau (brut, amortissement, depreciation) d’un actif ou composant : ouverture, entree, sortie, reprise (dépréciations seulement), reclassement (signé) ou cloture. Montants positifs dans le sens du tableau. Ouverture et clôture obligatoires par tableau, même nulles ; statut (en_cours, en_service, sorti) et traitement (standard ou motif d’exclusion) explicites.",
  fa_ledger: "Une ligne par compte : solde signé débit positif à la clôture et tableau du compte (brut, amortissement, depreciation).",
  fa_parameters: "Une ligne par actif ou composant : montant = valeur résiduelle, date = mise en service, référence de méthode, durée en mois et prorata n/d. Une valeur vide reste « source requise », jamais un défaut.",
  fa_support: "Pièces d’acquisition, de cession et de mise en service : montant positif, date, actif concerné et nature (acquisition, cession, mise_en_service).",
};
const LABELS: Record<Field, string> = { key: "Colonne identifiant", amount: "Colonne montant", date: "Colonne date", asset: "Colonne actif", component: "Colonne composant (facultative)", family: "Colonne famille", table: "Colonne tableau", movement: "Colonne mouvement", status: "Colonne statut", account: "Colonne compte GL", treatment: "Colonne traitement", method: "Colonne méthode", duration: "Colonne durée (mois)", prorataN: "Colonne prorata — numérateur", prorataD: "Colonne prorata — dénominateur", kind: "Colonne nature de pièce", label: "Colonne libellé (facultative)", piece: "Colonne pièce (facultative)", sheet: "Feuille XLSX (si XLSX)" };
const VISIBLE: Record<FixedAssetSourceType, Field[]> = {
  fa_register: ["key", "amount", "date", "asset", "component", "family", "table", "movement", "status", "account", "treatment", "label", "piece", "sheet"],
  fa_ledger: ["key", "amount", "date", "table", "label", "sheet"],
  fa_parameters: ["key", "amount", "date", "asset", "component", "method", "duration", "prorataN", "prorataD", "sheet"],
  fa_support: ["key", "amount", "date", "asset", "component", "kind", "label", "sheet"],
};
const OPTIONAL: Field[] = ["component", "label", "piece", "sheet"];
export function buildFixedAssetMapping(type: FixedAssetSourceType, c: Columns, f: { delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY"; sign: 1 | -1 }): FixedAssetMapping {
  const v = (field: Field) => VISIBLE[type].includes(field) && c[field].trim() ? c[field].trim() : undefined;
  return { version: "fixed-assets-1", headerRow: 1, ...(c.sheet.trim() ? { sheet: c.sheet.trim() } : {}), columns: { key: c.key, amount: c.amount, date: c.date }, delimiter: f.delimiter, decimal: f.decimal, dateFormat: f.dateFormat, sign: f.sign, currency: "EUR",
    fixedAssets: JSON.parse(JSON.stringify({ basis: FA_BASES[type], assetColumn: v("asset"), componentColumn: v("component"), familyColumn: v("family"), tableColumn: v("table"), movementColumn: v("movement"), statusColumn: v("status"), accountColumn: v("account"),
      treatmentColumn: v("treatment"), methodColumn: v("method"), durationColumn: v("duration"), prorataNumeratorColumn: v("prorataN"), prorataDenominatorColumn: v("prorataD"), kindColumn: v("kind"), labelColumn: v("label"), pieceColumn: v("piece") })) };
}
export function FixedAssetImportPanel({ view, period, periodId, busy, canPrepare, dossierId, onPreview, onApprove }: { view: FixedAssetView; period: AccountingPeriod; periodId: string; busy: boolean; canPrepare: boolean; dossierId: string; onPreview(data: FormData): void; onApprove(command: { importId: string; previewHash: string; expectedSourceId: string | null }): void }) {
  const [type, setType] = useState<FixedAssetSourceType>("fa_register"), [file, setFile] = useState<File | null>(null), [columns, setColumns] = useState<Columns>(DEFAULTS.fa_register);
  const [format, setFormat] = useState<{ delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY"; sign: 1 | -1 }>({ delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1 });
  const types = Object.keys(SOURCE_TYPE_LABELS) as FixedAssetSourceType[];
  return <section className={styles.card} aria-labelledby="fa-sources-title">
    <header><h2 id="fa-sources-title">Sources qualifiées</h2><span className={styles.muted}>Registre et GL requis · paramètres et pièces pour le recalcul et le rapprochement des mouvements</span></header>
    <ul className={styles.list}>{types.map(t => {
      const head = view.sourceHeads.find(h => h.document_type === t), batches = view.imports.filter(b => b.document.documentType === t);
      const current = batches.find(b => b.id === head?.import_id), pending = batches.filter(b => !b.approval);
      return <li key={t}>
        <div className={styles.kv}><strong>{SOURCE_TYPE_LABELS[t]}</strong>{current ? <span>{current.document.fileName} · {plural(current.rowCount ?? current.rows.length, "ligne")} · total normalisé {eur(current.report.normalizedTotal)} · approuvé par {current.approval?.actorId}</span> : <span className={styles.muted}>{["fa_parameters", "fa_support"].includes(t) ? "Conditionnel — absent" : "Requis — absent (bloquant)"}</span>}
          {batches.filter(b => b.approval && b.id !== head?.import_id).length > 0 && <span className={styles.muted}>{batches.filter(b => b.approval && b.id !== head?.import_id).length} version(s) remplacée(s) conservée(s)</span>}</div>
        {pending.map(b => <div key={b.id} className={styles.sourceBox}>
          <p><strong>Aperçu à approuver</strong> · {b.document.fileName} · {plural(b.rowCount ?? b.rows.length, "ligne")} · {b.report.acceptedRows} acceptées · {b.report.rejectedRows} rejetées · {b.report.duplicateRows} doublons potentiels</p>
          <p className={styles.muted}>Total source {b.report.sourceTotal.kind === "known" ? eur(b.report.sourceTotal.value) : b.report.sourceTotal.reason} · total normalisé {eur(b.report.normalizedTotal)} · convention de signe {b.mapping.sign === 1 ? "conservée" : "inversée"}</p>
          {(b.report.warnings.length > 0 || b.report.blocking.length > 0) && <p className={styles.notice}>{[...b.report.blocking, ...b.report.warnings].join(" · ")}</p>}
          <details><summary>Comparer les cinq premières lignes : source → normalisé</summary><div className={styles.preview} tabIndex={0} role="region" aria-label={"Aperçu de " + b.document.fileName}>{b.rows.slice(0, 5).map(r => <p key={r.id}>{locatorText(r.locator)} · {Object.entries(r.original).map(([k, v]) => k + "=" + v).join(" ; ")} → {r.normalized ? r.normalized.key + " · " + eur(r.normalized.amount) + " · " + r.normalized.date : "rejetée : " + r.errors.join(", ")}</p>)}</div></details>
          {canPrepare && <button type="button" className={styles.primary} disabled={busy || b.report.blocking.length > 0} onClick={() => onApprove({ importId: b.id, previewHash: b.previewHash, expectedSourceId: head?.import_id ?? null })}>Approuver ce mapping{head ? " (remplace la source courante)" : ""}</button>}
        </div>)}
        {current && view.permissions.includes("download") && <a href={"/api/workpapers/immobilisations?" + new URLSearchParams({ dossierId, periodId, operation: "download", id: current.document.id })}>Télécharger cette version source</a>}
      </li>;
    })}</ul>
    {canPrepare && <form onSubmit={e => { e.preventDefault(); if (!file) return; const data = new FormData(); data.set("file", file); data.set("documentType", type); data.set("period", JSON.stringify(period)); data.set("mapping", JSON.stringify(buildFixedAssetMapping(type, columns, format))); onPreview(data); }}>
      <h3>Qualifier une source</h3>
      <div className={styles.fields}>
        <label>Type de pièce<select value={type} disabled={busy} onChange={e => { const t = e.target.value as FixedAssetSourceType; setType(t); setColumns(DEFAULTS[t]); }}>{types.map(t => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</option>)}</select></label>
        <label>Fichier CSV ou XLSX (3 Mio maximum)<input type="file" accept=".csv,.xlsx" required disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
      </div>
      <p className={styles.muted}>{MEANING[type]}</p>
      <div className={styles.fields}>{VISIBLE[type].map(k => <label key={k}>{LABELS[k]}<input value={columns[k]} disabled={busy} required={!OPTIONAL.includes(k)} onChange={e => setColumns(c => ({ ...c, [k]: e.target.value }))}/></label>)}</div>
      <div className={styles.fields}>
        <label>Séparateur<select value={format.delimiter} onChange={e => setFormat(f => ({ ...f, delimiter: e.target.value as ";" | "," | "\t" }))}><option value=";">Point-virgule</option><option value=",">Virgule</option><option value={"\t"}>Tabulation</option></select></label>
        <label>Décimales<select value={format.decimal} onChange={e => setFormat(f => ({ ...f, decimal: e.target.value as "," | "." }))}><option value=".">Point</option><option value=",">Virgule</option></select></label>
        <label>Dates<select value={format.dateFormat} onChange={e => setFormat(f => ({ ...f, dateFormat: e.target.value as "ISO" | "DD/MM/YYYY" }))}><option value="ISO">AAAA-MM-JJ</option><option value="DD/MM/YYYY">JJ/MM/AAAA</option></select></label>
        <label>Convention de signe<select value={String(format.sign)} onChange={e => setFormat(f => ({ ...f, sign: Number(e.target.value) as 1 | -1 }))}><option value="1">Conserver les signes sources</option><option value="-1">Inverser les signes sources</option></select></label>
      </div>
      <button type="submit" className={styles.primary} disabled={busy || !file}>Analyser et conserver l’aperçu</button>
      <p className={styles.muted}>Un aperçu n’est pas une approbation : la source n’entre dans la revue qu’après approbation explicite de son mapping.</p>
    </form>}
  </section>;
}
