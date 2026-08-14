"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Fingerprint,
  AlertTriangle,
  Scale,
  Play,
  FolderOpen,
  Link2,
} from "lucide-react";
import { SCENARIOS } from "@/lib/demo/scenarios";
import { SimulationPanel } from "./SimulationPanel";
import type { Severity } from "@/lib/canonical-model";
import { useActiveDossier } from "@/lib/dossier/client";
import { fetchWithCsrf } from "@/lib/auth/csrf-client";
import type {
  BalanceValidation,
  ParsedBalance,
  ParsedLiasse,
} from "@/lib/balance/types";
import { parseBalanceFile } from "@/lib/balance/parse-xlsx";
import { validateBalance } from "@/lib/balance/validate";
import { parseLiasseFile } from "@/lib/pdf/parse-liasse";
import { cn } from "@/lib/utils";
import { CycleUploadPanel } from "./CycleUploadPanel";
import { AUDIT_CYCLES } from "@/lib/rapprochement/catalog";
import { ReassuranceBar } from "./ReassuranceBar";
import { DropzoneArt } from "./DropzoneArt";
import { ModeTabs, type ModeTabDef } from "./ModeTabs";
import { IngestionStepper } from "./IngestionStepper";
import { RecentDossiers } from "./RecentDossiers";
import { FecLoadingScreen } from "./FecLoadingScreen";

interface IngestionJobResult {
  id: string;
  sourceDocumentId: string;
  status: string;
  attempt: number;
  parserVersion: string;
  startedAt: string | null;
  completedAt: string | null;
  lineCount: number;
  warningCount: number;
  errorCode: string | null;
}

interface StartUploadResponse {
  jobId: string;
  sourceDocumentId: string;
  status: string;
  upload: null | {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
}

type Result =
  | { kind: "fec"; data: IngestionJobResult }
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

async function readApiJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | null;
  if (!response.ok) {
    throw new Error(payload?.message ?? `Erreur ${response.status}`);
  }
  if (!payload) throw new Error("Réponse serveur vide.");
  return payload;
}

export function DepotView() {
  return (
    <Suspense fallback={null}>
      <DepotViewInner />
    </Suspense>
  );
}

