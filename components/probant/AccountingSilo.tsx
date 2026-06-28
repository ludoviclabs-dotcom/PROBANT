"use client";

import {
  type CSSProperties,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ChevronDown } from "lucide-react";
import type { SiloView, StatementRow, StatutRevue } from "@/lib/canonical-model";
import { siloById } from "@/lib/canonical-model";
import { cn, formatEUR, formatPct } from "@/lib/utils";
import { SEVERITY_STYLE } from "./severity";
import { FindingPanel } from "./FindingPanel";

interface ArrowPath {
  id: string;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  hex: string;
  label?: string;
}

function rowValue(row: StatementRow, unite: "EUR" | "%"): string {
  return unite === "EUR" ? formatEUR(row.valeur, { sign: true }) : formatPct(row.valeur);
}

export function AccountingSilo({
  view,
  defaultOpen = true,
  onDecision,
}: {
  view: SiloView;
  defaultOpen?: boolean;
  onDecision?: (id: string, statut: StatutRevue) => void;
}) {
  const silo = siloById(view.siloId);
  const [open, setOpen] = useState(defaultOpen);

  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const panelRefs = useRef<Map<string, HTMLElement>>(new Map());

  const [arrows, setArrows] = useState<ArrowPath[]>([]);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [wide, setWide] = useState(true);

  const compute = useCallback(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const cr = cont.getBoundingClientRect();
    setDims({ w: cr.width, h: cr.height });
    const isWide = cr.width >= 760;
    setWide(isWide);
    if (!isWide) {
      setArrows([]);
      return;
    }
    const next: ArrowPath[] = [];
    for (const f of view.findings) {
      if (!f.cibleRowId) continue;
      const rowEl = rowRefs.current.get(f.cibleRowId);
      const panelEl = panelRefs.current.get(f.id);
      if (!rowEl || !panelEl) continue;
      const rr = rowEl.getBoundingClientRect();
      const pr = panelEl.getBoundingClientRect();
      next.push({
        id: f.id,
        sx: rr.right - cr.left,
        sy: rr.top - cr.top + rr.height / 2,
        ex: pr.left - cr.left,
        ey: pr.top - cr.top + 24,
        hex: SEVERITY_STYLE[f.severity].hex,
        label: f.annotation,
      });
    }
    setArrows(next);
  }, [view.findings]);

  useLayoutEffect(() => {
    if (!open) return;
    compute();
    const cont = containerRef.current;
    const ro = new ResizeObserver(() => compute());
    if (cont) ro.observe(cont);
    window.addEventListener("resize", compute);
    const raf = requestAnimationFrame(compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
      cancelAnimationFrame(raf);
    };
  }, [compute, open]);

  const counts = view.findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)]">
      {/* En-tête du silo */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--pb-surface-2)]"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--pb-text-faint)] transition-transform",
            !open && "-rotate-90",
          )}
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--pb-text)]">
            {silo?.label ?? view.siloId}
          </h3>
          {silo && (
            <p className="truncate text-[11px] text-[var(--pb-text-faint)]">
              {silo.description} · comptes {silo.comptes.join(", ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {(["bloquant", "majeur", "mineur", "informatif"] as const).map((sev) =>
            counts[sev] ? (
              <span
                key={sev}
                className="tnum inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold"
                style={{
                  color: SEVERITY_STYLE[sev].hex,
                  backgroundColor: `${SEVERITY_STYLE[sev].hex}1a`,
                }}
                title={`${counts[sev]} ${SEVERITY_STYLE[sev].label.toLowerCase()}`}
              >
                {counts[sev]}
              </span>
            ) : null,
          )}
        </div>
      </button>

      {open && (
        <div
          ref={containerRef}
          className={cn(
            "relative gap-6 border-t border-[var(--pb-border)] p-4 lg:gap-x-16",
            wide ? "grid grid-cols-[minmax(0,440px)_1fr]" : "flex flex-col",
          )}
        >
          {/* Flèches SVG (overlay) */}
          {wide && arrows.length > 0 && (
            <svg
              className="pointer-events-none absolute inset-0 z-0"
              width={dims.w}
              height={dims.h}
              style={{ overflow: "visible" }}
            >
              <defs>
                {arrows.map((a) => (
                  <marker
                    key={`m-${a.id}`}
                    id={`arrow-${a.id}`}
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={a.hex} />
                  </marker>
                ))}
              </defs>
              {arrows.map((a) => {
                const dx = a.ex - a.sx;
                const cp = Math.max(48, Math.abs(dx) * 0.5);
                return (
                  <path
                    key={a.id}
                    d={`M ${a.sx} ${a.sy} C ${a.sx + cp} ${a.sy}, ${a.ex - cp} ${a.ey}, ${a.ex} ${a.ey}`}
                    fill="none"
                    stroke={a.hex}
                    strokeWidth={1.75}
                    strokeDasharray="5 4"
                    markerEnd={`url(#arrow-${a.id})`}
                    style={{ animation: "pb-dash 0.8s linear infinite" }}
                    opacity={0.9}
                  />
                );
              })}
            </svg>
          )}

          {/* Annotations le long des flèches */}
          {wide &&
            arrows.map((a) => {
              if (!a.label) return null;
              const mx = a.sx + (a.ex - a.sx) * 0.5;
              const my = a.sy + (a.ey - a.sy) * 0.5;
              return (
                <div
                  key={`lbl-${a.id}`}
                  className="pointer-events-none absolute z-[5] max-w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-md border bg-[var(--pb-bg)] px-2 py-1 text-center text-[10px] font-medium leading-tight shadow-lg"
                  style={{ left: mx, top: my, borderColor: `${a.hex}66`, color: a.hex }}
                >
                  {a.label}
                </div>
              );
            })}

          {/* Colonne gauche : état financier reconstruit */}
          <div className="relative z-[2]">
            <ReconstitutedTable
              view={view}
              registerRow={(id, el) => {
                if (el) rowRefs.current.set(id, el);
                else rowRefs.current.delete(id);
              }}
            />
          </div>

          {/* Colonne droite : constats */}
          <div className="relative z-[2] space-y-3">
            {view.findings.map((f) => (
              <FindingPanel
                key={f.id}
                finding={f}
                onDecision={onDecision}
                ref={(el) => {
                  if (el) panelRefs.current.set(f.id, el);
                  else panelRefs.current.delete(f.id);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ReconstitutedTable({
  view,
  registerRow,
}: {
  view: SiloView;
  registerRow: (id: string, el: HTMLElement | null) => void;
}) {
  const { statement } = view;
  return (
    <div className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)]">
      <div className="border-b border-[var(--pb-border)] px-3 py-2">
        <div className="text-xs font-semibold text-[var(--pb-text)]">
          {statement.titre}
        </div>
        {statement.note && (
          <div className="mt-0.5 text-[10px] text-[var(--pb-text-faint)]">
            {statement.note}
          </div>
        )}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {statement.rows.map((row) => {
            const flagged = !!row.flaggedBy && !!row.severity;
            const sev = row.severity ? SEVERITY_STYLE[row.severity] : null;
            return (
              <tr
                key={row.id}
                ref={flagged ? (el) => registerRow(row.id, el) : undefined}
                className={cn(
                  "border-b border-[var(--pb-border)]/60 last:border-0",
                  row.kind === "total" && "font-semibold",
                )}
                style={
                  flagged && sev
                    ? {
                        outline: `2px solid ${sev.hex}`,
                        outlineOffset: "-2px",
                        backgroundColor: `${sev.hex}14`,
                        ...(row.severity === "bloquant"
                          ? ({
                              ["--ring-color" as string]: `${sev.hex}80`,
                              animation: "pb-pulse-ring 2.4s ease-out infinite",
                            } as CSSProperties)
                          : {}),
                      }
                    : undefined
                }
              >
                <td className="px-3 py-2 align-top">
                  <div
                    className={cn(
                      row.kind === "ligne"
                        ? "text-[var(--pb-text-muted)]"
                        : "text-[var(--pb-text)]",
                    )}
                  >
                    {row.label}
                  </div>
                  {row.compte && (
                    <code className="tnum text-[10px] text-[var(--pb-text-faint)]">
                      {row.compte}
                    </code>
                  )}
                </td>
                <td
                  className={cn(
                    "tnum whitespace-nowrap px-3 py-2 text-right align-top",
                    flagged && sev ? "font-semibold" : "text-[var(--pb-text)]",
                  )}
                  style={flagged && sev ? { color: sev.hex } : undefined}
                >
                  {rowValue(row, statement.unite)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
