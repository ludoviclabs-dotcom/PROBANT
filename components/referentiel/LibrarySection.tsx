"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { SourceNormative, SourceTheme } from "@/lib/canonical-model";
import {
  countRegistry,
  groupByFamily,
  themeCounts,
  type LibraryFilters,
  type LibraryScope,
} from "@/lib/referentiel/view-model";
import { DD, ME, MONO } from "./fonts";
import { registryOf, type Registry } from "./themes";

export type LibraryVariant = "recueil" | "marginalia";

/** Seuil (caractères) au-delà duquel une paraphrase est repliée à 2 lignes. */
const LONG_CITATION = 150;
const REGISTRY_LABEL: Record<Registry, string> = { "droit-dur": "Opposable", methode: "Méthode interne" };
const FALLBACK_URL = "https://www.legifrance.gouv.fr/";

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

interface EntryProps {
  source: SourceNormative;
  clampDefault: boolean;
  open: boolean;
  copied: boolean;
  onToggle: () => void;
  onCopy: () => void;
}

/**
 * Index des thèmes + registre (colonne sticky) et bibliothèque (recueil ou
 * marginalia). L'état de filtre unique vit dans le parent : thème, registre,
 * millésime et recherche pilotent ensemble index, strates et liste.
 */
export function LibrarySection({
  sources,
  filters,
  scope,
  variant,
  clampDefault,
  version,
  onTheme,
  onRegistry,
  onClearYear,
  onVariant,
  onReset,
}: {
  sources: SourceNormative[];
  filters: LibraryFilters;
  scope: LibraryScope;
  variant: LibraryVariant;
  clampDefault: boolean;
  version: string;
  onTheme: (theme: SourceTheme | "all") => void;
  onRegistry: (registry: Registry) => void;
  onClearYear: () => void;
  onVariant: (variant: LibraryVariant) => void;
  onReset: () => void;
}) {
  const { searched, regScope, filtered } = scope;
  const [openRefs, setOpenRefs] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const copy = (source: SourceNormative) => {
    const text = `${source.ref} — v.${source.effectiveDate}`;
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    setCopied(source.ref);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1600);
  };

  const counts = useMemo(() => themeCounts(regScope), [regScope]);
  const maxN = Math.max(1, ...counts.map((c) => c.n));
  const groups = useMemo(() => groupByFamily(filtered), [filtered]);

  const indexRows = [
    { label: "Tous", theme: "all" as const, n: regScope.length, pct: 100, registry: "droit-dur" as Registry },
    ...counts.map((c) => ({
      label: c.theme as string,
      theme: c.theme as SourceTheme | "all",
      n: c.n,
      pct: (c.n / maxN) * 100,
      registry: c.registry,
    })),
  ];

  const registryRows: { key: Registry; label: string; color: string }[] = [
    { key: "droit-dur", label: "Droit dur · opposable", color: DD },
    { key: "methode", label: "Méthode interne", color: ME },
  ];

  const scopeLabel =
    filters.theme !== "all"
      ? filters.theme
      : filters.registry === "droit-dur"
        ? "Droit dur"
        : filters.registry === "methode"
          ? "Méthode interne"
          : "La bibliothèque";

  const entryProps = (source: SourceNormative): EntryProps => ({
    source,
    clampDefault,
    open: !!openRefs[source.ref] || !clampDefault,
    copied: copied === source.ref,
    onToggle: () => setOpenRefs((st) => ({ ...st, [source.ref]: !st[source.ref] })),
    onCopy: () => copy(source),
  });

  return (
    <section style={{ marginTop: 40, display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
      <div className="rf-index" style={{ flex: "1 1 240px", maxWidth: 300, position: "sticky", top: 24 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".09em", color: "#5c6b82" }}>
          Index des thèmes
        </div>
        <div className="rf-index-list" style={{ marginTop: 12, display: "flex", flexDirection: "column" }}>
          {indexRows.map((r) => {
            const active = filters.theme === r.theme;
            const color = r.registry === "methode" ? ME : DD;
            return (
              <button
                key={r.theme}
                type="button"
                className="rf-row"
                aria-pressed={active}
                onClick={() => onTheme(r.theme)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: 0,
                  borderLeft: `2px solid ${active ? color : "transparent"}`,
                  background: active ? "rgba(139,156,255,.08)" : "transparent",
                  padding: "8px 10px 9px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background .15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    className="rf-row-label"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 13,
                      color: active ? "#e6edf6" : "#a9b6c9",
                    }}
                  >
                    {r.label}
                  </span>
                  <span
                    style={{ width: 54, flexShrink: 0, height: 3, borderRadius: 2, background: "#1a2233" }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: "100%",
                        borderRadius: 2,
                        width: `${r.pct}%`,
                        background: active
                          ? color
                          : r.registry === "methode"
                            ? "rgba(209,154,74,.55)"
                            : "rgba(139,156,255,.5)",
                        transition: "width .25s ease",
                      }}
                    />
                  </span>
                  <span
                    style={{
                      width: 20,
                      flexShrink: 0,
                      textAlign: "right",
                      fontFamily: MONO,
                      fontSize: 12,
                      color: active ? "#e6edf6" : "#6d7d94",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {r.n}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".09em", color: "#5c6b82" }}>
            Registre
          </div>
          <div className="rf-index-list" style={{ marginTop: 10, display: "flex", flexDirection: "column" }}>
            {registryRows.map((g) => {
              const active = filters.registry === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  className="rf-row"
                  aria-pressed={active}
                  onClick={() => onRegistry(g.key)}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 10,
                    border: 0,
                    borderLeft: `2px solid ${active ? g.color : "transparent"}`,
                    background: active ? "rgba(139,156,255,.08)" : "transparent",
                    padding: "9px 10px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    transition: "background .15s ease",
                  }}
                >
                  <span style={{ height: 10, width: 14, flexShrink: 0, borderRadius: 2, background: g.color }} />
                  <span
                    className="rf-row-label"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 13,
                      color: active ? "#e6edf6" : "#a9b6c9",
                    }}
                  >
                    {g.label}
                  </span>
                  <span
                    style={{
                      width: 20,
                      flexShrink: 0,
                      textAlign: "right",
                      fontFamily: MONO,
                      fontSize: 12,
                      color: active ? "#e6edf6" : "#6d7d94",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {countRegistry(searched, g.key)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {filters.year && (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
              borderRadius: 8,
              border: "1px solid #2c3a50",
              background: "#141b27",
              padding: "8px 10px",
            }}
          >
            <span style={{ fontSize: 11, color: "#8a99af" }}>Millésime</span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: "#e6edf6" }}>
              {filters.year}
            </span>
            <button
              type="button"
              className="rf-year-clear"
              aria-label={`Retirer le filtre millésime ${filters.year}`}
              onClick={onClearYear}
              style={{
                marginLeft: "auto",
                border: 0,
                background: "none",
                padding: 0,
                fontFamily: "inherit",
                fontSize: 11,
                color: "#8a99af",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: "3 1 460px", minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "10px 16px",
            paddingBottom: 12,
            borderBottom: "1px solid rgba(230,237,246,.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h3
              style={{
                margin: 0,
                whiteSpace: "nowrap",
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "-.005em",
                color: "#c7d3e4",
              }}
            >
              {scopeLabel}
            </h3>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#6d7d94" }}>
              {plural(filtered.length, "entrée", "entrées")}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              borderRadius: 8,
              border: "1px solid #243044",
              padding: 2,
            }}
          >
            {(
              [
                ["recueil", "Recueil"],
                ["marginalia", "Marginalia"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={variant === key}
                onClick={() => onVariant(key)}
                style={{
                  border: 0,
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontFamily: "inherit",
                  fontSize: 11.5,
                  cursor: "pointer",
                  background: variant === key ? "rgba(139,156,255,.16)" : "transparent",
                  color: variant === key ? "#c3ccff" : "#8a99af",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {variant === "recueil" && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {filtered.map((s) => (
              <RecueilEntry key={s.ref} {...entryProps(s)} />
            ))}
          </div>
        )}

        {variant === "marginalia" && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {groups.map((g) => (
              <div key={g.family} style={{ paddingTop: 22 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, paddingBottom: 8 }}>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: ".09em",
                      textTransform: "uppercase",
                      color: "#5c6b82",
                    }}
                  >
                    {g.family}
                  </span>
                  <span style={{ flex: 1, height: 1, background: "rgba(230,237,246,.08)" }} />
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "#5c6b82" }}>{g.items.length}</span>
                </div>
                {g.items.map((s) => (
                  <MarginaliaEntry key={s.ref} {...entryProps(s)} />
                ))}
              </div>
            ))}
          </div>
        )}

        {filtered.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 12px 4px" }}>
            <span style={{ flex: 1, height: 1, background: "rgba(230,237,246,.08)" }} />
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".04em", color: "#5c6b82" }}>
              {`fin · ${plural(filtered.length, "entrée", "entrées")} · référentiel v.${version}`}
            </span>
            <span style={{ flex: 1, height: 1, background: "rgba(230,237,246,.08)" }} />
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ padding: "48px 12px", textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 15, color: "#a9b6c9" }}>
              {`Aucun texte ne correspond — ${sources.length} sources dans le référentiel v.${version}`}
            </p>
            <button
              type="button"
              className="rf-reset"
              onClick={onReset}
              style={{
                marginTop: 14,
                border: "1px solid #324563",
                borderRadius: 8,
                background: "#161d2b",
                padding: "8px 14px",
                fontFamily: "inherit",
                fontSize: 12.5,
                color: "#c7d3e4",
                cursor: "pointer",
              }}
            >
              Réinitialiser
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function entryMeta(source: SourceNormative) {
  const reg = registryOf(source.theme);
  return {
    color: reg === "droit-dur" ? DD : ME,
    registryLabel: REGISTRY_LABEL[reg],
    url: source.url || FALLBACK_URL,
    long: source.citation.length > LONG_CITATION,
  };
}

function RecueilEntry({ source, clampDefault, open, copied, onToggle, onCopy }: EntryProps) {
  const { color, registryLabel, url, long } = entryMeta(source);
  const clamped = !open && long;
  return (
    <div
      className="rf-entry"
      style={{
        display: "flex",
        gap: 16,
        borderBottom: "1px solid rgba(230,237,246,.08)",
        padding: "18px 14px 18px 12px",
        borderRadius: 8,
        transition: "background .15s ease, transform .15s ease",
      }}
    >
      <span style={{ width: 3, flexShrink: 0, borderRadius: 2, background: color }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: MONO,
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: "-.01em",
              color: "#e6edf6",
            }}
          >
            {source.ref}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontFamily: MONO,
              fontSize: 11.5,
              color: "#8a99af",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {`v.${source.effectiveDate}`}
          </span>
        </div>
        <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11.5, fontWeight: 500, color }}>{registryLabel}</span>
          <span style={{ height: 3, width: 3, borderRadius: 2, background: "#3a4759" }} />
          <span style={{ fontSize: 11.5, color: "#8a99af" }}>{source.theme}</span>
        </div>
        {clamped && (
          <p
            style={{
              margin: "9px 0 0",
              fontSize: 13.5,
              lineHeight: 1.62,
              color: "#a9b6c9",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {source.citation}
          </p>
        )}
        {(open || !long) && (
          <p
            style={{
              margin: "9px 0 0",
              fontSize: 13.5,
              lineHeight: 1.62,
              color: "#a9b6c9",
              textWrap: "pretty",
            }}
          >
            {source.citation}
          </p>
        )}
        <div style={{ marginTop: 9, display: "flex", alignItems: "center", gap: 16 }}>
          {long && clampDefault && (
            <button
              type="button"
              className="rf-more"
              aria-expanded={open}
              onClick={onToggle}
              style={{
                border: 0,
                background: "none",
                padding: 0,
                fontFamily: "inherit",
                fontSize: 11.5,
                color: "#8b9cff",
                cursor: "pointer",
              }}
            >
              {open ? "Réduire" : "Voir plus"}
            </button>
          )}
          <div className="rf-acts" style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              type="button"
              className="rf-copy"
              onClick={onCopy}
              style={{
                border: 0,
                background: "none",
                padding: 0,
                fontFamily: "inherit",
                fontSize: 11.5,
                color: "#8a99af",
                cursor: "pointer",
              }}
            >
              {copied ? "Référence copiée" : "Copier la référence"}
            </button>
            <a
              className="rf-src"
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11.5, color: "#8a99af" }}
            >
              Source ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarginaliaEntry({ source, copied, onCopy }: EntryProps) {
  const { color, registryLabel, url } = entryMeta(source);
  return (
    <div
      className="rf-marg"
      style={{
        display: "grid",
        gridTemplateColumns: "186px minmax(0,1fr)",
        gap: 20,
        padding: "16px 12px",
        borderRadius: 8,
        transition: "background .15s ease",
      }}
    >
      <div
        className="rf-marg-meta"
        style={
          {
            "--c": color,
            borderRight: `3px solid ${color}`,
            paddingRight: 16,
            textAlign: "right",
          } as CSSProperties
        }
      >
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: "#e6edf6" }}>
          {source.ref}
        </div>
        <div
          style={{
            marginTop: 4,
            fontFamily: MONO,
            fontSize: 11.5,
            color: "#8a99af",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {`v.${source.effectiveDate}`}
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 500, color }}>{registryLabel}</div>
        <div style={{ marginTop: 2, fontSize: 11, color: "#6d7d94" }}>{source.theme}</div>
        <div
          className="rf-acts"
          style={{ marginTop: 8, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}
        >
          <button
            type="button"
            className="rf-copy"
            onClick={onCopy}
            style={{
              border: 0,
              background: "none",
              padding: 0,
              fontFamily: "inherit",
              fontSize: 11,
              color: "#8a99af",
              cursor: "pointer",
            }}
          >
            {copied ? "Référence copiée" : "Copier la référence"}
          </button>
          <a className="rf-src" href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#8a99af" }}>
            Source ↗
          </a>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.68, color: "#b9c5d6", textWrap: "pretty" }}>
        {source.citation}
      </p>
    </div>
  );
}
