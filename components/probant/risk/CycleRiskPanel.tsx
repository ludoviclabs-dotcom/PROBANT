"use client";

import { Fragment, useId, useState, type Ref } from "react";
import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import p from "@/components/charte/page.module.css";
import type { Finding, Severity } from "@/lib/canonical-model";
import { SEVERITY_LABEL } from "@/lib/canonical-model";
import type { AuditCycle } from "@/lib/audit-cycles/types";
import { CYCLE_FAMILY_LABEL } from "@/lib/audit-cycles/types";
import type { AxisScore, CycleRiskScore, RiskAdjustment, RiskAxis, RiskDriver } from "@/lib/risk-mapping";
import { ADJUSTMENT_MAX, ADJUSTMENT_MIN, RISK_AXES, type AdjustmentPatch } from "@/lib/risk-mapping";
import { BAND_RANGE, EVALUATION_LABEL, axisText, compositePreciseText, compositeText, gaugeWidth } from "@/lib/risk-mapping/view";
import { AdjustmentHistoryPanel } from "./AdjustmentHistoryPanel";
import { BandMark } from "./BandMark";
import { DeclaredRisks } from "./DeclaredRisks";
import type { AdjustmentSaveStatus } from "./useRiskAdjustments";
import s from "./risk.module.css";

/**
 * Panneau de détail d'un cycle : composite et sa jauge (bornes des bandes), les quatre axes du risque avec leur
 * provenance (auto / ajusté / non évalué), les drivers factuels citant les VRAIS `Finding` (titre + `source.ref`,
 * lien vers `/dashboard/cloisons`), l'ajustement de jugement (± un cran sur probabilité et détectabilité, commentaire
 * obligatoire), les constats rattachés, l'historique des jugements et les risques déclarés par la fiche normative.
 *
 * Le composite est une heuristique interne jamais opposable : disclaimer
 * explicite + mention que la sauvegarde des ajustements est une persistance
 * serveur SIMULÉE (store en mémoire process, cf. lib/server-store), non
 * durable au redémarrage — jamais présentée comme une vraie base de données.
 * Drivers/constats/composite sont TOUJOURS calculés sur le seuil réel et
 * l'exercice réel — jamais sur une valeur simulée.
 *
 * Charte « instruments » : sections à filets continus sur le plan 2, niveau en pastille + mot, gravité des constats
 * en glyphe dessiné + mot, détectabilité en trait pointillé (axe inversé). Aucune carte arrondie, aucun halo.
 */

