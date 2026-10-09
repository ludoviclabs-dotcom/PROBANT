"use client";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { VatResult } from "@/lib/workpapers/fiscal-vat";
import { VAT_ROLE_LABELS } from "@/lib/workpapers/fiscal-labels";
import { CATEGORY_LABELS, cents, COVERAGE_LABELS, CONTROL_LABELS, dateFr, locatorLabel, rate, SIGNAL_LABELS } from "./format";
import type { FiscalSelection, FiscalView } from "./types";
import styles from "../cash/cash.module.css";

export interface FiscalDetailHandle { focus(): void }
interface Props { selection: FiscalSelection; result: VatResult | null; view: FiscalView; dossierId: string; periodId: string; onEntry(id: string): void; onLine(code: string): void; onReturn(): void }
/** Side panel: a declaration line with its entries, an entry with its FEC lines and its piece, an observed rate or a blocked rule. */
export const FiscalDetailPanel = forwardRef<FiscalDetailHandle, Props>(function FiscalDetailPanel({ selection, result, view, dossierId, periodId, onEntry, onLine, onReturn }, ref) {
  const heading = useRef<HTMLHeadingElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => heading.current?.focus() }), []);
  const close = (e: React.KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onReturn(); } };
  const canDownload = view.permissions.includes("download");
  const download = (id: string) => "/api/workpapers/fiscal?" + new URLSearchParams({ dossierId, periodId, operation: "download", id });
  const entryLink = (id: string) => { const e = result?.entries.find(x => x.id === id); return e && <li key={id}><button type="button" onClick={() => onEntry(id)}>{e.journalCode} {e.ecritureNum} · {dateFr(e.date)} · TVA {cents(e.vatCents)}</button></li>; };
  const empty = <><h2 ref={heading} tabIndex={-1}>Détail et source</h2><p className={styles.muted}>Choisissez une ligne de déclaration, une écriture, un taux constaté ou une règle bloquée. Échap revient à l’élément d’origine.</p></>;
  let body: React.ReactNode = empty;
  if (selection && result) {
    if (selection.kind === "line") {
      const l = result.declaration.lines.find(x => x.code === selection.id);
      body = !l ? <><h2 ref={heading} tabIndex={-1}>Case {selection.id}</h2><p className={styles.muted}>Case absente de la déclaration de cette version.</p></> : <>
        <h2 ref={heading} tabIndex={-1}>Case {l.code} — {l.label}</h2>
        <dl><dt>Montant déclaré</dt><dd className={styles.money}>{cents(l.amountCents)}</dd><dt>Rôle</dt><dd>{l.role ? VAT_ROLE_LABELS[l.role] : "Case non utilisée par le rapprochement"}</dd>
          <dt>Lecture moteur</dt><dd>{l.readByEngine ? "Lue par le moteur TVA" : "Non lue"}</dd><dt>Statut du champ</dt><dd>{l.processingStatus}{l.warnings.length ? " · " + l.warnings.join(", ") : ""}</dd></dl>
        <div className={styles.sourceBox}><p><strong>Pièce</strong> {result.declaration.fileName}</p><dl><dt>Version</dt><dd><code>{result.declaration.documentVersionId}</code></dd><dt>SHA-256</dt><dd><code>{result.declaration.sha256}</code></dd><dt>Localisation</dt><dd>{locatorLabel(l.locator)}</dd></dl>
          {canDownload && result.declaration.documentVersionId && <a href={download(result.declaration.documentVersionId)}>Télécharger cette version</a>}</div>
        <h3>Écritures liées ({l.candidateIds.length})</h3>
        {l.candidateIds.length ? <ul className={styles.list}>{l.candidateIds.map(entryLink)}</ul> : <p className={styles.muted}>Aucune écriture rattachée à ce rôle.</p>}</>;
    } else if (selection.kind === "entry") {
      const e = result.entries.find(x => x.id === selection.id);
      body = !e ? <><h2 ref={heading} tabIndex={-1}>Écriture</h2><p className={styles.muted}>Écriture absente de cette version.</p></> : <>
        <h2 ref={heading} tabIndex={-1}>{e.journalCode} {e.ecritureNum} — {e.direction === "collected" ? "TVA collectée" : "TVA déductible"}{e.creditNote ? " (avoir)" : ""}</h2>
        <dl><dt>Date d’écriture</dt><dd>{dateFr(e.date)}</dd><dt>Pièce / date</dt><dd>{e.pieceRef ?? "Non référencée"} · {e.pieceDate ? dateFr(e.pieceDate) : "date absente"}</dd>
          <dt>Base HT</dt><dd className={styles.money}>{cents(e.baseCents)}</dd><dt>TVA</dt><dd className={styles.money}>{cents(e.vatCents)}</dd>
          <dt>Taux constaté</dt><dd>{rate(e.observedRateBasisPoints)} — constat, non approuvé comme taux légal</dd><dt>Comptes</dt><dd>{[...e.baseAccounts, ...e.vatAccounts].join(", ")}</dd>
          <dt>Lignes FEC</dt><dd>{e.lines.map(n => "ligne " + (n + 1)).join(", ")}</dd><dt>Signaux</dt><dd>{e.signals.length ? e.signals.map(s => SIGNAL_LABELS[s] ?? s).join(" · ") : "Aucun"}</dd></dl>
        <div className={styles.sourceBox}><p><strong>Pièce de l’inventaire</strong></p>
          {e.piece.status === "found" ? <><dl><dt>Référence</dt><dd>{e.piece.ref} · {dateFr(e.piece.date)}</dd><dt>TVA / base</dt><dd>{cents(e.piece.vatCents)} / {cents(e.piece.baseCents)}</dd><dt>Libellé</dt><dd>{e.piece.label || "—"}</dd>
            <dt>Fichier</dt><dd>{e.piece.fileName} · {locatorLabel(e.piece.locator)}</dd><dt>Version</dt><dd><code>{e.piece.documentVersionId}</code></dd></dl>{canDownload && <a href={download(e.piece.documentVersionId)}>Télécharger l’inventaire (cette version)</a>}</>
            : e.piece.status === "missing" ? <p>Référence {e.piece.ref ?? "absente"} introuvable dans l’inventaire fourni. Une pièce absente de PROBANT n’est pas une pièce absente du dossier.</p> : <p className={styles.muted}>Inventaire des pièces non fourni : la pièce n’est pas recherchée.</p>}</div>
        <h3>Lignes de déclaration concernées</h3><ul className={styles.list}>{result.declaration.lines.filter(l => l.candidateIds.includes(e.id)).map(l => <li key={l.code}><button type="button" onClick={() => onLine(l.code)}>Case {l.code} — {l.label}</button></li>)}</ul></>;
    } else if (selection.kind === "rate") {
      const r = result.rates.find(x => x.key === selection.id);
      body = !r ? empty : <><h2 ref={heading} tabIndex={-1}>{r.direction === "collected" ? "Collectée" : "Déductible"} · {rate(r.rateBasisPoints)}</h2>
        <p className={styles.notice} data-tone="info">{r.origin}</p>
        <dl><dt>Base HT</dt><dd className={styles.money}>{cents(r.baseCents)}</dd><dt>TVA comptabilisée</dt><dd className={styles.money}>{cents(r.vatAccountedCents)}</dd><dt>TVA théorique</dt><dd className={styles.money}>{cents(r.vatTheoreticalCents)}</dd>
          <dt>Part de la base</dt><dd>{(r.shareOfBaseBasisPoints / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %</dd></dl>
        <h3>Écritures d’origine</h3><ul className={styles.list}>{r.entryIds.map(entryLink)}</ul></>;
    } else {
      const r = result.blockedRules.find(x => x.code === selection.id);
      body = !r ? empty : <><h2 ref={heading} tabIndex={-1}>{r.label}</h2><p>{CATEGORY_LABELS[r.category]} · {r.code}</p><p>{r.message}</p>
        {r.controls.length > 0 && <p className={styles.muted}>Contrôles : {r.controls.map(c => CONTROL_LABELS[c] ?? c).join(" · ")}</p>}
        <div className={styles.sourceBox}><p><strong>Source requise</strong></p><p>{r.requiredSource}</p>
          {r.sources.map(s => <dl key={s.sourceId}><dt>Texte</dt><dd>{s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> : s.title} ({s.publisher})</dd><dt>Couverture</dt><dd>{COVERAGE_LABELS[s.coverage]}{s.uncoveredFromDate ? " — non couvert à partir du " + dateFr(s.uncoveredFromDate) : ""}</dd>
            <dt>Versions</dt><dd>{s.versions.map(v => v.label + " [" + v.status + "]").join(" ; ") || "Aucune"}</dd><dt>Vérifié le</dt><dd>{dateFr(s.lastVerifiedAt)}</dd></dl>)}</div></>;
    }
  }
  return <aside className={styles.detail} data-open={!!selection} aria-label="Détail et source" onKeyDown={close}>{body}</aside>;
});
