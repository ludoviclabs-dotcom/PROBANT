"use client";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import type { Contract, DueReview, InterestSegment, LoanFact, LoanResult, LoanReview } from "@/lib/workpapers/loan-review";
import { DAY_COUNT_DEFINITIONS, formatRatePpm, LOAN_NATURE_LABELS, ratePpm, type DayCount } from "@/lib/workpapers/loan-rules";
import { PRESENTATION_CATEGORY_LABELS } from "@/lib/workpapers/capitaux-presentation";
import { amountLabel, amountTitle, dateFr, eur, plural, sourceOf, STATUS_LABELS, STATUS_TONE } from "./format";
import { Chip, dueTone } from "./LoanSchedule";
import styles from "../cash/cash.module.css";
import l from "./loans.module.css";

export interface LoanDetailHandle { focus(): void }
interface Props {
  row: LoanReview | null; due: DueReview | null; result: LoanResult | null; facts: Map<string, LoanFact>;
  downloadHref: ((documentVersionId: string) => string) | null; onReturn(): void;
}
const LABELS: Record<string, string> = { loan_contracts: "Contrat", loan_schedule: "Échéancier", loan_ledger: "Grand livre", loan_payments: "Paiement", loan_confirmations: "Confirmation", loan_clauses: "Clause", loan_rates: "Révision de taux", loan_balance: "Balance" };
const FIELD_LABELS: Record<string, string> = { fixedRatePercent: "Taux fixe", spreadPercent: "Marge", indexName: "Index", dayCount: "Convention de jours", rateKind: "Nature du taux", maturity: "Échéance finale", revisionDates: "Dates de révision", feesTreatment: "Frais", principalAccount: "Compte du principal" };
const pct = (v: string | null) => v === null ? "Non transcrit" : formatRatePpm(ratePpm(v));
/** An amendment field as the contract states it (values are stored as JSON by the engine). */
function fieldValue(field: string, json: string) {
  const v: unknown = JSON.parse(json);
  if (v === null) return "non transcrit";
  if ((field === "fixedRatePercent" || field === "spreadPercent") && typeof v === "string") return pct(v);
  if (Array.isArray(v)) return plural(v.length, "date") + (v.length ? " (" + dateFr(String(v[0])) + " → " + dateFr(String(v[v.length - 1])) + ")" : "");
  if (field === "maturity" && typeof v === "string") return dateFr(v);
  if (field === "feesTreatment") return v === "separate_cash" ? "réglés séparément" : String(v);
  return String(v);
}
function rateText(c: Contract) {
  if (c.rateKind === "fixed") return "Taux fixe " + pct(c.fixedRatePercent);
  if (c.rateKind === "variable") return (c.indexName ?? "Index non transcrit") + " + marge " + pct(c.spreadPercent) + " · " + (c.revisionDates?.length ? plural(c.revisionDates.length, "date de révision", "dates de révision") : "dates de révision non transcrites") + (c.indexBounds === true ? " · plancher ou plafond" : c.indexBounds === false ? " · sans plancher ni plafond" : "");
  return "Nature du taux non transcrite";
}

/** One source line with its transcription and frozen version; the original document stays in the dossier. */
function SourceLine({ fact, open, onToggle, downloadHref }: { fact: LoanFact; open: boolean; onToggle(): void; downloadHref: Props["downloadHref"] }) {
  const s = sourceOf(fact);
  return <li><button type="button" aria-expanded={open} onClick={onToggle}><span>{LABELS[fact.type] ?? fact.type} · {fact.id}<small> · {dateFr(fact.date)}</small></span><span className={styles.money}>{fact.type === "loan_clauses" || fact.type === "loan_rates" ? "—" : eur(fact.amount)}</span></button>
    {open && <div className={styles.sourceBox}>
      {s && <><p><strong>{s.clause}</strong></p><blockquote className={l.quote}>{s.excerpt}</blockquote></>}
      <dl><dt>Document</dt><dd>{s?.title ?? "—"}</dd><dt>Pack</dt><dd>{s?.pack ?? "—"}</dd><dt>Page</dt><dd>{s?.page ?? "Non applicable"}</dd><dt>Date de la pièce</dt><dd>{s ? dateFr(s.date) : "—"}</dd>
        <dt>Fichier</dt><dd>{fact.fileName}{fact.line ? " · ligne " + fact.line : ""}{fact.sheet ? " · feuille " + fact.sheet : ""}</dd><dt>Version</dt><dd><code>{fact.hash}</code></dd></dl>
      <p className={styles.muted}>Transcription structurée d’une pièce lue par une personne : la ligne est vérifiée, pas l’exactitude de la transcription.</p>
      {downloadHref && <DossierContextAnchor href={downloadHref(fact.documentVersionId)}>Télécharger cette version de la source</DossierContextAnchor>}
    </div>}</li>;
}

