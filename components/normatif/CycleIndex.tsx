"use client";

import { useState } from "react";
import Link from "next/link";
import type { CycleIndexFamily, CycleIndexItem } from "@/lib/audit-cycles/view";
import { REVIEW_STATUS_LABEL } from "@/lib/audit-cycles/types";
import p from "@/components/charte/page.module.css";
import { VeilleGlyph } from "./VeilleMarks";
import n from "./normatif.module.css";

/**
 * Index typographique des cycles, par famille (même lecture que la section 04 de la landing), avec un panneau
 * d'aperçu : survoler ou atteindre un cycle au clavier l'affiche à droite (dès 1080 px de contenu) ; cliquer
 * ouvre la fiche. Repères de veille : carré plein = évolution en vigueur non intégrée qui touche le cycle.
 */
export function CycleIndex({ families }: { families: CycleIndexFamily[] }) {
  const first = families[0]?.items[0] ?? null;
  const [active, setActive] = useState<CycleIndexItem | null>(first);

  return (
    <div className={n.indexSplit}>
      <div className={n.families}>
        {families.map((family) => (
          <div key={family.id}>
            <div className={n.familyHead}>
              <span>{family.title}</span>
              <span>{family.count}</span>
            </div>
            <ol className={n.familyList}>
              {family.items.map((item) => (
                <li
                  key={item.slug}
                  className={n.familyItem}
                  data-active={active?.slug === item.slug ? "" : undefined}
                  onMouseEnter={() => setActive(item)}
                  onFocus={() => setActive(item)}
                >
                  <span className={n.itemNum}>{item.n}</span>
                  <Link href={`/normatif/cycles/${item.slug}`}>{item.title}</Link>
                  <span className={n.itemFlags}>
                    {item.veilleEnVigueur.length > 0 ? (
                      <span
                        role="img"
                        title={`Veille : ${item.veilleEnVigueur.join(", ")}`}
                        aria-label={`Évolution en vigueur à intégrer : ${item.veilleEnVigueur.join(", ")}`}
                      >
                        <VeilleGlyph glyph="sq-fill" size={8} />
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {active ? (
        <aside className={`${p.panel} ${n.preview} ${n.plane2}`} aria-label="Aperçu du cycle">
          <div className={p.panelSection}>
            <p className={p.key}>
              {active.n} · {active.familyTitle}
            </p>
            <h3 className={p.panelTitle}>{active.title}</h3>
            <p className={n.lineText}>{active.summary}</p>
            {active.pcgAccounts.length > 0 ? (
              <p className={n.codes} style={{ marginTop: 12 }}>
                {active.pcgAccounts.map((c) => (
                  <span key={c} className={n.code}>
                    {c}
                  </span>
                ))}
              </p>
            ) : null}
            <dl className={n.previewCounts}>
              <div>
                <dt>Normes</dt>
                <dd>{active.counts.normes}</dd>
              </div>
              <div>
                <dt>Procédures</dt>
                <dd>{active.counts.procedures + active.counts.tests}</dd>
              </div>
              <div>
                <dt>Risques</dt>
                <dd>
                  {active.counts.risques}
                  {active.counts.fraude > 0 ? <small className={n.tag}> dont {active.counts.fraude} fraude</small> : null}
                </dd>
              </div>
            </dl>
          </div>
          <div className={p.panelSection}>
            <p className={n.statusMark}>
              <VeilleGlyph glyph={active.veilleEnVigueur.length > 0 ? "sq-fill" : active.veilleAVenir.length > 0 ? "sq-line" : "dot"} />
              {active.veilleEnVigueur.length > 0
                ? `Veille : ${active.veilleEnVigueur.join(", ")} à intégrer`
                : active.veilleAVenir.length > 0
                  ? `Veille : ${active.veilleAVenir.join(", ")} à venir`
                  : "Veille : aucune évolution connue"}
            </p>
            <p className={n.lineNote}>Revue : {REVIEW_STATUS_LABEL[active.reviewStatus].toLowerCase()}</p>
            <Link href={`/normatif/cycles/${active.slug}`} className={p.btnSecondary} style={{ marginTop: 14 }}>
              Ouvrir la fiche →
            </Link>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
