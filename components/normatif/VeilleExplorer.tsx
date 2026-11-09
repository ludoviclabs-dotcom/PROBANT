"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  EVOLUTION_ACCESS_LABEL,
  EVOLUTION_GROUPS,
  EVOLUTION_KIND_LABEL,
  INTEGRATION_LABEL,
  TIMING_LABEL,
  daysBetween,
  isOpen,
  type EvolutionView,
} from "@/lib/audit-cycles/veille";
import { prefersReducedMotion } from "@/components/charte/motion";
import p from "@/components/charte/page.module.css";
import { EvolutionMark, VeilleGlyph, formatDate, formatShortDate, timingGlyph } from "./VeilleMarks";
import n from "./normatif.module.css";

const LANE_W = 168;
const ROW_H = 30;
const CHAR_W = 7.4;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Années montrées avant la date d'arrêté ; les évolutions plus anciennes passent dans une bande à part. */
const YEARS_BEFORE = 3;

/**
 * Frise de la veille : une ligne par autorité (audit, IFRS, France, UE), chaque évolution posée à sa date d'effet,
 * la date d'arrêté marquée d'un filet bleu. Carré plein = déjà en vigueur et pas encore intégré ; carré contour =
 * à venir ; losange = sans date d'effet. Choisir un repère (clic, Entrée) ouvre son détail dans le panneau.
 * Sous 820 px de contenu, la frise devient une liste chronologique (même choix, même panneau).
 */
