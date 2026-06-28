import { Download, ArrowRight, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/probant/PageHeader";
import { SeverityBadge, FamilyBadge } from "@/components/probant/Badges";
import { DEMO_DOSSIER } from "@/lib/demo/dataset";
import { allFindings } from "@/lib/canonical-model";

export default function DossierPage() {
  const d = DEMO_DOSSIER;
  const findings = allFindings(d).filter((f) => f.preuve.length > 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Dossier & preuve"
        subtitle="Pour chaque constat, la chaîne reconstituable : source → transformation → règle → résultat → décision. Exportable et vérifiable."
      >
        <a
          href="/api/export"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--pb-accent)] px-4 py-2 text-[13px] font-semibold text-[#06122a] hover:opacity-90"
        >
          <Download className="h-4 w-4" /> Exporter le review pack (JSON)
        </a>
      </PageHeader>

      {/* Bandeau traçabilité */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4 text-[12px] text-[var(--pb-text-muted)]">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--pb-accent)]" />
        <span>
          Dossier <span className="tnum text-[var(--pb-text)]">{d.id}</span> ·
          référentiel v.{d.referentielVersion} · empreinte FEC{" "}
          <span className="tnum">{d.fecFingerprint.slice(0, 12)}</span> · généré
          le {new Date(d.createdAt).toLocaleString("fr-FR")}
        </span>
      </div>

      <div className="space-y-3">
        {findings.map((f) => (
          <div
            key={f.id}
            className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={f.severity} />
              <FamilyBadge family={f.family} />
              <span className="text-sm font-semibold text-[var(--pb-text)]">
                {f.titre}
              </span>
              <code className="tnum ml-auto text-[11px] text-[var(--pb-text-faint)]">
                {f.id}
              </code>
            </div>

            {/* Chaîne de preuve horizontale */}
            <div className="mt-3 flex flex-wrap items-stretch gap-2">
              {f.preuve.map((p, i) => (
                <div key={i} className="flex items-stretch gap-2">
                  <div className="rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--pb-accent)]">
                      {p.etape}
                    </div>
                    <div className="mt-0.5 max-w-[240px] text-[11px] text-[var(--pb-text-muted)]">
                      {p.detail}
                    </div>
                  </div>
                  {i < f.preuve.length - 1 && (
                    <ArrowRight className="my-auto h-4 w-4 shrink-0 text-[var(--pb-text-faint)]" />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--pb-border)] pt-2 text-[11px] text-[var(--pb-text-faint)]">
              <span>
                Source :{" "}
                <span className="text-[var(--pb-accent)]">{f.source.ref}</span>
              </span>
              {f.comptesConcernes.length > 0 && (
                <span className="tnum">
                  Comptes : {f.comptesConcernes.join(", ")}
                </span>
              )}
              {f.lignesSource.length > 0 && (
                <span className="tnum">
                  Lignes FEC : {f.lignesSource.slice(0, 8).join(", ")}
                  {f.lignesSource.length > 8 ? "…" : ""}
                </span>
              )}
              <span>Règle : {f.ruleId} (v.{f.ruleVersion})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
