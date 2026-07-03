"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ModeTabDef = {
  id: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  color: string;
  content: ReactNode;
  hidden?: boolean;
};

type ModeTabsProps = {
  tabs: ModeTabDef[];
  activeId: string;
  onChange: (id: string) => void;
};

export function ModeTabs({ tabs, activeId, onChange }: ModeTabsProps) {
  const visibleTabs = tabs.filter((tab) => !tab.hidden);
  const activeTab =
    visibleTabs.find((tab) => tab.id === activeId) ?? visibleTabs[0];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {visibleTabs.map((tab) => {
          const isActive = tab.id === activeTab?.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 transition-colors",
                isActive
                  ? "border-current"
                  : "border-transparent text-[var(--pb-text-muted)] hover:bg-white/[0.03]"
              )}
              style={
                isActive
                  ? {
                      backgroundColor: `color-mix(in srgb, ${tab.color} 13%, transparent)`,
                      borderColor: tab.color,
                      color: tab.color,
                    }
                  : undefined
              }
            >
              <Icon className="h-4 w-4" />
              <span className="text-[13px] font-semibold">{tab.label}</span>
              <span
                className={cn(
                  "text-[11px]",
                  !isActive && "text-[var(--pb-text-faint)]"
                )}
              >
                {tab.desc}
              </span>
            </button>
          );
        })}
      </div>
      <div
        key={activeTab?.id}
        className="mt-3"
        style={{ animation: "pbFadeIn 200ms ease-out" }}
      >
        {activeTab?.content}
      </div>
    </div>
  );
}
