import { SectionHead } from "@/components/charte/InstrumentPage";
import p from "@/components/charte/page.module.css";
import { REGIME_LABELS, regimeReferences, type MissionRegime } from "@/lib/audit/procedures";
import x from "./tests.module.css";

/**
 * Régime de la mission et période. Le régime n'est pas renseigné dans le dossier : il est choisi ici et ne change que
 * la note et les références rappelées (texte, paragraphes, homologation), jamais les constats ni les procédures.
 */
export function RegimeSection({ regime, onRegime, exercice }: { regime: MissionRegime; onRegime: (regime: MissionRegime) => void; exercice: string }) {
  const references = regimeReferences(regime, exercice);
  return (
    <section aria-labelledby="tests-regime-title" className={p.section}>
      <SectionHead
        id="tests-regime-title"
        title="Régime de la mission et période"
        action={
          <label className={`${p.field} ${x.field}`}>
            <span className={p.key}>Régime</span>
            <select value={regime} onChange={(e) => onRegime(e.target.value as MissionRegime)} aria-label="Régime de la mission">
              {(Object.keys(REGIME_LABELS) as MissionRegime[]).map((r) => (
                <option key={r} value={r}>
                  {REGIME_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <p className={x.regimeNote}>{references.note}</p>
      <div className={p.scrollX} role="region" aria-label="Références normatives, défilement horizontal" tabIndex={0}>
        <table className={`${p.register} ${x.refTable}`}>
          <caption className={x.srOnly}>Références rappelées pour le régime « {references.label} »</caption>
          <thead>
            <tr>
              <th scope="col">Texte</th>
              <th scope="col">Paragraphes</th>
              <th scope="col">Homologation et application</th>
            </tr>
          </thead>
          <tbody>
            {references.references.map((r) => (
              <tr key={r.ref}>
                <th scope="row">
                  <a href={r.url} target="_blank" rel="noreferrer">
                    {r.ref}
                    <span className={x.srOnly}> (nouvel onglet)</span>
                  </a>
                  <span className={x.refTitle}>{r.title}</span>
                </th>
                <td className={p.soft}>{r.section}</td>
                <td className={p.soft}>{r.applicability}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
