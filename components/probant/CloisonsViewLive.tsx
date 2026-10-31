"use client";

import { useEffect, useMemo, useState } from "react";
import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import type { CloisonId, FecEntry, Finding } from "@/lib/canonical-model";
import { CLOISONS, SEVERITY_LABEL, buildFecDocument, siloById } from "@/lib/canonical-model";
import { SeverityGlyph } from "@/components/charte/SeverityMark";
import { FamilyRule } from "@/components/charte/FamilyRule";
import { FinancialDocumentViewer } from "@/components/viewer/FinancialDocumentViewer";
import { FAMILY_TEXT, plural } from "@/lib/synthese-view/common";
import { useActiveDossier } from "@/lib/dossier/client";
import p from "@/components/charte/page.module.css";
import c from "./cloisons.module.css";

interface LiveMeta {
  societe: string;
  exercice: string;
  nomFichier: string;
}

type Vue = "cloison" | "document";

const LEDGER_PAGE_SIZE = 500;
const MAX_RENDERED_LEDGER_ROWS = 2_000;

interface LedgerPage {
  entries: FecEntry[];
  nextCursor: string | null;
  total: number;
}

function groupByCloison(findings: Finding[]): Map<CloisonId, Finding[]> {
  const map = new Map<CloisonId, Finding[]>();
  for (const f of findings) {
    const arr = map.get(f.cloison) ?? [];
    arr.push(f);
    map.set(f.cloison, arr);
  }
  return map;
}

/** Le grand livre paginé n'a pas pu être lu : l'aperçu document est indisponible, les constats restent lisibles. */
function LedgerError() {
  return (
    <p role="alert" className={c.liveNotice} data-tone="error">
      <strong>Grand livre indisponible.</strong>
      <span>La lecture paginée du FEC a échoué : la vue document n&apos;est pas proposée. Les constats du snapshot restent affichés.</span>
    </p>
  );
}

