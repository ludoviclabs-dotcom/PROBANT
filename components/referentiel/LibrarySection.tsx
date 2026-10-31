"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FamilyRule } from "@/components/charte/FamilyRule";
import p from "@/components/charte/page.module.css";
import type { SourceNormative, SourceTheme } from "@/lib/canonical-model";
import { plural } from "@/lib/synthese-view/common";
import {
  groupByFamily,
  indexCounts,
  registryFamily,
  registryLabel,
  type LibraryFilters,
  type LibraryScope,
} from "@/lib/referentiel/view-model";
import { registryOf, type Registry } from "./themes";
import x from "./referentiel.module.css";

/**
 * Deux lectures de la bibliothèque : `recueil` (liste continue dans l'ordre du registre, paraphrases longues repliées
 * à deux lignes) et `marginalia` (entrées regroupées par texte — LPF, PCG, ISA… —, paraphrases entières).
 */
export type LibraryVariant = "recueil" | "marginalia";

/** Seuil (caractères) au-delà duquel une paraphrase est repliée à 2 lignes. */
const LONG_CITATION = 150;

const REGISTRIES: readonly Registry[] = ["droit-dur", "methode"];

interface RowProps {
  source: SourceNormative;
  clampable: boolean;
  open: boolean;
  copied: boolean;
  onToggle: () => void;
  onCopy: () => void;
}

/**
 * Index des filtres (famille, thème) et bibliothèque en lignes de registre. L'état de filtre unique vit dans le
 * parent : famille, thème, millésime et recherche pilotent ensemble la frise, l'index et la liste. Chaque compte de
 * l'index vaut le nombre d'entrées qu'afficherait ce filtre, les autres filtres restant posés.
 */
