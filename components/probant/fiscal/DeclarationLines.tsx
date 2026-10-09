"use client";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { VatResult } from "@/lib/workpapers/fiscal-vat-contract";
import { VAT_ROLE_LABELS } from "@/lib/workpapers/fiscal-labels";
import { cents, dateFr, locatorLabel, plural } from "./format";
import type { FiscalSelection } from "./types";
import styles from "../cash/cash.module.css";
import fx from "./fiscal.module.css";

export interface DeclarationLinesHandle { focusLine(code: string): boolean }
/**
 * Declaration line → entries → piece. A line opens the VAT entries the engine relates to its role (collected, deductible, net);
 * an entry opens its FEC lines and its piece in the side panel. Only the row expansion is animated.
 */
export const DeclarationLines = forwardRef<DeclarationLinesHandle, { result: VatResult; expanded: string[]; selection: FiscalSelection; onToggle(code: string): void; onEntry(id: string): void; onLine(code: string): void }>(
  function DeclarationLines({ result, expanded, selection, onToggle, onEntry, onLine }, ref) {
    const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
    useImperativeHandle(ref, () => ({ focusLine: (code: string) => { const b = buttons.current[code]; if (b) { b.focus(); return true; } return false; } }), []);
    const d = result.declaration;
    if (!d.lines.length) return <section className={styles.card} aria-labelledby="fx-lines-title"><header><h2 id="fx-lines-title">Lignes de la déclaration</h2></header>
      <p className={styles.muted}>{d.status === "absent" ? "Aucune déclaration de la période : les écritures restent un signal (FEC seul). Importez la CA3 / CA12 de la période dans Pièces." : "Aucune ligne lisible."}</p></section>;
    return <section className={styles.card} aria-labelledby="fx-lines-title">
      <header><h2 id="fx-lines-title">Lignes de la déclaration</h2><span className={styles.muted}>{d.formNumber} millésime {d.formVintage} · {d.fileName} · version {d.documentVersionId?.slice(7, 19)} · SHA-256 {d.sha256?.slice(0, 12)}…</span></header>
      <p className={styles.muted}>Une ligne ouvre les écritures de TVA correspondantes, puis chaque écriture ouvre sa pièce. Les cases non lues par le moteur sont affichées pour mémoire.</p>
      <ul className={styles.list}>{d.lines.map(l => {
        const open = expanded.includes(l.code), entries = result.entries.filter(e => l.candidateIds.includes(e.id));
        return <li key={l.rowId}>
          <button type="button" ref={el => { buttons.current[l.code] = el; }} className={fx.lineButton} aria-expanded={entries.length ? open : undefined} aria-controls={entries.length ? "fx-line-" + l.code : undefined}
            onClick={() => { if (entries.length) onToggle(l.code); onLine(l.code); }}>
            <span className={fx.chevron} aria-hidden="true">{entries.length ? "▸" : "·"}</span>
            <span><strong>Case {l.code}</strong> — {l.label}{l.role ? " · " + VAT_ROLE_LABELS[l.role] : ""}<br/><span className={styles.muted}>{locatorLabel(l.locator)}{l.readByEngine ? " · lue par le moteur" : " · non lue par le moteur"}{l.warnings.length ? " · " + l.warnings.join(", ") : ""}</span></span>
            <span className={styles.money}>{cents(l.amountCents)}</span>
            <span className={styles.muted}>{entries.length ? plural(entries.length, "écriture") : "—"}</span>
          </button>
          {entries.length > 0 && <div className={fx.expand} data-open={open} id={"fx-line-" + l.code} aria-hidden={!open}><div>
            <ul className={fx.entries} aria-label={"Écritures liées à la case " + l.code}>{entries.map(e => <li key={e.id}>
              <button type="button" tabIndex={open ? 0 : -1} aria-pressed={selection?.kind === "entry" && selection.id === e.id} onClick={() => onEntry(e.id)}>
                <span>{e.journalCode} {e.ecritureNum} · {dateFr(e.date)} · pièce {e.pieceRef ?? "non référencée"}{e.creditNote ? " · avoir" : ""}</span>
                <span className={styles.money}>TVA {cents(e.vatCents)}</span>
                <span className={styles.muted}>{e.piece.status === "found" ? "Pièce trouvée" : e.piece.status === "missing" ? "Pièce absente de l’inventaire" : "Inventaire non fourni"}</span>
              </button></li>)}</ul>
          </div></div>}
        </li>;
      })}</ul>
      {d.issues.length > 0 && <details className={styles.altTable}><summary>{plural(d.issues.length, "case attendue non lue", "cases attendues non lues")}</summary><ul>{d.issues.map(i => <li key={i.fieldCode + i.reason}>Case {i.fieldCode} : {i.detail}</li>)}</ul></details>}
    </section>;
  });
