"use client";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { KnownAmount, Money } from "@/lib/canonical-model/money";
import type { EquityResult } from "@/lib/workpapers/capitaux-review";
import type { EqComponent, EqNature } from "@/lib/workpapers/capitaux-sources";
import { columnLabel, dateFr, eur, NATURE_LABELS } from "./format";
import styles from "../cash/cash.module.css";
import eq from "./equity.module.css";

export type VariationMode = "rebuilt" | "provided" | "differences";
export interface VariationTableHandle { focusComponent(component: EqComponent): boolean }
const MODES: { id: VariationMode; label: string }[] = [{ id: "rebuilt", label: "Reconstitué (balance + écritures)" }, { id: "provided", label: "Fourni par l’entité" }, { id: "differences", label: "Écarts fourni − reconstitué" }];
interface Props { result: EquityResult; mode: VariationMode; onMode(mode: VariationMode): void; expanded: EqComponent[]; onToggle(component: EqComponent): void; selectedMovement: string | null; onSelectMovement(entryId: string): void }
/** Horizontal statement of changes: one row per component, one column per nature; every value comes from the server result. */
export const VariationTable = forwardRef<VariationTableHandle, Props>(function VariationTable({ result, mode, onMode, expanded, onToggle, selectedMovement, onSelectMovement }, ref) {
  const root = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ focusComponent: (component) => { const el = root.current?.querySelector<HTMLButtonElement>(`[data-toggle="${component}"]`); el?.focus(); return !!el; } }), []);
  const cells = result.statement.cells, cell = (component: EqComponent, column: string) => cells.find(c => c.component === component && c.column === column) ?? null;
  const natures: EqNature[] = mode === "rebuilt" ? result.natures : [...new Set([...result.natures, ...cells.map(c => c.column).filter((c): c is EqNature => c !== "ouverture" && c !== "cloture")])].filter(n => (Object.keys(NATURE_LABELS) as EqNature[]).includes(n)).sort((a, b) => (Object.keys(NATURE_LABELS) as string[]).indexOf(a) - (Object.keys(NATURE_LABELS) as string[]).indexOf(b));
  const amount = (m: Money | null | undefined, signed = false) => m ? eur(m, { signed }) : "—";
  const providedOrDiff = (component: EqComponent, column: string) => {
    const c = cell(component, column);
    if (!c) return { text: "—", tone: undefined as string | undefined, title: "Cellule non comparée" };
    if (mode === "provided") return { text: c.provided ? eur(c.provided) : "Absent", tone: c.provided ? undefined : "danger", title: c.provided ? "Valeur du tableau fourni" : "Absent du tableau fourni : non lu comme nul" };
    return c.difference.kind === "known" ? { text: eur(c.difference.value, { signed: true }), tone: c.difference.value.amount === "0.00" ? "ok" : "danger", title: "Fourni − reconstitué" } : { text: "Non comparé", tone: "danger", title: c.difference.reason };
  };
  // An unknown total stays « Inconnu » in the figures column; its cause is given in the title and above the table.
  const total = (v: KnownAmount, signed = false) => <td title={v.kind === "known" ? undefined : v.reason}>{v.kind === "known" ? eur(v.value, { signed }) : "Inconnu"}</td>;
  const columns = mode === "rebuilt" ? 2 + natures.length + 3 : 2 + natures.length + 1;
  const statementMissing = mode !== "rebuilt" && !result.statement.provided;
  return <div ref={root}>
    <div role="radiogroup" aria-label="Vue du tableau de variation" className={eq.viewPick} onKeyDown={e => {
      if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
      e.preventDefault();
      const next = MODES[(MODES.findIndex(m => m.id === mode) + (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1) + MODES.length) % MODES.length];
      onMode(next.id); (e.currentTarget.querySelector(`[data-mode="${next.id}"]`) as HTMLElement | null)?.focus();
    }}>{MODES.map(m => <button key={m.id} type="button" role="radio" data-mode={m.id} aria-checked={mode === m.id} tabIndex={mode === m.id ? 0 : -1} onClick={() => onMode(m.id)}>{m.label}</button>)}</div>
    {statementMissing && <p className={styles.notice}>Tableau de variation fourni absent : aucune cellule n’est comparée, aucune valeur n’est réputée nulle.</p>}
    <p className={styles.muted + " " + eq.lead}>Ouvrez une composante pour ses comptes et ses mouvements ; un mouvement choisi est mis en évidence et détaillé dans le panneau.</p>
    <div className={styles.tableScroll + " " + eq.free} role="region" aria-label="Tableau de variation — défilement horizontal" tabIndex={0}>
      <table className={eq.variation}>
        <caption>{mode === "rebuilt" ? "Tableau reconstitué (balance + écritures) — EUR, + augmente / − diminue" : mode === "provided" ? "Tableau fourni par l’entité — cellule absente = « Absent »" : "Écart fourni − reconstitué — « Non comparé » si une valeur manque"}</caption>
        <thead><tr><th scope="col">Composante</th><th scope="col">Ouverture</th>{natures.map(n => <th key={n} scope="col">{NATURE_LABELS[n]}</th>)}
          {mode === "rebuilt" ? <><th scope="col">Clôture attendue</th><th scope="col">Clôture observée</th><th scope="col">Écart</th></> : <th scope="col">Clôture</th>}</tr></thead>
        <tbody>
          {result.components.map(c => {
            const open = expanded.includes(c.component), entries = result.entries.filter(e => e.component === c.component);
            const statusText = c.status === "excluded" ? "Exclue du total" : c.status === "incomplete" ? "Incomplète" : c.difference.kind === "known" && c.difference.value.amount !== "0.00" ? "Écart à expliquer" : "Pont équilibré";
            return [<tr key={c.component} data-row="component" data-status={c.status}>
              <th scope="row"><button type="button" data-toggle={c.component} aria-expanded={open} aria-controls={"eq-expansion-" + c.component} onClick={() => onToggle(c.component)}><span aria-hidden="true" className={eq.chevron}>▸</span>{c.label}</button><span className={styles.meaning}>{statusText}{c.accounts.length ? " · " + c.accounts.map(a => a.account).join(", ") : ""}</span></th>
              {mode === "rebuilt" ? <>
                <td>{amount(c.opening)}</td>{natures.map(n => <td key={n}>{c.movements[n] ? eur(c.movements[n]!, { signed: true }) : "—"}</td>)}
                <td>{amount(c.expected)}</td><td>{amount(c.closing)}</td>
                <td data-col="difference" data-tone={c.difference.kind === "known" ? (c.difference.value.amount === "0.00" ? "ok" : "danger") : undefined} title={c.difference.kind === "known" ? "Clôture observée − clôture attendue" : c.difference.reason}>{c.status === "excluded" ? "Exclue" : c.difference.kind === "known" ? eur(c.difference.value, { signed: true }) : "Inconnu"}</td>
              </> : [...["ouverture", ...natures, "cloture"].map(col => { const v = c.inScope ? providedOrDiff(c.component, col) : { text: "Exclue", tone: undefined, title: c.exclusionReason ?? "" }; return <td key={col} data-tone={v.tone} title={v.title}>{v.text}</td>; })]}
            </tr>,
            open && <tr key={c.component + ":x"} id={"eq-expansion-" + c.component} data-row="expansion"><td colSpan={columns}>
              <div className={eq.expansion}>
                <section aria-label={"Comptes de " + c.label}><h4>Comptes</h4>{c.accounts.length ? <dl>{c.accounts.map(a => [<dt key={a.account}>{a.account}{a.label ? " · " + a.label : ""}</dt>, <dd key={a.account + "o"}>{a.opening ? eur(a.opening) : "ouverture absente"}</dd>, <dd key={a.account + "c"}>{a.closing ? eur(a.closing) : "clôture absente"}</dd>])}</dl> : <p className={styles.muted}>Aucun compte fourni pour cette composante.</p>}
                  {c.missing.length > 0 && <p className={styles.notice} data-tone="danger">{c.missing.join(" ")} Aucune valeur réputée nulle.</p>}
                  {c.exclusionReason && <p className={styles.muted}>{c.exclusionReason}</p>}</section>
                <section aria-label={"Mouvements de " + c.label}><h4>Mouvements de l’exercice ({entries.length})</h4>
                  {entries.length ? <ul className={eq.movements}>{entries.map(e => <li key={e.entryId}><button type="button" aria-current={selectedMovement === e.entryId || undefined} onClick={() => onSelectMovement(e.entryId)}>
                    <span>{e.entryId}</span><span>{dateFr(e.date)}</span><span>{NATURE_LABELS[e.nature]}{e.decisionRef ? " · décision " + e.decisionRef : ""}{e.transferRef ? " · transfert " + e.transferRef : ""}{e.effectStatus === "outside_period" && <span className={eq.flag} data-tone="warn">effet hors période</span>}{(e.decisionStatus === "without_decision" || e.decisionStatus === "unknown_decision") && <span className={eq.flag} data-tone="danger">sans décision</span>}</span>
                    <span className={eq.amount}>{eur(e.amount, { signed: true })}</span></button></li>)}</ul> : <p className={styles.muted}>Aucun mouvement : la clôture est comparée à l’ouverture.</p>}</section>
              </div></td></tr>];
          })}
          <tr data-row="total"><th scope="row">Total des capitaux propres<span className={styles.meaning}>{result.totals.computedComponents}/{result.totals.inScopeComponents} composantes calculées · autres fonds propres exclus</span></th>
            {mode === "rebuilt" ? <>{total(result.totals.opening)}{natures.map(n => <td key={n}>{result.totals.movements[n] ? eur(result.totals.movements[n]!, { signed: true }) : "—"}</td>)}{total(result.totals.expected)}{total(result.totals.closing)}{total(result.totals.difference, true)}</>
              : <td colSpan={columns - 1} style={{ textAlign: "left" }}>{columnLabel("cloture")} : total non comparé ; seules les cellules sont rapprochées.</td>}</tr>
        </tbody>
      </table>
    </div>
    <p className={styles.muted}>Transferts internes : {result.transfers.length ? result.transfers.map(t => `${t.transferRef} (${t.entryIds.join(", ")})`).join(" ; ") : "aucun"} — effet sur le total {eur(result.totals.transfersEffect, { signed: true })}. Un transfert déséquilibré est refusé dès l’import.</p>
  </div>;
});
