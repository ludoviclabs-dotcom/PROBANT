"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  X,
  Check,
  Ban,
  ScrollText,
  ShieldCheck,
  Scale,
  ExternalLink,
} from "lucide-react";
import type { Finding, Mesure, StatutRevue } from "@/lib/canonical-model";
import { FAUX_POSITIF_HEX, FAUX_POSITIF_SHORT } from "@/lib/canonical-model";
import { SeverityBadge, FamilyBadge } from "@/components/probant/Badges";
import { SEVERITY_STYLE } from "@/components/probant/severity";
import { cn, formatEUR, formatPct } from "@/lib/utils";

function fmtMesure(m: Mesure, v: number): string {
  switch (m.unite) {
    case "EUR":
      return formatEUR(v);
    case "%":
      return formatPct(v);
    case "jours":
      return `${v.toFixed(0)} j`;
    default:
      return v.toLocaleString("fr-FR");
  }
}

const BASE_LABEL: Record<string, string> = {
  total_bilan: "du total bilan",
  chiffre_affaires: "du chiffre d'affaires",
  resultat_net: "du résultat net",
  total_charges: "du total des charges",
  total_produits: "du total des produits",
};

const STATUT_LABEL: Record<StatutRevue, string> = {
  en_attente: "En attente",
  valide: "Validé",
  ecarte: "Écarté",
};

/**
 * Drawer latéral droit présentant le constat complet : gravité, risque de faux
 * positif, montants, seuil de matérialité appliqué, source normative,
 * explication, faisceau d'indices, chaîne de preuve et décision du réviseur.
 * Se ferme par Échap ou clic sur l'overlay.
 */
