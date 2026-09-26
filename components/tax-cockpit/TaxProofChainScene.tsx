"use client";

/**
 * Scène signature « La chaîne de preuve » : trois plaques translucides en vue
 * isométrique (FEC & grand-livre → liasse → déclarations), reliées par des
 * flux de données. Ornement INFORMATIF : l'état de chaque couche vient des
 * pièces requises du dataset (une couche dont une pièce manque pulse en
 * ambre). Rendu CSS 3D léger, sans WebGL ; sous `prefers-reduced-motion` la
 * scène est figée (schéma statique). La légende porte l'information en texte
 * et chaque couche est un bouton qui mène à la section correspondante.
 */

import type { TaxCockpitDatasets } from "@/lib/tax/cockpit";
import { FONT, T } from "@/components/synthesis/tokens";
import { EYEBROW } from "./cockpit-style";

export type ProofLayerTarget = "tax-act-calcul" | "tax-reconciliation";

export interface ProofLayer {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly color: string;
  readonly missing: boolean;
  readonly target: ProofLayerTarget;
}

const LAYER_SPECS: readonly {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly documents: readonly string[];
  readonly target: ProofLayerTarget;
}[] = [
  {
    id: "ledger",
    label: "FEC & grand-livre",
    color: T.accent,
    documents: ["document:fec", "document:balance", "document:invoice"],
    target: "tax-act-calcul",
  },
  {
    id: "liasse",
    label: "Liasse fiscale 2050-2059 (dont 2058-A)",
    color: T.violet,
    documents: ["document:liasse_2050_2059", "document:liasse_2033"],
    target: "tax-act-calcul",
  },
  {
    id: "declarations",
    label: "Déclarations — 2065, CA3, avis de CFE",
    color: "#2dd4bf",
    documents: [
      "document:declaration_2065",
      "document:declaration_tva_ca3",
      "document:declaration_tva_ca12",
      "document:tax_notice",
    ],
    target: "tax-reconciliation",
  },
];

/** Projection des pièces requises du dataset vers les trois couches de la chaîne. */
export function proofLayersFrom(datasets: TaxCockpitDatasets): ProofLayer[] {
  return LAYER_SPECS.map((spec) => {
    const missing = datasets.requiredDocuments.rows.filter((row) => spec.documents.includes(row.id));
    return {
      id: spec.id,
      label: spec.label,
      color: missing.length > 0 ? T.warning : spec.color,
      missing: missing.length > 0,
      detail:
        missing.length > 0
          ? `Pièce à fournir : ${missing.map((row) => String(row.cells.piece)).join(", ")}`
          : "Pièces présentes au dossier",
      target: spec.target,
    };
  });
}

const DEPTH = [-70, 10, 90] as const;

export function TaxProofChainScene({
  layers,
  onSelect,
}: {
  layers: readonly ProofLayer[];
  onSelect?: (target: ProofLayerTarget) => void;
}) {
  return (
    <figure style={{ margin: 0 }}>
      <div
        aria-hidden="true"
        className="pbz-motion"
        style={{
          position: "relative",
          height: 300,
          overflow: "hidden",
          perspective: 1000,
          perspectiveOrigin: "50% 40%",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformStyle: "preserve-3d",
            transform: "rotateX(58deg) rotateZ(-38deg)",
            animation: "pbzTilt 16s ease-in-out infinite",
          }}
        >
          {layers.map((layer, index) => (
            <div
              key={layer.id}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 210,
                height: 140,
                margin: "-70px 0 0 -105px",
                transform: `translateZ(${DEPTH[index] ?? 0}px)`,
                border: `1px solid ${layer.color}66`,
                borderRadius: 6,
                background: `linear-gradient(135deg, ${layer.color}2e, ${layer.color}0a)`,
                boxShadow: `0 0 40px ${layer.color}1f`,
                animation: layer.missing ? "pbzLayerPulse 1.3s ease-in-out infinite alternate" : undefined,
              }}
            />
          ))}
          {layers.map((layer, index) => (
            <span
              key={`flow-${layer.id}`}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 2,
                height: 2,
                margin: `${[-30, 10, 34][index] ?? 0}px 0 0 ${[-40, 20, -12][index] ?? 0}px`,
                background: layer.missing ? T.warning : T.positive,
                boxShadow: `0 0 8px ${layer.missing ? T.warning : T.positive}`,
                animation: `pbzFlow 3.2s linear ${index * 0.8}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
      <figcaption style={{ marginTop: 4 }}>
        <div style={{ ...EYEBROW, letterSpacing: ".14em" }}>La chaîne de preuve</div>
        <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
          {[...layers].reverse().map((layer) => (
            <li key={layer.id}>
              <button
                type="button"
                className="pbz-focusable pbz-quiet"
                title={layer.detail}
                onClick={() => onSelect?.(layer.target)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  width: "100%",
                  border: 0,
                  background: "transparent",
                  padding: "2px 0",
                  textAlign: "left",
                  fontSize: FONT.meta,
                  color: T.muted,
                  cursor: "pointer",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 7, height: 7, flexShrink: 0, borderRadius: 2, background: layer.color }}
                />
                <span>
                  {layer.label}
                  {layer.missing && (
                    <span style={{ color: T.warning }}>
                      {" "}
                      · <span aria-hidden="true">⚠ </span>
                      {layer.detail}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
