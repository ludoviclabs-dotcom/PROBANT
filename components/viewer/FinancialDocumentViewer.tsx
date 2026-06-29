"use client";

import { useMemo, useState } from "react";
import type {
  AnnotatedDocument,
  Severity,
  StatutRevue,
} from "@/lib/canonical-model";
import { SEVERITY_ORDER } from "@/lib/canonical-model";
import { DocumentToolbar } from "./DocumentToolbar";
import { FecLedgerTable } from "./FecLedgerTable";
import { StatementLayout } from "./StatementLayout";
import { FindingDrawer } from "./FindingDrawer";
import type { DocCounts, SeverityFilter } from "./types";

function computeDocCounts(doc: AnnotatedDocument): DocCounts {
  const c: DocCounts = {
    bloquant: 0,
    majeur: 0,
    mineur: 0,
    informatif: 0,
    sain: 0,
    total: 0,
    findings: doc.findings.length,
  };

  if (doc.ledger) {
    const sevById = new Map<string, Severity>(
      doc.findings.map((f) => [f.id, f.severity] as const),
    );
    for (const row of doc.ledger) {
      c.total++;
      let best: Severity | null = null;
      for (const id of row.flagIds) {
        const sev = sevById.get(id);
        if (!sev) continue;
        if (best === null || SEVERITY_ORDER[sev] < SEVERITY_ORDER[best]) {
          best = sev;
        }
      }
      if (best) c[best]++;
      else c.sain++;
    }
  } else if (doc.sections) {
    for (const s of doc.sections) {
      for (const row of s.rows) {
        c.total++;
        if (row.flaggedBy && row.severity) c[row.severity]++;
        else c.sain++;
      }
    }
  }

  return c;
}

/**
 * Visualiseur de document financier annoté : grand-livre FEC réel ou états
 * reconstitués (Bilan / Compte de résultat / Flux), avec flags posés sur les
 * lignes, filtres par gravité, et détail normatif au clic.
 */
export function FinancialDocumentViewer({
  docs,
}: {
  docs: AnnotatedDocument[];
}) {
  const [activeId, setActiveId] = useState(docs[0]?.id ?? "");
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, StatutRevue>>({});

  const doc = docs.find((d) => d.id === activeId) ?? docs[0];
  const counts = useMemo(() => (doc ? computeDocCounts(doc) : null), [doc]);

  if (!doc || !counts) return null;

  const selected = selectedId
    ? doc.findings.find((f) => f.id === selectedId) ?? null
    : null;

  function exportJson() {
    if (typeof window === "undefined") return;
    const payload = {
      probant: "document-annote",
      genereLe: new Date().toISOString(),
      document: {
        type: doc.type,
        titre: doc.titre,
        societe: doc.societe,
        exercice: doc.exercice,
        origine: doc.origine,
        metadata: doc.metadata,
      },
      findings: doc.findings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `probant-${doc.type}-${doc.exercice}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    if (typeof window !== "undefined") window.print();
  }

  return (
    <div
      data-pb-print
      className="overflow-hidden rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)]"
      style={{ animation: "pb-fade-in 0.3s ease-out" }}
    >
      <DocumentToolbar
        docs={docs}
        activeId={doc.id}
        onSelectDoc={(id) => {
          setActiveId(id);
          setSelectedId(null);
        }}
        doc={doc}
        counts={counts}
        filter={filter}
        onFilter={setFilter}
        onExportPdf={exportPdf}
        onExportJson={exportJson}
      />

      <div className="p-3">
        {doc.ledger ? (
          <FecLedgerTable
            ledger={doc.ledger}
            findings={doc.findings}
            filter={filter}
            onSelectFinding={setSelectedId}
          />
        ) : doc.sections ? (
          <StatementLayout
            doc={doc}
            filter={filter}
            onSelectFinding={setSelectedId}
          />
        ) : (
          <p className="p-6 text-center text-[13px] text-[var(--pb-text-faint)]">
            Aucun contenu de document à afficher.
          </p>
        )}
      </div>

      <FindingDrawer
        finding={selected}
        statut={selected ? decisions[selected.id] : undefined}
        onClose={() => setSelectedId(null)}
        onDecision={(id, statut) =>
          setDecisions((prev) => ({ ...prev, [id]: statut }))
        }
      />
    </div>
  );
}