export function FindingDrawer({
  finding,
  statut,
  onClose,
  onDecision,
}: {
  finding: Finding | null;
  statut?: StatutRevue;
  onClose: () => void;
  onDecision?: (id: string, statut: StatutRevue) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!finding) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [finding, onClose]);

  if (!finding) return null;
  const f = finding;
  const s = SEVERITY_STYLE[f.severity];
  const ecart = f.mesure.constate - f.mesure.seuil;
  const currentStatut = statut ?? f.statutRevue;
  const fpHex = f.fauxPositifRisk ? FAUX_POSITIF_HEX[f.fauxPositifRisk] : null;

  return (
    <div className="fixed inset-0 z-50 print:hidden" role="presentation">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      {/* Panneau */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Constat : ${f.titre}`}
        className="absolute right-0 top-0 flex h-full w-[480px] max-w-full flex-col border-l border-[var(--pb-border-strong)] bg-[var(--pb-surface)] shadow-2xl"
        style={{ animation: "pb-drawer-in 0.22s ease-out" }}
      >
        <div className="h-1 shrink-0" style={{ backgroundColor: s.hex }} />

        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--pb-border)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={f.severity} />
            <FamilyBadge family={f.family} />
            {f.fauxPositifRisk && fpHex && (
              <span
                title="Risque que ce constat soit un faux positif"
                className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium"
                style={{
                  borderColor: `${fpHex}66`,
                  backgroundColor: `${fpHex}1a`,
                  color: fpHex,
                }}
              >
                <ShieldCheck className="h-3 w-3" aria-hidden />
                {FAUX_POSITIF_SHORT[f.fauxPositifRisk]}
              </span>
            )}
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Fermer le détail du constat"
            className="shrink-0 rounded-md p-1 text-[var(--pb-text-faint)] transition-colors hover:bg-[var(--pb-surface-2)] hover:text-[var(--pb-text)] focus:outline-none focus-visible:ring-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corps défilant */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--pb-text)]">
              {f.titre}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--pb-text-muted)]">
              {f.constat}
            </p>
          </div>

          {/* Montants */}
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-[var(--pb-border)] bg-[var(--pb-border)]">
            <div className="bg-[var(--pb-surface-2)] p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
                Constaté
              </div>
              <div
                className="tnum mt-0.5 text-sm font-semibold"
                style={{ color: s.hex }}
              >
                {fmtMesure(f.mesure, f.mesure.constate)}
              </div>
            </div>
            <div className="bg-[var(--pb-surface-2)] p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
                Seuil / attendu
              </div>
              <div className="tnum mt-0.5 text-sm font-semibold text-[var(--pb-text)]">
                {fmtMesure(f.mesure, f.mesure.seuil)}
              </div>
            </div>
            <div className="bg-[var(--pb-surface-2)] p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
                Écart
              </div>
              <div className="tnum mt-0.5 text-sm font-semibold text-[var(--pb-text)]">
                {ecart > 0 ? "+" : ""}
                {fmtMesure(f.mesure, ecart)}
              </div>
            </div>
          </div>

          {/* Seuil de matérialité appliqué */}
          {f.seuilApplique && (
            <div
              className="flex items-start gap-2 rounded-md border px-3 py-2 text-[12px]"
              style={{
                borderColor: f.seuilApplique.depasse
                  ? `${s.hex}66`
                  : "var(--pb-border)",
                backgroundColor: f.seuilApplique.depasse
                  ? `${s.hex}12`
                  : "var(--pb-surface-2)",
              }}
            >
              <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--pb-accent)]" />
              <div>
                <span className="font-semibold text-[var(--pb-text)]">
                  Seuil {f.seuilApplique.source}
                </span>{" "}
                <span className="text-[var(--pb-text-muted)]">
                  {formatPct(f.seuilApplique.tauxApplique * 100)}{" "}
                  {BASE_LABEL[f.seuilApplique.base] ?? f.seuilApplique.base} ={" "}
                  {formatEUR(f.seuilApplique.montantCalcule)}
                </span>{" "}
                <span
                  className="font-semibold uppercase"
                  style={{
                    color: f.seuilApplique.depasse ? s.hex : "var(--pb-ok)",
                  }}
                >
                  {f.seuilApplique.depasse ? "→ dépassé" : "→ sous le seuil"}
                </span>
              </div>
            </div>
          )}

          {/* Source normative */}
          <div className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-3">
            <div className="flex items-center gap-2 text-xs">
              <ScrollText className="h-3.5 w-3.5 shrink-0 text-[var(--pb-accent)]" />
              <span className="font-semibold text-[var(--pb-accent)]">
                {f.source.ref}
              </span>
              <span className="text-[var(--pb-text-faint)]">
                · v.{f.source.effectiveDate}
              </span>
              <Link
                href="/normatif/sources"
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-[var(--pb-text-faint)] hover:text-[var(--pb-accent)]"
              >
                Référentiel <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <blockquote className="mt-2 border-l-2 border-[var(--pb-accent)] pl-3 text-[12px] italic leading-relaxed text-[var(--pb-text-muted)]">
              « {f.source.citation} »
            </blockquote>
          </div>

          {/* Explication */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
              Explication
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--pb-text-muted)]">
              {f.explication}
            </p>
          </div>

          {/* Recommandation au CAC / DAF si applicable */}
          {f.fauxPositifRisk === "eleve" && (
            <p className="rounded-md border border-[#eab308]/40 bg-[#292207] px-3 py-2 text-[12px] text-[var(--pb-text-muted)]">
              Signal à confirmer avant toute conclusion : rapprocher d'une pièce
              justificative ou d'un entretien avant d'évoquer une anomalie
              caractérisée.
            </p>
          )}

          {/* Faisceau d'indices */}
          {f.faisceau.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
                Faisceau d'indices
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {f.faisceau.map((sig) => (
                  <span
                    key={sig}
                    className="rounded-full border border-[var(--pb-border-strong)] bg-[var(--pb-surface)] px-2 py-0.5 text-[11px] text-[var(--pb-text-muted)]"
                  >
                    {sig}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Comptes concernés */}
          {f.comptesConcernes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--pb-text-faint)]">
              <span>Comptes :</span>
              {f.comptesConcernes.map((c) => (
                <code
                  key={c}
                  className="tnum rounded bg-[var(--pb-surface-3)] px-1.5 py-0.5 text-[var(--pb-text-muted)]"
                >
                  {c}
                </code>
              ))}
            </div>
          )}

          {/* Chaîne de preuve */}
          {f.preuve.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
                Chaîne de preuve
              </div>
              <ol className="mt-1.5 space-y-1.5 border-l border-[var(--pb-border)] pl-3">
                {f.preuve.map((p, i) => (
                  <li key={i} className="text-[11px] leading-relaxed">
                    <span className="font-semibold text-[var(--pb-text-muted)]">
                      {p.etape} :
                    </span>{" "}
                    <span className="text-[var(--pb-text-faint)]">{p.detail}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Décision du réviseur */}
        <div className="flex shrink-0 items-center gap-2 border-t border-[var(--pb-border)] px-4 py-3">
          {currentStatut !== "en_attente" && (
            <span
              className={cn(
                "mr-auto rounded-md px-2 py-0.5 text-[11px] font-semibold",
                currentStatut === "valide"
                  ? "bg-[#0f2417] text-[#22c55e]"
                  : "bg-[#2a1416] text-[#ef4444]",
              )}
            >
              {STATUT_LABEL[currentStatut]}
            </span>
          )}
          <button
            onClick={() => onDecision?.(f.id, "valide")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              currentStatut === "valide"
                ? "border-[#22c55e] bg-[#0f2417] text-[#22c55e]"
                : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[#22c55e] hover:text-[#22c55e]",
            )}
          >
            <Check className="h-3.5 w-3.5" /> Valider
          </button>
          <button
            onClick={() => onDecision?.(f.id, "ecarte")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              currentStatut === "ecarte"
                ? "border-[#ef4444] bg-[#2a1416] text-[#ef4444]"
                : "border-[var(--pb-border)] text-[var(--pb-text-muted)] hover:border-[#ef4444] hover:text-[#ef4444]",
            )}
          >
            <Ban className="h-3.5 w-3.5" /> Écarter
          </button>
        </div>
      </aside>
    </div>
  );
}
