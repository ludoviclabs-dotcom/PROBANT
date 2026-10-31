"use client";

import { useMemo, useState } from "react";
import { FamilyRule } from "@/components/charte/FamilyRule";
import { InstrumentPage, PageIntro, SectionHead } from "@/components/charte/InstrumentPage";
import p from "@/components/charte/page.module.css";
import { FAMILY, FAMILY_ORDER, SEVERITY_LABEL, SEVERITY_ORDER } from "@/components/charte/severity";
import { FAMILY_STYLE } from "@/components/probant/severity";
import { ReferentielEdition } from "@/components/referentiel/ReferentielEdition";
import type { FindingFamily, Severity } from "@/lib/canonical-model/finding";
import { useActiveDossierSnapshot } from "@/lib/dossier/client";
import {
  CHAIN_FILTER_LABEL,
  EMPTY_FILTER,
  buildCompleteness,
  buildDossierEntries,
  decisionSentence,
  filterEntries,
  isFiltered,
  type ChainFilter,
  type DossierFilter,
} from "@/lib/dossier-view/chain";
import { plural } from "@/lib/synthese-view/common";
import { CompletenessMatrix } from "./CompletenessMatrix";
import { DossierEntry } from "./DossierEntry";
import x from "./dossier.module.css";

/** Entrées affichées d'emblée ; « Afficher les N autres » déroule la suite. */
const PAGE = 10;

const MARKER_LEGEND = [
  { kind: "source", label: "origine lue" },
  { kind: "step", label: "étape" },
  { kind: "result", label: "résultat" },
  { kind: "decision", label: "décision consignée" },
  { kind: "missing", label: "absent ou en attente" },
] as const;

type ExportState = { tone: "idle" | "busy" | "done" | "error"; text: string };

/**
 * Dossier & preuve. Pour chaque constat, la chaîne reconstituable source → transformation → règle → résultat →
 * décision : une matrice de complétude d'ensemble, puis une entrée par constat. Les étapes viennent du constat tel que
 * la règle l'a écrit, la décision du journal de revue (lecture seule) ; la vue ne calcule rien qui fasse autorité.
 */
