import type { ReactNode } from "react";
import { charteFonts } from "@/app/fonts";
import p from "./page.module.css";

/**
 * Racine d'une page du tableau de bord dans l'ambiance « instruments » : pose `data-ambiance` et les variables de
 * police sur le même élément (sans quoi les jetons et Newsreader / Geist / Plex Mono ne s'appliquent pas), puis la
 * gouttière de contenu. Les pages gardent leur propre logique ; ce composant ne fait que porter la charte.
 */
export function InstrumentPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-ambiance="instruments" className={`${charteFonts} ${p.page}${className ? ` ${className}` : ""}`}>
      <div className={p.content}>{children}</div>
    </div>
  );
}

/**
 * En-tête éditorial : repère d'étape en capitales mono (« 03 · Cartographie des risques »), titre serif (h1),
 * chapeau, et un emplacement à droite pour des relevés ou une action principale.
 */
export function PageIntro({
  index,
  eyebrowNote,
  title,
  lead,
  aside,
}: {
  /** Numéro de l'étape dans le rail (« 03 »). */
  index: string;
  /** Complément après le nom de l'étape (« cockpit intérim du CAC »). */
  eyebrowNote?: ReactNode;
  title: string;
  lead?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className={p.intro}>
      <div className={p.introMain}>
        <p className={p.eyebrow}>
          {index} · {title}
          {eyebrowNote ? <span className={p.faint}> — {eyebrowNote}</span> : null}
        </p>
        <h1 className={p.title}>{title}</h1>
        {lead ? <p className={p.lead}>{lead}</p> : null}
      </div>
      {aside ? <div className={p.introAside}>{aside}</div> : null}
    </header>
  );
}

/**
 * Tête de section : chiffre romain italique facultatif, titre serif (h2 par défaut), filet continu, note.
 * L'identifiant sert d'ancre et de nom accessible à la section (`aria-labelledby`).
 */
export function SectionHead({
  id,
  title,
  numeral,
  note,
  level = 2,
  action,
}: {
  id: string;
  title: ReactNode;
  numeral?: string;
  note?: ReactNode;
  level?: 2 | 3;
  action?: ReactNode;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={p.sectionHead}>
      {numeral ? <span className={p.sectionNumeral}>{numeral}</span> : null}
      <Heading id={id} className={p.sectionTitle}>
        {title}
      </Heading>
      <span className={p.sectionRule} aria-hidden="true" />
      {note ? <span className={p.sectionNote}>{note}</span> : null}
      {action}
    </div>
  );
}
