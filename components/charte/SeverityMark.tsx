import type { Severity } from "@/lib/canonical-model/finding";
import { SEVERITY_GLYPH, SEVERITY_LABEL } from "./severity";

/**
 * Glyphe de gravité dessiné (jamais d'emoji ni de pastille colorée) : carré plein = bloquant, triangle
 * plein = majeur, losange contour = mineur, cercle contour = informatif. Décoratif : le libellé qui
 * l'accompagne porte l'information. `label` ajoute ce libellé à côté du glyphe.
 */
export function SeverityGlyph({ severity, size = 10 }: { severity: Severity; size?: number }) {
  const g = SEVERITY_GLYPH[severity];
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <path
        d={g.path}
        strokeWidth={1.6}
        style={g.paint === "fill" ? { fill: g.color, stroke: "none" } : { fill: "none", stroke: g.color }}
      />
    </svg>
  );
}

export function SeverityMark({ severity, size = 10, label = false, gap = 8 }: { severity: Severity; size?: number; label?: boolean; gap?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap }}>
      <SeverityGlyph severity={severity} size={size} />
      {label && <span>{SEVERITY_LABEL[severity]}</span>}
    </span>
  );
}
