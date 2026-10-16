"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { SEVERITY_LABEL, type Finding } from "@/lib/canonical-model/finding";
import { canAnimate, EASE } from "@/components/charte/motion";
import { charteFonts } from "@/app/fonts";
import { plural } from "@/lib/synthese-view/common";
import s from "./synthese.module.css";

/**
 * Volet de détail d'une cellule de la mosaïque : glisse de 32 px depuis la droite en 220 ms, sans rebond. Dialogue
 * modal : le focus entre sur « Fermer », Tab reste dans le volet, Échap ou un clic sur le voile le referme et le
 * focus revient sur la cellule ouverte. Il liste les constats de la cellule ; chacun ouvre sa chaîne de preuve.
 */
export function DetailDrawer({
  title,
  findings,
  onClose,
  onOpenChain,
}: {
  title: string;
  findings: readonly Finding[];
  onClose: () => void;
  onOpenChain: (id: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    closeRef.current?.focus();
    if (el && canAnimate(el)) {
      const animation = el.animate([{ transform: "translateX(32px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 220, easing: EASE });
      return () => animation.cancel();
    }
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = ref.current?.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])");
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div data-ambiance="instruments" className={`${charteFonts} ${s.drawerRoot}`}>
      <div aria-hidden="true" onClick={onClose} className={s.drawerVeil} />
      <aside ref={ref} role="dialog" aria-modal="true" aria-label={title} className={s.drawer} onKeyDown={onKeyDown}>
        <div className={s.drawerHead}>
          <div>
            <div className={s.drawerKey}>Détail de cellule</div>
            <h3 className={s.drawerTitle}>{title}</h3>
          </div>
          <button ref={closeRef} type="button" aria-label="Fermer le détail" className={s.drawerClose} onClick={onClose}>
            ×
          </button>
        </div>
        <p className={s.drawerSub}>
          {findings.length} {plural(findings.length, "constat")} · assertion NEP 500
        </p>
        <ul className={s.drawerList}>
          {findings.map((f) => (
            <li key={f.id}>
              <div className={s.drawerMeta}>
                <SeverityGlyph severity={f.severity} />
                {SEVERITY_LABEL[f.severity]} · <span className={s.mono}>{f.id}</span>
              </div>
              <div className={s.drawerFinding}>{f.titre}</div>
              <div className={s.drawerSource}>
                {f.source.ref}
                {f.comptesConcernes.length ? ` · comptes ${f.comptesConcernes.join(", ")}` : ""}
              </div>
              <button type="button" className={s.linkButton} onClick={() => onOpenChain(f.id)}>
                Ouvrir la chaîne de preuve
              </button>
            </li>
          ))}
        </ul>
        {findings.length === 0 && <p className={s.drawerEmpty}>Aucun constat sur cette combinaison.</p>}
      </aside>
    </div>
  );
}
