"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import x from "./depot.module.css";

export type ModeTabDef = {
  id: string;
  label: string;
  desc: string;
  content: ReactNode;
  hidden?: boolean;
};

type ModeTabsProps = {
  tabs: ModeTabDef[];
  activeId: string;
  onChange: (id: string) => void;
  /** Nom accessible de la liste d'onglets. */
  label: string;
};

/**
 * Onglets textuels du dépôt (Mon fichier, Simulation, Par cycle) : soulignés en bleu de vérification quand ils sont
 * actifs, sans icône ni couleur par onglet. Motif ARIA « tabs » : flèches gauche/droite, Début et Fin déplacent le
 * focus et activent l'onglet ; seul l'onglet actif est dans l'ordre de tabulation.
 */
export function ModeTabs({ tabs, activeId, onChange, label }: ModeTabsProps) {
  const base = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const visibleTabs = tabs.filter((tab) => !tab.hidden);
  const activeTab = visibleTabs.find((tab) => tab.id === activeId) ?? visibleTabs[0];

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = visibleTabs.length - 1;
    const next =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    const target = visibleTabs[next];
    onChange(target.id);
    refs.current.get(target.id)?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className={x.tabs}>
        {visibleTabs.map((tab, index) => {
          const selected = tab.id === activeTab?.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) refs.current.set(tab.id, el);
                else refs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              className={x.tab}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className={x.tabLabel}>{tab.label}</span>
              <span className={x.tabDesc}>{tab.desc}</span>
            </button>
          );
        })}
      </div>
      {activeTab && (
        <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${activeTab.id}`} className={x.tabPanel}>
          {activeTab.content}
        </div>
      )}
    </div>
  );
}
