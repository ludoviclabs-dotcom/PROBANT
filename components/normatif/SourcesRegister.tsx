"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { NormativeStatus } from "@/lib/audit-cycles/types";
import type { EvolutionTiming, IntegrationStatus, LinkOutcome, VerificationState } from "@/lib/audit-cycles/veille";
import type { ReferenceFamily } from "@/lib/audit-cycles/view";
import p from "@/components/charte/page.module.css";
import { NormativeStatusBadge } from "./NormativeStatusBadge";
import { EvolutionMark, LinkMark, VerificationMark } from "./VeilleMarks";
import n from "./normatif.module.css";

export interface SourceRow {
  id: string;
  label: string;
  summary: string | null;
  type: string;
  family: ReferenceFamily | null;
  status: NormativeStatus;
  url: string | null;
  cycles: number;
  verification: { state: VerificationState; date: string | null } | null;
  link: LinkOutcome | "sans_url" | "non_releve" | null;
  evolutions: { short: string; timing: EvolutionTiming; integration: IntegrationStatus }[];
  /** Au moins un constat de veille à reprendre (évolution ouverte ou lien mort). */
  toReview: boolean;
}

/**
 * Registre des sources : filtres par référentiel et « à reprendre », puis un tableau. Trois colonnes de veille
 * distinctes — vérification datée, lien, évolutions — jamais résumées en un seul indicateur.
 */
export function SourcesRegister({
  rows,
  families,
}: {
  rows: SourceRow[];
  families: { id: ReferenceFamily; short: string; count: number }[];
}) {
  const [family, setFamily] = useState<ReferenceFamily | null>(null);
  const [onlyReview, setOnlyReview] = useState(false);
  const shown = useMemo(
    () => rows.filter((r) => (!family || r.family === family) && (!onlyReview || r.toReview)),
    [rows, family, onlyReview],
  );

  return (
    <>
      <div className={p.toolbar} role="group" aria-label="Filtres du registre">
        <span className={p.toggleGroup}>
          <span className={p.key}>Référentiel</span>
          <button type="button" className={p.toggle} aria-pressed={family === null} onClick={() => setFamily(null)}>
            Tous
          </button>
          {families.map((f) => (
            <button key={f.id} type="button" className={p.toggle} aria-pressed={family === f.id} onClick={() => setFamily(f.id)}>
              {f.short} <span className={p.faint}>{f.count}</span>
            </button>
          ))}
        </span>
        <span className={`${p.toggleGroup} ${p.toolbarEnd}`}>
          <button type="button" className={p.toggle} aria-pressed={onlyReview} onClick={() => setOnlyReview((v) => !v)}>
            À reprendre seulement
          </button>
        </span>
      </div>
      <p className={p.note} aria-live="polite">
        {shown.length} source{shown.length > 1 ? "s" : ""} affichée{shown.length > 1 ? "s" : ""} sur {rows.length}.
      </p>
      <div className={p.scrollX} role="region" aria-label="Registre des sources — défilement horizontal" tabIndex={0} style={{ marginTop: 12 }}>
        <table className={p.register} style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Force</th>
              <th scope="col">Cycles</th>
              <th scope="col">Vérification</th>
              <th scope="col">Lien officiel</th>
              <th scope="col">Évolutions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <th scope="row" className={n.registerSource}>
                  <span className={n.tag}>{r.type}</span>
                  <br />
                  <Link href={`/normatif/sources/${r.id}`}>{r.label}</Link>
                  {r.summary ? <p>{r.summary}</p> : null}
                </th>
                <td>
                  <NormativeStatusBadge status={r.status} short />
                </td>
                <td className={p.num} style={{ textAlign: "left" }}>
                  {r.cycles}
                </td>
                <td>{r.verification ? <VerificationMark state={r.verification.state} date={r.verification.date} /> : "—"}</td>
                <td>
                  {r.link ? (
                    r.url && r.link !== "introuvable" && r.link !== "injoignable" ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className={n.linkQuiet}>
                        <LinkMark state={r.link} />
                      </a>
                    ) : (
                      <LinkMark state={r.link} />
                    )
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {r.evolutions.length === 0 ? (
                    <span className={p.faint}>Aucune connue</span>
                  ) : (
                    r.evolutions.map((e) => (
                      <div key={e.short}>
                        <EvolutionMark timing={e.timing} integration={e.integration} label={false} /> {e.short}
                      </div>
                    ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
