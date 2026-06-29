"use client";

import { useMemo, useState } from "react";
import type { SourceNormative, SourceTheme } from "@/lib/canonical-model";
import { SourceCard } from "./SourceCard";
import { THEME_META, THEME_ORDER } from "./themes";

/**
 * Explorateur interactif : filtres par thème (transitions CSS) + grille de
 * cartes responsive (2 colonnes desktop, 1 mobile). Côté client uniquement
 * pour l'état de filtre ; les données arrivent sérialisées du Server Component.
 */
export function ReferentielExplorer({ sources }: { sources: SourceNormative[] }) {
  const [active, setActive] = useState<SourceTheme | "all">("all");

  const present = useMemo(
    () => THEME_ORDER.filter((t) => sources.some((s) => s.theme === t)),
    [sources],
  );
  const filtered = useMemo(
    () => (active === "all" ? sources : sources.filter((s) => s.theme === active)),
    [sources, active],
  );

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <Pill
          label="Tout"
          count={sources.length}
          hex="#5b9dff"
          active={active === "all"}
          onClick={() => setActive("all")}
        />
        {present.map((t) => (
          <Pill
            key={t}
            label={t}
            count={sources.filter((s) => s.theme === t).length}
            hex={THEME_META[t].hex}
            active={active === t}
            onClick={() => setActive(t)}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {filtered.map((s) => (
          <SourceCard key={s.ref} source={s} />
        ))}
      </div>
    </div>
  );
}

function Pill({
  label,
  count,
  hex,
  active,
  onClick,
}: {
  label: string;
  count: number;
  hex: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
      style={
        active
          ? { borderColor: hex, backgroundColor: `${hex}22`, color: hex }
          : {
              borderColor: "var(--pb-border)",
              color: "var(--pb-text-muted)",
            }
      }
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hex }} />
      {label}
      <span className="tnum opacity-70">{count}</span>
    </button>
  );
}
