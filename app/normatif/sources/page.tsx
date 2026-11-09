import Link from "next/link";
import { loadAllCycles, loadAllMethodology, loadAllSources, loadVeilleReport } from "@/lib/audit-cycles/loader";
import { buildCitationIndex } from "@/lib/audit-cycles/veille";
import { referenceFamilyOf, sourceSpread } from "@/lib/audit-cycles/view";
import { SectionHead } from "@/components/charte/InstrumentPage";
import { SourcesRegister, type SourceRow } from "@/components/normatif/SourcesRegister";
import { formatDate } from "@/components/normatif/VeilleMarks";
import p from "@/components/charte/page.module.css";
import n from "@/components/normatif/normatif.module.css";

export const metadata = { title: "Sources normatives" };

export default async function SourcesPage() {
  const [sources, veille, cycles, methodology] = await Promise.all([
    loadAllSources(),
    loadVeilleReport(),
    loadAllCycles(),
    loadAllMethodology(),
  ]);
  // Nombre de cycles citant chaque source : lu dans les fiches, indépendant de la veille.
  const { cyclesBySource } = buildCitationIndex(cycles, methodology);
  const veilleById = new Map((veille?.sources ?? []).map((s) => [s.id, s]));
  const spread = sourceSpread(sources);
  const total = spread.reduce((sum, f) => sum + f.count, 0);

  const rows: SourceRow[] = sources.map((s) => {
    const v = veilleById.get(s.id);
    return {
      id: s.id,
      label: s.label,
      summary: s.summary?.trim() ?? null,
      type: s.type,
      family: referenceFamilyOf(s.type),
      status: s.status,
      url: s.url ?? null,
      cycles: cyclesBySource.get(s.id)?.length ?? 0,
      verification: v ? { state: v.verification.state, date: v.verification.date } : null,
      link: v?.link.state ?? null,
      evolutions: (v?.evolutions ?? []).map((e) => ({ short: e.short, timing: e.timing, integration: e.integration })),
      toReview: v ? v.queue.rank <= 4 : false,
    };
  });

  return (
    <>
      <header className={p.intro}>
        <div className={p.introMain}>
          <p className={p.eyebrow}>Audit Normatif 360 · registre central</p>
          <h1 className={p.title}>Sources normatives</h1>
          <p className={p.lead}>
            {sources.length} sources (ISA, NEP, IAS/IFRS, PCG et ANC, Code de commerce, CGI, UE, AFA). Chaque fiche cycle
            les cite par leur identifiant ; la veille dit, pour chacune, quand elle a été lue sur une page officielle, si
            son lien répond, et quelles évolutions la touchent.
          </p>
        </div>
        {veille ? (
          <div className={p.introAside}>
            <dl className={p.readouts}>
              <div>
                <dt>Vérifiées</dt>
                <dd>{veille.counts.verifiees}</dd>
              </div>
              <div>
                <dt>Jamais vérifiées</dt>
                <dd>{veille.counts.jamaisVerifiees}</dd>
              </div>
              <div>
                <dt>Liens introuvables</dt>
                <dd>{veille.counts.liens.introuvable + veille.counts.liens.injoignable}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </header>

      <section aria-labelledby="repartition-t">
        <SectionHead id="repartition-t" numeral="i" title="Répartition par référentiel" note={`${total} sources`} />
        <div className={n.spread} aria-hidden="true">
          {spread.map((f, i) => (
            <span
              key={f.id}
              className={n.spreadSeg}
              title={`${f.label} : ${f.count}`}
              data-i={i}
              style={{ flex: `${f.count} 1 0`, animationDelay: `${i * 70}ms` }}
            />
          ))}
        </div>
        <ul className={n.spreadLegend}>
          {spread.map((f, i) => (
            <li key={f.id}>
              <span className={n.swatch} data-i={i} aria-hidden="true" /> {f.label} <b>{f.count}</b>
            </li>
          ))}
        </ul>
      </section>

      <section className={p.section} aria-labelledby="registre-t">
        <SectionHead
          id="registre-t"
          numeral="ii"
          title="Registre"
          note={veille ? `veille au ${formatDate(veille.arreteAu)}` : "aucune veille arrêtée"}
          action={
            veille ? (
              <Link href="/normatif/veille" className={p.btnQuiet}>
                File de revue →
              </Link>
            ) : undefined
          }
        />
        <SourcesRegister rows={rows} families={spread.map((f) => ({ id: f.id, short: f.short, count: f.count }))} />
      </section>
    </>
  );
}
