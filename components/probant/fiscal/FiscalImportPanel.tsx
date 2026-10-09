"use client";
import { useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { FiscalMapping, FiscalTabularType } from "@/lib/workpapers/fiscal-sources";
import { dateFr, locatorLabel, plural, SOURCE_LABELS } from "./format";
import type { FiscalView } from "./types";
import styles from "../cash/cash.module.css";

type Kind = "fx_fec" | "fx_vat_return" | FiscalTabularType;
type Field = "key" | "amount" | "date" | "periodStart" | "periodEnd" | "direction" | "base" | "label" | "sheet";
type Columns = Record<Field, string>;
const blank: Columns = { key: "", amount: "", date: "", periodStart: "", periodEnd: "", direction: "", base: "", label: "", sheet: "" };
const DEFAULTS: Record<FiscalTabularType, Columns> = {
  fx_invoices: { ...blank, key: "piece", amount: "tva", date: "date", direction: "sens", base: "base_ht", label: "libelle" },
  fx_vat_payments: { ...blank, key: "reference", amount: "montant", date: "date", periodStart: "debut", periodEnd: "fin", label: "libelle" },
  fx_support: { ...blank, key: "ref", amount: "montant", date: "date", label: "libelle" },
};
const VISIBLE: Record<FiscalTabularType, Field[]> = { fx_invoices: ["key", "amount", "date", "direction", "base", "label", "sheet"], fx_vat_payments: ["key", "amount", "date", "periodStart", "periodEnd", "label", "sheet"], fx_support: ["key", "amount", "date", "label", "sheet"] };
const REQUIRED: Record<FiscalTabularType, Field[]> = { fx_invoices: ["key", "amount", "date"], fx_vat_payments: ["key", "amount", "date", "periodStart", "periodEnd"], fx_support: ["key", "amount", "date", "label"] };
const LABELS: Record<Field, string> = { key: "Colonne identifiant (pièce, référence)", amount: "Colonne montant", date: "Colonne date", periodStart: "Colonne début de période payée", periodEnd: "Colonne fin de période payée", direction: "Colonne sens (facultative)", base: "Colonne base HT (facultative)", label: "Colonne libellé", sheet: "Feuille XLSX (facultative)" };
const MEANING: Record<Kind, string> = {
  fx_fec: "FEC de l’exercice (texte UTF-8, séparateur tabulation, barre verticale ou point-virgule). Lu par le parseur FEC historique ; toute ligne illisible ou écriture déséquilibrée bloque l’import : aucun montant n’est réputé nul.",
  fx_vat_return: "CA3 ou CA12 au gabarit PROBANT (JSON, CSV ou XLSX : formulaire, millésime, période, cases). Lue par le processeur fiscal existant ; une déclaration corrigée pour la même période remplace la précédente, qui reste conservée.",
  fx_invoices: "Inventaire des pièces : référence identique au FEC (PieceRef), TVA de la pièce, date ; sens et base HT facultatifs. Une pièce absente de l’inventaire n’est pas une pièce absente du dossier.",
  fx_vat_payments: "Paiements de TVA au Trésor : référence, montant positif, date, période déclarative payée (début et fin).",
  fx_support: "Pièces justificatives citables (attestation de régime, note de report de crédit…) : référence, montant (0 si sans objet), date, libellé.",
};
const TYPES: Kind[] = ["fx_fec", "fx_vat_return", "fx_invoices", "fx_vat_payments", "fx_support"];
export function buildFiscalMapping(type: FiscalTabularType, c: Columns, f: { delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY" }): FiscalMapping {
  const v = (field: Field) => VISIBLE[type].includes(field) && c[field].trim() ? c[field].trim() : undefined;
  return { version: "fiscal-1", headerRow: 1, ...(c.sheet.trim() ? { sheet: c.sheet.trim() } : {}), columns: { key: c.key, amount: c.amount, date: c.date }, delimiter: f.delimiter, decimal: f.decimal, dateFormat: f.dateFormat, sign: 1, currency: "EUR",
    fiscal: JSON.parse(JSON.stringify({ basis: type === "fx_invoices" ? "invoices" : type === "fx_vat_payments" ? "payments" : "support", periodStartColumn: v("periodStart"), periodEndColumn: v("periodEnd"), directionColumn: v("direction"), baseColumn: v("base"), labelColumn: v("label") })) };
}
const keyLabel = (key: string) => key.startsWith("fx_vat_return:") ? "Période " + key.split(":").slice(1).map(dateFr).join(" → ") : SOURCE_LABELS[key] ?? key;
export function FiscalImportPanel({ view, period, periodId, busy, canPrepare, dossierId, onPreview, onApprove }: { view: FiscalView; period: AccountingPeriod; periodId: string; busy: boolean; canPrepare: boolean; dossierId: string; onPreview(data: FormData): void; onApprove(command: { importId: string; previewHash: string; expectedSourceId: string | null }): void }) {
  const [type, setType] = useState<Kind>("fx_fec"), [file, setFile] = useState<File | null>(null), [columns, setColumns] = useState<Columns>(blank);
  const [declaration, setDeclaration] = useState<{ documentType: "declaration_tva_ca3" | "declaration_tva_ca12"; expectedSiren: string }>({ documentType: "declaration_tva_ca3", expectedSiren: "" });
  const [format, setFormat] = useState<{ delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY" }>({ delimiter: ";", decimal: ",", dateFormat: "ISO" });
  const headOf = (key: string) => view.sourceHeads.find(h => h.document_type === key)?.import_id ?? null;
  const download = (id: string) => "/api/workpapers/fiscal?" + new URLSearchParams({ dossierId, periodId, operation: "download", id });
  const canDownload = view.permissions.includes("download");
  const pending = (b: FiscalView["imports"][number]) => <div key={b.id} className={styles.sourceBox}>
    <p><strong>Aperçu à approuver</strong> · {b.document.fileName} · {keyLabel(b.document.logicalId)} · {plural(b.rowCount ?? b.rows.length, "ligne")} · {b.report.acceptedRows} acceptée(s) · {b.report.rejectedRows} rejetée(s)</p>
    {(b.report.warnings.length > 0 || b.report.blocking.length > 0) && <p className={styles.notice} data-tone={b.report.blocking.length ? "danger" : undefined}>{[...b.report.blocking.map(x => "Bloquant : " + x), ...b.report.warnings].join(" · ")}</p>}
    {b.rows.length > 0 && <details><summary>Comparer les premières lignes : source → normalisé</summary><div className={styles.preview} tabIndex={0} role="region" aria-label={"Aperçu de " + b.document.fileName}>{b.rows.slice(0, 8).map(r => <p key={r.id}>{locatorLabel(r.locator)} · {Object.entries(r.original).filter(([k]) => !["structuredPath", "formula", "confidence", "extractionMethod", "declaredDataType", "sheet"].includes(k)).map(([k, v]) => k + "=" + v).join(" ; ")} → {r.normalized ? r.normalized.key + " · " + r.normalized.amount.amount + " EUR · " + r.normalized.date : r.errors.length ? "rejetée : " + r.errors.join(", ") : "non lue comme montant"}</p>)}</div></details>}
    {canPrepare && <button type="button" className={styles.primary} disabled={busy || b.report.blocking.length > 0} onClick={() => onApprove({ importId: b.id, previewHash: b.previewHash, expectedSourceId: headOf(b.document.logicalId) })}>Approuver cette version{headOf(b.document.logicalId) ? " (remplace la version courante, conservée)" : ""}</button>}
  </div>;
  const heads = (t: Kind) => view.sourceHeads.filter(h => h.document_type === t || h.document_type.startsWith(t + ":"));
  return <section className={styles.card} aria-labelledby="fx-sources-title">
    <header><h2 id="fx-sources-title">Pièces et sources qualifiées</h2><span className={styles.muted}>FEC requis · déclaration de la période, inventaire, paiements et pièces conditionnels</span></header>
    <ul className={styles.list}>{TYPES.map(t => {
      const batches = view.imports.filter(b => b.document.documentType === t), unapproved = batches.filter(b => !b.approval), current = heads(t);
      return <li key={t}>
        <div className={styles.kv}><strong>{SOURCE_LABELS[t]}</strong>{!current.length && <span className={styles.muted}>{t === "fx_fec" ? "Requis — absent (bloquant)" : "Conditionnel — absent"}</span>}</div>
        {current.map(h => { const b = batches.find(x => x.id === h.import_id); const history = view.versions[h.document_type] ?? []; return b && <p key={h.document_type} className={styles.muted}>
          {t === "fx_vat_return" ? keyLabel(h.document_type) + " · " : ""}{b.document.fileName} · {plural(b.rowCount ?? b.rows.length, "ligne")} · approuvée par {b.approval?.actorId} le {dateFr(b.approval!.at.slice(0, 10))}
          {history.length > 1 && <> · <strong>{plural(history.length - 1, "version remplacée", "versions remplacées")} conservée{history.length > 2 ? "s" : ""}</strong> ({history.filter(v => !v.current).map(v => v.fileName + " · " + v.sha256.slice(0, 10)).join(" ; ")})</>}
          {canDownload && <> · <a href={download(b.document.id)}>original</a></>}</p>; })}
        {unapproved.map(pending)}
      </li>;
    })}</ul>
    {canPrepare && <form onSubmit={e => {
      e.preventDefault(); if (!file) return;
      const data = new FormData(); data.set("file", file); data.set("documentType", type); data.set("period", JSON.stringify(period));
      if (type === "fx_vat_return") data.set("declaration", JSON.stringify({ documentType: declaration.documentType, ...(declaration.expectedSiren ? { expectedSiren: declaration.expectedSiren } : {}) }));
      else if (type !== "fx_fec") data.set("mapping", JSON.stringify(buildFiscalMapping(type, columns, format)));
      onPreview(data);
    }}>
      <h3>Qualifier une pièce</h3>
      <div className={styles.fields}>
        <label>Type de pièce<select value={type} disabled={busy} onChange={e => { const t = e.target.value as Kind; setType(t); if (t !== "fx_fec" && t !== "fx_vat_return") setColumns(DEFAULTS[t]); }}>{TYPES.map(t => <option key={t} value={t}>{SOURCE_LABELS[t]}</option>)}</select></label>
        <label>Fichier (3 Mio maximum)<input type="file" accept={type === "fx_fec" ? ".txt,.csv" : type === "fx_vat_return" ? ".csv,.json,.xlsx" : ".csv,.xlsx"} required disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
      </div>
      <p className={styles.muted}>{MEANING[type]}</p>
      {type === "fx_vat_return" && <div className={styles.fields}>
        <label>Formulaire<select value={declaration.documentType} disabled={busy} onChange={e => setDeclaration(d => ({ ...d, documentType: e.target.value as typeof d.documentType }))}><option value="declaration_tva_ca3">CA3 (3310-CA3-SD)</option><option value="declaration_tva_ca12">CA12 (3517-S-SD)</option></select></label>
        <label>SIREN attendu (facultatif)<input value={declaration.expectedSiren} inputMode="numeric" pattern="\d{9}" disabled={busy} onChange={e => setDeclaration(d => ({ ...d, expectedSiren: e.target.value.trim() }))}/></label>
      </div>}
      {type !== "fx_fec" && type !== "fx_vat_return" && <>
        <div className={styles.fields}>{VISIBLE[type].map(k => <label key={k}>{LABELS[k]}<input value={columns[k]} disabled={busy} required={REQUIRED[type].includes(k)} onChange={e => setColumns(c => ({ ...c, [k]: e.target.value }))}/></label>)}</div>
        <div className={styles.fields}>
          <label>Séparateur<select value={format.delimiter} onChange={e => setFormat(f => ({ ...f, delimiter: e.target.value as ";" | "," | "\t" }))}><option value=";">Point-virgule</option><option value=",">Virgule</option><option value={"\t"}>Tabulation</option></select></label>
          <label>Décimales<select value={format.decimal} onChange={e => setFormat(f => ({ ...f, decimal: e.target.value as "," | "." }))}><option value=",">Virgule</option><option value=".">Point</option></select></label>
          <label>Dates<select value={format.dateFormat} onChange={e => setFormat(f => ({ ...f, dateFormat: e.target.value as "ISO" | "DD/MM/YYYY" }))}><option value="ISO">AAAA-MM-JJ</option><option value="DD/MM/YYYY">JJ/MM/AAAA</option></select></label>
        </div></>}
      <button type="submit" className={styles.primary} disabled={busy || !file}>Analyser et conserver l’aperçu</button>
      <p className={styles.muted}>Un aperçu n’est pas une approbation : la pièce n’entre dans une période qu’après approbation explicite.</p>
    </form>}
  </section>;
}
