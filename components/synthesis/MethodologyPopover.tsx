"use client";

/**
 * Popover de méthodologie — « d'où vient ce chiffre ? ».
 *
 * Bouton accessible (aria-expanded/aria-controls), ouverture au clic ou au
 * clavier, fermeture par Échap ou perte de focus. Le contenu vient du
 * dataset (`methodology` + `sourceMetricIds`) : le composant n'invente rien.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { VisualizationDataset } from "@/lib/visualization/types";
import { FONT, T } from "./tokens";

export function MethodologyPopover({ dataset }: { dataset: VisualizationDataset }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, close]);

  if (!dataset.methodology && dataset.sourceMetricIds.length === 0) return null;

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="pbz-focusable"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Méthodologie du graphique ${dataset.title}`}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          border: `1px solid ${T.border}`,
          borderRadius: 7,
          background: "transparent",
          color: T.muted,
          padding: "3px 9px",
          fontSize: FONT.meta,
          cursor: "pointer",
        }}
      >
        <span aria-hidden="true">ƒ</span> Méthodologie
      </button>
      {open && (
        <div
          id={panelId}
          role="note"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            zIndex: 40,
            width: 320,
            maxWidth: "80vw",
            border: `1px solid ${T.borderStrong}`,
            borderRadius: 10,
            background: "rgba(13,18,28,.98)",
            padding: "12px 14px",
            fontSize: FONT.meta,
            lineHeight: 1.55,
            color: T.text,
            boxShadow: "0 12px 30px -10px #000",
          }}
        >
          {dataset.methodology && <p style={{ margin: 0 }}>{dataset.methodology}</p>}
          {dataset.sourceMetricIds.length > 0 && (
            <p style={{ margin: dataset.methodology ? "8px 0 0" : 0, color: T.faint }}>
              Trace de calcul :{" "}
              <span style={{ fontFamily: "monospace" }}>
                {dataset.sourceMetricIds.join(", ")}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
