"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InstrumentPage, PageIntro, SectionHead } from "@/components/charte/InstrumentPage";
import p from "@/components/charte/page.module.css";
import { CycleDemonstration } from "@/components/probant/CycleDemonstration";
import type { MissionRegime } from "@/lib/audit/procedures";
import { useActiveDossierSnapshot } from "@/lib/dossier/client";
import { buildWorkQueue, filterQueue, keepSelection, type QueueShow } from "@/lib/tests-view/queue";
import { ProcedureArticle } from "./ProcedureArticle";
import { ProcedureIndex } from "./ProcedureIndex";
import { RegimeSection } from "./RegimeSection";
import { WorkQueueStrip } from "./WorkQueueStrip";
import x from "./tests.module.css";

type Reading = "one" | "all";

/**
 * Tests complémentaires — C03. La procédure proposée vient du résolveur (règle et objectif du constat), jamais du seul
 * silo ; un constat sans procédure connue reste « Procédure à définir ». Le régime de la mission n'est pas renseigné
 * dans le dossier : il est choisi à l'écran et ne modifie que les références rappelées, jamais les constats. Deux
 * lectures : un constat à la fois (index + détail, par défaut) ou toutes les réponses dépliées.
 */
export function TestsView() {
  const snapshot = useActiveDossierSnapshot();
  const [regime, setRegime] = useState<MissionRegime>("non_renseigne");
  const [reading, setReading] = useState<Reading>("one");
  const [showChoice, setShow] = useState<QueueShow>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queue = useMemo(() => buildWorkQueue(snapshot.findings), [snapshot.findings]);
  // Un dossier sans procédure à définir n'offre pas ce filtre : la liste reste entière.
  const show: QueueShow = queue.toDefine === 0 ? "all" : showChoice;
  const visible = useMemo(() => filterQueue(queue.items, show), [queue.items, show]);
  const current = keepSelection(visible, selectedId);
  const selected = visible.find((i) => i.finding.id === current) ?? null;
  const synthetic = snapshot.dossier.organizationId === "SYNTHETIC-DEMO";

  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusPending = useRef(false);
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    titleRef.current?.focus();
  }, [current]);

  function select(id: string) {
    focusPending.current = id !== current;
    setSelectedId(id);
    if (id === current) titleRef.current?.focus();
  }

  return (
    <InstrumentPage className={x.bridge}>
      <PageIntro
        index="07"
        title="Tests complémentaires"
        lead={
          <>
            Lorsqu’un constat laisse penser à une anomalie significative, une réponse au risque est proposée par constat : objectif, assertions NEP 500 §09, population, source et étapes.{" "}
            <strong>Les propositions ne sont ni des conclusions ni des procédures exigées.</strong>
          </>
        }
      />

      <CycleDemonstration />

      <RegimeSection regime={regime} onRegime={setRegime} exercice={snapshot.dossier.societe.exercice} />

      <section aria-labelledby="tests-list-title" className={p.section}>
        <SectionHead id="tests-list-title" title="Réponse proposée par constat" note="familles droit dur et présomption · gravité informative exclue" />

        {queue.total > 0 && <WorkQueueStrip queue={queue} />}

        {queue.items.length === 0 ? (
          <p className={x.empty}>
            {synthetic
              ? "Aucun constat historique dans ce scénario : les tests viennent des feuilles exécutées dans le laboratoire."
              : "Aucun constat ne requiert de test complémentaire dans ce dossier."}
          </p>
        ) : (
          <>
            <div className={`${p.toolbar} ${x.readingBar}`}>
              <span className={p.toggleGroup} role="group" aria-label="Lecture">
                <span className={p.key} aria-hidden="true">
                  Lecture
                </span>
                <button type="button" className={`${p.toggle} ${x.toggle}`} aria-pressed={reading === "one"} onClick={() => setReading("one")}>
                  un constat à la fois
                </button>
                <button type="button" className={`${p.toggle} ${x.toggle}`} aria-pressed={reading === "all"} onClick={() => setReading("all")}>
                  tout dérouler
                </button>
              </span>
              <span className={p.toggleGroup} role="group" aria-label="Afficher">
                <span className={p.key} aria-hidden="true">
                  Afficher
                </span>
                <button type="button" className={`${p.toggle} ${x.toggle}`} aria-pressed={show === "all"} onClick={() => setShow("all")}>
                  tous
                </button>
                <button type="button" className={`${p.toggle} ${x.toggle}`} aria-pressed={show === "to_define"} disabled={queue.toDefine === 0} onClick={() => setShow("to_define")}>
                  à définir <span className={p.mono}>{queue.toDefine}</span>
                </button>
              </span>
              <span className={`${p.toolbarEnd} ${p.faint}`} role="status" aria-live="polite">
                {visible.length} {visible.length > 1 ? "réponses" : "réponse"}
              </span>
            </div>

            {reading === "one" ? (
              <div className={`${p.split} ${x.split}`}>
                <ProcedureIndex items={visible} selectedId={current} onSelect={select} />
                <div className={x.detail}>{selected && <ProcedureArticle key={selected.finding.id} ref={titleRef} item={selected} />}</div>
              </div>
            ) : (
              <ul className={x.list}>
                {visible.map((item) => (
                  <li key={item.finding.id} className={x.listItem}>
                    <ProcedureArticle item={item} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </InstrumentPage>
  );
}
