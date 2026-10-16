import type { CloisonDef } from "@/lib/synthese-view/common";
import { plural } from "@/lib/synthese-view/common";
import { SEVERITY_LABEL } from "@/lib/canonical-model/finding";
import { isFiltering, type CrossFilter } from "./filter";
import s from "./synthese.module.css";

/**
 * Barre du filtre croisé, collante en haut de la section Analyse : elle dit ce qui filtre et combien de constats
 * répondent. La zone est une région « polie » : l'annonce suit le filtre sans voler le focus.
 */
export function FilterBar({ filter, clos, count, onClear }: { filter: CrossFilter; clos: readonly CloisonDef[]; count: number; onClear: () => void }) {
  const active = isFiltering(filter);
  const clo = filter.clo ? clos.find((c) => c.id === filter.clo)?.label : null;
  const label = active
    ? `${clo ?? "Toutes cloisons"} → ${filter.sev ? SEVERITY_LABEL[filter.sev] : "toutes gravités"} · ${count} ${plural(count, "constat")}`
    : "Aucun. Cliquez un flux, une cloison ou une gravité du Sankey pour filtrer toute l’analyse.";
  return (
    <div aria-live="polite" className={s.filterBar}>
      <span className={s.filterKey}>Filtre croisé</span>
      <span className={active ? s.filterOn : s.filterOff}>{label}</span>
      {active && (
        <button type="button" className={s.btnSmall} onClick={onClear}>
          Effacer le filtre
        </button>
      )}
    </div>
  );
}
