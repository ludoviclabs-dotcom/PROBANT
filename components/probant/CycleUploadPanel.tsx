"use client";

import { Suspense, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  UploadCloud,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSpreadsheet,
  RotateCcw,
} from "lucide-react";
import {
  AUDIT_CYCLES,
  documentTypesForCycle,
  type AuditCycle,
  type DocumentType,
} from "@/lib/rapprochement/catalog";
import { parseTabularDocument } from "@/lib/rapprochement/parse-upload";
import { buildRapprochementDepuisDepot } from "@/lib/rapprochement/build-from-upload";
import type { DocumentSource } from "@/lib/rapprochement/types";
import type { Finding, SiloView } from "@/lib/canonical-model";
import { SeverityBadge } from "./Badges";
import { LIVE_FINDINGS_KEY } from "./CloisonsViewLive";
import { cn } from "@/lib/utils";

export const LIVE_RAPPROCHEMENT_KEY = "probant:live-rapprochement";

interface DocState {
  statut: "vide" | "en_cours" | "ok" | "erreur";
  fichier?: File;
  documentSource?: DocumentSource;
  erreur?: string;
}

interface PanelState {
  cycleId: string | null;
  docs: Record<string, DocState>;
  silo: SiloView | null;
  erreurRapprochement: string | null;
}

type Action =
  | { type: "SELECT_CYCLE"; cycleId: string }
  | { type: "START_PARSE"; documentTypeId: string; fichier: File }
  | { type: "PARSE_OK"; documentTypeId: string; documentSource: DocumentSource }
  | { type: "PARSE_ERROR"; documentTypeId: string; erreur: string }
  | { type: "SET_SILO"; silo: SiloView | null; erreurRapprochement: string | null }
  | { type: "RESET" };

const INITIAL_STATE: PanelState = {
  cycleId: null,
  docs: {},
  silo: null,
  erreurRapprochement: null,
};

function reducer(state: PanelState, action: Action): PanelState {
  switch (action.type) {
    case "SELECT_CYCLE":
      return { cycleId: action.cycleId, docs: {}, silo: null, erreurRapprochement: null };
    case "START_PARSE":
      return {
        ...state,
        docs: {
          ...state.docs,
          [action.documentTypeId]: { statut: "en_cours", fichier: action.fichier },
        },
      };
    case "PARSE_OK":
      return {
        ...state,
        docs: {
          ...state.docs,
          [action.documentTypeId]: {
            statut: "ok",
            fichier: state.docs[action.documentTypeId]?.fichier,
            documentSource: action.documentSource,
          },
        },
      };
    case "PARSE_ERROR":
      return {
        ...state,
        docs: {
          ...state.docs,
          [action.documentTypeId]: {
            statut: "erreur",
            fichier: state.docs[action.documentTypeId]?.fichier,
            erreur: action.erreur,
          },
        },
      };
    case "SET_SILO":
      return { ...state, silo: action.silo, erreurRapprochement: action.erreurRapprochement };
    case "RESET":
      return INITIAL_STATE;
    default:
      return state;
  }
}

export function CycleUploadPanel() {
  return (
    <Suspense fallback={null}>
      <CycleUploadPanelInner />
    </Suspense>
  );
}

