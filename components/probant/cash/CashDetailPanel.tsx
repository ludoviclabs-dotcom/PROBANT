"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cents } from "@/lib/canonical-model/money";
import type { CashDraft } from "@/lib/workpapers/cash-reconciliation";
import { CashStatusBadge } from "./CashStatus";
import { dateFr, eur, KIND_LABELS, locatorText, plural } from "./format";
import type { CashView, DisplayAccount, FactRef, PanelTarget } from "./types";
import styles from "./cash.module.css";

const BALANCE_LABELS = { ledger: "Solde comptable (GL) à la clôture", statement: "Solde du relevé bancaire à la clôture", erbBook: "Solde comptable selon l’ERB", erbBank: "Solde banque selon l’ERB" } as const;
export interface DetailHandle { focus(): void }
function SourceBox({ source, view, dossierId, periodId, title = "Source qualifiée" }: { source: FactRef | null; view: CashView; dossierId: string; periodId: string; title?: string }) {
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
    {view.permissions.includes("download") && <a href={"/api/workpapers/cash?" + new URLSearchParams({ dossierId, periodId, operation: "download", id: source.documentVersionId })}>Télécharger l’original (même contrôle d’accès)</a>}
  </section>;
}
interface Props { target: PanelTarget; account: DisplayAccount | null; view: CashView; dossierId: string; periodId: string; editable: boolean; windowDocumented: boolean; draft: CashDraft | null;
  onDraft(next: CashDraft): void; onReturn(): void }
