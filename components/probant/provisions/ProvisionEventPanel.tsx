"use client";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { formatCents, PV_MASKED, PV_MOVEMENT_LABELS, PV_PIECE_LABELS, PV_RUBRIC_LABELS, PV_STATE_LABELS, PV_STATUS_KIND, PV_TREATMENT_LABELS, PV_TYPE_LABELS, type ProvisionEventResult, type ProvisionResult } from "@/lib/workpapers/provision-contract";
import { KindBadge, Lock } from "./ProvisionRegister";
import { dateFr, type ProvisionView } from "./format";
import styles from "../cash/cash.module.css";
import pv from "./provisions.module.css";

export interface ProvisionPanelHandle { focus(): void }
interface Props { event: ProvisionEventResult | null; result: ProvisionResult | null; view: ProvisionView; dossierId: string; periodId: string; onReturn(): void }
const abs = (x: bigint) => x < 0n ? -x : x;
const Masked = () => <span className={pv.masked}><Lock/>{PV_MASKED}</span>;
const KIND_COLOR: Record<string, string> = { difference: "#f0a63a", annex: "#b99cff", unsupported: "#ff7b72", uncertain: "#8a99af" };
const FINDING_KIND: Record<string, string> = { ESTIMATE_DIFFERENCE: "difference", BRIDGE_DIFFERENCE: "difference", CLOSED_WITH_BALANCE: "difference", TREATMENT_BALANCE_MISMATCH: "difference", ANNEX_MISSING: "annex", ANNEX_AMOUNT_DIFFERENCE: "annex", ANNEX_RUBRIC_MISMATCH: "annex", MOVEMENT_UNSUPPORTED: "unsupported", DECISION_UNSUPPORTED: "unsupported" };

/** Bridge of one event: opening + increases − used − unused reversals = computed closing, against the declared closing. */
function EventBridge({ e }: { e: ProvisionEventResult }) {
  const b = e.bridge!;
  const rows: [string, string | null, string][] = [["Ouverture", b.opening, "total"], ["+ Dotations", b.dotations, "receipt"], ["− Utilisations", b.utilisations, "payment"], ["− Reprises non utilisées", b.reprises, "other"], ["= Clôture calculée", b.computedClosing, "total"], ["Clôture déclarée au registre", b.declaredClosing, "ledger"]];
  const known = rows.map(r => r[1]).filter((x): x is string => x !== null).map(x => abs(BigInt(x))), max = known.reduce((a, c) => c > a ? c : a, 1n);
  return <figure style={{ margin: 0 }}><figcaption className={styles.muted}>Pont de l’événement, en euros{b.journal ? "" : " — journal des mouvements absent : clôture inconnue"}.</figcaption>
    <ol className={styles.bridge}>{rows.map(([label, value, kind]) => <li key={label}><div className={styles.step} data-kind={label.startsWith("=") ? "total" : kind === "ledger" ? "ledger" : undefined} style={{ gridTemplateColumns: "minmax(0,1fr) auto", gridTemplateAreas: '"label value" "track track"', rowGap: 4 }}>
      <span className={styles.stepLabel} style={{ gridArea: "label" }}>{label}</span><span className={styles.track} style={{ gridArea: "track" }} aria-hidden="true">{value !== null && <span className={styles.bar} data-kind={kind} style={{ left: 0, width: Number((abs(BigInt(value)) * 10000n) / max) / 100 + "%" }}/>}</span>
      <span className={styles.stepValue} style={{ gridArea: "value" }}>{formatCents(value)}</span></div></li>)}</ol>
    {b.difference !== null && b.difference !== "0" && <p className={styles.notice}>Clôture déclarée − calculée : {formatCents(b.difference, { signed: true })} à expliquer.</p>}
  </figure>;
}
/** Estimate / booking: the documented scenarios as dots, the booked provision as a bar, the difference as a bracket. No probability is applied. */
function EstimateScale({ e }: { e: ProvisionEventResult }) {
  const booked = e.bridge?.computedClosing ?? null;
  const values = [...e.estimates.map(s => BigInt(s.amountCents)), ...(booked !== null ? [BigInt(booked)] : [])], max = values.reduce((a, c) => abs(c) > a ? abs(c) : a, 1n) * 11n / 10n;
  const at = (v: bigint) => Number((abs(v) * 10000n) / max) / 100;
  const retained = e.retainedEstimateCents === null ? null : BigInt(e.retainedEstimateCents);
  return <div>
    <div className={pv.scale} role="img" aria-label={"Provision " + formatCents(booked) + (retained !== null ? ", estimation retenue " + formatCents(String(retained)) : ", aucune estimation retenue") + (e.estimateDifferenceCents ? ", différence " + formatCents(e.estimateDifferenceCents, { signed: true }) : "")}>
      {booked !== null && <span className={pv.booked} style={{ width: at(BigInt(booked)) + "%" }}/>}
      {booked !== null && retained !== null && retained !== BigInt(booked) && <span className={pv.gap} style={{ left: Math.min(at(BigInt(booked)), at(retained)) + "%", width: Math.abs(at(retained) - at(BigInt(booked))) + "%" }}/>}
      {e.estimates.map(s => <span key={s.rowId} className={pv.dot} data-retained={s.retained} style={{ left: at(BigInt(s.amountCents)) + "%" }} title={s.scenario}/>)}
    </div>
    <ul className={pv.scaleLegend}><li>Barre : provision de clôture calculée {formatCents(booked)}</li>{e.estimates.map(s => <li key={s.rowId}>{s.retained ? "● retenue" : "○"} {s.scenario} : {formatCents(s.amountCents)}</li>)}</ul>
  </div>;
}

