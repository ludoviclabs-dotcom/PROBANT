"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  Fingerprint,
  AlertTriangle,
  Scale,
  Play,
  ChevronUp,
} from "lucide-react";
import { SCENARIOS } from "@/lib/demo/scenarios";
import { SimulationPanel } from "./SimulationPanel";
import { LIVE_FINDINGS_KEY, LIVE_FEC_KEY, LIVE_META_KEY, LIVE_ADMISSIBILITE_KEY } from "./CloisonsViewLive";
import type { FecEntry, Finding, Severity } from "@/lib/canonical-model";
import { buildFecDocument } from "@/lib/canonical-model";
import { FinancialDocumentViewer } from "@/components/viewer/FinancialDocumentViewer";
import type {
  BalanceValidation,
  ParsedBalance,
  ParsedLiasse,
} from "@/lib/balance/types";
import { parseBalanceFile } from "@/lib/balance/parse-xlsx";
import { validateBalance } from "@/lib/balance/validate";
import { parseLiasseFile } from "@/lib/pdf/parse-liasse";
import { cn } from "@/lib/utils";
import { SeverityBadge } from "./Badges";
import { CycleUploadPanel } from "./CycleUploadPanel";

interface DepotResult {
  nomFichier: string;
  fingerprint: string;
  siren: string | null;
  referentielVersion: string;
  mapping: {
    separateur: string;
    variante: string;
    nbColonnes: number;
    colonnes: string[];
    nbEntries: number;
  };
  admissibilite: Finding[];
  analyse: Finding[];
  parseErrors: string[];
  entries: FecEntry[];
  entriesTruncated: boolean;
}

type Result =
  | { kind: "fec"; data: DepotResult }
  | { kind: "balance"; data: ParsedBalance; validation: BalanceValidation }
  | { kind: "pdf"; data: ParsedLiasse };

const FEC_PIPELINE = [
  "Empreinte SHA-256",
  "Parsing du fichier",
  "Validation réglementaire (hardLaw)",
  "Exécution du moteur de règles",
  "Restitution",
];
const CLIENT_PIPELINE = [
  "Lecture locale du fichier",
  "Analyse de la structure",
  "Contrôles & restitution",
];

const SEVERITY_HEX: Record<Severity, string> = {
  bloquant: "#ef4444",
  majeur: "#f97316",
  mineur: "#eab308",
  informatif: "#3b82f6",
};

const fmtEUR = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";

