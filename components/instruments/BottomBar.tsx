"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import { BOTTOM_MORE, BOTTOM_PRIMARY } from "./nav";
import s from "./shell.module.css";

/**
 * Barre basse (sous 760 px) : quatre écrans et « Plus » pour les autres. Cibles de 56 px, position courante
 * soulignée d'un filet de 2 px. Le menu « Plus » se ferme de lui-même au changement d'écran, à Échap (le focus
 * revient sur « Plus ») et à un appui hors du menu.
 */
export function BottomBar() {
  const pathname = usePathname();
  // Le menu est « ouvert pour un écran » : changer d'écran le referme sans effet de bord.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreActive = BOTTOM_MORE.some((item) => item.href === pathname);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenFor(null);
      moreRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || moreRef.current?.contains(target)) return;
      setOpenFor(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div data-ambiance="instruments" className={s.bottom}>
      {open && (
        <div ref={menuRef} id="bottom-more" className={s.bottomMore}>
          {BOTTOM_MORE.map((item) => (
            <Link key={item.href} href={item.href} title={item.description} aria-current={item.href === pathname ? "page" : undefined} className={s.bottomMoreItem}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
      <nav aria-label="Écrans du dossier" className={s.bottomNav}>
        {BOTTOM_PRIMARY.map((item) => (
          <Link key={item.href} href={item.href} aria-current={item.href === pathname ? "page" : undefined} className={s.bottomItem} data-active={item.href === pathname && !open ? "" : undefined}>
            {item.label}
          </Link>
        ))}
        <button
          ref={moreRef}
          type="button"
          aria-expanded={open}
          aria-controls="bottom-more"
          className={s.bottomItem}
          data-active={open || moreActive ? "" : undefined}
          onClick={() => setOpenFor(open ? null : pathname)}
        >
          Plus
        </button>
      </nav>
    </div>
  );
}
