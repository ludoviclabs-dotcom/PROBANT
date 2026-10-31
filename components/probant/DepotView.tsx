"use client";

import { Suspense, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SectionHead } from "@/components/charte/InstrumentPage";
import p from "@/components/charte/page.module.css";
import { SeverityMark } from "@/components/charte/SeverityMark";
import { DossierContextLink as Link } from "@/components/probant/DossierContextLink";
import { SCENARIOS } from "@/lib/demo/scenarios";
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
import { AUDIT_CYCLES } from "@/lib/rapprochement/catalog";
import { CycleUploadPanel } from "./CycleUploadPanel";
import { DepotSources } from "./DepotSources";
import { Euro, Unknown } from "./DepotValues";
import { IngestionStepper } from "./IngestionStepper";
import { ModeTabs, type ModeTabDef } from "./ModeTabs";
import { ReassuranceBar } from "./ReassuranceBar";
import { RecentDossiers } from "./RecentDossiers";
import { SimulationPanel } from "./SimulationPanel";
import x from "./depot.module.css";

/*
 * Dépôt & ingestion — charte « instruments ». Le balisage et l'habillage changent ; la logique de dépôt est celle
 * d'origine : upload FEC durable (intention idempotente, PUT, finalisation rejouée, sondage du job), lecture locale
 * de la balance et de la liasse, scénarios de simulation et dépôt par cycle.
 */

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
  const zoneId = useId();

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

  function openPicker() {
    inputRef.current?.click();
  }

  const fichierTabContent = status === "idle" && (
    <p className={x.text}>
      Pas de fichier sous la main ? La{" "}
      <Link href="/dashboard/cloisons" className={x.link}>
        revue par cloison
      </Link>{" "}
      est préchargée avec la société de démonstration DEMO SA.
    </p>
  );

  const modeTabs: ModeTabDef[] = [
    {
      id: "fichier",
      label: "Mon fichier",
      desc: "FEC · balance · liasse",
      content: fichierTabContent,
    },
    {
      id: "simulation",
      label: "Simulation",
      desc: `${SCENARIOS.length} scénarios disponibles`,
      hidden: status !== "idle",
      content: <SimulationPanel scenarios={SCENARIOS} />,
    },
    {
      id: "cycle",
      label: "Par cycle",
      desc: `${AUDIT_CYCLES.length} cycles disponibles`,
      content: <CycleUploadPanel />,
    },
  ];

  return (
    <div className={x.root}>
      <DepotSources />

      <section aria-labelledby="depot-file-title" className={p.section}>
        <SectionHead id="depot-file-title" title="Déposer un fichier" note="FEC · balance · liasse" />
        <ReassuranceBar />

        {/* Zone de dépôt : glisser-déposer à la souris, ou Tab puis Entrée / Espace pour ouvrir le sélecteur.
            Ancre de la visite guidée (étape « Tout démarre par un dépôt »). */}
        <div
          data-tour="depot-dropzone"
          role="button"
          tabIndex={0}
          aria-labelledby={`${zoneId}-title`}
          aria-describedby={`${zoneId}-hint`}
          data-drag={drag ? "" : undefined}
          className={x.dropzone}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker();
            }
          }}
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
        >
          <span id={`${zoneId}-title`} className={x.dropTitle}>
            Déposer un fichier à qualifier
          </span>
          <span id={`${zoneId}-hint`} className={x.dropHint}>
            Glissez le fichier ici, ou activez la zone (Entrée ou Espace) pour le choisir. FEC dans un dossier persistant autorisé ; balance et liasse lues dans le navigateur.
          </span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.csv,.xlsx,.xls,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <ul className={x.formats} aria-label="Formats lus">
          <li>
            <span className={x.formatName}>FEC .txt / .csv</span>
            Fichier des écritures comptables, analysé par le moteur de règles d’un dossier persistant.
          </li>
          <li>
            <span className={x.formatName}>Balance .xlsx / .csv</span>
            Exports Sage, Cegid, EBP… : colonnes débit et crédit détectées, contrôles de cohérence d’ensemble.
          </li>
          <li>
            <span className={x.formatName}>Liasse .pdf</span>
            Extraction best-effort du SIREN, de l’exercice et des postes-clés.
          </li>
        </ul>

        <IngestionStepper labels={pipeline} activeIndex={step} status={status} />

        {error && (
          <div role="alert" className={x.error}>
            <span className={x.errorKey}>Dépôt interrompu</span>
            <span>{error}</span>
          </div>
        )}

        {result?.kind === "fec" && status === "done" && <FecResult data={result.data} />}
        {result?.kind === "balance" && status === "done" && <BalanceResult data={result.data} validation={result.validation} />}
        {result?.kind === "pdf" && status === "done" && <LiasseResult data={result.data} />}
      </section>

      <section aria-labelledby="depot-modes-title" className={p.section}>
        <SectionHead id="depot-modes-title" title="Mode de dépôt" note="fichier, scénario de simulation ou dépôt par cycle" />
        <ModeTabs label="Mode de dépôt" tabs={modeTabs} activeId={activeMode} onChange={setActiveMode} />
      </section>

      <RecentDossiers />
    </div>
  );
}