/** Formate un cran signé pour affichage : -2, -1, 0, +1, +2. */
function formatStep(value: number): string {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

const SEVERITY_RANK: Record<Severity, number> = { bloquant: 0, majeur: 1, mineur: 2, informatif: 3 };

/**
 * Étiquettes de statut d'un constat, tirées des seuls champs du `Finding` canonique :
 * - « Maîtrisé » si `statutRevue` est une valeur de clôture (`valide` ou `ecarte`) ;
 * - « Non sourcé » (trait tireté) si `source.ref` vaut INTERNE, sinon « Source ».
 */
function FindingTags({ finding }: { finding: Finding }) {
  const isClosed = finding.statutRevue === "valide" || finding.statutRevue === "ecarte";
  const isInterne = finding.source.ref === "INTERNE";
  return (
    <>
      {isClosed && (
        <span className={s.tag} data-kind="closed" title={`statutRevue : ${finding.statutRevue}`}>
          Maîtrisé
        </span>
      )}
      {isInterne ? (
        <span className={s.tag} data-kind="unsourced">
          Non sourcé
        </span>
      ) : (
        <span className={s.tag}>Source</span>
      )}
    </>
  );
}

/** Drivers factuels d'un axe : libellé — détail, puis les VRAIS `Finding` cités (lien cloison + référence + statut). */
function DriverList({ drivers, findingsById }: { drivers: RiskDriver[]; findingsById: Record<string, Finding> }) {
  if (drivers.length === 0) return null;
  return (
    <div className={s.drivers}>
      {drivers.map((driver, i) => {
        const findings = driver.findingIds.map((id) => findingsById[id]).filter((f): f is Finding => f !== undefined);
        return (
          <div key={i}>
            <strong>{driver.label}</strong>
            {driver.detail ? (
              <>
                {" — "}
                <span>{driver.detail}</span>
              </>
            ) : null}
            {findings.length > 0 && (
              <ul className={s.driverFindings}>
                {findings.map((f) => (
                  <li key={f.id}>
                    <Link href="/dashboard/cloisons" className={s.driverLink}>
                      {f.titre}
                    </Link>{" "}
                    <span className={s.ref}>{f.source.ref}</span>
                    <FindingTags finding={f} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Ajustement de jugement (± un cran) d'un axe ajustable. Le clamp ±2 est appliqué ici ; le garde-fou « commentaire
 * obligatoire » reste géré par le parent (`onStep` ne transmet à `onAdjust` qu'après saisie d'un commentaire).
 */
function Stepper({
  axis,
  value,
  onStep,
}: {
  axis: RiskAxis & { id: "probabilite" | "detectabilite" };
  value: number;
  onStep: (axis: "probabilite" | "detectabilite", next: number) => void;
}) {
  const name = axis.label.toLowerCase();
  return (
    <div className={s.stepper} role="group" aria-label={`Ajustement de jugement — ${name}`}>
      <span className={s.stepLabel}>Ajustement de jugement</span>
      <button
        type="button"
        className={s.stepBtn}
        onClick={() => onStep(axis.id, Math.max(ADJUSTMENT_MIN, value - 1))}
        disabled={value <= ADJUSTMENT_MIN}
        aria-label={`Diminuer l'ajustement de ${name} d'un cran`}
      >
        −
      </button>
      <span className={s.stepValue} aria-live="polite">
        {formatStep(value)}
      </span>
      <button
        type="button"
        className={s.stepBtn}
        onClick={() => onStep(axis.id, Math.min(ADJUSTMENT_MAX, value + 1))}
        disabled={value >= ADJUSTMENT_MAX}
        aria-label={`Augmenter l'ajustement de ${name} d'un cran`}
      >
        +
      </button>
    </div>
  );
}

const PROVENANCE_WORD: Record<AxisScore["provenance"], string> = {
  auto: "auto",
  "auto+ajusté": "ajusté",
  non_évalué: "non évalué",
};

function AxisItem({
  axis,
  score,
  findingsById,
  adjustmentValue,
  onStep,
}: {
  axis: RiskAxis;
  score: AxisScore;
  findingsById: Record<string, Finding>;
  adjustmentValue: number;
  onStep: (axis: "probabilite" | "detectabilite", next: number) => void;
}) {
  // Un axe « non évalué » n'a pas de valeur : jamais un 0 qui se lirait comme un risque nul.
  const unevaluated = score.provenance === "non_évalué";
  const adjustable = axis.adjustable && (axis.id === "probabilite" || axis.id === "detectabilite");
  return (
    <div className={s.axisItem}>
      <div className={s.axisHead}>
        <span className={s.axisName}>{axis.label}</span>
        <span className={s.axisTag} data-adjusted={score.provenance === "auto+ajusté" ? "" : undefined}>
          {PROVENANCE_WORD[score.provenance]}
        </span>
        <span className={s.axisScore}>{unevaluated ? "—" : axisText(score.value)}</span>
      </div>
      {axis.invertsRisk && <span className={s.axisNote}>inversé — plus haut = mieux détecté</span>}
      {!unevaluated && (
        <span aria-hidden="true" className={`${s.bar} ${s.axisBar}`} data-inverted={axis.invertsRisk ? "" : undefined}>
          <span style={{ width: `${gaugeWidth(score.value)}%` }} />
        </span>
      )}
      <p className={s.axisDoctrine}>{axis.doctrine}</p>
      <DriverList drivers={score.drivers} findingsById={findingsById} />
      {adjustable && (
        <Stepper axis={axis as RiskAxis & { id: "probabilite" | "detectabilite" }} value={adjustmentValue} onStep={onStep} />
      )}
    </div>
  );
}

/** Jauge du composite : filet 0-100, repères aux bornes des bandes, curseur à la valeur. Décorative (le chiffre et le mot portent l'information). */
function CompositeGauge({ value }: { value: number | null }) {
  const ticks = [BAND_RANGE.modéré.min, BAND_RANGE.élevé.min, BAND_RANGE.critique.min];
  if (value === null) {
    return (
      <div className={s.gauge} aria-hidden="true">
        <span className={s.gaugeTrack} data-empty="" />
      </div>
    );
  }
  const w = gaugeWidth(value);
  return (
    <div className={s.gauge} aria-hidden="true">
      <span className={s.gaugeTrack} />
      <span className={s.gaugeFill} style={{ width: `${w}%` }} />
      {ticks.map((t) => (
        <Fragment key={t}>
          <span className={s.gaugeTick} style={{ left: `${t}%` }} />
          <span className={s.gaugeLabel} style={{ left: `${t}%` }}>
            {t}
          </span>
        </Fragment>
      ))}
      <span className={s.gaugeMarker} style={{ left: `${w}%` }} />
    </div>
  );
}

const SAVE_STATUS_LABEL: Record<Exclude<AdjustmentSaveStatus, "idle">, string> = {
  saving: "Sauvegarde en cours",
  saved: "Sauvegardé",
  error: "Erreur de sauvegarde",
};

export function CycleRiskPanel({
  cycle,
  score,
  findingsById,
  adjustment,
  onAdjust,
  onReset,
  onClose,
  saveStatus = "idle",
  titleRef,
  titleId,
}: {
  cycle: AuditCycle;
  score: CycleRiskScore;
  findingsById: Record<string, Finding>;
  adjustment: RiskAdjustment | undefined;
  onAdjust: (patch: AdjustmentPatch) => void;
  onReset: () => void;
  /** Ferme le panneau (bouton ✕ d'en-tête). Optionnel : rétro-compatible. */
  onClose?: () => void;
  saveStatus?: AdjustmentSaveStatus;
  /** Titre du panneau : le shell y place le focus à l'ouverture. */
  titleRef?: Ref<HTMLHeadingElement>;
  titleId?: string;
}) {
  const uid = useId();
  const commentId = `${uid}-comment`;
  const errorId = `${uid}-error`;

  // Brouillon de commentaire de jugement + ajustement en attente de validation :
  // tant qu'un commentaire non vide n'est pas fourni, le patch n'est PAS transmis
  // à `onAdjust` (traçabilité obligatoire de tout jugement d'auditeur).
  const [commentDraft, setCommentDraft] = useState("");
  const [pendingPatch, setPendingPatch] = useState<AdjustmentPatch | null>(null);
  const [commentError, setCommentError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const currentNote = adjustment?.note ?? "";
  const probAdj = adjustment?.probabilite ?? 0;
  const detAdj = adjustment?.detectabilite ?? 0;
  const hasAdjustment = probAdj !== 0 || detAdj !== 0;

  // Applique un ajustement d'axe (clampé ±2 par l'appelant), sous garde-fou
  // du commentaire obligatoire. Un patch identique à l'état courant n'exige rien.
  function handleStep(axis: "probabilite" | "detectabilite", next: number) {
    const patch: AdjustmentPatch = { [axis]: next };

    const unchanged =
      (patch.probabilite === undefined || patch.probabilite === probAdj) &&
      (patch.detectabilite === undefined || patch.detectabilite === detAdj);
    if (unchanged) {
      setPendingPatch(null);
      setCommentError(false);
      return;
    }

    const comment = commentDraft.trim();
    if (comment === "") {
      // Mémorise le geste pour pouvoir le rejouer dès qu'un commentaire est saisi.
      setPendingPatch(patch);
      setCommentError(true);
      return;
    }

    setCommentError(false);
    setPendingPatch(null);
    onAdjust({ ...patch, note: comment });
  }

  function handleCommentChange(value: string) {
    setCommentDraft(value);
    if (value.trim() !== "" && pendingPatch) {
      setCommentError(false);
      onAdjust({ ...pendingPatch, note: value.trim() });
      setPendingPatch(null);
    }
  }

  // Constats rattachés au cycle = union dédupliquée des VRAIS `Finding` cités
  // par les drivers de tous les axes (aucun constat inventé, aucun ajout hors
  // moteur). Triés par gravité décroissante puis par id pour la stabilité.
  const attachedFindings: Finding[] = (() => {
    const seen = new Map<string, Finding>();
    for (const axis of RISK_AXES) {
      for (const driver of score.axes[axis.id].drivers) {
        for (const id of driver.findingIds) {
          const finding = findingsById[id];
          if (finding && !seen.has(finding.id)) seen.set(finding.id, finding);
        }
      }
    }
    return [...seen.values()].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.id.localeCompare(b.id));
  })();

  return (
    <>
      <div className={p.panelSection}>
        <div className={s.panelHead}>
          <p className={p.eyebrow}>Cycle · {CYCLE_FAMILY_LABEL[cycle.family]}</p>
          {onClose && (
            <button type="button" className={s.close} onClick={onClose} aria-label="Fermer le détail du cycle">
              ✕
            </button>
          )}
        </div>
        <h2 ref={titleRef} id={titleId} tabIndex={-1} className={s.panelTitle}>
          {cycle.title}
        </h2>
        <p className={s.slug}>{cycle.slug}</p>
        <p className={s.scoreLine}>
          <span className={s.scoreValue} title={score.composite === null ? undefined : `Valeur à une décimale : ${compositePreciseText(score.composite)}`}>
            {compositeText(score.composite)}
          </span>
          <BandMark band={score.criticityBand} />
          <span className={p.faint}>· {EVALUATION_LABEL[score.evaluation].toLowerCase()}</span>
        </p>
        <CompositeGauge value={score.composite} />
        <p className={s.panelText}>{cycle.summary}</p>
        <p className={`${s.panelText} ${p.faint}`}>
          Composite : heuristique interne d&apos;aide à la décision — <strong className={p.soft}>jamais opposable</strong>.
          {score.composite !== null && <> Valeur exacte {compositePreciseText(score.composite)} ; l&apos;entier affiché en est la partie entière.</>}{" "}
          Seuil réel, exercice réel : jamais la version simulée.
        </p>
      </div>

      <div className={p.panelSection}>
        <h3 className={`${p.key} ${s.panelKey}`}>Axes · jugement</h3>
        <div className={s.axes}>
          {RISK_AXES.map((axis) => (
            <AxisItem
              key={axis.id}
              axis={axis}
              score={score.axes[axis.id]}
              findingsById={findingsById}
              adjustmentValue={axis.id === "probabilite" ? probAdj : axis.id === "detectabilite" ? detAdj : 0}
              onStep={handleStep}
            />
          ))}
        </div>
        <p className={p.note}>P et D s&apos;ajustent de ± 2 crans (12 points) ; tout ajustement exige un commentaire.</p>
        <label className={s.comment} htmlFor={commentId}>
          <span className={p.key}>Commentaire de jugement</span>
        </label>
        <textarea
          id={commentId}
          value={commentDraft}
          onChange={(e) => handleCommentChange(e.target.value)}
          placeholder={currentNote || "Justifiez l'ajustement (historique, contrôle interne…)"}
          rows={2}
          aria-invalid={commentError}
          aria-describedby={commentError ? errorId : undefined}
          className={`${p.input} ${s.textarea}`}
        />
        {commentError && (
          <p id={errorId} className={s.error} role="alert">
            <span aria-hidden="true" className={s.errorMark} />
            Un commentaire est requis pour tracer ce jugement.
          </p>
        )}
      </div>

      <div className={p.panelSection}>
        <h3 className={`${p.key} ${s.panelKey}`}>Constats rattachés ({attachedFindings.length})</h3>
        {attachedFindings.length === 0 ? (
          <p className={s.emptyText}>Aucun constat rattaché à ce cycle — score porté par l&apos;exposition normative structurelle.</p>
        ) : (
          <ul className={s.findings}>
            {attachedFindings.map((f) => (
              <li key={f.id}>
                <Link href="/dashboard/cloisons" className={s.findingRow}>
                  <SeverityGlyph severity={f.severity} />
                  <span>
                    <span className={s.findingTitle}>{f.titre}</span>
                    <span className={s.findingMeta}>
                      <span>
                        {SEVERITY_LABEL[f.severity]} · {f.source.ref}
                      </span>
                      <FindingTags finding={f} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={p.panelSection}>
        <div className={s.actions}>
          {hasAdjustment && (
            <button type="button" className={p.btnQuiet} onClick={onReset}>
              Réinitialiser ce cycle
            </button>
          )}
          <button type="button" className={p.btnQuiet} onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>
            Historique des jugements
          </button>
          <span role="status" className={s.saveStatus}>
            {saveStatus === "error" && <span aria-hidden="true" className={s.errorMark} />}
            {saveStatus !== "idle" ? SAVE_STATUS_LABEL[saveStatus] : null}
          </span>
        </div>
        {historyOpen && <AdjustmentHistoryPanel cycleSlug={cycle.slug} />}
      </div>

      <div className={p.panelSection}>
        <h3 className={`${p.key} ${s.panelKey}`}>Risques déclarés (fiche normative)</h3>
        <DeclaredRisks risks={cycle.risks} />
      </div>

      <div className={p.panelSection}>
        <div className={s.links}>
          <Link href={`/normatif/cycles/${cycle.slug}`}>Fiche normative du cycle</Link>
          <Link href="/dashboard/cloisons">Constats par cloison</Link>
        </div>
        <p className={p.note}>
          Drivers et constats calculés sur le seuil réel et l&apos;exercice réel — jamais sur une valeur simulée. Ajustement
          additif borné (± 2 crans) sur probabilité et détectabilité uniquement ; la composante auto reste recalculée depuis
          les données. Sauvegarde serveur simulée — non durable (perdue au redémarrage).
        </p>
        <p className={p.note}>
          Le composite est une heuristique interne d&apos;aide à la hiérarchisation. Il n&apos;est jamais opposable et ne
          conclut rien : seuls les constats sourcés et les risques déclarés font foi.
        </p>
      </div>
    </>
  );
}
