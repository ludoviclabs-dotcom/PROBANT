"use client";
import type { ParcoursView } from "@/lib/workpapers/capitaux-parcours";
import type { Presentation } from "@/lib/workpapers/capitaux-presentation";
import type { LegalMarkers } from "@/lib/workpapers/capitaux-legal";
import { INSTRUMENT_KIND_LABELS, PRESENTATION_CATEGORY_LABELS } from "@/lib/workpapers/capitaux-presentation";
import { eur, knownLabel } from "../format";
import { amountNode, valueLabel } from "./format";
import styles from "../../cash/cash.module.css";
import eq from "../equity.module.css";
import pc from "./parcours.module.css";

const STATUS_LABELS = { qualifie: "Qualifié", declare: "Déclaré", incertain: "À qualifier" } as const;
const SIGNAL_LABELS = { a_examiner: "À examiner", aucun: "Aucun signal", non_calcule: "Non calculé" } as const;
const APPLIES = { oui: "Applicable à la forme déclarée", non: "Non visé pour cette forme", inconnu: "Applicabilité non établie" } as const;
/** Other equity funds presentation and dated legal markers, as computed by the /capitaux-propres sheet of rule 1.1.0. */
export function ParcoursFraming({ view }: { view: ParcoursView }) {
  const f = view.framing;
  if (!f) return <section className={styles.card} aria-labelledby="pc-framing-title"><h2 id="pc-framing-title">Autres fonds propres et repères légaux</h2><p className={styles.notice}>{view.framingReason}</p></section>;
  return <FramingResult presentation={f.presentation} legal={f.legal} socialFormLabel={f.socialFormLabel} source={`Feuille ${f.runId} · version ${f.version}`}/>;
}
/** Shared display of the server blocks (sheet and single journey): nothing is computed here. */
export function FramingResult({ presentation: p, legal, socialFormLabel, source }: { presentation: Presentation; legal: LegalMarkers; socialFormLabel: string; source: string }) {
  return <>
    <section className={styles.card} aria-labelledby="pc-presentation-title"><header><h2 id="pc-presentation-title">Autres fonds propres — présentation dettes / autres fonds propres</h2><span className={styles.muted}>{source}</span></header>
      <p>{p.resolution.meaning}{p.resolution.anticipationWindow ? " " + p.resolution.anticipationWindow + "." : ""}</p>
      <div className={styles.tableScroll} role="region" aria-label="Instruments déclarés — défilement clavier" tabIndex={0}><table><caption>Classement par termes contractuels déclarés et cités ; aucun classement par numéro de compte</caption>
        <thead><tr><th scope="col">Instrument</th><th scope="col">Comptes</th><th scope="col" className={styles.money}>Clôture</th><th scope="col">Classement</th><th scope="col">Motifs et éléments manquants</th></tr></thead>
        <tbody>{p.instruments.map(i => <tr key={i.id}><th scope="row">{i.label}<span className={styles.meaning}>{INSTRUMENT_KIND_LABELS[i.kind]} · {i.id}</span></th><td>{i.accounts.join(", ") || "—"}</td><td className={styles.money}>{knownLabel(i.amount)}</td>
          <td><span className={eq.flag} data-tone={i.status === "incertain" ? "warn" : i.status === "declare" ? "muted" : "ok"}>{STATUS_LABELS[i.status]}</span><span className={styles.meaning}>{PRESENTATION_CATEGORY_LABELS[i.category]}</span></td>
          <td>{[...i.reasons, ...i.missing.map(m => "Manque : " + m), ...i.accountSignals].map((r, k) => <span key={k} className={styles.meaning}>{r}</span>)}<span className={styles.meaning}>{i.articles.join(" ; ")}</span></td></tr>)}
          {p.unqualifiedAccounts.map(a => <tr key={a.account}><th scope="row">Compte {a.account}<span className={styles.meaning}>{a.label}</span></th><td>{a.account}</td><td className={styles.money}>{a.closing ? eur(a.closing) : "Non établi"}</td><td><span className={eq.flag} data-tone="warn">Sans instrument déclaré</span></td><td><span className={styles.meaning}>Compte de la rubrique sans termes contractuels déclarés : à qualifier.</span></td></tr>)}
          {!p.instruments.length && !p.unqualifiedAccounts.length && <tr><td colSpan={5}>Aucun instrument déclaré ni compte rattaché à la rubrique.</td></tr>}</tbody></table></div>
      <dl className={pc.totals}>{p.lines.map(l => <div key={l.id}><dt>{l.label}</dt><dd>{amountNode(l.amount, pc.reason)}</dd></div>)}
        <div><dt>Total des autres fonds propres</dt><dd>{amountNode(p.otherEquityTotal, pc.reason)}<small>{p.toQualify} élément(s) à qualifier</small></dd></div>
        <div><dt>Instruments présentés en dettes</dt><dd>{amountNode(p.debts, pc.reason)}<small>hors capitaux propres</small></dd></div></dl>
      <details className={pc.method}><summary>Sources de présentation lues</summary><ul>{p.sources.map(s => <li key={s.ref}><strong>{s.ref}</strong> — {s.note} <span className={styles.muted}>({s.text})</span></li>)}</ul><ul>{p.limitations.map(l => <li key={l}>{l}</li>)}</ul></details>
    </section>
    <section className={styles.card} aria-labelledby="pc-legal-title"><header><h2 id="pc-legal-title">Repères légaux — aucune conclusion juridique</h2><span className={styles.muted}>{socialFormLabel}</span></header>
      <p className={styles.notice} data-tone="info">{legal.meaning}</p>
      <div className={pc.legal}>{legal.items.map(it => <section key={it.topic} aria-labelledby={"pc-legal-" + it.topic}>
        <h3 id={"pc-legal-" + it.topic}>{it.title}</h3>
        <p><span className={pc.signal} data-kind={it.signal.kind}>{SIGNAL_LABELS[it.signal.kind]}</span> <span className={styles.muted}>{APPLIES[it.applies]}</span></p>
        <p className={styles.muted}>{it.signal.text}</p>
        <dl>{it.computed.map(c => <div key={c.label}><dt>{c.label}</dt><dd>{valueLabel(c.value as never)}</dd></div>)}</dl>
        <p className={styles.muted}>{it.articles.map(a => a.label).join(" ; ")}</p>
        <details className={pc.method}><summary>Ce qui reste juridique</summary><ul>{it.juridical.map(j => <li key={j}>{j}</li>)}</ul></details>
      </section>)}</div>
    </section>
  </>;
}
