import { plural } from "@/lib/synthese-view/common";
import s from "./synthese.module.css";

/**
 * Limites de l'analyse, en marge typographique numérotée : toujours visibles, jamais repliées. Une analyse qui ne dit
 * pas ses limites laisserait croire à une complétude qu'elle n'a pas.
 */
export function LimitsMargin({ items }: { items: readonly string[] }) {
  return (
    <section aria-label="Limites de l'analyse" className={s.limits}>
      <div className={s.limitsHead}>
        <h2 className={s.limitsTitle}>Limites de l’analyse</h2>
        <p className={s.limitsSub}>
          {items.length} {plural(items.length, "limite")} · toujours affichées
        </p>
      </div>
      <ol className={s.limitsList}>
        {items.map((text, i) => (
          <li key={i}>
            <span className={s.limitsNum}>{String(i + 1).padStart(2, "0")}</span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
