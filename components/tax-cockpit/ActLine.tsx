import p from "@/components/charte/page.module.css";
import x from "./fiscalite.module.css";

/**
 * Repère d'acte (« I · Le verdict ») : chiffre romain italique, nom de l'acte en serif, filet continu — les classes
 * de `SectionHead` (components/charte), posées sur un élément qui n'est PAS un titre. Le titre de section (h2)
 * reste le titre de travail de l'acte (« Exercice 2026 — … », « Du résultat comptable… », « Couverture… »), que
 * les recettes e2e et le plan de titres de la page lisent au niveau 2.
 */
export function ActLine({ numeral, name }: { numeral: string; name: string }) {
  return (
    <p className={`${p.sectionHead} ${x.actLine}`}>
      <span className={p.sectionNumeral} aria-hidden="true">
        {numeral}
      </span>
      <span className={`${p.sectionTitle} ${x.actName}`}>{name}</span>
      <span className={p.sectionRule} aria-hidden="true" />
    </p>
  );
}
