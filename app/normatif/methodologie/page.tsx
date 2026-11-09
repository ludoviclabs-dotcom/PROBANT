import Link from "next/link";
import { loadAllMethodology, loadVeilleReport } from "@/lib/audit-cycles/loader";
import { validateAll } from "@/lib/audit-cycles/validation";
import { isOpen } from "@/lib/audit-cycles/veille";
import type { NormativeStatus } from "@/lib/audit-cycles/types";
import { SectionHead } from "@/components/charte/InstrumentPage";
import { NormativeStatusBadge } from "@/components/normatif/NormativeStatusBadge";
import { ValidationReport } from "@/components/normatif/ValidationReport";
import { EvolutionMark } from "@/components/normatif/VeilleMarks";
import p from "@/components/charte/page.module.css";
import n from "@/components/normatif/normatif.module.css";

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

/** Libellés français des clés YAML des documents de méthode ; une clé inconnue est lisiblement dé-camélisée. */
const KEY_LABEL: Record<string, string> = {
  status: "Force",
  description: "Description",
  name: "Nom",
  sourceIds: "Sources",
  title: "Titre",
  definition: "Définition",
  tests: "Tests",
  range: "Fourchette",
  benchmark: "Base de référence",
  benchmarks: "Bases de référence",
  applicability: "Quand l'utiliser",
  items: "Éléments",
  id: "Identifiant",
  label: "Libellé",
  caveat: "Réserve",
  principle: "Principe",
  principles: "Principes",
  note: "Note",
  types: "Types",
  investigationTrigger: "Déclencheur d'investigation",
  assertions: "Assertions",
  reliabilityHierarchy: "Hiérarchie de fiabilité",
  levels: "Niveaux",
  specificEvidence: "Éléments probants spécifiques",
  presumptions: "Présomptions",
  fraudTriangle: "Triangle de la fraude",
  factors: "Facteurs",
  procedures: "Procédures",
  anticorruption: "Anticorruption",
  defaultPractices: "Pratiques usuelles",
  globalMateriality: "Seuil de signification global",
  performanceMateriality: "Seuil de performance",
  clearlyTrivialThreshold: "Seuil clairement insignifiant",
  methods: "Méthodes",
};

function keyLabel(key: string): string {
  if (KEY_LABEL[key]) return KEY_LABEL[key];
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const metadata = { title: "Méthodologie et contrôles qualité" };

export default async function MethodologiePage() {
  const [docs, validation, veille] = await Promise.all([loadAllMethodology(), validateAll(), loadVeilleReport()]);
  const evolutionsFor = (slug: string) =>
    (veille?.evolutions ?? []).filter((e) => isOpen(e.integration) && e.methodology.some((m) => m.slug === slug));

  return (
    <>
      <header className={p.intro}>
        <div className={p.introMain}>
          <p className={p.eyebrow}>Audit Normatif 360 · méthode</p>
          <h1 className={p.title}>Méthodologie et contrôles qualité</h1>
          <p className={p.lead}>
            Matérialité, échantillonnage, assertions, procédures analytiques, fraude et éléments probants — puis le rapport
            de validation du référentiel. Le principe vient des normes ; les fourchettes chiffrées restent des pratiques à
            adapter et à documenter.
          </p>
        </div>
      </header>

      {docs.length > 0 ? (
        docs.map((doc, i) => {
          const evs = evolutionsFor(doc.slug);
          return (
            <section key={doc.slug} className={p.section} aria-labelledby={`doc-${doc.slug}`}>
              <SectionHead
                id={`doc-${doc.slug}`}
                numeral={ROMAN[i]}
                title={doc.title}
                note={doc.status ? <NormativeStatusBadge status={doc.status} short /> : undefined}
              />
              {doc.description ? <p className={p.lead} style={{ marginTop: 0 }}>{doc.description}</p> : null}
              {evs.length > 0 ? (
                <div className={`${n.exposure} ${n.plane2}`} style={{ marginTop: 16 }}>
                  <ul className={n.exposureList} style={{ marginTop: 0 }}>
                    {evs.map((e) => (
                      <li key={e.id} style={{ borderTop: 0 }}>
                        <EvolutionMark timing={e.timing} integration={e.integration} />{" "}
                        <Link href={`/normatif/veille?evolution=${e.id}`} className={n.linkQuiet}>
                          {e.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div style={{ marginTop: 20 }}>
                <ContentTree value={doc.content} />
              </div>
            </section>
          );
        })
      ) : (
        <p className={n.empty}>
          Les documents méthodologiques (matérialité, échantillonnage…) seront ajoutés dans <code>data/methodology/</code>.
        </p>
      )}

      <section className={p.section} aria-labelledby="validation-t">
        <SectionHead id="validation-t" numeral={ROMAN[docs.length]} title="Rapport de validation du référentiel" />
        <ValidationReport result={validation} />
      </section>
    </>
  );
}

const STATUS_VALUES = new Set(["OBLIGATOIRE", "RECOMMANDE", "BONNE_PRATIQUE", "PARAMETRABLE", "A_VALIDER"]);

/** Rendu générique récursif du contenu YAML d'un document méthodologique, en lignes sous filets. */
function ContentTree({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    if (STATUS_VALUES.has(value)) return <NormativeStatusBadge status={value as NormativeStatus} short />;
    return <span>{value}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className={p.mono}>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string") && value.every((v) => /^[a-z0-9-]+$/.test(v as string))) {
      // Liste d'identifiants (sourceIds) : liens vers le registre.
      return (
        <span className={n.codes}>
          {(value as string[]).map((id) => (
            <Link key={id} href={`/normatif/sources/${id}`} className={n.code}>
              {id}
            </Link>
          ))}
        </span>
      );
    }
    return (
      <ul className={n.treeList}>
        {value.map((item, i) => (
          <li key={i}>
            <ContentTree value={item} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    return (
      <dl className={n.tree}>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className={n.treeRow}>
            <dt className={n.treeKey}>{keyLabel(k)}</dt>
            <dd className={n.treeValue} style={{ margin: 0 }}>
              <ContentTree value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return null;
}
