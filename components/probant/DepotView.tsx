"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  Fingerprint,
} from "lucide-react";
import type { Finding } from "@/lib/canonical-model";
import { cn } from "@/lib/utils";
import { SeverityBadge } from "./Badges";

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
}

const PIPELINE = [
  "Empreinte SHA-256",
  "Parsing du fichier",
  "Validation réglementaire (hardLaw)",
  "Exécution du moteur de règles",
  "Restitution",
];

export function DepotView() {
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">(
    "idle",
  );
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<DepotResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus("processing");
    setError(null);
    setResult(null);
    setStep(0);
    const timers = PIPELINE.map((_, i) =>
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
      setStep(PIPELINE.length - 1);
      setResult(data);
      setStatus("done");
    } catch (e) {
      timers.forEach(clearTimeout);
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      {/* Zone de dépôt */}
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
          accept=".txt,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <UploadCloud className="h-9 w-9 text-[var(--pb-accent)]" />
        <div className="mt-3 text-sm font-semibold text-[var(--pb-text)]">
          Déposez un FEC ici, ou cliquez pour parcourir
        </div>
        <div className="mt-1 text-[12px] text-[var(--pb-text-faint)]">
          Le fichier est analysé localement par le moteur — il n'est pas stocké.
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px]">
          <span className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1 text-[var(--pb-accent)]">
            FEC .txt / .csv
          </span>
          <span className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1 text-[var(--pb-text-faint)]">
            XLSX / CSV balance · à venir
          </span>
          <span className="rounded-md border border-[var(--pb-border)] bg-[var(--pb-surface-2)] px-2 py-1 text-[var(--pb-text-faint)]">
            PDF liasse · à venir
          </span>
        </div>
      </div>

      {/* Pipeline */}
      {status !== "idle" && (
        <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            {PIPELINE.map((label, i) => {
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
                  {i < PIPELINE.length - 1 && (
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
      {result && status === "done" && (
        <div className="space-y-4">
          {/* Mapping détecté */}
          <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--pb-text)]">
              <FileText className="h-4 w-4 text-[var(--pb-accent)]" />
              {result.nomFichier}
            </div>
            <div className="tnum mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
              <Info label="SIREN" value={result.siren ?? "—"} />
              <Info label="Séparateur" value={result.mapping.separateur} />
              <Info label="Variante montants" value={result.mapping.variante} />
              <Info
                label="Écritures"
                value={result.mapping.nbEntries.toLocaleString("fr-FR")}
              />
              <Info label="Colonnes" value={String(result.mapping.nbColonnes)} />
              <div className="col-span-1 flex items-center gap-1.5 text-[var(--pb-text-faint)]">
                <Fingerprint className="h-3.5 w-3.5" />
                <span className="tnum">{result.fingerprint}</span>
              </div>
            </div>
          </div>

          {/* Admissibilité */}
          <div className="rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
            <h3 className="text-sm font-semibold text-[var(--pb-text)]">
              Validation réglementaire d'admissibilité
            </h3>
            {result.admissibilite.length === 0 ? (
              <div className="mt-3 flex items-center gap-2 text-[13px] text-[#22c55e]">
                <CheckCircle2 className="h-4 w-4" /> Aucune alerte bloquante : le
                FEC est admissible pour l'analyse.
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {result.admissibilite.map((f) => (
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

          {/* Suite */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--pb-border)] bg-[var(--pb-surface)] p-4">
            <p className="text-[13px] text-[var(--pb-text-muted)]">
              <span className="tnum font-semibold text-[var(--pb-text)]">
                {result.analyse.length}
              </span>{" "}
              constat(s) analytique(s) détecté(s) hors admissibilité.
            </p>
            <Link
              href="/dashboard/cloisons"
              className="rounded-lg bg-[var(--pb-accent)] px-4 py-2 text-[13px] font-semibold text-[#06122a] hover:opacity-90"
            >
              Voir la revue par cloison →
            </Link>
          </div>
        </div>
      )}

      {/* Aide démo */}
      {status === "idle" && (
        <div className="rounded-xl border border-dashed border-[var(--pb-border)] bg-[var(--pb-surface)] p-4 text-[13px] text-[var(--pb-text-muted)]">
          Pas de FEC sous la main ? La{" "}
          <Link
            href="/dashboard/cloisons"
            className="font-semibold text-[var(--pb-accent)] hover:underline"
          >
            revue par cloison
          </Link>{" "}
          est préchargée avec la société de démonstration DEMO SA.
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
