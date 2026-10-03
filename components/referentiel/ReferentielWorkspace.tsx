"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SourceNormative, SourceTheme } from "@/lib/canonical-model";
import { computeScope, countRegistry } from "@/lib/referentiel/view-model";
import { DD, ME, MONO, plexMono } from "./fonts";
import { LibrarySection, type LibraryVariant } from "./LibrarySection";
import { StrataScene } from "./StrataScene";
import type { Registry } from "./themes";
import "./referentiel.css";

export interface SeuilParam {
  label: string;
  value: string;
}

/**
 * Page Référentiel : bibliothèque normative (et non tableau de bord de KPI).
 * Orchestrateur client — possède l'état de filtre unique (recherche, thème,
 * registre, millésime) partagé par l'omnibox, les strates, l'index et la liste.
 */
export function ReferentielWorkspace({
  sources,
  seuils,
  version,
  libraryVariant = "recueil",
  clampCitations = true,
  showStrata = true,
}: {
  sources: SourceNormative[];
  seuils: SeuilParam[];
  version: string;
  libraryVariant?: LibraryVariant;
  clampCitations?: boolean;
  showStrata?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<SourceTheme | "all">("all");
  const [year, setYear] = useState<string | null>(null);
  const [registry, setRegistry] = useState<Registry | "all">("all");
  const [hoverYear, setHoverYear] = useState<string | null>(null);
  const [variant, setVariant] = useState<LibraryVariant | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape") {
        setQuery((q) => (q ? "" : q));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filters = useMemo(() => ({ query, theme, year, registry }), [query, theme, year, registry]);
  const scope = useMemo(() => computeScope(sources, filters), [sources, filters]);

  const total = sources.length;
  const droitDur = countRegistry(sources, "droit-dur");
  const methode = countRegistry(sources, "methode");
  const hasQuery = query.length > 0;
  const activeVariant = variant ?? libraryVariant;

  const reset = () => {
    setQuery("");
    setTheme("all");
    setYear(null);
    setRegistry("all");
  };

  return (
    <div
      className={`rf-root ${plexMono.variable}`}
      style={{ fontFamily: "var(--font-sans), Inter, sans-serif", minHeight: "100%" }}
    >
      <div className="rf-wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 32px 64px" }}>
        <section style={{ animation: "rfRise .45s ease-out both" }}>
          <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 14 }}>
            <h2
              className="rf-h2"
              style={{
                margin: 0,
                fontSize: 34,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: "-.025em",
                color: "#e6edf6",
              }}
            >
              Référentiel normatif
            </h2>
            <span
              title="Version du socle normatif — dates d'effet réelles des textes cités"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                borderRadius: 999,
                border: "1px solid #324563",
                background: "#161d2b",
                padding: "5px 11px",
                fontFamily: MONO,
                fontSize: 12,
                letterSpacing: ".02em",
                color: "#c7d3e4",
                cursor: "help",
              }}
            >
              <span style={{ height: 6, width: 6, borderRadius: 999, background: DD }} />v.{version}
            </span>
          </div>
          <p
            style={{
              margin: "14px 0 0",
              maxWidth: "66ch",
              fontSize: 16,
              lineHeight: 1.62,
              color: "#a9b6c9",
              textWrap: "pretty",
              animation: "rfRise .45s ease-out .07s both",
            }}
          >
            <span
              title={`Sources normatives versionnées dans le référentiel v.${version}`}
              style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, color: "#e6edf6", cursor: "help" }}
            >
              {total}
            </span>{" "}
            sources versionnées fondent les contrôles PROBANT :{" "}
            <span
              title="Textes opposables en mission — LPF, PCG, Code de commerce, CGI"
              style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, color: DD, cursor: "help" }}
            >
              {droitDur}
            </span>{" "}
            textes de droit dur opposables en mission,{" "}
            <span
              title="Normes d'exercice professionnel et méthode interne — non opposables"
              style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, color: ME, cursor: "help" }}
            >
              {methode}
            </span>{" "}
            règles de méthode interne.
          </p>
          <div style={{ marginTop: 18, maxWidth: "76ch", animation: "rfRise .45s ease-out .14s both" }}>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "#6d7d94" }}>
              Les citations sont des paraphrases destinées à l&apos;affichage et ne se substituent pas au texte
              officiel opposable.
              <button
                type="button"
                className="rf-note-btn"
                aria-expanded={noteOpen}
                onClick={() => setNoteOpen((o) => !o)}
                style={{
                  marginLeft: 4,
                  padding: 0,
                  border: 0,
                  background: "none",
                  fontFamily: "inherit",
                  fontSize: 12.5,
                  color: "#8a99af",
                  textDecoration: "underline",
                  textDecorationColor: "#3a4759",
                  textUnderlineOffset: 3,
                  cursor: "pointer",
                }}
              >
                {noteOpen ? "Réduire ↑" : "En savoir plus ↓"}
              </button>
            </p>
            {noteOpen && (
              <p
                style={{
                  margin: "8px 0 0",
                  borderLeft: "2px solid #2c3a50",
                  paddingLeft: 12,
                  fontSize: 12.5,
                  lineHeight: 1.65,
                  color: "#6d7d94",
                  animation: "rfFade .2s ease both",
                }}
              >
                Les seuils chiffrés externes (catégories d&apos;entreprises, nomination CAC…) doivent être
                confrontés au Code de commerce et à ses décrets avant mise en production.
              </p>
            )}
          </div>
        </section>

        <section style={{ marginTop: 36, animation: "rfRise .45s ease-out .21s both" }}>
          <div
            className="rf-search"
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 14,
              height: 56,
              borderRadius: 14,
              border: "1px solid #243044",
              background: "#161d2b",
              padding: "0 16px",
              transition: "border-color .15s ease, box-shadow .15s ease",
            }}
          >
            <svg
              width="18"
              height="18"
              style={{ flexShrink: 0, color: "#6d7d94" }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un article, un thème, un mot-clé…"
              aria-label="Rechercher dans le référentiel"
              style={{
                flex: 1,
                minWidth: 0,
                height: "100%",
                border: 0,
                background: "none",
                outline: "none",
                fontFamily: "var(--font-sans), Inter, sans-serif",
                fontSize: 15,
                color: "#e6edf6",
              }}
            />
            {hasQuery && (
              <button
                type="button"
                className="rf-clear"
                onClick={() => setQuery("")}
                style={{
                  flexShrink: 0,
                  border: 0,
                  background: "none",
                  padding: 4,
                  fontFamily: "inherit",
                  fontSize: 11,
                  color: "#8a99af",
                  cursor: "pointer",
                }}
              >
                effacer ×
              </button>
            )}
            <span
              className="rf-kbd"
              style={{
                flexShrink: 0,
                borderRadius: 6,
                border: "1px solid #2c3a50",
                background: "#1d2738",
                padding: "3px 7px",
                fontFamily: MONO,
                fontSize: 11,
                color: "#8a99af",
              }}
            >
              ⌘K
            </span>
          </div>

          {hasQuery && (
            <div
              role="status"
              style={{
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 10,
                animation: "rfFade .2s ease both",
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: "#e6edf6" }}>
                {scope.searched.length}
              </span>
              <span style={{ fontSize: 13, color: "#8a99af" }}>
                {`${scope.searched.length > 1 ? "résultats pour « " : "résultat pour « "}${query.trim()} »`}
              </span>
            </div>
          )}
        </section>

        {showStrata && !query && (
          <StrataScene
            sources={sources}
            year={year}
            hoverYear={hoverYear}
            onHover={setHoverYear}
            onToggleYear={(y) => setYear((prev) => (prev === y ? null : y))}
          />
        )}

        <LibrarySection
          sources={sources}
          filters={filters}
          scope={scope}
          variant={activeVariant}
          clampDefault={clampCitations}
          version={version}
          onTheme={setTheme}
          onRegistry={(r) => {
            setRegistry((prev) => (prev === r ? "all" : r));
            setTheme("all");
          }}
          onClearYear={() => setYear(null)}
          onVariant={setVariant}
          onReset={reset}
        />

        <section
          style={{ marginTop: 56, borderTop: "1px solid rgba(230,237,246,.08)", paddingTop: 20 }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#a9b6c9" }}>
              Paramètres internes PROBANT
            </h3>
            <span style={{ fontSize: 11, color: "#6d7d94" }}>
              non opposables — hiérarchisent la vigilance, ne fondent aucun constat
            </span>
          </div>
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: "10px 32px" }}>
            {seuils.map((p) => (
              <div key={p.label} style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 11.5, color: "#6d7d94" }}>{p.label}</span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#c7d3e4",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {p.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
