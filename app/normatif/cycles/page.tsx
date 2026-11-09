import Link from "next/link";
import { loadAllCycles, loadVeilleReport } from "@/lib/audit-cycles/loader";
import { CYCLE_FAMILIES, REVIEW_STATUS_LABEL, type CycleFamily } from "@/lib/audit-cycles/types";
import { CYCLE_FAMILY_TITLE, buildCycleIndex } from "@/lib/audit-cycles/view";
import { VeilleGlyph } from "@/components/normatif/VeilleMarks";
import p from "@/components/charte/page.module.css";
import n from "@/components/normatif/normatif.module.css";

export const metadata = { title: "Cycles d'audit" };

export default async function CyclesListPage({
  searchParams,
}: {
  searchParams: Promise<{ famille?: string; fraude?: string }>;
}) {
  const params = await searchParams;
  const [cycles, veille] = await Promise.all([loadAllCycles(), loadVeilleReport()]);
  const exposure = new Map((veille?.cycles ?? []).map((c) => [c.slug, c]));

  const activeFamily = CYCLE_FAMILIES.some((f) => f.id === params.famille) ? (params.famille as CycleFamily) : undefined;
  const fraudeOnly = params.fraude === "1";

  // Même numéro et même ordre que l'index de la vue d'ensemble et que la section 04 de la landing.
  const numberOf = new Map(buildCycleIndex(cycles, veille).flatMap((f) => f.items.map((i) => [i.slug, i.n] as const)));
  let filtered = [...cycles].sort((a, b) => (numberOf.get(a.slug) ?? "").localeCompare(numberOf.get(b.slug) ?? ""));
  if (activeFamily) filtered = filtered.filter((c) => c.family === activeFamily);
  if (fraudeOnly) filtered = filtered.filter((c) => (c.risks ?? []).some((r) => r.category === "RISQUE_FRAUDE"));

  return (
    <>
      <header className={p.intro}>
        <div className={p.introMain}>
          <p className={p.eyebrow}>Audit Normatif 360 · registre des fiches</p>
          <h1 className={p.title}>Cycles d&apos;audit</h1>
          <p className={p.lead}>
            {filtered.length} cycle{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""} sur{" "}
            {cycles.length}. Filtrer par famille, ou ne garder que les cycles qui portent un risque de fraude (ISA 240 /
            NEP 240).
          </p>
        </div>
      </header>

      {/*
        Filtres : liens HTML ordinaires (chargement de document), pas `next/link`. Passer d'un filtre à l'autre
        garde la page montée ; la navigation client restait alors suspendue au milieu du rendu en flux de la
        nouvelle liste, sans jamais se valider (React canary de Next 15.5.27, relevé le 14/10/2026 ; `loading.tsx`
        ne s'applique pas, sa frontière étant conservée d'un paramètre de recherche à l'autre).
      */}
      <nav aria-label="Filtres des cycles" className={p.toolbar}>
        <span className={p.toggleGroup}>
          <span className={p.key}>Famille</span>
          <FilterLink href="/normatif/cycles" active={!activeFamily && !fraudeOnly}>
            Toutes
          </FilterLink>
          {CYCLE_FAMILIES.map((f) => (
            <FilterLink key={f.id} href={`/normatif/cycles?famille=${f.id}`} active={activeFamily === f.id}>
              {f.short}
            </FilterLink>
          ))}
        </span>
        <span className={`${p.toggleGroup} ${p.toolbarEnd}`}>
          <FilterLink href="/normatif/cycles?fraude=1" active={fraudeOnly}>
            Risque de fraude
          </FilterLink>
        </span>
      </nav>

      {filtered.length === 0 ? (
        <p className={n.empty}>
          Aucun cycle ne correspond à ce filtre.{" "}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- chargement de document voulu */}
          <a href="/normatif/cycles">Réinitialiser</a>
        </p>
      ) : (
        <ol className={n.rows} style={{ marginTop: 24 }} aria-label="Cycles d'audit">
          {filtered.map((c) => {
            const fraud = (c.risks ?? []).filter((r) => r.category === "RISQUE_FRAUDE").length;
            const e = exposure.get(c.slug);
            return (
              <li key={c.slug} className={n.row}>
                <span className={n.itemNum}>{numberOf.get(c.slug)}</span>
                <div>
                  <h2 className={n.rowTitle}>
                    <Link href={`/normatif/cycles/${c.slug}`}>{c.title}</Link>
                  </h2>
                  <p className={n.rowSummary}>{c.summary}</p>
                </div>
                <div className={n.rowMeta}>
                  <span className={n.tag}>{CYCLE_FAMILY_TITLE[c.family]}</span>
                  {c.pcgAccounts?.length ? (
                    <p className={n.codes} style={{ marginTop: 6 }}>
                      {c.pcgAccounts.slice(0, 5).map((a) => (
                        <span key={a} className={n.code}>
                          {a}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
                <div className={n.rowMeta}>
                  {REVIEW_STATUS_LABEL[c.reviewStatus]}
                  {fraud > 0 ? (
                    <>
                      <br />
                      <span className={n.statusMark}>
                        <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                          <path d="M5 1.2 9.2 8.8H.8z" style={{ fill: "var(--pb-sev-majeur)" }} />
                        </svg>
                        {fraud} risque{fraud > 1 ? "s" : ""} de fraude
                      </span>
                    </>
                  ) : null}
                </div>
                <div className={n.rowMeta}>
                  {e && e.enVigueur.length > 0 ? (
                    <span className={n.statusMark} style={{ whiteSpace: "normal" }}>
                      <VeilleGlyph glyph="sq-fill" />
                      {e.enVigueur.map((x) => x.short).join(", ")} à intégrer
                    </span>
                  ) : e && e.aVenir.length > 0 ? (
                    <span className={n.statusMark} style={{ whiteSpace: "normal" }}>
                      <VeilleGlyph glyph="sq-line" />
                      {e.aVenir.map((x) => x.short).join(", ")} à venir
                    </span>
                  ) : (
                    <span className={n.statusMark}>
                      <VeilleGlyph glyph="dot" />
                      Aucune évolution connue
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {activeFamily ? <p className={p.note}>Famille : {CYCLE_FAMILY_TITLE[activeFamily]}</p> : null}
    </>
  );
}

/** Filtre : lien HTML ordinaire (voir plus haut), souligné quand il est actif. */
function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a href={href} className={p.toggle} aria-current={active ? "true" : undefined}>
      {children}
    </a>
  );
}
