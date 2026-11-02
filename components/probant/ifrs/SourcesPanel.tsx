"use client";
import { useState } from "react";
import type { AccountingPeriod } from "@/lib/canonical-model/period";
import { LEASE_MAPPING, LEASE_TYPES, type LeaseType } from "@/lib/workpapers/lease-sources";
import { dateFr, plural, TYPE_LABELS, type LeaseView } from "./format";
import s from "./ifrs.module.css";

/** Type proposé d'après un préfixe connu (`lease_contracts…`), jamais deviné pour un nom ambigu. */
export function typeFromName(name: string): LeaseType | null {
  const lower = name.toLowerCase(), found = LEASE_TYPES.filter(t => lower.startsWith(t + ".") || lower.startsWith(t + "_") || lower.startsWith("exemple-" + t + "."));
  return found.length === 1 ? found[0] : null;
}

/** Sources de l'atelier : tête courante par type, aperçus à approuver, dépôt d'une nouvelle version. Un aperçu n'est pas une approbation. */
export function SourcesPanel({ view, period, required, canPrepare, busy, onPreview, onApprove }: { view: LeaseView; period: AccountingPeriod; required: readonly string[]; canPrepare: boolean; busy: boolean;
  onPreview(data: FormData): void; onApprove(command: { importId: string; previewHash: string; expectedSourceId: string | null }): void }) {
  const [type, setType] = useState<LeaseType>("lease_contracts"), [file, setFile] = useState<File | null>(null);
  const headOf = (t: string) => view.sourceHeads.find(h => h.document_type === t)?.import_id ?? null;
  return <section className={s.section} aria-labelledby="l16-sources-title">
    <div className={s.sectionHead}><h2 id="l16-sources-title">Sources</h2><span className={s.muted}>Requises au gel : {required.map(t => TYPE_LABELS[t]).join(", ")} · format : dictionnaire des sources <span className={s.mono}>docs/ifrs/DICTIONNAIRE_L16.md</span></span></div>
    <ul className={s.reasons}>{LEASE_TYPES.map(t => { const current = view.imports.find(b => b.id === headOf(t)), pending = view.imports.filter(b => b.document.documentType === t && !b.approval);
      return <li key={t} style={{ gridTemplateColumns: "1fr" }}><div><strong>{TYPE_LABELS[t]}</strong> · <span className={s.muted}>{current ? current.document.fileName + " · " + plural(current.rowCount ?? current.rows.length, "ligne") + (current.approval ? " · approuvée le " + dateFr(current.approval.at) : "")
        : required.includes(t) ? "requise — absente" : "facultative — absente"}</span></div>
        {pending.map(b => <div key={b.id} className={s.notice} data-tone={b.report.blocking.length ? "danger" : "info"}>
          <p><strong>Aperçu à approuver</strong> · {b.document.fileName} · {b.report.acceptedRows} ligne(s) acceptée(s) · {b.report.rejectedRows} rejetée(s)</p>
          {b.report.blocking.length > 0 && <p>Bloquant : {b.report.blocking.join(" · ")}</p>}
          {canPrepare && <button type="button" className={s.primary} disabled={busy || b.report.blocking.length > 0} onClick={() => onApprove({ importId: b.id, previewHash: b.previewHash, expectedSourceId: headOf(t) })}>Approuver cette version{headOf(t) ? " (remplace la version courante, conservée)" : ""}</button>}
        </div>)}</li>; })}</ul>
    {canPrepare && <form onSubmit={e => { e.preventDefault(); if (!file) return; const d = new FormData(); d.set("file", file); d.set("documentType", type); d.set("period", JSON.stringify(period)); d.set("mapping", JSON.stringify(LEASE_MAPPING)); onPreview(d); }}>
      <h3>Ajouter ou remplacer une source</h3>
      <div className={s.form}>
        <label>Fichier CSV (Key ; Amount ; Date ; Details)<input type="file" accept=".csv" required disabled={busy} onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); const t = f ? typeFromName(f.name) : null; if (t) setType(t); }}/></label>
        <label>Type de source<select value={type} disabled={busy} onChange={e => setType(e.target.value as LeaseType)}>{LEASE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}</select></label>
      </div>
      <p><button type="submit" disabled={busy || !file}>Lire et conserver l'aperçu</button></p>
    </form>}
  </section>;
}
