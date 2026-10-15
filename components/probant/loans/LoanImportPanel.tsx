"use client";
import { useState } from "react";
import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { LOAN_LABELS, LOAN_MAPPING, LOAN_TYPES, type LoanType } from "@/lib/workpapers/loan-review";
import { dateFr, plural, type LoanView } from "./format";
import styles from "../cash/cash.module.css";
import l from "./loans.module.css";

const MEANING: Record<LoanType, string> = {
  loan_contracts: "Une ligne par version (contrat initial, avenant) : nominal, date d’effet ; Details porte nature, comptes, taux fixe ou index + marge + dates de révision, convention de jours, frais, exhaustivité et la clause citée.",
  loan_schedule: "Une ligne par échéance : principal (0.00 si intérêts seuls), date d’exigibilité ; Details porte l’intervalle d’intérêts, la version du contrat, intérêts et frais de l’échéancier.",
  loan_ledger: "Extrait du grand livre par contrat : ouverture et clôture du principal, tirages, remboursements, intérêts, intérêts courus (ouverture et clôture), frais, avec compte et échéance reliée.",
  loan_payments: "Prélèvements ou virements du relevé, séparés en principal, intérêts et frais, reliés à l’échéance.",
  loan_confirmations: "Capital restant dû confirmé par le prêteur à la clôture.",
  loan_clauses: "Garanties et covenants : statut de lecture, définition contractuelle, seuil (texte du contrat) et date de test. Montant sans objet (0.00).",
  loan_rates: "Avis de révision des taux variables : date de révision (date de la ligne), index et valeur publiée, date de fixation. Montant sans objet (0.00).",
  loan_balance: "Balance des comptes de dettes financières à la clôture : une ligne par compte, solde créditeur ; sert au cadrage du périmètre.",
};
/** Known file-name prefixes only: an ambiguous name is never classified by guess. */
export function typeFromName(name: string): LoanType | null {
  const lower = name.toLowerCase(), found = LOAN_TYPES.filter(t => lower.startsWith(t + ".") || lower.startsWith(t + "_") || lower.startsWith("exemple-" + t + "."));
  return found.length === 1 ? found[0] : null;
}

export function LoanImportPanel({ view, period, periodId, busy, canPrepare, dossierId, demo, onPreview, onApprove }: { view: LoanView; period: AccountingPeriod; periodId: string; busy: boolean; canPrepare: boolean; dossierId: string; demo: boolean;
  onPreview(data: FormData): void; onApprove(command: { importId: string; previewHash: string; expectedSourceId: string | null }): void }) {
  const [type, setType] = useState<LoanType>("loan_contracts"), [file, setFile] = useState<File | null>(null), [sheet, setSheet] = useState("");
  const headOf = (t: string) => view.sourceHeads.find(h => h.document_type === t)?.import_id ?? null;
  const canDownload = !demo && view.permissions.includes("download");
  const download = (id: string) => "/api/workpapers/emprunts?" + new URLSearchParams({ dossierId, periodId, operation: "download", id });
  return <section className={l.section} aria-labelledby="ln-sources-title">
    <header><h2 id="ln-sources-title">Sources du pack Emprunts</h2><span className={styles.muted}>Grand livre requis · contrats, échéancier, paiements, confirmations, clauses, révisions de taux et balance pour conclure</span></header>
    <ul className={l.uploadTypes}>{LOAN_TYPES.map(t => {
      const current = view.imports.find(b => b.id === headOf(t)), pending = view.imports.filter(b => b.document.documentType === t && !b.approval);
      return <li key={t}><strong>{LOAN_LABELS[t]}</strong>
        <p className={styles.muted}>{current ? current.document.fileName + " · " + plural(current.rowCount ?? current.rows.length, "ligne") + (current.approval ? " · approuvée le " + dateFr(current.approval.at.slice(0, 10)) : "") : t === "loan_ledger" ? "Requis — absent" : "Absent : les contrôles qui en dépendent restent non concluants"}</p>
        {current && demo && <DossierContextAnchor href={"/api/workpapers/emprunts/demo?source=" + t}>Télécharger le pack d’exemple</DossierContextAnchor>}
        {current && canDownload && <DossierContextAnchor href={download(current.document.id)}>Original de cette version</DossierContextAnchor>}
        {pending.map(b => <div key={b.id} className={styles.sourceBox}>
          <p><strong>Aperçu à approuver</strong> · {b.document.fileName} · {plural(b.rowCount ?? b.rows.length, "ligne")} · {b.report.acceptedRows} acceptée(s) · {b.report.rejectedRows} rejetée(s)</p>
          {(b.report.blocking.length > 0 || b.report.warnings.length > 0) && <p className={styles.notice} data-tone={b.report.blocking.length ? "danger" : undefined}>{[...b.report.blocking.map(x => "Bloquant : " + x), ...b.report.warnings].join(" · ")}</p>}
          {canPrepare && <button type="button" className={styles.primary} disabled={busy || b.report.blocking.length > 0} onClick={() => onApprove({ importId: b.id, previewHash: b.previewHash, expectedSourceId: headOf(t) })}>Approuver cette version{headOf(t) ? " (remplace la version courante, conservée)" : ""}</button>}
        </div>)}
      </li>; })}</ul>
    {canPrepare && !demo && <form onSubmit={e => {
      e.preventDefault(); if (!file) return;
      const data = new FormData(); data.set("file", file); data.set("documentType", type); data.set("period", JSON.stringify(period)); data.set("mapping", JSON.stringify({ ...LOAN_MAPPING, ...(sheet.trim() ? { sheet: sheet.trim() } : {}) }));
      onPreview(data);
    }}>
      <h3>Ajouter ou remplacer une source</h3>
      <div className={styles.fields + " " + l.form}>
        <label>Fichier CSV ou XLSX (colonnes Key ; Amount ; Date ; Details)<input type="file" accept=".csv,.xlsx" required disabled={busy} onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); const t = f ? typeFromName(f.name) : null; if (t) setType(t); }}/></label>
        <label>Type de source<select value={type} disabled={busy} onChange={e => setType(e.target.value as LoanType)}>{LOAN_TYPES.map(t => <option key={t} value={t}>{LOAN_LABELS[t]}</option>)}</select></label>
        {file?.name.toLowerCase().endsWith(".xlsx") && <label>Feuille XLSX (obligatoire pour un classeur)<input value={sheet} required onChange={e => setSheet(e.target.value)}/></label>}
      </div>
      <p className={styles.muted}>{MEANING[type]}</p>
      <button type="submit" className={styles.primary} disabled={busy || !file}>Lire et conserver l’aperçu</button>
      <p className={styles.muted}>Un aperçu n’est pas une approbation. Le type est proposé d’après un préfixe de nom connu (loan_contracts, loan_schedule…), jamais deviné pour un nom ambigu. Aucun PDF n’est lu automatiquement : la transcription vient de la pièce originale lue par une personne.</p>
    </form>}
  </section>;
}
