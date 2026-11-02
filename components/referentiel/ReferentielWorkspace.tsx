"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FamilyRule } from "@/components/charte/FamilyRule";
import { InstrumentPage, PageIntro, SectionHead } from "@/components/charte/InstrumentPage";
import p from "@/components/charte/page.module.css";
import type { SourceNormative, SourceTheme } from "@/lib/canonical-model";
import { plural } from "@/lib/synthese-view/common";
import {
  SEUILS_FAMILY,
  SEUILS_FAMILY_LABEL,
  computeScope,
  countRegistry,
  registryLabel,
  selectRegistry,
} from "@/lib/referentiel/view-model";
import { LibrarySection, type LibraryVariant } from "./LibrarySection";
import type { Registry } from "./themes";
import { YearFrieze } from "./YearFrieze";
import x from "./referentiel.module.css";

export interface SeuilParam {
  label: string;
  value: string;
  /** Ce que règle le paramètre (repris des commentaires de `SEUILS_INTERNES`). */
  detail?: string;
}

const VARIANTS: readonly { key: LibraryVariant; label: string }[] = [
  { key: "recueil", label: "liste" },
  { key: "marginalia", label: "par texte" },
];

/**
 * Page « Seuils & référentiel » (écran 08) : les seuils internes PROBANT, puis la bibliothèque des sources normatives
 * versionnées. Orchestrateur client — possède l'état de filtre unique (recherche, famille, thème, millésime) partagé
 * par la frise, l'index et la liste. Toutes les valeurs affichées viennent du registre et du modèle de vue.
 */
