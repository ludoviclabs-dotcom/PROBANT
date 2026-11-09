import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAllCycles, loadAllSources, loadCycle, loadVeilleReport } from "@/lib/audit-cycles/loader";
import { REVIEW_STATUS_LABEL } from "@/lib/audit-cycles/types";
import { cycleVeille } from "@/lib/audit-cycles/veille";
import { CYCLE_FAMILY_TITLE } from "@/lib/audit-cycles/view";
import { siloById } from "@/lib/canonical-model";
import { SectionHead } from "@/components/charte/InstrumentPage";
import {
  IfrsPcgRegister,
  MaterialitySteps,
  ProcedureLines,
  RatioLines,
  RiskColumns,
  TestLines,
  ThresholdLines,
} from "@/components/normatif/CyclePanels";
import { CycleToc } from "@/components/normatif/CycleToc";
import { NormativeStatusBadge } from "@/components/normatif/NormativeStatusBadge";
import { EvolutionMark, formatDate } from "@/components/normatif/VeilleMarks";
import p from "@/components/charte/page.module.css";
import n from "@/components/normatif/normatif.module.css";

export async function generateStaticParams() {
  const cycles = await loadAllCycles();
  return cycles.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    return { title: (await loadCycle(slug)).title };
  } catch {
    return { title: "Cycle introuvable" };
  }
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];

