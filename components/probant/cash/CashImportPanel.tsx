"use client";
import { useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { CashMapping, CashSourceType } from "@/lib/workpapers/cash-sources";
import { CASH_BASES } from "@/lib/workpapers/cash-sources";
import { eur, locatorText, plural, SOURCE_TYPE_LABELS } from "./format";
import type { CashView } from "./types";
import styles from "./cash.module.css";

type Columns = { key: string; amount: string; date: string; bank: string; account: string; currency: string; nature: string; kind: string; label: string; explanation: string; piece: string; sheet: string };
const DEFAULTS: Record<CashSourceType, Columns> = {
  cash_ledger: { key: "gl", amount: "solde", date: "date", bank: "banque", account: "compte", currency: "devise", nature: "nature", kind: "", label: "libelle", explanation: "", piece: "", sheet: "" },
  cash_statement: { key: "ref", amount: "solde", date: "date", bank: "banque", account: "compte", currency: "devise", nature: "", kind: "", label: "", explanation: "", piece: "", sheet: "" },
  cash_erb: { key: "ligne", amount: "montant", date: "date", bank: "banque", account: "compte", currency: "devise", nature: "", kind: "nature", label: "", explanation: "explication", piece: "piece", sheet: "" },
  cash_settlements: { key: "mvt", amount: "montant", date: "date", bank: "banque", account: "compte", currency: "devise", nature: "", kind: "", label: "libelle", explanation: "", piece: "piece", sheet: "" },
  cash_support: { key: "piece_id", amount: "montant", date: "date", bank: "banque", account: "compte", currency: "devise", nature: "", kind: "", label: "libelle", explanation: "", piece: "", sheet: "" },
};
const SIGN_MEANING: Record<CashSourceType, string> = {
  cash_ledger: "Positif = solde débiteur du compte de trésorerie (disponible). Une ligne par compte : banque, référence, devise du compte et nature (banque, caisse, vmp).",
  cash_statement: "Positif = solde du relevé en faveur de l’entreprise. Une ligne par compte, datée de la clôture, en EUR.",
  cash_erb: "Positif augmente le solde comptable : remise non créditée > 0, paiement non débité < 0. Natures : solde_comptable, solde_banque, remise_non_creditee, paiement_non_debite, autre_suspens.",
  cash_settlements: "Crédit (encaissement) positif, débit (paiement) négatif ; mouvements datés après la clôture et au plus tard à la revue.",
  cash_support: "Pièces de correction postérieures (écritures, justificatifs) rattachées à un compte ; datées après la clôture et au plus tard à la revue ; seules ces pièces peuvent documenter une correction.",
};
const COLUMN_LABELS: Record<keyof Columns, string> = { key: "Colonne identifiant", amount: "Colonne montant", date: "Colonne date", bank: "Colonne banque", account: "Colonne référence de compte", currency: "Colonne devise", nature: "Colonne nature du compte", kind: "Colonne nature de ligne ERB", label: "Colonne libellé (facultative)", explanation: "Colonne explication (facultative)", piece: "Colonne pièce (facultative)", sheet: "Feuille XLSX (si XLSX)" };
const VISIBLE: Record<CashSourceType, (keyof Columns)[]> = {
  cash_ledger: ["key", "amount", "date", "bank", "account", "currency", "nature", "label", "sheet"], cash_statement: ["key", "amount", "date", "bank", "account", "currency", "sheet"],
  cash_erb: ["key", "amount", "date", "bank", "account", "currency", "kind", "explanation", "piece", "sheet"], cash_settlements: ["key", "amount", "date", "bank", "account", "currency", "label", "piece", "sheet"], cash_support: ["key", "amount", "date", "bank", "account", "currency", "label", "sheet"],
};
export function buildCashMapping(type: CashSourceType, c: Columns, f: { delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY"; sign: 1 | -1 }): CashMapping {
  const optional = (v: string) => v.trim() || undefined;
  return { version: "cash-reconciliation-1", headerRow: 1, ...(c.sheet.trim() ? { sheet: c.sheet.trim() } : {}), columns: { key: c.key, amount: c.amount, date: c.date }, delimiter: f.delimiter, decimal: f.decimal, dateFormat: f.dateFormat, sign: f.sign, currency: "EUR",
    cash: JSON.parse(JSON.stringify({ basis: CASH_BASES[type], bankColumn: c.bank, accountColumn: c.account, currencyColumn: c.currency, natureColumn: type === "cash_ledger" ? c.nature : undefined, kindColumn: type === "cash_erb" ? c.kind : undefined,
      labelColumn: optional(c.label), explanationColumn: type === "cash_erb" ? optional(c.explanation) : undefined, pieceColumn: ["cash_erb", "cash_settlements"].includes(type) ? optional(c.piece) : undefined })) };
}
export function CashImportPanel({ view, period, periodId, busy, canPrepare, dossierId, onPreview, onApprove }: { view: CashView; period: AccountingPeriod; periodId: string; busy: boolean; canPrepare: boolean; dossierId: string; onPreview(data: FormData): void; onApprove(command: { importId: string; previewHash: string; expectedSourceId: string | null }): void }) {
  const [type, setType] = useState<CashSourceType>("cash_ledger"), [file, setFile] = useState<File | null>(null), [columns, setColumns] = useState<Columns>(DEFAULTS.cash_ledger);
  const [format, setFormat] = useState<{ delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY"; sign: 1 | -1 }>({ delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1 });
  const types = Object.keys(SOURCE_TYPE_LABELS) as CashSourceType[];
  return <section className={styles.card} aria-labelledby="cash-sources-title">
    <header><h2 id="cash-sources-title">Sources qualifiées</h2><span className={styles.muted}>GL, relevés et ERB requis · relevés postérieurs et pièces de correction pour l’apurement</span></header>
    <ul className={styles.list}>{types.map(t => {
      const head = view.sourceHeads.find(h => h.document_type === t), batches = view.imports.filter(b => b.document.documentType === t);
      const current = batches.find(b => b.id === head?.import_id), pending = batches.filter(b => !b.approval);
      return <li key={t}>
        <div className={styles.kv}><strong>{SOURCE_TYPE_LABELS[t]}</strong>{current ? <span>{current.document.fileName} · {plural(current.rowCount ?? current.rows.length, "ligne")} · total normalisé {eur(current.report.normalizedTotal)} · approuvé par {current.approval?.actorId}</span> : <span className={styles.muted}>{["cash_settlements", "cash_support"].includes(t) ? "Facultatif — absent" : "Requis — absent"}</span>}
          {batches.filter(b => b.approval && b.id !== head?.import_id).length > 0 && <span className={styles.muted}>{batches.filter(b => b.approval && b.id !== head?.import_id).length} version(s) remplacée(s) conservée(s)</span>}</div>
        {pending.map(b => <div key={b.id} className={styles.sourceBox}>
          <p><strong>Aperçu à approuver</strong> · {b.document.fileName} · {plural(b.rowCount ?? b.rows.length, "ligne")} · {b.report.acceptedRows} acceptées · {b.report.rejectedRows} rejetées · {b.report.duplicateRows} doublons potentiels</p>
          <p className={styles.muted}>Total source {b.report.sourceTotal.kind === "known" ? eur(b.report.sourceTotal.value) : b.report.sourceTotal.reason} · total normalisé {eur(b.report.normalizedTotal)} · convention de signe {b.mapping.sign === 1 ? "conservée" : "inversée"}</p>
          {(b.report.warnings.length > 0 || b.report.blocking.length > 0) && <p className={styles.notice}>{[...b.report.blocking, ...b.report.warnings].join(" · ")}</p>}
          <details><summary>Comparer les cinq premières lignes : source → normalisé</summary><div className={styles.preview} tabIndex={0} role="region" aria-label={"Aperçu de " + b.document.fileName}>{b.rows.slice(0, 5).map(r => <p key={r.id}>{locatorText(r.locator)} · {Object.entries(r.original).map(([k, v]) => k + "=" + v).join(" ; ")} → {r.normalized ? r.normalized.key + " · " + eur(r.normalized.amount) + " · " + r.normalized.date : "rejetée : " + r.errors.join(", ")}</p>)}</div></details>
          {canPrepare && <button type="button" className={styles.primary} disabled={busy || b.report.blocking.length > 0} onClick={() => onApprove({ importId: b.id, previewHash: b.previewHash, expectedSourceId: head?.import_id ?? null })}>Approuver ce mapping{head ? " (remplace la source courante)" : ""}</button>}
        </div>)}
        {current && view.permissions.includes("download") && <a href={"/api/workpapers/cash?" + new URLSearchParams({ dossierId, periodId, operation: "download", id: current.document.id })}>Télécharger cette version source</a>}
      </li>;
    })}</ul>
    {canPrepare && <form onSubmit={e => { e.preventDefault(); if (!file) return; const data = new FormData(); data.set("file", file); data.set("documentType", type); data.set("period", JSON.stringify(period)); data.set("mapping", JSON.stringify(buildCashMapping(type, columns, format))); onPreview(data); }}>
      <h3>Qualifier une source</h3>
      <div className={styles.fields}>
        <label>Type de pièce<select value={type} disabled={busy} onChange={e => { const t = e.target.value as CashSourceType; setType(t); setColumns(DEFAULTS[t]); }}>{types.map(t => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</option>)}</select></label>
        <label>Fichier CSV ou XLSX (3 Mio maximum)<input type="file" accept=".csv,.xlsx" required disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
      </div>
      <p className={styles.muted}>{SIGN_MEANING[type]}</p>
      <div className={styles.fields}>{VISIBLE[type].map(k => <label key={k}>{COLUMN_LABELS[k]}<input value={columns[k]} disabled={busy} required={!["label", "explanation", "piece", "sheet"].includes(k)} onChange={e => setColumns(c => ({ ...c, [k]: e.target.value }))}/></label>)}</div>
      <div className={styles.fields}>
        <label>Séparateur<select value={format.delimiter} onChange={e => setFormat(f => ({ ...f, delimiter: e.target.value as ";" | "," | "\t" }))}><option value=";">Point-virgule</option><option value=",">Virgule</option><option value={"\t"}>Tabulation</option></select></label>
        <label>Décimales<select value={format.decimal} onChange={e => setFormat(f => ({ ...f, decimal: e.target.value as "," | "." }))}><option value=".">Point</option><option value=",">Virgule</option></select></label>
        <label>Dates<select value={format.dateFormat} onChange={e => setFormat(f => ({ ...f, dateFormat: e.target.value as "ISO" | "DD/MM/YYYY" }))}><option value="ISO">AAAA-MM-JJ</option><option value="DD/MM/YYYY">JJ/MM/AAAA</option></select></label>
        <label>Convention de signe<select value={String(format.sign)} onChange={e => setFormat(f => ({ ...f, sign: Number(e.target.value) as 1 | -1 }))}><option value="1">Conserver les signes sources</option><option value="-1">Inverser les signes sources</option></select></label>
      </div>
      <button type="submit" className={styles.primary} disabled={busy || !file}>Analyser et conserver l’aperçu</button>
      <p className={styles.muted}>Un aperçu n’est pas une approbation : la source n’entre dans le pont qu’après approbation explicite de son mapping.</p>
    </form>}
  </section>;
}
