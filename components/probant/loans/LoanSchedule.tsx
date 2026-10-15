"use client";
import { money } from "@/lib/canonical-model/money";
import type { DueReview, LoanResult, LoanReview } from "@/lib/workpapers/loan-review";
import { LOAN_NATURE_LABELS } from "@/lib/workpapers/loan-rules";
import { amountLabel, amountTitle, dateFr, eur, MONTHS, plural, STATUS_LABELS, STATUS_TONE, type Tone } from "./format";
import styles from "../cash/cash.module.css";
import l from "./loans.module.css";

export interface LoanFilters { month: number | null; contract: string; q: string; tone: "" | Tone }
export interface LoanSelection { contractId: string; dueId: string | null }
const TONE_LABELS: Record<Tone, string> = { ok: "Concordant", explain: "À expliquer", unknown: "Non concluant", excluded: "Exclu" };
/** A due is « non concluant » when one comparison stays unknown, « à expliquer » when a known difference or a check remains. */
export function dueTone(d: DueReview): Tone { return d.issues.some(i => i.code === "due_unknown") ? "unknown" : d.issues.length ? "explain" : "ok"; }
export function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) { return <span className={l.chip} data-tone={tone}>{children}</span>; }
const matches = (r: LoanReview, f: LoanFilters) => (!f.contract || r.id === f.contract) && (!f.q || [r.id, r.name, r.lender].join(" ").toLocaleLowerCase("fr").includes(f.q.toLocaleLowerCase("fr")));

/** Dues payable during the exercise: month strip (filter) and table linked to GL and payments. */
export function LoanSchedule({ result, filters, onFilters, selected, onOpen }: { result: LoanResult; filters: LoanFilters; onFilters(f: LoanFilters): void; selected: LoanSelection | null; onOpen(s: LoanSelection): void }) {
  const rows = result.rows.filter(r => matches(r, filters));
  const all = rows.flatMap(r => r.dues.map(d => ({ d, r, tone: dueTone(d) }))).filter(x => !filters.tone || x.tone === filters.tone);
  const months = MONTHS.map((name, i) => {
    const ds = all.filter(x => Number(x.d.dueDate.slice(5, 7)) === i + 1);
    const principal = ds.reduce((n, x) => n + BigInt(x.d.principal.amount.replace(".", "")), 0n);
    return { name, count: ds.length, principal, flagged: ds.some(x => x.tone !== "ok") };
  });
  const maxPrincipal = months.reduce((m, x) => x.principal > m ? x.principal : m, 1n);
  const visible = all.filter(x => filters.month === null || Number(x.d.dueDate.slice(5, 7)) === filters.month + 1).sort((a, b) => a.d.dueDate.localeCompare(b.d.dueDate) || a.r.id.localeCompare(b.r.id));
  const reset = () => onFilters({ month: null, contract: "", q: "", tone: "" });
  return <section className={l.section} aria-labelledby="ln-schedule-title">
    <header><h2 id="ln-schedule-title">{filters.month === null ? "Échéances de l’exercice" : "Échéances · " + MONTHS[filters.month]}</h2>
      <span className={styles.muted}>{visible.length} / {plural(all.length, "échéance")} · principal et intérêts rapprochés du GL et des paiements</span></header>
    <ul className={l.months} aria-label="Filtrer les échéances par mois">{months.map((m, i) => <li key={m.name}>
      <button type="button" aria-pressed={filters.month === i} disabled={!m.count} onClick={() => onFilters({ ...filters, month: filters.month === i ? null : i })}
        aria-label={m.name + " : " + plural(m.count, "échéance") + (m.count ? ", principal " + eur(money(m.principal)) : "") + (m.flagged ? ", point à traiter" : "")}>
        <strong>{m.name}</strong><small>{m.count ? plural(m.count, "éch.", "éch.") : "—"}</small>
        <span className={l.monthBar} data-flag={m.flagged} style={{ width: m.count ? Math.max(6, Number((m.principal * 100n) / maxPrincipal)) + "%" : "0" }} aria-hidden="true"/>
      </button></li>)}</ul>
    <div className={l.toolbar}>
      <div className={l.chips} role="group" aria-label="Contrat">
        <button type="button" aria-pressed={!filters.contract} onClick={() => onFilters({ ...filters, contract: "" })}>Tous les contrats</button>
        {result.rows.map(r => <button type="button" key={r.id} aria-pressed={filters.contract === r.id} onClick={() => onFilters({ ...filters, contract: filters.contract === r.id ? "" : r.id })}>{r.id}</button>)}
      </div>
      <label>État<select value={filters.tone} onChange={e => onFilters({ ...filters, tone: e.target.value as LoanFilters["tone"] })}><option value="">Tous</option><option value="explain">À expliquer</option><option value="unknown">Non concluant</option><option value="ok">Concordant</option></select></label>
      <label>Rechercher un contrat<input type="search" value={filters.q} onChange={e => onFilters({ ...filters, q: e.target.value })} placeholder="Nom, prêteur, référence"/></label>
      <button type="button" disabled={filters.month === null && !filters.contract && !filters.q && !filters.tone} onClick={reset}>Année entière, tous filtres levés</button>
    </div>
    <div className={styles.tableScroll} role="region" aria-label="Échéancier — défilement horizontal au clavier" tabIndex={0}>
      <table className={l.dueTable}><caption>Intervalles d’intérêts : départ inclus, fin exclue. Intérêt recalculé sur les paramètres transcrits du contrat ; un montant inconnu reste inconnu.</caption>
        <thead><tr><th scope="col">Contrat · échéance</th><th scope="col">Exigible le</th><th scope="col" className={l.num}>Principal</th><th scope="col" className={l.num}>Intérêt échéancier</th><th scope="col" className={l.num}>Intérêt recalculé</th><th scope="col" className={l.num}>Intérêt GL</th><th scope="col" className={l.num}>Payé (intérêt)</th><th scope="col">Concordance</th></tr></thead>
        <tbody>{visible.map(({ d, r, tone }) => <tr key={d.id} aria-selected={selected?.dueId === d.id}>
          <td><button type="button" className={l.rowButton} onClick={() => onOpen({ contractId: r.id, dueId: d.id })}>{r.name}<small>{d.id}{d.kind === "early" ? " · remboursement anticipé" : ""} · version {d.contractVersion}</small></button></td>
          <td>{dateFr(d.dueDate)}</td><td className={l.num}>{eur(d.principal)}</td>
          <td className={l.num} title={amountTitle(d.providedInterest)}>{amountLabel(d.providedInterest)}</td>
          <td className={l.num} title={amountTitle(d.calculatedInterest.amount)}>{amountLabel(d.calculatedInterest.amount)}{d.calculatedInterest.status === "blocked" && <span className={l.blocked}>Calcul bloqué</span>}</td>
          <td className={l.num} title={amountTitle(d.glInterest)}>{amountLabel(d.glInterest)}</td><td className={l.num} title={amountTitle(d.paidInterest)}>{amountLabel(d.paidInterest)}</td>
          <td><Chip tone={tone}>{TONE_LABELS[tone]}</Chip>{d.issues.length > 0 && <span className={styles.meaning}>{d.issues[0].text}{d.issues.length > 1 ? " (+" + (d.issues.length - 1) + ")" : ""}</span>}</td>
        </tr>)}</tbody></table>
      {!visible.length && <p className={l.empty}>Aucune échéance pour ces filtres.<button type="button" onClick={reset}>Réinitialiser</button></p>}
    </div>
  </section>;
}

