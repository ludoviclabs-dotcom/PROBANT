import type { FindingFamily } from "@/lib/canonical-model/finding";
import { FAMILY } from "./severity";

/**
 * Trait de famille : plein (droit dur, opposable), tirets (présomption d'audit), pointillé (paramètre
 * interne). Les trois familles ne se mélangent jamais ; le trait porte la nature de la règle, le mot
 * qui l'accompagne la nomme.
 */
export function FamilyRule({ family, width = 22 }: { family: FindingFamily; width?: number }) {
  const spec = FAMILY[family];
  return (
    <svg width={width} height={6} viewBox="0 0 22 6" preserveAspectRatio="none" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <line
        x1={0}
        y1={3}
        x2={22}
        y2={3}
        strokeWidth={spec.width}
        strokeDasharray={spec.dash === "none" ? undefined : spec.dash}
        vectorEffect="non-scaling-stroke"
        style={{ stroke: spec.color }}
      />
    </svg>
  );
}
