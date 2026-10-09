"use client";
import type { VatResult } from "@/lib/workpapers/fiscal-vat-contract";
import { VAT_EXPLANATION_LABELS } from "@/lib/workpapers/fiscal-labels";
import { CATEGORY_LABELS, cents, CONTROL_LABELS, COVERAGE_LABELS, dateFr, OUTCOME_LABELS, rate, TIER_LABELS } from "./format";
import type { FiscalSelection } from "./types";
import styles from "../cash/cash.module.css";
import fx from "./fiscal.module.css";

const tone = (o: string | null | undefined) => !o ? "muted" : ["passed", "no_exception_detected", "known"].includes(o) ? "ok" : ["reconciliation_difference", "potential_tax_risk", "exceptions_detected"].includes(o) ? "danger" : ["review_recommendation"].includes(o) ? "warn" : "info";
export function Chip({ outcome, label }: { outcome: string | null | undefined; label?: string }) { return <span className={fx.chip} data-tone={tone(outcome)}>{label ?? OUTCOME_LABELS[outcome ?? ""] ?? outcome ?? "Non exécuté"}</span>; }
const Diff = ({ value }: { value: number | null }) => value === null ? <span className={styles.muted}>Inconnu</span> : <span className={fx.diff} data-zero={value === 0}>{cents(value, { signed: true })}{value === 0 ? " · aucun écart" : " · écart"}</span>;

/** Comptabilisé / déclaré / écart: server values only; a missing value stays « Inconnu ». */
export function ComparisonTable({ result, onLine }: { result: VatResult; onLine(code: string): void }) {
  return <section className={styles.card} aria-labelledby="fx-compare-title">
    <header><h2 id="fx-compare-title">Comptabilisé, déclaré, écart</h2><span className={styles.muted}>{TIER_LABELS[result.engine.evidenceTier]} · {result.sources.fecLinesInPeriod} lignes FEC dans la période sur {result.sources.fecLines}</span></header>
    <div className={styles.tableScroll + " " + fx.free} role="region" aria-label="Comparaison — défilement clavier" tabIndex={0}><table className={fx.compare}><caption>TVA de la période {dateFr(result.period.startDate)} → {dateFr(result.period.endDate)}, en euros ; écart = comptabilisé − déclaré</caption>
      <thead><tr><th scope="col">Ligne</th><th scope="col">Théorique (taux constaté)</th><th scope="col">Comptabilisé (FEC)</th><th scope="col">Déclaré</th><th scope="col">Écart</th></tr></thead>
      <tbody>{result.comparison.map(c => <tr key={c.key}><th scope="row">{c.label}</th><td className={styles.money}>{c.theoreticalCents === null ? "—" : cents(c.theoreticalCents)}</td><td className={styles.money}>{cents(c.accountedCents)}</td>
        <td className={styles.money}>{c.declaredBox && c.declaredCents !== null ? <button type="button" className={fx.linkButton} onClick={() => onLine(c.declaredBox!)} aria-label={"Ouvrir la case " + c.declaredBox + " et ses écritures"}>{cents(c.declaredCents)} · case {c.declaredBox}</button> : cents(c.declaredCents)}</td>
        <td className={styles.money}><Diff value={c.differenceCents}/></td></tr>)}</tbody></table></div>
    {result.declaration.status !== "available" && <p className={styles.notice}>{result.declaration.status === "absent" ? "Déclaration de la période absente : FEC seul, signal sans réconciliation. Aucune valeur déclarée n’est réputée nulle." : result.declaration.status === "unpublished_vintage" ? "Millésime de la déclaration non publié dans le registre : pièce conservée, non lue par le moteur." : result.declaration.status === "not_read" ? "Déclaration présente mais non lue : le moteur est bloqué (profil, millésime ou périmètre). Ses cases restent affichées pour mémoire." : "Déclaration illisible pour le moteur."}</p>}
  </section>;
}

