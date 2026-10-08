"use client";
import { useState } from "react";
import type { PayablesDraft } from "@/lib/workpapers/payables-investigation";
import type { KnownAmount, Money } from "@/lib/canonical-model/money";
import { amountLabel } from "@/lib/workpapers/client-mission";
import s from "./Payables.module.css";
export type PayablesFacts = {
    issue?: string | null;
    invoices?: {
        id: string;
        party: string;
        flow: string;
        net: KnownAmount;
        gross: KnownAmount;
        tax: KnownAmount;
        proofRowId: string;
    }[];
    payments?: {
        id: string;
        party: string;
        amount: Money;
        date: string;
        rowId: string;
    }[];
    ledger?: {
        rowId: string;
        id: string;
        amount: Money;
    }[];
    proofRows?: {
        id: string;
        type: string;
        key: string;
    }[];
};
export function PayablesWorkForm({ draft, onChange, facts, disabled, procedure }: {
    draft: PayablesDraft;
    onChange: (d: PayablesDraft) => void;
    facts?: PayablesFacts;
    disabled: boolean;
    procedure: string;
}) {
    const [accounts, setAccounts] = useState(draft.accounts.join(", "));
    const update = (d: PayablesDraft) => onChange(d), proofOptions = facts?.proofRows ?? [];
    const proofSelect = (value: string[], change: (ids: string[]) => void, label: string) => <label>{label}<select disabled={disabled} value={value[0] ?? ""} onChange={e => change(e.target.value ? [e.target.value] : [])}><option value="">Pièce à rattacher</option>{proofOptions.map(p => <option value={p.id} key={p.id}>{p.type} · {p.key}</option>)}</select></label>;
    const amount = (raw: string): Money => ({ amount: raw, currency: "EUR" });
    return <fieldset disabled={disabled} className={s.workform}><legend>Préparation et méthode</legend><div className={s.form}><label>Comptes dans le périmètre<input value={accounts} onChange={e => { setAccounts(e.target.value); update({ ...draft, accounts: e.target.value.split(",").map(v => v.trim()).filter(Boolean) }); }} placeholder="601000, 408100, 512000"/></label><label>Identifiant de méthode<input value={draft.method.id} onChange={e => update({ ...draft, method: { ...draft.method, id: e.target.value } })}/></label><label>Version de méthode<input value={draft.method.version} onChange={e => update({ ...draft, method: { ...draft.method, version: e.target.value } })}/></label><label>Source de la méthode<input value={draft.method.source} onChange={e => update({ ...draft, method: { ...draft.method, source: e.target.value } })}/></label>{proofSelect(draft.method.proofRowIds, ids => update({ ...draft, method: { ...draft.method, proofRowIds: ids } }), "Preuve de méthode")}</div><label>Note de méthode<textarea value={draft.method.note} onChange={e => update({ ...draft, method: { ...draft.method, note: e.target.value } })}/></label><h3>Fenêtre ultérieure documentée</h3><div className={s.form}><label>Du<input type="date" value={draft.window.startDate} onChange={e => update({ ...draft, window: { ...draft.window, startDate: e.target.value } })}/></label><label>Au<input type="date" value={draft.window.endDate} onChange={e => update({ ...draft, window: { ...draft.window, endDate: e.target.value } })}/></label><label>Couverture déclarée<select value={draft.window.coverage} onChange={e => update({ ...draft, window: { ...draft.window, coverage: e.target.value as "documented" | "incomplete" } })}><option value="incomplete">Incomplète</option><option value="documented">Documentée par pièce</option></select></label>{proofSelect(draft.window.proofRowIds, ids => update({ ...draft, window: { ...draft.window, proofRowIds: ids } }), "Preuve de la fenêtre")}</div><label>Limites de la fenêtre<textarea value={draft.window.note} onChange={e => update({ ...draft, window: { ...draft.window, note: e.target.value } })}/></label>
 {procedure === "payables.purchases" && <><h3>Écriture → facture → réception/prestation</h3>{facts?.ledger?.map(l => { const link = draft.purchases.find(p => p.ledgerRowId === l.rowId); const change = (patch: Partial<PayablesDraft["purchases"][number]>) => update({ ...draft, purchases: [...draft.purchases.filter(p => p.ledgerRowId !== l.rowId), { ledgerRowId: l.rowId, invoiceId: link?.invoiceId ?? "", allocated: link?.allocated ?? l.amount, proofRowIds: link?.proofRowIds ?? [], ...patch }] }); return <div className={s.form} key={l.rowId}><strong>{l.id} · {amountLabel(l.amount)} HT</strong><label>Facture de {l.id}<select value={link?.invoiceId ?? ""} onChange={e => change({ invoiceId: e.target.value })}><option value="">À rapprocher</option>{facts.invoices?.filter(i => i.flow === "purchase").map(i => <option key={i.id} value={i.id}>{i.id} · {i.party} · {amountLabel(i.net)} HT</option>)}</select></label><label>Montant rattaché HT<input inputMode="decimal" value={link?.allocated.amount ?? l.amount.amount} onChange={e => change({ allocated: amount(e.target.value) })}/></label>{proofSelect(link?.proofRowIds ?? [], ids => change({ proofRowIds: ids }), "Preuve du rapprochement " + l.id)}</div>; })}</>}
 {procedure === "payables.rpne" && <><h3>Paiement → allocation → facture</h3><p className={s.muted}>Une proposition n’est pas utilisée par le calcul. La validation est enregistrée par le serveur sous votre identité. Les montants affectés restent TTC.</p>{facts?.payments?.map(p => <p key={p.id}>{p.id} · {p.party} · {p.date} · {amountLabel(p.amount)} TTC</p>)}{draft.allocations.map((a, index) => { const change = (patch: Partial<typeof a>) => update({ ...draft, allocations: draft.allocations.map((v, i) => i === index ? { ...v, ...patch } : v) }); return <div className={s.form} key={a.id}><label>Paiement {index + 1}<select value={a.paymentId} onChange={e => change({ paymentId: e.target.value })}><option value="">Choisir</option>{facts?.payments?.map(p => <option key={p.id} value={p.id}>{p.id} · {p.party}</option>)}</select></label><label>Facture {index + 1}<select value={a.invoiceId} onChange={e => change({ invoiceId: e.target.value })}><option value="">Choisir</option>{facts?.invoices?.filter(i => i.flow === "purchase").map(i => <option key={i.id} value={i.id}>{i.id} · {i.party}</option>)}</select></label><label>Allocation TTC {index + 1}<input inputMode="decimal" value={a.amount.amount} onChange={e => change({ amount: amount(e.target.value) })}/></label><label>Statut d’allocation {index + 1}<select value={a.status} onChange={e => change({ status: e.target.value as "proposal" | "validated" })}><option value="proposal">Proposition</option><option value="validated">Allocation validée à sauvegarder</option></select></label>{proofSelect(a.proofRowIds, ids => change({ proofRowIds: ids }), "Preuve allocation " + (index + 1))}<button type="button" onClick={() => update({ ...draft, allocations: draft.allocations.filter((_, i) => i !== index) })}>Retirer l’allocation {index + 1}</button></div>; })}<button type="button" onClick={() => update({ ...draft, allocations: [...draft.allocations, { id: crypto.randomUUID(), paymentId: "", invoiceId: "", amount: amount("0.00"), status: "proposal", proofRowIds: [] }] })}>Ajouter une proposition d’allocation</button></>}
 </fieldset>;
}
