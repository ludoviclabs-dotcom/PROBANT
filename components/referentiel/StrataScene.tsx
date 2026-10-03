"use client";

import { useMemo, type CSSProperties } from "react";
import type { SourceNormative } from "@/lib/canonical-model";
import { buildStrata } from "@/lib/referentiel/view-model";
import { DD, ME, MONO } from "./fonts";
import { registryOf } from "./themes";

const COUNT_WORDS = ["Zéro", "Un", "Deux", "Trois", "Quatre", "Cinq", "Six", "Sept", "Huit", "Neuf", "Dix"];

/** Remplissage partagé droit dur / méthode d'un millésime (`pct` = part de droit dur). */
const fillFor = (pct: number, direction: string) =>
  pct === 0
    ? ME
    : pct === 100
      ? DD
      : `linear-gradient(${direction},${DD} 0%,${DD} ${pct}%,${ME} ${pct}%,${ME} 100%)`;

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Chronologie en strates : une strate isométrique par millésime d'entrée en
 * vigueur, épaisseur ∝ nombre de textes, couleur partagée droit dur / méthode.
 * Survol ou clic sur une strate (ou son millésime) pilote le même état de
 * filtre que la bibliothèque.
 */
export function StrataScene({
  sources,
  year,
  hoverYear,
  onHover,
  onToggleYear,
}: {
  sources: SourceNormative[];
  year: string | null;
  hoverYear: string | null;
  onHover: (year: string | null) => void;
  onToggleYear: (year: string) => void;
}) {
  const strata = useMemo(() => buildStrata(sources), [sources]);
  const voletYear = hoverYear || year;
  const voletStratum = voletYear ? strata.find((s) => s.year === voletYear) : undefined;
  const voletSet = voletStratum ? voletStratum.items : sources;
  const voletDd = voletSet.filter((s) => registryOf(s.theme) === "droit-dur").length;
  const voletMe = voletSet.length - voletDd;
  const first = strata[0]?.year;
  const last = strata[strata.length - 1]?.year;

  return (
    <section
      aria-label="Stratigraphie du corpus"
      className="rf-strata"
      style={{
        marginTop: 28,
        display: "flex",
        flexWrap: "wrap",
        gap: 24,
        alignItems: "stretch",
        borderRadius: 16,
        background: "linear-gradient(180deg,#0d131c 0%,#0a0e14 100%)",
        border: "1px solid #1c2635",
        padding: "22px 24px 26px",
        animation: "rfRise .45s ease-out .28s both",
      }}
    >
      <div style={{ flex: "2 1 380px", minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px" }}>
          <h3
            style={{
              margin: 0,
              whiteSpace: "nowrap",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-.005em",
              color: "#c7d3e4",
            }}
          >
            Stratigraphie du corpus
          </h3>
          <span style={{ fontSize: 11.5, color: "#6d7d94" }}>
            une strate par millésime · épaisseur ∝ nombre de textes
          </span>
        </div>

        <div
          className="rf-strata-3d"
          style={{
            position: "relative",
            marginTop: 8,
            height: 340,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            perspective: 1500,
          }}
        >
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 136, zIndex: 2 }}>
            {strata.map((st) => {
              const active = year === st.year;
              return (
                <button
                  key={st.year}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Millésime ${st.year} — ${plural(st.items.length, "texte", "textes")}`}
                  onClick={() => onToggleYear(st.year)}
                  onMouseEnter={() => onHover(st.year)}
                  onMouseLeave={() => onHover(null)}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: st.screenTop,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: 136,
                    padding: "3px 0",
                    border: 0,
                    background: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 13,
                      fontWeight: 600,
                      color: active ? "#e6edf6" : "#a9b6c9",
                    }}
                  >
                    {st.year}
                  </span>
                  <span
                    style={{
                      width: 18,
                      textAlign: "right",
                      fontFamily: MONO,
                      fontSize: 11,
                      color: active ? "#c7d3e4" : "#6d7d94",
                    }}
                  >
                    {st.items.length}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      height: 1,
                      background: active ? "rgba(139,156,255,.55)" : "#222d3f",
                    }}
                  />
                  <span
                    style={{
                      height: 6,
                      width: 6,
                      borderRadius: 2,
                      background: active ? DD : "#2c3a50",
                    }}
                  />
                </button>
              );
            })}
          </div>

          <div
            aria-hidden="true"
            style={{
              position: "relative",
              width: 380,
              height: 184,
              transformStyle: "preserve-3d",
              animation: "rfIdle 22s ease-in-out infinite",
            }}
          >
            {strata.map((st) => {
              const pct = st.pct;
              const fill = fillFor(pct, "105deg");
              return (
                <div
                  key={st.year}
                  style={
                    {
                      position: "absolute",
                      inset: 0,
                      transformStyle: "preserve-3d",
                      "--z": `${st.z}px`,
                      transform: "translateZ(var(--z))",
                      animation: "rfStrataIn .7s cubic-bezier(.22,1,.36,1) both",
                      animationDelay: `${st.delay}ms`,
                    } as CSSProperties
                  }
                >
                  <div
                    className="rf-strata-hit"
                    onMouseEnter={() => onHover(st.year)}
                    onMouseLeave={() => onHover(null)}
                    onClick={() => onToggleYear(st.year)}
                    style={{
                      position: "absolute",
                      inset: 0,
                      transformStyle: "preserve-3d",
                      cursor: "pointer",
                      transition: "transform .3s cubic-bezier(.22,1,.36,1), filter .2s ease",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: 3,
                        background: fill,
                        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.10), 0 26px 46px rgba(0,0,0,.42)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 184,
                        width: 380,
                        height: st.t,
                        background: pct >= 50 ? "#5a68c4" : "#9a7134",
                        borderTop: "1px solid rgba(255,255,255,.14)",
                        transformOrigin: "50% 0%",
                        transform: "rotateX(-90deg)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: 380,
                        top: 0,
                        width: st.t,
                        height: 184,
                        background: pct >= 50 ? "#47539f" : "#7d5a28",
                        borderTop: "1px solid rgba(255,255,255,.10)",
                        transformOrigin: "0% 50%",
                        transform: "rotateY(90deg)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rf-frieze" role="group" aria-label="Millésimes du corpus" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            {strata.map((st) => {
              const active = year === st.year;
              return (
                <button
                  key={st.year}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Millésime ${st.year} — ${plural(st.items.length, "texte", "textes")}`}
                  onClick={() => onToggleYear(st.year)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    minHeight: 44,
                    padding: "6px 0",
                    border: 0,
                    background: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 11, color: active ? "#c7d3e4" : "#6d7d94" }}>
                    {st.items.length}
                  </span>
                  <span
                    style={{
                      display: "block",
                      width: "100%",
                      height: 10 + st.items.length * 7,
                      borderRadius: 3,
                      background: fillFor(st.pct, "to top"),
                      opacity: active || !year ? 1 : 0.55,
                      boxShadow: active
                        ? `0 0 0 1px ${DD}, 0 0 0 4px rgba(139,156,255,.18)`
                        : "inset 0 0 0 1px rgba(255,255,255,.10)",
                      transition: "opacity .2s ease, box-shadow .2s ease",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 12,
                      fontWeight: 600,
                      color: active ? "#e6edf6" : "#a9b6c9",
                    }}
                  >
                    {st.year}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="rf-volet"
        style={{
          flex: "1 1 250px",
          minWidth: 0,
          borderLeft: "1px solid #1c2635",
          paddingLeft: 22,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".09em", color: "#5c6b82" }}>
            {voletYear ? `Millésime ${voletYear}` : "Lecture de la coupe"}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#5c6b82" }}>
            {plural(voletSet.length, "texte", "textes")}
          </span>
        </div>

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ height: 10, width: 22, flexShrink: 0, borderRadius: 2, background: DD }} />
            <span style={{ flex: 1, fontSize: 12, color: "#a9b6c9" }}>Droit dur · opposable</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#c7d3e4", fontVariantNumeric: "tabular-nums" }}>
              {voletDd}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ height: 10, width: 22, flexShrink: 0, borderRadius: 2, background: ME }} />
            <span style={{ flex: 1, fontSize: 12, color: "#a9b6c9" }}>Méthode interne</span>
            <span style={{ fontFamily: MONO, fontSize: 12, color: "#c7d3e4", fontVariantNumeric: "tabular-nums" }}>
              {voletMe}
            </span>
          </div>
        </div>

        <div style={{ marginTop: 16, height: 1, background: "#1c2635" }} />

        {!voletStratum && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "#8a99af" }}>
              {COUNT_WORDS[strata.length] ?? strata.length} millésimes d&apos;entrée en vigueur se déposent de{" "}
              {first} à {last}. L&apos;épaisseur d&apos;une strate vaut pour le nombre de textes entrés en vigueur
              cette année-là.
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "#6d7d94" }}>
              Survolez une strate ou un millésime pour lire son détail, cliquez pour filtrer la bibliothèque.
            </p>
          </div>
        )}

        {voletStratum && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 9 }}>
            {voletStratum.items.map((s) => {
              const dd = registryOf(s.theme) === "droit-dur";
              return (
                <div key={s.ref} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <span
                    style={{
                      marginTop: 5,
                      height: 11,
                      width: 3,
                      flexShrink: 0,
                      borderRadius: 2,
                      background: dd ? DD : ME,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: MONO, fontSize: 12.5, color: "#dce5f1" }}>{s.ref}</div>
                    <div style={{ fontSize: 11, color: "#6d7d94" }}>
                      {dd ? "Droit dur · opposable" : "Méthode interne"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
