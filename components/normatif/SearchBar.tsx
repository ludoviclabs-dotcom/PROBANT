"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { buildSearchIndex, searchCycles } from "@/lib/audit-cycles/search";
import { CYCLE_FAMILY_LABEL, type CycleSearchItem } from "@/lib/audit-cycles/types";

export function SearchBar({ cycles }: { cycles: CycleSearchItem[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const index = useMemo(() => buildSearchIndex(cycles), [cycles]);
  const results = useMemo(
    () => searchCycles(query, index, 8),
    [query, index],
  );

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--pb-text-faint)]" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Rechercher un cycle, une norme, un compte… (ex. ISA 240, DSO, 411, stocks)"
          className="w-full rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface-2)] py-3 pl-10 pr-4 text-[13px] text-[var(--pb-text)] placeholder:text-[var(--pb-text-faint)] focus:border-[var(--pb-border-strong)] focus:outline-none focus:ring-1 focus:ring-[var(--pb-accent)]/50"
        />
      </div>

      {open && query.trim() && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] shadow-2xl">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-[var(--pb-text-faint)]">
              Aucun cycle ne correspond à « {query} ».
            </div>
          ) : (
            results.map((r) => (
              <Link
                key={r.slug}
                href={`/normatif/cycles/${r.slug}`}
                className="flex items-center gap-3 border-b border-[var(--pb-border)]/50 px-4 py-2.5 text-[13px] last:border-0 hover:bg-[var(--pb-surface-2)]"
              >
                <span className="flex-1 truncate font-medium text-[var(--pb-text)]">
                  {r.title}
                </span>
                <span className="shrink-0 text-[10px] text-[var(--pb-text-faint)]">
                  {CYCLE_FAMILY_LABEL[r.family]}
                </span>
                {r.pcgAccounts.length > 0 && (
                  <code className="tnum shrink-0 rounded bg-[var(--pb-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--pb-text-muted)]">
                    {r.pcgAccounts.slice(0, 3).join(" ")}
                  </code>
                )}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
