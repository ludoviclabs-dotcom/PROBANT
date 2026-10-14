"use client";
import { useEffect, useRef, useState } from "react";
import type { KnownAmount, Money } from "@/lib/canonical-model/money";
import type { TransversalEvent, TransversalEventMap } from "@/lib/workpapers/transversal-events";
import { DossierContextAnchor } from "@/components/probant/DossierContextLink";
import { payablesFailure } from "./PayablesWorkspace";
import s from "./CutoffEventMap.module.css";

/**
 * Carte des événements transversaux (C11). Présentation seule : candidats, montants, dates et qualifications viennent
 * du serveur (`operation=events`). Aucune valeur n'est recalculée ici.
 */
type View = { actorId: string; map: TransversalEventMap | null; reason: string | null };
type Filter = "all" | "todo" | "candidates" | "no_effect";

const amount = (a: KnownAmount | Money | null | undefined) => !a ? "—" : "amount" in a ? `${a.amount} EUR` : a.kind === "known" ? `${a.value.amount} EUR` : a.kind === "not_applicable" ? "Sans objet" : "Inconnu";
const reasonOf = (a: KnownAmount) => a.kind === "known" ? null : a.reason;
const date = (d: string | null) => d ?? "Non sourcée";
const centsLabel = (n: number) => { const sign = n < 0 ? "−" : "", abs = Math.abs(n), units = Math.trunc(abs / 100), rest = String(abs % 100).padStart(2, "0"); return `${sign}${units}.${rest} EUR`; };

const ACCOUNTING_LABEL: Record<TransversalEvent["accounting"]["status"], string> = {
  candidate: "Candidat technique", already_treated: "Déjà rattaché", no_difference_on_tested_items: "Aucune différence", inconclusive: "Non concluant", divergent: "Observations divergentes", not_evaluated: "Non évalué",
};
const CANDIDATE_LABEL: Record<string, string> = { FAE: "FAE · 418", PCA: "PCA · 487", FNP: "FNP · 408", CCA: "CCA · 486", AAE: "Avoir à établir · 4198", AAR: "Avoir à recevoir · 4098" };
const VAT_LABEL = { qualified: "TVA qualifiée", partially_qualified: "TVA qualifiée sous réserve", information_required: "TVA : information requise" } as const;
const SHIFT_LABEL = { same: "Même période que l’exigibilité", earlier: "Observée avant son exigibilité", later: "Observée après son exigibilité", not_comparable: "Non comparable" } as const;
const ROLE_LABEL = { accounting: "Rattachement", vat: "TVA", settlement: "Règlement", period: "Période" } as const;
const PART_LABEL = { accounting: "rattachement", vat: "TVA", settlement: "règlements" } as const;
const OBS_LABEL: Record<string, string> = { candidate: "candidat", already_treated: "déjà rattaché", no_difference_on_tested_items: "aucune différence", inconclusive: "non concluant", not_tested: "non testé", observed: "solde ouvert observé" };
const PROCEDURE_LABEL: Record<string, string> = { "payables.purchases": "Achats", "payables.rpne": "RPNE", "clients.sales": "Clients et ventes", "tva.reconciliation": "TVA" };
const tone = (e: TransversalEvent) => e.accounting.status === "divergent" ? "alert" : e.information.length ? "todo" : e.effect ? "effect" : "quiet";