/* ───────────────────────────── Résultat FEC ─────────────────────────────── */

function FecResult({ data }: { data: IngestionJobResult }) {
  return (
    <section aria-labelledby="depot-result-fec" className={x.result}>
      <div className={x.resultHead}>
        <h3 id="depot-result-fec" className={x.resultTitle}>
          Ingestion durable terminée
        </h3>
        <span className={p.key}>FEC · job {data.id}</span>
      </div>
      <dl className={p.readouts}>
        <div>
          <dt>État</dt>
          <dd>{data.status}</dd>
        </div>
        <div>
          <dt>Tentative</dt>
          <dd>{data.attempt}</dd>
        </div>
        <div>
          <dt>Écritures</dt>
          <dd>{data.lineCount.toLocaleString("fr-FR")}</dd>
        </div>
        <div>
          <dt>Avertissements</dt>
          <dd>{data.warningCount.toLocaleString("fr-FR")}</dd>
        </div>
        <div>
          <dt>Parseur</dt>
          <dd>{data.parserVersion}</dd>
        </div>
        <div>
          <dt>Document source</dt>
          <dd className={x.readoutText}>{data.sourceDocumentId}</dd>
        </div>
      </dl>
      <div className={x.actions}>
        <Link href="/dashboard/cloisons?mode=live" className={p.btnPrimary}>
          Voir la revue par cloison
        </Link>
      </div>
    </section>
  );
}

/* ─────────────────────────── Résultat Balance ───────────────────────────── */

/**
 * Équilibre tel que le parseur l'a établi. Sans ligne de compte lue, les totaux et l'écart ne sont pas des zéros
 * documentés : ils restent inconnus. L'écart affiché est celui du modèle (total débit − total crédit), signé.
 */
function Equilibrium({ data }: { data: ParsedBalance }) {
  if (data.nbLignes === 0) return <Unknown label="non établi — aucune ligne lue" />;
  if (!Number.isFinite(data.ecartEquilibre)) return <Unknown label="écart inconnu" />;
  if (data.equilibre) return <span className={x.readoutText}>équilibrée</span>;
  return (
    <span className={x.readoutText}>
      déséquilibrée · écart débit − crédit <Euro value={data.ecartEquilibre} />
    </span>
  );
}

