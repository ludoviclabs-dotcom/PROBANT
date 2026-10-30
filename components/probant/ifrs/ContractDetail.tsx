"use client";
import type { QualifiedContract } from "@/lib/ifrs/leases/qualification";
import type { LeaseContractResult } from "@/lib/workpapers/lease-review";
import { dateFr, MATRIX_COLUMNS, moneyFr, plural, reasonColumn, STATUS_GLYPH, STATUS_LABELS, type MatrixColumn } from "./format";
import s from "./ifrs.module.css";

const FIGURES: [keyof NonNullable<LeaseContractResult["closing"]>, string][] = [["debtOpening", "Dette d'ouverture"], ["additions", "Entrée (dette initiale)"], ["interest", "Intérêts"], ["payments", "Loyers de l'exercice"],
  ["debtClosing", "Dette de clôture"], ["rouGross", "Droit d'utilisation brut"], ["depreciation", "Dotation"], ["accumulatedClosing", "Amortissements cumulés"], ["rouNetClosing", "Droit d'utilisation net"], ["openingEquityEffect", "Effet d'ouverture"]];

/** Contenu de l'inspecteur pour un contrat : termes, motifs, échéances, preuves ; chiffres du moteur seulement s'ils existent. */
export function ContractDetail({ contract, result, focusColumn }: { contract: QualifiedContract; result: LeaseContractResult | null; focusColumn: MatrixColumn | null }) {
  const reasons = contract.reasons.filter(r => !focusColumn || reasonColumn(r) === focusColumn || r.effect === "info");
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
    <h3>{focusColumn ? "Motifs — " + MATRIX_COLUMNS.find(c => c.id === focusColumn)!.label : "Motifs"}</h3>
    {reasons.length ? <ul className={s.reasons}>{reasons.map((r, i) => <li key={r.code + i}><span className={s.mono}>{r.code}</span><span>{r.message}{r.field ? " (" + r.field + ")" : ""}</span></li>)}</ul>
      : <p className={s.muted}>{focusColumn ? "Aucun motif dans cette famille : réponses confirmées par les sources." : "Aucun motif : toutes les réponses requises sont présentes."}</p>}
    <h3>Échéances</h3>
    <p>{contract.dues.length ? plural(payable.length, "échéance exigible", "échéances exigibles") + " à la date de revue, dont " + settled + " réglée(s) · " + plural(future, "échéance non encore exigible", "échéances non encore exigibles") : "Aucune échéance dans les sources."}</p>
    {result?.closing && <>
      <h3>Chiffres de l'exercice — moteur{result.result === "diagnostic" ? ", diagnostic" : ""}</h3>
      <table className={s.table} style={{ minWidth: 0 }}><caption>Montants publiés au centime ; exactitude interne à 40 décimales.</caption>
        <tbody>{FIGURES.map(([k, label]) => <tr key={k}><th scope="row">{label}</th><td className={s.money}>{moneyFr(result.closing![k] as never)}</td></tr>)}</tbody></table>
    </>}
    {result && !result.closing && <p className={s.muted}>{result.resultReasons.join(" ; ")}</p>}
    <h3>Pièces citées</h3>
    <ul className={s.reasons}>{[...new Map(contract.evidence.map(p => [p.documentVersionId, p])).values()].map(p => <li key={p.documentVersionId}><span className={s.mono}>{p.sha256.slice(0, 8)}</span><span>{p.fileName}{p.row ? " · ligne " + p.row : ""}</span></li>)}</ul>
  </div>;
}
