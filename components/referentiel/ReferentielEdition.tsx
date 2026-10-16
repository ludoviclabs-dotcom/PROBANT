"use client";

import { useEffect, useRef } from "react";
import { decrireReferentiel } from "@/lib/referentiel/edition";
import { cn } from "@/lib/utils";

/**
 * Identifiant de référentiel d'un dossier (« éd. N », « 2024-01-01 (antérieur) »)
 * et son détail (empreinte, date d'entrée du contenu, absence de relecture),
 * dans une divulgation native : focalisable au clavier, ouvrable au toucher,
 * fermée par Échap ou un clic extérieur — jamais réservée à un `title`.
 */
export function ReferentielEdition({
  identifiant,
  align = "left",
  placement = "below",
  className,
}: {
  identifiant: string;
  align?: "left" | "right";
  /** `above` ouvre le panneau vers le haut (pied du rail du tableau de bord). */
  placement?: "below" | "above";
  className?: string;
}) {
  const d = decrireReferentiel(identifiant);
  const ref = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return (
    <details
      ref={ref}
      className={cn("relative inline-block", className)}
      onToggle={() => {
        // Le panneau reste dans la fenêtre, même ancré en milieu de ligne à 390 px.
        // clientWidth : sur mobile, innerWidth s'élargit dès que le panneau déborde.
        const p = panel.current;
        if (!ref.current?.open || !p) return;
        p.style.transform = "";
        const r = p.getBoundingClientRect();
        const width = document.documentElement.clientWidth;
        const shift = Math.min(0, width - 8 - r.right) || Math.max(0, 8 - r.left);
        if (shift) p.style.transform = `translateX(${shift}px)`;
      }}
      onKeyDown={(e) => {
        const el = ref.current;
        if (e.key !== "Escape" || !el?.open) return;
        el.open = false;
        el.querySelector("summary")?.focus();
      }}
    >
      <summary
        aria-label={`Référentiel ${d.libelle} : détail de l'édition`}
        className="cursor-pointer list-none rounded-sm underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pb-accent)] [&::-webkit-details-marker]:hidden"
      >
        {d.libelle}
      </summary>
      <div
        ref={panel}
        className={cn(
          "absolute z-50 w-[min(20rem,calc(100vw-2rem))] whitespace-normal rounded-md border border-[var(--pb-border-strong)] bg-[var(--pb-surface)] p-3 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-[var(--pb-text-muted)] shadow-lg",
          placement === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        <p className="font-mono text-[var(--pb-text)] [overflow-wrap:anywhere]">{d.identifiant}</p>
        <p className="mt-1">{d.detail}</p>
      </div>
    </details>
  );
}
