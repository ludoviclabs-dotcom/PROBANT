import type { VerdictView } from "@/lib/synthese-view/verdict";
import type { Variant } from "./SectionHead";
import s from "./synthese.module.css";

/**
 * Verdict éditorial : une phrase-verdict en serif, chiffres en mono, puis le détail et les deux actions. Le texte
 * est celui du moteur de synthèse mis en phrases (lib/synthese-view/verdict) ; aucune conclusion n'est ajoutée.
 */
export function VerdictSentence({
  verdict,
  variant,
  engineVersion,
  snapshotHash,
  onNote,
  exportOpen,
  onToggleExport,
}: {
  verdict: VerdictView;
  variant: Variant;
  engineVersion: string;
  snapshotHash: string;
  onNote: () => void;
  exportOpen: boolean;
  onToggleExport: () => void;
}) {
  const figure = (value: string | null, tone: "signal" | "ink") =>
    value ? (
      <>
        <span className={tone === "signal" && verdict.critical ? s.figureSignal : s.figureInk}>{value}</span>{" "}
      </>
    ) : null;
  const eyebrow = (
    <>
      {variant === "A" ? "Verdict du moteur de synthèse" : `Verdict · moteur ${engineVersion}`} ·{" "}
      <span className={verdict.critical ? s.signalText : undefined}>{variant === "A" ? verdict.label : verdict.label.replace(/^dossier /, "")}</span>
    </>
  );

  return (
    <div className={variant === "A" ? s.verdictColA : s.verdictColB}>
      <p data-a="txt" className={variant === "A" ? s.eyebrowA : s.eyebrowB}>{eyebrow}</p>
      <h3 data-a="txt" className={variant === "A" ? s.verdictA : s.verdictB}>
        {variant === "A" ? (
          <>
            <span className={s.verdictLine}>
              {figure(verdict.lead.figure, "signal")}
              {verdict.lead.text}
            </span>
            <span className={`${s.verdictLine} ${s.verdictSecond}`}>
              {figure(verdict.second.figure, "ink")}
              {verdict.second.text}
            </span>
          </>
        ) : (
          <>
            {figure(verdict.lead.figure, "signal")}
            {verdict.lead.text}{" "}
            <span className={s.verdictSecond}>
              {figure(verdict.second.figure, "ink")}
              {verdict.second.text}
            </span>
          </>
        )}
      </h3>
      <p data-a="txt" className={variant === "A" ? s.detailA : s.detailB}>{verdict.detail}</p>
      <div data-a="txt" className={variant === "A" ? s.actionsA : s.actionsB}>
        <button type="button" className={s.btnPrimary} onClick={onNote}>
          Télécharger la note de synthèse <span className={s.mono}>↓</span>
        </button>
        <button type="button" className={s.btnSecondary} aria-expanded={exportOpen} aria-controls="exports-preuve" onClick={onToggleExport}>
          Exporter le dossier de preuve
        </button>
        {variant === "A" && (
          <span className={s.snapshotRef}>
            snapshot {snapshotHash.slice(0, 12)} · moteur {engineVersion}
          </span>
        )}
      </div>
    </div>
  );
}