export function VeilleExplorer({ evolutions, arreteAu }: { evolutions: EvolutionView[]; arreteAu: string }) {
  const startYear = useMemo(() => {
    const first = Math.min(...evolutions.filter((e) => e.effectiveFrom).map((e) => Number(e.effectiveFrom!.slice(0, 4))), Number(arreteAu.slice(0, 4)));
    return Math.max(first, Number(arreteAu.slice(0, 4)) - YEARS_BEFORE);
  }, [evolutions, arreteAu]);
  const dated = evolutions.filter((e) => e.effectiveFrom && Number(e.effectiveFrom.slice(0, 4)) >= startYear);
  const earlier = evolutions.filter((e) => e.effectiveFrom && Number(e.effectiveFrom.slice(0, 4)) < startYear);
  const undated = evolutions.filter((e) => !e.effectiveFrom);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => evolutions.find((e) => e.timing === "en_vigueur" && isOpen(e.integration))?.id ?? evolutions[0]?.id ?? null,
  );
  const sectionRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // Lien profond depuis une fiche cycle ou une source : ?evolution=<id>.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("evolution");
    if (wanted && evolutions.some((e) => e.id === wanted)) {
      setSelectedId(wanted);
      sectionRef.current?.scrollIntoView({ block: "start" });
    }
  }, [evolutions]);

  const select = (id: string) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("evolution", id);
    window.history.replaceState(window.history.state, "", url);
    // Disposition empilée (moins de 1180 px de contenu) : le panneau est sous la frise ou sous la liste, hors de
    // l'écran. On l'amène à l'écran et on lui donne le focus (le clavier n'a sinon aucun moyen d'y arriver sans
    // parcourir tous les repères). Côte à côte, le panneau est collant et reste visible : le focus ne bouge pas.
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || getComputedStyle(panel).position === "sticky") return;
      panel.focus({ preventScroll: true });
      panel.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  };
  const selected = evolutions.find((e) => e.id === selectedId) ?? null;

  // Domaine : du 1er janvier de la première année au 1er janvier suivant la dernière (dates et arrêté inclus).
  const years = useMemo(() => {
    const ys = [...dated.map((e) => Number(e.effectiveFrom!.slice(0, 4))), Number(arreteAu.slice(0, 4))];
    const to = Math.max(...ys);
    return Array.from({ length: to - startYear + 1 }, (_, i) => startYear + i);
  }, [dated, arreteAu, startYear]);
  const start = `${years[0]}-01-01`;
  const end = `${years[years.length - 1] + 1}-01-01`;
  const span = daysBetween(start, end);
  const x = (date: string) => (daysBetween(start, date) / span) * 100;

  // Largeur réelle de la piste, pour empiler les libellés sans chevauchement.
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackW, setTrackW] = useState(900);
  useIsoLayoutEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setTrackW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lanes = useMemo(
    () =>
      EVOLUTION_GROUPS.map((g) => {
        const items = dated
          .filter((e) => e.group === g.id)
          .sort((a, b) => a.effectiveFrom!.localeCompare(b.effectiveFrom!) || a.short.localeCompare(b.short, "fr"));
        const rowEnds: number[] = [];
        const placed = items.map((e) => {
          const left = (x(e.effectiveFrom!) / 100) * trackW;
          const width = 20 + e.short.length * CHAR_W;
          let row = rowEnds.findIndex((end) => end + 10 <= left);
          if (row === -1) {
            row = rowEnds.length;
            rowEnds.push(0);
          }
          rowEnds[row] = left + width;
          return { e, row };
        });
        return { ...g, placed, rows: Math.max(1, rowEnds.length) };
      }).filter((l) => l.placed.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x dépend de start/span, eux-mêmes dérivés de `years`
    [dated, trackW, years],
  );
  const todayX = x(arreteAu);
  let order = 0;

  return (
    <div ref={sectionRef} className={n.veilleSplit}>
      <div>
        {/* Frise (contenu large). */}
        <div className={n.friseWide}>
          <div
            className={n.frise}
            style={{ ["--lane-w" as string]: `${LANE_W}px`, ["--year-w" as string]: `${100 / years.length}%` }}
            role="group"
            aria-label={`Frise des évolutions normatives, de ${years[0]} à ${years[years.length - 1]}`}
          >
            <div className={n.friseAxis} aria-hidden="true">
              {years.map((y) => (
                <span key={y}>
                  <span className={n.friseTick} style={{ left: `${x(`${y}-01-01`)}%` }} />
                  <span className={n.friseYear} style={{ left: `${x(`${y}-07-01`)}%` }}>
                    {y}
                  </span>
                </span>
              ))}
            </div>
            {lanes.map((lane, li) => (
              <div key={lane.id} className={n.lane}>
                <div className={n.laneLabel}>{lane.label}</div>
                <div
                  ref={li === 0 ? trackRef : undefined}
                  className={n.laneTrack}
                  style={{ minHeight: lane.rows * ROW_H + 12 + (li === 0 ? 14 : 0) }}
                >
                  <span className={n.today} style={{ left: `${todayX}%` }}>
                    {li === 0 ? <span className={n.todayLabel}>Arrêté {formatShortDate(arreteAu)}</span> : null}
                  </span>
                  {lane.placed.map(({ e, row }) => (
                    <button
                      key={e.id}
                      type="button"
                      className={n.event}
                      aria-pressed={selectedId === e.id}
                      aria-label={`${e.short} — ${e.title}. ${TIMING_LABEL[e.timing]} le ${formatDate(e.effectiveFrom!)}, ${INTEGRATION_LABEL[e.integration].toLowerCase()}.`}
                      onClick={() => select(e.id)}
                      style={{
                        left: `${x(e.effectiveFrom!)}%`,
                        top: 6 + row * ROW_H + (li === 0 ? 14 : 0),
                        animationDelay: `${200 + order++ * 45}ms`,
                      }}
                    >
                      <VeilleGlyph glyph={timingGlyph(e.timing, e.integration)} size={12} />
                      <span>{e.short}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {[
            { key: "earlier", label: `Antérieures à ${startYear}`, items: earlier },
            { key: "undated", label: "Sans date d'effet", items: undated },
          ].map((strip) =>
            strip.items.length > 0 ? (
              <div key={strip.key} className={p.toolbar} style={{ marginTop: strip.key === "earlier" ? 16 : 0, borderTop: strip.key === "earlier" ? undefined : 0 }}>
                <span className={p.key}>{strip.label}</span>
                {strip.items.map((e) => (
                  <button key={e.id} type="button" className={p.toggle} aria-pressed={selectedId === e.id} onClick={() => select(e.id)}>
                    <span className={n.statusMark}>
                      <VeilleGlyph glyph={timingGlyph(e.timing, e.integration)} />
                      {e.short}
                    </span>
                  </button>
                ))}
              </div>
            ) : null,
          )}
        </div>

        {/* Liste chronologique (contenu étroit). */}
        <ol className={`${n.friseNarrow} ${n.friseList}`} aria-label="Évolutions normatives, par date d'effet">
          {evolutions.map((e) => (
            <li key={e.id} className={n.friseListItem}>
              <button type="button" className={n.friseListButton} aria-pressed={selectedId === e.id} onClick={() => select(e.id)}>
                <VeilleGlyph glyph={timingGlyph(e.timing, e.integration)} size={12} />
                <span className={n.friseDate}>{e.effectiveFrom ? formatShortDate(e.effectiveFrom) : "sans date"}</span>
                <span>{e.title}</span>
              </button>
            </li>
          ))}
        </ol>

        <p className={n.legend}>
          <span>
            <VeilleGlyph glyph="sq-fill" /> en vigueur, à reprendre
          </span>
          <span>
            <VeilleGlyph glyph="sq-line" /> à venir
          </span>
          <span>
            <VeilleGlyph glyph="lozenge" /> sans date d&apos;effet
          </span>
          <span>
            <VeilleGlyph glyph="dot" /> intégrée
          </span>
          <span>
            <VeilleGlyph glyph="ring" /> projet à surveiller
          </span>
        </p>
      </div>

      {selected ? (
        <aside ref={panelRef} tabIndex={0} className={`${p.panel} ${n.plane2} ${n.veillePanel}`} aria-label="Détail de l'évolution">
          <div className={p.panelSection}>
            <a href="#frise-t" className={n.backLink}>
              ↑ Retour aux évolutions
            </a>
            {/* Seul le titre est annoncé quand le choix change : annoncer tout le panneau serait envahissant. */}
            <div aria-live="polite" aria-atomic="true">
              <p className={p.key}>
                {EVOLUTION_KIND_LABEL[selected.kind]} · {selected.issuer}
              </p>
              <h3 className={p.panelTitle}>{selected.title}</h3>
            </div>
            <p style={{ marginTop: 10 }}>
              <EvolutionMark timing={selected.timing} integration={selected.integration} />
            </p>
            <dl className={n.fields}>
              <div>
                <dt>Effet</dt>
                <dd>{selected.effectiveFrom ? formatDate(selected.effectiveFrom) : "Sans date d'effet"}</dd>
              </div>
              {selected.publishedOn ? (
                <div>
                  <dt>Publication</dt>
                  <dd>{formatDate(selected.publishedOn)}</dd>
                </div>
              ) : null}
              <div style={{ gridColumn: "1 / -1" }}>
                <dt>Règle d&apos;effet</dt>
                <dd>{selected.effectiveRule}</dd>
              </div>
              {selected.euEndorsement ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>Adoption UE</dt>
                  <dd>
                    {selected.euEndorsement.status}
                    {selected.euEndorsement.regulation ? ` — ${selected.euEndorsement.regulation}` : ""}
                    {selected.euEndorsement.ojDate ? ` (JOUE du ${formatDate(selected.euEndorsement.ojDate)})` : ""}
                  </dd>
                </div>
              ) : null}
              {selected.applicability ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>En France</dt>
                  <dd>{selected.applicability}</dd>
                </div>
              ) : null}
            </dl>
            {selected.quote ? <blockquote className={n.quote}>« {selected.quote} »</blockquote> : null}
          </div>
          <div className={p.panelSection}>
            <p className={p.key}>Ce qui est périmé dans PROBANT</p>
            <p className={n.lineText}>{selected.outdatedInProbant}</p>
            {selected.integrationNote ? <p className={n.lineNote}>{selected.integrationNote}</p> : null}
          </div>
          <div className={p.panelSection}>
            <p className={p.key}>Preuve</p>
            <p className={n.lineText}>
              {EVOLUTION_ACCESS_LABEL[selected.access]}
              {selected.readAt ? `, le ${formatDate(selected.readAt)}` : ""}.
              {selected.provenance ? ` ${selected.provenance}` : ""}
            </p>
            {selected.officialUrl ? (
              <p className={`${n.lineText} ${n.external}`}>
                <a href={selected.officialUrl} target="_blank" rel="noopener noreferrer">
                  {selected.officialUrl}
                </a>
              </p>
            ) : null}
            {selected.limits.length > 0 ? (
              <ul className={n.riskList} style={{ marginTop: 8 }}>
                {selected.limits.map((l, i) => (
                  <li key={i}>· {l}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={p.panelSection}>
            <p className={p.key}>Touche</p>
            {selected.sources.length > 0 ? (
              <ul className={n.chips}>
                {selected.sources.map((s) => (
                  <li key={s.id}>
                    <Link href={`/normatif/sources/${s.id}`}>{s.label}</Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className={n.lineText} style={{ marginTop: 10 }}>
              {selected.cycles.length} cycle{selected.cycles.length > 1 ? "s" : ""}
              {selected.methodology.length > 0
                ? ` · méthodologie : ${selected.methodology.map((m) => m.title).join(", ")}`
                : ""}
            </p>
            {selected.cycles.length > 0 ? (
              <ul className={n.chips}>
                {selected.cycles.slice(0, 12).map((c) => (
                  <li key={c.slug}>
                    <Link href={`/normatif/cycles/${c.slug}`}>{c.title}</Link>
                  </li>
                ))}
                {selected.cycles.length > 12 ? <li>et {selected.cycles.length - 12} autres</li> : null}
              </ul>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