/** Exercice dominant déduit des dates d'écriture du FEC (AAAA). */
function exerciceFromEntries(entries: FecEntry[]): string {
  const years = new Map<string, number>();
  for (const e of entries) {
    const y = e.ecritureDate?.slice(0, 4);
    if (y && /^\d{4}$/u.test(y)) years.set(y, (years.get(y) ?? 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [y, n] of years) {
    if (n > bestN) {
      best = y;
      bestN = n;
    }
  }
  return best || "—";
}

export function DepotView() {
  return (
    <Suspense fallback={null}>
      <DepotViewInner />
    </Suspense>
  );
}

function DepotViewInner() {
  const searchParams = useSearchParams();
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">(
    "idle",
  );
  const [pipeline, setPipeline] = useState<string[]>(FEC_PIPELINE);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSim, setShowSim] = useState(false);
  const [showCycleUpload, setShowCycleUpload] = useState(() => searchParams.get("cycle") !== null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus("processing");
    setError(null);
    setResult(null);
    setStep(0);

    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    try {
      let kind: "fec" | "balance" | "pdf";
      if (ext === "pdf") kind = "pdf";
      else if (ext === "xlsx" || ext === "xls") kind = "balance";
      else if (ext === "txt") kind = "fec";
      else if (ext === "csv") {
        const head = (await file.slice(0, 600).text()).toLowerCase();
        kind = /journalcode|ecriturenum|comptenum/.test(head) ? "fec" : "balance";
      } else {
        throw new Error(
          "Format non supporté. Acceptés : FEC .txt/.csv, balance .xlsx/.csv, liasse .pdf.",
        );
      }

      if (kind === "fec") {
        setPipeline(FEC_PIPELINE);
        const timers = FEC_PIPELINE.map((_, i) =>
          setTimeout(() => setStep(i), i * 350),
        );
        try {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("/api/depot", { method: "POST", body: fd });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error ?? `Erreur ${res.status}`);
          }
          const data: DepotResult = await res.json();
          timers.forEach(clearTimeout);
          setStep(FEC_PIPELINE.length - 1);
          setResult({ kind: "fec", data });
          setStatus("done");
          try {
            const exercice = exerciceFromEntries(data.entries);
            // Fusion, pas écrasement : un dépôt FEC remplace ses propres constats
            // d'analyse mais PRÉSERVE les constats issus d'un dépôt par cycle
            // (origine "rapprochement"), qui écrivent dans la même clé de session.
            // Sans cela, déposer un FEC après un rapprochement effacerait
            // silencieusement ce dernier (et le ferait disparaître de la
            // cartographie des risques qui lit cette même clé).
            let previousLive: Finding[] = [];
            try {
              const raw = sessionStorage.getItem(LIVE_FINDINGS_KEY);
              const parsed: unknown = raw ? JSON.parse(raw) : [];
              if (Array.isArray(parsed)) previousLive = parsed as Finding[];
            } catch { /* clé absente ou illisible : on repart d'une liste vide */ }
            const mergedById = new Map<string, Finding>();
            for (const f of previousLive) {
              if (f.origine === "rapprochement") mergedById.set(f.id, f);
            }
            for (const f of data.analyse) mergedById.set(f.id, f);
            sessionStorage.setItem(
              LIVE_FINDINGS_KEY,
              JSON.stringify([...mergedById.values()]),
            );
            sessionStorage.setItem(LIVE_ADMISSIBILITE_KEY, JSON.stringify(data.admissibilite));
            // On préserve toutes les lignes référencées par les constats et
            // on complète jusqu'à CAP avec des lignes saines, pour ne jamais
            // perdre de flags dans le grand-livre annoté.
            const SESSION_ENTRIES_CAP = 8000;
            const referencedLignes = new Set(
              data.analyse.flatMap((f) => f.lignesSource),
            );
            const priorityRows = data.entries.filter((e) => referencedLignes.has(e.ligne));
            const otherRows = data.entries.filter((e) => !referencedLignes.has(e.ligne));
            const cap = Math.max(0, SESSION_ENTRIES_CAP - priorityRows.length);
            const sessionEntries = [
              ...priorityRows,
              ...otherRows.slice(0, cap),
            ].sort((a, b) => a.ligne - b.ligne);
            sessionStorage.setItem(LIVE_FEC_KEY, JSON.stringify(sessionEntries));
            sessionStorage.setItem(
              LIVE_META_KEY,
              JSON.stringify({
                societe: data.siren ?? data.nomFichier,
                exercice,
                nomFichier: data.nomFichier,
              }),
            );
          } catch { /* ignore si sessionStorage indisponible */ }
        } catch (e) {
          timers.forEach(clearTimeout);
          throw e;
        }
        return;
      }

      // Formats agrégés : parsing 100 % local (navigateur).
      setPipeline(CLIENT_PIPELINE);
      setStep(0);
      if (kind === "balance") {
        const data = await parseBalanceFile(file);
        setStep(1);
        const validation = validateBalance(data);
        setStep(2);
        setResult({ kind: "balance", data, validation });
      } else {
        const data = await parseLiasseFile(file);
        setStep(2);
        setResult({ kind: "pdf", data });
      }
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      {/* Zone de dépôt */}
      <div
        data-tour="depot-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          drag
            ? "border-[var(--pb-accent)] bg-[var(--pb-accent)]/8"
            : "border-[var(--pb-border-strong)] bg-[var(--pb-surface)] hover:border-[var(--pb-accent)]/60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.csv,.xlsx,.xls,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <UploadCloud className="h-9 w-9 text-[var(--pb-accent)]" />
        <div className="mt-3 text-sm font-semibold text-[var(--pb-text)]">
          Déposez un FEC, une balance ou une liasse — ou cliquez pour parcourir
        </div>
        <div className="mt-1 text-[12px] text-[var(--pb-text-faint)]">
          Aucun fichier n'est stocké. Balance et liasse sont analysées
          directement dans votre navigateur.
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px]">
          <span
            title="FEC dématérialisé — fichier des écritures comptables (.txt, .csv). Analyse par le moteur de règles."
            className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1 text-[var(--pb-accent)]"
          >
            FEC .txt / .csv
          </span>
          <span
            title="Balance générale — exports Sage, Cegid, EBP… (.xlsx, .xls, .csv). Détection des colonnes débit/crédit et contrôles de cohérence."
            className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1 text-[var(--pb-accent)]"
          >
            XLSX / CSV balance
          </span>
          <span
            title="Liasse fiscale / états financiers (.pdf). Extraction best-effort du SIREN, de l'exercice et des postes-clés."
            className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1 text-[var(--pb-accent)]"
          >
            PDF liasse
          </span>
        </div>
      </div>

      {/* Pipeline */}
      {status !== "idle" && (
        <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            {pipeline.map((label, i) => {
              const reached = i <= step || status === "done";
              const current = i === step && status === "processing";
              return (
                <div key={label} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]",
                      reached
                        ? "bg-[var(--pb-accent)]/12 text-[var(--pb-accent)]"
                        : "bg-[var(--pb-surface-2)] text-[var(--pb-text-faint)]",
                    )}
                  >
                    {current ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : reached ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <span className="h-3 w-3 rounded-full border border-current" />
                    )}
                    {label}
                  </span>
                  {i < pipeline.length - 1 && (
                    <span className="text-[var(--pb-text-faint)]">›</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-[#ef4444]/50 bg-[#2a1416] p-4 text-sm text-[#ef4444]">
          <XCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Résultats */}
      {result?.kind === "fec" && status === "done" && (
        <FecResult data={result.data} />
      )}
      {result?.kind === "balance" && status === "done" && (
        <BalanceResult data={result.data} validation={result.validation} />
      )}
      {result?.kind === "pdf" && status === "done" && (
        <LiasseResult data={result.data} />
      )}

      {/* Aide démo */}
      {status === "idle" && (
        <div className="rounded-xl border border-dashed border-[var(--pb-border)] bg-[var(--pb-surface)] p-4 text-[13px] text-[var(--pb-text-muted)]">
          Pas de fichier sous la main ? La{" "}
          <Link
            href="/dashboard/cloisons"
            className="font-semibold text-[var(--pb-accent)] hover:underline"
          >
            revue par cloison
          </Link>{" "}
          est préchargée avec la société de démonstration DEMO SA.
        </div>
      )}

      {/* Simulation */}
      {status === "idle" && (
        <div className="space-y-3">
          {/* Séparateur */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--pb-border)]" />
            <span className="text-[11px] uppercase tracking-wider text-[var(--pb-text-faint)]">
              ou
            </span>
            <div className="h-px flex-1 bg-[var(--pb-border)]" />
          </div>

          {/* Bouton / Panel */}
          {!showSim ? (
            <button
              onClick={() => setShowSim(true)}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--pb-border-strong)] bg-[var(--pb-surface)] px-6 py-4 text-sm font-semibold text-[var(--pb-text)] transition-all hover:border-[var(--pb-accent)]/60 hover:bg-[var(--pb-accent)]/6"
            >
              <Play className="h-4 w-4 text-[var(--pb-accent)]" />
              Lancer une simulation
              <span className="ml-1 rounded border border-[var(--pb-border)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--pb-text-faint)]">
                5 scénarios disponibles
              </span>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--pb-text)]">
                  Choisissez un scénario de simulation
                </h2>
                <button
                  onClick={() => setShowSim(false)}
                  className="flex items-center gap-1 text-[12px] text-[var(--pb-text-muted)] hover:text-[var(--pb-text)]"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                  Réduire
                </button>
              </div>
              <SimulationPanel scenarios={SCENARIOS} />
            </div>
          )}
        </div>
      )}

      {/* Dépôt par cycle */}
      <div className="space-y-3">
        {/* Séparateur */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--pb-border)]" />
          <span className="text-[11px] uppercase tracking-wider text-[var(--pb-text-faint)]">
            ou
          </span>
          <div className="h-px flex-1 bg-[var(--pb-border)]" />
        </div>

        {/* Bouton / Panel */}
        {!showCycleUpload ? (
          <button
            onClick={() => setShowCycleUpload(true)}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--pb-border-strong)] bg-[var(--pb-surface)] px-6 py-4 text-sm font-semibold text-[var(--pb-text)] transition-all hover:border-[var(--pb-accent)]/60 hover:bg-[var(--pb-accent)]/6"
          >
            <FileSpreadsheet className="h-4 w-4 text-[var(--pb-accent)]" />
            Déposer les documents d'un cycle de rapprochement
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--pb-text)]">
                Dépôt par cycle
              </h2>
              <button
                onClick={() => setShowCycleUpload(false)}
                className="flex items-center gap-1 text-[12px] text-[var(--pb-text-muted)] hover:text-[var(--pb-text)]"
              >
                <ChevronUp className="h-3.5 w-3.5" />
                Réduire
              </button>
            </div>
            <CycleUploadPanel />
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── Résultat FEC ─────────────────────────────── */

