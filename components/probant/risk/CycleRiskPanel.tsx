"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, History, Info, RotateCcw, X } from "lucide-react";
import type { Finding, Severity } from "@/lib/canonical-model";
import { SEVERITY_LABEL } from "@/lib/canonical-model";
import type { AuditCycle } from "@/lib/audit-cycles/types";
import { CYCLE_FAMILY_LABEL } from "@/lib/audit-cycles/types";
import type {
  AxisScore,
  CriticityBand,
  CycleRiskScore,
  RiskAdjustment,
  RiskAxis,
  RiskDriver,
} from "@/lib/risk-mapping";
import {
  ADJUSTMENT_MAX,
  ADJUSTMENT_MIN,
  RISK_AXES,
  type AdjustmentPatch,
} from "@/lib/risk-mapping";
import { RiskMatrix } from "@/components/normatif/RiskMatrix";
import { cn, wcagColoredTextOrFallback } from "@/lib/utils";
import { AdjustmentHistoryPanel } from "./AdjustmentHistoryPanel";
import type { AdjustmentSaveStatus } from "./useRiskAdjustments";

/**
 * Panneau détail d'un cycle (drawer slide-in) : jauge composite circulaire,
 * les quatre axes du risque en cartes, chaque axe accompagné de ses drivers
 * factuels citant les VRAIS `Finding` (titre + `source.ref`, lien vers
 * `/dashboard/cloisons`), une liste des constats rattachés, l'ajustement de
 * jugement inline (±) et la matrice normative réutilisée.
 *
 * Le composite est une heuristique interne jamais opposable : disclaimer
 * explicite + mention que la sauvegarde des ajustements est une persistance
 * serveur SIMULÉE (store en mémoire process, cf. lib/server-store), non
 * durable au redémarrage — jamais présentée comme une vraie base de données.
 * Drivers/constats/composite sont TOUJOURS calculés sur le seuil réel et
 * l'exercice réel — jamais sur une valeur simulée.
 */

/** Couleur d'une bande de criticité (palette gravité alignée sur `--pb-*`). */
const BAND_STYLE: Record<CriticityBand, { label: string; hex: string }> = {
  faible: { label: "Faible", hex: "#3b82f6" },
  modéré: { label: "Modéré", hex: "#eab308" },
  élevé: { label: "Élevé", hex: "#f97316" },
  critique: { label: "Critique", hex: "#ef4444" },
  non_évalué: { label: "Non évalué", hex: "#64748b" },
};

/** Libellé lisible de l'état d'évaluation, pour le chip d'en-tête. */
const EVALUATION_LABEL: Record<CycleRiskScore["evaluation"], string> = {
  évalué: "Évalué",
  partiel: "Exposition seule",
  non_évalué: "Non évalué",
};

/** Couleur de gravité d'un constat, alignée sur la palette du contrat. */
const SEVERITY_HEX: Record<Severity, string> = {
  bloquant: "#ef4444",
  majeur: "#f97316",
  mineur: "#eab308",
  informatif: "#3b82f6",
};

/** Couleur d'une barre d'axe interpolée sur sa valeur 0-100. */
function axisColor(value: number): string {
  if (value >= 75) return "#ef4444";
  if (value >= 50) return "#f97316";
  if (value >= 25) return "#eab308";
  return "#22c55e";
}

