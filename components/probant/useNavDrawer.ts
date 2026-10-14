"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Seuil `md` de Tailwind (48rem) : au-delà, la navigation reste dans la grille. */
const MD_QUERY = "(min-width: 48rem)";
const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Tiroir de navigation sous `md`, partagé par le tableau de bord
 * (app/dashboard/layout.tsx) et le module Normatif (app/normatif/layout.tsx).
 *
 * Fermé par défaut. Ouvert, il reçoit le focus (élément `[data-nav-close]`),
 * Tab et Maj+Tab y restent, et Échap le referme ; la page doit alors rendre son
 * contenu `inert`. Refermé, le focus revient au bouton du bandeau s'il était
 * dans le tiroir (ou perdu). Passer à `md` ou plus tiroir ouvert le referme.
 *
 * Côté aside : `max-md:transition-[translate]` ouvert, `transition-[translate,visibility]`
 * fermé — `translate-x-*` pose la propriété `translate` (Tailwind 4), et une
 * `visibility` encore animée à l'ouverture rendrait le tiroir non focalisable.
 */
export function useNavDrawer() {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    if (!open) return;
    const nav = navRef.current;
    const toggleButton = toggleRef.current;
    nav?.querySelector<HTMLElement>("[data-nav-close]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !nav) return;
      const focusables = [...nav.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!nav.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Focus resté dans le tiroir (ou perdu) : on le rend au bouton qui l'a ouvert.
      const active = document.activeElement;
      if (!active || active === document.body || nav?.contains(active)) {
        toggleButton?.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(MD_QUERY);
    const onChange = () => {
      if (query.matches) setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return { open, close, toggle, navRef, toggleRef };
}
