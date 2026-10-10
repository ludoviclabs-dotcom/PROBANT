"use client";
import { useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import type { ProvisionMapping } from "@/lib/workpapers/provision-sources";
import { dateFr, locatorLabel, plural, SOURCE_LABELS, type ProvisionView } from "./format";
import styles from "../cash/cash.module.css";

type Kind = "pv_register" | "pv_movements" | "pv_estimates" | "pv_ledger" | "pv_annex" | "pv_support";
type Field = "key" | "amount" | "date" | "eventColumn" | "typeColumn" | "treatmentColumn" | "closedColumn" | "accountColumn" | "declaredClosingColumn" | "commitmentColumn" | "obligationColumn" | "counterpartyColumn" | "methodColumn" | "authorColumn"
  | "decisionColumn" | "decisionPieceColumn" | "decisionDateColumn" | "confidentialColumn" | "labelColumn" | "kindColumn" | "pieceColumn" | "justificationColumn" | "scenarioColumn" | "retainedColumn" | "appreciationColumn" | "openingColumn" | "rubricColumn" | "amountStatusColumn" | "sheet";
type Columns = Record<Field, string>;
const TYPES: Kind[] = ["pv_register", "pv_movements", "pv_estimates", "pv_ledger", "pv_annex", "pv_support"];
const LABELS: Record<Field, string> = { key: "Colonne identifiant", amount: "Colonne montant (euros, 2 décimales au plus)", date: "Colonne date", eventColumn: "Colonne événement", typeColumn: "Colonne type d’événement", treatmentColumn: "Colonne traitement retenu par l’entité",
  closedColumn: "Colonne date de clôture du dossier", accountColumn: "Colonne compte de provisions (15)", declaredClosingColumn: "Colonne provision de clôture déclarée", commitmentColumn: "Colonne montant d’engagement (facultative)", obligationColumn: "Colonne obligation décrite",
  counterpartyColumn: "Colonne contrepartie (facultative)", methodColumn: "Colonne méthode", authorColumn: "Colonne auteur", decisionColumn: "Colonne décision (facultative)", decisionPieceColumn: "Colonne pièce de décision (facultative)", decisionDateColumn: "Colonne date de décision (facultative)",
  confidentialColumn: "Colonne confidentiel (oui / non)", labelColumn: "Colonne libellé public", kindColumn: "Colonne nature", pieceColumn: "Colonne pièce", justificationColumn: "Colonne justification (facultative)", scenarioColumn: "Colonne scénario", retainedColumn: "Colonne retenue (oui / non)",
  appreciationColumn: "Colonne appréciation (facultative)", openingColumn: "Colonne solde d’ouverture", rubricColumn: "Colonne rubrique", amountStatusColumn: "Colonne statut du montant (publie, non_chiffre, non_fourni_prejudice)", sheet: "Feuille XLSX (obligatoire pour un classeur)" };
const VISIBLE: Record<Kind, Field[]> = {
  pv_register: ["key", "amount", "date", "labelColumn", "typeColumn", "treatmentColumn", "closedColumn", "accountColumn", "declaredClosingColumn", "commitmentColumn", "obligationColumn", "counterpartyColumn", "methodColumn", "authorColumn", "decisionColumn", "decisionPieceColumn", "decisionDateColumn", "confidentialColumn", "sheet"],
  pv_movements: ["key", "amount", "date", "eventColumn", "kindColumn", "accountColumn", "pieceColumn", "justificationColumn", "sheet"],
  pv_estimates: ["key", "amount", "date", "eventColumn", "scenarioColumn", "retainedColumn", "methodColumn", "authorColumn", "pieceColumn", "appreciationColumn", "sheet"],
  pv_ledger: ["key", "amount", "date", "openingColumn", "labelColumn", "sheet"],
  pv_annex: ["key", "amount", "date", "eventColumn", "rubricColumn", "amountStatusColumn", "labelColumn", "sheet"],
  pv_support: ["key", "amount", "date", "eventColumn", "kindColumn", "confidentialColumn", "labelColumn", "sheet"],
};
const REQUIRED: Record<Kind, Field[]> = {
  pv_register: ["key", "amount", "date", "labelColumn", "typeColumn", "treatmentColumn", "closedColumn", "accountColumn", "declaredClosingColumn", "obligationColumn", "authorColumn", "confidentialColumn"],
  pv_movements: ["key", "amount", "date", "eventColumn", "kindColumn", "accountColumn", "pieceColumn"], pv_estimates: ["key", "amount", "date", "eventColumn", "scenarioColumn", "retainedColumn", "methodColumn", "authorColumn", "pieceColumn"],
  pv_ledger: ["key", "amount", "date", "openingColumn"], pv_annex: ["key", "amount", "date", "eventColumn", "rubricColumn", "amountStatusColumn"], pv_support: ["key", "amount", "date", "kindColumn", "confidentialColumn"],
};
const blank = Object.fromEntries((["key", "amount", "date", "sheet", ...new Set(Object.values(VISIBLE).flat())] as Field[]).map(f => [f, ""])) as Columns;
const DEFAULTS: Record<Kind, Columns> = {
  pv_register: { ...blank, key: "Evenement", amount: "ProvisionOuverture", date: "DateNaissance", labelColumn: "Libelle", typeColumn: "Type", treatmentColumn: "Traitement", closedColumn: "DateCloture", accountColumn: "Compte", declaredClosingColumn: "ProvisionCloture", commitmentColumn: "MontantEngagement",
    obligationColumn: "Obligation", counterpartyColumn: "Contrepartie", methodColumn: "Methode", authorColumn: "Auteur", decisionColumn: "Decision", decisionPieceColumn: "PieceDecision", decisionDateColumn: "DateDecision", confidentialColumn: "Confidentiel" },
  pv_movements: { ...blank, key: "Ligne", amount: "Montant", date: "Date", eventColumn: "Evenement", kindColumn: "Nature", accountColumn: "Compte", pieceColumn: "Piece", justificationColumn: "Justification" },
  pv_estimates: { ...blank, key: "Ligne", amount: "Montant", date: "Date", eventColumn: "Evenement", scenarioColumn: "Scenario", retainedColumn: "Retenue", methodColumn: "Methode", authorColumn: "Auteur", pieceColumn: "Piece", appreciationColumn: "Appreciation" },
  pv_ledger: { ...blank, key: "Compte", amount: "SoldeCloture", date: "Date", openingColumn: "SoldeOuverture", labelColumn: "Libelle" },
  pv_annex: { ...blank, key: "Ligne", amount: "Montant", date: "Date", eventColumn: "Evenement", rubricColumn: "Rubrique", amountStatusColumn: "StatutMontant", labelColumn: "Libelle" },
  pv_support: { ...blank, key: "Piece", amount: "Pages", date: "Date", eventColumn: "Evenement", kindColumn: "Nature", confidentialColumn: "Confidentiel", labelColumn: "Libelle" },
};
const MEANING: Record<Kind, string> = {
  pv_register: "Une ligne par événement ouvert, nouveau ou clos, avec ou sans écriture : provision à l’ouverture (colonne montant, 0 si aucune), date de naissance, traitement retenu par l’entité, obligation décrite, auteur, décision et confidentialité. Le libellé est public ; l’obligation, la contrepartie, la méthode et la décision d’un événement confidentiel sont masquées sans habilitation.",
  pv_movements: "Dotations, utilisations (reprises utilisées) et reprises non utilisées de l’exercice, chacune sur le compte de son événement et avec sa pièce. Le journal couvre l’exercice entier : un événement sans ligne n’a pas eu de mouvement.",
  pv_estimates: "Estimations documentées par événement : un scénario par ligne, une seule hypothèse retenue, méthode, auteur et pièce. Aucune probabilité n’est multipliée par un montant.",
  pv_ledger: "Soldes des comptes de provisions (15) : la colonne identifiant porte le compte, la colonne montant le solde de clôture, la colonne d’ouverture le solde à l’ouverture.",
  pv_annex: "Informations publiées en annexe, rattachées chacune à un événement : rubrique, montant publié, ou 0 avec le statut non_chiffre ou non_fourni_prejudice (le montant est alors inconnu, jamais nul).",
  pv_support: "Pièces citables : contrats, dossiers de risque, correspondances, estimations, décisions, jugements. Colonne montant : nombre de pages. Une pièce confidentielle voit son libellé masqué sans habilitation.",
};
const BASES = { pv_register: "register", pv_movements: "movements", pv_estimates: "estimates", pv_ledger: "ledger", pv_annex: "annex", pv_support: "support" } as const;
export function buildProvisionMapping(type: Kind, c: Columns, f: { delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY" }, period: AccountingPeriod): ProvisionMapping {
  const named = Object.fromEntries(VISIBLE[type].filter(k => !["key", "amount", "date", "sheet"].includes(k) && c[k].trim()).map(k => [k, c[k].trim()]));
  return { version: "provisions-1", headerRow: 1, ...(c.sheet.trim() ? { sheet: c.sheet.trim() } : {}), columns: { key: c.key.trim(), amount: c.amount.trim(), date: c.date.trim() }, delimiter: f.delimiter, decimal: f.decimal, dateFormat: f.dateFormat, sign: 1, currency: "EUR",
    provisions: { basis: BASES[type], ...named, ...(type === "pv_movements" ? { coverageFrom: period.startDate, coverageTo: period.closingDate } : {}) } as ProvisionMapping["provisions"] };
}
export function ProvisionImportPanel({ view, period, periodId, busy, canPrepare, dossierId, onPreview, onApprove }: { view: ProvisionView; period: AccountingPeriod; periodId: string; busy: boolean; canPrepare: boolean; dossierId: string; onPreview(data: FormData): void; onApprove(command: { importId: string; previewHash: string; expectedSourceId: string | null }): void }) {
  const [type, setType] = useState<Kind>("pv_register"), [file, setFile] = useState<File | null>(null), [columns, setColumns] = useState<Columns>(DEFAULTS.pv_register);
  const [format, setFormat] = useState<{ delimiter: ";" | "," | "\t"; decimal: "," | "."; dateFormat: "ISO" | "DD/MM/YYYY" }>({ delimiter: ";", decimal: ",", dateFormat: "ISO" });
  const headOf = (t: string) => view.sourceHeads.find(h => h.document_type === t)?.import_id ?? null;
  const download = (id: string) => "/api/workpapers/provisions?" + new URLSearchParams({ dossierId, periodId, operation: "download", id });
  const canDownload = view.permissions.includes("download");
  return <section className={styles.card} aria-labelledby="pv-sources-title">
    <header><h2 id="pv-sources-title">Pièces et sources qualifiées</h2><span className={styles.muted}>Registre et grand livre requis · mouvements, estimations, annexe et pièces conditionnels</span></header>
    <ul className={styles.list}>{TYPES.map(t => {
      const batches = view.imports.filter(b => b.document.documentType === t), current = batches.find(b => b.id === headOf(t)), history = view.versions[t] ?? [], version = history.find(v => v.current);
      return <li key={t}>
        <div className={styles.kv}><strong>{SOURCE_LABELS[t]}</strong>{!current && <span className={styles.muted}>{t === "pv_register" || t === "pv_ledger" ? "Requis — absent (bloquant)" : "Conditionnel — absent (comparaison non réalisée)"}</span>}</div>
        {current && <p className={styles.muted}>{current.document.fileName} · {plural(current.rowCount ?? current.rows.length, "ligne")}{current.maskedRows ? " · " + plural(current.maskedRows, "ligne confidentielle retirée", "lignes confidentielles retirées") + " de l’affichage" : ""} · approuvée par {current.approval?.actorId} le {dateFr(current.approval!.at.slice(0, 10))}
          {t === "pv_movements" ? " · journal couvrant l’exercice entier" : ""}
          {history.length > 1 && <> · <strong>{plural(history.length - 1, "version remplacée", "versions remplacées")} conservée{history.length > 2 ? "s" : ""}</strong> ({history.filter(v => !v.current).map(v => v.fileName + " · " + v.sha256.slice(0, 10)).join(" ; ")})</>}
          {canDownload && (version?.confidential && !view.confidentialAccess ? " · original confidentiel (habilitation requise)" : <> · <a href={download(current.document.id)}>original</a></>)}</p>}
        {batches.filter(b => !b.approval).map(b => <div key={b.id} className={styles.sourceBox}>
          <p><strong>Aperçu à approuver</strong> · {b.document.fileName} · {plural(b.rowCount ?? b.rows.length, "ligne")} · {b.report.acceptedRows} acceptée(s) · {b.report.rejectedRows} rejetée(s)</p>
          {(b.report.warnings.length > 0 || b.report.blocking.length > 0) && <p className={styles.notice} data-tone={b.report.blocking.length ? "danger" : undefined}>{[...b.report.blocking.map(x => "Bloquant : " + x), ...b.report.warnings].join(" · ")}</p>}
          {b.rows.length > 0 && <details><summary>Comparer les premières lignes : source → normalisé</summary><div className={styles.preview} tabIndex={0} role="region" aria-label={"Aperçu de " + b.document.fileName}>{b.rows.slice(0, 5).map(r => <p key={r.id}>{locatorLabel(r.locator)} · {Object.entries(r.original).map(([k, v]) => k + "=" + v).join(" ; ")} → {r.normalized ? r.normalized.key + " · " + r.normalized.amount.amount.replace(".", ",") + " · " + r.normalized.date : "rejetée : " + r.errors.join(", ")}</p>)}</div></details>}
          {canPrepare && <button type="button" className={styles.primary} disabled={busy || b.report.blocking.length > 0} onClick={() => onApprove({ importId: b.id, previewHash: b.previewHash, expectedSourceId: headOf(t) })}>Approuver cette version{headOf(t) ? " (remplace la version courante, conservée)" : ""}</button>}
        </div>)}
      </li>;
    })}</ul>
    {canPrepare && <form onSubmit={e => {
      e.preventDefault(); if (!file) return;
      const data = new FormData(); data.set("file", file); data.set("documentType", type); data.set("period", JSON.stringify(period)); data.set("mapping", JSON.stringify(buildProvisionMapping(type, columns, format, period)));
      onPreview(data);
    }}>
      <h3>Qualifier une source</h3>
      <div className={styles.fields}>
        <label>Type de source<select value={type} disabled={busy} onChange={e => { const t = e.target.value as Kind; setType(t); setColumns(DEFAULTS[t]); }}>{TYPES.map(t => <option key={t} value={t}>{SOURCE_LABELS[t]}</option>)}</select></label>
        <label>Fichier CSV ou XLSX (3 Mio maximum)<input type="file" accept=".csv,.xlsx" required disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
      </div>
      <p className={styles.muted}>{MEANING[type]}</p>
      <div className={styles.fields}>{VISIBLE[type].map(k => <label key={k}>{LABELS[k]}<input value={columns[k]} disabled={busy} required={REQUIRED[type].includes(k) || (k === "sheet" && !!file?.name.toLowerCase().endsWith(".xlsx"))} onChange={e => setColumns(c => ({ ...c, [k]: e.target.value }))}/></label>)}</div>
      <div className={styles.fields}>
        <label>Séparateur<select value={format.delimiter} onChange={e => setFormat(f => ({ ...f, delimiter: e.target.value as ";" | "," | "\t" }))}><option value=";">Point-virgule</option><option value=",">Virgule</option><option value={"\t"}>Tabulation</option></select></label>
        <label>Décimales<select value={format.decimal} onChange={e => setFormat(f => ({ ...f, decimal: e.target.value as "," | "." }))}><option value=",">Virgule</option><option value=".">Point</option></select></label>
        <label>Dates<select value={format.dateFormat} onChange={e => setFormat(f => ({ ...f, dateFormat: e.target.value as "ISO" | "DD/MM/YYYY" }))}><option value="ISO">AAAA-MM-JJ</option><option value="DD/MM/YYYY">JJ/MM/AAAA</option></select></label>
      </div>
      <button type="submit" className={styles.primary} disabled={busy || !file}>Analyser et conserver l’aperçu</button>
      <p className={styles.muted}>Un aperçu n’est pas une approbation : la source n’entre dans la feuille qu’après approbation explicite. Une ligne mal formée est refusée avec sa cellule (sans en répéter le contenu s’il peut être confidentiel).</p>
    </form>}
  </section>;
}
