"use client";

import { useMemo, useState } from "react";
import { FlaskConical, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/probant/PageHeader";
import { SeverityBadge, FamilyBadge } from "@/components/probant/Badges";
import { DossierContextLink } from "@/components/probant/DossierContextLink";
import { useActiveDossierSnapshot } from "@/lib/dossier/client";
import { CycleDemonstration } from "@/components/probant/CycleDemonstration";
import { resolveProcedure, regimeReferences, REGIME_LABELS, type MissionRegime } from "@/lib/audit/procedures";
import { assertionCategory, assertionLabelShort } from "@/lib/audit/assertions";
import { cn } from "@/lib/utils";

/**
 * Tests complémentaires — C03. La procédure proposée vient du résolveur (règle et objectif du
 * constat), jamais du seul silo. Un constat sans procédure connue reste « Procédure à définir ».
 * Le régime de la mission n'est pas renseigné dans le dossier : il est choisi à l'écran et ne
 * modifie que les références rappelées, jamais les constats.
 */
export default function TestsPage() {
  const snapshot = useActiveDossierSnapshot();
  const [regime, setRegime] = useState<MissionRegime>("non_renseigne");
  const cibles = useMemo(() => snapshot.findings.filter((f) => f.family !== "internal" && f.severity !== "informatif"), [snapshot.findings]);
  const proposals = useMemo(() => cibles.map((f) => ({ finding: f, proposal: resolveProcedure(f) })), [cibles]);
  const synthetic = snapshot.dossier.organizationId === "SYNTHETIC-DEMO";
  const references = regimeReferences(regime, snapshot.dossier.societe.exercice);
  const toDefine = proposals.filter((p) => p.proposal.status === "to_define").length;

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Tests complémentaires"
        subtitle="Lorsqu'un constat laisse penser à une anomalie significative, une réponse au risque est proposée par constat : objectif, assertions NEP 500 §09, population, source et étapes. Les propositions ne sont ni des conclusions ni des procédures exigées."
      />

      <CycleDemonstration />

      <section aria-labelledby="tests-regime-title" className="mb-5 rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="tests-regime-title" className="text-[15px] font-semibold text-[var(--pb-text)]">Régime de la mission et période</h2>
          <label className="flex items-center gap-2 text-[13px] text-[var(--pb-text-muted)]">
            Régime
            <select className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2.5 py-1.5 text-[13px] text-[var(--pb-text)]" value={regime} onChange={(e) => setRegime(e.target.value as MissionRegime)} aria-label="Régime de la mission">
              {(Object.keys(REGIME_LABELS) as MissionRegime[]).map((r) => <option key={r} value={r}>{REGIME_LABELS[r]}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--pb-text-muted)]">{references.note}</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
          {references.references.map((r) => (
            <li key={r.ref}>
              <a className="pbz-focusable text-[var(--pb-accent)] underline decoration-1 underline-offset-2 hover:decoration-2" href={r.url} target="_blank" rel="noreferrer">{r.ref}</a>
              <span className="text-[var(--pb-text-muted)]"> · {r.section} · {r.applicability}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tests-list-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="tests-list-title" className="text-[15px] font-semibold text-[var(--pb-text)]">Réponse proposée par constat</h2>
          <p className="tnum text-[12px] text-[var(--pb-text-muted)]">{cibles.length} constat{cibles.length > 1 ? "s" : ""} · {toDefine} procédure{toDefine > 1 ? "s" : ""} à définir · familles droit dur et présomption, gravité informative exclue</p>
        </div>
        {cibles.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--pb-border)] px-4 py-6 text-center text-[13px] text-[var(--pb-text-muted)]">
            {synthetic ? "Aucun constat historique dans ce scénario : les tests viennent des feuilles exécutées dans le laboratoire." : "Aucun constat ne requiert de test complémentaire dans ce dossier."}
          </p>
        )}
        {proposals.map(({ finding: f, proposal: p }) => (
          <article key={f.id} data-procedure-status={p.status} className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4 transition-colors hover:border-[var(--pb-border-strong)]">
            <div className="flex flex-wrap items-center gap-2">
              <FlaskConical aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--pb-accent)]" />
              <h3 className="min-w-0 text-sm font-semibold text-[var(--pb-text)]">{f.titre}</h3>
              <SeverityBadge severity={f.severity} className="ml-1" />
              <FamilyBadge family={f.family} />
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] md:grid-cols-[auto_minmax(0,1fr)]">
              <dt className="font-semibold text-[var(--pb-text)]">Objectif</dt>
              <dd className="min-w-0 text-[var(--pb-text-muted)]">{p.objective ?? "Objectif non déterminé par la règle du constat."}</dd>
              <dt className="font-semibold text-[var(--pb-text)]">Assertions</dt>
              <dd className="min-w-0 text-[var(--pb-text-muted)]">
                {p.assertions.length
                  ? <span className="flex flex-wrap gap-1.5">{p.assertions.map((a) => <span key={a} className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-0.5 text-[12px] text-[var(--pb-text)]">{assertionLabelShort(a)} <span className="text-[var(--pb-text-muted)]">· {assertionCategory(a)}</span></span>)}</span>
                  : <span>{p.assertionBasis === "file_conformity" ? "Conformité du fichier : aucune assertion sur les comptes." : "Non résolue : l'assertion n'est pas présumée."}</span>}
                <span className="mt-0.5 block text-[12px]">{p.assertionBasis === "rule" ? "Résolue par la règle du constat." : p.assertionBasis === "financial_effect" ? "Reprise de l'effet financier explicite, à confirmer." : ""}</span>
              </dd>
              <dt className="font-semibold text-[var(--pb-text)]">Population</dt>
              <dd className="tnum min-w-0 text-[var(--pb-text-muted)]">{p.population.silo} · comptes {p.population.accounts.join(", ") || "—"}{p.population.sourceLines ? ` · ${p.population.sourceLines} ligne${p.population.sourceLines > 1 ? "s" : ""} source` : ""}</dd>
              <dt className="font-semibold text-[var(--pb-text)]">Source du constat</dt>
              <dd className="min-w-0 text-[var(--pb-text-muted)]">{p.sourceOfFinding.url ? <a className="pbz-focusable text-[var(--pb-accent)] underline decoration-1 underline-offset-2 hover:decoration-2" href={p.sourceOfFinding.url} target="_blank" rel="noreferrer">{p.sourceOfFinding.ref}</a> : p.sourceOfFinding.ref} · en vigueur au {p.sourceOfFinding.effectiveDate}</dd>
              <dt className="font-semibold text-[var(--pb-text)]">Procédure</dt>
              <dd className="min-w-0">
                <span className={cn("font-semibold", p.status === "to_define" ? "text-[var(--pb-warn-bright)]" : "text-[var(--pb-text)]")}>{p.title}</span>
                {p.steps.length > 0 && (
                  <ol className="mt-1.5 space-y-1.5">
                    {p.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--pb-text-muted)]">
                        <ListChecks aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pb-accent)]" />
                        <span><span className="tnum text-[var(--pb-text)]">{i + 1}.</span> {step}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-1.5 text-[12.5px] text-[var(--pb-text-muted)]">{p.leftToProfessional}</p>
                {(p.references.length > 0 || p.route) && (
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]">
                    {p.references.map((r) => <a key={r.ref} className="pbz-focusable text-[var(--pb-accent)] underline decoration-1 underline-offset-2 hover:decoration-2" href={r.url} target="_blank" rel="noreferrer">{r.ref}</a>)}
                    {p.route && <DossierContextLink className="pbz-focusable text-[var(--pb-accent)] underline decoration-1 underline-offset-2 hover:decoration-2" href={p.route}>Ouvrir l'outil de cette procédure →</DossierContextLink>}
                  </p>
                )}
              </dd>
            </dl>
          </article>
        ))}
      </section>
    </div>
  );
}
