"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import { DemoLauncher } from "@/components/probant/DemoLauncher";
import { Logo } from "@/components/charte/Logo";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { NAV_ITEMS } from "./nav";
import s from "./shell.module.css";

const ITEM_HEIGHT = 44;

export interface RailBadge {
  count: number;
  /** Les alertes bloquantes portent le glyphe de gravité ; un simple compteur n'en porte pas. */
  blocking?: boolean;
}

/**
 * Rail des écrans du dossier (dès 760 px) : texte et indicateur de position, sans icônes. Le trait de position
 * glisse en 200 ms. Les compteurs viennent du dossier (alertes bloquantes d'admissibilité, constats) et sont
 * doublés d'un glyphe quand ils signalent un blocage ; la couleur ne porte jamais l'information seule.
 */
export function InstrumentRail({ badges, version }: { badges: Partial<Record<string, RailBadge>>; version: ReactNode }) {
  const pathname = usePathname();
  const current = NAV_ITEMS.findIndex((item) => item.href === pathname);

  return (
    <nav aria-label="Écrans du dossier" data-ambiance="instruments" className={s.rail}>
      <Link href="/dashboard/synthese" aria-label="PROBANT" className={s.railBrand}>
        <Logo size="sm" />
      </Link>
      <div className={s.railList}>
        <div aria-hidden="true" className={s.railTrack} />
        {current >= 0 && <div aria-hidden="true" className={s.railIndicator} style={{ transform: `translateY(${current * ITEM_HEIGHT}px)` }} />}
        <ul>
          {NAV_ITEMS.map((item, i) => {
            const badge = badges[item.href];
            const active = i === current;
            return (
              <li key={item.href}>
                <Link href={item.href} title={item.description} aria-current={active ? "page" : undefined} className={s.railItem} data-active={active ? "" : undefined}>
                  <span className={s.railIndex}>{String(i + 1).padStart(2, "0")}</span>
                  <span className={s.railLabel}>{item.label}</span>
                  {badge ? (
                    <span className={s.railBadge}>
                      {badge.blocking && <SeverityGlyph severity="bloquant" />}
                      {badge.count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className={s.railFoot}>
        <DemoLauncher className={s.railTour}>
          <span>Visite guidée</span>
          <span className={s.railTourMeta}>95 s</span>
        </DemoLauncher>
        <span className={s.railVersion}>{version}</span>
      </div>
    </nav>
  );
}
