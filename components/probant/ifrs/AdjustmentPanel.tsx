"use client";
import { LOGICAL_ACCOUNT_CATALOG, LOGICAL_ACCOUNT_NOTE } from "@/lib/ifrs/leases/adjustment";
import type { LeaseFraming } from "@/lib/ifrs/leases/framing";
import type { AdjustmentBundle } from "@/lib/ifrs/shared/bundle";
import type { LeaseResult } from "@/lib/workpapers/lease-review";
import { FRAMING_LABELS, moneyFr, plural } from "./format";
import s from "./ifrs.module.css";

const NATURE_LABELS = { recognition: "comptabilisation initiale (solde)", interest: "intérêts de l'exercice", depreciation: "amortissement", rent_neutralization: "neutralisation du loyer PCG", opening_effect: "effet d'ouverture" } as const;

/**
 * Retraitement de clôture proposé (L16-03) : table d'écritures avec preuves, pont simple par poste, écarts de cadrage.
 * Tout vient du résultat serveur et du retraitement matérialisé à la version exacte de la feuille ; rien n'est recalculé ici, et les
 * postes d'actif et de passif ne sont jamais additionnés. Les visualisations complètes viennent avec le poste visuel (L16-04).
 */
export function AdjustmentPanel({ result, bundle, framing, onOpen }: { result: LeaseResult | null; bundle: AdjustmentBundle | null; framing: LeaseFraming | null; onOpen(contractId: string, trigger: HTMLElement): void }) {
  const contracts = result?.contracts ?? [];
  const pieces = (contractId: string) => contracts.find(c => c.contractId === contractId)?.framing.lines.filter(l => l.status === "matched").map(l => l.piece ?? l.key) ?? [];
  const gaps = (framing?.contracts ?? []).filter(f => f.gaps.length);
  return <section className={s.section} aria-labelledby="l16-adjustment-title">
    <div className={s.sectionHead}><h2 id="l16-adjustment-title">Retraitement de clôture proposé</h2>
      <span className={s.muted}>{bundle ? (bundle.status === "reviewed" ? "Revu : feuille approuvée" : "Proposé : feuille calculée, non revue") + " · r" + bundle.revision + " · v" + bundle.runVersion + " · empreinte " + bundle.bundleHash.slice(0, 12) : "Aucun retraitement"}</span></div>
    <dl className={s.kv}>
      <dt>Sélection pour une base</dt><dd>Non sélectionné : la sélection se décide dans le dossier de clôture, avec le manifeste de la base (lot L16-05)</dd>
      <dt>Comptabilisation</dt><dd>Non documentée : ni la sélection ni le verrouillage ne la prouvent</dd>
      <dt>Impôt</dt><dd>Non calculé : effet avant impôt seulement, sans taux ni effet nul supposé</dd>
    </dl>
    {!result && <p className={s.muted} role="status">{framing ? "Aucun calcul pour cette version : le cadrage des sources est montré ci-dessous, le retraitement suivra le calcul." : "Aucun calcul ni cadrage pour cette version."}</p>}
    {result && !bundle && <p className={s.muted} role="status">Aucun contrat calculé et cadré au centime : aucun retraitement n'est proposé, jamais un retraitement à zéro.</p>}
    {bundle && <>
      <h3>Écritures</h3>
      <div className={s.scroll} role="region" aria-label="Écritures du retraitement — défilement horizontal au clavier" tabIndex={0}>
        <table className={s.table}>
          <caption>Une ligne par compte logique et par contrat ; montants en centimes exacts ; aucune ligne de trésorerie. Base visée : grand livre PCG, source {bundle.expectedBase.sourceRefs[0].sha256.slice(0, 8)}.</caption>
          <thead><tr><th scope="col">Contrat</th><th scope="col">Compte logique</th><th scope="col">Nature</th><th scope="col" className={s.money}>Débit</th><th scope="col" className={s.money}>Crédit</th><th scope="col">Preuves</th></tr></thead>
          <tbody>{bundle.lines.map(l => <tr key={l.contractId + l.account}>
            <th scope="row" className={s.rowHead}><button type="button" onClick={e => onOpen(l.contractId, e.currentTarget)}>{l.contractId}</button><div className={s.muted}>{l.contractVersion}</div></th>
            <td>{LOGICAL_ACCOUNT_CATALOG[l.account].label}<div className={`${s.muted} ${s.mono}`}>{l.account}</div></td><td>{NATURE_LABELS[l.nature]}</td>
            <td className={s.money}>{l.side === "debit" ? moneyFr(l.amount) : ""}</td><td className={s.money}>{l.side === "credit" ? moneyFr(l.amount) : ""}</td>
            <td>{l.account === "pcg_rent_neutralized" ? "Base PCG : " + pieces(l.contractId).join(", ") : plural(l.evidence.length, "ligne source citée", "lignes sources citées")}</td></tr>)}</tbody>
          <tfoot><tr><th scope="row" colSpan={3}>Total (équilibre exigé par contrat)</th><td className={s.money}>{moneyFr(result?.bundleTotals?.debit)}</td><td className={s.money}>{moneyFr(result?.bundleTotals?.credit)}</td><td/></tr></tfoot>
        </table>
      </div>
      <p className={s.muted}>{LOGICAL_ACCOUNT_NOTE}</p>
    </>}
    {result?.bridge && <>
      <h3>Pont par poste</h3>
      <div className={s.scroll} role="region" aria-label="Pont par poste — défilement horizontal au clavier" tabIndex={0}>
        <table className={s.table}>
          <caption>{result.bridge.scope} : base PCG + ajustements retenus = cible retraitée. Quatre postes séparés, jamais totalisés.</caption>
          <thead><tr><th scope="col">Poste</th><th scope="col" className={s.money}>Base PCG</th><th scope="col" className={s.money}>Ajustements retenus</th><th scope="col" className={s.money}>Cible retraitée</th><th scope="col">Base</th></tr></thead>
          <tbody>{result.bridge.rows.map(r => <tr key={r.poste}><th scope="row" className={s.rowHead}>{r.label}</th><td className={s.money}>{moneyFr(r.base)}</td><td className={s.money}>{moneyFr(r.adjustment)}</td><td className={s.money}>{moneyFr(r.target)}</td>
            <td className={s.muted}>{r.baseBasis === "ledger" ? r.baseNote : "Condition de la base"}</td></tr>)}</tbody>
        </table>
      </div>
      <p className={s.muted}>Effet d'ouverture + effet de la période = {moneyFr(result.bridge.identity.openingPlusPeriod)} = droit d'utilisation net − dette ({moneyFr(result.bridge.identity.rouNetMinusDebt)}). {result.bridge.note}</p>
      {(result.bridge.notCovered.contracts.length > 0 || result.bridge.notCovered.unattachedLines > 0) && <>
        <h3>Non couvert par le pont</h3>
        <ul className={s.reasons}>
          {result.bridge.notCovered.contracts.map(c => <li key={c.contractId}><button type="button" onClick={e => onOpen(c.contractId, e.currentTarget)}>{c.contractId}</button><span>{c.reason}</span></li>)}
          {result.bridge.notCovered.unattachedLines > 0 && <li><span className={s.mono}>sans contrat</span><span>{plural(result.bridge.notCovered.unattachedLines, "ligne")} de la base sans contrat du registre ({moneyFr(result.bridge.notCovered.absUnattached)} en valeur absolue), jamais compensée(s)</span></li>}
        </ul>
      </>}
    </>}
    <h3>Écarts de cadrage</h3>
    {!framing ? <p className={s.muted}>Cadrage non disponible pour cette version.</p> : gaps.length === 0 && !framing.unattached.length ? <p className={s.muted}>Aucun écart : chaque contrat calculable est cadré au centime.</p> :
      <ul className={s.reasons}>
        {gaps.flatMap(f => f.gaps.map(g => <li key={f.contractId + g.kind}><button type="button" onClick={e => onOpen(f.contractId, e.currentTarget)}>{f.contractId} · {g.code === "info" ? "info" : g.code}</button>
          <span>{g.message}{g.amount.kind === "known" ? " · " + moneyFr(g.amount.value) : " · " + g.amount.reason} <span className={s.muted}>({FRAMING_LABELS[f.status]})</span></span></li>))}
        {framing.unattached.map(u => <li key={u.key}><span className={s.mono}>{u.account ?? "compte ?"}</span><span>Ligne {u.key} sans contrat du registre : {moneyFr(u.amount)}, conservée, jamais rattachée ni compensée</span></li>)}
      </ul>}
  </section>;
}
