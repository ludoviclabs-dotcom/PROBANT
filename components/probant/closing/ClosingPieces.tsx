"use client";
import { CL_PIECE_KIND_LABELS, CL_PIECE_KINDS } from "@/lib/workpapers/closing-contract";
import type { MissingItem } from "@/lib/workpapers/closing-evaluate";
import { currentPieces } from "./ProcedurePanel";
import { stampFr, type ClosingView } from "./format";
import cl from "./closing.module.css";

const KIND: Record<MissingItem["kind"], string> = { request: "Pièce demandée", sans_preuve: "Travail sans pièce", population_absente: "Population absente", preuve_remplacee: "Pièce remplacée", declaration_seule: "Déclaration seule" };
type Send = (body: Record<string, unknown>) => Promise<boolean>;

/** Missing pieces, oldest first: each line says what is missing, for which procedure, from whom, since when and who asked. */
export function ClosingPieces({ view, onOpen, canPrepare, send, upload, busy, download }: { view: ClosingView; onOpen: (id: string, origin: HTMLElement) => void; canPrepare: boolean; send: Send;
  upload: (file: File, meta: { label: string; kind: string; pieceId?: string }) => Promise<boolean>; busy: boolean; download?: (id: string) => string }) {
  const e = view.evaluation, requests = e.procedures.flatMap(p => p.requests);
  const open = e.missing.filter(m => m.kind === "request");
  const byPiece = new Map<string, typeof view.pieces>();
  for (const p of view.pieces) byPiece.set(p.pieceId, [...(byPiece.get(p.pieceId) ?? []), p]);
  return <div>
    <section aria-labelledby="cl-queue">
      <h2 id="cl-queue">File des pièces manquantes <span className={cl.small}>{e.missing.length} élément{e.missing.length > 1 ? "s" : ""} · {open.length} demande{open.length > 1 ? "s" : ""} ouverte{open.length > 1 ? "s" : ""} sur {requests.length}</span></h2>
      {e.missing.length ? <ol className={cl.queue}>{e.missing.map(m => <li key={m.kind + m.id}>
        <div><strong>{m.label}</strong><p className={cl.small}>{m.detail}</p></div>
        <span className={cl.kind} data-kind={m.kind}>{KIND[m.kind]}</span>
        <div className={cl.small} style={{ gridColumn: "2 / -1", margin: 0 }}>
          <button type="button" className={cl.link} onClick={ev => onOpen(m.procedureId, ev.currentTarget)}>{m.procedureId}</button> · depuis le {stampFr(m.since)} · {m.by}
          {m.kind === "request" && canPrepare ? <RequestClosure id={m.id} view={view} send={send} busy={busy}/> : null}
        </div>
      </li>)}</ol> : <p className={cl.small}>Aucune pièce manquante détectée. Cela ne prouve pas que toutes les pièces nécessaires ont été demandées.</p>}
    </section>
    <section className={cl.section} aria-labelledby="cl-registry">
      <h2 id="cl-registry">Registre des pièces <span className={cl.small}>{byPiece.size} pièce{byPiece.size > 1 ? "s" : ""} · {view.pieces.length} version{view.pieces.length > 1 ? "s" : ""} conservée{view.pieces.length > 1 ? "s" : ""}</span></h2>
      <div className={cl.tableScroll}><table className={cl.grid}>
        <caption className="sr-only">Pièces versionnées du dossier ; une version remplacée reste lisible.</caption>
        <thead><tr><th scope="col">Pièce</th><th scope="col">Nature</th><th scope="col">Version</th><th scope="col">Fichier et empreinte SHA-256</th><th scope="col">Déposée par</th></tr></thead>
        <tbody>{[...byPiece.values()].flatMap(versions => versions.sort((a, b) => b.version - a.version).map((v, i) => <tr key={v.pieceVersionId}>
          <td>{i === 0 ? <strong>{v.pieceId} · {v.label}</strong> : <span className={cl.small}>{v.label}</span>}</td>
          <td>{CL_PIECE_KIND_LABELS[v.kind]}</td>
          <td className={cl.num}>v{v.version}{i === 0 ? " (courante)" : " (remplacée)"}</td>
          <td>{download ? <a href={download(v.pieceVersionId)}>{v.fileName}</a> : v.fileName} <span className={cl.hash} title={v.sha256}>{v.sha256.slice(0, 16)}…</span></td>
          <td className={cl.small}>{v.by}<br/>{stampFr(v.at)}</td>
        </tr>))}</tbody>
      </table></div>
      {!view.pieces.length ? <p className={cl.small}>Aucune pièce déposée.</p> : null}
      {canPrepare ? <form className={cl.form} onSubmit={async ev => { ev.preventDefault(); const form = ev.currentTarget, f = new FormData(form), file = f.get("file");
        if (!(file instanceof File) || !file.size) return;
        if (await upload(file, { label: String(f.get("label")), kind: String(f.get("kind")), ...(f.get("pieceId") ? { pieceId: String(f.get("pieceId")) } : {}) })) form.reset(); }}>
        <h3>Déposer une pièce</h3>
        <div className={cl.row}><label>Libellé<input name="label" required maxLength={160}/></label>
          <label>Nature<select name="kind">{CL_PIECE_KINDS.map(k => <option key={k} value={k}>{CL_PIECE_KIND_LABELS[k]}</option>)}</select></label>
          <label>Nouvelle version de<select name="pieceId" defaultValue=""><option value="">— nouvelle pièce —</option>{currentPieces(view.pieces).map(p => <option key={p.pieceId} value={p.pieceId}>{p.pieceId} · {p.label}</option>)}</select></label></div>
        <label>Fichier (PDF, tableur, texte ou image, 3 Mio au plus)<input type="file" name="file" required/></label>
        <p className={cl.small}>Le serveur vérifie le contenu, calcule l’empreinte et numérote la version. Une nouvelle version rend « à réexaminer » les travaux qui citaient l’ancienne. Une déclaration de la direction reste une pièce parmi d’autres.</p>
        <button className={cl.submit} disabled={busy}>Déposer</button>
      </form> : null}
    </section>
  </div>;
}

function RequestClosure({ id, view, send, busy }: { id: string; view: ClosingView; send: Send; busy: boolean }) {
  return <details style={{ marginTop: 6 }}><summary>Clore la demande {id}</summary>
    <form className={cl.form} onSubmit={async ev => { ev.preventDefault(); const f = new FormData(ev.currentTarget), outcome = String(f.get("outcome"));
      await send({ command: "close_piece_request", requestId: id, outcome, ...(outcome === "received" ? { pieceVersionId: f.get("piece") } : { reason: f.get("reason") }) }); }}>
      <div className={cl.row}><label>Issue<select name="outcome"><option value="received">Reçue</option><option value="cancelled">Annulée (motif)</option></select></label>
        <label>Pièce reçue<select name="piece">{currentPieces(view.pieces).map(p => <option key={p.pieceVersionId} value={p.pieceVersionId}>{p.pieceId} · {p.label} · v{p.version}</option>)}</select></label></div>
      <label>Motif d’annulation<input name="reason" maxLength={500}/></label>
      <button className={cl.submit} disabled={busy}>Clore</button>
    </form></details>;
}
