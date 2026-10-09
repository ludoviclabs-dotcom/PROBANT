"use client";
import type { CitResult } from "@/lib/workpapers/fiscal-cit-contract";
import { CIT_BASIS_LABELS, CIT_CATEGORY_LABELS, CIT_TREATMENT_LABELS } from "@/lib/workpapers/fiscal-labels";
import { Chip } from "./FiscalTests";
import { cents, COVERAGE_LABELS, dateFr, locatorLabel } from "./format";
import type { FiscalSelection } from "./types";
import styles from "../cash/cash.module.css";
import fx from "./fiscal.module.css";

const Diff = ({ value }: { value: number | null }) => value === null ? <span className={styles.muted}>Inconnu</span> : <span className={fx.diff} data-zero={value === 0}>{cents(value, { signed: true })}{value === 0 ? " · aucun écart" : " · écart"}</span>;
const STEP_STATUS: Record<string, string> = { computed: "Calculé", proposed: "Proposé (hors cumul)", unavailable: "Indisponible" };
const CONDITION_STATUS: Record<string, string> = { satisfied: "Satisfaite", not_satisfied: "Non satisfaite", unknown: "Inconnue" };
const ELIGIBILITY: Record<string, string> = { eligible: "Éligible", not_eligible: "Non éligible", unknown: "Éligibilité inconnue", not_applicable: "Sans condition" };

