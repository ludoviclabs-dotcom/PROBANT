"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, History, Info } from "lucide-react";
import type { Finding } from "@/lib/canonical-model";
import type { AuditCycle } from "@/lib/audit-cycles/types";
import type {
  AxisScore,
  CriticityBand,
  CycleRiskScore,
  RiskAdjustment,
  RiskAxis,
  RiskDriver,
} from "@/lib/risk-mapping";
import { RISK_AXES, type AdjustmentPatch } from "@/lib/risk-mapping";
import { RiskMatrix } from "@/components/normatif/RiskMatrix";
import { cn, wcagColoredTextOrFallback } from "@/lib/utils";
import { AdjustmentSliders } from "./AdjustmentSliders";
import { AdjustmentHistoryPanel } from "./AdjustmentHistoryPanel";
import type { AdjustmentSaveStatus } from "./useRiskAdjustments";

/**
 * Panneau détail d'un cycle : les quatre axes de risque en barres de progression,
 * chaque axe accompagné de ses drivers factuels citant les VRAIS `Finding`
 * (titre + `source.ref`, lien vers `/dashboard/cloisons`). Réutilise la
 * `RiskMatrix` normative pour les risques déclarés du cycle, renvoie vers la
 * fiche normative, et expose les curseurs d'ajustement.
 *
 * Le composite est une heuristique interne jamais opposable : disclaimer
 * explicite + mention que la sauvegarde des ajustements est une persistance
 * serveur SIMULÉE (store en mémoire process, cf. lib/server-store), non
 * durable au redémarrage — jamais présentée comme une vraie base de données.
 */

/** Couleur d'une bande de criticité (palette gravité alignée sur `--pb-*`). */
const BAND_STYLE: Record<CriticityBand, { label: string; hex: string }> = {
  faible: { label: "Faible", hex: "#3b82f6" },
  modéré: { label: "Modéré", hex: "#eab308" },
  élevé: { label: "Élevé", hex: "#f97316" },
  critique: { label: "Critique", hex: "#ef4444" },
  non_évalué: { label: "Non évalué", hex: "#64748b" },
};

