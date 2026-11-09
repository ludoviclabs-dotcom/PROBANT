"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { VeilleGlyph } from "./VeilleMarks";
import n from "./normatif.module.css";

const NAV = [
  { href: "/normatif", label: "Vue d'ensemble", exact: true },
  { href: "/normatif/cycles", label: "Cycles d'audit" },
  { href: "/normatif/sources", label: "Sources normatives" },
  { href: "/normatif/methodologie", label: "Méthodologie" },
  { href: "/normatif/veille", label: "Veille" },
  { href: "/normatif/export", label: "Export" },
] as const;

/**
 * Onglets du module, sans tiroir : repliés sur plusieurs lignes au-delà de 560 px, sur une seule ligne qui défile
 * en dessous (l'onglet courant est ramené dans le cadre). La page courante porte `aria-current="page"` et un filet
 * bleu de vérification.
 * `veilleOpen` : évolutions en vigueur non intégrées, annoncées à côté de « Veille ».
 */
export function NormatifNav({ veilleOpen }: { veilleOpen: number }) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  // Ligne d'onglets défilante (moins de 560 px) : l'onglet courant est ramené dans le cadre, sans défilement vertical.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !current || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
  }, [pathname]);
  return (
    <nav aria-label="Audit Normatif 360" className={n.nav}>
      <ul ref={listRef} className={n.navList}>
        {NAV.map((item) => {
          const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={n.navLink}>
                {item.label}
                {item.href === "/normatif/veille" && veilleOpen > 0 ? (
                  <span className={n.navCount}>
                    <VeilleGlyph glyph="sq-fill" size={8} />
                    {veilleOpen}
                    <span className="sr-only"> évolution{veilleOpen > 1 ? "s" : ""} en vigueur à reprendre</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
