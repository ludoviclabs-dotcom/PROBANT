import s from "./landing.module.css";

/** Pied de page : rappel du périmètre (société fictive, aucune certification) et versions réellement chargées. */
export function LandingFooter({ engineVersion, referentiel, cycles }: { engineVersion: string; referentiel: string; cycles: number }) {
  return (
    <footer className={s.footer}>
      <div className={s.footerBrand}>
        <span className={s.footerWord}>PROBANT</span>
        <span>Orchestrateur de conformité analytique des états financiers français.</span>
      </div>
      <div className={s.footerNote}>
        <span>Démo : société fictive DEMO SA, exercice 2024. Aucun résultat ne vaut certification ni avis juridique.</span>
        <span className={s.footerMeta}>
          moteur {engineVersion} · référentiel {referentiel} · {cycles} cycles · revue requise
        </span>
      </div>
    </footer>
  );
}
