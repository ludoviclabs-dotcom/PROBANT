"use client";
import { CL_CYCLE_LABELS, CL_CYCLES } from "@/lib/workpapers/closing-contract";
import { CitationPicker, Cites, readCitations } from "./ProcedurePanel";
import { citationText, euros, stampFr, type ClosingView } from "./format";
import cl from "./closing.module.css";

type Send = (body: Record<string, unknown>) => Promise<boolean>;
const submit = (send: Send, build: (f: FormData) => Record<string, unknown>) => async (ev: React.FormEvent<HTMLFormElement>) => { ev.preventDefault(); const form = ev.currentTarget; if (await send(build(new FormData(form)))) form.reset(); };

/** Misstatements (corrected with new evidence or not), scope limitations, declared contradictions and factual inconsistencies. None is judged by the tool. */
export function ClosingFindings({ view, canPrepare, canReview, send, busy, onOpen, download }: { view: ClosingView; canPrepare: boolean; canReview: boolean; send: Send; busy: boolean;
  onOpen: (id: string, origin: HTMLElement) => void; download?: (id: string) => string }) {
  const e = view.evaluation, m = e.misstatements, { misstatements, limitations, contradictions } = e.items;
  const procOptions = e.procedures.map(p => <option key={p.procedureId} value={p.procedureId}>{p.procedureId} · {p.label}</option>);
  return <div>
    <section aria-labelledby="cl-misstatements">
      <h2 id="cl-misstatements">Anomalies relevées <span className={cl.small}>{m.total} · corrigées {m.corrected} · non corrigées {m.uncorrected}</span></h2>
      <ul className={cl.totals} aria-label="Totaux des anomalies">
        <li>Corrigées : <strong>{euros(m.knownCorrected.amount)}</strong>{m.unknownCorrected ? " + " + m.unknownCorrected + " montant(s) inconnu(s)" : ""}</li>
        <li>Non corrigées : <strong>{euros(m.knownUncorrected.amount)}</strong> connus{m.unknownUncorrected ? <> + <strong>{m.unknownUncorrected}</strong> montant{m.unknownUncorrected > 1 ? "s" : ""} inconnu{m.unknownUncorrected > 1 ? "s" : ""} (jamais compté{m.unknownUncorrected > 1 ? "s" : ""} pour zéro)</> : null}</li>
        <li className={cl.small}>Aucune comparaison à un seuil de signification : le caractère significatif s’apprécie par le professionnel (NEP 450).</li>
      </ul>
      <div className={cl.tableScroll}><table className={cl.grid}>
        <caption className="sr-only">Anomalies relevées : montant connu ou inconnu, état de correction et preuve.</caption>
        <thead><tr><th scope="col">Anomalie</th><th scope="col">Cycle · procédure</th><th scope="col" className={cl.num}>Montant</th><th scope="col">État</th><th scope="col">Pièces et appréciation</th></tr></thead>
        <tbody>{misstatements.map(x => <tr key={x.misstatementId}>
          <td><strong>{x.misstatementId}</strong> · {x.description}<br/><span className={cl.who}>Relevée par {x.by} le {stampFr(x.at)}</span></td>
          <td>{CL_CYCLE_LABELS[x.cycle]}{x.procedureId ? <><br/><button type="button" className={cl.link} onClick={ev => onOpen(x.procedureId!, ev.currentTarget)}>{x.procedureId}</button></> : null}</td>
          <td className={cl.num}>{x.amount.kind === "known" ? euros(x.amount.value.amount) : <span>Inconnu<br/><span className={cl.small}>{x.amount.reason}</span></span>}</td>
          <td>{x.correction ? <span className={cl.pill} data-tone="ok">Corrigée</span> : x.assessment ? <span className={cl.pill} data-tone="open">Non corrigée — appréciée</span> : <span className={cl.pill} data-tone="danger">Non corrigée — à apprécier</span>}</td>
          <td><Cites list={x.citations} download={download}/>
            {x.correction ? <><p className={cl.small}>Correction : {x.correction.text} — par {x.correction.by} le {stampFr(x.correction.at)}</p><Cites list={x.correction.citations} download={download}/></> : null}
            {x.assessment ? <p className={cl.small}>Appréciation : {x.assessment.text} — par {x.assessment.by} le {stampFr(x.assessment.at)}</p> : null}
            {!x.correction && canPrepare ? <details><summary>Documenter la correction</summary><form className={cl.form} onSubmit={submit(send, f => ({ command: "correct_misstatement", misstatementId: x.misstatementId, text: f.get("text"), citations: readCitations(f, "mc") }))}>
              <label>Correction<textarea name="text" required maxLength={1000}/></label><CitationPicker pieces={view.pieces} name="mc" label="Preuve nouvelle (déposée après l’anomalie)" required/><button className={cl.submit} disabled={busy}>Enregistrer la correction</button></form></details> : null}
            {!x.correction && !x.assessment && canReview ? <details><summary>Apprécier l’anomalie non corrigée</summary><form className={cl.form} onSubmit={submit(send, f => ({ command: "assess_misstatement", misstatementId: x.misstatementId, text: f.get("text") }))}>
              <label>Appréciation (humaine)<textarea name="text" required maxLength={1500}/></label><button className={cl.submit} disabled={busy}>Enregistrer</button></form></details> : null}
          </td>
        </tr>)}</tbody>
      </table></div>
      {!misstatements.length ? <p className={cl.small}>Aucune anomalie relevée.</p> : null}
      {canPrepare ? <details><summary>Relever une anomalie</summary><form className={cl.form} onSubmit={submit(send, f => ({ command: "record_misstatement", ...(f.get("procedureId") ? { procedureId: f.get("procedureId") } : {}), cycle: f.get("cycle"), description: f.get("description"),
        amount: f.get("known") === "known" ? { kind: "known", value: { amount: String(f.get("amount")).replace(",", "."), currency: "EUR" } } : { kind: "unknown", reason: f.get("reason") }, citations: readCitations(f, "ac") }))}>
        <div className={cl.row}><label>Cycle<select name="cycle">{CL_CYCLES.map(c => <option key={c} value={c}>{CL_CYCLE_LABELS[c]}</option>)}</select></label><label>Procédure<select name="procedureId"><option value="">—</option>{procOptions}</select></label></div>
        <label>Description<input name="description" required maxLength={500}/></label>
        <div className={cl.row}><label>Montant<select name="known"><option value="known">Connu</option><option value="unknown">Inconnu</option></select></label><label>Montant en euros (ex. 1240.00)<input name="amount" pattern="-?\d+([.,]\d{2})" /></label><label>Motif si inconnu<input name="reason" maxLength={300}/></label></div>
        <CitationPicker pieces={view.pieces} name="ac" required/><button className={cl.submit} disabled={busy}>Relever</button></form></details> : null}
    </section>

    <section className={cl.section} aria-labelledby="cl-contradictions">
      <h2 id="cl-contradictions">Contradictions déclarées <span className={cl.small}>{contradictions.filter(c => !c.resolution).length} non résolue(s) sur {contradictions.length}</span></h2>
      {contradictions.map(c => <article key={c.contradictionId} aria-label={"Contradiction " + c.contradictionId}>
        <p><strong>{c.contradictionId}</strong> · {c.description} <span className={cl.pill} data-tone={c.resolution ? "ok" : "danger"}>{c.resolution ? "Résolue" : "Non résolue"}</span></p>
        <div className={cl.versus}><div>{citationText(c.left)}<br/><span className={cl.small}>{c.left.kind === "declaration_direction" ? "Déclaration de la direction" : c.left.kind === "reponse_tiers" ? "Réponse de tiers" : "Document"}</span></div>
          <span className={cl.clash} aria-label="contredit">⟷</span>
          <div>{citationText(c.right)}<br/><span className={cl.small}>{c.right.kind === "declaration_direction" ? "Déclaration de la direction" : c.right.kind === "reponse_tiers" ? "Réponse de tiers" : "Document"}</span></div></div>
        <p className={cl.who}>Déclarée par {c.by} le {stampFr(c.at)}{c.procedureIds.length ? " · " + c.procedureIds.join(", ") : ""}</p>
        {c.resolution ? <><p className={cl.small}>Résolution : {c.resolution.text} — par {c.resolution.by} le {stampFr(c.resolution.at)}</p><Cites list={c.resolution.citations} download={download}/></>
          : canPrepare ? <details><summary>Résoudre en citant une pièce</summary><form className={cl.form} onSubmit={submit(send, f => ({ command: "resolve_contradiction", contradictionId: c.contradictionId, text: f.get("text"), citations: readCitations(f, "rc") }))}>
            <label>Résolution<textarea name="text" required maxLength={1500}/></label><CitationPicker pieces={view.pieces} name="rc" required/><p className={cl.small}>Une déclaration de la direction seule ne résout pas une contradiction.</p><button className={cl.submit} disabled={busy}>Enregistrer</button></form></details> : null}
      </article>)}
      {!contradictions.length ? <p className={cl.small}>Aucune contradiction déclarée.</p> : null}
      {canPrepare && view.pieces.length > 1 ? <details><summary>Déclarer une contradiction entre deux pièces</summary><form className={cl.form} onSubmit={submit(send, f => ({ command: "record_contradiction", left: readCitations(f, "lc")[0], right: readCitations(f, "rc2")[0], description: f.get("description"), procedureIds: f.getAll("procedureIds").map(String) }))}>
        <CitationPicker pieces={view.pieces} name="lc" label="Première pièce" required/><CitationPicker pieces={view.pieces} name="rc2" label="Seconde pièce" required/>
        <label>Ce qui se contredit<textarea name="description" required maxLength={1000}/></label><label>Procédures concernées<select name="procedureIds" multiple size={4}>{procOptions}</select></label><button className={cl.submit} disabled={busy}>Déclarer</button></form></details> : null}
    </section>

    <section className={cl.section} aria-labelledby="cl-coherence">
      <h2 id="cl-coherence">Incohérences détectées <span className={cl.small}>factuelles, calculées par l’outil ; elles disparaissent quand la donnée en cause change</span></h2>
      {e.coherence.length ? <ul className={cl.remaining}>{e.coherence.map((c, i) => <li key={c.code + i}>{c.label}</li>)}</ul> : <p className={cl.small}>Aucune incohérence factuelle détectée.</p>}
    </section>

    <section className={cl.section} aria-labelledby="cl-limits">
      <h2 id="cl-limits">Limites d’étendue <span className={cl.small}>{limitations.filter(l => !l.assessment).length} à apprécier sur {limitations.length}</span></h2>
      {limitations.map(l => <div key={l.limitationId} className={cl.record}>
        <p><strong>{l.limitationId}</strong> · {CL_CYCLE_LABELS[l.cycle]} · {l.description}</p>
        <p className={cl.who}>Relevée par {l.by} le {stampFr(l.at)}{l.procedureIds.length ? " · " + l.procedureIds.join(", ") : ""}</p>
        {l.assessment ? <p className={cl.small}>Incidence appréciée : {l.assessment.text} — par {l.assessment.by} le {stampFr(l.assessment.at)}</p>
          : canReview ? <details><summary>Apprécier l’incidence</summary><form className={cl.form} onSubmit={submit(send, f => ({ command: "assess_limitation", limitationId: l.limitationId, text: f.get("text") }))}>
            <label>Appréciation (humaine, sans opinion générée)<textarea name="text" required maxLength={1500}/></label><button className={cl.submit} disabled={busy}>Enregistrer</button></form></details> : <p className={cl.small}>Incidence à apprécier par le professionnel.</p>}
      </div>)}
      {!limitations.length ? <p className={cl.small}>Aucune limite d’étendue relevée.</p> : null}
      {canPrepare ? <details><summary>Relever une limite d’étendue</summary><form className={cl.form} onSubmit={submit(send, f => ({ command: "record_limitation", cycle: f.get("cycle"), description: f.get("description"), procedureIds: f.getAll("procedureIds").map(String) }))}>
        <label>Cycle<select name="cycle">{CL_CYCLES.map(c => <option key={c} value={c}>{CL_CYCLE_LABELS[c]}</option>)}</select></label><label>Description<textarea name="description" required maxLength={1000}/></label>
        <label>Procédures concernées<select name="procedureIds" multiple size={4}>{procOptions}</select></label><button className={cl.submit} disabled={busy}>Relever</button></form></details> : null}
    </section>
  </div>;
}
