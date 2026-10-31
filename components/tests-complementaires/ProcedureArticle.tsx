"use client";

import { forwardRef } from "react";
import { FamilyRule } from "@/components/charte/FamilyRule";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { FAMILY, SEVERITY_LABEL } from "@/components/charte/severity";
import p from "@/components/charte/page.module.css";
import { DossierContextLink } from "@/components/probant/DossierContextLink";
import { assertionCategory, assertionLabelShort } from "@/lib/audit/assertions";
import type { QueueItem } from "@/lib/tests-view/queue";
import x from "./tests.module.css";

const BASIS_TEXT: Record<string, string> = {
  rule: "Résolue par la règle du constat.",
  financial_effect: "Reprise de l'effet financier explicite, à confirmer.",
};

/**
 * Réponse proposée pour un constat : objectif, assertions (NEP 500 §09), population, source du constat, puis la
 * procédure telle que le résolveur la rend (ou « Procédure à définir »), ses étapes numérotées, ce qui reste au
 * professionnel et les références. Le titre est focalisable (sélection depuis l'index).
 */
export const ProcedureArticle = forwardRef<HTMLHeadingElement, { item: QueueItem; className?: string }>(function ProcedureArticle(
  { item: { finding: f, proposal: pr }, className },
  titleRef,
) {
  const titleId = `tc-${f.id}-titre`;
  const family = FAMILY[f.family];
  return (
    <article data-procedure-status={pr.status} aria-labelledby={titleId} className={className}>
      <p className={x.eyebrow}>
        <span className={`${p.mark} ${x.eyebrowSeverity}`}>
          <SeverityGlyph severity={f.severity} />
          {SEVERITY_LABEL[f.severity]}
        </span>
        <span className={p.mark}>
          <FamilyRule family={f.family} />
          {family.label}
        </span>
        <span className={x.eyebrowId}>{f.id}</span>
      </p>
      <h3 id={titleId} ref={titleRef} tabIndex={-1} className={x.procTitle}>
        {f.titre}
      </h3>
      <dl className={x.facts}>
        <dt>Objectif</dt>
        <dd>{pr.objective ?? <span className={p.faint}>Objectif non déterminé par la règle du constat.</span>}</dd>
        <dt>Assertions</dt>
        <dd>
          {pr.assertions.length ? (
            <span className={x.chips}>
              {pr.assertions.map((a) => (
                <span key={a} className={x.chip}>
                  {assertionLabelShort(a)} <span className={p.faint}>· {assertionCategory(a)}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className={p.soft}>
              {pr.assertionBasis === "file_conformity" ? "Conformité du fichier : aucune assertion sur les comptes." : "Non résolue : l'assertion n'est pas présumée."}
            </span>
          )}
          {BASIS_TEXT[pr.assertionBasis] && <span className={x.basis}>{BASIS_TEXT[pr.assertionBasis]}</span>}
        </dd>
        <dt>Population</dt>
        <dd>
          {pr.population.silo} · {pr.population.accounts.length > 1 ? "comptes" : "compte"}{" "}
          <span className={p.mono}>{pr.population.accounts.join(", ") || "—"}</span>
          {pr.population.sourceLines ? (
            <>
              {" "}
              · <span className={p.mono}>{pr.population.sourceLines}</span> {pr.population.sourceLines > 1 ? "lignes source" : "ligne source"}
            </>
          ) : null}
        </dd>
        <dt>Source du constat</dt>
        <dd>
          {pr.sourceOfFinding.url ? (
            <a href={pr.sourceOfFinding.url} target="_blank" rel="noreferrer">
              {pr.sourceOfFinding.ref}
              <span className={x.srOnly}> (nouvel onglet)</span>
            </a>
          ) : (
            pr.sourceOfFinding.ref
          )}
          {pr.sourceOfFinding.effectiveDate && <span className={p.faint}> · en vigueur au {pr.sourceOfFinding.effectiveDate}</span>}
        </dd>
      </dl>

      <div className={x.procedure}>
        <p className={p.key} style={{ margin: 0 }}>
          {pr.status === "to_define" ? "Procédure" : "Procédure proposée"}
        </p>
        <p className={x.procedureName}>
          {pr.status === "to_define" && <span className={x.toDefineMark} aria-hidden="true" />}
          {pr.title}
        </p>
        {pr.steps.length > 0 && (
          <ol className={x.steps}>
            {pr.steps.map((step, i) => (
              <li key={i}>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}
        <p className={x.leftNote}>
          <FamilyRule family="internal" />
          <span>{pr.leftToProfessional}</span>
        </p>
        {(pr.references.length > 0 || pr.route) && (
          <p className={x.procFoot}>
            {pr.references.map((r) => (
              <a key={r.ref} href={r.url} target="_blank" rel="noreferrer">
                {r.ref}
                <span className={x.srOnly}> (nouvel onglet)</span>
              </a>
            ))}
            {pr.route && (
              <DossierContextLink className={`${p.btnSecondary} ${x.toolLink}`} href={pr.route}>
                Ouvrir l'outil de cette procédure →
              </DossierContextLink>
            )}
          </p>
        )}
      </div>
    </article>
  );
});
