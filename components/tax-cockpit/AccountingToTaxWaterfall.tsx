"use client";

/**
 * Waterfall résultat comptable → résultat fiscal → IS (moteur TAX-05) — pièce
 * maîtresse de l'acte II, pleine largeur.
 *
 * Lecture : chaque barre démarre là où le cumul précédent s'arrête ; la
 * position lit le cumul, la longueur lit le montant. Règle héritée du moteur :
 * une étape « proposée » (candidat de revue) montre sa magnitude mais reste
 * VISUELLEMENT DISJOINTE du cumul — barre hachurée, libellé « hors cumul ».
 * Le composant ne recalcule jamais un montant : deltas et cumuls viennent du
 * snapshot, seules les positions des barres sont dérivées pour le dessin.
 */

import type { TaxCockpitDatasets, TaxCockpitWaterfallStep } from "@/lib/tax/cockpit";
import { formatCents } from "@/lib/synthesis/money";
import { FONT, T } from "@/components/synthesis/tokens";
import { ACT_TITLE, AMOUNT, EYEBROW, FAMILY, HAIRLINE, INK_FAINT } from "./cockpit-style";
import { SourcesDisclosure, TaxMethodologyPopover } from "./TaxSourceFootnote";

function stepColor(step: TaxCockpitWaterfallStep): string {
  if (step.status === "proposed") return T.warning;
  if (step.kind === "total") return T.positive;
  if (step.kind === "base") return T.accent;
  if (step.kind === "subtotal") return T.violet;
  return step.deltaCents < 0 ? T.orange : T.warning;
}

function stepExplainer(step: TaxCockpitWaterfallStep): string {
  if (step.status === "unavailable") return "Montant non disponible : la donnée nécessaire est absente du dossier.";
  if (step.status === "proposed") {
    return "Candidat de revue : magnitude affichée, jamais ajoutée au cumul tant que la décision n'est pas prise.";
  }
  if (step.kind === "base") return "Point de départ : résultat comptable, avant tout retraitement fiscal.";
  if (step.kind === "subtotal") return "Sous-total : cumul des seules étapes confirmées.";
  if (step.kind === "total") return "Impôt brut calculé par le moteur sur la base imposable.";
  return `Retraitement confirmé. Cumul après étape : ${formatCents(step.runningTotalCents)}.`;
}

/** Position et largeur (en % de l'échelle) d'une barre — dessin uniquement. */
function geometry(step: TaxCockpitWaterfallStep, scale: number): { left: number; width: number } {
  const pct = (cents: number) => Math.min(100, Math.max(0, (cents / scale) * 100));
  if (step.status === "unavailable") return { left: 0, width: 0 };
  if (step.kind !== "delta") return { left: 0, width: pct(Math.abs(step.runningTotalCents)) };
  if (step.status === "proposed") {
    // Hors cumul : la barre part du cumul courant, qui reste inchangé.
    const from = step.runningTotalCents;
    const to = step.runningTotalCents + step.deltaCents;
    return { left: pct(Math.min(from, to)), width: pct(Math.abs(step.deltaCents)) };
  }
  const before = step.runningTotalCents - step.deltaCents;
  return {
    left: pct(Math.min(before, step.runningTotalCents)),
    width: pct(Math.abs(step.deltaCents)),
  };
}