/* ── composant interne (reçoit des findings valides) ── */
function LiveInner({
  findings,
  entries,
  meta,
  admissibilite,
  storageLabel,
  ledgerTotal,
  ledgerError,
}: {
  findings: Finding[];
  entries: FecEntry[];
  meta: LiveMeta | null;
  admissibilite: Finding[];
  storageLabel: string;
  ledgerTotal: number;
  ledgerError: boolean;
}) {
  const byCloison = groupByCloison(findings);
  const cloisonsPresentes = CLOISONS.filter((cl) => byCloison.has(cl.id));
  const [active, setActive] = useState<CloisonId>(
    cloisonsPresentes[0]?.id ?? "bilan-actif",
  );
  const [vue, setVue] = useState<Vue>("cloison");
  const activeFindings = byCloison.get(active) ?? [];

  const documentDisponible = entries.length > 0;
  const docs = useMemo(() => {
    if (!documentDisponible) return [];
    return [
      buildFecDocument({
        societe: meta?.societe ?? meta?.nomFichier ?? "FEC déposé",
        exercice: meta?.exercice ?? "—",
        origine: "upload",
        entries,
        findings,
        admissibilite,
      }),
    ];
  }, [documentDisponible, entries, findings, meta, admissibilite]);

  return (
    <div>
      {/* Bandeau FEC réel */}
      <p className={c.liveNotice}>
        <strong>Analyse de votre FEC réel</strong>
        <span>
          {findings.length} {plural(findings.length, "constat détecté", "constats détectés")}.{" "}
          <Link href="/dashboard/depot">Déposer un autre fichier</Link>
        </span>
      </p>
      {ledgerError && <LedgerError />}

      {/* Bascule de vue */}
      {documentDisponible && (
        <div className={`${p.toggleGroup} ${c.viewSwitch} ${c.liveSwitch}`} role="group" aria-label="Vue">
          <span className={p.key}>Vue</span>
          <button type="button" onClick={() => setVue("cloison")} aria-pressed={vue === "cloison"} className={`${p.toggle} ${c.viewToggle}`}>
            Vue par cloison
          </button>
          <button type="button" onClick={() => setVue("document")} aria-pressed={vue === "document"} className={`${p.toggle} ${c.viewToggle}`}>
            Vue document (FEC)
          </button>
        </div>
      )}

      {vue === "document" && documentDisponible ? (
        <div className={`${c.documentFrame} ${c.liveSwitch}`}>
          <FinancialDocumentViewer docs={docs} />
        </div>
      ) : (
        <>
          {/* Onglets cloisons */}
          <div className={c.liveTabs} role="group" aria-label="Cloison">
            <span className={p.key}>Cloison</span>
            {cloisonsPresentes.map((cl) => {
              const n = (byCloison.get(cl.id) ?? []).length;
              return (
                <button
                  key={cl.id}
                  type="button"
                  onClick={() => setActive(cl.id)}
                  aria-pressed={cl.id === active}
                  className={`${p.toggle} ${c.viewToggle}`}
                >
                  {cl.label}
                  {n > 0 && <span className={c.mono}> · {n}</span>}
                </button>
              );
            })}
          </div>

          {/* Constats de la cloison active */}
          <ul className={c.liveList}>
            {activeFindings.map((f) => {
              const silo = siloById(f.siloId);
              return (
                <li key={f.id} className={c.liveItem}>
                  <div className={c.liveItemHead}>
                    <span className={c.cardMeta}>
                      <span>
                        <SeverityGlyph severity={f.severity} />
                        {SEVERITY_LABEL[f.severity]}
                      </span>
                      <span>
                        <FamilyRule family={f.family} />
                        {FAMILY_TEXT[f.family].label}
                      </span>
                    </span>
                    {silo && <span className={c.liveSilo}>{silo.label}</span>}
                  </div>
                  <p className={c.liveItemTitle}>{f.titre}</p>
                  <p className={c.constat}>{f.constat}</p>
                  <p className={c.liveRef}>{f.source.ref}</p>
                  {f.faisceau.length > 0 && (
                    <ul className={`${c.faisceau} ${c.liveFaisceau}`}>
                      {f.faisceau.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  )}
                </li>
              );
            })}

            {activeFindings.length === 0 && <li className={c.cardsEmpty}>Aucun constat dans cette cloison.</li>}
          </ul>
        </>
      )}

      <p className={c.liveFoot}>
        Source de vérité : snapshot actif ({storageLabel}).
        {ledgerTotal > entries.length
          ? ` Aperçu borné à ${entries.length.toLocaleString("fr-FR")} ligne(s) sur ${ledgerTotal.toLocaleString("fr-FR")}; le grand livre complet reste paginé.`
          : ""}
      </p>
    </div>
  );
}

/* ── shell : consomme exclusivement le DossierSnapshot actif ── */
export function CloisonsViewLive() {
  const { context, snapshot } = useActiveDossier();
  const admissibilityIds = useMemo(
    () => new Set(snapshot.admissibilityFindings.map((finding) => finding.id)),
    [snapshot.admissibilityFindings],
  );
  const findings = useMemo(
    () => snapshot.findings.filter((finding) => !admissibilityIds.has(finding.id)),
    [admissibilityIds, snapshot.findings],
  );
  const source = snapshot.sourceDocuments.find((document) => document.documentType === "fec")
    ?? snapshot.sourceDocuments.at(0);
  const meta: LiveMeta = {
    societe: snapshot.dossier.societe.raisonSociale,
    exercice: snapshot.dossier.societe.exercice,
    nomFichier: source?.fileName ?? "Dossier actif",
  };
  const [persistentLedger, setPersistentLedger] = useState<{
    entries: FecEntry[];
    total: number;
    loading: boolean;
    error: boolean;
  }>({ entries: [], total: 0, loading: false, error: false });

  useEffect(() => {
    if (snapshot.sourceKind !== "persistent" || !source || source.documentType !== "fec") {
      setPersistentLedger({ entries: [], total: 0, loading: false, error: false });
      return;
    }

    const abortController = new AbortController();
    setPersistentLedger({ entries: [], total: source.lineCount ?? 0, loading: true, error: false });

    void (async () => {
      const entries: FecEntry[] = [];
      let cursor: string | null = null;
      let total = source.lineCount ?? 0;
      do {
        const params = new URLSearchParams({
          sourceDocumentId: source.id,
          pageSize: String(LEDGER_PAGE_SIZE),
        });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(
          `/api/dossiers/${encodeURIComponent(context.dossierId)}/ledger?${params.toString()}`,
          { signal: abortController.signal, cache: "no-store" },
        );
        if (!response.ok) throw new Error("LEDGER_PAGE_UNAVAILABLE");
        const page = (await response.json()) as LedgerPage;
        entries.push(...page.entries);
        total = page.total;
        cursor = page.nextCursor;
      } while (cursor && entries.length < MAX_RENDERED_LEDGER_ROWS);

      if (!abortController.signal.aborted) {
        setPersistentLedger({
          entries: entries.slice(0, MAX_RENDERED_LEDGER_ROWS),
          total,
          loading: false,
          error: false,
        });
      }
    })().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!abortController.signal.aborted) {
        setPersistentLedger({ entries: [], total: source.lineCount ?? 0, loading: false, error: true });
      }
    });

    return () => abortController.abort();
  }, [context.dossierId, snapshot.sourceKind, source]);

  const entries: FecEntry[] = snapshot.sourceKind === "persistent"
    ? persistentLedger.entries
    : snapshot.ledgerEntries ?? [];
  const ledgerTotal = snapshot.sourceKind === "persistent"
    ? persistentLedger.total
    : entries.length;
  const ledgerError = snapshot.sourceKind === "persistent" && persistentLedger.error;

  if (snapshot.dossier.demoMode) {
    return (
      <div className={c.liveState}>
        <p className={c.liveStateTitle}>Aucun dépôt réel n&apos;est actif</p>
        <p className={c.liveStateText}>Sélectionnez un snapshot de session ou déposez un FEC.</p>
        <Link href="/dashboard/depot" className={c.backLink}>← Retour au dépôt</Link>
      </div>
    );
  }

  if (snapshot.sourceKind === "persistent" && persistentLedger.loading) {
    return (
      <div className={c.liveState} role="status">
        <p className={c.liveStateText}>Chargement paginé du grand livre…</p>
      </div>
    );
  }

  if (findings.length === 0 && entries.length === 0) {
    return (
      <div>
        {ledgerError && <LedgerError />}
        <div className={c.liveState}>
          <p className={c.liveStateTitle}>Aucun constat analytique</p>
          <p className={c.liveStateText}>
            Le moteur de règles n&apos;a détecté aucune anomalie significative sur ce FEC.
            {ledgerError ? " Le grand livre n'a toutefois pas pu être relu : cette absence porte sur les constats du snapshot." : ""}
          </p>
          <Link href="/dashboard/depot" className={c.backLink}>← Retour au dépôt</Link>
        </div>
      </div>
    );
  }

  return (
    <LiveInner
      findings={findings}
      entries={entries}
      meta={meta}
      admissibilite={snapshot.admissibilityFindings}
      storageLabel={snapshot.sourceKind}
      ledgerTotal={ledgerTotal}
      ledgerError={ledgerError}
    />
  );
}
