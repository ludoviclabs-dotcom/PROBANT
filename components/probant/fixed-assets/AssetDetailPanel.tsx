"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Money } from "@/lib/canonical-model/money";
import { FA_RECALC_TEXT, FA_SUPPORT_TEXT, type FixedAssetResult, type FixedAssetUnitResult } from "@/lib/workpapers/fixed-asset-review";
import type { FaTable } from "@/lib/workpapers/fixed-asset-sources";
import type { SourceLocator } from "@/lib/workpapers/model";
import { dateFr, eur, knownLabel, locatorText, MOVEMENT_LABELS, STATUS_LABELS, TABLE_LABELS, TREATMENT_LABELS } from "./format";
import type { FactUnit, FixedAssetView } from "./types";
import styles from "../cash/cash.module.css";
import fa from "./fixed-assets.module.css";

type Ref = { importId: string; rowId: string; documentVersionId: string; fileName: string; locator: SourceLocator; amount: Money; date: string };
export interface AssetDetailHandle { focus(): void }
function SourceBox({ source, view, dossierId, periodId, title }: { source: Ref | null; view: FixedAssetView; dossierId: string; periodId: string; title: string }) {
  if (!source) return <div className={styles.sourceBox}><strong>{title}</strong><p>Source absente : aucune valeur n’est réputée nulle.</p></div>;
  const batch = view.imports.find(b => b.id === source.importId), current = view.sourceHeads.some(h => h.import_id === source.importId);
  return <section className={styles.sourceBox} aria-label={title + " — " + source.fileName}>
    <h3>{title}</h3>
    <dl>
      <dt>Pièce</dt><dd>{source.fileName}</dd>
      <dt>Localisateur</dt><dd>{locatorText(source.locator)}</dd>
      <dt>Valeur normalisée</dt><dd>{eur(source.amount)} · {dateFr(source.date)}</dd>
      <dt>Approbation</dt><dd>{batch?.approval ? batch.approval.actorId + " · " + new Date(batch.approval.at).toLocaleString("fr-FR") : "Non approuvée"}</dd>
      <dt>Actualité</dt><dd>{current ? "Source courante" : "Source remplacée — travail périmé"}</dd>
    </dl>
    <details><summary>Version et empreinte</summary><code>Document {source.documentVersionId}</code><code>Ligne {source.rowId}</code><code>SHA-256 {batch?.document.byteHash ?? "inconnu"}</code><code>Mapping {batch?.mapping.version ?? "—"} · parseur {batch?.document.parserVersion ?? "—"}</code></details>
    {view.permissions.includes("download") && <a href={"/api/workpapers/immobilisations?" + new URLSearchParams({ dossierId, periodId, operation: "download", id: source.documentVersionId })}>Télécharger l’original (même contrôle d’accès)</a>}
  </section>;
}
interface Props { unit: FixedAssetUnitResult | null; fact: FactUnit | null; table: FaTable; result: FixedAssetResult | null; view: FixedAssetView; dossierId: string; periodId: string; onReturn(): void }
/** Detail of one asset for the active table: bridge, chronology, source and piece; recalculation inputs, formula, rounding and provenance. */
export const AssetDetailPanel = forwardRef<AssetDetailHandle, Props>(function AssetDetailPanel({ unit, fact, table, result, view, dossierId, periodId, onReturn }, ref) {
  const heading = useRef<HTMLHeadingElement>(null), [open, setOpen] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({ focus: () => heading.current?.focus() }), []);
  const unitId = unit?.unitId ?? fact?.unitId ?? "";
  useEffect(() => { setOpen(null); }, [unitId, table]);
  if (!unit && !fact) return <aside className={styles.detail} aria-label="Détail et source"><h2 ref={heading} tabIndex={-1}>Détail et source</h2><p className={styles.muted}>Choisissez une étape du pont puis un actif. Entrée ouvre l’actif ; Échap revient à l’élément d’origine.</p></aside>;
  const close = (e: React.KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onReturn(); } };
  const base = (unit ?? fact)!, t = unit?.tables[table] ?? null;
  const lines = (fact?.lines ?? []).filter(l => l.table === table).sort((a, b) => a.date.localeCompare(b.date) || a.lineId.localeCompare(b.lineId));
  const supportOf = (lineId: string) => unit?.supports.find(s => s.lineId === lineId) ?? null;
  const r = unit?.recalculation;
  const pieceRef = (pieceId: string) => fact?.supports.find(s => s.pieceId === pieceId) ?? null;
  const serviceProof = r?.inputs.inServiceDate ? fact?.supports.find(s => s.kind === "mise_en_service" && s.date === r.inputs.inServiceDate) ?? null : null;
  return <aside className={styles.detail} data-open="true" aria-label="Détail et source" onKeyDown={close}>
    <h2 ref={heading} tabIndex={-1}>{base.unitId} — {base.label}</h2>
    <p className={styles.muted}>{base.family} · <span className={fa.chip} data-status={base.status}>{STATUS_LABELS[base.status]}</span> · traitement {TREATMENT_LABELS[base.treatment] ?? base.treatment} · compte {fact?.accounts[table] ?? "—"}</p>
    {!base.inScope && <p className={styles.notice}>Exclu du test : {base.exclusionReason}</p>}
    <h3>Pont {TABLE_LABELS[table]} de l’actif</h3>
    {t?.status === "computed" ? <dl>
      <dt>Ouverture</dt><dd className={fa.num}>{eur(t.opening)}</dd><dt>+ Entrées</dt><dd className={fa.num}>{eur(t.additions)}</dd><dt>− Sorties</dt><dd className={fa.num}>{eur(t.disposals)}</dd>
      {table === "impairment" && <><dt>− Reprises</dt><dd className={fa.num}>{eur(t.reversals)}</dd></>}<dt>± Reclassements</dt><dd className={fa.num}>{eur(t.reclassifications, { signed: true })}</dd>
      <dt>= Attendu</dt><dd className={fa.num}>{eur(t.expected)}</dd><dt>Clôture observée</dt><dd className={fa.num}>{eur(t.closing)}</dd>
      <dt>Écart</dt><dd className={fa.num}><strong>{knownLabel(t.difference)}</strong>{t.difference.kind === "known" ? (t.difference.value.amount === "0.00" ? " · aucun écart" : " · à expliquer, aucune correction automatique") : ""}</dd>
    </dl> : t?.status === "incomplete" ? <p className={styles.notice} data-tone="danger">Pont non calculé : {t.missing.join(" ")}</p> : t?.status === "excluded" ? <p className={styles.muted}>Tableau non testé : {t.reason}</p> : <p className={styles.muted}>Non calculé : exécutez la revue sur les sources figées.</p>}
    <h3>Chronologie des mouvements</h3>
    {lines.length ? <ol className={fa.timeline} aria-label={"Chronologie " + TABLE_LABELS[table] + " de " + base.unitId}>{lines.map(l => {
      const support = table === "gross" ? supportOf(l.lineId) : null, piece = support?.piece ? pieceRef(support.piece.pieceId) : null, isOpen = open === l.lineId;
      const outflow = l.movement === "disposal" || l.movement === "reversal";
      return <li key={l.lineId} data-movement={l.movement}>
        <div className={fa.when}>{dateFr(l.date)}</div>
        <div className={fa.what}>
          <div className={styles.kv}><strong>{MOVEMENT_LABELS[l.movement]}</strong><span className={styles.money}>{outflow ? "−" : ""}{eur(l.amount, { signed: l.movement === "reclassification" })}</span><span>{l.lineId}</span>{l.pieceRef && <span>pièce {l.pieceRef}</span>}</div>
          {l.label && <p className={styles.muted}>{l.label}</p>}
          {support && <p><span className={fa.support} data-status={support.status}>{FA_SUPPORT_TEXT[support.status].label}</span> <span className={styles.muted}>{support.statusMeaning}{support.difference.kind === "known" && support.difference.value.amount !== "0.00" ? " Écart registre − pièce : " + eur(support.difference.value, { signed: true }) + "." : ""}</span></p>}
          <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : l.lineId)}>{isOpen ? "Masquer la source" : support ? "Ouvrir la ligne et sa pièce" : "Ouvrir la ligne du registre"}</button>
          {isOpen && <div className={fa.reveal}>
            <SourceBox source={l} view={view} dossierId={dossierId} periodId={periodId} title="Ligne du registre"/>
            {support && <SourceBox source={piece} view={view} dossierId={dossierId} periodId={periodId} title={support.piece ? "Pièce " + support.piece.pieceId + " (" + support.piece.kind.replace("_", " ") + ")" : "Pièce attendue — absente"}/>}
          </div>}
        </div>
      </li>;
    })}</ol> : <p className={styles.notice}>Aucune ligne du registre pour ce tableau : aucune valeur n’est réputée nulle.</p>}
    {table === "amortization" && r && <section aria-labelledby="fa-recalc-title" className={fa.recalcPanel}>
      <h3 id="fa-recalc-title">Recalcul documenté de la dotation</h3>
      <p><span className={fa.recalc} data-status={r.status}>{FA_RECALC_TEXT[r.status].label}</span> <span className={styles.muted}>{r.reason}</span></p>
      <p className={styles.muted}>{FA_RECALC_TEXT[r.status].meaning}</p>
      <h4>Entrées</h4>
      <dl>
        <dt>Méthode</dt><dd>{r.method ? `${r.method.id} v${r.method.version} — ${r.method.label}` : "Aucune méthode applicable"}{r.method && <span className={styles.meaning}>Source citée : {r.method.source}</span>}</dd>
        <dt>Coût (brut de clôture)</dt><dd className={fa.num}>{r.inputs.cost ? eur(r.inputs.cost) : "Non établi"}</dd>
        <dt>Valeur résiduelle</dt><dd className={fa.num}>{r.inputs.residual ? eur(r.inputs.residual) : "Source requise"}</dd>
        <dt>Base amortissable</dt><dd className={fa.num}>{r.inputs.base ? eur(r.inputs.base) : "Non calculée"}</dd>
        <dt>Durée</dt><dd className={fa.num}>{r.inputs.durationMonths ? r.inputs.durationMonths + " mois" : "Source requise"}</dd>
        <dt>Prorata de l’exercice</dt><dd className={fa.num}>{r.inputs.prorataNumerator && r.inputs.prorataDenominator ? r.inputs.prorataNumerator + " / " + r.inputs.prorataDenominator : "Source requise"}</dd>
        <dt>Mise en service</dt><dd>{r.inputs.inServiceDate ? dateFr(r.inputs.inServiceDate) : "Source requise"}</dd>
        <dt>Arrondi</dt><dd>Au centime, demi supérieur</dd>
      </dl>
      <h4>Formule</h4>
      <p className={fa.formula}>{result?.formula}</p>
      <h4>Résultat</h4>
      <dl>
        <dt>Dotation recalculée</dt><dd className={fa.num}>{knownLabel(r.recalculated)}</dd>
        <dt>Dotation comptabilisée</dt><dd className={fa.num}>{knownLabel(r.booked)}</dd>
        <dt>Écart comptabilisé − recalculé</dt><dd className={fa.num}><strong>{r.difference.kind === "known" ? eur(r.difference.value, { signed: true }) : knownLabel(r.difference)}</strong></dd>
      </dl>
      <h4>Provenance</h4>
      <SourceBox source={fact?.parameters ?? null} view={view} dossierId={dossierId} periodId={periodId} title="Paramètres d’amortissement de l’actif"/>
      {r.inputs.inServiceDate && <SourceBox source={serviceProof} view={view} dossierId={dossierId} periodId={periodId} title="Pièce de mise en service"/>}
      <p className={styles.muted}>Un écart nul ne vaut pas conclusion sur la valeur. Un changement de méthode impose une nouvelle exécution et une comparaison versionnée.</p>
    </section>}
    {unit && <p className={styles.muted}>VNC arithmétique (brut − amortissements − dépréciations) : <strong>{knownLabel(unit.vnc)}</strong>. Ce n’est pas une conclusion de valeur ni d’existence physique.</p>}
    <div className={styles.actions}><button type="button" onClick={onReturn}>Retour à la ligne</button></div>
  </aside>;
});
