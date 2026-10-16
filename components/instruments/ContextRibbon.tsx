import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import s from "./shell.module.css";

export interface RibbonData {
  societe: string;
  siren: string;
  exercice: string;
  /** « 01/01 → 31/12/2024 », ou null si le dossier ne porte pas de période. */
  periode: string | null;
  id: string;
  /** 12 premiers caractères de l'empreinte du FEC ; null pour un scénario synthétique (aucun FEC). */
  fec: string | null;
  documents: number;
  kindLabel: string;
  blockingAdmissibility: number;
  workpapers: { planned: number; executed: number; locked: number; blocked: number };
  /** Action prioritaire du registre des cycles ; null si aucune action n'est possible. */
  priority: { action: string; cycle: string } | null;
}

const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);

/**
 * Ruban de contexte : le dossier lu avant tout accès secondaire — société, exercice, identité, source du FEC,
 * état des feuilles, action prioritaire. Une ligne qui défile horizontalement plutôt qu'un empilement de cartes.
 * Les valeurs sont celles du snapshot et de la projection du registre : rien n'est recalculé ici.
 */
export function ContextRibbon({ data }: { data: RibbonData }) {
  const wp = data.workpapers;
  return (
    <div data-ambiance="instruments" className={s.ribbonWrap}>
      <div role="region" aria-label="Contexte du dossier" tabIndex={0} className={s.ribbon} data-tour="dossier-context">
        <section aria-label="Dossier" className={`${s.cell} ${s.cellFirst}`}>
          <h2 className={s.name}>{data.societe}</h2>
        </section>
        <section aria-label="Exercice" className={s.cell}>
          <span className={s.key}>Exercice</span>
          <span className={s.mono}>{data.exercice}</span>
          {data.periode && <span className={s.soft}>{data.periode}</span>}
        </section>
        <section aria-label="Identité du dossier" className={s.cell}>
          <span className={s.key}>Identifiant</span>
          <span className={s.mono}>{data.id}</span>
          <span className={s.soft}>SIREN {data.siren}</span>
        </section>
        {data.fec && (
          <section aria-label="Fichier des écritures" className={s.cell}>
            <span className={s.key}>FEC</span>
            <span className={s.mono}>{data.fec}</span>
            <span className={s.soft}>
              · {data.documents} {plural(data.documents, "document")}
            </span>
          </section>
        )}
        <section aria-label="État des sources" className={s.cell}>
          <span className={s.key}>Sources</span>
          <span>{data.kindLabel}</span>
          {data.blockingAdmissibility > 0 && <SeverityGlyph severity="bloquant" />}
          <span className={s.mono}>{data.blockingAdmissibility}</span>
          <span className={s.soft}>{plural(data.blockingAdmissibility, "alerte bloquante", "alertes bloquantes")}</span>
        </section>
        {(wp.planned > 0 || wp.locked > 0 || wp.blocked > 0) && (
          <section aria-label="Feuilles de travail" className={s.cell}>
            <span className={s.key}>Feuilles</span>
            <span className={s.mono}>
              {wp.executed}/{wp.planned}
            </span>
            <span className={s.soft}>
              {plural(wp.executed, "exécutée")} · {wp.locked} {plural(wp.locked, "verrouillée")} · {wp.blocked} {plural(wp.blocked, "bloquée")}
            </span>
          </section>
        )}
        <section aria-label="Action prioritaire" className={`${s.cell} ${s.cellLast}`}>
          <span className={s.key}>Action prioritaire</span>
          {data.priority ? (
            <Link href="/dashboard/synthese#registre" className={s.priority}>
              {data.priority.action} · {data.priority.cycle} →
            </Link>
          ) : (
            <span>Aucune action possible sans source.</span>
          )}
        </section>
      </div>
    </div>
  );
}
