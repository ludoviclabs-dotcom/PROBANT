import Link from "next/link";
import type { NormativeFamily } from "./normative-index";
import s from "./landing.module.css";

/**
 * 04 · Audit Normatif 360 : l'index typographique des cycles, par famille, sans carte. Le carré de signal
 * ouvre l'avertissement qui reste toujours lisible : contenu à valider par un expert.
 */
export function NormativeIndex({ families, total }: { families: NormativeFamily[]; total: number }) {
  return (
    <section id="normatif" aria-labelledby="norm-t" className={s.section}>
      <div className={s.sectionHead}>
        <span className={s.sectionNum}>04</span>
        <h2 id="norm-t" className={s.h2}>Audit Normatif 360</h2>
      </div>
      <p className={s.sectionLeadWide}>
        {total} cycles d’audit (ISA, NEP, IFRS, PCG) : normes applicables, seuils, matérialité paramétrable, procédures analytiques, tests de détail, matrice des risques et différences IFRS / PCG.
      </p>
      <div role="note" className={s.caveat}>
        <svg width={12} height={12} viewBox="0 0 10 10" aria-hidden="true" focusable="false" className={s.caveatGlyph}>
          <path d="M1.5 1.5h7v7h-7z" style={{ fill: "var(--pb-signal)" }} />
        </svg>
        <p>
          Contenu à valider par un expert. Citations, paragraphes et seuils sont en statut « revue requise » et ne doivent pas être utilisés de façon opposable avant cette validation.
        </p>
      </div>
      <div className={s.families}>
        {families.map((family) => (
          <div key={family.id}>
            <div className={s.familyHead}>
              <span className={s.familyTitle}>{family.title}</span>
              <span className={s.familyCount}>{family.count}</span>
            </div>
            <ol className={s.familyList}>
              {family.items.map((item) => (
                <li key={item.slug} className={s.familyItem}>
                  <span className={s.itemNum}>{item.n}</span>
                  <Link href={`/normatif/cycles/${item.slug}`} className={s.itemLink}>
                    {item.title}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      <Link href="/normatif" className={s.openNormatif}>
        Ouvrir Audit Normatif 360 →
      </Link>
    </section>
  );
}