function DepotViewInner() {
  const { context: activeContext, snapshot: activeSnapshot } = useActiveDossier();
  const searchParams = useSearchParams();
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">(
    "idle",
  );
  const [pipeline, setPipeline] = useState<string[]>(FEC_PIPELINE);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<string>(() =>
    searchParams.get("cycle") !== null ? "cycle" : "fichier",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadKeys = useRef(new Map<string, string>());

  async function handleFile(file: File) {
    setStatus("processing");
    setError(null);
    setResult(null);
    setStep(0);

    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    try {
      let kind: "fec" | "balance" | "pdf";
      if (ext === "pdf") kind = "pdf";
      else if (ext === "xlsx") kind = "balance";
      else if (ext === "xls") throw new Error("Le format XLS historique doit être converti en XLSX.");
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
        if (activeSnapshot.sourceKind !== "persistent") {
          throw new Error(
            "L'upload FEC durable nécessite un dossier persistant autorisé. Le dossier de démonstration reste consultable sans infrastructure.",
          );
        }
        const fileKey = `${activeContext.dossierId}:${file.name}:${file.size}:${file.lastModified}`;
        const idempotencyKey = uploadKeys.current.get(fileKey) ?? crypto.randomUUID();
        uploadKeys.current.set(fileKey, idempotencyKey);
        const startResponse = await fetchWithCsrf(
          `/api/dossiers/${encodeURIComponent(activeContext.dossierId)}/uploads`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              documentType: "fec",
              contentType: file.type || (ext === "csv" ? "text/csv" : "text/plain"),
              contentLength: file.size,
              idempotencyKey,
            }),
          },
        );
        const started = await readApiJson<StartUploadResponse>(startResponse);
        if (started.upload) {
          setStep(1);
          const uploadResponse = await fetch(started.upload.url, {
            method: started.upload.method,
            headers: started.upload.headers,
            body: file,
          });
          if (!uploadResponse.ok) throw new Error(`Upload objet refusé (${uploadResponse.status}).`);
        }
        // Toujours rejouer la finalisation : si le PUT avait réussi mais SQS
        // échoué, l'intention idempotente revient `uploaded` sans nouvelle URL.
        const completeResponse = await fetchWithCsrf(
          `/api/dossiers/${encodeURIComponent(activeContext.dossierId)}/uploads/${encodeURIComponent(started.jobId)}/complete`,
          { method: "POST" },
        );
        await readApiJson<{ jobId: string; status: string }>(completeResponse);
        let job: IngestionJobResult | null = null;
        for (let poll = 0; poll < 120; poll += 1) {
          const response = await fetch(
            `/api/dossiers/${encodeURIComponent(activeContext.dossierId)}/ingestion-jobs/${encodeURIComponent(started.jobId)}`,
            { cache: "no-store" },
          );
          job = await readApiJson<IngestionJobResult>(response);
          const stepByStatus: Record<string, number> = {
            fingerprinting: 0,
            parsing: 1,
            validating: 2,
            running_controls: 3,
            building_snapshot: 4,
            completed: 4,
          };
          setStep(stepByStatus[job.status] ?? 0);
          if (["completed", "failed", "quarantined"].includes(job.status)) break;
          await new Promise((resolve) => setTimeout(resolve, 1_000));
        }
        if (!job || !["completed", "failed", "quarantined"].includes(job.status)) {
          throw new Error("Le traitement continue en arrière-plan. Rechargez le dossier pour suivre son état.");
        }
        setResult({ kind: "fec", data: job });
        if (job.status !== "completed") {
          throw new Error(`Ingestion ${job.status} (${job.errorCode ?? "sans code"}).`);
        }
        setStatus("done");
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

  const fichierTabContent = status === "idle" && (
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
  );

  const modeTabs: ModeTabDef[] = [
    {
      id: "fichier",
      icon: FolderOpen,
      label: "Mon fichier",
      desc: "FEC . Balance . Liasse",
      color: "var(--pb-accent)",
      content: fichierTabContent,
    },
    {
      id: "simulation",
      icon: Play,
      label: "Simulation",
      desc: `${SCENARIOS.length} scénarios disponibles`,
      color: "var(--pb-methodology)",
      hidden: status !== "idle",
      content: <SimulationPanel scenarios={SCENARIOS} />,
    },
    {
      id: "cycle",
      icon: Link2,
      label: "Par cycle",
      desc: `${AUDIT_CYCLES.length} cycles disponibles`,
      color: "var(--pb-internal)",
      content: <CycleUploadPanel />,
    },
  ];

  return (
    <div className="space-y-4">
      <ReassuranceBar />

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
          "pb-dropzone-frame flex cursor-pointer flex-col items-center justify-center rounded-xl px-6 py-10 text-center transition-colors",
          drag && "pb-drop-active",
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
        <DropzoneArt active={drag} />
        <div className="mt-3 text-sm font-semibold text-[var(--pb-text)]">
          Déposez votre dossier. Le reste se fait.
        </div>
        <div className="mt-1 text-[12px] text-[var(--pb-text-faint)]">
          FEC . Balance . Liasse — analysées, croisées, structurées en quelques secondes
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px]">
          <span
            title="FEC dématérialisé — fichier des écritures comptables (.txt, .csv). Analyse par le moteur de règles."
            className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1 text-[var(--pb-accent)] transition-transform duration-150 hover:-translate-y-0.5"
          >
            FEC .txt / .csv
          </span>
          <span
            title="Balance générale — exports Sage, Cegid, EBP… (.xlsx, .xls, .csv). Détection des colonnes débit/crédit et contrôles de cohérence."
            className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1 text-[var(--pb-accent)] transition-transform duration-150 hover:-translate-y-0.5"
          >
            XLSX / CSV balance
          </span>
          <span
            title="Liasse fiscale / états financiers (.pdf). Extraction best-effort du SIREN, de l'exercice et des postes-clés."
            className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1 text-[var(--pb-accent)] transition-transform duration-150 hover:-translate-y-0.5"
          >
            PDF liasse
          </span>
        </div>
      </div>

      {/* Pipeline */}
      <IngestionStepper labels={pipeline} activeIndex={step} status={status} />

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

      <ModeTabs tabs={modeTabs} activeId={activeMode} onChange={setActiveMode} />

      <RecentDossiers />

      {/* Overlay marquise pendant le traitement réel du fichier déposé.
          Le message affiché est l'étape RÉELLE du pipeline en cours
          (FEC_PIPELINE ou CLIENT_PIPELINE), pas un texte défilant inventé. */}
      <FecLoadingScreen
        isVisible={status === "processing"}
        statusMessage={`${pipeline[step]}…`}
      />
    </div>
  );
}

/* ───────────────────────────── Résultat FEC ─────────────────────────────── */

function FecResult({ data }: { data: IngestionJobResult }) {
  return (
    <div className="space-y-4 rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--pb-text)]">
        <CheckCircle2 className="h-4 w-4 text-[#22c55e]" />
        Ingestion durable terminée
      </div>
      <div className="tnum grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
        <Info label="État" value={data.status} />
        <Info label="Tentative" value={String(data.attempt)} />
        <Info label="Écritures" value={data.lineCount.toLocaleString("fr-FR")} />
        <Info label="Avertissements" value={data.warningCount.toLocaleString("fr-FR")} />
        <Info label="Parseur" value={data.parserVersion} />
        <div className="col-span-2 flex items-center gap-1.5 text-[var(--pb-text-faint)]">
          <Fingerprint className="h-3.5 w-3.5" />
          <span className="truncate">Document {data.sourceDocumentId}</span>
        </div>
      </div>
      <div className="flex justify-end">
        <Link
          href="/dashboard/cloisons?mode=live"
          className="rounded-lg bg-[var(--pb-accent)] px-4 py-2 text-[13px] font-semibold text-[#06122a] hover:opacity-90"
        >
          Voir la revue par cloison →
        </Link>
      </div>
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
