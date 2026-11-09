import Link from "next/link";
import { notFound } from "next/navigation";
import { loadAllCycles, loadAllMethodology, loadAllSources, loadVeilleReport } from "@/lib/audit-cycles/loader";
import { EVOLUTION_KIND_LABEL, LINK_OUTCOME_LABEL } from "@/lib/audit-cycles/veille";
import { SectionHead } from "@/components/charte/InstrumentPage";
import { NormativeStatusBadge } from "@/components/normatif/NormativeStatusBadge";
import { EvolutionMark, LinkMark, VerificationMark, formatDate } from "@/components/normatif/VeilleMarks";
import p from "@/components/charte/page.module.css";
import n from "@/components/normatif/normatif.module.css";

export async function generateStaticParams() {
  const sources = await loadAllSources();
  return sources.map((s) => ({ slug: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const source = (await loadAllSources()).find((s) => s.id === slug);
  return { title: source ? source.label.slice(0, 80) : "Source introuvable" };
}

export default async function SourceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [sources, cycles, methodology, veille] = await Promise.all([
    loadAllSources(),
    loadAllCycles(),
    loadAllMethodology(),
    loadVeilleReport(),
  ]);
  const source = sources.find((s) => s.id === slug);
  if (!source) notFound();

  const v = veille?.sources.find((s) => s.id === slug) ?? null;
  const referencing = cycles.filter((c) => (v?.cycles ?? []).includes(c.slug));
  const docs = methodology.filter((m) => (v?.methodology ?? []).includes(m.slug));
  const evolutions = (veille?.evolutions ?? []).filter((e) => e.normatifSourceIds.includes(slug));

  return (
    <>
      <ol className={n.crumbs} aria-label="Fil d'Ariane">
        <li>
          <Link href="/normatif/sources">Sources normatives</Link>
        </li>
        <li>{source.type}</li>
      </ol>
      <header className={p.intro} style={{ paddingTop: 20 }}>
        <div className={p.introMain}>
          <p className={p.eyebrow}>Source · {source.type}</p>
          <h1 className={p.title}>{source.label}</h1>
          {source.summary ? <p className={p.lead}>{source.summary}</p> : null}
        </div>
        <div className={p.introAside}>
          <dl className={p.readouts}>
            <div>
              <dt>Force normative</dt>
              <dd style={{ fontSize: 15 }}>
                <NormativeStatusBadge status={source.status} />
              </dd>
            </div>
            <div>
              <dt>Cycles</dt>
              <dd>{referencing.length}</dd>
            </div>
          </dl>
        </div>
      </header>

      <dl className={n.fields} style={{ borderTop: "1px solid var(--pb-rule-strong)", paddingTop: 14 }}>
        {source.article ? (
          <div>
            <dt>Article</dt>
            <dd>{source.article}</dd>
          </div>
        ) : null}
        {source.paragraph ? (
          <div>
            <dt>Paragraphe</dt>
            <dd>{source.paragraph}</dd>
          </div>
        ) : null}
        {source.effectiveDate ? (
          <div>
            <dt>Entrée en vigueur</dt>
            <dd>{source.effectiveDate}</dd>
          </div>
        ) : null}
        <div style={{ gridColumn: "1 / -1" }}>
          <dt>Lien officiel</dt>
          <dd className={n.external}>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.url}
              </a>
            ) : (
              "Aucune adresse — à compléter"
            )}
          </dd>
        </div>
        {source.note ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <dt>Note</dt>
            <dd>{source.note}</dd>
          </div>
        ) : null}
      </dl>

      <section className={p.section} aria-labelledby="veille-t">
        <SectionHead id="veille-t" numeral="i" title="Veille" note={veille ? `au ${formatDate(veille.arreteAu)}` : "aucune veille arrêtée"} />
        {v ? (
          <ul className={n.lines}>
            <li className={n.line}>
              <div>
                <p className={n.lineTitle}>Vérification</p>
                <p className={n.lineText}>
                  {v.verification.provenance ?? "Aucune lecture datée d'une page officielle n'est tracée pour cette source."}
                </p>
              </div>
              <VerificationMark state={v.verification.state} date={v.verification.date} />
            </li>
            <li className={n.line}>
              <div>
                <p className={n.lineTitle}>Lien officiel</p>
                <p className={n.lineText}>
                  {v.link.entry
                    ? `Relevé le ${formatDate(veille!.linksCheckedAt ?? veille!.arreteAu)} : HTTP ${v.link.entry.httpStatus ?? "—"}${
                        v.link.entry.finalUrl && v.link.state === "redirige" ? `, arrivée sur ${v.link.entry.finalUrl}` : ""
                      }.`
                    : LINK_OUTCOME_LABEL[v.link.state]}
                </p>
              </div>
              <LinkMark state={v.link.state} />
            </li>
          </ul>
        ) : (
          <p className={n.empty}>Aucune veille arrêtée : la fraîcheur de cette source n&apos;est pas établie.</p>
        )}
        {evolutions.length > 0 ? (
          <ul className={n.lines} style={{ marginTop: 24 }}>
            {evolutions.map((e) => (
              <li key={e.id} className={n.line}>
                <div>
                  <p className={n.lineTitle}>
                    <Link href={`/normatif/veille?evolution=${e.id}`} className={n.linkQuiet}>
                      {e.title}
                    </Link>
                  </p>
                  <p className={n.lineText}>
                    {EVOLUTION_KIND_LABEL[e.kind]} · {e.effectiveRule}
                  </p>
                  <p className={n.lineNote}>{e.outdatedInProbant}</p>
                </div>
                <EvolutionMark timing={e.timing} integration={e.integration} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className={p.section} aria-labelledby="cycles-t">
        <SectionHead id="cycles-t" numeral="ii" title="Cycles rattachés" note={`${referencing.length}`} />
        {referencing.length === 0 ? (
          <p className={n.empty}>Aucun cycle ne cite directement cette source.</p>
        ) : (
          <ul className={n.chips} style={{ fontSize: 15 }}>
            {referencing.map((c) => (
              <li key={c.slug}>
                <Link href={`/normatif/cycles/${c.slug}`}>{c.title}</Link>
              </li>
            ))}
          </ul>
        )}
        {docs.length > 0 ? (
          <p className={p.note}>
            Citée aussi par la méthodologie : {docs.map((d) => d.title).join(", ")}.
          </p>
        ) : null}
      </section>
    </>
  );
}
