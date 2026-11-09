"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { buildSearchIndex, searchCycles } from "@/lib/audit-cycles/search";
import { CYCLE_FAMILY_LABEL, type CycleSearchItem } from "@/lib/audit-cycles/types";
import p from "@/components/charte/page.module.css";
import n from "./normatif.module.css";

/**
 * Recherche plein texte dans les cycles (Fuse.js, index construit dans le navigateur). Les résultats sont des
 * liens ordinaires : Tab les parcourt, Flèche bas y entre depuis le champ, Échap referme la liste.
 */
export function SearchBar({ cycles }: { cycles: CycleSearchItem[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const inputId = useId();
  const listId = useId();

  const index = useMemo(() => buildSearchIndex(cycles), [cycles]);
  const results = useMemo(() => searchCycles(query, index, 8), [query, index]);
  const show = open && query.trim().length > 0;

  return (
    <div
      className={n.search}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.focus();
        }
      }}
    >
      <label htmlFor={inputId} className={`${p.key} ${n.searchLabel}`}>
        Rechercher un cycle, une norme, un compte
      </label>
      <svg className={n.searchIcon} width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx={7} cy={7} r={5} strokeWidth={1.4} style={{ fill: "none", stroke: "currentColor" }} />
        <path d="M11 11l3.5 3.5" strokeWidth={1.4} style={{ stroke: "currentColor" }} />
      </svg>
      <input
        id={inputId}
        type="search"
        value={query}
        autoComplete="off"
        aria-controls={show ? listId : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && show) {
            e.preventDefault();
            listRef.current?.querySelector("a")?.focus();
          }
        }}
        placeholder="ISA 240, DSO, 411, stocks…"
        className={n.searchInput}
      />
      {show ? (
        <ul
          id={listId}
          ref={listRef}
          className={n.searchResults}
          // Garde le focus dans le champ pendant le clic : Safari ne focalise pas un lien cliqué, la liste se
          // refermerait (blur) avant que le clic n'aboutisse.
          onMouseDown={(e) => e.preventDefault()}
          aria-label={`${results.length} résultat${results.length > 1 ? "s" : ""}`}
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const links = [...(listRef.current?.querySelectorAll("a") ?? [])];
            const at = links.indexOf(document.activeElement as HTMLAnchorElement);
            const next = e.key === "ArrowDown" ? Math.min(at + 1, links.length - 1) : at - 1;
            if (next < 0) (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement | null)?.focus();
            else links[next]?.focus();
          }}
        >
          {results.length === 0 ? (
            <li className={n.searchResult}>Aucun cycle ne correspond à « {query} ».</li>
          ) : (
            results.map((r) => (
              <li key={r.slug}>
                <Link href={`/normatif/cycles/${r.slug}`} className={n.searchResult}>
                  <span>{r.title}</span>
                  <small>{r.pcgAccounts.slice(0, 3).join(" · ")}</small>
                  <small>{CYCLE_FAMILY_LABEL[r.family]}</small>
                </Link>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