/** Couleur d'une barre d'axe interpolée sur sa valeur 0-100. */
function axisColor(value: number): string {
  if (value >= 75) return "#ef4444";
  if (value >= 50) return "#f97316";
  if (value >= 25) return "#eab308";
  return "#22c55e";
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
    <ul className="mt-2 space-y-2">
      {drivers.map((driver, i) => {
        const findings = driver.findingIds
          .map((id) => findingsById[id])
          .filter((f): f is Finding => f !== undefined);
        return (
          <li key={i} className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-2.5">
            <div className="text-[11px] font-semibold text-[var(--pb-text)]">{driver.label}</div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--pb-text-muted)]">
              {driver.detail}
            </p>
            {findings.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {findings.map((f) => (
                  <li key={f.id}>
                    <Link
                      href="/dashboard/cloisons"
                      className="group flex items-start gap-1.5 text-[11px] text-[var(--pb-text-muted)] hover:text-[var(--pb-text)]"
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
          </li>
        );
      })}
    </ul>
  );
}

function AxisBar({
  axis,
  score,
  findingsById,
}: {
  axis: RiskAxis;
  score: AxisScore;
  findingsById: Record<string, Finding>;
}) {
  const color = axisColor(score.value);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[12px] font-semibold text-[var(--pb-text)]">{axis.label}</span>
          {axis.invertsRisk && (
            <span className="ml-1.5 text-[10px] text-[var(--pb-text-faint)]">
              (inversé — plus haut = mieux détecté)
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-baseline gap-1.5">
          <span className="tnum text-[13px] font-semibold text-[var(--pb-text)]">
            {Math.round(score.value)}
          </span>
          {score.provenance === "auto+ajusté" && (
            <span className="rounded border border-[var(--pb-accent)]/40 px-1 py-0.5 text-[9px] font-medium text-[var(--pb-accent)]">
              ajusté
            </span>
          )}
        </div>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--pb-surface-3)]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${Math.max(0, Math.min(100, score.value))}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-[var(--pb-text-faint)]">{axis.doctrine}</p>
      <DriverList drivers={score.drivers} findingsById={findingsById} />
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
  saveStatus = "idle",
}: {
  cycle: AuditCycle;
  score: CycleRiskScore;
  findingsById: Record<string, Finding>;
  adjustment: RiskAdjustment | undefined;
  onAdjust: (patch: AdjustmentPatch) => void;
  onReset: () => void;
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

  function handleSliderChange(patch: AdjustmentPatch) {
    // Une valeur identique à l'ajustement courant (ex: relâcher le curseur sans
    // le bouger) ne déclenche aucune exigence de commentaire.
    const unchanged =
      (patch.probabilite === undefined || patch.probabilite === (adjustment?.probabilite ?? 0)) &&
      (patch.detectabilite === undefined || patch.detectabilite === (adjustment?.detectabilite ?? 0));
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

  return (
    <div className="space-y-5">
      {/* En-tête : titre, bande de criticité, composite */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold text-[var(--pb-text)]">{cycle.title}</h3>
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
            style={{
              // Le texte reste teinté (`band.hex`) uniquement quand son contraste
              // sur ce fond à 18% atteint AA (≥ 4.5:1) ; sinon bascule sur le
              // token clair `--pb-text` pour rester lisible (ex: bandes « faible »,
              // « critique », « non évalué » dont le fond à cette opacité reste
              // trop proche de la teinte du texte pour un contraste suffisant).
              color: wcagColoredTextOrFallback(band.hex, 18, undefined, "var(--pb-text)"),
              backgroundColor: `color-mix(in srgb, ${band.hex} 18%, transparent)`,
            }}
          >
            {band.label}
          </span>
          {score.evaluation === "partiel" && (
            <span className="rounded-md border border-amber-500/40 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              Exposition seule — aucun constat rattaché
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--pb-text-muted)]">
          {cycle.summary}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--pb-text-faint)]">
          <span className="tnum">
            Composite heuristique :{" "}
            <span className="font-semibold text-[var(--pb-text)]">
              {score.composite === null ? "non évalué" : Math.round(score.composite)}
            </span>
          </span>
          <span>·</span>
          <span className="tnum">{score.findingCount} constat(s) rattaché(s)</span>
        </div>
      </div>

      {/* Quatre axes en barres de progression */}
      <div className="space-y-4">
        {RISK_AXES.map((axis) => (
          <AxisBar
            key={axis.id}
            axis={axis}
            score={score.axes[axis.id]}
            findingsById={findingsById}
          />
        ))}
      </div>

      {/* Ajustement de jugement */}
      <div className="space-y-2">
        <AdjustmentSliders
          cycleSlug={cycle.slug}
          adjustment={adjustment}
          onChange={handleSliderChange}
        />

        {/* Commentaire obligatoire pour tracer tout jugement d'ajustement */}
        <div className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-2.5">
          <label
            htmlFor="adjustment-comment"
            className="text-[10px] font-medium text-[var(--pb-text-muted)]"
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

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--pb-text-faint)]">
          <div className="flex flex-wrap items-center gap-2">
            <span>Sauvegarde serveur simulée — non durable (perdue au redémarrage).</span>
            {saveStatus !== "idle" && (
              <span className={cn("font-medium", SAVE_STATUS_STYLE[saveStatus].className)}>
                {SAVE_STATUS_STYLE[saveStatus].label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--pb-border)] px-2 py-1 text-[10px] font-medium text-[var(--pb-text-muted)] transition-colors hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)]"
            >
              <History className="h-3 w-3" />
              Historique des jugements
            </button>
            <button
              type="button"
              onClick={onReset}
              className="rounded-md border border-[var(--pb-border)] px-2 py-1 text-[10px] font-medium text-[var(--pb-text-muted)] transition-colors hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)]"
            >
              Réinitialiser ce cycle
            </button>
          </div>
        </div>

        {historyOpen && <AdjustmentHistoryPanel cycleSlug={cycle.slug} />}
      </div>

      {/* Risques déclarés — matrice normative réutilisée */}
      <div>
        <h4 className="mb-2 text-[12px] font-semibold text-[var(--pb-text)]">
          Risques déclarés (fiche normative)
        </h4>
        <RiskMatrix risks={cycle.risks} />
      </div>

      {/* Lien fiche normative */}
      <div className="flex flex-wrap items-center gap-4 border-t border-[var(--pb-border)] pt-3 text-[12px]">
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

      {/* Disclaimer heuristique non opposable */}
      <div className="flex items-start gap-2 rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-3 text-[11px] leading-relaxed text-[var(--pb-text-muted)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pb-text-faint)]" />
        <span>
          Le composite est une heuristique interne d'aide à la hiérarchisation.
          Il n'est jamais opposable et ne conclut rien : seuls les constats
          sourcés et les risques déclarés font foi.
        </span>
      </div>
    </div>
  );
}