function Segments({ segments, facts, open, toggle, downloadHref }: { segments: InterestSegment[]; facts: Map<string, LoanFact>; open: string | null; toggle(id: string): void; downloadHref: Props["downloadHref"] }) {
  if (!segments.length) return null;
  return <div>{segments.map(s => { const sourceId = s.fixingRowId ?? s.contractRowId, fact = sourceId ? facts.get(sourceId) : undefined;
    return <div key={s.start + s.kind} className={l.segment}>
      <strong>{dateFr(s.start)} → {dateFr(s.end)} (fin exclue)</strong>
      {s.kind === "opening_accrued" ? <span>Part antérieure à l’ouverture : intérêts courus d’ouverture du GL, {s.amount ? eur(s.amount) : "—"} ; non recalculée (principal antérieur non documenté).</span>
        : <span>{s.principal ? eur(s.principal) : "—"} × {s.rateLabel} × {s.days} jours / {s.dayCount === "ACT/365F" ? 365 : 360} ({s.dayCount}) · version {s.version}</span>}
      {fact && <><button type="button" aria-expanded={open === "seg:" + s.start + s.kind} onClick={() => toggle("seg:" + s.start + s.kind)}>{s.fixingRowId ? (s.kind === "opening_accrued" ? "Écriture d’ouverture" : "Avis de révision du taux") : "Clause du taux"}</button>
        {open === "seg:" + s.start + s.kind && <ul className={l.sources}><SourceLine fact={fact} open onToggle={() => toggle("seg:" + s.start + s.kind)} downloadHref={downloadHref}/></ul>}</>}
    </div>; })}</div>;
}

