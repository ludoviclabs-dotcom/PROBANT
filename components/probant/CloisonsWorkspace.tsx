"use client";

import { useState, useMemo, useRef, useLayoutEffect, useCallback, useEffect, useId, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import type { SiloView, Finding, FindingFamily, FauxPositifRisk, DossierSourceKind, Severity } from "@/lib/canonical-model";
import { buildStatementDocuments, siloById, SEVERITY_LABEL } from "@/lib/canonical-model";
import { FinancialDocumentViewer } from "@/components/viewer/FinancialDocumentViewer";
import { InstrumentPage, PageIntro, SectionHead } from "@/components/charte/InstrumentPage";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { FamilyRule } from "@/components/charte/FamilyRule";
import { prefersReducedMotion } from "@/components/charte/motion";
import { charteFonts } from "@/app/fonts";
import { FAMILY_ORDER, FAMILY_TEXT, SEVERITIES, plural } from "@/lib/synthese-view/common";
import type { ExposureDimension } from "@/lib/synthesis/types";
import { decrireReferentiel } from "@/lib/referentiel/edition";
import { libelleSiren } from "@/lib/dossier/siren";
import {
  STATUT_WORD,
  buildCloisonsPlan,
  eurRow,
  exposureMeasure,
  formatEcart,
  formatMesure,
  formatSeuil,
  severityCounts,
  siloEffects,
  type EffectNote,
  type PlanCell,
  type UserDecision,
} from "@/lib/cloisons-view/plan";
import p from "@/components/charte/page.module.css";
import c from "./cloisons.module.css";

/* ── types ──────────────────────────────────────────────────────────────────── */

export interface ScenarioInfo {
  label: string;
  secteur: string;
  forme: string;
  exercice: string;
}

/** Origine du dossier dans l'en-tête : données fictives (démo, simulation) en accent « signal », données déposées en bleu de vérification. */
const SOURCE_BADGE: Record<DossierSourceKind | "scenario", { label: string; fictif: boolean }> = {
  demo:       { label: "Démo",       fictif: true  },
  scenario:   { label: "Simulation", fictif: true  },
  session:    { label: "Session",    fictif: false },
  persistent: { label: "Persistant", fictif: false },
};

const STATUT_ITEMS = [
  { value: "en_attente", label: "En attente" },
  { value: "valide",     label: "Validé" },
  { value: "accepte",    label: "Accepté" },
  { value: "ecarte",     label: "Écarté" },
];

/**
 * Fenêtre à partir de laquelle le panneau de revue (360 px + 40 px d'écart) se range à droite de
 * la liste : avec la navigation latérale (216 px) et les marges, la liste garde alors ≥ 660 px,
 * soit un silo ouvert ≥ 620 px (seuil de la liaison ligne → constat de SiloBody). En dessous, le
 * panneau s'ouvre en tiroir. Doit rester égal à la requête `min-width: 1400px` de cloisons.module.css.
 */
const RAIL_DOCK_QUERY = "(min-width: 1400px)";

/** Même patron que usePrefersReducedMotion ; sans matchMedia (jsdom), le panneau reste en tiroir. */
function useRailDocked(): boolean {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(RAIL_DOCK_QUERY);
    setDocked(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDocked(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return docked;
}

/* ── utilities ──────────────────────────────────────────────────────────────── */

/** 5 segments ; n remplis selon le risque de faux positif (faible 4, moyen 3, élevé 2). */
function confSegments(risk?: FauxPositifRisk): boolean[] {
  const n = !risk || risk === "faible" ? 4 : risk === "moyen" ? 3 : 2;
  return [1, 2, 3, 4, 5].map((i) => i <= n);
}

function confLabel(risk?: FauxPositifRisk): string {
  if (!risk || risk === "faible") return "Confiance élevée";
  if (risk === "moyen")           return "Confiance modérée";
  return "Confiance à conforter";
}

function confProb(risk?: FauxPositifRisk): string {
  if (!risk || risk === "faible") return "faible";
  if (risk === "moyen")           return "possible";
  return "à confirmer";
}

function matchQuery(f: Finding, q: string): boolean {
  if (!q) return true;
  const lq = q.toLowerCase();
  return (
    f.titre.toLowerCase().includes(lq) ||
    f.constat.toLowerCase().includes(lq) ||
    f.source.ref.toLowerCase().includes(lq) ||
    f.comptesConcernes.some((c) => c.toLowerCase().includes(lq))
  );
}

function effectiveStatut(f: Finding, decisions: Record<string, UserDecision>): string {
  return decisions[f.id] ?? f.statutRevue;
}

function familyTitle(family: FindingFamily): string {
  return `${FAMILY_TEXT[family].long} · ${FAMILY_TEXT[family].sub}`;
}

/* ── petits glyphes (traits de 1,5 px, sans arrondi décoratif) ──────────────── */

function Chevron({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false" className={className}>
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CheckGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M2 6.2 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CrossGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false" className={c.searchGlyph}>
      <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.2 9.2 12.5 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/* ── Effet d'un silo (ligne et plan) ─────────────────────────────────────────── */

/** Texte d'effet d'une ligne de silo : montants par poste et sens, indéterminé, non chiffré, ou rien. */
function EffectText({ note }: { note: EffectNote }) {
  if (note.kind === "quantified") {
    // Chaque poste reste insécable ; la liste des postes passe à la ligne entre deux postes.
    return (
      <span className={c.effect} data-kind="quantified" title="Exposition initiale par poste et sens (projection partagée avec la Synthèse)">
        {note.items.map((it, i) => (
          <span key={it.key} data-emphasis={it.emphasis ? "" : undefined}>{i > 0 ? "· " : ""}{it.text}</span>
        ))}
        {note.more > 0 && <span>{`· +${note.more}`}</span>}
        {note.indeterminate && <span>· indéterminé</span>}
      </span>
    );
  }
  if (note.kind === "indeterminate") return <span className={c.effect}>montant indéterminé</span>;
  if (note.kind === "unquantified") {
    return (
      <span className={c.effect} title="Écart mesuré en euros sans effet financier explicite : l'effet comptable reste inconnu">
        effet non chiffré
      </span>
    );
  }
  return <span className={c.effect} aria-hidden="true" />;
}

/** Effet d'une case du plan : le même texte, abrégé (« non chiffré »). */
function PlanEffect({ note }: { note: EffectNote }) {
  if (note.kind === "quantified") {
    return (
      <>
        {" · "}
        {note.items.map((it, i) => (
          <span key={it.key} className={c.q} data-emphasis={it.emphasis ? "" : undefined}>{i > 0 ? " · " : ""}{it.text}</span>
        ))}
        {note.more > 0 && ` · +${note.more}`}
        {note.indeterminate && " · indéterminé"}
      </>
    );
  }
  if (note.kind === "indeterminate") return <> · indéterminé</>;
  if (note.kind === "unquantified") return <> · non chiffré</>;
  return null;
}

/* ── FilterDropdown ─────────────────────────────────────────────────────────── */

interface FDItem { value: string; label: string; mark?: ReactNode }

/**
 * Filtre à choix multiple : un champ libellé (« Gravité · Tous ») qui ouvre une liste de bascules.
 * Se referme au clic hors du filtre ou sur Échap (le focus revient alors au champ).
 */
function FilterDropdown({
  label,
  items,
  selected,
  onToggle,
  open,
  onOpen,
  onClose,
}: {
  label: string;
  items: FDItem[];
  selected: string[];
  onToggle: (v: string) => void;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hasActive = selected.length > 0;
  const valueLabel = hasActive
    ? (selected.length === 1 ? items.find((i) => i.value === selected[0])?.label : `${selected.length} sél.`)
    : "Tous";

  // Le menu s'ouvre vers la gauche quand il dépasserait le bord droit de la fenêtre (et tient à gauche).
  const menuRef = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu?.parentElement) { setAlignRight(false); return; }
    const m = menu.getBoundingClientRect();
    const anchor = menu.parentElement.getBoundingClientRect();
    if (m.right > document.documentElement.clientWidth && anchor.right - m.width >= 0) setAlignRight(true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      onClose();
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={rootRef} className={c.dd}>
      <button
        ref={triggerRef}
        type="button"
        className={c.ddTrigger}
        data-active={hasActive ? "" : undefined}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? onClose() : onOpen())}
      >
        <span className={p.key}>{label}</span>{" "}
        <span className={c.ddValue}>{valueLabel}</span>
        <Chevron className={c.ddChevron} />
      </button>
      {open && (
        <div ref={menuRef} id={menuId} role="group" aria-label={`Filtre ${label.toLowerCase()}`} className={c.ddMenu} data-align={alignRight ? "right" : undefined}>
          {hasActive && (
            <button type="button" className={c.ddReset} onClick={() => selected.forEach((v) => onToggle(v))}>
              Réinitialiser
            </button>
          )}
          {items.map((it) => {
            const active = selected.includes(it.value);
            return (
              <button key={it.value} type="button" className={c.ddItem} aria-pressed={active} onClick={() => onToggle(it.value)}>
                {it.mark}
                <span>{it.label}</span>
                {active && <span className={c.ddCheck}><CheckGlyph /></span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── RailPanel (contenu du panneau de revue : comprendre, justifier, agir) ───── */

function RailPanel({
  finding,
  decisions,
  onDecision,
}: {
  finding: Finding;
  decisions: Record<string, UserDecision>;
  onDecision: (id: string, d: UserDecision) => void;
}) {
  const [mode, setMode] = useState<"analyse" | "narration">("analyse");
  const [showJustifier, setShowJustifier] = useState(true);
  const [showAgir, setShowAgir] = useState(true);
  const [showSource, setShowSource] = useState(false);
  const ids = useId();

  const siloMeta = siloById(finding.siloId);
  const decision = decisions[finding.id];
  const statut = decision ?? finding.statutRevue;

  const constate = formatMesure(finding);
  const attendu = formatSeuil(finding);
  const ecart = formatEcart(finding);
  const depasse = finding.mesure.constate > finding.mesure.seuil;

  const segments = confSegments(finding.fauxPositifRisk);
  const contextCaption = `${finding.mesure.libelle ? finding.mesure.libelle.charAt(0).toUpperCase() + finding.mesure.libelle.slice(1) : "Mesure"} · réf. ${finding.source.ref}`;

  const decisionButton = (d: UserDecision, label: string) => (
    <button type="button" className={p.btnSecondary} aria-pressed={decision === d} onClick={() => onDecision(finding.id, d)}>
      {label}
    </button>
  );

  return (
    <div>
      {/* COMPRENDRE */}
      <div className={p.panelSection}>
        <p className={c.eyebrowRow}>
          <span>Comprendre</span>
          <span className={`${c.faint} ${c.mono}`}>{finding.id}</span>
        </p>
        <h3 className={p.panelTitle}>{finding.titre}</h3>
        <p className={c.metaLine}>
          <span>
            <SeverityGlyph severity={finding.severity} />
            {SEVERITY_LABEL[finding.severity]}
          </span>
          <span title={familyTitle(finding.family)}>
            <FamilyRule family={finding.family} />
            {FAMILY_TEXT[finding.family].label}
          </span>
          {siloMeta && <span className={c.faint}>{siloMeta.label}</span>}
        </p>

        <div className={c.readSwitch} role="group" aria-label="Lecture du constat">
          {(["analyse", "narration"] as const).map((m) => (
            <button key={m} type="button" className={`${p.toggle} ${c.viewToggle}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>

        {mode === "analyse" ? (
          <div>
            <p className={c.constat}>{finding.constat}</p>
            <dl className={c.figures}>
              <div>
                <dt>Constaté</dt>
                <dd>{constate}</dd>
              </div>
              <div>
                <dt>Attendu</dt>
                <dd>{attendu}</dd>
              </div>
              <div>
                <dt>Écart</dt>
                <dd data-over={depasse ? "" : undefined}>{ecart}</dd>
              </div>
            </dl>
            <p className={c.caption}>{contextCaption}</p>
          </div>
        ) : (
          <ol className={c.narration}>
            {finding.preuve.map((step, i) => (
              <li key={i}>
                <span className={c.narrationStep}>{step.etape}</span>
                {step.detail}
              </li>
            ))}
          </ol>
        )}

        <div className={c.confidence}>
          <span className={c.segs} aria-hidden="true">
            {segments.map((on, i) => <span key={i} data-on={on ? "" : undefined} />)}
          </span>
          <span>{confLabel(finding.fauxPositifRisk)}</span>
          <span className={c.faint}>· Probabilité de faux positif : {confProb(finding.fauxPositifRisk)}</span>
        </div>
      </div>

      {/* JUSTIFIER */}
      <div className={p.panelSection}>
        <button type="button" className={c.sectionToggle} aria-expanded={showJustifier} aria-controls={`${ids}-justifier`} onClick={() => setShowJustifier((v) => !v)}>
          Justifier
          <Chevron />
        </button>

        {showJustifier && (
          <div id={`${ids}-justifier`}>
            <p className={c.sourceLine}>
              <span className={c.faint}>Source</span>
              <button type="button" className={c.sourceButton} aria-expanded={showSource} onClick={() => setShowSource((v) => !v)}>
                {finding.source.ref}
                {finding.source.effectiveDate && <span className={c.faint}> · v.{finding.source.effectiveDate}</span>}
              </button>
            </p>
            {showSource && <blockquote className={c.citation}>« {finding.source.citation} »</blockquote>}

            <p className={c.blockKey}>Explication métier</p>
            <p className={c.prose}>{finding.explication}</p>

            {finding.faisceau.length > 0 && (
              <>
                <p className={c.blockKey}>Faisceau d&apos;indices</p>
                <ul className={c.faisceau}>
                  {finding.faisceau.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </>
            )}

            {finding.preuve.length > 0 && (
              <>
                <p className={c.blockKey}>Chaîne de preuve</p>
                <ol className={c.chain}>
                  {finding.preuve.map((step, i) => (
                    <li key={i}>
                      <span className={c.chainStep}>{step.etape}</span>
                      {step.detail}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}
      </div>

      {/* AGIR — la recommandation reprenait mot pour mot l'explication métier : elle n'est plus répétée ici
          (le modèle n'a pas de champ de recommandation distinct). */}
      <div className={p.panelSection}>
        <button type="button" className={c.sectionToggle} aria-expanded={showAgir} aria-controls={`${ids}-agir`} onClick={() => setShowAgir((v) => !v)}>
          Agir
          <Chevron />
        </button>

        {showAgir && (
          <div id={`${ids}-agir`}>
            <p className={c.statusLine}>Statut actuel : {STATUT_WORD[statut]}.</p>
            <p className={c.blockKey}>Décision de revue</p>
            <div className={c.decisions}>
              {decisionButton("valide", "Valider")}
              {decisionButton("accepte", "Accepter")}
              {decisionButton("ecarte", "Écarter")}
            </div>
            {/* Aucun dépôt de pièce n'est branché sur cette vue : le bouton reste visible, désactivé et expliqué. */}
            <button type="button" className={`${p.btnSecondary} ${c.attach}`} aria-disabled="true" aria-describedby={`${ids}-joindre`}>
              Joindre un justificatif
            </button>
            <p id={`${ids}-joindre`} className={c.attachNote}>
              Indisponible ici : la revue par cloison ne joint pas encore de pièce au constat.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── ReviewDrawer (panneau de revue en tiroir sous RAIL_DOCK_QUERY) ─────────── */

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Tiroir modal à droite (pleine largeur sur mobile), même patron que FindingDrawer : voile,
 * Échap, focus sur « Fermer » à l'ouverture ; Tab reste dans le tiroir. À la fermeture, le focus
 * revient au bouton « Analyser » du constat (`data-finding-trigger`), quel que soit l'ouvreur :
 * ligne signalée de la reconstruction (non focalisable) ou rail ancré retiré par un redimensionnement.
 * Rendu dans document.body pour ne dépendre d'aucun ancêtre de la page : la racine du portail repose
 * donc l'ambiance « instruments » et ses polices.
 */
function ReviewDrawer({ findingId, title, onClose, children }: { findingId: string; title: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      const trigger = [...document.querySelectorAll<HTMLElement>("[data-finding-trigger]")].find((el) => el.dataset.findingTrigger === findingId);
      (trigger ?? (opener?.isConnected ? opener : null))?.focus();
    };
  }, [findingId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      const panel = panelRef.current;
      if (e.key !== "Tab" || !panel) return;
      const focusables = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div role="presentation" data-ambiance="instruments" className={`${charteFonts} ${c.drawerRoot}`}>
      <div data-review-backdrop aria-hidden onClick={onClose} className={c.drawerVeil} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={`Constat : ${title}`} className={c.drawer}>
        <div className={c.drawerHead}>
          <span className={c.drawerKey}>Panneau de revue</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fermer le panneau de revue" className={c.drawerClose}>
            <CrossGlyph />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ── SiloBody (reconstruction | constats, liaison ligne signalée → constat) ─── */

interface LinkPath { id: string; d: string }

function sameLinks(a: LinkPath[], b: LinkPath[]): boolean {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id && x.d === b[i].d);
}

function SiloBody({
  bodyId,
  siloView,
  findings,
  filtered,
  hasFilters,
  selId,
  setSelId,
  decisions,
}: {
  bodyId: string;
  siloView: SiloView;
  findings: Finding[];
  filtered: Finding[];
  hasFilters: boolean;
  selId: string | null;
  setSelId: (id: string | null) => void;
  decisions: Record<string, UserDecision>;
}) {
  const findingsToShow = hasFilters ? filtered : findings;
  const rows = siloView.statement.rows;
  const rowById = new Map(rows.map((r) => [r.id, r] as const));
  const isShowcase = siloView.siloId === "rapprochement-clients";

  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [links, setLinks] = useState<LinkPath[]>([]);
  // Une colonne tant que la largeur réelle n'est pas mesurée (jamais deux colonnes trop étroites).
  const [wide, setWide] = useState(false);

  // Clé stable des liaisons à tracer : les constats filtrés changent d'identité à chaque rendu.
  const targetKey = findingsToShow
    .filter((f) => f.cibleRowId && rowById.has(f.cibleRowId))
    .map((f) => `${f.id}>${f.cibleRowId}`)
    .join("|");

  const compute = useCallback(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const cr = cont.getBoundingClientRect();
    // Deux colonnes et liaisons seulement si le silo mesure ≥ 620 px ; sinon la reconstruction
    // puis les constats, la note de chaque constat portant seule le lien vers la ligne.
    const isWide = cr.width >= 620;
    setWide(isWide);
    const next: LinkPath[] = [];
    if (isWide) {
      for (const pair of targetKey ? targetKey.split("|") : []) {
        const [id, rowId] = pair.split(">");
        const rowEl = rowRefs.current.get(rowId);
        const cardEl = cardRefs.current.get(id);
        if (!rowEl || !cardEl) continue;
        const rr = rowEl.getBoundingClientRect();
        const pr = cardEl.getBoundingClientRect();
        const sx = Math.round(rr.right - cr.left + 4);
        const ex = Math.round(pr.left - cr.left - 4);
        // Le coude ne vit que dans la gouttière entre les deux colonnes : jamais par-dessus un montant.
        if (ex - sx < 12) continue;
        const sy = Math.round(rr.top - cr.top + rr.height / 2);
        const ey = Math.round(pr.top - cr.top + Math.min(pr.height / 2, 26));
        const mx = Math.round((sx + ex) / 2);
        next.push({ id, d: `M ${sx} ${sy - 3} v 6 M ${sx} ${sy} H ${mx} V ${ey} H ${ex} M ${ex} ${ey - 4} v 8` });
      }
    }
    setLinks((prev) => (sameLinks(prev, next) ? prev : next));
  }, [targetKey]);

  useLayoutEffect(() => {
    compute();
    const cont = containerRef.current;
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => compute()) : null;
    if (cont) ro?.observe(cont);
    window.addEventListener("resize", compute);
    const raf = requestAnimationFrame(compute);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", compute);
      cancelAnimationFrame(raf);
    };
  }, [compute]);

  // Le passage à deux colonnes déplace la ligne et les constats : on retrace.
  useLayoutEffect(() => {
    if (wide) compute();
  }, [wide, compute]);

  return (
    // Le silo vitrine du rapprochement Clients porte l'ancre `bezier-link` de la visite guidée sur le
    // CONTENEUR (toujours rendu quand le silo est ouvert) : le spotlight couvre la chaîne complète
    // ligne signalée → liaison → constat et sa note, teinté par la gravité du premier constat.
    <div
      id={bodyId}
      ref={containerRef}
      className={c.siloBody}
      data-wide={wide ? "" : undefined}
      data-tour={isShowcase ? "bezier-link" : undefined}
      data-tour-flag={isShowcase ? findingsToShow[0]?.severity : undefined}
    >
      {wide && links.length > 0 && (
        <svg className={c.links} width="100%" height="100%" aria-hidden="true" focusable="false">
          {links.map((l) => (
            <path key={l.id} d={l.d} data-linked={l.id === selId ? "" : undefined} />
          ))}
        </svg>
      )}

      {/* Reconstruction comptable */}
      <div className={c.zone}>
        <p className={c.zoneKey}>Reconstruction comptable</p>
        <p className={c.reconTitle}>{siloView.statement.titre}</p>
        {siloView.statement.documents && (
          <ul className={c.docs} aria-label="Documents rapprochés">
            {siloView.statement.documents.map((doc) => (
              <li key={doc.label}>
                <CheckGlyph />
                {doc.label}
              </li>
            ))}
          </ul>
        )}
        <table className={c.recon}>
          <tbody>
            {rows.map((row) => {
              const isFlagged = !!row.flaggedBy;
              const isLinked = isFlagged && row.flaggedBy === selId;
              return (
                <tr
                  key={row.id}
                  ref={isFlagged ? (el) => { if (el) rowRefs.current.set(row.id, el); else rowRefs.current.delete(row.id); } : undefined}
                  onClick={() => isFlagged && setSelId(row.flaggedBy ?? null)}
                  data-kind={row.kind}
                  data-flagged={isFlagged ? "" : undefined}
                  data-linked={isLinked ? "" : undefined}
                >
                  <td>
                    {isFlagged && row.severity ? (
                      <span className={c.rowMark}>
                        <SeverityGlyph severity={row.severity} />
                        <span>{row.label}</span>
                      </span>
                    ) : (
                      row.label
                    )}
                    {row.compte && <span className={c.compte}>{row.compte}</span>}
                  </td>
                  <td>{eurRow(row.valeur)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {siloView.statement.note && <p className={c.reconNote}>{siloView.statement.note}</p>}
      </div>

      {/* Constats */}
      <div className={c.zone}>
        <p className={c.zoneKey}>
          Constats ({hasFilters ? `${filtered.length}/` : ""}{findings.length})
        </p>
        <ul className={c.cards}>
          {findingsToShow.map((f, fi) => {
            const isSelected = f.id === selId;
            const dec = decisions[f.id];
            const target = f.cibleRowId ? rowById.get(f.cibleRowId) : undefined;
            const note = f.annotation && target ? `${target.compte ? `Ligne ${target.compte}` : target.label} · ${f.annotation}` : null;
            return (
              <li
                key={f.id}
                className={c.card}
                data-selected={isSelected ? "" : undefined}
                data-tour={fi === 0 ? (isShowcase ? "cloison-rappro" : "cloison-constat") : undefined}
                data-tour-flag={fi === 0 ? f.severity : undefined}
                ref={(el) => { if (el) cardRefs.current.set(f.id, el); else cardRefs.current.delete(f.id); }}
              >
                <div className={c.cardMain}>
                  <div className={c.cardText}>
                    <span className={c.cardMeta}>
                      <span>
                        <SeverityGlyph severity={f.severity} />
                        {SEVERITY_LABEL[f.severity]}
                      </span>
                      <span title={familyTitle(f.family)}>
                        <FamilyRule family={f.family} />
                        {FAMILY_TEXT[f.family].label}
                      </span>
                    </span>
                    <span className={c.cardTitle}>{f.titre}</span>
                    {dec && <span className={c.decision} data-decision={dec}>{STATUT_WORD[dec]}</span>}
                  </div>
                  <button type="button" data-finding-trigger={f.id} className={c.analyse} onClick={() => setSelId(isSelected ? null : f.id)}>
                    {isSelected ? "Fermer" : "Analyser"}
                  </button>
                </div>
                {note && <p className={c.annotation}>{note}</p>}
              </li>
            );
          })}
          {findingsToShow.length === 0 && <li className={c.cardsEmpty}>Aucun constat correspondant aux filtres.</li>}
        </ul>
      </div>
    </div>
  );
}

/* ── Plan des cloisons ──────────────────────────────────────────────────────── */

function PlanCellLink({ cell, onGo }: { cell: PlanCell; onGo: (id: string) => void }) {
  return (
    <a
      href={`#silo-${cell.siloId}`}
      className={c.planCell}
      data-worst={cell.worst ?? undefined}
      onClick={(e: ReactMouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        onGo(cell.siloId);
      }}
    >
      <span className={c.planCellName}>
        {cell.worst ? <SeverityGlyph severity={cell.worst} /> : null}
        <span className={c.planCellLabel}>{cell.label}</span>
      </span>
      <span className={c.planCellMeta}>
        {cell.worst ? `${SEVERITY_LABEL[cell.worst].toLowerCase()} · ` : ""}
        <span className={c.mono}>{cell.count}</span> {plural(cell.count, "constat")}
        <PlanEffect note={cell.note} />
      </span>
    </a>
  );
}

/* ── CloisonsWorkspace ──────────────────────────────────────────────────────── */

export function CloisonsWorkspace({
  silos,
  meta,
  scenario = null,
  exposure,
  horsCloison = 0,
}: {
  silos: SiloView[];
  /** `referentiel` : identifiant d'édition porté par le dossier (`referentielVersion`) ;
   *  `siren` : `null` s'il n'est pas renseigné (jamais des zéros) ; `sourceKind` : origine du dossier actif. */
  meta: { label: string; exercice: string; referentiel: string; siren: string | null; sourceKind: DossierSourceKind };
  scenario?: ScenarioInfo | null;
  /** Projection des effets partagée avec la Synthèse (lib/synthesis/exposure). */
  exposure: Pick<ExposureDimension, "clusters">;
  /** Constats d'admissibilité du FEC, rattachés à aucune cloison (dossier.admissibilite). */
  horsCloison?: number;
}) {
  const docs = useMemo(() => buildStatementDocuments(silos, meta), [silos, meta]);
  const documentDisponible = docs.length > 0;
  const sourceBadge = SOURCE_BADGE[scenario ? "scenario" : meta.sourceKind];

  const [vue, setVue] = useState<"silo" | "document">("silo");
  const [openSilos, setOpenSilos] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    if (silos[0]?.siloId) ids.add(silos[0].siloId);
    // Ouvre aussi le rapprochement Clients : c'est la vitrine de la visite guidée.
    if (silos.some((s) => s.siloId === "rapprochement-clients")) ids.add("rapprochement-clients");
    return ids;
  });
  const [selId, setSelId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, UserDecision>>({});
  const railDocked = useRailDocked();
  const closeReview = useCallback(() => setSelId(null), []);
  const siloRefs = useRef<Map<string, HTMLElement>>(new Map());

  const [query, setQuery] = useState("");
  const [sevFilter, setSevFilter] = useState<string[]>([]);
  const [statutFilter, setStatutFilter] = useState<string[]>([]);
  const [natureFilter, setNatureFilter] = useState<string[]>([]);
  const [ddOpen, setDdOpen] = useState<"sev" | "statut" | "nature" | null>(null);
  const closeDropdown = useCallback(() => setDdOpen(null), []);

  const allFindings = useMemo(() => silos.flatMap((s) => s.findings), [silos]);
  const sevCounts = useMemo(() => severityCounts(allFindings), [allFindings]);
  const plan = useMemo(() => buildCloisonsPlan(silos, exposure), [silos, exposure]);
  const totalEffects = useMemo(() => siloEffects(exposure, allFindings), [exposure, allFindings]);
  const measure = useMemo(() => exposureMeasure(plan, totalEffects), [plan, totalEffects]);
  const viewById = useMemo(() => new Map(silos.map((s) => [s.siloId, s] as const)), [silos]);

  const selectedFinding = useMemo(
    () => allFindings.find((f) => f.id === selId) ?? null,
    [allFindings, selId],
  );

  const hasFilters = !!query || sevFilter.length > 0 || statutFilter.length > 0 || natureFilter.length > 0;

  function filterFindings(findings: Finding[]): Finding[] {
    if (!hasFilters) return findings;
    return findings.filter((f) => {
      if (!matchQuery(f, query)) return false;
      if (sevFilter.length > 0 && !sevFilter.includes(f.severity)) return false;
      if (natureFilter.length > 0 && !natureFilter.includes(f.family)) return false;
      if (statutFilter.length > 0 && !statutFilter.includes(effectiveStatut(f, decisions))) return false;
      return true;
    });
  }

  const filteredTotal = useMemo(
    () => hasFilters ? allFindings.filter((f) => filterFindings([f]).length > 0).length : allFindings.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allFindings, query, sevFilter, statutFilter, natureFilter, decisions, hasFilters],
  );

  function toggleSilo(id: string) {
    setOpenSilos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** Depuis le plan : ouvre le silo, le fait défiler en tête (sans animation si le mouvement est réduit) et y place le focus. */
  const goToSilo = useCallback((id: string) => {
    setVue("silo");
    setOpenSilos((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    requestAnimationFrame(() => {
      const el = siloRefs.current.get(id);
      if (!el) return;
      if (typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      el.querySelector<HTMLButtonElement>("[data-silo-row]")?.focus({ preventScroll: true });
    });
  }, []);

  function handleDecision(id: string, d: UserDecision) {
    setDecisions((prev) => {
      if (prev[id] === d) { const n = { ...prev }; delete n[id]; return n; }
      return { ...prev, [id]: d };
    });
  }

  const showEffects = measure.lines.length > 0 || measure.indeterminate > 0 || measure.eurSignals > 0;
  const [firstLine, ...otherLines] = measure.lines;

  return (
    <>
      <InstrumentPage>
        <PageIntro
          index="04"
          title="Revue par cloison"
          lead={
            <>
              Une cloison isole une catégorie comptable. Le parcours se révèle à la demande : <strong>explorer</strong> le risque,{" "}
              <strong>comprendre</strong> l&apos;anomalie, puis <strong>décider</strong> — un niveau à la fois.
            </>
          }
          aside={
            <div className={c.identity}>
              <p className={c.identityName}>
                <span className={c.liveMark} aria-hidden="true" />
                <span>{meta.label}</span>
                <span data-dossier-source className={c.source} data-fictif={sourceBadge.fictif ? "" : undefined}>
                  {sourceBadge.label}
                </span>
              </p>
              <p className={c.identityMeta}>
                {scenario ? `${scenario.secteur} · ${scenario.forme} · ` : `${libelleSiren(meta.siren)} · `}
                Exercice {meta.exercice} · Réf. {decrireReferentiel(meta.referentiel).libelle}
              </p>
            </div>
          }
        />

        {/* ── Mesures ── */}
        <div className={c.measures}>
          <div className={`${p.measure} ${c.measureLead}`}>
            <div className={p.measureHead}>
              <span>Constats rattachés à une cloison</span>
              <span className={c.measureRef}>par gravité</span>
            </div>
            <p className={p.measureValue}>
              {allFindings.length}
              {horsCloison > 0 && (
                <span className={c.measureAside}>
                  {" "}· + {horsCloison} {plural(horsCloison, "constat")} d&apos;admissibilité du FEC, hors cloison
                </span>
              )}
            </p>
            <div className={c.sevBar} aria-hidden="true">
              {SEVERITIES.filter((s) => sevCounts[s] > 0).map((s) => (
                <span key={s} data-sev={s} style={{ flexGrow: sevCounts[s] }} />
              ))}
            </div>
            <ul className={c.sevCounts}>
              {SEVERITIES.filter((s) => sevCounts[s] > 0).map((s: Severity) => (
                <li key={s}>
                  <SeverityGlyph severity={s} />
                  <span className={c.mono}>{sevCounts[s]}</span> {plural(sevCounts[s], SEVERITY_LABEL[s].toLowerCase())}
                </li>
              ))}
            </ul>
          </div>

          {showEffects && (
            <div data-effects-summary className={c.measureGroup}>
              <div className={p.measure}>
                <div className={p.measureHead}>
                  <span>Exposition initiale par poste et sens</span>
                  <span className={c.measureRef}>sans compensation</span>
                </div>
                {firstLine ? (
                  <>
                    <p className={p.measureValue}>
                      <span className={c.measureTarget}>{firstLine.target}</span>{" "}
                      <span className={`${c.measureAmount}${firstLine.emphasis ? ` ${c.signal}` : ""}`}>{firstLine.amount}</span>
                    </p>
                    {firstLine.contributors.length > 0 && (
                      <p className={c.contributors}>
                        {firstLine.contributors.length === 1 ? firstLine.contributors[0].label : firstLine.contributors.map((x) => `${x.label} ${x.amount}`).join(" · ")}
                      </p>
                    )}
                    {otherLines.map((line) => (
                      <div key={line.key}>
                        <p className={c.measureSecond}>
                          <span className={c.measureTarget}>{line.target}</span>{" "}
                          <span className={`${c.measureAmount}${line.emphasis ? ` ${c.signal}` : ""}`}>{line.amount}</span>
                        </p>
                        {line.contributors.length > 0 && (
                          <p className={c.contributors}>
                            {line.contributors.length === 1 ? line.contributors[0].label : line.contributors.map((x) => `${x.label} ${x.amount}`).join(" · ")}
                          </p>
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <p className={p.measureValue}><span className={c.measureWord}>aucun effet chiffré</span></p>
                )}
                {measure.indeterminate > 0 && (
                  <p className={p.measureText}>
                    {measure.indeterminate} {plural(measure.indeterminate, "groupe indéterminé", "groupes indéterminés")} : bornes dans la Synthèse, aucun montant retenu ici.
                  </p>
                )}
              </div>
              <div className={p.measure}>
                <div className={p.measureHead}>
                  <span>Sans effet chiffré</span>
                  <span className={c.measureRef}>signaux EUR</span>
                </div>
                <p className={p.measureValue}>{measure.eurSignals}</p>
                <p className={p.measureText}>
                  {plural(measure.eurSignals, "signal EUR", "signaux EUR")} sans effet chiffré : montant inconnu, laissé inconnu, jamais compté comme zéro.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Plan des cloisons ── */}
        {plan.boards.length > 0 && (
          <section className={c.planSection} aria-labelledby="cloisons-plan">
            <SectionHead
              id="cloisons-plan"
              title="Plan des cloisons"
              note={`${plan.siloCount} ${plural(plan.siloCount, "silo")} dans l'ordre des états · gravité la plus haute, constats, effet`}
            />
            {plan.boards.map((board) => (
              <div key={board.key} className={c.planBoard}>
                {board.columns.map((col) => {
                  const headId = `plan-${board.key}-${col.key}`;
                  return (
                    <div key={col.key}>
                      <p id={headId} className={c.planColHead}>
                        <span>{col.title}</span>
                        <span className={c.planColCount}>
                          {col.siloCount} {plural(col.siloCount, "silo")} · {col.findingCount} {plural(col.findingCount, "constat")}
                        </span>
                      </p>
                      <ul className={c.planCells} aria-labelledby={headId}>
                        {col.groups.flatMap((g) => g.cells).map((cell) => (
                          <li key={cell.siloId}>
                            <PlanCellLink cell={cell} onGo={goToSilo} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        )}

        {/* ── Barre d'outils ── */}
        <div className={`${p.toolbar} ${c.toolbar}`}>
          <div className={c.search}>
            <SearchGlyph />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher compte, libellé, norme…"
              aria-label="Rechercher un constat"
              className={c.searchInput}
            />
            {query && (
              <button type="button" className={c.searchClear} aria-label="Effacer la recherche" onClick={() => setQuery("")}>
                <CrossGlyph size={12} />
              </button>
            )}
          </div>

          {(["sev", "statut", "nature"] as const).map((dd) => (
            <FilterDropdown
              key={dd}
              label={dd === "sev" ? "Gravité" : dd === "statut" ? "Statut" : "Nature"}
              items={
                dd === "sev"
                  ? SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s], mark: <SeverityGlyph severity={s} /> }))
                  : dd === "statut"
                  ? STATUT_ITEMS
                  : FAMILY_ORDER.map((f) => ({ value: f, label: FAMILY_TEXT[f].label, mark: <FamilyRule family={f} /> }))
              }
              selected={dd === "sev" ? sevFilter : dd === "statut" ? statutFilter : natureFilter}
              onToggle={(v) => {
                const setter = dd === "sev" ? setSevFilter : dd === "statut" ? setStatutFilter : setNatureFilter;
                setter((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
              }}
              open={ddOpen === dd}
              onOpen={() => setDdOpen(dd)}
              onClose={closeDropdown}
            />
          ))}

          <span role="status" className={c.counter}>
            {hasFilters && (
              <>
                <span className={c.mono}>{filteredTotal}</span> / {allFindings.length}
              </>
            )}
          </span>

          <span className={`${p.toggleGroup} ${p.toolbarEnd} ${c.viewSwitch}`} role="group" aria-label="Vue">
            <span className={p.key}>Vue</span>
            <button type="button" className={`${p.toggle} ${c.viewToggle}`} aria-pressed={vue === "silo"} onClick={() => setVue("silo")}>
              Par cloison
            </button>
            <button
              type="button"
              className={`${p.toggle} ${c.viewToggle}`}
              aria-pressed={vue === "document"}
              onClick={() => documentDisponible && setVue("document")}
              disabled={!documentDisponible}
              title={documentDisponible ? undefined : "Aucun état reconstruit disponible"}
            >
              Document annoté
            </button>
          </span>
        </div>

        {/* ── Corps : liste pleine largeur ; panneau de revue rangé à droite dès RAIL_DOCK_QUERY ── */}
        <div className={c.body}>
          <div className={c.list}>
            {vue === "document" && documentDisponible ? (
              <div className={c.documentFrame}>
                <FinancialDocumentViewer docs={docs} />
              </div>
            ) : (
              <>
                {plan.groups.map((group) => (
                  <section key={group.cloisonId} aria-labelledby={`cloison-${group.cloisonId}`}>
                    <h2 id={`cloison-${group.cloisonId}`} className={p.groupHead}>{group.label}</h2>
                    <ul className={c.siloList}>
                      {group.cells.map((cell) => {
                        const siloView = viewById.get(cell.siloId);
                        if (!siloView) return null;
                        const isOpen = openSilos.has(cell.siloId);
                        const findings = siloView.findings;
                        const bodyId = `silo-corps-${cell.siloId}`;
                        return (
                          <li
                            key={cell.siloId}
                            id={`silo-${cell.siloId}`}
                            className={c.silo}
                            ref={(el) => { if (el) siloRefs.current.set(cell.siloId, el); else siloRefs.current.delete(cell.siloId); }}
                          >
                            <button
                              type="button"
                              data-silo-row={cell.siloId}
                              aria-expanded={isOpen}
                              aria-controls={isOpen ? bodyId : undefined}
                              onClick={() => toggleSilo(cell.siloId)}
                              className={c.siloRow}
                            >
                              {/* Signe dessiné en CSS (« + » replié, « − » ouvert) : l'état est porté par aria-expanded. */}
                              <span className={c.twisty} aria-hidden="true" />
                              <span className={c.siloName}>
                                <span className={c.siloLabel}>{cell.label}</span>
                                <span className={c.accounts}>{cell.comptes.join(" · ")}</span>
                              </span>
                              <span className={c.facts}>
                                {cell.worst && findings.length > 0 ? (
                                  <>
                                    <span className={c.sevMark} data-sev={cell.worst}>
                                      <SeverityGlyph severity={cell.worst} />
                                      {SEVERITY_LABEL[cell.worst]}
                                    </span>
                                    <span className={c.score}>{cell.score}/100</span>
                                    <span className={c.count}>{findings.length} {plural(findings.length, "constat")}</span>
                                  </>
                                ) : (
                                  <span className={c.count}>aucun constat</span>
                                )}
                                <EffectText note={cell.note} />
                              </span>
                            </button>

                            {isOpen && (
                              <SiloBody
                                bodyId={bodyId}
                                siloView={siloView}
                                findings={findings}
                                filtered={filterFindings(findings)}
                                hasFilters={hasFilters}
                                selId={selId}
                                setSelId={setSelId}
                                decisions={decisions}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}

                {plan.groups.length === 0 && <p className={c.listEmpty}>Aucun silo à afficher.</p>}
              </>
            )}
          </div>

          {/* Rail ancré — affiché seulement quand la place le permet ; sinon tiroir (ReviewDrawer). */}
          <aside data-review-rail aria-label="Panneau de revue" className={c.rail}>
            {selectedFinding && railDocked ? (
              <div key={selectedFinding.id} className={p.panel}>
                <RailPanel finding={selectedFinding} decisions={decisions} onDecision={handleDecision} />
              </div>
            ) : (
              <div className={c.railEmpty}>
                <p className={c.railEmptyTitle}>Aucun constat sélectionné</p>
                <p className={c.railEmptyText}>
                  Cliquez sur <em>Analyser</em> dans un constat pour ouvrir le panneau de revue.
                </p>
              </div>
            )}
          </aside>
        </div>
      </InstrumentPage>

      {selectedFinding && !railDocked && (
        <ReviewDrawer key={selectedFinding.id} findingId={selectedFinding.id} title={selectedFinding.titre} onClose={closeReview}>
          <RailPanel key={selectedFinding.id} finding={selectedFinding} decisions={decisions} onDecision={handleDecision} />
        </ReviewDrawer>
      )}
    </>
  );
}
