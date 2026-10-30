import type { CSSProperties } from "react";
import { FamilyRule } from "@/components/charte/FamilyRule";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { FAMILY, SEVERITY_LABEL } from "@/components/charte/severity";
import p from "@/components/charte/page.module.css";
import { absentSummary, chainSummary, type DossierEntry as Entry } from "@/lib/dossier-view/chain";
import x from "./dossier.module.css";

/** Nombre de lignes du FEC citées en clair ; au-delà, le compte total est donné. */
const LINES_SHOWN = 8;

/**
 * Une entrée du dossier de preuve : à gauche la gravité (glyphe + mot), l'identifiant, la famille (trait + mot) et
 * l'état de la chaîne ; à droite l'intitulé, la ligne de preuve au trait de la famille, puis les références (source,
 * comptes, lignes du FEC, règle et version). Un maillon absent est écrit « absent » ; rien n'est reconstitué.
 */
export function DossierEntry({ entry, index }: { entry: Entry; index: number }) {
  const family = FAMILY[entry.family];
  const titleId = `dp-${entry.id}-titre`;
  const absent = absentSummary(entry);
  const lines = entry.fecLines;

  return (
    <li>
      <article id={`dp-${entry.id}`} aria-labelledby={titleId} className={x.entry} style={{ "--i": Math.min(index, 12) } as CSSProperties}>
        <div className={x.side}>
          <span className={`${p.mark} ${x.sideSeverity}`}>
            <SeverityGlyph severity={entry.severity} />
            {SEVERITY_LABEL[entry.severity]}
          </span>
          <span className={x.entryId}>{entry.id}</span>
          <span className={p.mark}>
            <FamilyRule family={entry.family} />
            {family.label}
          </span>
          <span>{chainSummary(entry)}</span>
          {absent && <span className={x.absent}>{absent}</span>}
        </div>
        <div className={x.body}>
          <h3 id={titleId} className={x.entryTitle}>
            {entry.title}
          </h3>
          <ol className={x.chain} data-f={family.key} aria-label="Chaîne de preuve">
            {entry.nodes.map((node, i) => (
              <li key={`${i}:${node.label}`} data-marker={node.marker}>
                <span className={x.marker} data-kind={node.marker} aria-hidden="true" />
                <span className={x.stepKey}>{node.label}</span>
                {node.detail}
              </li>
            ))}
          </ol>
          <p className={x.refs}>
            <span>
              <b>Source</b>{" "}
              {entry.source.url ? (
                <a href={entry.source.url} target="_blank" rel="noreferrer">
                  {entry.source.ref}
                  <span className={x.srOnly}> (nouvel onglet)</span>
                </a>
              ) : (
                entry.source.ref
              )}
            </span>
            {entry.accounts.length > 0 && (
              <span>
                <b>{entry.accounts.length > 1 ? "Comptes" : "Compte"}</b> {entry.accounts.join(", ")}
              </span>
            )}
            {lines.length > 0 && (
              <span>
                <b>{lines.length > 1 ? "Lignes FEC" : "Ligne FEC"}</b> {lines.slice(0, LINES_SHOWN).join(", ")}
                {lines.length > LINES_SHOWN ? ` … (${lines.length} lignes)` : ""}
              </span>
            )}
            <span>
              <b>Règle</b> {entry.ruleId} v{entry.ruleVersion}
            </span>
          </p>
        </div>
      </article>
    </li>
  );
}