function FecResult({ data }: { data: DepotResult }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--pb-text)]">
          <FileText className="h-4 w-4 text-[var(--pb-accent)]" />
          {data.nomFichier}
        </div>
        <div className="tnum mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
          <Info label="SIREN" value={data.siren ?? "—"} />
          <Info label="Séparateur" value={data.mapping.separateur} />
          <Info label="Variante montants" value={data.mapping.variante} />
          <Info
            label="Écritures"
            value={data.mapping.nbEntries.toLocaleString("fr-FR")}
          />
          <Info label="Colonnes" value={String(data.mapping.nbColonnes)} />
          <div className="col-span-1 flex items-center gap-1.5 text-[var(--pb-text-faint)]">
            <Fingerprint className="h-3.5 w-3.5" />
            <span className="tnum">{data.fingerprint}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--pb-text)]">
          Validation réglementaire d'admissibilité
        </h3>
        {data.admissibilite.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-[#22c55e]">
            <CheckCircle2 className="h-4 w-4" /> Aucune alerte bloquante : le FEC
            est admissible pour l'analyse.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.admissibilite.map((f) => (
              <li
                key={f.id}
                className="flex items-start gap-3 rounded-lg border border-[#ef4444]/40 bg-[#2a1416] p-3"
              >
                <SeverityBadge severity={f.severity} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--pb-text)]">
                    {f.titre}
                  </div>
                  <div className="text-[12px] text-[var(--pb-text-muted)]">
                    {f.constat}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--pb-accent)]">
                    {f.source.ref}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <p className="text-[13px] text-[var(--pb-text-muted)]">
          <span className="tnum font-semibold text-[var(--pb-text)]">
            {data.analyse.length}
          </span>{" "}
          constat(s) analytique(s) détecté(s) hors admissibilité.
        </p>
        <Link
          href="/dashboard/cloisons?mode=live"
          className="rounded-lg bg-[var(--pb-accent)] px-4 py-2 text-[13px] font-semibold text-[#06122a] hover:opacity-90"
        >
          Voir la revue par cloison →
        </Link>
      </div>

      {/* Document annoté : grand-livre réel avec flags posés sur les lignes */}
      {data.entries.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--pb-text)]">
            <FileText className="h-4 w-4 text-[var(--pb-accent)]" />
            Document déposé — anomalies marquées sur les écritures
          </h3>
          {data.entriesTruncated && (
            <p className="text-[11px] text-[var(--pb-text-faint)]">
              Aperçu limité aux premières écritures du fichier.
            </p>
          )}
          <FinancialDocumentViewer
            docs={[
              buildFecDocument({
                societe: data.siren ?? data.nomFichier,
                exercice: exerciceFromEntries(data.entries),
                origine: "upload",
                entries: data.entries,
                findings: data.analyse,
                admissibilite: data.admissibilite,
              }),
            ]}
          />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Résultat Balance ───────────────────────────── */