/** Explanatory bridge: accounted net + cited explanations = explained net, compared with the declared net. Bars only scale the server values. */
export function BridgeView({ result }: { result: VatResult }) {
  const b = result.bridge, values = [b.startCents, b.declaredCents, b.explainedCents, ...b.items.map(i => i.amountCents)].filter((v): v is number => v !== null).map(Math.abs);
  const max = Math.max(1, ...values), pct = (v: number) => Math.abs(v) / max * 100;
  const step = (label: string, sub: string, value: number | null, kind: string) => <li key={label}><div className={styles.step} data-kind={kind}><span className={styles.stepLabel}>{label}<small>{sub}</small></span>
    <span className={styles.track} aria-hidden="true">{value !== null && <span className={styles.bar} data-kind={kind === "total" ? "total" : value < 0 ? "payment" : "receipt"} style={{ left: 0, width: pct(value) + "%" }}/>}</span><span className={styles.stepValue}>{cents(value, { signed: kind === "delta" })}</span></div></li>;
  return <section className={styles.card} aria-labelledby="fx-bridge-title">
    <header><h2 id="fx-bridge-title">Pont explicatif</h2><span className={styles.muted}>Net comptabilisé → explications citées → net déclaré{b.declaredBox ? " (case " + b.declaredBox + ")" : ""}</span></header>
    {b.reason && <p className={styles.notice}>{b.reason}</p>}
    <ol className={styles.bridge} aria-label="Étapes du pont (valeurs dans le tableau ci-dessous)">
      {step("Net comptabilisé", "TVA collectée − TVA déductible des écritures de la période", b.startCents, "ledger")}
      {b.items.map(i => step(VAT_EXPLANATION_LABELS[i.kind] + " — " + i.label, "Pièce citée : " + i.citation.fileName + (i.citation.row ? " · ligne " + i.citation.row : "") + " · " + i.authorId, i.amountCents, "delta"))}
      {step("Net expliqué", "Net comptabilisé + explications", b.explainedCents, "total")}
      {step("Net déclaré", result.declaration.fileName ?? "Déclaration absente", b.declaredCents, "total")}
    </ol>
    <p>Résidu non expliqué : <Diff value={b.residualCents}/></p>
    <details className={styles.altTable}><summary>Tableau du pont (alternative au graphique)</summary><table><caption>Pont explicatif en euros</caption><thead><tr><th scope="col">Étape</th><th scope="col">Montant</th><th scope="col">Pièce, version, ligne</th></tr></thead><tbody>
      <tr><td>Net comptabilisé</td><td className={styles.money}>{cents(b.startCents)}</td><td>Écritures du FEC</td></tr>
      {b.items.map(i => <tr key={i.id}><td>{VAT_EXPLANATION_LABELS[i.kind]} — {i.label}</td><td className={styles.money}>{cents(i.amountCents, { signed: true })}</td><td>{i.citation.fileName} · version {i.citation.documentVersionId.slice(7, 19)}{i.citation.row ? " · ligne " + i.citation.row : ""}</td></tr>)}
      <tr><td>Net expliqué</td><td className={styles.money}>{cents(b.explainedCents)}</td><td>—</td></tr><tr><td>Net déclaré</td><td className={styles.money}>{cents(b.declaredCents)}</td><td>{result.declaration.fileName ?? "—"}</td></tr>
      <tr><td>Résidu non expliqué</td><td className={styles.money}>{cents(b.residualCents)}</td><td>—</td></tr></tbody></table></details>
  </section>;
}

