import { loadAllMethodology } from "@/lib/audit-cycles/loader";
import { validateAll } from "@/lib/audit-cycles/validation";
import { PageHeader } from "@/components/probant/PageHeader";
import { ValidationReport } from "@/components/normatif/ValidationReport";
import { NormativeStatusBadge } from "@/components/normatif/NormativeStatusBadge";
import type { NormativeStatus } from "@/lib/audit-cycles/types";

export default async function MethodologiePage() {
  const [docs, validation] = await Promise.all([loadAllMethodology(), validateAll()]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader
        title="Méthodologie & contrôles qualité"
        subtitle="Matérialité, échantillonnage, assertions, procédures analytiques, fraude et preuves d'audit — et rapport de validation du référentiel."
      />

      {docs.length > 0 ? (
        <div className="space-y-4">
          {docs.map((doc) => (
            <article
              key={doc.slug}
              className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-[var(--pb-text)]">
                  {doc.title}
                </h3>
                {doc.status && <NormativeStatusBadge status={doc.status} short />}
              </div>
              {doc.description && (
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--pb-text-muted)]">
                  {doc.description}
                </p>
              )}
              <div className="mt-3">
                <ContentTree value={doc.content} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--pb-border)] px-3 py-4 text-[12px] text-[var(--pb-text-faint)]">
          Les documents méthodologiques (matérialité, échantillonnage…) seront
          ajoutés dans <code>data/methodology/</code>.
        </p>
      )}

      <h2 className="mb-3 mt-8 text-[15px] font-bold text-[var(--pb-text)]">
        Rapport de validation du référentiel
      </h2>
      <ValidationReport result={validation} />
    </div>
  );
}

const STATUS_VALUES = new Set([
  "OBLIGATOIRE",
  "RECOMMANDE",
  "BONNE_PRATIQUE",
  "PARAMETRABLE",
  "A_VALIDER",
]);

/** Rendu générique récursif du contenu YAML d'un document méthodologique. */
function ContentTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    if (STATUS_VALUES.has(value)) {
      return <NormativeStatusBadge status={value as NormativeStatus} short />;
    }
    return <span className="text-[12px] text-[var(--pb-text-muted)]">{value}</span>;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="tnum text-[12px] text-[var(--pb-text-muted)]">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1.5">
        {value.map((item, i) => (
          <li
            key={i}
            className="rounded-md border border-[var(--pb-border)]/60 bg-[var(--pb-surface-2)] px-2.5 py-1.5"
          >
            <ContentTree value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    return (
      <dl className="space-y-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <dt className="shrink-0 text-[11px] font-medium capitalize text-[var(--pb-text-faint)] sm:w-40">
              {k}
            </dt>
            <dd className="min-w-0 flex-1">
              <ContentTree value={v} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return null;
}