function BalanceResult({
  data,
  validation,
}: {
  data: ParsedBalance;
  validation: BalanceValidation;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--pb-text)]">
            <FileSpreadsheet className="h-4 w-4 text-[var(--pb-accent)]" />
            {data.fileName}
          </div>
          <span className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
            Balance {data.source}
          </span>
        </div>
        <div className="tnum mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
          <Info label="SIREN" value={data.siren ?? "—"} />
          <Info label="Exercice" value={data.exercice ?? "—"} />
          <Info label="Comptes" value={data.nbLignes.toLocaleString("fr-FR")} />
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
              Équilibre
            </div>
            <div
              className={cn(
                "flex items-center gap-1 font-semibold",
                data.equilibre ? "text-[#22c55e]" : "text-[#ef4444]",
              )}
            >
              {data.equilibre ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              {data.equilibre ? "OK" : fmtEUR(Math.abs(data.ecartEquilibre))}
            </div>
          </div>
          <Info label="Total débit" value={fmtEUR(data.totalDebit)} />
          <Info label="Total crédit" value={fmtEUR(data.totalCredit)} />
          <Info
            label="Colonnes détectées"
            value={`${data.colonnes.compte} · ${data.colonnes.debit}/${data.colonnes.credit}`}
          />
        </div>
        {data.parseWarnings.length > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#eab308]/40 bg-[#292207] p-2.5 text-[11px] text-[var(--pb-text-muted)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#eab308]" />
            <span>{data.parseWarnings.join(" ")}</span>
          </div>
        )}
      </div>

      {/* Contrôles de cohérence */}
      <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--pb-text)]">
          <Scale className="h-4 w-4 text-[var(--pb-accent)]" />
          Contrôles de cohérence
        </h3>
        <p className="mt-1 text-[11px] text-[var(--pb-text-faint)]">
          Une balance est une donnée agrégée : le moteur de règles FEC
          (écritures ligne à ligne) ne s'y applique pas. Contrôles d'ensemble
          uniquement.
        </p>
        <ul className="mt-3 space-y-2">
          {validation.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#22c55e]" />
              ) : (
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: SEVERITY_HEX[c.severity] }}
                />
              )}
              <div>
                <div className="text-[12px] font-medium text-[var(--pb-text)]">
                  {c.label}
                </div>
                <div className="text-[11px] text-[var(--pb-text-muted)]">
                  {c.detail}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Aperçu */}
      {data.lignes.length > 0 && (
        <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
          <h3 className="text-sm font-semibold text-[var(--pb-text)]">
            Aperçu de la balance
            <span className="ml-2 text-[11px] font-normal text-[var(--pb-text-faint)]">
              {Math.min(8, data.lignes.length)} premières lignes sur {data.nbLignes}
            </span>
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="tnum w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
                  <th className="pb-1 pr-3 font-medium">Compte</th>
                  <th className="pb-1 pr-3 font-medium">Libellé</th>
                  <th className="pb-1 pr-3 text-right font-medium">Débit</th>
                  <th className="pb-1 pr-3 text-right font-medium">Crédit</th>
                  <th className="pb-1 text-right font-medium">Solde</th>
                </tr>
              </thead>
              <tbody className="text-[var(--pb-text-muted)]">
                {data.lignes.slice(0, 8).map((l, i) => (
                  <tr key={i} className="border-t border-[var(--pb-border)]">
                    <td className="py-1 pr-3 font-mono text-[var(--pb-text)]">
                      {l.compteNum}
                    </td>
                    <td className="max-w-[220px] truncate py-1 pr-3">
                      {l.compteLib || "—"}
                    </td>
                    <td className="py-1 pr-3 text-right">{fmtEUR(l.debit)}</td>
                    <td className="py-1 pr-3 text-right">{fmtEUR(l.credit)}</td>
                    <td className="py-1 text-right text-[var(--pb-text)]">
                      {fmtEUR(l.solde)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────── Résultat Liasse ───────────────────────────── */

function LiasseResult({ data }: { data: ParsedLiasse }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--pb-text)]">
            <FileText className="h-4 w-4 text-[var(--pb-accent)]" />
            {data.fileName}
          </div>
          <span className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
            PDF · {data.nbPages} page{data.nbPages > 1 ? "s" : ""}
          </span>
        </div>
        <div className="tnum mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-3">
          <Info label="SIREN détecté" value={data.siren ?? "—"} />
          <Info label="Exercice détecté" value={data.exercice ?? "—"} />
          <Info label="Caractères extraits" value={data.charCount.toLocaleString("fr-FR")} />
        </div>
      </div>

      {data.needsManualReview ? (
        <div className="rounded-xl border border-[#eab308]/40 bg-[#292207] p-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#eab308]">
            <AlertTriangle className="h-4 w-4" /> Document reçu — analyse manuelle
            requise
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--pb-text-muted)]">
            L'extraction automatique n'a pas pu structurer ce PDF de façon
            fiable (liasse scannée ou mise en page non tabulaire). Le fichier est
            bien reçu et reste local ; une saisie ou un retraitement manuel des
            postes est nécessaire.
          </p>
          {data.textPreview && (
            <p className="mt-2 line-clamp-2 text-[11px] text-[var(--pb-text-faint)]">
              « {data.textPreview}… »
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
          <h3 className="text-sm font-semibold text-[var(--pb-text)]">
            Postes extraits
            <span className="ml-2 text-[11px] font-normal text-[var(--pb-text-faint)]">
              extraction best-effort — à vérifier
            </span>
          </h3>
          <ul className="mt-3 space-y-1.5">
            {data.postes.map((p, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 border-t border-[var(--pb-border)] pt-1.5 text-[12px] first:border-t-0 first:pt-0"
              >
                <span className="text-[var(--pb-text-muted)]">{p.label}</span>
                <span className="tnum font-semibold text-[var(--pb-text)]">
                  {fmtEUR(p.montant)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--pb-text-faint)]">
        {label}
      </div>
      <div className="text-[var(--pb-text)]">{value}</div>
    </div>
  );
}
