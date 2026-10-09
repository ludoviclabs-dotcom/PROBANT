"use client";
import { useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { EQ_BASES, type EquityMapping, type EquityTabularType } from "@/lib/workpapers/capitaux-sources";
import { eur, locatorText, plural, SOURCE_TYPE_LABELS } from "./format";
import type { EquityView } from "./types";
import styles from "../cash/cash.module.css";

type Field = "key" | "amount" | "date" | "account" | "component" | "nature" | "effect" | "decision" | "transfer" | "piece" | "label" | "column" | "decisionId" | "type" | "organ" | "minutes" | "page" | "resolution" | "extract" | "sheet";
type Columns = Record<Field, string>;
type SourceKind = EquityTabularType | "eq_minutes";
const blank: Columns = { key: "", amount: "", date: "", account: "", component: "", nature: "", effect: "", decision: "", transfer: "", piece: "", label: "", column: "", decisionId: "", type: "", organ: "", minutes: "", page: "", resolution: "", extract: "", sheet: "" };
const DEFAULTS: Record<EquityTabularType, Columns> = {
  eq_balances: { ...blank, key: "ligne", amount: "montant", date: "date", account: "compte", component: "composante", label: "libelle" },
  eq_entries: { ...blank, key: "ligne", amount: "montant", date: "date", account: "compte", component: "composante", nature: "nature", effect: "effet", decision: "decision", transfer: "transfert", piece: "piece", label: "libelle" },
  eq_variation: { ...blank, key: "ligne", amount: "montant", date: "date", component: "composante", column: "colonne" },
  eq_decisions: { ...blank, key: "ligne", amount: "montant", date: "date", decisionId: "decision", type: "type", component: "composante", effect: "effet", organ: "organe", minutes: "pv", page: "page", resolution: "resolution", extract: "extrait", label: "libelle" },
  eq_payments: { ...blank, key: "ligne", amount: "montant", date: "date", decision: "decision", label: "libelle" },
};
const MEANING: Record<SourceKind, string> = {
  eq_balances: "Une ligne par compte et par date : solde à l’ouverture (début d’exercice) ou à la clôture, dans le sens des capitaux propres (crédit positif), avec la composante du compte. Autres fonds propres : composante autres_fonds_propres (listée, exclue du total).",
  eq_entries: "Écritures de l’exercice sur ces comptes : montant signé (sens des capitaux propres), date comptable dans l’exercice, date d’effet explicite, nature, décision citée (ligne du registre) et référence de transfert interne s’il y a lieu. Une ligne de GL couvrant deux décisions peut être ventilée.",
  eq_variation: "Tableau de variation fourni par l’entité : une ligne par cellule (composante × colonne : ouverture, nature, cloture).",
  eq_decisions: "Registre des décisions transcrites : une ligne par effet d’une décision sur une composante (montant signé voté), date de décision, date d’effet, type, PV cité (référence de pièce) et page. Une référence vide reste « PV absent ».",
  eq_payments: "Règlements : montant positif payé, date, ligne de décision exécutée.",
  eq_minutes: "PV ou acte en PDF (non chiffré, 200 pages au plus) : référence de pièce identique à celle du registre, titre et date. Aucun texte n’est lu comme un montant ; la lecture reste humaine, page par page.",
};
const LABELS: Record<Field, string> = { key: "Colonne identifiant", amount: "Colonne montant", date: "Colonne date", account: "Colonne compte", component: "Colonne composante", nature: "Colonne nature", effect: "Colonne date d’effet", decision: "Colonne décision citée", transfer: "Colonne transfert interne (facultative)", piece: "Colonne pièce (facultative)", label: "Colonne libellé (facultative)", column: "Colonne du tableau", decisionId: "Colonne identifiant de décision", type: "Colonne type de décision", organ: "Colonne organe (facultative)", minutes: "Colonne PV cité", page: "Colonne page du PV (facultative)", resolution: "Colonne résolution (facultative)", extract: "Colonne extrait transcrit (facultative)", sheet: "Feuille XLSX (si XLSX)" };
const VISIBLE: Record<EquityTabularType, Field[]> = {
  eq_balances: ["key", "amount", "date", "account", "component", "label", "sheet"],
  eq_entries: ["key", "amount", "date", "account", "component", "nature", "effect", "decision", "transfer", "piece", "label", "sheet"],
  eq_variation: ["key", "amount", "date", "component", "column", "sheet"],
  eq_decisions: ["key", "amount", "date", "decisionId", "type", "component", "effect", "organ", "minutes", "page", "resolution", "extract", "label", "sheet"],
  eq_payments: ["key", "amount", "date", "decision", "label", "sheet"],
};
const OPTIONAL: Field[] = ["transfer", "piece", "label", "organ", "page", "resolution", "extract", "sheet"];
const OPTIONAL_BY_TYPE: Partial<Record<EquityTabularType, Field[]>> = { eq_entries: ["decision"] };
export function buildEquityMapping(type: EquityTabularType, c: Columns, f: { delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY"; sign: 1 | -1 }): EquityMapping {
  const v = (field: Field) => VISIBLE[type].includes(field) && c[field].trim() ? c[field].trim() : undefined;
  return { version: "equity-1", headerRow: 1, ...(c.sheet.trim() ? { sheet: c.sheet.trim() } : {}), columns: { key: c.key, amount: c.amount, date: c.date }, delimiter: f.delimiter, decimal: f.decimal, dateFormat: f.dateFormat, sign: f.sign, currency: "EUR",
    capitaux: JSON.parse(JSON.stringify({ basis: EQ_BASES[type], accountColumn: v("account"), componentColumn: v("component"), natureColumn: v("nature"), effectDateColumn: v("effect"), decisionColumn: v("decision"), transferColumn: v("transfer"), pieceColumn: v("piece"), labelColumn: v("label"),
      columnColumn: v("column"), decisionIdColumn: v("decisionId"), typeColumn: v("type"), organColumn: v("organ"), minutesColumn: v("minutes"), pageColumn: v("page"), resolutionColumn: v("resolution"), extractColumn: v("extract") })) };
}
const TYPES: SourceKind[] = ["eq_balances", "eq_entries", "eq_variation", "eq_decisions", "eq_payments", "eq_minutes"];
export function EquityImportPanel({ view, period, periodId, busy, canPrepare, dossierId, onPreview, onApprove }: { view: EquityView; period: AccountingPeriod; periodId: string; busy: boolean; canPrepare: boolean; dossierId: string; onPreview(data: FormData): void; onApprove(command: { importId: string; previewHash: string; expectedSourceId: string | null }): void }) {
  const [type, setType] = useState<SourceKind>("eq_balances"), [file, setFile] = useState<File | null>(null), [columns, setColumns] = useState<Columns>(DEFAULTS.eq_balances);
  const [minutes, setMinutes] = useState({ pieceRef: "", title: "", documentDate: "" });
  const [format, setFormat] = useState<{ delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY"; sign: 1 | -1 }>({ delimiter: ";", decimal: ".", dateFormat: "ISO", sign: 1 });
  const headOf = (key: string) => view.sourceHeads.find(h => h.document_type === key)?.import_id ?? null;
  const download = (id: string) => "/api/workpapers/capitaux-propres?" + new URLSearchParams({ dossierId, periodId, operation: "download", id });
  const pending = (b: EquityView["imports"][number]) => <div key={b.id} className={styles.sourceBox}>
    <p><strong>Aperçu à approuver</strong> · {b.document.fileName} · {b.document.format === "pdf" ? plural(b.rowCount ?? b.rows.length, "page") : plural(b.rowCount ?? b.rows.length, "ligne") + " · " + b.report.acceptedRows + " acceptées · " + b.report.rejectedRows + " rejetées · " + b.report.duplicateRows + " doublons potentiels"}</p>
    {b.document.format !== "pdf" && <p className={styles.muted}>Total source {b.report.sourceTotal.kind === "known" ? eur(b.report.sourceTotal.value) : b.report.sourceTotal.reason} · total normalisé {eur(b.report.normalizedTotal)} · convention de signe {b.mapping.sign === 1 ? "conservée" : "inversée"}</p>}
    {(b.report.warnings.length > 0 || b.report.blocking.length > 0) && <p className={styles.notice}>{[...b.report.blocking, ...b.report.warnings].join(" · ")}</p>}
    {b.document.format !== "pdf" && <details><summary>Comparer les cinq premières lignes : source → normalisé</summary><div className={styles.preview} tabIndex={0} role="region" aria-label={"Aperçu de " + b.document.fileName}>{b.rows.slice(0, 5).map(r => <p key={r.id}>{locatorText(r.locator)} · {Object.entries(r.original).map(([k, v]) => k + "=" + v).join(" ; ")} → {r.normalized ? r.normalized.key + " · " + eur(r.normalized.amount) + " · " + r.normalized.date : "rejetée : " + r.errors.join(", ")}</p>)}</div></details>}
    {canPrepare && <button type="button" className={styles.primary} disabled={busy || b.report.blocking.length > 0} onClick={() => onApprove({ importId: b.id, previewHash: b.previewHash, expectedSourceId: headOf(b.document.logicalId) })}>{b.document.format === "pdf" ? "Approuver ce PV" : "Approuver ce mapping"}{headOf(b.document.logicalId) ? " (remplace la source courante)" : ""}</button>}
  </div>;
  return <section className={styles.card} aria-labelledby="eq-sources-title">
    <header><h2 id="eq-sources-title">Sources qualifiées</h2><span className={styles.muted}>Balance et écritures requises · tableau fourni, registre des décisions, règlements et PV conditionnels</span></header>
    <ul className={styles.list}>{TYPES.map(t => {
      const batches = view.imports.filter(b => b.document.documentType === t), unapproved = batches.filter(b => !b.approval);
      if (t === "eq_minutes") {
        const current = view.sourceHeads.filter(h => h.document_type.startsWith("eq_minutes:")).map(h => batches.find(b => b.id === h.import_id)).filter((b): b is NonNullable<typeof b> => !!b);
        return <li key={t}><div className={styles.kv}><strong>{SOURCE_TYPE_LABELS[t]}</strong>{current.length ? <span>{current.map(b => (b.mapping.capitaux?.pieceRef ?? "") + " (" + plural(b.rowCount ?? b.rows.length, "page") + ")").join(" · ")}</span> : <span className={styles.muted}>Conditionnel — aucun PV : les décisions restent non appuyées</span>}</div>
          {current.map(b => <p key={b.id} className={styles.muted}>{b.mapping.capitaux?.pieceRef} · {b.mapping.capitaux?.title} · approuvé par {b.approval?.actorId}{view.permissions.includes("download") && <> · <a href={download(b.document.id)}>original</a></>}</p>)}
          {unapproved.map(pending)}</li>;
      }
      const head = headOf(t), current = batches.find(b => b.id === head);
      return <li key={t}>
        <div className={styles.kv}><strong>{SOURCE_TYPE_LABELS[t]}</strong>{current ? <span>{current.document.fileName} · {plural(current.rowCount ?? current.rows.length, "ligne")} · total normalisé {eur(current.report.normalizedTotal)} · approuvé par {current.approval?.actorId}</span> : <span className={styles.muted}>{["eq_balances", "eq_entries"].includes(t) ? "Requis — absent (bloquant)" : "Conditionnel — absent"}</span>}
          {batches.filter(b => b.approval && b.id !== head).length > 0 && <span className={styles.muted}>{batches.filter(b => b.approval && b.id !== head).length} version(s) remplacée(s) conservée(s)</span>}</div>
        {unapproved.map(pending)}
        {current && view.permissions.includes("download") && <a href={download(current.document.id)}>Télécharger cette version source</a>}
      </li>;
    })}</ul>
    {canPrepare && <form onSubmit={e => {
      e.preventDefault(); if (!file) return;
      const data = new FormData(); data.set("file", file); data.set("documentType", type); data.set("period", JSON.stringify(period));
      if (type === "eq_minutes") data.set("minutes", JSON.stringify(minutes)); else data.set("mapping", JSON.stringify(buildEquityMapping(type, columns, format)));
      onPreview(data);
    }}>
      <h3>Qualifier une source</h3>
      <div className={styles.fields}>
        <label>Type de pièce<select value={type} disabled={busy} onChange={e => { const t = e.target.value as SourceKind; setType(t); if (t !== "eq_minutes") setColumns(DEFAULTS[t]); }}>{TYPES.map(t => <option key={t} value={t}>{SOURCE_TYPE_LABELS[t]}</option>)}</select></label>
        <label>{type === "eq_minutes" ? "Fichier PDF (3 Mio maximum)" : "Fichier CSV ou XLSX (3 Mio maximum)"}<input type="file" accept={type === "eq_minutes" ? ".pdf" : ".csv,.xlsx"} required disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
      </div>
      <p className={styles.muted}>{MEANING[type]}</p>
      {type === "eq_minutes" ? <div className={styles.fields}>
        <label>Référence de pièce (comme au registre)<input value={minutes.pieceRef} required pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,79}" disabled={busy} onChange={e => setMinutes(m => ({ ...m, pieceRef: e.target.value }))} placeholder="PV-AGO-2024"/></label>
        <label>Titre<input value={minutes.title} required disabled={busy} onChange={e => setMinutes(m => ({ ...m, title: e.target.value }))} placeholder="PV de l’AGO du 30 mai 2024"/></label>
        <label>Date du document<input type="date" value={minutes.documentDate} required disabled={busy} onChange={e => setMinutes(m => ({ ...m, documentDate: e.target.value }))}/></label>
      </div> : <>
        <div className={styles.fields}>{VISIBLE[type].map(k => <label key={k}>{LABELS[k]}<input value={columns[k]} disabled={busy} required={!OPTIONAL.includes(k) && !(OPTIONAL_BY_TYPE[type] ?? []).includes(k)} onChange={e => setColumns(c => ({ ...c, [k]: e.target.value }))}/></label>)}</div>
        <div className={styles.fields}>
          <label>Séparateur<select value={format.delimiter} onChange={e => setFormat(f => ({ ...f, delimiter: e.target.value as ";" | "," | "\t" }))}><option value=";">Point-virgule</option><option value=",">Virgule</option><option value={"\t"}>Tabulation</option></select></label>
          <label>Décimales<select value={format.decimal} onChange={e => setFormat(f => ({ ...f, decimal: e.target.value as "," | "." }))}><option value=".">Point</option><option value=",">Virgule</option></select></label>
          <label>Dates<select value={format.dateFormat} onChange={e => setFormat(f => ({ ...f, dateFormat: e.target.value as "ISO" | "DD/MM/YYYY" }))}><option value="ISO">AAAA-MM-JJ</option><option value="DD/MM/YYYY">JJ/MM/AAAA</option></select></label>
          <label>Convention de signe<select value={String(format.sign)} onChange={e => setFormat(f => ({ ...f, sign: Number(e.target.value) as 1 | -1 }))}><option value="1">Conserver (crédit positif)</option><option value="-1">Inverser (export GL débit positif)</option></select></label>
        </div></>}
      <button type="submit" className={styles.primary} disabled={busy || !file}>Analyser et conserver l’aperçu</button>
      <p className={styles.muted}>Un aperçu n’est pas une approbation : la source n’entre dans la revue qu’après approbation explicite.</p>
    </form>}
  </section>;
}
