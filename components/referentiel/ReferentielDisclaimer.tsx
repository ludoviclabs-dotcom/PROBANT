"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Bandeau d'avertissement fiabilité — première phrase toujours visible,
 * complément dépliable. Le triangle pulse une seule fois à l'entrée.
 */
export function ReferentielDisclaimer() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#eab308]/40 bg-[#292207] p-4">
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-[#eab308]"
        style={{ animation: "pbWarnPulse 600ms ease-out 1" }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-relaxed text-[var(--pb-text-muted)]">
          Les citations sont des paraphrases destinées à l'affichage et ne se
          substituent pas au texte officiel opposable.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateRows: expanded ? "1fr" : "0fr",
            transition: "grid-template-rows 250ms ease",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <p className="pb-0.5 pt-1.5 text-[13px] leading-relaxed text-[var(--pb-text-muted)]">
              Les seuils chiffrés externes (catégories d'entreprises,
              nomination CAC…) doivent être confrontés au Code de commerce et
              à ses décrets avant mise en production.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] font-medium text-[#eab308]/75 hover:text-[#eab308]"
        >
          {expanded ? "Réduire ↑" : "En savoir plus ↓"}
        </button>
      </div>
    </div>
  );
}