export function AccountingToTaxWaterfall({
  dataset,
  eyebrow = "Acte II · Le calcul",
}: {
  dataset: TaxCockpitDatasets["waterfall"];
  eyebrow?: string;
}) {
  const steps = dataset.steps;
  const blocked = steps.length > 0 && dataset.confirmedTaxResultCents === null;
  // L'échelle couvre aussi la borne d'un candidat, dessinée au-delà du cumul.
  const scale = Math.max(
    1,
    ...steps.map((step) =>
      Math.max(
        Math.abs(step.deltaCents),
        Math.abs(step.runningTotalCents),
        step.status === "proposed" ? Math.abs(step.runningTotalCents + step.deltaCents) : 0,
      ),
    ),
  );

  return (
    <section aria-labelledby="tax-waterfall-title">
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={EYEBROW}>{eyebrow}</div>
          <h2 id="tax-waterfall-title" style={ACT_TITLE}>
            {dataset.title}
          </h2>
        </div>
        <TaxMethodologyPopover dataset={dataset} />
      </div>
      <p style={{ margin: "8px 0 0", maxWidth: "92ch", fontSize: 13, lineHeight: 1.6, color: T.muted }}>
        Chaque barre démarre là où la précédente s&apos;arrête : la position lit le cumul, la longueur lit le
        montant. Barres hachurées = candidats de revue, affichés pour leur magnitude mais{" "}
        <strong style={{ color: "#c7d3e4", fontWeight: 500 }}>hors cumul</strong> tant qu&apos;ils ne sont pas
        confirmés. Montants en euros.
      </p>

      {steps.length === 0 || blocked ? (
        <p
          style={{
            margin: "24px 0 0",
            borderRadius: 12,
            background: "rgba(255,255,255,.035)",
            padding: "16px 18px",
            fontSize: FONT.table,
            lineHeight: 1.65,
            color: blocked ? "#f5d76b" : T.muted,
          }}
        >
          {dataset.summary}
        </p>
      ) : null}

      {steps.length > 0 && (
        <div
          role="img"
          aria-label={dataset.summary}
          style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 10 }}
        >
          {steps.map((step, index) => {
            const isTotalLike = step.kind === "base" || step.kind === "subtotal" || step.kind === "total";
            const amount = isTotalLike ? step.runningTotalCents : step.deltaCents;
            const unavailable = step.status === "unavailable";
            const proposed = step.status === "proposed";
            const empty = unavailable || (!isTotalLike && step.deltaCents === 0);
            const color = stepColor(step);
            const { left, width } = geometry(step, scale);
            const sign = step.kind === "delta" && !unavailable ? (amount < 0 ? "− " : "+ ") : "";
            return (
              <div
                key={step.id}
                title={stepExplainer(step)}
                className="pbz-row"
                style={{
                  padding: "8px 10px",
                  margin: step.kind === "subtotal" ? "6px -10px 0" : "0 -10px",
                  borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <span
                    style={{
                      fontFamily: isTotalLike ? FAMILY.sans : undefined,
                      fontSize: isTotalLike ? 14 : 13.5,
                      fontWeight: isTotalLike ? 600 : 400,
                      color: isTotalLike ? T.text : "#9ca7b8",
                    }}
                  >
                    {sign}
                    {step.label}
                  </span>
                  <span
                    style={{
                      ...AMOUNT,
                      fontSize: isTotalLike ? 19 : 17,
                      fontWeight: isTotalLike ? 500 : 400,
                      color: empty ? INK_FAINT : color,
                    }}
                  >
                    {unavailable ? "non disponible" : formatCents(amount)}
                  </span>
                </div>
                <div
                  style={{
                    position: "relative",
                    marginTop: 8,
                    height: isTotalLike ? 18 : 14,
                    borderRadius: 4,
                    background: "rgba(255,255,255,.03)",
                    border: unavailable || (proposed && step.deltaCents === 0) ? `1px dashed rgba(234,179,8,.3)` : undefined,
                    overflow: "hidden",
                  }}
                >
                  {!empty && width > 0 && (
                    <div
                      className={proposed ? "pbz-fade" : "pbz-bar"}
                      style={{
                        position: "absolute",
                        top: 0,
                        height: "100%",
                        // La largeur minimale ne doit jamais pousser la barre hors de sa piste.
                        left: `min(${left}%, calc(100% - ${proposed ? 14 : 3}px))`,
                        width: `max(${width}%, ${proposed ? 14 : 3}px)`,
                        borderRadius: proposed ? 3 : 4,
                        border: proposed ? `1px dashed rgba(234,179,8,.6)` : undefined,
                        background: proposed
                          ? "repeating-linear-gradient(45deg, rgba(234,179,8,.35) 0 4px, transparent 4px 8px)"
                          : isTotalLike
                            ? `linear-gradient(90deg, ${color}, ${color}d9)`
                            : color,
                        animationDelay: `${index * 120}ms`,
                      }}
                    />
                  )}
                </div>
                <div
                  style={{
                    marginTop: 5,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    fontSize: FONT.meta,
                    color: INK_FAINT,
                  }}
                >
                  <span style={{ color: proposed ? "#c2ab55" : undefined }}>
                    {unavailable
                      ? "Donnée absente du dossier — aucun montant inventé"
                      : proposed
                        ? `${step.note ?? "Candidat de revue — hors cumul retenu"}`
                        : step.kind === "base"
                          ? "Base de départ"
                          : step.kind === "subtotal"
                            ? "Somme des étapes confirmées"
                            : step.kind === "total"
                              ? "Impôt brut calculé"
                              : step.deltaCents === 0
                                ? "Aucun montant — cumul inchangé"
                                : "Retraitement confirmé"}
                  </span>
                  <span style={{ ...AMOUNT }}>
                    {unavailable
                      ? "cumul non disponible"
                      : proposed || (step.kind === "delta" && step.deltaCents === 0)
                        ? "cumul inchangé"
                        : step.kind === "total"
                          ? ""
                          : `cumul ${formatCents(step.runningTotalCents)}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          marginTop: 28,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          gap: "20px 44px",
          borderTop: `1px solid ${HAIRLINE}`,
          paddingTop: 24,
        }}
      >
        <div>
          <div style={{ ...EYEBROW, letterSpacing: ".14em" }}>Résultat fiscal retenu</div>
          <div
            style={{
              ...AMOUNT,
              marginTop: 6,
              fontSize: "clamp(34px, 5vw, 52px)",
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: "-.02em",
              color: dataset.confirmedTaxResultCents === null ? INK_FAINT : T.text,
            }}
          >
            {dataset.confirmedTaxResultCents === null
              ? "non disponible"
              : formatCents(dataset.confirmedTaxResultCents)}
          </div>
        </div>
        <div style={{ paddingBottom: 6 }}>
          <div style={{ ...EYEBROW, letterSpacing: ".14em" }}>Borne intégrant les candidats</div>
          <div style={{ ...AMOUNT, marginTop: 6, fontSize: 26, color: T.muted }}>
            {dataset.proposedTaxResultCents === null
              ? "non disponible"
              : formatCents(dataset.proposedTaxResultCents)}
          </div>
        </div>
        <SourcesDisclosure dataset={dataset} style={{ marginLeft: "auto", paddingBottom: 4 }} />
      </div>
    </section>
  );
}