/** One line per contract: principal bridge, presentation and state. No total mixes contracts and dues. */
export function LoanContracts({ result, filters, selected, onOpen }: { result: LoanResult; filters: LoanFilters; selected: LoanSelection | null; onOpen(s: LoanSelection): void }) {
  const rows = result.rows.filter(r => matches(r, filters));
  return <section className={l.section} aria-labelledby="ln-contracts-title">
    <header><h2 id="ln-contracts-title">Contrats et pont de principal</h2><span className={styles.muted}>Ouverture + tirages − remboursements = attendu ; résidu = GL de clôture − attendu</span></header>
    <div className={styles.tableScroll} role="region" aria-label="Contrats — défilement horizontal au clavier" tabIndex={0}>
      <table className={l.contractTable}><caption>Contrats du pack, y compris remboursés dans l’exercice, et références du GL sans contrat. Un résidu n’affirme aucune dette omise.</caption>
        <thead><tr><th scope="col">Contrat · prêteur</th><th scope="col">Nature · poste de bilan</th><th scope="col" className={l.num}>Ouverture</th><th scope="col" className={l.num}>Remboursé</th><th scope="col" className={l.num}>Attendu</th><th scope="col" className={l.num}>GL clôture</th><th scope="col" className={l.num}>Résidu</th><th scope="col">État</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id} aria-selected={selected?.contractId === r.id && !selected.dueId}>
          <td><button type="button" className={l.rowButton} onClick={() => onOpen({ contractId: r.id, dueId: null })}>{r.name}<small>{r.id} · {r.lender}</small></button></td>
          <td>{r.presentation.nature ? LOAN_NATURE_LABELS[r.presentation.nature] : "Contrat non identifié"}<span className={styles.meaning}>{r.presentation.exclusion?.kind === "other_equity" ? "Autres fonds propres (moteur Capitaux propres)" : r.presentation.rubric ?? "Poste non déterminé"}</span></td>
          {[r.opening, r.repaid, r.expectedClosing, r.closing].map((a, i) => <td key={i} className={l.num} title={amountTitle(a)}>{amountLabel(a)}</td>)}
          <td className={l.num} title={amountTitle(r.residual)}>{amountLabel(r.residual, { signed: true })}</td>
          <td><Chip tone={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Chip>{r.closing.kind === "known" && r.closing.value.amount === "0.00" && r.status !== "excluded" && <span className={styles.meaning}>Remboursé dans l’exercice</span>}</td>
        </tr>)}</tbody></table>
      {!rows.length && <p className={l.empty}>Aucun contrat pour ces filtres.</p>}
    </div>
  </section>;
}