/** Accounting result framed on the FEC, with both bases (after and before the recorded tax). Server values only. */
export function FramingView({ result }: { result: CitResult }) {
  const f = result.framing;
  return <section className={styles.card} aria-labelledby="fx-framing-title">
    <header><h2 id="fx-framing-title">Résultat comptable cadré</h2><span className={styles.muted}>Exercice {dateFr(result.period.startDate)} → {dateFr(result.period.endDate)} · {f.fecLinesInExercise} lignes FEC dans l’exercice sur {f.fecLines}</span></header>
    <div className={styles.tableScroll + " " + fx.free} role="region" aria-label="Cadrage — défilement clavier" tabIndex={0}><table className={fx.compare}><caption>Résultat des classes 6 et 7 du FEC (table interne documentée) et résultat comptable déclaré, en euros</caption>
      <thead><tr><th scope="col">Grandeur</th><th scope="col">Montant</th></tr></thead>
      <tbody>
        <tr><th scope="row">Résultat après impôt (FEC)</th><td className={styles.money}>{cents(f.resultAfterTaxCents)}</td></tr>
        <tr><th scope="row">Impôt sur les bénéfices comptabilisé (695)</th><td className={styles.money}>{cents(f.taxChargeCents)}</td></tr>
        <tr><th scope="row">Résultat avant impôt (FEC)</th><td className={styles.money}>{cents(f.resultBeforeTaxCents)}</td></tr>
        <tr><th scope="row">Dette d’impôt (444)</th><td className={styles.money}>{cents(f.taxLiabilityCents)}</td></tr>
        <tr><th scope="row">Résultat comptable déclaré{f.declaredBox ? " (case " + f.declaredBox + ")" : ""}</th><td className={styles.money}>{cents(f.declaredResultCents)}</td></tr>
        <tr><th scope="row">Écart (FEC après impôt − déclaré)</th><td className={styles.money}><Diff value={f.differenceCents}/></td></tr>
      </tbody></table></div>
    {f.reason && <p className={styles.notice}>{f.reason}</p>}
  </section>;
}
/** Documented fiscal bridge on the chosen basis; a residual is the declared result before deficits minus the documented result. */
export function CitBridgeView({ result }: { result: CitResult }) {
  const b = result.bridge, documented = result.adjustments.filter(a => a.treatment === "documents_declared");
  return <section className={styles.card} aria-labelledby="fx-citbridge-title">
    <header><h2 id="fx-citbridge-title">Pont fiscal documenté</h2><span className={styles.muted}>Base : {CIT_BASIS_LABELS[b.basis]}</span></header>
    {b.reason && <p className={styles.notice}>{b.reason}</p>}
    <div className={styles.tableScroll + " " + fx.free} role="region" aria-label="Pont fiscal — défilement clavier" tabIndex={0}><table><caption>Du résultat comptable au résultat fiscal avant déficits, en euros ; chaque retraitement cite une pièce</caption>
      <thead><tr><th scope="col">Étape</th><th scope="col">Montant</th><th scope="col">Pièce et source</th></tr></thead>
      <tbody>
        <tr><td>Résultat de départ ({b.basis === "after_tax" ? "après" : "avant"} impôt, FEC)</td><td className={styles.money}>{cents(b.startCents)}</td><td>Écritures du FEC</td></tr>
        {documented.map(a => <tr key={a.id}><td>{a.direction === "reintegration" ? "+ " : "− "}{a.label} <span className={styles.muted}>({CIT_CATEGORY_LABELS[a.category]})</span></td><td className={styles.money}>{cents(a.direction === "reintegration" ? a.amountCents : -a.amountCents, { signed: true })}</td>
          <td>{a.citation.fileName}{a.citation.row ? " · ligne " + a.citation.row : ""}{a.citation.zone ? " · " + a.citation.zone : ""}{a.legalSource ? " · " + a.legalSource.title : " · source du registre non citée"}</td></tr>)}
        <tr><td>Résultat documenté</td><td className={styles.money}>{cents(b.documentedResultCents)}</td><td>—</td></tr>
        <tr><td>Résultat fiscal avant déficits déclaré{b.declaredBox ? " (case " + b.declaredBox + ")" : ""}</td><td className={styles.money}>{cents(b.declaredCents)}</td><td>{result.declaration.forms.map(f => f.fileName).join(", ") || "Liasse absente"}</td></tr>
        <tr><td>Résidu non expliqué</td><td className={styles.money}><Diff value={b.residualCents}/></td><td>—</td></tr>
      </tbody></table></div>
  </section>;
}
export function AdjustmentsView({ result, selection, onSelect }: { result: CitResult; selection: FiscalSelection; onSelect(id: string): void }) {
  return <section className={styles.card} aria-labelledby="fx-adj-title">
    <header><h2 id="fx-adj-title">Retraitements documentés</h2><span className={styles.muted}>Aucun retraitement n’est déduit d’un numéro de compte</span></header>
    {!result.adjustments.length ? <p className={styles.muted}>Aucun retraitement documenté : les totaux déclarés restent repris tels quels par le moteur, sans ventilation.</p> :
    <ul className={styles.list}>{result.adjustments.map(a => <li key={a.id} className={selection?.kind === "adjustment" && selection.id === a.id ? fx.selectedRow : undefined}>
      <div className={styles.kv}><button type="button" className={fx.linkButton} onClick={() => onSelect(a.id)}>{a.id} — {a.label}</button><span>{CIT_CATEGORY_LABELS[a.category]} · {a.direction === "reintegration" ? "réintégration" : "déduction"}</span>
        <span className={styles.money}>{cents(a.amountCents)}</span><span className={fx.chip} data-tone={a.treatment === "proposed_correction" ? "warn" : "info"}>{CIT_TREATMENT_LABELS[a.treatment]}</span>{a.inEngine && <span className={fx.chip} data-tone="warn">Intégré au calcul</span>}</div>
      <p className={styles.muted}>Pièce : {a.citation.fileName}{a.citation.row ? " · ligne " + a.citation.row : ""} · {a.authorId} · {a.legalSource ? <>{a.legalSource.url ? <a href={a.legalSource.url} target="_blank" rel="noreferrer noopener">{a.legalSource.title}</a> : a.legalSource.title} ({a.legalSource.locator}) — {COVERAGE_LABELS[a.legalSource.coverage]}</> : "source du registre non citée"}</p>
    </li>)}</ul>}
  </section>;
}
/** Engine computation: steps of the retained chain and brackets of the published schedule, with their conditions and sources. */
export function ComputationView({ result }: { result: CitResult }) {
  const c = result.computation;
  return <section className={styles.card} aria-labelledby="fx-comp-title">
    <header><h2 id="fx-comp-title">Calcul du moteur IS</h2><span className={styles.muted}>{result.engine.name} {result.engine.version} · barème {result.engine.rateScheduleId ?? "non publié"} · exercice {result.fiscalYear} · millésime {result.formVintage}</span></header>
    {!c ? <p className={styles.notice} data-tone="danger">Calcul non exécuté : le moteur est bloqué (barème, millésime, profil ou liasse). Aucun impôt n’est présenté ; voir les règles bloquées.</p> : <>
      <div className={styles.tableScroll + " " + fx.free} role="region" aria-label="Étapes du calcul — défilement clavier" tabIndex={0}><table><caption>Chaîne retenue : les retraitements proposés restent hors cumul</caption>
        <thead><tr><th scope="col">Étape</th><th scope="col">Variation</th><th scope="col">Cumul</th><th scope="col">Statut</th></tr></thead>
        <tbody>{c.steps.map(s => <tr key={s.code}><td>{s.label}</td><td className={styles.money}>{s.kind === "delta" ? cents(s.deltaCents, { signed: true }) : "—"}</td><td className={styles.money}>{cents(s.runningTotalCents)}</td><td>{STEP_STATUS[s.status] ?? s.status}</td></tr>)}</tbody></table></div>
      <div className={styles.tableScroll + " " + fx.free} role="region" aria-label="Tranches du barème — défilement clavier" tabIndex={0}><table><caption>Tranches du barème publié de l’exercice</caption>
        <thead><tr><th scope="col">Tranche</th><th scope="col">Taux</th><th scope="col">Base allouée</th><th scope="col">Impôt</th><th scope="col">Conditions</th><th scope="col">Source</th></tr></thead>
        <tbody>{c.brackets.map(b => <tr key={b.code}><td>{b.label}{b.applied ? "" : " (non appliquée)"}</td><td className={styles.money}>{(b.rateBasisPoints / 100).toLocaleString("fr-FR")} %</td><td className={styles.money}>{cents(b.allocatedBaseCents)}</td><td className={styles.money}>{cents(b.taxCents)}</td>
          <td>{ELIGIBILITY[b.eligibility] ?? b.eligibility}{b.conditions.length > 0 && <ul className={fx.sourceList}>{b.conditions.map(x => <li key={x.code}>{x.label} : {CONDITION_STATUS[x.status] ?? x.status}{x.observedValue ? " (" + x.observedValue + ")" : ""}</li>)}</ul>}</td>
          <td className={styles.muted}>{b.sourceRefs.map(s => s.sourceVersionId + " — " + s.locator).join(" ; ")}</td></tr>)}</tbody></table></div>
      <p><strong>IS brut calculé : {cents(c.grossTaxCents)}</strong> · base imposable {cents(c.taxableBaseCents)} · déficits imputés {cents(c.deficitOffsetCents)} · impôt {result.engine.taxImpactStatus === "estimated" ? "estimé (information manquante)" : result.engine.taxImpactStatus === "computed" ? "calculé" : result.engine.taxImpactStatus} — aucune liquidation, aucun acompte, aucun intérêt ni pénalité.</p>
    </>}
  </section>;
}
export function CitComparisons({ result }: { result: CitResult }) {
  return <section className={styles.card} aria-labelledby="fx-citcmp-title">
    <header><h2 id="fx-citcmp-title">Calcul, déclaré et comptabilisé</h2><span className={styles.muted}>Lignes de rapprochement du moteur</span></header>
    {!result.comparisons.length ? <p className={styles.muted}>Aucun rapprochement : moteur bloqué.</p> :
    <div className={styles.tableScroll + " " + fx.free} role="region" aria-label="Rapprochements — défilement clavier" tabIndex={0}><table className={fx.compare}><caption>Écart = calcul du moteur − valeur déclarée ou comptabilisée</caption>
      <thead><tr><th scope="col">Ligne</th><th scope="col">Calcul</th><th scope="col">Déclaré / comptabilisé</th><th scope="col">Écart</th><th scope="col">Statut</th></tr></thead>
      <tbody>{result.comparisons.map(c => <tr key={c.key}><th scope="row">{c.label}</th><td className={styles.money}>{cents(c.leftCents)}</td><td className={styles.money}>{cents(c.rightCents)}{c.rightBox ? " · " + c.rightBox : ""}</td><td className={styles.money}><Diff value={c.differenceCents}/></td>
        <td><Chip outcome={c.status === "matched" ? "passed" : c.status === "different" ? "reconciliation_difference" : "inconclusive"} label={c.status === "matched" ? "Rapproché" : c.status === "different" ? "Écart" : "Opérande absent"}/></td></tr>)}</tbody></table></div>}
  </section>;
}
export function CitDeclarationLines({ result, selection, onSelect }: { result: CitResult; selection: FiscalSelection; onSelect(key: string): void }) {
  const d = result.declaration;
  return <section className={styles.card} aria-labelledby="fx-citlines-title">
    <header><h2 id="fx-citlines-title">Lignes de la liasse et de la 2065</h2><span className={styles.muted}>{d.forms.map(f => f.formNumber + " " + f.formVintage + (f.published ? "" : " (millésime non publié)")).join(" · ") || "Aucune liasse"}</span></header>
    {d.status === "not_read" && <p className={styles.notice}>Liasse présente mais non lue : le moteur est bloqué. Ses cases restent affichées pour mémoire.</p>}
    {d.status === "unpublished_vintage" && <p className={styles.notice}>Millésime non publié dans le registre : pièce conservée, non lue par le moteur, aucun autre millésime substitué.</p>}
    {!d.lines.length ? <p className={styles.muted}>Aucune liasse de l’exercice : importez la 2058-A ou la 2033-B (et la 2065) dans Pièces.</p> :
    <div className={styles.tableScroll + " " + fx.free} role="region" aria-label="Lignes de la liasse — défilement clavier" tabIndex={0}><table><caption>Cases déclarées, lecture par le moteur et localisation</caption>
      <thead><tr><th scope="col">Formulaire · case</th><th scope="col">Libellé</th><th scope="col">Montant</th><th scope="col">Lecture</th><th scope="col">Localisation</th></tr></thead>
      <tbody>{d.lines.map(l => { const key = l.formNumber + "|" + l.code; return <tr key={l.rowId} className={selection?.kind === "line" && selection.id === key ? fx.selectedRow : undefined}>
        <td><button type="button" className={fx.linkButton} onClick={() => onSelect(key)}>{l.formNumber} · {l.code}</button></td><td>{l.label}</td><td className={styles.money}>{cents(l.amountCents)}</td><td>{l.readByEngine ? "Lue par le moteur" : "Non lue"}</td><td className={styles.muted}>{locatorLabel(l.locator)}</td></tr>; })}</tbody></table></div>}
  </section>;
}