export function LibrarySection({
  filters,
  scope,
  total,
  version,
  variant,
  clampDefault,
  onTheme,
  onRegistry,
  onReset,
}: {
  filters: LibraryFilters;
  scope: LibraryScope;
  /** Nombre de sources du registre, pour l'état vide. */
  total: number;
  version: string;
  variant: LibraryVariant;
  clampDefault: boolean;
  onTheme: (theme: SourceTheme | "all") => void;
  onRegistry: (registry: Registry | "all") => void;
  onReset: () => void;
}) {
  const { filtered } = scope;
  const [openRefs, setOpenRefs] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const copy = (source: SourceNormative) => {
    const text = `${source.ref} — v.${source.effectiveDate}`;
    // Retour « copié » uniquement si l'écriture a réellement abouti.
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(source.ref);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(null), 1600);
      },
      () => {},
    );
  };

  const counts = useMemo(() => indexCounts(scope, filters.theme), [scope, filters.theme]);
  const groups = useMemo(() => groupByFamily(filtered), [filtered]);

  const rowProps = (source: SourceNormative): RowProps => {
    const clampable = variant === "recueil" && clampDefault && source.citation.length > LONG_CITATION;
    return {
      source,
      clampable,
      open: !clampable || !!openRefs[source.ref],
      copied: copied === source.ref,
      onToggle: () => setOpenRefs((st) => ({ ...st, [source.ref]: !st[source.ref] })),
      onCopy: () => copy(source),
    };
  };

  return (
    <div className={x.libSplit}>
      <div className={x.index}>
        <div className={x.indexGroup} role="group" aria-labelledby="rf-index-famille">
          <span id="rf-index-famille" className={p.key}>
            Famille
          </span>
          <ul className={x.indexList}>
            <li>
              <button
                type="button"
                className={`${p.toggle} ${x.filter}`}
                aria-pressed={filters.registry === "all"}
                onClick={() => onRegistry("all")}
              >
                <span className={x.filterRule} aria-hidden="true" />
                <span className={x.filterLabel}>toutes</span>
                <FilterCount n={counts.registries.all} />
              </button>
            </li>
            {REGISTRIES.map((reg) => (
              <li key={reg}>
                <button
                  type="button"
                  className={`${p.toggle} ${x.filter}`}
                  aria-pressed={filters.registry === reg}
                  onClick={() => onRegistry(reg)}
                >
                  <span className={x.filterRule}>
                    <FamilyRule family={registryFamily(reg)} width={16} />
                  </span>
                  <span className={x.filterLabel}>{registryLabel(reg)}</span>
                  <FilterCount n={counts.registries[reg]} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={x.indexGroup} role="group" aria-labelledby="rf-index-theme">
          <span id="rf-index-theme" className={p.key}>
            Thème
          </span>
          <ul className={x.indexList}>
            <li>
              <button
                type="button"
                className={`${p.toggle} ${x.filter}`}
                aria-pressed={filters.theme === "all"}
                onClick={() => onTheme("all")}
              >
                <span className={x.filterRule} aria-hidden="true" />
                <span className={x.filterLabel}>tous</span>
                <FilterCount n={counts.themesAll} />
              </button>
            </li>
            {counts.themes.map((t) => (
              <li key={t.theme}>
                <button
                  type="button"
                  className={`${p.toggle} ${x.filter}`}
                  aria-pressed={filters.theme === t.theme}
                  onClick={() => onTheme(filters.theme === t.theme ? "all" : t.theme)}
                >
                  <span className={x.filterRule}>
                    <FamilyRule family={registryFamily(t.registry)} width={16} />
                  </span>
                  <span className={x.filterLabel}>{t.theme}</span>
                  <FilterCount n={t.n} family={registryLabel(t.registry)} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={x.libMain}>
        {filtered.length === 0 ? (
          <p className={x.empty}>
            {`Aucun texte ne correspond — ${total} sources dans le référentiel ${version}. `}
            <button type="button" className={p.btnQuiet} onClick={onReset}>
              Réinitialiser
            </button>
          </p>
        ) : variant === "recueil" ? (
          <ul className={x.rows} aria-label="Sources normatives">
            {filtered.map((s) => (
              <SourceRow key={s.ref} {...rowProps(s)} />
            ))}
          </ul>
        ) : (
          groups.map((g) => (
            <div key={g.family}>
              <h3 className={p.groupHead}>
                {g.family}
                <span className={x.groupCount}>{g.items.length}</span>
              </h3>
              <ul className={`${x.rows} ${x.rowsGrouped}`}>
                {g.items.map((s) => (
                  <SourceRow key={s.ref} {...rowProps(s)} />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Compte d'un filtre : le chiffre seul à l'écran ; « , [famille,] N entrées » pour les lecteurs d'écran, dans un seul
 * nœud (les espaces de bord d'un nœud séparé ne survivent pas au calcul du nom accessible).
 */
function FilterCount({ n, family }: { n: number; family?: string }) {
  return (
    <>
      <span className={x.filterCount} aria-hidden="true">
        {n}
      </span>
      <span className={x.srOnly}>{`, ${family ? `${family}, ` : ""}${n} ${plural(n, "entrée")}`}</span>
    </>
  );
}

/**
 * Ligne de registre d'une source : référence en mono, version, famille dessinée par le trait (plein = droit dur,
 * tirets = méthode d'audit), thème, paraphrase, puis les actions.
 */
function SourceRow({ source, clampable, open, copied, onToggle, onCopy }: RowProps) {
  const reg = registryOf(source.theme);
  return (
    <li className={x.row}>
      <div className={x.rowMeta}>
        <p className={x.ref}>
          <span className={x.refText}>{source.ref}</span>
          <span className={x.version}>{`v. ${source.effectiveDate}`}</span>
        </p>
        <p className={x.family}>
          <span className={x.familyMark}>
            <FamilyRule family={registryFamily(reg)} />
            {registryLabel(reg)}
          </span>
          {source.theme && <span className={x.theme}>{source.theme}</span>}
        </p>
      </div>
      <div className={x.rowBody}>
        <p className={`${x.citation}${open ? "" : ` ${x.clamped}`}`}>{source.citation}</p>
        <p className={x.actions}>
          {clampable && (
            <button type="button" className={x.action} aria-expanded={open} onClick={onToggle}>
              {open ? "Réduire" : "Voir plus"}
            </button>
          )}
          <button type="button" className={x.action} onClick={onCopy}>
            {copied ? "Référence copiée" : "Copier la référence"}
          </button>
          {source.url && (
            <a className={x.action} href={source.url} target="_blank" rel="noreferrer">
              Source<span aria-hidden="true"> ↗</span>
              <span className={x.srOnly}>, nouvel onglet</span>
            </a>
          )}
        </p>
      </div>
    </li>
  );
}
