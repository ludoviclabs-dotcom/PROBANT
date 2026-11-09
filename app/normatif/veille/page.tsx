import Link from "next/link";
import { loadVeilleReport } from "@/lib/audit-cycles/loader";
import { SectionHead } from "@/components/charte/InstrumentPage";
import { VeilleAge } from "@/components/normatif/VeilleAge";
import { VeilleExplorer } from "@/components/normatif/VeilleExplorer";
import { LinkMark, VerificationMark, formatDate } from "@/components/normatif/VeilleMarks";
import p from "@/components/charte/page.module.css";
import n from "@/components/normatif/normatif.module.css";

export const metadata = { title: "Veille normative" };

export default async function VeillePage() {
  const veille = await loadVeilleReport();

  if (!veille) {
    return (
      <>
        <header className={p.intro}>
          <div className={p.introMain}>
            <p className={p.eyebrow}>Audit Normatif 360 · veille</p>
            <h1 className={p.title}>Veille normative</h1>
            <p className={p.lead}>
              Aucune veille n&apos;est arrêtée (<code>data/veille/veille.yml</code> absent) : la fraîcheur des sources
              n&apos;est pas établie. Ce n&apos;est pas une absence d&apos;écart.
            </p>
          </div>
        </header>
      </>
    );
  }

  const c = veille.counts;
  const queue = veille.sources.filter((s) => s.queue.rank <= 4);
  const exposed = veille.cycles.filter((x) => x.enVigueur.length + x.aVenir.length + x.deadLinks.length > 0);
  const maxCells = Math.max(1, ...exposed.map((x) => x.enVigueur.length + x.aVenir.length + x.deadLinks.length));

  return (
    <>
      <header className={p.intro}>
        <div className={p.introMain}>
          <p className={p.eyebrow}>
            Audit Normatif 360 · veille arrêtée au {formatDate(veille.arreteAu)} (<VeilleAge arreteAu={veille.arreteAu} />)
          </p>
          <h1 className={p.title}>Veille normative</h1>
          <p className={p.lead}>
            Ce que le référentiel affiche et que les textes officiels ont changé depuis : normes révisées ou remplacées,
            règlements entrés en vigueur, adresses officielles déplacées. Chaque évolution cite la page officielle lue et
            sa date de lecture ; les dates sont jugées à la date d&apos;arrêté, pas au jour de l&apos;affichage.
          </p>
        </div>
        <div className={p.introAside}>
          <dl className={p.readouts}>
            <div>
              <dt>En vigueur, à reprendre</dt>
              <dd>{c.enVigueurAIntegrer + c.sansDateAIntegrer}</dd>
            </div>
            <div>
              <dt>À venir</dt>
              <dd>{c.aVenirAIntegrer}</dd>
            </div>
            <div>
              <dt>Cycles concernés</dt>
              <dd>
                {c.cyclesExposes}
                <span className={p.readoutNote}> / {veille.cycles.length}</span>
              </dd>
            </div>
            <div>
              <dt>Liens introuvables</dt>
              <dd>{c.liens.introuvable + c.liens.injoignable}</dd>
            </div>
          </dl>
        </div>
      </header>

      {veille.issues.length > 0 ? (
        <div className={`${n.exposure} ${n.plane2}`} role="alert">
          <h2>La veille elle-même est incohérente</h2>
          <ul className={n.exposureList}>
            {veille.issues.map((issue, i) => (
              <li key={i}>
                <code className={p.mono}>{issue.field}</code> — {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className={p.section} aria-labelledby="frise-t">
        <SectionHead id="frise-t" numeral="i" title="Évolutions normatives" note={`${c.evolutions} relevées, par date d'effet`} />
        <VeilleExplorer evolutions={veille.evolutions} arreteAu={veille.arreteAu} />
      </section>

      <section className={p.section} aria-labelledby="cycles-t">
        <SectionHead id="cycles-t" numeral="ii" title="Cycles concernés" note="une case par évolution ou lien mort qui touche la fiche" />
        {exposed.length === 0 ? (
          <p className={n.empty}>Aucun cycle n&apos;est touché par une évolution non intégrée.</p>
        ) : (
          <ol className={n.bars}>
            {exposed.map((x, i) => {
              const cells = [
                ...x.enVigueur.map((e) => ({ kind: "en_vigueur", label: e.short })),
                ...x.aVenir.map((e) => ({ kind: "a_venir", label: e.short })),
                ...x.deadLinks.map((id) => ({ kind: "lien", label: id })),
              ];
              return (
                <li key={x.slug} className={n.bar}>
                  <Link href={`/normatif/cycles/${x.slug}`} className={n.linkQuiet}>
                    {x.title}
                  </Link>
                  <span
                    className={n.barTrack}
                    role="img"
                    aria-label={`Évolutions : ${[...x.enVigueur, ...x.aVenir].map((e) => e.short).join(", ") || "aucune"}${
                      x.deadLinks.length > 0 ? ` ; liens introuvables : ${x.deadLinks.join(", ")}` : ""
                    }`}
                    style={{ maxWidth: `${(cells.length / maxCells) * 100}%` }}
                  >
                    {cells.map((cell, j) => (
                      <span
                        key={`${cell.kind}-${cell.label}`}
                        className={n.barCell}
                        data-kind={cell.kind}
                        title={cell.label}
                        style={{ animationDelay: `${Math.min(i * 30 + j * 40, 900)}ms` }}
                      />
                    ))}
                  </span>
                  <span className={n.barNote}>
                    {x.enVigueur.length} en vigueur · {x.aVenir.length} à venir
                    {x.deadLinks.length > 0 ? ` · ${x.deadLinks.length} lien${x.deadLinks.length > 1 ? "s" : ""}` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <p className={n.legend}>
          <span>
            <span className={n.barCell} data-kind="en_vigueur" style={{ display: "inline-block" }} /> évolution en vigueur
          </span>
          <span>
            <span className={n.barCell} data-kind="a_venir" style={{ display: "inline-block" }} /> évolution à venir
          </span>
          <span>
            <span className={n.barCell} data-kind="lien" style={{ display: "inline-block" }} /> source au lien introuvable
          </span>
        </p>
      </section>

      <section className={p.section} aria-labelledby="file-t">
        <SectionHead
          id="file-t"
          numeral="iii"
          title="File de revue des sources"
          note={`${queue.length} à reprendre · ${c.jamaisVerifiees} jamais vérifiées`}
          action={
            <Link href="/normatif/sources" className={p.btnQuiet}>
              Tout le registre →
            </Link>
          }
        />
        <div className={p.scrollX} role="region" aria-label="File de revue — défilement horizontal" tabIndex={0}>
          <table className={p.register} style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">À reprendre</th>
                <th scope="col">Vérification</th>
                <th scope="col">Lien</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className={n.registerSource}>
                    <span className={n.tag}>{s.type}</span>
                    <br />
                    <Link href={`/normatif/sources/${s.id}`}>{s.label}</Link>
                  </th>
                  <td>
                    <ul className={n.riskList} style={{ marginTop: 0 }}>
                      {s.queue.reasons.map((r, i) => (
                        <li key={i}>· {r}</li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <VerificationMark state={s.verification.state} date={s.verification.date} />
                  </td>
                  <td>
                    <LinkMark state={s.link.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={p.section} aria-labelledby="methode-t">
        <SectionHead id="methode-t" numeral="iv" title="Méthode et limites" />
        <dl className={n.method}>
          <dt>Périmètre</dt>
          <dd>{veille.perimetre}</dd>
          <dt>Trois contrôles, jamais fondus</dt>
          <dd>
            Vérification datée (lecture d&apos;une page officielle, au-delà de {veille.reverificationDays} jours elle est à
            refaire), lien officiel (relevé HTTP), évolutions connues (date d&apos;effet et intégration dans le contenu).
            La file de revue les ordonne sans les additionner : une évolution en vigueur non intégrée passe avant un lien
            mort, qui passe avant une révision à venir.
          </dd>
          <dt>Relevé des liens</dt>
          <dd>
            {veille.linksCheckedAt ? `Effectué le ${formatDate(veille.linksCheckedAt)}` : "Jamais effectué"} par{" "}
            <code>npm run normatif:liens</code>. Légifrance et iaasb.org refusent les robots (réponse 403) : ces liens sont
            « à ouvrir à la main », pas morts. Un lien joignable ne vaut pas vérification du contenu.
          </dd>
          <dt>Méthode de la veille</dt>
          <dd>{veille.methode}</dd>
          <dt>Ce que la veille ne fait pas</dt>
          <dd>
            Elle ne se met pas à jour seule et ne réécrit aucune fiche : intégrer une évolution reste une revue experte.
            Au-delà de 90 jours, son âge passe en signal dans le bandeau.
          </dd>
        </dl>
      </section>
    </>
  );
}