export const LoanDetailPanel = forwardRef<LoanDetailHandle, Props>(function LoanDetailPanel({ row, due, result, facts, downloadHref, onReturn }, ref) {
  const heading = useRef<HTMLHeadingElement>(null), [open, setOpen] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({ focus: () => heading.current?.focus() }), []);
  const toggle = (id: string) => setOpen(o => o === id ? null : id);
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(null); onReturn(); } };
  if (!row || !result) return <aside className={styles.detail} aria-label="Contrat, échéance et preuves" onKeyDown={onKey}><h2 ref={heading} tabIndex={-1}>Contrat, échéance et preuves</h2>
    <p className={styles.muted}>Choisissez une échéance ou un contrat : le pont de principal, les intérêts recalculés segment par segment, les termes du contrat et chaque ligne source s’affichent ici. Échap revient à la ligne d’origine.</p></aside>;
  const versions = row.contractRowIds.map(id => facts.get(id)).filter((f): f is LoanFact => !!f);
  const clauses = row.clauseRowIds.map(id => facts.get(id)).filter((f): f is LoanFact => !!f);
  const sourceRows = (due ? due.sourceRowIds : row.factRowIds).map(id => facts.get(id)).filter((f): f is LoanFact => !!f);
  const p = row.presentation, residualTone = row.residual.kind === "known" ? (row.residual.value.amount === "0.00" ? "ok" : "explain") : "unknown";
  return <aside className={styles.detail} data-open="true" aria-label="Contrat, échéance et preuves" onKeyDown={onKey} key={row.id + (due?.id ?? "")}>
    <p className={styles.eyebrow}>{row.id} · {row.lender}</p>
    <h2 ref={heading} tabIndex={-1}>{due ? "Échéance du " + dateFr(due.dueDate) : row.name}</h2>
    <p><Chip tone={due ? dueTone(due) : STATUS_TONE[row.status]}>{due ? (dueTone(due) === "ok" ? "Liens concordants" : dueTone(due) === "explain" ? "À expliquer" : "Non concluant") : STATUS_LABELS[row.status]}</Chip>{due && <span className={styles.muted}> {row.name}</span>}</p>

    {due && <section className={l.panelSection} aria-label="Échéance">
      <dl><dt>Intervalle</dt><dd>{dateFr(due.start)} → {dateFr(due.end)} (fin exclue){due.kind === "early" ? " · remboursement anticipé" : ""}</dd>
        <dt>Version</dt><dd>{due.contractVersion}{due.versionInForce && due.versionInForce !== due.contractVersion ? " · en vigueur : " + due.versionInForce : ""}</dd>
        <dt>Principal</dt><dd>échéancier {eur(due.principal)} · GL {amountLabel(due.glPrincipal)} · payé {amountLabel(due.paidPrincipal)}</dd>
        <dt>Intérêt</dt><dd>échéancier {amountLabel(due.providedInterest)} · recalculé <strong title={amountTitle(due.calculatedInterest.amount)}>{amountLabel(due.calculatedInterest.amount)}</strong> · GL {amountLabel(due.glInterest)} · payé {amountLabel(due.paidInterest)}</dd>
        <dt>Frais</dt><dd>échéancier {amountLabel(due.fees)} · GL {amountLabel(due.glFees)} · payés {amountLabel(due.paidFees)} (jamais ajoutés aux intérêts)</dd></dl>
      {due.calculatedInterest.status === "blocked" && <p className={styles.notice}>{due.calculatedInterest.reason}</p>}
      {due.issues.length > 0 && <ul className={l.issues}>{due.issues.map((i, n) => <li key={n}>{i.text}</li>)}</ul>}
      <h3>Calcul de l’intérêt, segment par segment</h3>
      <Segments segments={due.calculatedInterest.segments} facts={facts} open={open} toggle={toggle} downloadHref={downloadHref}/>
    </section>}

    {row.status !== "excluded" && <section className={l.panelSection} aria-label="Pont de principal">
      <h3>Pont de principal</h3>
      <ol className={l.bridge}>{([["Ouverture", row.opening], ["+ Tirages", row.draws], ["− Remboursements", row.repaid], ["= Principal attendu", row.expectedClosing], ["GL de clôture", row.closing], ["Confirmation du prêteur", row.confirmation]] as const)
        .map(([label, a], i) => <li key={label} data-kind={i === 3 ? "total" : undefined}><span>{label}</span><span title={amountTitle(a)}>{amountLabel(a)}</span></li>)}</ol>
      <div className={l.residual} data-tone={residualTone}><span>{residualTone === "ok" ? "Principal concordant" : residualTone === "explain" ? "Résidu à expliquer" : "Pont non concluant"}<small className={styles.meaning}>GL − attendu ; un résidu n’affirme pas une dette omise.</small></span><strong title={amountTitle(row.residual)}>{amountLabel(row.residual, { signed: true })}</strong></div>
      <p className={styles.muted}>Confirmation − GL : {amountLabel(row.confirmationDifference, { signed: true })}</p>
      {!due && row.accrued.segments.length > 0 && <><h3>Intérêts courus à la clôture : {amountLabel(row.accrued.amount)}</h3><Segments segments={row.accrued.segments} facts={facts} open={open} toggle={toggle} downloadHref={downloadHref}/></>}
      {!due && row.accrued.status === "blocked" && <p className={styles.notice}>Intérêts courus : {row.accrued.reason}</p>}
    </section>}

    <section className={l.panelSection} aria-label="Contrat et avenants">
      <h3>Contrat et avenants</h3>
      {!versions.length && <p className={styles.notice}>Contrat non identifié : les lignes du GL restent visibles ; aucun paramètre n’est supposé.</p>}
      {versions.map(f => { const c = f.details as unknown as Contract; return <div key={f.rowId} className={l.clause}>
        <strong>Version {c.version} · {dateFr(c.effectiveFrom)} → {dateFr(c.effectiveTo)}</strong>
        <span>{rateText(c)} · {c.dayCount ? c.dayCount + (c.dayCount in DAY_COUNT_DEFINITIONS ? " (" + DAY_COUNT_DEFINITIONS[c.dayCount as DayCount] + ")" : " — non reconnue") : "Convention de jours non transcrite"}</span>
        <span className={styles.muted}>Nature : {LOAN_NATURE_LABELS[c.nature]} · échéance finale {dateFr(c.maturity)} · frais {c.feesTreatment === "separate_cash" ? "réglés séparément" : c.feesTreatment ?? "non transcrits"} · comptes {c.principalAccount ?? "—"} / {c.accruedAccount ?? "—"}</span>
        <ul className={l.sources}><SourceLine fact={f} open={open === "v:" + f.rowId} onToggle={() => toggle("v:" + f.rowId)} downloadHref={downloadHref}/></ul></div>; })}
      {row.versionChanges.map(v => <div key={v.to} className={l.versions}><strong>Avenant : version {v.from} → {v.to}, effet au {dateFr(v.effective)}</strong>
        {v.fields.map(x => <span key={x.field}>{FIELD_LABELS[x.field] ?? x.field} : <del>{fieldValue(x.field, x.before)}</del> → {fieldValue(x.field, x.after)}</span>)}</div>)}
      {row.versionChanges.length > 0 && <p className={styles.muted}>Les dates d’effet gouvernent les segments : aucun choix du taux le plus favorable.</p>}
    </section>

    <section className={l.panelSection} aria-label="Présentation au bilan">
      <h3>Présentation au bilan</h3>
      <dl><dt>Texte</dt><dd>{result.rules.label}</dd><dt>Nature</dt><dd>{p.nature ? LOAN_NATURE_LABELS[p.nature] : "Non identifiée"}</dd>
        <dt>Poste</dt><dd>{p.rubric ?? (p.otherEquity ? PRESENTATION_CATEGORY_LABELS[p.otherEquity.category] : "Non déterminé")}</dd>
        <dt>Comptes attendus</dt><dd>principal {p.expectedPrincipal.join(", ") || "—"} · intérêts courus {p.expectedAccrued.join(", ") || "—"}</dd></dl>
      {p.signals.length > 0 && <ul className={l.issues}>{p.signals.map(s => <li key={s}>{s}</li>)}</ul>}
      {p.otherEquity && <p>Classement dettes / autres fonds propres (moteur Capitaux propres) : <strong>{PRESENTATION_CATEGORY_LABELS[p.otherEquity.category]}</strong> — {p.otherEquity.reasons.join(" ")}{p.otherEquity.missing.length ? " Manquant : " + p.otherEquity.missing.join(" ; ") + "." : ""} <span className={styles.muted}>{p.otherEquity.articles.join(", ")}</span></p>}
      {p.exclusion && <p className={styles.notice} data-tone="info">{p.exclusion.reason}</p>}
      <p className={styles.muted}>Poste : intitulé du modèle de bilan correspondant à la nature déclarée (méthode PROBANT) ; un compte incohérent est signalé, jamais reclassé.</p>
    </section>

    {clauses.length > 0 && <section className={l.panelSection} aria-label="Garanties et covenants">
      <h3>Garanties et covenants</h3>
      {clauses.map(f => { const d = f.details as Record<string, unknown>, s = sourceOf(f);
        return <div key={f.rowId} className={l.clause}>
          <span><Chip tone={d.reading === "unread" ? "unknown" : "ok"}>{d.kind === "guarantee" ? "Garantie" : "Covenant"} · {d.reading === "unread" ? "à lire" : d.reading === "read" ? "lu" : "qualifié"}</Chip> <strong>{s?.clause}</strong></span>
          {s && <blockquote>{s.excerpt}</blockquote>}
          {d.kind === "covenant" && <span>Définition contractuelle : {String(d.definition ?? "non transcrite")} · seuil (texte du contrat) : {String(d.threshold ?? "non transcrit")} · date de test : {d.testDate ? dateFr(String(d.testDate)) : "non transcrite"}</span>}
          {typeof d.qualification === "string" && <span className={styles.muted}>Lecture : {d.qualification}{d.reader ? " — " + String(d.reader) : ""}</span>}
        </div>; })}
      <p className={styles.muted}>Aucun ratio calculé ; aucune conformité de financement déduite.</p>
    </section>}

    {row.issues.length > 0 && <section className={l.panelSection} aria-label="Points du contrat"><h3>Points à documenter</h3><ul className={l.issues}>{row.issues.map((i, n) => <li key={n}>{i.text}</li>)}</ul></section>}

    <details className={l.panelSection} open={!!due}>
      <summary><strong>{due ? "Lignes reliées à l’échéance" : "Lignes sources du contrat"} ({sourceRows.length})</strong></summary>
      <ul className={l.sources}>{sourceRows.map(f => <SourceLine key={f.rowId} fact={f} open={open === "s:" + f.rowId} onToggle={() => toggle("s:" + f.rowId)} downloadHref={downloadHref}/>)}</ul>
    </details>
  </aside>;
});