export function LoanAccrued({ result, filters, onOpen }: { result: LoanResult; filters: LoanFilters; onOpen(s: LoanSelection): void }) {
  const rows = result.rows.filter(r => matches(r, filters) && r.status !== "excluded");
  return <section className={l.section} aria-labelledby="ln-accrued-title">
    <header><h2 id="ln-accrued-title">Intérêts courus à la clôture</h2><span className={styles.muted}>De la dernière borne de règlement documentée au lendemain de la clôture</span></header>
    <div className={styles.tableScroll} role="region" aria-label="Intérêts courus — défilement horizontal au clavier" tabIndex={0}>
      <table className={l.framingTable}><thead><tr><th scope="col">Contrat</th><th scope="col" className={l.num}>Recalculé</th><th scope="col" className={l.num}>GL</th><th scope="col" className={l.num}>GL − recalculé</th><th scope="col">Base</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}><td><button type="button" className={l.rowButton} onClick={() => onOpen({ contractId: r.id, dueId: null })}>{r.name}<small>{r.id}</small></button></td>
          <td className={l.num} title={amountTitle(r.accrued.amount)}>{amountLabel(r.accrued.amount)}</td><td className={l.num} title={amountTitle(r.bookedAccrued)}>{amountLabel(r.bookedAccrued)}</td>
          <td className={l.num} title={amountTitle(r.accruedDifference)}>{amountLabel(r.accruedDifference, { signed: true })}</td><td>{r.accrued.status === "calculated" ? plural(r.accrued.segments.length, "segment documenté", "segments documentés") : r.accrued.reason}</td></tr>)}</tbody></table>
    </div>
  </section>;
}

/** Account framing on the frozen balance: a perimeter mismatch is shown per account, never netted between accounts. */
export function LoanFraming({ result }: { result: LoanResult }) {
  const f = result.framing;
  return <section className={l.section} aria-labelledby="ln-framing-title">
    <header><h2 id="ln-framing-title">Cadrage sur la balance</h2><span className={styles.muted}>{f.convention}</span></header>
    {f.status === "not_provided" ? <p className={styles.notice}>Balance des comptes de dettes financières non fournie : le périmètre n’est pas cadré et la feuille reste non concluante.</p> :
      <div className={styles.tableScroll} role="region" aria-label="Cadrage — défilement horizontal au clavier" tabIndex={0}>
        <table className={l.framingTable}><thead><tr><th scope="col">Compte</th><th scope="col" className={l.num}>Balance</th><th scope="col" className={l.num}>GL des contrats du pack</th><th scope="col" className={l.num}>Écart</th><th scope="col">Contrats</th></tr></thead>
          <tbody>{f.rows.map(r => { const tone: Tone = r.difference.kind === "unknown" ? "unknown" : r.difference.kind === "known" && r.difference.value.amount !== "0.00" ? "explain" : "ok";
            return <tr key={r.account}><td><strong>{r.account}</strong><span className={styles.meaning}>{r.label ?? "Absent de la balance"}</span></td>
              <td className={l.num} title={amountTitle(r.balance)}>{amountLabel(r.balance)}</td><td className={l.num}>{amountLabel(r.ledger)}</td>
              <td className={l.num}><Chip tone={tone}>{amountLabel(r.difference, { signed: true })}</Chip></td><td>{r.contractIds.join(", ") || "Aucun contrat du pack"}</td></tr>; })}</tbody></table>
      </div>}
    {result.framingIssues.length > 0 && <ul className={l.issues}>{result.framingIssues.map(i => <li key={i.code}>{i.text}</li>)}</ul>}
  </section>;
}
