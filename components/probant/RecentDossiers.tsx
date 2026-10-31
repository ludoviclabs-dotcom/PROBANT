"use client";

import { useEffect, useId, useState } from "react";
import { SectionHead } from "@/components/charte/InstrumentPage";
import p from "@/components/charte/page.module.css";
import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import { type DossierContext, type DossierSnapshot } from "@/lib/dossier";
import { useActiveDossier } from "@/lib/dossier/client";
import { plural } from "@/lib/synthese-view/common";
import x from "./depot.module.css";

/**
 * Dossiers de session enregistrés dans ce navigateur, en lignes continues. Seul le dossier ouvert est marqué comme
 * tel : aucun statut n'est affiché que le snapshot ne porte pas.
 */
export function RecentDossiers() {
  const { context: activeContext, listSnapshots, selectDossier } = useActiveDossier();
  const [snapshots, setSnapshots] = useState<DossierSnapshot[]>([]);
  const base = useId();

  useEffect(() => {
    void listSnapshots().then(setSnapshots);
  }, [listSnapshots]);

  function contextOf(snapshot: DossierSnapshot): DossierContext {
    return {
      organizationId:
        snapshot.sourceKind === "demo" ? "demo" : activeContext.organizationId === "demo" ? "session" : activeContext.organizationId,
      dossierId: snapshot.dossier.id,
    };
  }

  return (
    <section aria-labelledby="depot-recent-title" className={p.section}>
      <SectionHead id="depot-recent-title" title="Reprendre un dossier" note="dossiers de session de ce navigateur" />
      {snapshots.length === 0 ? (
        <p className={x.note}>Aucun dossier de session n’est enregistré dans ce navigateur.</p>
      ) : (
        <ul className={x.dossiers}>
          {snapshots.map((snapshot, index) => {
            const societe = snapshot.dossier.societe;
            const nameId = `${base}-${index}`;
            const open = snapshot.dossier.id === activeContext.dossierId;
            return (
              <li key={snapshot.dossier.id} className={x.dossier}>
                <div className={x.dossierMain}>
                  <span id={nameId} className={x.dossierName}>
                    {societe.raisonSociale} <span className={p.faint}>· {societe.exercice}</span>
                  </span>
                  <span className={x.dossierMeta}>
                    {snapshot.findings.length} {plural(snapshot.findings.length, "constat")} ·{" "}
                    {snapshot.sourceDocuments.at(0)?.fileName ?? "aucun document source"}
                  </span>
                </div>
                {open && <span className={x.openMark}>ouvert</span>}
                <Link
                  href="/dashboard/cloisons?mode=live"
                  onClick={() => void selectDossier(contextOf(snapshot))}
                  aria-describedby={nameId}
                  className={x.rowLink}
                >
                  Reprendre
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className={x.newDossier}>
        <Link href="/dashboard/depot" className={p.btnSecondary}>
          Nouveau dossier
        </Link>
      </p>
    </section>
  );
}