/** Formate un cran signé pour affichage : -2, -1, 0, +1, +2. */
function formatStep(value: number): string {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

/**
 * Badge de statut discret à côté du titre d'un constat cité dans un driver.
 * Basé uniquement sur des champs déjà présents du `Finding` canonique :
 * - « Source » (neutre) si `source.ref` existe et diffère de INTERNE ;
 * - « Non source » (ambre) si `source.ref` vaut INTERNE ;
 * - « Maîtrisé » (bleu) si `statutRevue` est une valeur de clôture
 *   (`valide` ou `ecarte`, voir `StatutRevue` dans `lib/canonical-model/finding.ts`).
 * Un même constat peut cumuler les deux informations : le badge « Maîtrisé »
 * prime visuellement, le badge de source reste affiché à côté.
 */
function FindingStatusBadge({ finding }: { finding: Finding }) {
  const isClosed = finding.statutRevue === "valide" || finding.statutRevue === "ecarte";
  const isInterne = finding.source.ref === "INTERNE";

  return (
    <span className="inline-flex items-center gap-1">
      {isClosed && (
        <span
          className="rounded border border-sky-500/40 px-1 py-[1px] text-[9px] font-medium leading-none text-sky-400"
          title={`statutRevue : ${finding.statutRevue}`}
        >
          Maîtrisé
        </span>
      )}
      {isInterne ? (
        <span className="rounded border border-amber-500/40 px-1 py-[1px] text-[9px] font-medium leading-none text-amber-400">
          Non source
        </span>
      ) : (
        <span className="rounded border border-[var(--pb-border)] px-1 py-[1px] text-[9px] font-medium leading-none text-[var(--pb-text-faint)]">
          Source
        </span>
      )}
    </span>
  );
}

/**
 * Drivers factuels d'un axe : label (surligné) — détail, puis la liste des
 * VRAIS `Finding` cités (id `source.ref` + lien cloison + badge statut).
 */
function DriverList({
  drivers,
  findingsById,
}: {
  drivers: RiskDriver[];
  findingsById: Record<string, Finding>;
}) {
  if (drivers.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {drivers.map((driver, i) => {
        const findings = driver.findingIds
          .map((id) => findingsById[id])
          .filter((f): f is Finding => f !== undefined);
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex gap-1.5 text-[10.5px] leading-snug text-[var(--pb-text-muted)]">
              <span className="shrink-0 text-[var(--pb-text-faint)]">▸</span>
              <span className="min-w-0">
                <strong className="font-semibold text-[var(--pb-text-bright)]">
                  {driver.label}
                </strong>
                {driver.detail ? <> — {driver.detail}</> : null}
              </span>
            </div>
            {findings.length > 0 && (
              <ul className="ml-3 space-y-1">
                {findings.map((f) => (
                  <li key={f.id}>
                    <Link
                      href="/dashboard/cloisons"
                      className="group flex items-start gap-1.5 text-[10.5px] text-[var(--pb-text-muted)] hover:text-[var(--pb-text)]"
                    >
                      <span className="mt-0.5 shrink-0 text-[var(--pb-text-faint)]">·</span>
                      <span className="min-w-0">
                        <span className="font-medium">{f.titre}</span>
                        <span className="ml-1.5 font-mono text-[10px] text-[var(--pb-accent)] group-hover:underline">
                          {f.source.ref}
                        </span>
                        <span className="ml-1.5 align-middle">
                          <FindingStatusBadge finding={f} />
                        </span>
                      </span>
                    </Link>
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
 * Contrôle d'ajustement inline (± un cran) pour un axe ajustable. Le clamp
 * ±2 est appliqué ici en amont ; le garde-fou « commentaire obligatoire »
 * reste géré par le parent (`onStep` ne transmet à `onAdjust` qu'après saisie
 * d'un commentaire). `disabled` reflète l'atteinte d'une borne.
 */
function InlineAdjust({
  axisId,
  value,
  onStep,
}: {
  axisId: "probabilite" | "detectabilite";
  value: number;
  onStep: (axis: "probabilite" | "detectabilite", next: number) => void;
}) {
  const active = value !== 0;
  const atMin = value <= ADJUSTMENT_MIN;
  const atMax = value >= ADJUSTMENT_MAX;

  const btnBase =
    "flex h-[22px] w-[22px] items-center justify-center rounded-md border text-[13px] font-semibold leading-none transition-colors";

  return (
    <div className="mt-2.5 flex items-center gap-2 border-t border-dashed border-[var(--pb-border-soft)] pt-2.5">
      <span className="text-[10px] font-semibold text-[var(--pb-text-faint)]">
        Ajustement de jugement
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onStep(axisId, Math.max(ADJUSTMENT_MIN, value - 1))}
          disabled={atMin}
          aria-label="Diminuer l'ajustement d'un cran"
          className={cn(
            btnBase,
            atMin
              ? "cursor-not-allowed border-[var(--pb-border-soft)] text-[var(--pb-text-faint)] opacity-40"
              : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)]",
          )}
        >
          −
        </button>
        <span
          className={cn(
            "tnum min-w-[26px] rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold",
            active
              ? "bg-[color-mix(in_srgb,var(--pb-accent)_20%,transparent)] text-[var(--pb-accent)]"
              : "bg-[var(--pb-surface-3)] text-[var(--pb-text-faint)]",
          )}
        >
          {formatStep(value)}
        </span>
        <button
          type="button"
          onClick={() => onStep(axisId, Math.min(ADJUSTMENT_MAX, value + 1))}
          disabled={atMax}
          aria-label="Augmenter l'ajustement d'un cran"
          className={cn(
            btnBase,
            atMax
              ? "cursor-not-allowed border-[var(--pb-border-soft)] text-[var(--pb-text-faint)] opacity-40"
              : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)]",
          )}
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Carte d'un axe (fond `--pb-surface-inset`) : dot de couleur + libellé +
 * badge provenance + valeur (mono, couleur d'axe) + mini-barre animée +
 * doctrine + drivers, et — pour les axes ajustables — le contrôle ± inline.
 */
function AxisCard({
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
  // Couleur/barre reflètent le RISQUE résiduel de l'axe, pas la valeur brute :
  // pour un axe inversé (détectabilité), une valeur haute = bon = risque faible,
  // donc la teinte/le remplissage suivent `100 − value` — même principe que
  // `axisRisk()` dans RiskMatrixHeatmap. Sans ça, une détectabilité de 90
  // (excellente) s'affichait en rouge quasi plein, contredisant la matrice et
  // suggérant à tort un risque élevé. Le CHIFFRE affiché reste la vraie valeur
  // brute de l'axe (jamais transformé).
  const riskEquivalent = axis.invertsRisk ? 100 - score.value : score.value;
  const color = axisColor(riskEquivalent);
  const clamped = Math.max(0, Math.min(100, riskEquivalent));
  // Seuls probabilité/détectabilité sont ajustables (voir RISK_AXES). On isole
  // l'id NARROWI pour que le contrôle ± reçoive un axe typé `"probabilite" | "detectabilite"`.
  const adjustableAxisId =
    axis.adjustable && (axis.id === "probabilite" || axis.id === "detectabilite") ? axis.id : null;

  return (
    <div className="rounded-xl border border-[var(--pb-border-soft)] bg-[var(--pb-surface-inset)] p-3">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-[11.5px] font-bold text-[var(--pb-text)]">{axis.label}</span>
        {axis.invertsRisk && (
          <span className="text-[9.5px] text-[var(--pb-text-faint)]">
            (inversé — plus haut = mieux détecté)
          </span>
        )}
        {score.provenance === "auto+ajusté" ? (
          <span className="rounded border border-[color-mix(in_srgb,var(--pb-accent)_45%,transparent)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--pb-accent)]">
            ajusté
          </span>
        ) : score.provenance === "non_évalué" ? (
          <span className="rounded border border-[var(--pb-border-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--pb-text-faint)]">
            non évalué
          </span>
        ) : (
          <span className="rounded border border-[var(--pb-border-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--pb-text-faint)]">
            auto
          </span>
        )}
        <span
          className="ml-auto font-mono text-[13px] font-bold tabular-nums"
          style={{ color }}
        >
          {Math.round(score.value)}
        </span>
      </div>
      <div className="mt-2 h-[5px] w-full overflow-hidden rounded-full bg-[var(--pb-track)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamped}%`,
            backgroundColor: color,
            transformOrigin: "left",
            animation: "pbGrowX .5s cubic-bezier(.16,1,.3,1) both",
          }}
        />
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--pb-text-faint)]">
        {axis.doctrine}
      </p>
      <DriverList drivers={score.drivers} findingsById={findingsById} />
      {adjustableAxisId && (
        <InlineAdjust axisId={adjustableAxisId} value={adjustmentValue} onStep={onStep} />
      )}
    </div>
  );
}

/** Libellé/style de l'indicateur de sauvegarde, aligné sur `AdjustmentSaveStatus`. */
const SAVE_STATUS_STYLE: Record<Exclude<AdjustmentSaveStatus, "idle">, { label: string; className: string }> = {
  saving: {
    label: "Sauvegarde en cours",
    className: "animate-pulse text-[var(--pb-text-faint)]",
  },
  saved: {
    label: "Sauvegardé",
    className: "text-emerald-400",
  },
  error: {
    label: "Erreur de sauvegarde",
    className: "text-red-400",
  },
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
}: {
  cycle: AuditCycle;
  score: CycleRiskScore;
  findingsById: Record<string, Finding>;
  adjustment: RiskAdjustment | undefined;
  onAdjust: (patch: AdjustmentPatch) => void;
  onReset: () => void;
  /** Ferme le drawer (bouton ✕ d'en-tête). Optionnel : rétro-compatible. */
  onClose?: () => void;
  saveStatus?: AdjustmentSaveStatus;
}) {
  const band = BAND_STYLE[score.criticityBand];

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
  // du commentaire obligatoire. Reprend exactement la sémantique de l'ancien
  // `handleSliderChange` : un patch identique à l'état courant n'exige rien.
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
          if (finding && !seen.has(finding.id)) {
            seen.set(finding.id, finding);
          }
        }
      }
    }
    const order: Record<Severity, number> = {
      bloquant: 0,
      majeur: 1,
      mineur: 2,
      informatif: 3,
    };
    return [...seen.values()].sort(
      (a, b) => order[a.severity] - order[b.severity] || a.id.localeCompare(b.id),
    );
  })();

  const compositeDisplay = score.composite === null ? "—" : String(Math.round(score.composite));
  // Offset du cercle (r=30, circonférence = 2π·30 ≈ 188.5). Un composite plus
  // haut remplit davantage l'anneau ; `null` (non évalué) laisse l'anneau vide.
  const RING_CIRC = 188.5;
  const ringFraction = score.composite === null ? 0 : Math.max(0, Math.min(100, score.composite)) / 100;
  const ringOffset = RING_CIRC * (1 - ringFraction);
  const ringColor = score.composite === null ? "var(--pb-track)" : band.hex;

  return (
    <div
      className="flex flex-col"
      style={{ animation: "pbDrawer .3s cubic-bezier(.16,1,.3,1) both" }}
    >
      {/* En-tête : slug (mono), chips famille/bande/éval, bouton fermer */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="break-all font-mono text-[13px] font-bold leading-snug text-[var(--pb-text)]">
            {cycle.slug}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-0.5 text-[9.5px] font-semibold text-[var(--pb-text-muted)]">
              {CYCLE_FAMILY_LABEL[cycle.family]}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[9.5px] font-semibold"
              style={{
                // Le texte reste teinté (`band.hex`) uniquement quand son contraste
                // sur ce fond à 18% atteint AA (≥ 4.5:1) ; sinon bascule sur le
                // token clair `--pb-text` pour rester lisible (voir composant matrice).
                color: wcagColoredTextOrFallback(band.hex, 18, undefined, "var(--pb-text)"),
                backgroundColor: `color-mix(in srgb, ${band.hex} 18%, transparent)`,
              }}
            >
              {band.label}
            </span>
            <span className="rounded-full border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-0.5 text-[9.5px] font-semibold text-[var(--pb-text-muted)]">
              {EVALUATION_LABEL[score.evaluation]}
            </span>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le panneau"
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border border-[var(--pb-border)] text-[var(--pb-text-muted)] transition-colors hover:bg-[var(--pb-surface-3)] hover:text-[var(--pb-text)]"
          >
            <X className="h-3 w-3" strokeWidth={2.4} />
          </button>
        )}
      </div>

      {/* Titre + résumé du cycle (contexte métier) */}
      <div className="mt-3">
        <h3 className="text-[14px] font-semibold text-[var(--pb-text)]">{cycle.title}</h3>
        <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--pb-text-muted)]">
          {cycle.summary}
        </p>
      </div>

      {/* Jauge composite circulaire animée */}
      <div className="mt-4 flex items-center gap-4 rounded-2xl border border-[var(--pb-border-soft)] bg-[var(--pb-surface-inset)] px-4 py-3.5">
        <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0">
          <circle cx="38" cy="38" r="30" fill="none" stroke="var(--pb-track)" strokeWidth="6" />
          <circle
            cx="38"
            cy="38"
            r="30"
            fill="none"
            stroke={ringColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={RING_CIRC}
            strokeDashoffset={ringOffset}
            transform="rotate(-90 38 38)"
          >
            <animate
              attributeName="stroke-dashoffset"
              from={RING_CIRC}
              to={ringOffset}
              dur="0.9s"
              calcMode="spline"
              keySplines="0.16 1 0.3 1"
              fill="freeze"
            />
          </circle>
          <text
            x="38"
            y="36"
            textAnchor="middle"
            fontSize="17"
            fontWeight="700"
            fill="var(--pb-text)"
            fontFamily="'JetBrains Mono', monospace"
          >
            {compositeDisplay}
          </text>
          <text x="38" y="49" textAnchor="middle" fontSize="8" fill="var(--pb-text-faint)">
            / 100
          </text>
        </svg>
        <div>
          <div className="text-[11px] font-bold tracking-[0.05em] text-[var(--pb-text-muted)]">
            COMPOSITE
          </div>
          <div className="mt-1 text-[10.5px] leading-relaxed text-[var(--pb-text-faint)]">
            Heuristique interne d'aide à la décision —{" "}
            <strong className="text-[var(--pb-text-muted)]">jamais opposable</strong>. Seuil
            réel, exercice réel : jamais la version simulée.
          </div>
        </div>
      </div>

      {/* Cartes par axe */}
      <div className="mt-4 flex flex-col gap-3">
        {RISK_AXES.map((axis) => (
          <AxisCard
            key={axis.id}
            axis={axis}
            score={score.axes[axis.id]}
            findingsById={findingsById}
            adjustmentValue={axis.id === "probabilite" ? probAdj : axis.id === "detectabilite" ? detAdj : 0}
            onStep={handleStep}
          />
        ))}
      </div>

      {/* Commentaire obligatoire pour tracer tout jugement d'ajustement */}
      <div
        className={cn(
          "mt-3 rounded-xl border p-2.5",
          commentError
            ? "border-red-500/60 bg-[color-mix(in_srgb,#ef4444_8%,var(--pb-surface-inset))]"
            : "border-[var(--pb-border-soft)] bg-[var(--pb-surface-inset)]",
        )}
      >
        <label
          htmlFor="adjustment-comment"
          className="text-[10px] font-semibold text-[var(--pb-text-muted)]"
        >
          Commentaire de jugement
        </label>
        <textarea
          id="adjustment-comment"
          value={commentDraft}
          onChange={(e) => handleCommentChange(e.target.value)}
          placeholder={currentNote || "Justifiez l'ajustement (historique, contrôle interne…)"}
          rows={2}
          className={cn(
            "mt-1 w-full resize-none rounded-md border bg-[var(--pb-surface)] p-1.5 text-[11px] text-[var(--pb-text)] outline-none",
            commentError
              ? "border-red-500/60 focus:border-red-500"
              : "border-[var(--pb-border)] focus:border-[var(--pb-accent)]",
          )}
        />
        {commentError && (
          <p className="mt-1 text-[10px] text-red-400">
            Un commentaire est requis pour tracer ce jugement.
          </p>
        )}
      </div>

      {/* Constats rattachés — VRAIS Finding cités par les drivers */}
      <div className="mt-4">
        <div className="text-[10.5px] font-bold tracking-[0.06em] text-[var(--pb-text-faint)]">
          CONSTATS RATTACHÉS{" "}
          <span className="tnum font-semibold text-[var(--pb-text-muted)]">
            ({attachedFindings.length})
          </span>
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {attachedFindings.map((f) => {
            const sevHex = SEVERITY_HEX[f.severity];
            return (
              <Link
                key={f.id}
                href="/dashboard/cloisons"
                className="group flex items-start gap-2 rounded-[10px] border border-[var(--pb-border-soft)] bg-[var(--pb-surface-inset)] px-2.5 py-2 transition-colors hover:border-[var(--pb-border)]"
              >
                <span
                  className="mt-[3px] h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: sevHex }}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[9.5px] font-bold text-[var(--pb-text-muted)] group-hover:text-[var(--pb-accent)]">
                      {f.source.ref}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{
                        color: wcagColoredTextOrFallback(sevHex, 16, undefined, "var(--pb-text)"),
                        backgroundColor: `color-mix(in srgb, ${sevHex} 16%, transparent)`,
                      }}
                    >
                      {SEVERITY_LABEL[f.severity]}
                    </span>
                    <FindingStatusBadge finding={f} />
                  </div>
                  <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--pb-text-bright)]">
                    {f.titre}
                  </div>
                </div>
              </Link>
            );
          })}
          {attachedFindings.length === 0 && (
            <div className="rounded-[10px] border border-dashed border-[var(--pb-border)] px-2.5 py-2.5 text-[10.5px] leading-relaxed text-[var(--pb-text-faint)]">
              Aucun constat rattaché à ce cycle — score porté par l'exposition normative
              structurelle.
            </div>
          )}
        </div>
      </div>

      {/* Actions : reset (si ajustement) + indicateur de sauvegarde */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {hasAdjustment && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--pb-border)] px-3 py-1.5 text-[10.5px] font-semibold text-[var(--pb-text-muted)] transition-colors hover:bg-[var(--pb-surface-3)] hover:text-[var(--pb-text)]"
          >
            <RotateCcw className="h-[11px] w-[11px]" />
            Réinitialiser ce cycle
          </button>
        )}
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          aria-expanded={historyOpen}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--pb-border)] px-3 py-1.5 text-[10.5px] font-semibold text-[var(--pb-text-muted)] transition-colors hover:bg-[var(--pb-surface-3)] hover:text-[var(--pb-text)]"
        >
          <History className="h-[11px] w-[11px]" />
          Historique des jugements
        </button>
        {saveStatus !== "idle" && (
          <span className={cn("text-[10.5px] font-medium", SAVE_STATUS_STYLE[saveStatus].className)}>
            {SAVE_STATUS_STYLE[saveStatus].label}
          </span>
        )}
      </div>

      {historyOpen && (
        <div className="mt-2.5">
          <AdjustmentHistoryPanel cycleSlug={cycle.slug} />
        </div>
      )}

      {/* Risques déclarés — matrice normative réutilisée */}
      <div className="mt-4">
        <h4 className="mb-2 text-[12px] font-semibold text-[var(--pb-text)]">
          Risques déclarés (fiche normative)
        </h4>
        <RiskMatrix risks={cycle.risks} />
      </div>

      {/* Liens fiche normative / cloisons */}
      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[var(--pb-border)] pt-3 text-[12px]">
        <Link
          href={`/normatif/cycles/${cycle.slug}`}
          className="inline-flex items-center gap-1.5 text-[var(--pb-accent)] hover:underline"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Fiche normative du cycle
        </Link>
        <Link
          href="/dashboard/cloisons"
          className="inline-flex items-center gap-1.5 text-[var(--pb-text-muted)] hover:text-[var(--pb-text)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Constats par cloison
        </Link>
      </div>

      {/* Disclaimer heuristique + périmètre de l'ajustement */}
      <p className="mt-3.5 text-[9.5px] leading-relaxed text-[var(--pb-text-faint)]">
        Drivers et constats calculés sur le seuil réel et l'exercice réel — jamais sur une
        valeur simulée. Ajustement additif borné (±2 crans) sur probabilité et détectabilité
        uniquement ; la composante auto reste recalculée depuis les données. Sauvegarde serveur
        simulée — non durable (perdue au redémarrage).
      </p>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--pb-border-soft)] bg-[var(--pb-surface-inset)] p-3 text-[10.5px] leading-relaxed text-[var(--pb-text-muted)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pb-text-faint)]" />
        <span>
          Le composite est une heuristique interne d'aide à la hiérarchisation. Il n'est jamais
          opposable et ne conclut rien : seuls les constats sourcés et les risques déclarés font
          foi.
        </span>
      </div>
    </div>
  );
}
