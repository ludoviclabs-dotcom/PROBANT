"use client";

import { SEVERITY_LABEL, type Finding } from "@/lib/canonical-model/finding";
import type { ChainView } from "@/lib/synthese-view/chain";
import type { ReviewStage } from "@/lib/synthese-view/review";
import s from "./synthese.module.css";

const KINDS = ["tick", "tick", "square", "circle", "decision"] as const;

/**
 * Chaîne de preuve d'un constat : source → transformation → règle → résultat → décision, reliée par la ligne de
 * preuve. Chaque maillon est un bouton qui dit sa phrase ; « Valider » et « Écarter » écrivent un événement de revue
 * dans le dossier (journal append-only, chaîne de hachage) : les compteurs, l'ajustement proposé et le verdict se
 * relisent ensuite dans le snapshot recalculé. Aucune validation ne vaut certification.
 */
export function EvidenceChain({
  options,
  selectedId,
  onSelect,
  chain,
  stage,
  node,
  onNode,
  busy,
  error,
  onDecide,
}: {
  options: readonly Finding[];
  selectedId: string;
  onSelect: (id: string) => void;
  chain: ChainView;
  stage: ReviewStage;
  node: number;
  onNode: (index: number) => void;
  busy: boolean;
  error: string;
  onDecide: (status: "confirmed" | "dismissed" | "pending") => void;
}) {
  const decided = stage !== "pending";
  const validated = stage === "proposed" || stage === "corrected";

  return (
    <div id="chaine" tabIndex={-1} className={s.chainBlock}>
      <label className={s.chainSelect}>
        <span>Constat</span>
        <select value={selectedId} onChange={(event) => onSelect(event.target.value)}>
          {options.map((f) => (
            <option key={f.id} value={f.id}>
              {f.id} · {SEVERITY_LABEL[f.severity]} · {f.titre}
            </option>
          ))}
        </select>
      </label>
      <div role="region" aria-label="Chaîne de preuve" tabIndex={0} className={s.scrollX}>
        <div className={s.chainWrap}>
          <span aria-hidden="true" className={s.chainLine} />
          <span aria-hidden="true" className={s.chainLast} data-decision={validated ? "validated" : stage === "dismissed" ? "dismissed" : undefined} />
          <ol className={s.chain}>
            {chain.nodes.map((item, i) => (
              <li key={item.step} className={s.chainNode}>
                <button type="button" aria-pressed={node === i} aria-label={`${item.step} : ${item.detail}`} className={s.chainMarkButton} onClick={() => onNode(i)}>
                  <span className={s.chainMark} data-kind={KINDS[i]} data-on={node === i ? "" : undefined} data-decision={i === 4 ? (validated ? "validated" : undefined) : undefined} />
                </button>
                <div className={s.chainStep} data-on={node === i ? "" : undefined}>{item.step}</div>
                <div className={s.chainDetail} data-on={node === i ? "" : undefined} data-missing={item.missing ? "" : undefined}>{item.detail}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className={s.chainFoot}>
        <p aria-live="polite" className={s.chainFocus}>{chain.focus[node]}</p>
        <div className={s.chainButtons}>
          <button type="button" disabled={busy} aria-pressed={validated} className={s.chainValidate} onClick={() => onDecide("confirmed")}>
            Valider
          </button>
          <button type="button" disabled={busy} aria-pressed={stage === "dismissed"} className={s.chainDismiss} onClick={() => onDecide("dismissed")}>
            Écarter
          </button>
          {decided && (
            <button type="button" disabled={busy} className={s.linkButton} onClick={() => onDecide("pending")}>
              Annuler la décision
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className={s.chainError}>{error}</p>}
    </div>
  );
}
