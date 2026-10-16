"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import { SyntheticSummary } from "@/components/probant/SyntheticSummary";
import { charteFonts } from "@/app/fonts";
import { prefersReducedMotion } from "@/components/charte/motion";
import { formatEuroCents } from "@/lib/format/fr";
import { useActiveDossier } from "@/lib/dossier/client";
import { projectCycleRows, sortCycleRows } from "@/lib/dossier/cycle-registry";
import { CLOISONS } from "@/lib/canonical-model/taxonomy";
import type { Severity } from "@/lib/canonical-model/finding";
import { REFERENTIEL_EDITIONS, decrireReferentiel } from "@/lib/referentiel/edition";
import { buildSynthesisSnapshot, generateSynthesisNote } from "@/lib/synthesis";
import { SYNTHESIS_ENGINE_VERSION } from "@/lib/synthesis/versions";
import { buildSynthesisDatasets } from "@/lib/visualization/build-datasets";
import { buildBarcode } from "@/lib/synthese-view/barcode";
import { bridgeTitle, buildBridgeGroups, buildEffectRows } from "@/lib/synthese-view/bridge";
import { buildChain, orderForSelector } from "@/lib/synthese-view/chain";
import { shortCycleLabel, type CloisonDef } from "@/lib/synthese-view/common";
import { buildConcentration } from "@/lib/synthese-view/concentration";
import { buildFrieze, buildMultiples, buildStrata } from "@/lib/synthese-view/exploration";
import { buildJournalRows } from "@/lib/synthese-view/journal";
import { buildLimits } from "@/lib/synthese-view/limits";
import { buildAdmissibilityMeasure, buildCoverageMeasure, buildReviewMeasure, buildSignalView } from "@/lib/synthese-view/measures";
import { buildMosaic, cellKey, mosaicTitle } from "@/lib/synthese-view/mosaic";
import { REVIEW_WORD, reviewStageByFinding, tallyReview } from "@/lib/synthese-view/review";
import { layoutSankey, sankeyTitle } from "@/lib/synthese-view/sankey";
import { buildVerdictView } from "@/lib/synthese-view/verdict";
import { EvidenceExportToolbar } from "@/components/evidence/EvidenceExportToolbar";
import { AssertionMosaic, type CellRef } from "./AssertionMosaic";
import { CloisonSankey } from "./CloisonSankey";
import { ConcentrationBars } from "./ConcentrationBars";
import { CycleRegister } from "./CycleRegister";
import { DetailDrawer } from "./DetailDrawer";
import { EvidenceChain } from "./EvidenceChain";
import { ExposureBridge } from "./ExposureBridge";
import { NormativeStrata, SmallMultiples, StandardsFrieze } from "./Exploration";
import { FecBarcode } from "./FecBarcode";
import { FilterBar } from "./FilterBar";
import { FindingRegister } from "./FindingRegister";
import { LimitsMargin } from "./LimitsMargin";
import { MeasureStrip, worksCoverageNote } from "./MeasureStrip";
import { MethodPanel } from "./MethodPanel";
import { SectionHead, type Variant } from "./SectionHead";
import { SignalScale } from "./SignalScale";
import { VerdictSentence } from "./VerdictSentence";
import { EmptyState } from "./states";
import { NO_FILTER, matches, type CrossFilter } from "./filter";
import { useEntryMotion } from "./useEntryMotion";
import s from "./synthese.module.css";

type ExplorationKey = "journal" | "multiples" | "strates" | "frise" | "chaine";

const EXPLORATION: { key: ExplorationKey; n: string; title: string }[] = [
  { key: "journal", n: "03.1", title: "Journal des constats" },
  { key: "multiples", n: "03.2", title: "Petits multiples par cloison" },
  { key: "strates", n: "03.3", title: "Strates normatives" },
  { key: "frise", n: "03.4", title: "Frise des référentiels" },
  { key: "chaine", n: "03.5", title: "Chaîne de preuve" },
];

