"use client";
import type { KnownAmount } from "@/lib/canonical-model/money";
import { LOGICAL_ACCOUNT_CATALOG } from "@/lib/ifrs/leases/adjustment";
import type { ContractFraming } from "@/lib/ifrs/leases/framing";
import type { QualifiedContract } from "@/lib/ifrs/leases/qualification";
import type { AdjustmentBundle } from "@/lib/ifrs/shared/bundle";
import type { LeaseContractResult } from "@/lib/workpapers/lease-review";
import { dateFr, FRAMING_LABELS, LINE_STATUS_LABELS, MATRIX_COLUMNS, moneyFr, plural, reasonColumn, STATUS_GLYPH, STATUS_LABELS, type MatrixColumn } from "./format";
import s from "./ifrs.module.css";

const FIGURES: [keyof NonNullable<LeaseContractResult["closing"]>, string][] = [["debtOpening", "Dette d'ouverture"], ["additions", "Entrée (dette initiale)"], ["interest", "Intérêts"], ["payments", "Loyers de l'exercice"], ["principal", "Principal remboursé"],
  ["debtClosing", "Dette de clôture"], ["rouGross", "Droit d'utilisation brut"], ["depreciation", "Dotation"], ["accumulatedClosing", "Amortissements cumulés"], ["rouNetClosing", "Droit d'utilisation net"], ["openingEquityEffect", "Effet d'ouverture"]];

/** Contenu de l'inspecteur pour un contrat : termes, motifs, échéances, preuves ; chiffres du moteur seulement s'ils existent. */
const known = (a: KnownAmount) => a.kind === "known" ? moneyFr(a.value) : a.kind === "unknown" ? "inconnu — " + a.reason : "sans objet";