export const CashDetailPanel = forwardRef<DetailHandle, Props>(function CashDetailPanel({ target, account, view, dossierId, periodId, editable, windowDocumented, draft, onDraft, onReturn }, ref) {
  const heading = useRef<HTMLHeadingElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => heading.current?.focus() }), []);
  const [settlementId, setSettlementId] = useState(""), [amount, setAmount] = useState(""), [supportKey, setSupportKey] = useState(""), [reason, setReason] = useState(""), [exclusion, setExclusion] = useState("");
  const key = target?.kind === "item" ? target.itemId : target?.kind === "balance" ? target.balance : target?.kind ?? "";
  useEffect(() => { setSettlementId(""); setAmount(""); setSupportKey(""); setReason(""); setExclusion(""); }, [key]);
  if (!target || !account) return <aside className={styles.detail} aria-label="Détail et source"><h2 ref={heading} tabIndex={-1}>Détail et source</h2><p className={styles.muted}>Choisissez une étape du pont, un solde de l’ERB ou une ligne de suspens. Entrée ouvre la ligne ; Échap revient à l’élément d’origine.</p></aside>;
  const close = (e: React.KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onReturn(); } };
  if (target.kind === "balance") return <aside className={styles.detail} data-open="true" aria-label="Détail et source" onKeyDown={close}>
    <h2 ref={heading} tabIndex={-1}>{BALANCE_LABELS[target.balance]}</h2><p className={styles.muted}>Compte {account.glAccount} · {account.bankId} · {account.accountReference}</p>
    <SourceBox source={account.fact?.balances[target.balance] ?? null} view={view} dossierId={dossierId} periodId={periodId}/>
    <button type="button" onClick={onReturn}>Retour au pont</button>
  </aside>;
  if (target.kind === "computation") {
    const bridge = account.result?.bridge.status === "computed" ? account.result.bridge : null;
    return <aside className={styles.detail} data-open="true" aria-label="Détail et source" onKeyDown={close}>
      <h2 ref={heading} tabIndex={-1}>{target.step === "difference" ? "Écart du pont" : "Solde reconstitué"}</h2>
      {bridge ? <><p>{target.step === "difference" ? `GL ${eur(bridge.ledger.amount)} − reconstitué ${eur(bridge.reconstructed)} = ${eur(bridge.difference, { signed: true })}.` : `Relevé ${eur(bridge.statement.amount)} + suspens ${eur(bridge.movement, { signed: true })} = ${eur(bridge.reconstructed)}.`}</p>
        <p className={styles.muted}>{bridge.differenceMeaning} Calcul serveur, entrées {bridge.inputHash.slice(0, 16)}…</p>
        <p className={styles.notice}>Un écart nul ne donne aucune assurance d’authenticité : relevé, ERB et GL altérés de façon cohérente concorderaient aussi. L’écart du pont reste distinct des écarts de source.</p></> : <p>Pont non calculé.</p>}
      <button type="button" onClick={onReturn}>Retour au pont</button>
    </aside>;
  }
  const item = account.items.find(i => i.itemId === target.itemId);
  if (!item) return <aside className={styles.detail} aria-label="Détail et source"><h2 ref={heading} tabIndex={-1}>Suspens introuvable</h2><p>Ce suspens n’existe pas dans la version affichée.</p><button type="button" onClick={onReturn}>Retour</button></aside>;
  const sameSign = account.fact?.settlements.filter(s => (cents(s.amount) > 0n) === (cents(item.amount) > 0n)) ?? [];
  const support = account.fact?.support ?? [];
  const draftAllocations = draft?.allocations.filter(a => a.itemId === item.itemId) ?? [], draftCorrection = draft?.corrections.find(c => c.itemId === item.itemId), draftExclusion = draft?.exclusions.find(e => e.itemId === item.itemId);
  const canEdit = editable && !!draft && account.inScope;
  const normalizedAmount = amount.trim().replace(",", ".");
  const validAmount = /^\d+(\.\d{1,2})?$/.test(normalizedAmount) && /[1-9]/.test(normalizedAmount);
  // Exact decimal string: no floating-point rounding of the amount typed by the preparer.
  const exactAmount = () => { const [whole, decimals = ""] = normalizedAmount.split("."); return BigInt(whole).toString() + "." + decimals.padEnd(2, "0"); };
  const update = (patch: Partial<CashDraft>) => draft && onDraft({ ...draft, ...patch });
  return <aside className={styles.detail} data-open="true" aria-label="Détail et source" onKeyDown={close}>
    <h2 ref={heading} tabIndex={-1}>Suspens {item.itemId} — {KIND_LABELS[item.kind]}</h2>
    <p><CashStatusBadge status={item.status}/></p><p className={styles.muted}>{item.statusMeaning}{item.exclusionReason ? " Motif : " + item.exclusionReason : ""}</p>
    <dl>
      <dt>Compte</dt><dd>{account.glAccount} · {account.bankId} · {account.accountReference}</dd>
      <dt>Montant à la clôture</dt><dd className={styles.money} style={{ textAlign: "left" }}>{eur(item.amount)} <span className={styles.muted}>(figé)</span></dd>
      <dt>Date / âge</dt><dd>{dateFr(item.date)} · {item.ageDays === null ? "âge calculé à l’exécution" : plural(item.ageDays, "jour") + " à la clôture"}</dd>
      <dt>Explication ERB</dt><dd>{item.explanation || "Aucune explication fournie"}</dd>
      <dt>Pièce</dt><dd>{item.pieceRef || "Non renseignée"}</dd>
      <dt>Apuré / reste</dt><dd>{item.settledAmount ? eur(item.settledAmount) : "—"} / {item.remainingAmount ? eur(item.remainingAmount) : "non calculé"}</dd>
    </dl>
    {item.warnings.map(w => <p key={w} className={styles.notice} data-tone="danger">{w === "APUREMENT_AVANT_CLOTURE_PRESENT_DANS_ERB" ? "Règlement daté avant la clôture alors que le suspens figure à l’ERB." : w}</p>)}
    <SourceBox source={item.source} view={view} dossierId={dossierId} periodId={periodId} title="Source du suspens (ERB)"/>
    {item.allocations.length > 0 && <><h3>Apurement documenté (calcul serveur)</h3><ul className={styles.list}>{item.allocations.map(a => { const s = account.fact?.settlements.find(x => x.settlementId === a.settlementId); return <li key={a.id}>
      <div className={styles.kv}><strong>{a.settlementId}</strong><span>{dateFr(a.settlementDate)}</span><span className={styles.money}>{eur(a.amount)}</span><span>{a.effective ? "Effet sur l’apurement" : "Sans effet (non testé ou corrigé)"}</span></div>
      <p className={styles.muted}>Alloué par {a.authorId} · {new Date(a.authoredAt).toLocaleString("fr-FR")}</p>
      <SourceBox source={s ?? null} view={view} dossierId={dossierId} periodId={periodId} title="Relevé postérieur"/></li>; })}</ul></>}
    {item.correction && <><h3>Correction documentée</h3><p>{item.correction.reason}</p><p className={styles.muted}>{item.correction.authorId} · {new Date(item.correction.authoredAt).toLocaleString("fr-FR")}</p></>}
    {canEdit && <section aria-label="Brouillon d’apurement de ce suspens">
      <h3>Brouillon d’apurement <span className={styles.draftTag}>non calculé</span></h3>
      {!windowDocumented && <p className={styles.notice}>Fenêtre non documentée : les allocations seront refusées tant que les relevés postérieurs ne documentent pas la fenêtre.</p>}
      {draftAllocations.map(a => <p key={a.id} className={styles.kv}>Allocation {a.settlementId} · {eur(a.amount)} <button type="button" onClick={() => update({ allocations: draft!.allocations.filter(x => x.id !== a.id) })}>Retirer</button></p>)}
      {draftCorrection && <p className={styles.kv}>Correction : {draftCorrection.reason} <button type="button" onClick={() => update({ corrections: draft!.corrections.filter(x => x.itemId !== item.itemId) })}>Retirer</button></p>}
      {draftExclusion && <p className={styles.kv}>Exclu du test : {draftExclusion.reason} <button type="button" onClick={() => update({ exclusions: draft!.exclusions.filter(x => x.itemId !== item.itemId) })}>Réintégrer</button></p>}
      {!draftExclusion && !draftCorrection && <form onSubmit={e => { e.preventDefault(); if (!settlementId || !validAmount) return; update({ allocations: [...draft!.allocations, { id: "alloc-" + crypto.randomUUID(), itemId: item.itemId, settlementId, amount: { amount: exactAmount(), currency: "EUR" } }] }); setSettlementId(""); setAmount(""); }}>
        <div className={styles.fields}>
          <label>Règlement postérieur (même compte, même sens)<select value={settlementId} onChange={e => setSettlementId(e.target.value)}><option value="">Choisir…</option>{sameSign.map(s => <option key={s.settlementId} value={s.settlementId}>{s.settlementId} · {dateFr(s.date)} · {eur(s.amount, { signed: true })}{s.label ? " · " + s.label : ""}</option>)}</select></label>
          <label>Montant alloué (valeur absolue, EUR)<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="15,00" aria-invalid={!!amount && !validAmount}/></label>
        </div>
        {!sameSign.length && <p className={styles.muted}>Aucun mouvement postérieur de même sens sur ce compte.</p>}
        <button type="submit" disabled={!settlementId || !validAmount}>Ajouter l’allocation au brouillon</button>
      </form>}
      {!draftAllocations.length && !draftCorrection && !draftExclusion && <>
        <form onSubmit={e => { e.preventDefault(); const [importId, rowId] = supportKey.split("|"); if (!importId || !reason.trim()) return; update({ corrections: [...draft!.corrections, { id: "corr-" + crypto.randomUUID(), itemId: item.itemId, proof: { importId, rowId }, reason: reason.trim() }] }); setSupportKey(""); setReason(""); }}>
          <div className={styles.fields}>
            <label>Pièce de correction (même compte)<select value={supportKey} onChange={e => setSupportKey(e.target.value)}><option value="">Choisir…</option>{support.map(s => <option key={s.importId + "|" + s.rowId} value={s.importId + "|" + s.rowId}>{s.supportId} · {dateFr(s.date)} · {eur(s.amount, { signed: true })}</option>)}</select></label>
            <label>Motif de la correction<input value={reason} onChange={e => setReason(e.target.value)}/></label>
          </div>
          <button type="submit" disabled={!supportKey || !reason.trim()}>Documenter une correction</button>
        </form>
        <form onSubmit={e => { e.preventDefault(); if (!exclusion.trim()) return; update({ exclusions: [...draft!.exclusions, { itemId: item.itemId, reason: exclusion.trim() }] }); setExclusion(""); }}>
          <div className={styles.fields}><label>Motif d’exclusion du test<input value={exclusion} onChange={e => setExclusion(e.target.value)}/></label></div>
          <button type="submit" disabled={!exclusion.trim()}>Exclure ce suspens du test (non testé)</button>
        </form></>}
    </section>}
    <div className={styles.actions}><button type="button" onClick={onReturn}>Retour à la ligne</button></div>
  </aside>;
});
