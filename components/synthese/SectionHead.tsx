import s from "./synthese.module.css";

export type Variant = "A" | "B";

const SECTIONS = [
  { id: "sec-decision", title: "Décision", numeral: "I.", noteA: "ce qui suffit pour agir", noteB: "niveau A / 3" },
  { id: "sec-analyse", title: "Analyse", numeral: "II.", noteA: "le Sankey pilote toute la section", noteB: "niveau B / 3" },
  { id: "sec-explo", title: "Exploration", numeral: "III.", noteA: "replié par défaut", noteB: "niveau C / 3" },
] as const;

/**
 * En-tête de chapitre. Variante A (éditoriale) : chiffre romain italique, titre serif, filet continu. Variante B
 * (instrument) : « §01 » en capitales mono, règle graduée, niveau. Le titre est toujours un h2 ; l'identifiant sert
 * d'ancre (`#sec-analyse`) et de nom accessible à la section.
 */
export function SectionHead({ index, variant, animate = false }: { index: 0 | 1 | 2; variant: Variant; animate?: boolean }) {
  const section = SECTIONS[index];
  const txt = animate ? "txt" : undefined;
  const rule = animate ? "rule" : undefined;
  if (variant === "A") {
    return (
      <div className={s.secHeadA} data-section={index}>
        <span data-a={txt} className={s.secNumA}>{section.numeral}</span>
        <h2 id={section.id} data-a={txt} className={s.secTitleA}>{section.title}</h2>
        <div data-a={rule} className={s.secRuleA} />
        <span data-a={txt} className={s.secNoteA}>{section.noteA}</span>
      </div>
    );
  }
  return (
    <div className={s.secHeadB} data-section={index}>
      <span data-a={txt} className={s.secNumB}>§0{index + 1}</span>
      <h2 id={section.id} data-a={txt} className={s.secTitleB}>{section.title}</h2>
      <div data-a={rule} className={s.secRuleB} />
      <span data-a={txt} className={s.secNoteB}>{section.noteB}</span>
    </div>
  );
}