export function PaymentsCredit({ result }: { result: VatResult }) {
  const p = result.payments, c = result.credit;
  return <section className={styles.card} aria-labelledby="fx-settle-title"><header><h2 id="fx-settle-title">Paiements et crédit reporté</h2></header>
    <div className={styles.sideBySide}>
      <section aria-label="Paiements au Trésor"><h3>Paiements ↔ net déclaré <Chip outcome={p.status === "known" ? (p.differenceCents === 0 ? "no_exception_detected" : "exceptions_detected") : p.status}/></h3>
        <dl><dt>TVA nette due déclarée</dt><dd>{cents(p.declaredDueCents)}</dd><dt>Payé pour la période</dt><dd>{cents(p.paidCents)}</dd><dt>Écart (payé − déclaré)</dt><dd><Diff value={p.differenceCents}/></dd></dl>
        {p.reason && <p className={styles.muted}>{p.reason}</p>}
        {p.items.length > 0 && <ul className={styles.list}>{p.items.map(i => <li key={i.rowId} className={styles.kv}><span>{i.ref} · {dateFr(i.date)}</span><span className={styles.money}>{cents(i.amountCents)}</span><span className={styles.muted}>{i.fileName} · ligne {i.locator.row}</span></li>)}</ul>}</section>
      <section aria-label="Crédit reporté"><h3>Continuité du crédit <Chip outcome={c.status === "known" ? (c.differenceCents === 0 ? "no_exception_detected" : "exceptions_detected") : c.status}/></h3>
        <dl><dt>Crédit à reporter, déclaration précédente{c.previous ? " (case " + c.previous.box + ")" : ""}</dt><dd>{cents(c.previous?.creditToCarryCents)}</dd>
          <dt>Crédit reçu sur la période{c.currentBox ? " (case " + c.currentBox + ")" : ""}</dt><dd>{cents(c.currentReceivedCents)}</dd><dt>Écart</dt><dd><Diff value={c.differenceCents}/></dd></dl>
        {c.previous && <p className={styles.muted}>Déclaration précédente : {c.previous.fileName} · {dateFr(c.previous.periodStart)} → {dateFr(c.previous.periodEnd)}</p>}
        {c.reason && <p className={styles.muted}>{c.reason}</p>}</section>
    </div></section>;
}

export function RatesView({ result, selection, onSelect }: { result: VatResult; selection: FiscalSelection; onSelect(key: string): void }) {
  return <section className={styles.card} aria-labelledby="fx-rates-title">
    <header><h2 id="fx-rates-title">Taux constatés et leur origine</h2><span className={styles.muted}>Constat du dossier — jamais présenté comme taux légal approuvé</span></header>
    <p className={styles.notice} data-tone="info">{result.rateMeaning}</p>
    <div className={styles.tableScroll + " " + fx.free} role="region" aria-label="Taux constatés — défilement clavier" tabIndex={0}><table><caption>Taux constatés par sens (TVA ÷ base HT de chaque écriture)</caption>
      <thead><tr><th scope="col">Sens</th><th scope="col">Taux constaté</th><th scope="col">Place dans le dossier</th><th scope="col">Base HT</th><th scope="col">TVA comptabilisée</th><th scope="col">Origine</th></tr></thead>
      <tbody>{result.rates.map(r => <tr key={r.key} className={selection?.kind === "rate" && selection.id === r.key ? fx.selectedRow : undefined}>
        <td>{r.direction === "collected" ? "Collectée" : "Déductible"}</td><td><button type="button" className={fx.linkButton} onClick={() => onSelect(r.key)}>{rate(r.rateBasisPoints)}</button></td>
        <td>{{ dominant: "Majoritaire", secondary: "Secondaire", outlier: "Marginal — à examiner", unresolved: "Non dérivable" }[r.status]}</td>
        <td className={styles.money}>{cents(r.baseCents)}</td><td className={styles.money}>{cents(r.vatAccountedCents)}</td><td className={fx.rateOrigin}>{r.origin}</td></tr>)}</tbody></table></div>
  </section>;
}