export function ReferentielWorkspace({
  sources,
  seuils,
  version,
  versionDetail,
  libraryVariant = "recueil",
  clampCitations = true,
}: {
  sources: SourceNormative[];
  seuils: SeuilParam[];
  /** Libellé de l'édition du registre (« éd. N »), jamais une date. */
  version: string;
  versionDetail: string;
  libraryVariant?: LibraryVariant;
  clampCitations?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<SourceTheme | "all">("all");
  const [year, setYear] = useState<string | null>(null);
  const [registry, setRegistry] = useState<Registry | "all">("all");
  const [peekYear, setPeekYear] = useState<string | null>(null);
  const [variant, setVariant] = useState<LibraryVariant>(libraryVariant);
  const [noteOpen, setNoteOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filters = useMemo(() => ({ query, theme, year, registry }), [query, theme, year, registry]);
  const scope = useMemo(() => computeScope(sources, filters), [sources, filters]);

  const total = sources.length;
  const droitDur = countRegistry(sources, "droit-dur");
  const methode = countRegistry(sources, "methode");
  const q = query.trim();
  const filtered = scope.filtered.length;
  const isFiltered = q !== "" || theme !== "all" || year !== null || registry !== "all";

  const reset = () => {
    setQuery("");
    setTheme("all");
    setYear(null);
    setRegistry("all");
  };

  const chooseRegistry = (r: Registry | "all") => {
    // Recliquer la famille active revient à « toutes ». Les règles de `selectRegistry` sont aussi celles des comptes.
    const next = selectRegistry(theme, registry === r ? "all" : r);
    setRegistry(next.registry);
    setTheme(next.theme);
  };

  const status = q
    ? `${filtered} ${plural(filtered, "résultat")} pour « ${q} »`
    : `${filtered} ${plural(filtered, "entrée")}${isFiltered ? ` sur ${total}` : ""}`;

  return (
    <InstrumentPage>
      <PageIntro
        index="08"
        title="Seuils & référentiel"
        lead={
          <>
            <strong>{total}</strong> {plural(total, "source versionnée", "sources versionnées")} fondent les contrôles
            PROBANT, dont <strong>{droitDur}</strong>{" "}
            {plural(droitDur, "texte de droit dur opposable", "textes de droit dur opposables")} et{" "}
            <strong>{methode}</strong> {plural(methode, "norme de méthode d’audit", "normes de méthode d’audit")}.{" "}
            <strong>{seuils.length}</strong> {plural(seuils.length, "seuil interne", "seuils internes")}, non
            opposables, hiérarchisent la vigilance.
          </>
        }
        aside={
          <dl className={`${p.readouts} ${x.edition}`}>
            <div>
              <dt>Édition du registre</dt>
              <dd>{version}</dd>
              <dd>{versionDetail}</dd>
            </div>
          </dl>
        }
      />

      <div className={x.caveat}>
        <p className={x.caveatText}>
          Les citations sont des paraphrases destinées à l’affichage et ne se substituent pas au texte officiel
          opposable.
        </p>
        <button
          type="button"
          className={x.disclosure}
          aria-expanded={noteOpen}
          aria-controls="rf-caveat-more"
          onClick={() => setNoteOpen((o) => !o)}
        >
          {noteOpen ? "Réduire" : "En savoir plus"}
        </button>
      </div>
      <p id="rf-caveat-more" className={x.caveatMore} hidden={!noteOpen}>
        Les seuils chiffrés externes (catégories d’entreprises, nomination CAC…) doivent être confrontés au Code de
        commerce et à ses décrets avant mise en production.
      </p>

      <section aria-labelledby="rf-seuils" className={p.section}>
        <SectionHead
          id="rf-seuils"
          numeral="I"
          title="Seuils internes"
          note={
            <span className={x.familyNote}>
              <FamilyRule family={SEUILS_FAMILY} />
              {SEUILS_FAMILY_LABEL}
            </span>
          }
        />
        <p className={x.sectionLead}>
          Paramètres propres à PROBANT, versionnés avec le registre ({version}) : ils hiérarchisent la vigilance, ne
          fondent aucun constat. Ce ne sont pas des seuils réglementaires.
        </p>
        <table className={`${p.register} ${x.seuils}`}>
          <thead>
            <tr>
              <th scope="col">Paramètre</th>
              <th scope="col" className={p.num}>
                Valeur
              </th>
            </tr>
          </thead>
          <tbody>
            {seuils.map((s) => (
              <tr key={s.label}>
                <th scope="row">
                  <span className={x.seuilLabel}>{s.label}</span>
                  {s.detail && <span className={x.seuilDetail}>{s.detail}</span>}
                </th>
                <td className={p.num}>{s.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="rf-sources" className={p.section}>
        <SectionHead
          id="rf-sources"
          numeral="II"
          title="Sources normatives"
          note={`${droitDur} ${registryLabel("droit-dur").toLowerCase()} · ${methode} ${registryLabel("methode").toLowerCase()}`}
        />

        <YearFrieze
          sources={sources}
          year={year}
          peekYear={peekYear}
          onPeek={setPeekYear}
          onToggleYear={(y) => setYear((prev) => (prev === y ? null : y))}
          onClearYear={() => setYear(null)}
        />

        <div className={`${p.toolbar} ${x.toolbar}`}>
          <label className={`${p.field} ${x.search}`}>
            <span className={p.key}>Rechercher</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.preventDefault();
                  setQuery("");
                }
              }}
              placeholder="article, thème, mot-clé, date"
              aria-keyshortcuts="Control+K Meta+K"
              aria-describedby="rf-search-hint"
            />
          </label>
          <kbd id="rf-search-hint" className={x.kbd}>
            <span aria-hidden="true">Ctrl K · ⌘K</span>
            <span className={x.srOnly}>Ctrl+K ou Cmd+K place le curseur dans la recherche ; Échap l’efface.</span>
          </kbd>
          <span className={p.toggleGroup} role="group" aria-label="Lecture">
            <span className={p.key} aria-hidden="true">
              Lecture
            </span>
            {VARIANTS.map((v) => (
              <button
                key={v.key}
                type="button"
                className={`${p.toggle} ${x.toggle}`}
                aria-pressed={variant === v.key}
                onClick={() => setVariant(v.key)}
              >
                {v.label}
              </button>
            ))}
          </span>
          <span className={`${p.toolbarEnd} ${x.count}`} role="status" aria-live="polite">
            {status}
          </span>
          {isFiltered && (
            <button type="button" className={p.btnQuiet} onClick={reset}>
              Réinitialiser
            </button>
          )}
        </div>

        <LibrarySection
          filters={filters}
          scope={scope}
          total={total}
          version={version}
          variant={variant}
          clampDefault={clampCitations}
          onTheme={setTheme}
          onRegistry={chooseRegistry}
          onReset={reset}
        />
      </section>
    </InstrumentPage>
  );
}