export default async function CycleDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let cycle;
  try {
    cycle = await loadCycle(slug);
  } catch {
    notFound();
  }
  const [cycles, sources, veille] = await Promise.all([loadAllCycles(), loadAllSources(), loadVeilleReport()]);
  const titleOf = new Map(cycles.map((c) => [c.slug, c.title]));
  // Le registre central fait foi pour l'adresse officielle ; la copie portée par la fiche ne sert qu'à défaut.
  const urlOf = new Map(sources.map((s) => [s.id, s.url]));
  const exposure = veille ? cycleVeille(veille, slug) : null;
  const linkedSilos = (cycle.probantSiloIds ?? []).map((id) => siloById(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));

  const sections = [
    { id: "normes", label: "Normes applicables" },
    { id: "seuils", label: "Seuils et règles" },
    { id: "materialite", label: "Matérialité" },
    { id: "ratios", label: "Ratios et bornes d'alerte" },
    { id: "procedures", label: "Procédures analytiques" },
    { id: "tests", label: "Tests de détail" },
    { id: "risques", label: "Matrice des risques" },
    { id: "ifrs-pcg", label: "IFRS et PCG" },
    ...((cycle.keyPoints ?? []).length > 0 ? [{ id: "points", label: "Points clés" }] : []),
    { id: "sources", label: "Sources officielles" },
    ...((cycle.relatedCycles ?? []).length > 0 ? [{ id: "connexes", label: "Cycles connexes" }] : []),
  ];
  const numeral = (id: string) => ROMAN[sections.findIndex((s) => s.id === id)] ?? undefined;

  return (
    <div className={n.detailGrid}>
      <CycleToc items={sections} />
      <article>
        <ol className={n.crumbs} aria-label="Fil d'Ariane">
          <li>
            <Link href="/normatif/cycles">Cycles d&apos;audit</Link>
          </li>
          <li>{CYCLE_FAMILY_TITLE[cycle.family]}</li>
        </ol>
        <header className={p.intro} style={{ paddingTop: 20 }}>
          <div className={p.introMain}>
            <p className={p.eyebrow}>Fiche cycle · {CYCLE_FAMILY_TITLE[cycle.family]}</p>
            <h1 className={p.title}>{cycle.title}</h1>
            <p className={p.lead}>{cycle.summary}</p>
          </div>
          <div className={p.introAside}>
            <dl className={p.readouts}>
              <div>
                <dt>Revue</dt>
                <dd style={{ fontSize: 16 }}>{REVIEW_STATUS_LABEL[cycle.reviewStatus]}</dd>
              </div>
              <div>
                <dt>Dernière revue</dt>
                <dd style={{ fontSize: 16 }}>{cycle.lastReviewedAt ? formatDate(cycle.lastReviewedAt) : "Non datée"}</dd>
              </div>
              {cycle.pcgAccounts?.length ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>Comptes PCG</dt>
                  <dd className={n.codes} style={{ marginTop: 6 }}>
                    {cycle.pcgAccounts.map((c) => (
                      <span key={c} className={n.code}>
                        {c}
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </header>

        {exposure && exposure.evolutions.length > 0 ? (
          <section className={`${n.exposure} ${n.plane2}`} aria-labelledby="veille-cycle-t">
            <h2 id="veille-cycle-t">Veille : ce que cette fiche ne reflète pas encore</h2>
            <ul className={n.exposureList}>
              {exposure.evolutions.map((e) => (
                <li key={e.id}>
                  <EvolutionMark timing={e.timing} integration={e.integration} />{" "}
                  <Link href={`/normatif/veille?evolution=${e.id}`} className={n.linkQuiet}>
                    {e.title}
                  </Link>
                  {e.effectiveFrom ? <span className={p.faint}> — effet au {formatDate(e.effectiveFrom)}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {linkedSilos.length > 0 ? (
          <p className={n.probantLink}>
            <span className={p.key}>Analysé dans PROBANT</span>
            {linkedSilos.map((s) => (
              <Link key={s.id} href="/dashboard/cloisons">
                Silo {s.label} →
              </Link>
            ))}
          </p>
        ) : null}

        <section className={p.section} aria-labelledby="normes">
          <SectionHead id="normes" numeral={numeral("normes")} title="Normes applicables" note={`${(cycle.applicableStandards ?? []).length} références`} />
          <ul className={n.lines}>
            {(cycle.applicableStandards ?? []).map((s) => (
              <li key={s.id} className={n.line}>
                <div>
                  <p className={n.lineTitle}>
                    <Link href={`/normatif/sources/${s.id}`} className={n.linkQuiet}>
                      {s.label}
                    </Link>
                  </p>
                  {s.note ? <p className={n.lineText}>{s.note}</p> : null}
                </div>
                <NormativeStatusBadge status={s.status} short />
              </li>
            ))}
          </ul>
        </section>

        <section className={p.section} aria-labelledby="seuils">
          <SectionHead id="seuils" numeral={numeral("seuils")} title="Seuils et règles" />
          <ThresholdLines thresholds={cycle.thresholds} />
        </section>

        <section className={p.section} aria-labelledby="materialite">
          <SectionHead id="materialite" numeral={numeral("materialite")} title="Seuils de signification et matérialité" />
          <MaterialitySteps materiality={cycle.materiality} />
        </section>

        <section className={p.section} aria-labelledby="ratios">
          <SectionHead id="ratios" numeral={numeral("ratios")} title="Ratios clés et bornes d'alerte" />
          <RatioLines ratios={cycle.ratios} />
        </section>

        <section className={p.section} aria-labelledby="procedures">
          <SectionHead id="procedures" numeral={numeral("procedures")} title="Procédures analytiques" />
          <ProcedureLines procedures={cycle.analyticalProcedures} />
        </section>

        <section className={p.section} aria-labelledby="tests">
          <SectionHead id="tests" numeral={numeral("tests")} title="Tests de détail" />
          <TestLines tests={cycle.detailTests} />
        </section>

        <section className={p.section} aria-labelledby="risques">
          <SectionHead id="risques" numeral={numeral("risques")} title="Matrice des risques" />
          <RiskColumns risks={cycle.risks} />
        </section>

        <section className={p.section} aria-labelledby="ifrs-pcg">
          <SectionHead id="ifrs-pcg" numeral={numeral("ifrs-pcg")} title="Différences IFRS et PCG" />
          <IfrsPcgRegister differences={cycle.ifrsVsPcg} />
        </section>

        {(cycle.keyPoints ?? []).length > 0 ? (
          <section className={p.section} aria-labelledby="points">
            <SectionHead id="points" numeral={numeral("points")} title="Points clés" />
            <ul className={n.lines}>
              {cycle.keyPoints.map((k, i) => (
                <li key={i} className={n.line} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                  <p className={n.lineText} style={{ marginTop: 0 }}>
                    {k}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={p.section} aria-labelledby="sources">
          <SectionHead id="sources" numeral={numeral("sources")} title="Sources officielles" />
          <ul className={n.lines}>
            {(cycle.officialSources ?? []).map((s) => {
              const url = urlOf.get(s.id) ?? s.url;
              return (
                <li key={s.id} className={n.line}>
                  <p className={n.lineTitle}>
                    <Link href={`/normatif/sources/${s.id}`} className={n.linkQuiet}>
                      {s.label}
                    </Link>
                  </p>
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className={`${n.statusMark} ${n.touch}`} aria-label={`${s.label} — texte officiel (nouvel onglet)`}>
                      Texte officiel ↗
                    </a>
                  ) : (
                    <span className={n.statusMark}>Sans adresse</span>
                  )}
                </li>
                );
            })}
          </ul>
        </section>

        {(cycle.relatedCycles ?? []).length > 0 ? (
          <section className={p.section} aria-labelledby="connexes">
            <SectionHead id="connexes" numeral={numeral("connexes")} title="Cycles connexes" />
            <ul className={n.chips} style={{ fontSize: 15 }}>
              {cycle.relatedCycles.map((rc) => (
                <li key={rc}>
                  <Link href={`/normatif/cycles/${rc}`}>{titleOf.get(rc) ?? rc}</Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p style={{ marginTop: 48 }}>
          <a href={`/api/normatif/export?format=md&slug=${cycle.slug}`} className={p.btnSecondary}>
            Exporter cette fiche (Markdown)
          </a>
        </p>
      </article>
    </div>
  );
}
