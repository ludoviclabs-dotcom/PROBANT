"use client";

import { useEffect, useState } from "react";
import { useDemoCounter } from "@/components/demo/useDemoCounter";
import { REGISTRY_META } from "./themes";

/**
 * Barre de métriques du référentiel : 3 compteurs animés 0 → valeur
 * (easeOutQuart, 800ms) remplaçant les anciennes pills statiques.
 */
export function ReferentielMetrics({
  total,
  droitDur,
  methode,
}: {
  total: number;
  droitDur: number;
  methode: number;
}) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const cTotal = useDemoCounter(total, 800, active);
  const cDroitDur = useDemoCounter(droitDur, 800, active);
  const cMethode = useDemoCounter(methode, 800, active);

  return (
    <div className="grid grid-cols-1 divide-y divide-[var(--pb-border)] overflow-hidden rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Metric
        value={cTotal}
        label="Sources totales"
        sublabel="versionnées"
        accent="var(--pb-accent)"
      />
      <Metric
        value={cDroitDur}
        label={REGISTRY_META["droit-dur"].short}
        sublabel="opposable en mission"
        accent={REGISTRY_META["droit-dur"].hex}
      />
      <Metric
        value={cMethode}
        label="Méthode interne"
        sublabel="non opposable"
        accent={REGISTRY_META["methode"].hex}
      />
    </div>
  );
}

function Metric({
  value,
  label,
  sublabel,
  accent,
}: {
  value: number;
  label: string;
  sublabel: string;
  accent: string;
}) {
  return (
    <div className="flex items-baseline gap-3 p-3.5">
      <span className="tnum text-2xl font-bold" style={{ color: accent }}>
        {value}
      </span>
      <div className="flex flex-col leading-tight">
        <span className="text-[12px] font-medium text-[var(--pb-text)]">{label}</span>
        <span className="text-[11px] text-[var(--pb-text-faint)]">{sublabel}</span>
      </div>
    </div>
  );
}
