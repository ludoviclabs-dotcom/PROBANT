"use client";

import { useState } from "react";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { severityWord } from "@/components/charte/severity";
import { plural } from "@/lib/synthese-view/common";
import { buildQueueIndex, type QueueItem } from "@/lib/tests-view/queue";
import x from "./tests.module.css";

function IndexButton({ item, selected, onSelect }: { item: QueueItem; selected: boolean; onSelect: (id: string) => void }) {
  const { finding: f, proposal } = item;
  return (
    <li>
      <button type="button" className={x.indexButton} aria-current={selected ? "true" : undefined} onClick={() => onSelect(f.id)}>
        <SeverityGlyph severity={f.severity} />
        <span className={x.indexTitle}>
          {f.titre}
          <span className={x.srOnly}>, {severityWord(f.severity)}</span>
        </span>
        {proposal.status === "to_define" && <span className={x.toDefineTag}>à définir</span>}
      </button>
    </li>
  );
}

/**
 * Index de lecture « un constat à la fois » : une ligne par constat (glyphe de gravité, intitulé, marque « à définir »),
 * les écarts du rapprochement regroupés sous une ligne qui se déplie. Le constat choisi s'ouvre dans le panneau voisin.
 */
export function ProcedureIndex({ items, selectedId, onSelect }: { items: readonly QueueItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const index = buildQueueIndex(items);
  const selectedInGroup = index.reconciliation.some((i) => i.finding.id === selectedId);
  // « auto » : le groupe s'ouvre de lui-même quand le constat choisi en fait partie ; un clic fixe l'état.
  const [group, setGroup] = useState<"auto" | "open" | "closed">("auto");
  const expanded = group === "open" || (group === "auto" && selectedInGroup);

  return (
    <nav aria-label="Constats à couvrir" className={x.indexNav}>
      <div className={x.indexScroll}>
        <ul className={x.index}>
          {index.primary.map((item) => (
            <IndexButton key={item.finding.id} item={item} selected={item.finding.id === selectedId} onSelect={onSelect} />
          ))}
          {index.reconciliation.length > 0 && (
            <li>
              <button
                type="button"
                className={`${x.indexButton} ${x.groupToggle}`}
                aria-expanded={expanded}
                aria-controls="tc-index-rapprochement"
                onClick={() => setGroup(expanded ? "closed" : "open")}
              >
                <span className={x.groupSign} aria-hidden="true">
                  {expanded ? "−" : "+"}
                </span>
                <span className={x.indexTitle}>
                  {index.reconciliation.length} {plural(index.reconciliation.length, "écart de rapprochement", "écarts de rapprochement")}
                </span>
                <span className={x.groupCounts}>
                  {index.reconciliationBySeverity.map((s) => `${s.count} ${plural(s.count, severityWord(s.severity))}`).join(" · ")}
                </span>
              </button>
              <ul id="tc-index-rapprochement" className={x.indexGroup} hidden={!expanded}>
                {index.reconciliation.map((item) => (
                  <IndexButton key={item.finding.id} item={item} selected={item.finding.id === selectedId} onSelect={onSelect} />
                ))}
              </ul>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