function CycleUploadPanelInner() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const searchParams = useSearchParams();
  const cycle = state.cycleId
    ? AUDIT_CYCLES.find((c) => c.id === state.cycleId) ?? null
    : null;
  // documentTypesForCycle() renvoie un nouveau tableau à chaque appel : mémoïser
  // est indispensable ici, sinon la référence change à chaque rendu et le
  // useEffect ci-dessous se redéclenche en boucle infinie après chaque SET_SILO.
  const documentTypes = useMemo(
    () => (cycle ? documentTypesForCycle(cycle.id) : []),
    [cycle],
  );

  // Deep-link : ?cycle=<id> sélectionne automatiquement le cycle au montage.
  useEffect(() => {
    const cycleParam = searchParams.get("cycle");
    if (cycleParam && AUDIT_CYCLES.some((c) => c.id === cycleParam)) {
      dispatch({ type: "SELECT_CYCLE", cycleId: cycleParam });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFile(documentType: DocumentType, fichier: File) {
    dispatch({ type: "START_PARSE", documentTypeId: documentType.id, fichier });
    try {
      const resultat = await parseTabularDocument(fichier, documentType);
      dispatch({
        type: "PARSE_OK",
        documentTypeId: documentType.id,
        documentSource: resultat.documentSource,
      });
    } catch (e) {
      dispatch({
        type: "PARSE_ERROR",
        documentTypeId: documentType.id,
        erreur: e instanceof Error ? e.message : "Erreur de lecture du fichier.",
      });
    }
  }

  useEffect(() => {
    if (!cycle) return;
    const docTypeSource = documentTypes.find((d) => d.role === "source");
    const docTypeCible = documentTypes.find((d) => d.role === "cible");
    if (!docTypeSource || !docTypeCible) return;

    const docSource = state.docs[docTypeSource.id];
    const docCible = state.docs[docTypeCible.id];
    if (
      docSource?.statut !== "ok" ||
      !docSource.documentSource ||
      docCible?.statut !== "ok" ||
      !docCible.documentSource
    ) {
      return;
    }

    try {
      const silo = buildRapprochementDepuisDepot(
        cycle.id,
        docSource.documentSource,
        docCible.documentSource,
      );
      dispatch({ type: "SET_SILO", silo, erreurRapprochement: null });
      try {
        const brut = sessionStorage.getItem(LIVE_RAPPROCHEMENT_KEY);
        const existant = brut ? JSON.parse(brut) : {};
        sessionStorage.setItem(
          LIVE_RAPPROCHEMENT_KEY,
          JSON.stringify({ ...existant, [cycle.id]: silo }),
        );
      } catch {
        /* ignore si sessionStorage indisponible */
      }
      try {
        const brutFindings = sessionStorage.getItem(LIVE_FINDINGS_KEY);
        const parsed: unknown = brutFindings ? JSON.parse(brutFindings) : [];
        const existants: Finding[] = Array.isArray(parsed) ? (parsed as Finding[]) : [];
        const byId = new Map<string, Finding>();
        for (const f of existants) byId.set(f.id, f);
        for (const f of silo.findings) byId.set(f.id, f);
        sessionStorage.setItem(LIVE_FINDINGS_KEY, JSON.stringify([...byId.values()]));
      } catch {
        /* ignore si sessionStorage indisponible */
      }
    } catch (e) {
      dispatch({
        type: "SET_SILO",
        silo: null,
        erreurRapprochement: e instanceof Error ? e.message : "Erreur de rapprochement.",
      });
    }
  }, [state.docs, cycle, documentTypes]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {AUDIT_CYCLES.map((c) => (
          <CycleCard
            key={c.id}
            cycle={c}
            active={c.id === state.cycleId}
            onClick={() => dispatch({ type: "SELECT_CYCLE", cycleId: c.id })}
          />
        ))}
      </div>

      {cycle && (
        <div className="space-y-3">
          {documentTypes.map((docType) => (
            <DocumentDropRow
              key={docType.id}
              documentType={docType}
              state={state.docs[docType.id] ?? { statut: "vide" }}
              onFile={(fichier) => handleFile(docType, fichier)}
            />
          ))}
        </div>
      )}

      {state.erreurRapprochement && (
        <div className="flex items-center gap-2 rounded-xl border border-[#ef4444]/50 bg-[#2a1416] p-4 text-sm text-[#ef4444]">
          <XCircle className="h-4 w-4" /> {state.erreurRapprochement}
        </div>
      )}

      {state.silo && <RapprochementResult silo={state.silo} />}

      {(state.cycleId || state.silo) && (
        <button
          onClick={() => dispatch({ type: "RESET" })}
          className="flex items-center gap-2 rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface)] px-3 py-2 text-[12px] font-medium text-[var(--pb-text-muted)] hover:border-[var(--pb-border-strong)] hover:text-[var(--pb-text)]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Réinitialiser
        </button>
      )}
    </div>
  );
}

function CycleCard({
  cycle,
  active,
  onClick,
}: {
  cycle: AuditCycle;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors",
        active
          ? "border-[var(--pb-accent)] bg-[var(--pb-accent)]/8"
          : "border-[var(--pb-border)] bg-[var(--pb-surface)] hover:border-[var(--pb-border-strong)]",
      )}
    >
      <div className="text-sm font-semibold text-[var(--pb-text)]">{cycle.nom}</div>
      <div className="text-[12px] text-[var(--pb-text-muted)]">{cycle.description}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {cycle.famillesComptes.map((f) => (
          <span
            key={f}
            className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--pb-text-faint)]"
          >
            {f}
          </span>
        ))}
      </div>
    </button>
  );
}