export const ProvisionEventPanel = forwardRef<ProvisionPanelHandle, Props>(function ProvisionEventPanel({ event: e, result, view, dossierId, periodId, onReturn }, ref) {
  const heading = useRef<HTMLHeadingElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => heading.current?.focus() }), []);
  const close = (k: React.KeyboardEvent) => { if (k.key === "Escape") { k.preventDefault(); onReturn(); } };
  const canDownload = view.permissions.includes("download");
  const download = (id: string) => "/api/workpapers/provisions?" + new URLSearchParams({ dossierId, periodId, operation: "download", id });
  const restricted = (documentVersionId: string) => !view.confidentialAccess && Object.values(view.versions).flat().some(v => v.documentVersionId === documentVersionId && v.confidential);
  if (!e || !result) return <aside className={styles.detail} aria-label="Fiche d’événement" onKeyDown={close} tabIndex={0}><h2 ref={heading} tabIndex={-1}>Fiche d’événement</h2>
    <p className={styles.muted}>Choisissez une case : la chronologie, les pièces, les scénarios, la décision, le pont et les comparaisons de l’événement s’affichent ici. Échap revient à la case d’origine.</p></aside>;
  const lines = [...e.movements.map(m => ({ key: m.rowId, text: PV_MOVEMENT_LABELS[m.kind] + " " + formatCents(m.amountCents) + " · " + dateFr(m.date), piece: m.pieceRef, ok: m.supported, file: m.fileName + (m.row ? " ligne " + m.row : ""), version: m.documentVersionId }))];
  return <aside className={styles.detail} data-open="true" aria-label="Fiche d’événement" onKeyDown={close} key={e.eventId} tabIndex={0}>
    <h2 ref={heading} tabIndex={-1}>{e.eventId} · {e.label}</h2>
    <p className={pv.chips}><span className={pv.chip}>{PV_TYPE_LABELS[e.type]}</span><span className={pv.chip}>{PV_STATE_LABELS[e.state]}</span>{e.confidential && <span className={pv.lock}><Lock/>Confidentiel{e.masked ? " — contenu masqué selon vos droits" : ""}</span>}</p>
    <KindBadge status={e.status}/>
    {!e.inScope && <p className={styles.notice}>{e.reason}</p>}
    {e.findings.length > 0 && <ul className={pv.findings} aria-label="Points relevés">{e.findings.map(f => <li key={f.code} style={{ "--kind": KIND_COLOR[FINDING_KIND[f.code] ?? "uncertain"] } as React.CSSProperties}>{f.label}</li>)}</ul>}
    <h3>Obligation et décision de l’entité</h3>
    <dl>
      <dt>Obligation décrite</dt><dd>{e.obligation ?? <Masked/>}</dd>
      <dt>Contrepartie</dt><dd>{e.masked ? <Masked/> : e.counterparty ?? "—"}</dd>
      <dt>Traitement retenu</dt><dd>{PV_TREATMENT_LABELS[e.treatment]}</dd>
      <dt>Décision</dt><dd>{e.masked ? <Masked/> : e.decision ?? "—"}{e.decisionPiece ? " · pièce " + e.decisionPiece.ref + (e.decisionPiece.supported ? "" : " (absente des pièces citables)") : " · aucune pièce de décision"}{e.decisionDate ? " · " + dateFr(e.decisionDate) : ""}</dd>
      <dt>Méthode d’estimation</dt><dd>{e.masked ? <Masked/> : e.method ?? "—"}</dd>
      <dt>Auteur</dt><dd>{e.author}</dd>
      <dt>Compte</dt><dd>{e.account ?? "Sans écriture"}</dd>
      <dt>Registre</dt><dd>{e.register.fileName}{e.register.row ? " · ligne " + e.register.row : ""} · version <code style={{ display: "inline" }}>{e.register.documentVersionId.slice(7, 19)}</code></dd>
    </dl>
    <p className={styles.muted}>La probabilité et la qualification de l’obligation restent des décisions humaines : l’outil lit le traitement retenu et sa pièce, il ne déduit aucune issue juridique.</p>
    {e.bridge && <><h3>Pont de provision</h3><EventBridge e={e}/></>}
    {e.treatment === "provision" && e.inScope && <><h3>Estimation documentée / écriture</h3>
      {e.masked ? <p><Masked/> · {e.estimateCount} estimation(s) documentée(s)</p> : e.estimates.length ? <EstimateScale e={e}/> : <p className={styles.muted}>Aucune estimation documentée : comparaison non réalisée (non concluant, jamais réputée égale à la provision).</p>}
      {!e.masked && e.estimateDifferenceCents !== null && <p>Estimation retenue − provision calculée : <strong>{formatCents(e.estimateDifferenceCents, { signed: true })}</strong>{e.estimateDifferenceCents !== "0" ? " — différence à examiner, ni anomalie validée ni correction proposée." : " — concordant."}</p>}</>}
    {e.treatment !== "provision" && e.inScope && !e.masked && e.estimates.length > 0 && <><h3>Effets financiers estimés</h3><ul className={pv.scaleLegend}>{e.estimates.map(s => <li key={s.rowId}>{s.retained ? "● retenue" : "○"} {s.scenario} : {formatCents(s.amountCents)}</li>)}</ul></>}
    {e.inScope && <><h3>Événement / annexe</h3>
      <p>{({ not_provided: "Annexe non fournie : comparaison non réalisée.", not_expected: "Mention individuelle non attendue pour ce traitement (information par catégorie de provisions).", missing: "Absent de l’annexe — à examiner (la faible probabilité qui dispense de mention relève du jugement).", present: "Mentionné en annexe." } as const)[e.annex.status]}</p>
      {e.annex.lines.length > 0 && <ul className={pv.pieces}>{e.annex.lines.map(a => <li key={a.rowId}><span>{PV_RUBRIC_LABELS[a.rubric]} · {a.amountStatus === "publie" ? formatCents(a.publishedCents) : a.amountStatus === "non_chiffre" ? "non chiffré" : "non fourni (préjudice invoqué)"}</span>
        <small>{a.referenceKind ? "Référence " + ({ provision: "provision calculée", commitment: "engagement au registre", estimate: "estimation retenue" } as const)[a.referenceKind] + " " + formatCents(a.referenceCents) + (a.differenceCents !== null ? " · écart " + formatCents(a.differenceCents, { signed: true }) : "") : e.masked ? PV_MASKED : "Aucune référence chiffrée"} · {a.fileName}{a.row ? " ligne " + a.row : ""}</small></li>)}</ul>}</>}
    {lines.length > 0 && <><h3>Mouvements</h3><ul className={pv.pieces}>{lines.map(l => <li key={l.key}><span>{l.text}</span><small>{l.piece ? "Pièce " + l.piece + (l.ok ? "" : " — absente des pièces citables") : "Sans justificatif"} · {l.file}</small></li>)}</ul></>}
    <h3>Chronologie</h3>
    <ol className={pv.timeline}>{e.chronology.map((c, i) => <li key={i} data-kind={c.kind} style={{ "--i": i } as React.CSSProperties}><time dateTime={c.date}>{dateFr(c.date)}</time>{c.label}</li>)}</ol>
    <h3>Pièces</h3>
    {e.pieces.length ? <ul className={pv.pieces}>{e.pieces.map(p => <li key={p.rowId}><span>{PV_PIECE_LABELS[p.kind]} {p.key}{p.confidential && <> <span className={pv.lock}><Lock/>confidentielle</span></>}</span>
      <small>{p.label ?? (p.confidential ? "Libellé masqué selon vos droits" : "—")} · {dateFr(p.date)} · {p.fileName}{p.row ? " ligne " + p.row : ""} · version {p.documentVersionId.slice(7, 19)}</small>
      {canDownload && (restricted(p.documentVersionId) ? <small>Original réservé à une habilitation confidentielle</small> : <a href={download(p.documentVersionId)}>Télécharger la liste de pièces figée</a>)}</li>)}</ul> : <p className={styles.muted}>Aucune pièce citable rattachée.</p>}
    <p className={styles.muted}>Statut : {PV_STATUS_KIND[e.status] === "ok" ? "comparaisons documentées concordantes" : "voir les points relevés"}. Une revue documentée ne vaut ni opinion sur les comptes ni conclusion juridique.</p>
  </aside>;
});
