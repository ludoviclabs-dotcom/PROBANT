import Link from "next/link";
import { loadAllCycles, loadAllSources, loadVeilleReport } from "@/lib/audit-cycles/loader";
import { toSearchItem } from "@/lib/audit-cycles/search";
import { buildCoverageMatrix, buildCycleIndex } from "@/lib/audit-cycles/view";
import { SectionHead } from "@/components/charte/InstrumentPage";
import { CoverageMatrix } from "@/components/normatif/CoverageMatrix";
import { CycleIndex } from "@/components/normatif/CycleIndex";
import { SearchBar } from "@/components/normatif/SearchBar";
import { VeilleGlyph, formatDate } from "@/components/normatif/VeilleMarks";
import p from "@/components/charte/page.module.css";
import n from "@/components/normatif/normatif.module.css";

export default async function NormatifHome() {
  const [cycles, sources, veille] = await Promise.all([loadAllCycles(), loadAllSources(), loadVeilleReport()]);
  const searchItems = cycles.map(toSearchItem);
  const index = buildCycleIndex(cycles, veille);
  const matrix = buildCoverageMatrix(cycles, sources, veille);
  const reviewRequired = cycles.filter((c) => c.reviewStatus === "REVIEW_REQUIRED").length;
  const validated = cycles.filter((c) => c.reviewStatus === "VALIDATED").length;

  return (
    <>
      <header className={p.intro}>
        <div className={p.introMain}>
          <p className={p.eyebrow}>Base de connaissance normative</p>
          <h1 className={p.title}>Audit Normatif 360</h1>
          <p className={p.lead}>
            {cycles.length} cycles d&apos;audit financier : normes applicables (ISA, NEP, IAS/IFRS, PCG, Code de
            commerce, CGI), seuils, matérialité paramétrable, procédures analytiques, tests de détail, matrice des
            risques et différences IFRS / PCG. Complémentaire à l&apos;analyse FEC de PROBANT.
          </p>
        </div>
        <div className={p.introAside}>
          <dl className={p.readouts}>
            <div>
              <dt>Cycles</dt>
              <dd>{cycles.length}</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>{sources.length}</dd>
            </div>
            <div>
              <dt>Fiches validées</dt>
              <dd>{validated}</dd>
            </div>
            <div>
              <dt>Revue requise</dt>
              <dd>{reviewRequired}</dd>
            </div>
          </dl>
        </div>
      </header>

      <SearchBar cycles={searchItems} />

      <div role="note" className={n.caveat}>
        <VeilleGlyph glyph="sq-line" size={12} />
        <p>
          Les pourcentages de matérialité et les bornes de ratios sont des pratiques professionnelles paramétrables :
          les ISA et les NEP imposent le principe et la documentation du jugement, pas un pourcentage universel. Tout
          le contenu reste à valider par un expert avant un usage opposable.
        </p>
      </div>

      {veille ? (
        <section className={p.section} aria-labelledby="veille-t">
          <SectionHead
            id="veille-t"
            numeral="i"
            title="État de la veille"
            note={`arrêtée au ${formatDate(veille.arreteAu)}`}
            action={
              <Link href="/normatif/veille" className={p.btnQuiet}>
                Ouvrir la veille →
              </Link>
            }
          />
          <div className={p.measures}>
            <div className={p.measure}>
              <div className={p.measureHead}>
                <span className={n.statusMark}>
                  <VeilleGlyph glyph="sq-fill" /> En vigueur, à reprendre
                </span>
              </div>
              <p className={p.measureValue}>{veille.counts.enVigueurAIntegrer + veille.counts.sansDateAIntegrer}</p>
              <p className={p.measureText}>Textes déjà applicables, ou adresses officielles changées, que le contenu ne reflète pas encore.</p>
            </div>
            <div className={p.measure}>
              <div className={p.measureHead}>
                <span className={n.statusMark}>
                  <VeilleGlyph glyph="sq-line" /> À venir
                </span>
              </div>
              <p className={p.measureValue}>{veille.counts.aVenirAIntegrer}</p>
              <p className={p.measureText}>Révisions publiées dont la date d&apos;effet n&apos;est pas encore atteinte.</p>
            </div>
            <div className={p.measure}>
              <div className={p.measureHead}>
                <span className={n.statusMark}>
                  <VeilleGlyph glyph="cross" /> Liens introuvables
                </span>
              </div>
              <p className={p.measureValue}>{veille.counts.liens.introuvable + veille.counts.liens.injoignable}</p>
              <p className={p.measureText}>Sources dont l&apos;adresse officielle ne répond plus.</p>
            </div>
            <div className={p.measure}>
              <div className={p.measureHead}>
                <span className={n.statusMark}>
                  <VeilleGlyph glyph="ring" /> Jamais vérifiées
                </span>
              </div>
              <p className={p.measureValue}>
                {veille.counts.jamaisVerifiees}
                <span className={p.faint}> / {veille.counts.sources}</span>
              </p>
              <p className={p.measureText}>Sources sans lecture datée d&apos;une page officielle.</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className={p.section} aria-labelledby="index-t">
        <SectionHead id="index-t" numeral={veille ? "ii" : "i"} title="Index des cycles" note={`${cycles.length} fiches, sept familles`} />
        {cycles.length === 0 ? (
          <p className={n.empty}>
            Aucun cycle chargé. Vérifiez le répertoire <code>data/cycles/</code>.
          </p>
        ) : (
          <CycleIndex families={index} />
        )}
        <p className={p.note}>
          <span>
            <Link href="/normatif/cycles">Cycles d&apos;audit</Link> : la liste complète, filtrable par famille et par
            risque de fraude.
          </span>
        </p>
      </section>

      <section className={p.section} aria-labelledby="matrice-t">
        <SectionHead
          id="matrice-t"
          numeral={veille ? "iii" : "ii"}
          title="Couverture normative"
          note="sources citées par cycle et par référentiel"
        />
        <CoverageMatrix matrix={matrix} />
      </section>
    </>
  );
}
