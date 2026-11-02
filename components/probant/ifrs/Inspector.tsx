"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { charteFonts } from "@/app/fonts";
import s from "./ifrs.module.css";

/** Même seuil que l'inspecteur de Cloisons (PR #80) : au-delà, panneau persistant ; en dessous, tiroir modal. */
export const DOCK_QUERY = "(min-width: 1400px)";
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function useDocked() {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DOCK_QUERY), update = () => setDocked(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return docked;
}

/**
 * Inspecteur de l'objet sélectionné. Ancré : une région nommée, focus posé sur son titre à l'ouverture. Tiroir : dialogue modal sur le patron
 * de `DetailDrawer` (focus sur « Fermer », Tab confiné, Échap ou clic sur le voile referme). Dans les deux cas, la fermeture rend le focus
 * à l'élément qui l'a ouvert (`returnTo`).
 */
export function Inspector({ title, kicker, docked, onClose, returnTo, children }: { title: string; kicker: string; docked: boolean; onClose(): void; returnTo: HTMLElement | null; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null), heading = useRef<HTMLHeadingElement>(null), origin = useRef(returnTo);
  useEffect(() => { origin.current = returnTo; }, [returnTo]);
  useEffect(() => {
    if (docked) heading.current?.focus(); else close.current?.focus();
    const target = origin;
    return () => { const t = target.current; if (t && document.contains(t)) t.focus(); };
  }, [docked, title]);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
    if (docked || event.key !== "Tab") return;
    const focusable = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const body = <>
    <div className={s.inspectorHead}>
      <div><p className={s.eyebrow}>{kicker}</p><h2 ref={heading} tabIndex={-1} style={{ margin: 0 }}>{title}</h2></div>
      <button ref={close} type="button" aria-label="Fermer l'inspecteur" onClick={onClose}>×</button>
    </div>
    {children}
  </>;
  if (docked) return <aside ref={panel} className={s.inspector} aria-label={"Inspecteur — " + title} onKeyDown={onKeyDown}>{body}</aside>;
  return <div data-ambiance="instruments" className={`${charteFonts} ${s.drawerRoot}`}>
    <div aria-hidden="true" className={s.drawerVeil} onClick={onClose}/>
    <aside ref={panel} role="dialog" aria-modal="true" aria-label={"Inspecteur — " + title} className={s.drawer} onKeyDown={onKeyDown}>{body}</aside>
  </div>;
}