export function DossierPreuveView() {
  const snapshot = useActiveDossierSnapshot();
  const d = snapshot.dossier;
  const { entries, journalValid } = useMemo(() => buildDossierEntries(snapshot), [snapshot]);
  const matrix = useMemo(() => buildCompleteness(entries), [entries]);
  const [filter, setFilter] = useState<DossierFilter>(EMPTY_FILTER);
  const [limit, setLimit] = useState(PAGE);
  /** Rang du premier constat ajouté par « Afficher les autres » : la cascade d'entrée repart de lui. */
  const [staggerFrom, setStaggerFrom] = useState(0);
  const [exportState, setExportState] = useState<ExportState>({ tone: "idle", text: "" });

  const filtered = useMemo(() => filterEntries(entries, filter), [entries, filter]);
  const shown = filtered.slice(0, limit);
  const rest = filtered.length - shown.length;
  const fingerprint = d.fecFingerprint ? d.fecFingerprint.slice(0, 12) : "";

  function update(next: Partial<DossierFilter>) {
    setFilter((current) => ({ ...current, ...next }));
    setLimit(PAGE);
    setStaggerFrom(0);
  }

  // L'export du review pack garde son appel d'origine ; un échec est dit, jamais ignoré en silence.
  async function exportReviewPack() {
    setExportState({ tone: "busy", text: "Préparation du review pack…" });
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot }),
      });
      if (!response.ok) {
        setExportState({ tone: "error", text: `Export impossible : le serveur a répondu ${response.status}. Aucun fichier n’a été produit.` });
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `review-pack-${d.societe.siren}-${d.societe.exercice}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setExportState({ tone: "done", text: "Review pack exporté." });
    } catch (error) {
      setExportState({ tone: "error", text: `Export impossible : ${error instanceof Error ? error.message : "requête interrompue"}. Aucun fichier n’a été produit.` });
    }
  }

  return (
    <InstrumentPage className={x.bridge}>
      <PageIntro
        index="06"
        title="Dossier & preuve"
        lead="Pour chaque constat, la chaîne reconstituable : source → transformation → règle → résultat → décision. Exportable et vérifiable."
        aside={
          <div className={x.exportBlock}>
            <button type="button" className={p.btnPrimary} disabled={exportState.tone === "busy"} onClick={() => void exportReviewPack()}>
              Exporter le review pack (JSON)
            </button>
            <p role="status" aria-live="polite" className={x.exportStatus} data-tone={exportState.tone}>
              {exportState.text}
            </p>
          </div>
        }
      />

      {/* Traçabilité — ancre de la visite guidée (étape « Le dossier se construit »). */}
      <dl data-tour="dossier-panel" className={`${p.readouts} ${x.readouts}`}>
        <div>
          <dt>Dossier</dt>
          <dd>{d.id}</dd>
        </div>
        <div>
          <dt>Référentiel</dt>
          <dd>
            <ReferentielEdition identifiant={d.referentielVersion} className={x.edition} />
          </dd>
        </div>
        <div>
          <dt>Empreinte FEC</dt>
          <dd>{fingerprint || <span className={x.absent}>absente</span>}</dd>
        </div>
        <div>
          <dt>Généré le</dt>
          <dd>{new Date(d.createdAt).toLocaleString("fr-FR")}</dd>
        </div>
      </dl>

      <section aria-labelledby="dp-completude" className={p.section}>
        <SectionHead
          id="dp-completude"
          title={`Complétude des ${matrix.total} ${plural(matrix.total, "chaîne")}`}
          note="une colonne par constat, par gravité · case pleine = étape présente"
        />
        {matrix.total > 0 ? (
          <>
            <CompletenessMatrix matrix={matrix} />
            <p className={x.matrixNote}>
              Une étape absente n’est pas une erreur en soi : une règle peut s’appliquer sans transformation, et un rapprochement cite ses pièces plutôt que des lignes du FEC.
              {matrix.otherLabels.length > 0 ? ` Les étapes « ${matrix.otherLabels.join(" », « ")} » ne relèvent d’aucun des quatre maillons : elles sont montrées telles quelles, en « autre étape ».` : ""}{" "}
              {decisionSentence(matrix)}
            </p>
            {!journalValid && (
              <p className={x.matrixNote}>Le journal de revue du dossier ne se vérifie pas : aucune décision n’en est lue.</p>
            )}
          </>
        ) : (
          <p className={x.empty}>Aucun constat de ce dossier ne porte d’étape de preuve : il n’y a pas de chaîne à reconstituer.</p>
        )}
      </section>

      {matrix.total > 0 && (
        <section aria-labelledby="dp-constats" className={p.section}>
          <SectionHead id="dp-constats" title="Chaîne de chaque constat" note="par gravité, puis dans l’ordre du dossier" />

          <div className={`${p.toolbar} ${x.toolbar}`}>
            <label className={p.field}>
              <span className={p.key}>Rechercher</span>
              <input type="search" value={filter.query} placeholder="titre, compte, référence" onChange={(e) => update({ query: e.target.value })} />
            </label>
            <label className={p.field}>
              <span className={p.key}>Gravité</span>
              <select value={filter.severity ?? ""} onChange={(e) => update({ severity: (e.target.value || null) as Severity | null })}>
                <option value="">toutes</option>
                {SEVERITY_ORDER.map((sev) => (
                  <option key={sev} value={sev}>
                    {SEVERITY_LABEL[sev].toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className={p.field}>
              <span className={p.key}>Famille</span>
              <select value={filter.family ?? ""} onChange={(e) => update({ family: (e.target.value || null) as FindingFamily | null })}>
                <option value="">toutes</option>
                {FAMILY_ORDER.map((f) => (
                  <option key={f} value={f}>
                    {FAMILY[f].label.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className={p.field}>
              <span className={p.key}>Chaîne</span>
              <select value={filter.chain} onChange={(e) => update({ chain: e.target.value as ChainFilter })}>
                {(Object.keys(CHAIN_FILTER_LABEL) as ChainFilter[]).map((c) => (
                  <option key={c} value={c}>
                    {CHAIN_FILTER_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <span className={`${p.toolbarEnd} ${x.count}`} role="status" aria-live="polite">
              {filtered.length} {plural(filtered.length, "constat")}
              {isFiltered(filter) ? ` sur ${entries.length}` : ""}
            </span>
            {isFiltered(filter) && (
              <button type="button" className={p.btnQuiet} onClick={() => update(EMPTY_FILTER)}>
                Réinitialiser
              </button>
            )}
          </div>

          <ul className={x.legend} aria-label="Familles de règles : trait de la ligne de preuve">
            {FAMILY_ORDER.map((f) => (
              <li key={f}>
                <FamilyRule family={f} />
                <span>
                  <span className={p.soft}>{FAMILY[f].label}</span> — {FAMILY_STYLE[f].help}
                </span>
              </li>
            ))}
          </ul>
          <ul className={x.legendMarks} aria-label="Repères de la ligne de preuve">
            {MARKER_LEGEND.map((m) => (
              <li key={m.kind}>
                <span className={x.legendMark} aria-hidden="true">
                  <span className={x.marker} data-kind={m.kind} />
                </span>
                {m.label}
              </li>
            ))}
          </ul>

          {filtered.length === 0 ? (
            <p className={x.empty}>
              Aucun constat ne correspond à ces filtres.{" "}
              <button type="button" className={p.btnQuiet} onClick={() => update(EMPTY_FILTER)}>
                Réinitialiser les filtres
              </button>
            </p>
          ) : (
            <ul className={x.entries}>
              {shown.map((entry, i) => (
                <DossierEntry key={entry.id} entry={entry} index={Math.max(0, i - staggerFrom)} />
              ))}
            </ul>
          )}
          {rest > 0 && (
            <button
              type="button"
              className={`${p.btnQuiet} ${x.more}`}
              onClick={() => {
                setStaggerFrom(shown.length);
                setLimit(filtered.length);
              }}
            >
              Afficher {rest > 1 ? `les ${rest} autres constats` : "l’autre constat"}
            </button>
          )}
        </section>
      )}
    </InstrumentPage>
  );
}
