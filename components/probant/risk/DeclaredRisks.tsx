import type { Risk, RiskCategory } from "@/lib/audit-cycles/types";
import p from "@/components/charte/page.module.css";
import s from "./risk.module.css";

/**
 * Risques déclarés par la fiche normative du cycle, dans le panneau de détail : les trois catégories de la matrice
 * normative (inhérents, de contrôle, de fraude), leurs indices et la réponse d'audit, lus tels quels dans `cycle.risks`.
 * Même contenu que `components/normatif/RiskMatrix` (partagé avec /normatif/cycles/[slug], non modifié), mis en liste
 * à filets continus pour un panneau de 352 px dans l'ambiance « instruments ».
 */

const CATEGORIES: { category: RiskCategory; label: string }[] = [
  { category: "RISQUE_INHERENT", label: "Risques inhérents" },
  { category: "RISQUE_CONTROLE", label: "Risques de contrôle" },
  { category: "RISQUE_FRAUDE", label: "Risques de fraude" },
];

export function DeclaredRisks({ risks }: { risks: readonly Risk[] }) {
  return (
    <div>
      {CATEGORIES.map(({ category, label }) => {
        const items = (risks ?? []).filter((r) => r.category === category);
        return (
          <div key={category} className={s.riskGroup}>
            <h4 className={s.riskGroupHead}>
              <span>{label}</span>
              <span>{items.length}</span>
            </h4>
            {items.length === 0 ? (
              <p className={s.emptyText}>Aucun risque identifié dans cette catégorie.</p>
            ) : (
              items.map((risk, i) => (
                <div key={`${risk.name}-${i}`} className={s.riskItem}>
                  <p className={s.riskName}>{risk.name}</p>
                  <p className={s.riskDesc}>{risk.description}</p>
                  {risk.indicators?.length > 0 && (
                    <>
                      <span className={`${p.key} ${s.riskSubKey}`}>Indices</span>
                      <ul className={s.riskList}>
                        {risk.indicators.map((ind, j) => (
                          <li key={j}>{ind}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {risk.response?.length > 0 && (
                    <>
                      <span className={`${p.key} ${s.riskSubKey}`}>Réponse d&apos;audit</span>
                      <ul className={s.riskList}>
                        {risk.response.map((resp, j) => (
                          <li key={j}>{resp}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
