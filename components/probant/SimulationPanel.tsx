"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import p from "@/components/charte/page.module.css";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import type { ScenarioMeta } from "@/lib/demo/scenarios";
import { plural } from "@/lib/synthese-view/common";
import x from "./depot.module.css";

/**
 * Risque dominant d'un scénario. Le libellé vient du scénario ; seul un libellé qui se déclare lui-même bloquant
 * porte le glyphe de gravité « bloquant ». Aucune autre gravité n'est attribuée à l'écran : les teintes par libellé
 * qui le faisaient auparavant ne venaient d'aucun constat.
 */
function RiskItem({ label }: { label: string }) {
  const isBloquant = label.toLowerCase().includes("bloquant");
  return (
    <li>
      {isBloquant && <SeverityGlyph severity="bloquant" />}
      <span>{label}</span>
    </li>
  );
}

function ScenarioRow({
  scenario,
  onSelect,
  loading,
}: {
  scenario: ScenarioMeta;
  onSelect: (id: string) => void;
  loading: string | null;
}) {
  const titleId = useId();
  const isLoading = loading === scenario.id;
  const isDemo = scenario.id === "demo-sa";

  return (
    <li className={x.scenario}>
      <div className={x.scenarioMain}>
        <h3 id={titleId} className={x.scenarioTitle}>
          {scenario.label}
          {isDemo && <span className={p.key}>par défaut</span>}
        </h3>
        <p className={x.scenarioMeta}>
          {scenario.forme} · {scenario.secteur}
        </p>
        <p className={x.scenarioDesc}>{scenario.description}</p>
        <ul className={x.risks} aria-label="Risques dominants">
          {scenario.risquesDominants.map((r) => (
            <RiskItem key={r} label={r} />
          ))}
        </ul>
      </div>
      <div className={x.scenarioSide}>
        <span className={x.count}>
          {scenario.anomaliesCount}
          <span className={x.countUnit}>{plural(scenario.anomaliesCount, "constat")}</span>
        </span>
        <button
          type="button"
          onClick={() => onSelect(scenario.id)}
          disabled={isLoading}
          aria-describedby={titleId}
          className={isDemo ? p.btnPrimary : p.btnSecondary}
        >
          {isLoading ? "Chargement…" : "Charger ce scénario"}
        </button>
      </div>
    </li>
  );
}

export function SimulationPanel({ scenarios }: { scenarios: ScenarioMeta[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  function handleSelect(id: string) {
    setLoading(id);
    const url = id === "demo-sa" ? "/dashboard/cloisons" : `/dashboard/cloisons?scenario=${id}`;
    router.push(url);
  }

  return (
    <div>
      <p className={x.text}>
        Chaque scénario simule un exercice comptable fictif complet avec des anomalies réalistes. Sélectionnez-en un pour parcourir la revue par cloison — comptes reconstruits, constats annotés, sources normatives et chaîne de preuve.
      </p>
      <ul className={x.scenarios}>
        {scenarios.map((s) => (
          <ScenarioRow key={s.id} scenario={s} onSelect={handleSelect} loading={loading} />
        ))}
      </ul>
    </div>
  );
}