function extAccept(documentType: DocumentType): string {
  return documentType.formats.map((f) => `.${f}`).join(",");
}

function DocumentDropRow({
  documentType,
  state,
  onFile,
}: {
  documentType: DocumentType;
  state: DocState;
  onFile: (fichier: File) => void;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors",
        drag
          ? "border-[var(--pb-accent)] bg-[var(--pb-accent)]/8"
          : "border-[var(--pb-border-strong)] bg-[var(--pb-surface)] hover:border-[var(--pb-accent)]/60",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={extAccept(documentType)}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <UploadCloud className="mt-0.5 h-6 w-6 shrink-0 text-[var(--pb-accent)]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--pb-text)]">
            {documentType.libelle}
          </span>
          <span className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
            {documentType.role === "source" ? "Document A" : "Document B"}
          </span>
        </div>
        <div className="mt-0.5 text-[12px] text-[var(--pb-text-muted)]">
          {documentType.description}
        </div>
        <DocStateIndicator state={state} />
      </div>
    </div>
  );
}

function DocStateIndicator({ state }: { state: DocState }) {
  if (state.statut === "en_cours") {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[var(--pb-accent)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Lecture en cours…
      </div>
    );
  }
  if (state.statut === "ok") {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#22c55e]">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {state.documentSource?.lignes.length ?? 0} ligne(s) lue(s)
        {state.fichier && (
          <span className="text-[var(--pb-text-faint)]"> · {state.fichier.name}</span>
        )}
      </div>
    );
  }
  if (state.statut === "erreur") {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#ef4444]">
        <XCircle className="h-3.5 w-3.5" />
        {state.erreur}
      </div>
    );
  }
  return (
    <div className="mt-1.5 text-[12px] text-[var(--pb-text-faint)]">
      Aucun fichier déposé — cliquez ou glissez ici.
    </div>
  );
}

function RapprochementResult({ silo }: { silo: SiloView }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--pb-text)]">
          <FileSpreadsheet className="h-4 w-4 text-[var(--pb-accent)]" />
          {silo.statement.titre}
        </div>
        {silo.statement.documents && silo.statement.documents.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {silo.statement.documents.map((doc) => (
              <span
                key={doc.label}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  border: "1px solid rgba(34,197,94,0.35)",
                  background: "rgba(34,197,94,0.1)",
                  color: "#4ade80",
                }}
              >
                ✓ {doc.label}
              </span>
            ))}
          </div>
        )}
        <div className="tnum mt-3 space-y-1">
          {silo.statement.rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between border-t border-[var(--pb-border)] py-1.5 text-[12px] first:border-t-0 first:pt-0"
            >
              <span className="text-[var(--pb-text-muted)]">{row.label}</span>
              <span className="font-semibold text-[var(--pb-text)]">
                {row.valeur.toLocaleString("fr-FR")} €
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--pb-text)]">
          <span className="tnum">{silo.findings.length}</span> constat(s) détecté(s)
        </h3>
        {silo.findings.length > 0 && (
          <ul className="mt-3 space-y-2">
            {silo.findings.slice(0, 5).map((f) => (
              <li
                key={f.id}
                className="flex items-start gap-3 rounded-lg border border-[var(--pb-border)] bg-[var(--pb-surface-2)] p-3"
              >
                <SeverityBadge severity={f.severity} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--pb-text)]">
                    {f.titre}
                  </div>
                  <div className="text-[12px] text-[var(--pb-text-muted)]">{f.constat}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