export function ContractDetail({ contract, result, framing, bundle, focusColumn }: { contract: QualifiedContract; result: LeaseContractResult | null; framing: ContractFraming | null; bundle: AdjustmentBundle | null; focusColumn: MatrixColumn | null }) {
  const reasons = focusColumn === "ledger" ? [] : contract.reasons.filter(r => !focusColumn || reasonColumn(r) === focusColumn || r.effect === "info");
  const lines = bundle?.lines.filter(l => l.contractId === contract.contractId) ?? [];
  // Opened from the framing column, the framing comes first; otherwise it follows the engine figures.
  const framingBlock = framing && <>
      <h3>Cadrage PCG</h3>
      <p className={s.status} data-framing={framing.status}><strong>{FRAMING_LABELS[framing.status]}</strong>{framing.reason ? " — " + framing.reason : ""}</p>
      {framing.status !== "not_applicable" && <dl className={s.kv}>
        <dt>Loyers hors TVA de l'exercice</dt><dd className={s.mono}>{moneyFr(framing.expectedRent)}</dd>
        <dt>Charges de la base retenues</dt><dd className={s.mono}>{known(framing.bookedRent)}</dd>
        <dt>Écart au net</dt><dd className={s.mono}>{known(framing.difference)}</dd>
        {framing.baseAccounts.length > 0 && <><dt>Comptes de la base</dt><dd className={s.mono}>{framing.baseAccounts.join(", ")}</dd></>}
      </dl>}
      {framing.lines.length > 0 && <div className={s.scroll} role="region" aria-label={"Lignes PCG du contrat " + contract.contractId} tabIndex={0}>
        <table className={s.table} style={{ minWidth: 560 }}><caption>Une ligne de la base par rangée, comparée aux échéances qu'elle couvre ; aucune compensation entre lignes.</caption>
          <thead><tr><th scope="col">Pièce</th><th scope="col">Compte</th><th scope="col">Période couverte</th><th scope="col" className={s.money}>Montant</th><th scope="col" className={s.money}>Loyers couverts</th><th scope="col">État</th></tr></thead>
          <tbody>{framing.lines.map(l => <tr key={l.key}><td className={s.mono}>{l.piece ?? "—"}</td><td className={s.mono}>{l.account ?? "—"}</td>
            <td>{l.periodStart && l.periodEnd ? dateFr(l.periodStart) + " → " + dateFr(l.periodEnd) : "non renseignée"}</td><td className={s.money}>{moneyFr(l.amount)}</td>
            <td className={s.money}>{l.expected ? moneyFr(l.expected) : "—"}</td><td>{LINE_STATUS_LABELS[l.status]}</td></tr>)}</tbody></table></div>}
      {framing.gaps.length > 0 && <ul className={s.reasons}>{framing.gaps.map(g => <li key={g.kind}><span className={s.mono}>{g.code === "info" ? "info" : g.code}</span><span>{g.message}{g.amount.kind === "known" ? " · " + moneyFr(g.amount.value) : ""}{g.dueDates ? " · échéances " + g.dueDates.map(dateFr).join(", ") : ""}</span></li>)}</ul>}
      {framing.vatBridge && framing.vatBridge.paidVat.amount !== "0.00" && <p className={s.muted}>Pont de TVA de l'échéancier : règlements {moneyFr(framing.vatBridge.paidTotal)} − TVA {moneyFr(framing.vatBridge.paidVat)} = loyers hors TVA {moneyFr(framing.expectedRent)}. {framing.vatBridge.note}</p>}
    </>;
  const payable = contract.dues.filter(d => d.role === "exigible"), future = contract.dues.length - payable.length;
  const settled = payable.filter(d => d.settlement === "regle").length;
  return <div>
    <p className={s.status} data-status={contract.status}><span aria-hidden="true">{STATUS_GLYPH[contract.status]}</span><strong>{STATUS_LABELS[contract.status]}</strong></p>
    <dl className={s.kv}>
      <dt>Version</dt><dd className={s.mono}>{contract.version ?? "non renseignée"}</dd>
      <dt>Catégorie</dt><dd>{contract.assetCategory ?? "non renseignée"}</dd>
      <dt>Bailleur</dt><dd>{contract.lessor ?? "non renseigné"}</dd>
      {contract.inputs && <><dt>Commencement</dt><dd>{dateFr(contract.inputs.commencement)} · {contract.inputs.months} mois</dd>
        <dt>Loyer mensuel</dt><dd className={s.money} style={{ textAlign: "left" }}>{moneyFr(contract.inputs.payment)}</dd>
        <dt>Taux annuel effectif</dt><dd className={s.mono}>{contract.inputs.annualRate}</dd>
        <dt>Durée d'utilité</dt><dd>{contract.inputs.usefulLifeMonths} mois</dd></>}
      {contract.historical && <><dt>Reprise historique</dt><dd>{contract.inputs?.opening === "absent" ? "ouverture absente (diagnostic)" : contract.inputs?.opening === "incomplete" ? "ouverture incomplète (diagnostic)" : "ouverture déclarée, comparée au recalcul"}</dd></>}
      <dt>Empreinte</dt><dd className={s.mono}>{contract.fingerprint.slice(0, 16)}…</dd>
    </dl>
    {focusColumn === "ledger" ? framingBlock : <><h3>{focusColumn ? "Motifs — " + MATRIX_COLUMNS.find(c => c.id === focusColumn)!.label : "Motifs"}</h3>
    {reasons.length ? <ul className={s.reasons}>{reasons.map((r, i) => <li key={r.code + i}><span className={s.mono}>{r.code}</span><span>{r.message}{r.field ? " (" + r.field + ")" : ""}</span></li>)}</ul>
      : <p className={s.muted}>{focusColumn ? "Aucun motif dans cette famille : réponses confirmées par les sources." : "Aucun motif : toutes les réponses requises sont présentes."}</p>}</>}
    <h3>Échéances</h3>
    <p>{contract.dues.length ? plural(payable.length, "échéance exigible", "échéances exigibles") + " à la date de revue, dont " + settled + " réglée(s) · " + plural(future, "échéance non encore exigible", "échéances non encore exigibles") : "Aucune échéance dans les sources."}</p>
    {result?.closing && <>
      <h3>Mouvements de l'exercice — moteur{result.result === "diagnostic" ? ", diagnostic" : ""}</h3>
      <table className={s.table} style={{ minWidth: 0 }}><caption>Détail économique au centime (exactitude interne à 40 décimales) ; il n'est jamais additionné au retraitement de clôture.</caption>
        <tbody>{FIGURES.map(([k, label]) => <tr key={k}><th scope="row">{label}</th><td className={s.money}>{moneyFr(result.closing![k] as never)}</td></tr>)}</tbody></table>
    </>}
    {focusColumn !== "ledger" && framingBlock}
    {result && result.result !== "not_applicable" && result.result !== "not_commenced" && <>
      <h3>Retraitement proposé pour ce contrat</h3>
      {result.adjustment.status === "included" && lines.length ? <table className={s.table} style={{ minWidth: 0 }}><caption>Soldes de clôture et charges de l'exercice ; aucune ligne de trésorerie.</caption>
        <thead><tr><th scope="col">Compte logique</th><th scope="col" className={s.money}>Débit</th><th scope="col" className={s.money}>Crédit</th></tr></thead>
        <tbody>{lines.map(l => <tr key={l.account}><th scope="row">{LOGICAL_ACCOUNT_CATALOG[l.account].label}<div className={s.muted}>{l.account}</div></th>
          <td className={s.money}>{l.side === "debit" ? moneyFr(l.amount) : ""}</td><td className={s.money}>{l.side === "credit" ? moneyFr(l.amount) : ""}</td></tr>)}</tbody></table>
        : <p className={s.muted}>{result.adjustment.reason ?? "Aucun retraitement pour ce contrat."}</p>}
    </>}
    {result && !result.closing && <p className={s.muted}>{result.resultReasons.join(" ; ")}</p>}
    <h3>Pièces citées</h3>
    <ul className={s.reasons}>{[...new Map([...contract.evidence, ...(framing?.lines.map(l => l.proof) ?? [])].map(p => [p.documentVersionId, p])).values()].map(p => <li key={p.documentVersionId}><span className={s.mono}>{p.sha256.slice(0, 8)}</span><span>{p.fileName}{p.row ? " · ligne " + p.row : ""}</span></li>)}</ul>
  </div>;
}