export function ControlsView({ result }: { result: VatResult }) {
  return <section className={styles.card} aria-labelledby="fx-controls-title">
    <header><h2 id="fx-controls-title">Contrôles du moteur TVA</h2><span className={styles.muted}>{result.engine.name} {result.engine.version} · {COVERAGE_LABELS[result.engine.coverage?.status ?? ""] ?? "Couverture non évaluée"}{result.engine.coverage?.uncoveredFromDate ? " (rupture au " + dateFr(result.engine.coverage.uncoveredFromDate) + ")" : ""}</span></header>
    {result.engine.status === "blocked" ? <p className={styles.notice} data-tone="danger">Moteur bloqué : aucun contrôle exécuté, aucun montant calculé. Voir les règles bloquées.</p> :
    <div className={styles.tableScroll + " " + fx.free} role="region" aria-label="Contrôles du moteur — défilement clavier" tabIndex={0}><table><caption>{result.controls.length} contrôles — résultat, niveau de preuve et montants comparés</caption>
      <thead><tr><th scope="col">Contrôle</th><th scope="col">Résultat</th><th scope="col">Valeur lue</th><th scope="col">Valeur de référence</th><th scope="col">Écart</th><th scope="col">Détail</th></tr></thead>
      <tbody>{result.controls.map(c => <tr key={c.controlId}><td>{CONTROL_LABELS[c.controlId] ?? c.title}<br/><span className={styles.muted}>{c.controlId}</span></td><td><Chip outcome={c.outcome}/></td>
        <td className={styles.money}>{c.observedCents === null ? "—" : cents(c.observedCents)}</td><td className={styles.money}>{c.comparedCents === null ? "—" : cents(c.comparedCents)}</td>
        <td className={styles.money}>{!c.comparable ? <span className={styles.muted}>Sans objet</span> : c.differenceCents === null ? "—" : cents(c.differenceCents, { signed: true })}</td><td className={styles.statusCell}>{c.detail}</td></tr>)}</tbody></table></div>}
    {result.engine.status !== "blocked" && <p className={styles.muted}>« Sans objet » : les deux valeurs lues par le contrôle ne mesurent pas la même grandeur (par exemple TVA brute et TVA déductible) ; aucun écart n’en est tiré.</p>}
  </section>;
}

/** Blocked rules with the source they require: title, publisher, URL, versions and verification date, all read from the registry. */
export function BlockedRules({ result, selection, onSelect }: { result: Pick<VatResult, "blockedRules" | "otherTaxes">; selection: FiscalSelection; onSelect(code: string): void }) {
  return <section className={styles.card} aria-labelledby="fx-rules-title">
    <header><h2 id="fx-rules-title">Règles bloquées et source requise</h2><span className={styles.muted}>{result.blockedRules.length} règle(s) · aucune version voisine substituée</span></header>
    <ul className={fx.rules}>{result.blockedRules.map(r => <li key={r.code} data-category={r.category} className={selection?.kind === "rule" && selection.id === r.code ? fx.selectedRow : undefined}>
      <h3>{r.label} <span className={fx.chip} data-tone={r.category === "source" ? "warn" : "info"}>{CATEGORY_LABELS[r.category]}</span></h3>
      {r.controls.length > 0 && <p className={styles.muted}>Contrôles concernés : {r.controls.map(c => CONTROL_LABELS[c] ?? c).join(" · ")}</p>}
      <p><strong>Source requise : </strong>{r.requiredSource}</p>
      {r.sources.length > 0 && <ul className={fx.sourceList}>{r.sources.map(s => <li key={s.sourceId}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> : s.title} — {s.publisher} · {COVERAGE_LABELS[s.coverage]} · vérifié le {dateFr(s.lastVerifiedAt)}
        <br/><span className={styles.muted}>Versions connues : {s.versions.map(v => v.label + (v.intersectsPeriod ? "" : " (hors période)")).join(" ; ") || "aucune"}</span></li>)}</ul>}
      {r.forms.map(f => <p key={f.formNumber} className={styles.muted}>Formulaire {f.formNumber} millésime {f.vintage} : {f.published ? "publié" : "non publié"} · millésimes publiés : {f.publishedVintages.join(", ") || "aucun"}</p>)}
      <button type="button" onClick={() => onSelect(r.code)}>Ouvrir le détail</button>
    </li>)}</ul>
    <p className={fx.otherTaxes}>Autres impôts et taxes : capacités séparées, non couvertes par cette feuille — {result.otherTaxes.map(t => t.title).join(" · ")}.</p>
  </section>;
}