export function BalanceResult({
  data,
  validation,
}: {
  data: ParsedBalance;
  validation: BalanceValidation;
}) {
  const read = data.nbLignes > 0;
  return (
    <section aria-labelledby="depot-result-balance" className={x.result}>
      <div className={x.resultHead}>
        <h3 id="depot-result-balance" className={x.resultTitle}>
          {data.fileName}
        </h3>
        <span className={p.key}>Balance {data.source}</span>
      </div>
      <dl className={p.readouts}>
        <div>
          <dt>SIREN</dt>
          <dd>{data.siren ?? <Unknown label="non détecté" />}</dd>
        </div>
        <div>
          <dt>Exercice</dt>
          <dd>{data.exercice ?? <Unknown label="non détecté" />}</dd>
        </div>
        <div>
          <dt>Comptes</dt>
          <dd>{data.nbLignes.toLocaleString("fr-FR")}</dd>
        </div>
        <div>
          <dt>Équilibre</dt>
          <dd>
            <Equilibrium data={data} />
          </dd>
        </div>
        <div>
          <dt>Total débit</dt>
          <dd>
            <Euro value={read ? data.totalDebit : null} unknownLabel="inconnu — aucune ligne lue" />
          </dd>
        </div>
        <div>
          <dt>Total crédit</dt>
          <dd>
            <Euro value={read ? data.totalCredit : null} unknownLabel="inconnu — aucune ligne lue" />
          </dd>
        </div>
        <div>
          <dt>Colonnes détectées</dt>
          <dd className={x.readoutText}>
            {data.colonnes.compte} · {data.colonnes.debit}/{data.colonnes.credit}
          </dd>
        </div>
      </dl>
      {data.parseWarnings.length > 0 && (
        <div className={x.flag}>
          <span className={p.key}>Avertissement de lecture</span>
          <p>{data.parseWarnings.join(" ")}</p>
        </div>
      )}

      <h4 className={x.subhead}>Contrôles de cohérence</h4>
      <p className={x.note}>
        Une balance est une donnée agrégée : le moteur de règles FEC (écritures ligne à ligne) ne s’y applique pas. Contrôles d’ensemble uniquement.
      </p>
      <div role="region" aria-label="Contrôles de cohérence, défilement horizontal" tabIndex={0} className={`${p.scrollX} ${x.tableWrap}`}>
        <table className={`${p.register} ${x.checks}`}>
          <thead>
            <tr>
              <th scope="col">Contrôle</th>
              <th scope="col">Résultat</th>
              <th scope="col">Gravité de l’écart</th>
              <th scope="col">Détail</th>
            </tr>
          </thead>
          <tbody>
            {validation.checks.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.label}</th>
                <td>{c.ok ? "satisfait" : "non satisfait"}</td>
                {/* Un contrôle satisfait n'a pas d'écart : sa gravité nominale n'est pas affichée. */}
                <td>{c.ok ? <span className={p.faint}>sans objet</span> : <SeverityMark severity={c.severity} label />}</td>
                <td className={p.soft}>{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.lignes.length > 0 && (
        <>
          <h4 className={x.subhead}>Aperçu de la balance</h4>
          <div role="region" aria-label="Aperçu de la balance, défilement horizontal" tabIndex={0} className={p.scrollX}>
            <table className={`${p.register} ${x.preview}`}>
              <caption>
                {Math.min(8, data.lignes.length)} premières lignes sur {data.nbLignes}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Compte</th>
                  <th scope="col">Libellé</th>
                  <th scope="col" className={p.num}>
                    Débit
                  </th>
                  <th scope="col" className={p.num}>
                    Crédit
                  </th>
                  <th scope="col" className={p.num}>
                    Solde
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.lignes.slice(0, 8).map((l, i) => (
                  <tr key={i}>
                    <td className={p.mono}>{l.compteNum}</td>
                    <td className={x.ellipsis}>{l.compteLib || <Unknown label="sans libellé" />}</td>
                    <td className={p.num}>
                      <Euro value={l.debit} />
                    </td>
                    <td className={p.num}>
                      <Euro value={l.credit} />
                    </td>
                    <td className={p.num}>
                      <Euro value={l.solde} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/* ──────────────────────────── Résultat Liasse ───────────────────────────── */

function LiasseResult({ data }: { data: ParsedLiasse }) {
  return (
    <section aria-labelledby="depot-result-liasse" className={x.result}>
      <div className={x.resultHead}>
        <h3 id="depot-result-liasse" className={x.resultTitle}>
          {data.fileName}
        </h3>
        <span className={p.key}>
          PDF · {data.nbPages} page{data.nbPages > 1 ? "s" : ""}
        </span>
      </div>
      <dl className={p.readouts}>
        <div>
          <dt>SIREN détecté</dt>
          <dd>{data.siren ?? <Unknown label="non détecté" />}</dd>
        </div>
        <div>
          <dt>Exercice détecté</dt>
          <dd>{data.exercice ?? <Unknown label="non détecté" />}</dd>
        </div>
        <div>
          <dt>Caractères extraits</dt>
          <dd>{data.charCount.toLocaleString("fr-FR")}</dd>
        </div>
      </dl>

      {data.needsManualReview ? (
        <div className={x.flag}>
          <p className={x.flagTitle}>Document reçu — analyse manuelle requise</p>
          <p>
            L’extraction automatique n’a pas pu structurer ce PDF de façon fiable (liasse scannée ou mise en page non tabulaire). Le fichier est lu dans le navigateur, sans archivage de l’original ; une saisie ou un retraitement manuel des postes est nécessaire.
          </p>
          {data.textPreview && <p className={x.quote}>« {data.textPreview}… »</p>}
        </div>
      ) : (
        <>
          <h4 className={x.subhead}>Postes extraits</h4>
          <p className={x.note}>Extraction best-effort — à vérifier contre la liasse.</p>
          <div role="region" aria-label="Postes extraits, défilement horizontal" tabIndex={0} className={`${p.scrollX} ${x.tableWrap}`}>
            <table className={p.register}>
              <thead>
                <tr>
                  <th scope="col">Poste</th>
                  <th scope="col" className={p.num}>
                    Montant
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.postes.map((poste, i) => (
                  <tr key={i}>
                    <th scope="row">{poste.label}</th>
                    <td className={p.num}>
                      <Euro value={poste.montant} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