export function CutoffEventMap({ dossierId, periodId }: { dossierId: string; periodId: string }) {
  const [view, setView] = useState<View | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all"), [flow, setFlow] = useState("all"), [selected, setSelected] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  async function load() {
    if (!dossierId || !periodId) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/workpapers/payables?" + new URLSearchParams({ dossierId, periodId, operation: "events" }), { cache: "no-store" }), data = await r.json();
      if (!r.ok) throw new Error(payablesFailure(r.status, data.error));
      setView(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Lecture impossible"); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [dossierId, periodId]); // eslint-disable-line react-hooks/exhaustive-deps
  const map = view?.map ?? null;
  const events = (map?.events ?? []).filter((e) => (flow === "all" || e.flow === flow) && (filter === "all" || (filter === "todo" ? e.information.length > 0 || e.accounting.status === "divergent" : filter === "candidates" ? !!e.effect : !e.effect)));
  const active = map?.events.find((e) => e.eventId === selected) ?? null;
  const open = (id: string) => { setSelected(id); requestAnimationFrame(() => heading.current?.focus()); };
  return <section className={s.map} aria-labelledby="carte-evenements">
    <header className={s.head}>
      <h2 id="carte-evenements">Carte des événements transversaux</h2>
      <p className={s.lead}>Une ligne par événement économique, quelle que soit la feuille qui l’observe. Facture, livraison ou prestation, comptabilisation, paiements, clôture et période de TVA gardent chacune leur rôle ; l’effet n’est compté qu’une fois.</p>
      <button type="button" disabled={busy} onClick={() => void load()}>Actualiser la carte</button>
    </header>
    {error && <p role="alert" className={s.alert}>{error}</p>}
    {busy && !view && <p className={s.muted} role="status">Lecture de la carte…</p>}
    {view && !map && <p className={s.muted}>{view.reason}</p>}
    {map && <>
      {view?.reason && <p className={s.notice}>{view.reason}</p>}
      <p className={s.bridge} data-bridge>
        <span><strong>{map.events.length}</strong> événements</span>
        <span><strong>{map.bridge.candidateObservations}</strong> observations avec candidat</span>
        <span><strong>{map.bridge.countedEffects}</strong> effets comptés une fois</span>
        {map.bridge.divergentEvents > 0 && <span className={s.alertText}><strong>{map.bridge.divergentEvents}</strong> divergents</span>}
        {map.bridge.staleObservations > 0 && <span className={s.todoText}><strong>{map.bridge.staleObservations}</strong> observations périmées, hors effet</span>}
      </p>
      <ul className={s.stages} aria-label="Pont des effets par poste et sens (projection C05)">
        {map.bridge.stages.map((st) => <li key={st.target + st.direction}><span>Résultat · {st.direction === "increase" ? "hausse" : "baisse"}</span><span>détecté {centsLabel(st.detectedCents)}</span><span>répétitions {centsLabel(st.exactRepeatsCents)}</span><strong>retenu {centsLabel(st.initialCents)}</strong></li>)}
        {!map.bridge.stages.length && <li><span>Aucun candidat technique : aucun effet à projeter.</span></li>}
      </ul>
      <div className={s.filters}>
        <div role="group" aria-label="Filtrer les événements">
          {([["all", "Tous"], ["todo", "À compléter"], ["candidates", "Avec effet"], ["no_effect", "Sans effet"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
        </div>
        <label>Flux<select value={flow} onChange={(e) => setFlow(e.target.value)}><option value="all">Ventes et achats</option><option value="sale">Ventes</option><option value="purchase">Achats</option></select></label>
      </div>
      <div className={s.layout}>
        <ol className={s.events} aria-label="Événements">
          {events.map((e) => <li key={e.eventId} data-tone={tone(e)}>
            <button type="button" aria-current={selected === e.eventId ? "true" : undefined} aria-controls="evenement-detail" onClick={() => open(e.eventId)} data-event={e.invoiceId}>
              <span className={s.eventTitle}><strong>{e.invoiceId}</strong><span>{e.flow === "sale" ? "Vente" : "Achat"} · {e.party}</span></span>
              <span className={s.eventFacts}>
                <span>{e.accounting.candidate ? `${CANDIDATE_LABEL[e.accounting.candidate]} · ${amount(e.accounting.amountHt)} HT` : ACCOUNTING_LABEL[e.accounting.status]}</span>
                <span>{VAT_LABEL[e.dates.vat.exigibility.status]}</span>
                {e.information.length > 0 && <span className={s.todoText}>{e.information.length} information{e.information.length > 1 ? "s" : ""} requise{e.information.length > 1 ? "s" : ""}</span>}
              </span>
            </button>
          </li>)}
          {!events.length && <li className={s.empty}>Aucun événement dans ce filtre.</li>}
        </ol>
        <aside id="evenement-detail" className={s.detail} aria-labelledby="evenement-detail-titre">
          {!active ? <><h3 id="evenement-detail-titre" ref={heading} tabIndex={-1}>Détail de l’événement</h3><p className={s.muted}>Choisissez un événement : sa frise, son rattachement, sa TVA, ses règlements et la procédure suggérée s’affichent ici.</p></>
            : <EventDetail event={active} heading={heading} />}
        </aside>
      </div>
      {map.globalSettlements.length > 0 && <section className={s.block} aria-labelledby="reglements-globaux">
        <h3 id="reglements-globaux">Règlements globaux, acomptes et reliquats</h3>
        <p className={s.muted}>Un règlement affecté à plusieurs clés, un acompte ou un reliquat restent ici : le résidu se lit par clé, rien n’est réparti.</p>
        <div className={s.scroll} tabIndex={0} role="region" aria-label="Règlements globaux — défilement clavier">
          <table><thead><tr><th scope="col">Règlement</th><th scope="col">Montant TTC</th><th scope="col">Affecté par clé</th><th scope="col">Non affecté</th></tr></thead>
            <tbody>{map.globalSettlements.map((g) => <tr key={g.procedureId + g.id}><th scope="row">{g.id}<span className={s.muted}> · {PROCEDURE_LABEL[g.procedureId] ?? g.procedureId} · {g.party} · {g.date}</span></th><td>{amount(g.amountTtc)}</td><td>{g.allocated.map((a) => <p key={a.invoiceId}>{a.invoiceId} : {amount(a.amount)}</p>)}{!g.allocated.length && "—"}</td><td>{amount(g.unallocatedTtc)}<p className={s.muted}>{g.reason}</p></td></tr>)}</tbody></table>
        </div>
      </section>}
      <details className={s.method}>
        <summary>Méthode, sources lues et dépendances d’invalidation</summary>
        <p>{map.method.grid}</p>
        <h4>Qualification de la TVA — catégories couvertes</h4>
        <ul>{Object.entries(map.method.vatCategories).map(([k, v]) => <li key={k}>{v}</li>)}</ul>
        <h4>Sources lues</h4>
        <ul>{map.method.vatSources.map((src) => <li key={src.key}><a href={src.url} rel="noreferrer" target="_blank">{src.title}</a> — {src.version} Lu le {src.readAt}.</li>)}</ul>
        <h4>Quelle source périme quelle partie</h4>
        <ul>{map.invalidation.map((i) => <li key={i.sourceType}><strong>{i.sourceType}</strong> → {i.parts.map((p) => PART_LABEL[p]).join(", ")}. {i.effect}</li>)}</ul>
        <h4>Limites</h4>
        <ul>{map.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        <p className={s.muted}>Carte {map.version} · empreinte {map.hash.slice(0, 12)} · identité {view?.actorId}</p>
      </details>
    </>}
  </section>;
}

function EventDetail({ event: e, heading }: { event: TransversalEvent; heading: React.RefObject<HTMLHeadingElement | null> }) {
  const q = e.dates.vat.exigibility;
  return <>
    <h3 id="evenement-detail-titre" ref={heading} tabIndex={-1}>{e.invoiceId}<span className={s.muted}> · {e.flow === "sale" ? "vente" : "achat"} · {e.party}</span></h3>
    {e.information.length > 0 && <div className={s.todo}><h4>Information requise</h4><ul>{e.information.map((i) => <li key={i}>{i}</li>)}</ul></div>}
    <section aria-label="Frise des dates"><h4>Frise des dates</h4>
      <ol className={s.timeline}>{e.dates.timeline.map((t) => <li key={t.key} data-role={t.role}><time>{date(t.date)}</time><span>{t.label}</span><span className={s.role}>{ROLE_LABEL[t.role]}</span></li>)}</ol>
    </section>
    <section aria-label="Rattachement comptable"><h4>Rattachement comptable</h4>
      <dl className={s.facts}>
        <dt>Texte applicable</dt><dd>{e.rule.status === "resolved" ? <>{e.rule.label}<br /><span className={s.muted}>{e.rule.articles}</span></> : <span className={s.todoText}>{e.rule.status === "no_text_read" ? "Aucune édition lue pour cet exercice" : "Texte du contrat à déterminer"}</span>}</dd>
        <dt>Contrat (ANC 2026-03)</dt><dd>{e.rule.contract.status === "not_applicable" ? "Sans objet pour cet exercice ou ce flux" : `${e.rule.contract.date ?? "date non sourcée"} · entrée en vigueur ${e.rule.contract.entryIntoForce ?? "—"}`}</dd>
        <dt>Résultat</dt><dd>{e.accounting.candidate ? CANDIDATE_LABEL[e.accounting.candidate] : ACCOUNTING_LABEL[e.accounting.status]}{reasonOf(e.accounting.amountHt) && !e.accounting.candidate && <span className={s.muted}> — {reasonOf(e.accounting.amountHt)}</span>}</dd>
        {e.accounting.candidate && <><dt>Montant HT</dt><dd>{amount(e.accounting.amountHt)}</dd><dt>Bilan</dt><dd>{e.accounting.balanceSheet?.account} : {amount(e.accounting.balanceSheet?.amountTtc)}{e.accounting.vatAccount && ` · TVA ${e.accounting.vatAccount}`}</dd></>}
        <dt>Effet compté</dt><dd>{e.effect ? `${e.effect.direction === "increase" ? "Hausse" : "Baisse"} du résultat de ${centsLabel(e.effect.amountCents)}, une fois pour ${e.effect.contributors} observation${e.effect.contributors > 1 ? "s" : ""}` : "Aucun"}</dd>
      </dl>
      <p className={s.muted}>{e.rule.method}</p>
    </section>
    <section aria-label="TVA"><h4>TVA — {e.flow === "sale" ? "exigibilité" : "droit à déduction"}</h4>
      <dl className={s.facts}>
        <dt>Qualification</dt><dd>{VAT_LABEL[q.status]}{q.rule && <><br /><span className={s.muted}>{q.rule.label} — {q.rule.articles.join(" ; ")}</span></>}</dd>
        {q.tranches.length > 0 && <><dt>Dates</dt><dd><ul>{q.tranches.map((t, i) => <li key={i}>{t.date ?? "non intervenue à la revue"} · {t.label} · {amount(t.amountTtc)}</li>)}</ul></dd></>}
        <dt>Période d’exigibilité</dt><dd>{e.dates.vat.exigibilityPeriod ? `${e.dates.vat.exigibilityPeriod.startDate} → ${e.dates.vat.exigibilityPeriod.endDate}${e.dates.vat.exigibilityPeriod.basis === "calendar_month_unconfirmed" ? " (mois civil, périodicité non confirmée)" : ""}` : "—"}</dd>
        <dt>Période observée</dt><dd>{e.dates.vat.observedPeriods.length ? e.dates.vat.observedPeriods.map((p) => `${p.startDate} → ${p.endDate}`).join(" ; ") : "Non observée dans les feuilles TVA"}</dd>
        <dt>Écart de période</dt><dd data-shift={e.dates.vat.shift}>{SHIFT_LABEL[e.dates.vat.shift]}</dd>
        <dt>Taux constaté</dt><dd>{q.observedRate.basisPoints === null ? "Non dérivable" : `${(q.observedRate.basisPoints / 100).toFixed(2)} %`}<br /><span className={s.muted}>{q.observedRate.meaning}</span></dd>
      </dl>
      {q.reserves.length > 0 && <ul className={s.reserves}>{q.reserves.map((r) => <li key={r}>{r}</li>)}</ul>}
    </section>
    <section aria-label="Règlements"><h4>Règlements et résidu par clé</h4>
      <dl className={s.facts}>
        {e.settlement.dueAtClosing && <><dt>Solde ouvert à la clôture</dt><dd>{amount(e.settlement.dueAtClosing)} (fixe)</dd></>}
        <dt>TTC de la facture</dt><dd>{amount(e.settlement.invoiceTtc)}</dd>
        <dt>Affecté validé</dt><dd>{amount(e.settlement.allocatedTtc)}</dd>
        <dt>Avoirs appliqués</dt><dd>{amount(e.settlement.creditsTtc)}</dd>
        <dt>Reste à la revue</dt><dd>{amount(e.settlement.residualTtc)}{e.settlement.partial && <span className={s.muted}> — règlement partiel : ni perte ni retard présumés</span>}</dd>
        {e.settlement.groupedPaymentIds.length > 0 && <><dt>Règlements groupés</dt><dd>{e.settlement.groupedPaymentIds.join(", ")}</dd></>}
      </dl>
    </section>
    <section aria-label="Observations"><h4>Observations par feuille</h4>
      <ul className={s.observations}>{e.observations.map((o) => <li key={o.runId + o.version} data-stale={o.stale ? "true" : undefined}>
        <DossierContextAnchor href={o.href}>{PROCEDURE_LABEL[o.procedureId] ?? o.procedureId} v{o.version}</DossierContextAnchor> · {OBS_LABEL[o.status] ?? o.status}{o.candidate && ` ${o.candidate} ${amount(o.amount)}`} · {o.basis === "procedure_row" ? "ligne de la procédure" : o.basis === "event_analysis" ? "analyse de l’événement" : "solde ouvert"}{o.stale && <strong className={s.todoText}> · périmée, hors effet</strong>}
        {o.reasons.length > 0 && <p className={s.muted}>{o.reasons.join(" ; ")}</p>}
      </li>)}</ul>
    </section>
    <section aria-label="Procédure suggérée"><h4>Procédure suggérée</h4>
      {e.procedure ? <><p><strong>{e.procedure.title}</strong>{e.procedure.objective && !e.procedure.objective.startsWith(e.procedure.title) && ` — ${e.procedure.objective}`}</p><ol>{e.procedure.steps.map((st) => <li key={st}>{st}</li>)}</ol><p className={s.muted}>{e.procedure.leftToProfessional} Références : {e.procedure.references.map((r) => r.ref).join(", ") || "—"}.</p></>
        : <p className={s.muted}>Aucune : pas de candidat technique sur cet événement.</p>}
    </section>
    <details className={s.sources}><summary>Sources et dépendances ({e.sources.length})</summary>
      <ul>{e.sources.map((src) => <li key={src.documentVersionId + src.rowId + src.role + src.runId}><code>{src.documentType} · {src.rowId ?? "document"}</code> {src.role} → {src.parts.map((p) => PART_LABEL[p]).join(", ")}</li>)}</ul>
      <ul>{e.dependencies.map((d) => <li key={d.ref + d.kind}>{d.ref} — {d.label}{d.stale && <strong className={s.todoText}> (périmée)</strong>}</li>)}</ul>
    </details>
  </>;
}