/**
 * Synthèse du dossier — refonte « grand livre » : trois niveaux de lecture (Décision, Analyse, Exploration).
 * Tous les chiffres viennent du `SynthesisSnapshot` et de ses datasets ; les modèles de vue (lib/synthese-view)
 * ne font que les mettre en forme. La page ne calcule aucun montant : une décision de revue écrit un événement
 * dans le dossier, le snapshot est recalculé par le moteur, la page se relit.
 */
export function SyntheseView() {
  const { snapshot, appendReviewDecision, resetToDemo } = useActiveDossier();
  const search = useSearchParams();
  const variant: Variant = search?.get("variante") === "B" ? "B" : "A";
  const rootRef = useRef<HTMLDivElement>(null);
  useEntryMotion(rootRef);

  const findings = snapshot.findings;
  const synthesis = useMemo(() => buildSynthesisSnapshot(snapshot, { clock: () => new Date().toISOString() }), [snapshot]);
  const datasets = useMemo(
    () => buildSynthesisDatasets({ synthesis, societe: snapshot.dossier.societe, findings, admissibilityFindings: snapshot.admissibilityFindings, dossier: snapshot }),
    [synthesis, snapshot, findings],
  );
  const stages = useMemo(() => reviewStageByFinding(snapshot), [snapshot]);
  const tally = useMemo(() => tallyReview(stages), [stages]);
  const cycleRows = useMemo(() => sortCycleRows(projectCycleRows(snapshot)), [snapshot]);
  const cycleBySilo = useMemo(() => new Map(cycleRows.flatMap((row) => row.entry.silos.map((silo) => [silo, row.entry.label] as const))), [cycleRows]);
  const findingsById = useMemo(() => new Map(findings.map((f) => [f.id, f])), [findings]);
  const clos = useMemo<CloisonDef[]>(() => {
    const present = new Set(Object.keys(synthesis.risk.matrix));
    return CLOISONS.filter((c) => present.has(c.id)).map((c) => ({ id: c.id, label: c.label, short: c.short }));
  }, [synthesis]);

  // ── Modèles de vue ───────────────────────────────────────────────────────
  const verdict = useMemo(() => buildVerdictView({ synthesis, findings, admissibilityFindings: snapshot.admissibilityFindings, stages }), [synthesis, findings, snapshot.admissibilityFindings, stages]);
  const signal = useMemo(() => buildSignalView(synthesis.risk.heuristicSeverityIndex), [synthesis]);
  const admissibilityMeasure = useMemo(() => buildAdmissibilityMeasure(synthesis, datasets.fecQuality, snapshot.admissibilityFindings), [synthesis, datasets, snapshot.admissibilityFindings]);
  const coverageMeasure = useMemo(() => buildCoverageMeasure(synthesis, datasets.coverage), [synthesis, datasets]);
  const reviewMeasure = useMemo(() => buildReviewMeasure(synthesis, stages, tally), [synthesis, stages, tally]);
  const sankey = useMemo(() => layoutSankey(synthesis.risk.matrix, clos), [synthesis, clos]);
  const sankeyHeadline = useMemo(() => {
    const sources = [...new Set(findings.filter((f) => f.severity === "bloquant").map((f) => (cycleBySilo.has(f.siloId) ? shortCycleLabel(cycleBySilo.get(f.siloId) as string) : "admissibilité du FEC")))];
    return sankeyTitle({ total: sankey.total, left: sankey.left, blockingCount: synthesis.risk.bySeverity.bloquant, blockingSources: sources });
  }, [findings, cycleBySilo, sankey, synthesis]);
  const bridgeGroups = useMemo(() => buildBridgeGroups(datasets.waterfall.steps), [datasets]);
  const effects = useMemo(() => buildEffectRows(synthesis.exposure.clusters, findings), [synthesis, findings]);
  const mosaic = useMemo(() => buildMosaic(findings, clos), [findings, clos]);
  const concentration = useMemo(() => buildConcentration({ cycleRows, findings, exposure: synthesis.exposure }), [cycleRows, findings, synthesis]);
  const fileLines = snapshot.sourceDocuments.find((d) => d.documentType === "fec")?.lineCount ?? null;
  const barcode = useMemo(() => buildBarcode({ findings, admissibilityFindings: snapshot.admissibilityFindings, fileLines }), [findings, snapshot.admissibilityFindings, fileLines]);
  const journalRows = useMemo(() => buildJournalRows(findings, cycleBySilo, stages), [findings, cycleBySilo, stages]);
  const multiples = useMemo(() => buildMultiples(synthesis.risk.matrix, clos), [synthesis, clos]);
  const strata = useMemo(() => buildStrata(findings, synthesis.risk.byFamily), [findings, synthesis]);
  const frieze = useMemo(() => {
    const edition = decrireReferentiel(snapshot.dossier.referentielVersion);
    const entered = edition.kind === "edition" ? REFERENTIEL_EDITIONS.find((e) => e.numero === edition.numero)?.registreModifieLe ?? null : null;
    return buildFrieze(findings, { label: edition.libelle, enteredOn: entered });
  }, [findings, snapshot.dossier.referentielVersion]);
  const limits = useMemo(() => buildLimits({ synthesis, demoSociete: snapshot.sourceKind === "demo" ? snapshot.dossier.societe.raisonSociale : null }), [synthesis, snapshot]);
  const chainOptions = useMemo(() => orderForSelector(findings), [findings]);

  // ── Interactions ─────────────────────────────────────────────────────────
  const [filter, setFilter] = useState<CrossFilter>(NO_FILTER);
  const [cell, setCell] = useState<CellRef | null>(null);
  const cellTrigger = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState<Record<ExplorationKey, boolean>>({ journal: false, multiples: false, strates: false, frise: false, chaine: false });
  const [selected, setSelected] = useState<string>("");
  const [node, setNode] = useState(3);
  const [exportOpen, setExportOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chainError, setChainError] = useState("");

  // Sélection par défaut : le constat le plus grave ; elle suit le dossier si le constat choisi disparaît.
  const selectedFinding = findingsById.get(selected) ?? chainOptions[0] ?? null;
  const selectedId = selectedFinding?.id ?? "";

  const toggleClo = useCallback((id: CrossFilter["clo"]) => setFilter((f) => ({ clo: f.clo === id ? null : id, sev: f.sev })), []);
  const toggleSev = useCallback((sev: Severity) => setFilter((f) => ({ clo: f.clo, sev: f.sev === sev ? null : sev })), []);
  const toggleBand = useCallback((clo: CrossFilter["clo"], sev: Severity) => setFilter((f) => (f.clo === clo && f.sev === sev ? NO_FILTER : { clo, sev })), []);
  const filteredCount = useMemo(() => findings.filter((f) => matches(filter, f)).length, [findings, filter]);

  // La cible peut n'exister qu'après l'ouverture d'un accordéon : on laisse jusqu'à ~10 images au rendu.
  const scrollTo = useCallback((id: string, focus = false) => {
    let frames = 0;
    const attempt = () => {
      const el = document.getElementById(id);
      if (!el || el.closest("[hidden]")) {
        if (++frames < 10) requestAnimationFrame(attempt);
        return;
      }
      el.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      if (focus) el.focus({ preventScroll: true });
    };
    requestAnimationFrame(attempt);
  }, []);

  const openChain = useCallback(
    (id: string) => {
      setSelected(id);
      setNode(3);
      setChainError("");
      setCell(null);
      setOpen((o) => ({ ...o, chaine: true }));
      scrollTo("chaine", true);
    },
    [scrollTo],
  );

  const openProof = useCallback(
    (hash: string) => {
      setMethodOpen(true);
      scrollTo(hash.slice(1));
    },
    [scrollTo],
  );

  // Une ancre de preuve (#wp-…) ouvre la méthode, où vivent les feuilles.
  useEffect(() => {
    const follow = () => {
      if (window.location.hash.startsWith("#wp-")) {
        setMethodOpen(true);
        scrollTo(window.location.hash.slice(1));
      }
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, [scrollTo]);

  // Ancres de section (?ancre=analyse | explo), comme les planches.
  const anchor = search?.get("ancre");
  useEffect(() => {
    if (anchor === "analyse" || anchor === "explo") scrollTo(`sec-${anchor}`);
  }, [anchor, scrollTo]);

  const decide = useCallback(
    async (status: "confirmed" | "dismissed" | "pending") => {
      if (!selectedId) return;
      setBusy(true);
      setChainError("");
      try {
        await appendReviewDecision({ findingId: selectedId, newStatus: status, comment: "", relatedEvidenceIds: [] });
        setNode(4);
      } catch (error) {
        setChainError(error instanceof Error ? error.message : "Décision non enregistrée.");
      } finally {
        setBusy(false);
      }
    },
    [appendReviewDecision, selectedId],
  );

  const downloadNote = useCallback(() => {
    const note = generateSynthesisNote(synthesis, snapshot.dossier.societe);
    const blob = new Blob([note], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `note-synthese-${snapshot.dossier.societe.siren}-${snapshot.dossier.societe.exercice}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [synthesis, snapshot.dossier.societe]);

  const closeCell = useCallback(() => {
    setCell(null);
    cellTrigger.current?.focus();
  }, []);

  // ── Branches de page ─────────────────────────────────────────────────────
  if (snapshot.dossier.demoMode && snapshot.dossier.organizationId === "SYNTHETIC-DEMO" && snapshot.dossier.id.startsWith("SYN-")) {
    return <SyntheticSummary snapshot={snapshot} />;
  }
  if (snapshot.sourceDocuments.length === 0 && findings.length === 0 && snapshot.admissibilityFindings.length === 0) {
    return (
      <div ref={rootRef} data-ambiance="instruments" className={`${charteFonts} ${s.page}`}>
        <div className={s.content}>
          <EmptyState
            lead="La synthèse se construit à partir du fichier des écritures comptables (art. A.47 A-1 du LPF). Sans source, aucun constat ni signal n’est produit."
            actions={
              <>
                <Link href="/dashboard/depot" className={s.btnPrimary}>Déposer un FEC</Link>
                <button type="button" className={s.btnSecondary} onClick={() => void resetToDemo()}>Ouvrir la démo DEMO SA</button>
              </>
            }
          />
        </div>
      </div>
    );
  }

  const resultNet = synthesis.exposure.netByTarget.find((n) => n.target === "resultat");
  const proposedText = resultNet ? formatEuroCents(resultNet.proposedSignedCents, { sign: true }) : "aucun";
  const netText = resultNet
    ? `net après impôt ${resultNet.netAfterKnownTaxCents === null ? `inconnu (${resultNet.taxStatus === "partial" ? "incidence fiscale partiellement connue" : "incidence fiscale inconnue"})` : formatEuroCents(resultNet.netAfterKnownTaxCents)}`
    : null;
  const effectCount = synthesis.exposure.clusters.length;
  const decidedEffects = synthesis.exposure.clusters.filter((c) => c.status === "determined" && c.reviewStage !== "pending").length;
  const bridgeNote =
    effectCount === 0
      ? "Aucun constat ne porte d’effet financier explicite : il n’y a rien à ajuster ni à exposer."
      : decidedEffects === 0
        ? `Aucun des ${effectCount} effets chiffrés n’est arbitré à ce jour. Les montants ci-contre restent des propositions à corroborer.`
        : `${decidedEffects} des ${effectCount} effets chiffrés ${decidedEffects > 1 ? "sont arbitrés" : "est arbitré"} par l’auditeur. Les autres montants restent des propositions à corroborer.`;
  const excludedNote = `${synthesis.exposure.findingsWithoutEffect.length} constats sans effet chiffré sont exclus de l’exposition.`;
  const waterfallRows = datasets.waterfall.steps.map((step) => ({ group: step.group ?? "", label: step.label, amount: step.amountCents === null ? "inconnu" : formatEuroCents(step.amountCents, { sign: step.kind === "delta" }), note: step.note ?? "" }));
  const effectsWithAmount = findings.filter((f) => f.financialEffect).length;
  const readouts: [string, string, boolean][] = [
    ["Constats", String(findings.length), false],
    ["Bloquants", String(synthesis.risk.bySeverity.bloquant), true],
    ["Majeurs", String(synthesis.risk.bySeverity.majeur), false],
    ["Effets chiffrés", String(effectsWithAmount), false],
    ["Ajustement proposé", proposedText, false],
    ["Revue", `${synthesis.review.reviewedCount}/${synthesis.review.totalCount}`, false],
  ];
  const cellFindings = cell ? (mosaic.cells[cellKey(cell.clo, cell.column)] ?? []).map((id) => findingsById.get(id)).filter((f): f is NonNullable<typeof f> => Boolean(f)) : [];
  const cellTitle = cell ? `${mosaic.rows.find((r) => r.id === cell.clo)?.label ?? cell.clo} × ${mosaic.columns.find((c) => c.key === cell.column)?.label ?? cell.column}` : "";
  const chain = selectedFinding ? buildChain(selectedFinding, stages.get(selectedFinding.id) ?? "pending") : null;
  const stage = selectedFinding ? stages.get(selectedFinding.id) ?? "pending" : "pending";
  const edition = decrireReferentiel(snapshot.dossier.referentielVersion);
  const worksNote = worksCoverageNote(datasets.workCoverage.rows.length);

  return (
    <div ref={rootRef} style={{ display: "contents" }}>
      <div data-ambiance="instruments" className={`${charteFonts} ${s.page}`} data-variant={variant}>
        <h1 className="sr-only">Synthèse</h1>
        <div className={s.content}>
          {variant === "B" && <div aria-hidden="true" className={s.gridOverlay} />}

          {/* ══ A · Décision ═════════════════════════════════════════════════ */}
          <section data-entry="" aria-label="Décision" className={s.sectionDecision}>
            <SectionHead index={0} variant={variant} animate />
            {variant === "A" ? (
              <div className={s.decisionTopA}>
                <VerdictSentence verdict={verdict} variant="A" engineVersion={SYNTHESIS_ENGINE_VERSION} snapshotHash={synthesis.snapshotHash} onNote={downloadNote} exportOpen={exportOpen} onToggleExport={() => setExportOpen((v) => !v)} />
                <SignalScale signal={signal} variant="A" />
              </div>
            ) : (
              <div className={s.decisionTopB}>
                <VerdictSentence verdict={verdict} variant="B" engineVersion={SYNTHESIS_ENGINE_VERSION} snapshotHash={synthesis.snapshotHash} onNote={downloadNote} exportOpen={exportOpen} onToggleExport={() => setExportOpen((v) => !v)} />
                <div data-a="txt" className={s.readoutCol}>
                  <dl className={s.readouts}>
                    {readouts.map(([key, value, signalTone]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd data-signal={signalTone && synthesis.risk.bySeverity.bloquant > 0 ? "" : undefined}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <SignalScale signal={signal} variant="B" />
                </div>
              </div>
            )}
            {exportOpen && <EvidenceExportToolbar synthesis={synthesis} />}
            <MeasureStrip admissibility={admissibilityMeasure} coverage={coverageMeasure} review={reviewMeasure} worksNote={worksNote} />
            <CycleRegister rows={cycleRows} onProof={openProof} />
          </section>

          {/* ══ B · Analyse ══════════════════════════════════════════════════ */}
          <section aria-labelledby="sec-analyse" className={s.sectionAnalyse}>
            <SectionHead index={1} variant={variant} />
            <FilterBar filter={filter} clos={clos} count={filteredCount} onClear={() => setFilter(NO_FILTER)} />
            <CloisonSankey layout={sankey} clos={clos} findings={findings} filter={filter} onToggleClo={toggleClo} onToggleSev={toggleSev} onToggleBand={toggleBand} title={sankeyHeadline} variant={variant} />
            <ExposureBridge
              groups={bridgeGroups}
              title={bridgeTitle(synthesis.exposure)}
              effects={effects}
              proposedText={proposedText}
              netText={netText}
              note={bridgeNote}
              excludedNote={excludedNote}
              tableRows={waterfallRows}
              onOpenChain={openChain}
            />
            <div className={s.pair}>
              <AssertionMosaic
                model={mosaic}
                findingsById={findingsById}
                filter={filter}
                selected={cell}
                onSelect={(next, trigger) => {
                  cellTrigger.current = trigger;
                  setCell(next);
                }}
                title={mosaicTitle(mosaic)}
                method="Assertions NEP 500 §09 · luminosité graduée par nombre de constats"
              />
              <ConcentrationBars data={concentration} filter={filter} />
            </div>
            <FecBarcode data={barcode} />
          </section>

          {/* ══ C · Exploration ══════════════════════════════════════════════ */}
          <section aria-labelledby="sec-explo" className={s.sectionExplo}>
            <SectionHead index={2} variant={variant} />
            {EXPLORATION.map((item) => {
              const expanded = open[item.key];
              const sub: Record<ExplorationKey, string> = {
                journal: `${findings.length} constats · filtres, tri, recherche`,
                multiples: "une échelle commune",
                strates: "droit dur · méthode · interne",
                frise: `${frieze.length} repères datés`,
                chaine: selectedFinding ? `${selectedFinding.id} · ${REVIEW_WORD[stage]}` : "aucun constat",
              };
              return (
                <div key={item.key} className={s.explItem}>
                  <h3 className={s.explHeading}>
                    <button type="button" aria-expanded={expanded} aria-controls={`expl-${item.key}`} className={s.explToggle} onClick={() => setOpen((o) => ({ ...o, [item.key]: !o[item.key] }))}>
                      <span className={s.explNum}>{item.n}</span>
                      <span className={s.explTitle}>{item.title}</span>
                      <span className={s.explSub}>{sub[item.key]}</span>
                      <span aria-hidden="true" className={s.explSign}>{expanded ? "−" : "+"}</span>
                    </button>
                  </h3>
                  <div id={`expl-${item.key}`} hidden={!expanded} className={s.explBody}>
                    {expanded && item.key === "journal" && <FindingRegister rows={journalRows} clos={clos} filter={filter} onFilter={setFilter} selectedId={open.chaine ? selectedId : null} onOpenChain={openChain} />}
                    {expanded && item.key === "multiples" && <SmallMultiples data={multiples} />}
                    {expanded && item.key === "strates" && <NormativeStrata data={strata} />}
                    {expanded && item.key === "frise" && <StandardsFrieze items={frieze} />}
                    {expanded && item.key === "chaine" && chain && (
                      <EvidenceChain options={chainOptions} selectedId={selectedId} onSelect={(id) => { setSelected(id); setNode(3); setChainError(""); }} chain={chain} stage={stage} node={node} onNode={setNode} busy={busy} error={chainError} onDecide={(status) => void decide(status)} />
                    )}
                  </div>
                </div>
              );
            })}
          </section>

          <MethodPanel open={methodOpen} onToggle={setMethodOpen} snapshot={snapshot} datasets={datasets} />
          <LimitsMargin items={limits} />
          <footer className={s.pageFoot}>
            <span>PROBANT · moteur {synthesis.engineVersion} · référentiel {edition.libelle}</span>
            <span>snapshot {synthesis.snapshotHash.slice(0, 12)} · aucun résultat ne vaut certification</span>
          </footer>
        </div>
      </div>

      {cell && <DetailDrawer title={cellTitle} findings={cellFindings} onClose={closeCell} onOpenChain={openChain} />}
    </div>
  );
}
