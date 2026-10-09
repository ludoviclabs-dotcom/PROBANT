"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Fingerprint,
  Loader2,
  LockKeyhole,
  X,
} from "lucide-react";
import type { KnownAmount } from "@/lib/canonical-model/money";
import type { PayrollView } from "@/lib/workpapers/payroll-runtime";
import type {
  PayrollCommand,
  PayrollKind,
  PayrollModule,
  PayrollReason,
} from "@/lib/workpapers/payroll-contract";
import styles from "./payroll.module.css";
const endpoint = "/api/workpapers/paie/demo";
const labels: Record<PayrollKind, string> = {
  journal: "Journal",
  ledger: "Grand livre",
  declaration: "Déclarations",
  payments: "Paiements",
  events: "Pièces & événements",
  leave: "Congés",
};
const units = {
  working_days: "jours ouvrés",
  business_days: "jours ouvrables",
  hours: "heures",
};
const reasonLabels: Record<PayrollReason, string> = {
  recall: "Rappel antérieur",
  entry: "Entrée",
  exit: "Sortie",
  bonus: "Prime",
  timing: "Décalage",
  other: "Autre motif documenté",
};
const statusLabels = {
  matched: "Concordant",
  to_explain: "À expliquer",
  documented: "Documenté",
  stale: "Revue périmée",
  blocked: "Bloqué",
};
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("fr", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month + "-01T00:00:00Z"));
function display(value: string) {
  const [whole, decimals] = value.split(".");
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ") +
    (decimals ? "," + decimals : "")
  );
}
function Amount({
  value,
  revealed,
}: {
  value: KnownAmount;
  revealed: boolean;
}) {
  return (
    <span
      className={styles.numeric}
      title={value.kind !== "known" ? value.reason : undefined}
    >
      {value.kind !== "known"
        ? "Non établi"
        : revealed
          ? display(value.value.amount) + " €"
          : "••,•• €"}
    </span>
  );
}
function Status({ value }: { value: keyof typeof statusLabels }) {
  return (
    <span className={`${styles.status} ${styles[value]}`}>
      <i aria-hidden="true" />
      {statusLabels[value]}
    </span>
  );
}
function Drawer({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input:not([disabled]),[tabindex="0"]',
          ) ?? [],
        );
        if (!items.length) return;
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0].focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className={styles.overlay}>
      <button
        className={styles.scrim}
        aria-label="Fermer le détail"
        onClick={onClose}
        tabIndex={-1}
      />
      <aside
        ref={ref}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.drawerTop}>
          <span>Revue de la source</span>
          <button
            className={styles.iconButton}
            onClick={onClose}
            aria-label="Fermer le détail"
          >
            <X size={22} />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
type Preview = {
  previewId: string;
  previewHash: string;
  version: number;
  kind: PayrollKind;
  rows: number;
  coverage: string;
  fields: string[];
};
const publicErrors: Record<string, string> = {
  HR_DEMONSTRATION_DISABLED:
    "La démonstration est disponible uniquement sur une instance locale explicitement configurée.",
  HR_SESSION_REQUIRED:
    "La session locale a expiré. Rechargez l’exemple synthétique.",
  HR_VERSION_CONFLICT:
    "Une autre modification a changé cette version. Actualisez la revue.",
  HR_PREVIEW_STALE: "Cet aperçu est périmé. Importez à nouveau le fichier.",
  HR_REQUEST_INVALID:
    "Le fichier ou la commande ne respecte pas le contrat structuré. Aucun contenu n’a été enregistré.",
  HR_FORMAT_UNSUPPORTED:
    "Utilisez le CSV structuré de cette étape, limité à 1 Mo.",
  HR_IMPORT_INVALID:
    "Import bloqué : lignes rejetées, doublons ou structure invalide.",
  HR_MAPPING_INVALID:
    "Les champs ne permettent pas un rapprochement comparable.",
  HR_EVIDENCE_REQUIRED:
    "Une pièce liée au périmètre et au motif est nécessaire.",
  HR_DUPLICATE_ROW: "Un identifiant de ligne apparaît plusieurs fois.",
};
export function PayrollWorkspace({
  initialTab,
}: {
  initialTab: PayrollModule;
}) {
  const [tab, setTab] = useState(initialTab),
    [view, setView] = useState<PayrollView | null>(null);
  const [demo, setDemo] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [month, setMonth] = useState("2026-09"),
    [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<{
    module: PayrollModule;
    id: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false),
    [kind, setKind] = useState<PayrollKind>(
      initialTab === "leave" ? "leave" : "journal",
    ),
    [coverage, setCoverage] = useState<"complete" | "partial" | "unknown">(
      "unknown",
    );
  const [preview, setPreview] = useState<Preview | null>(null),
    [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setSelected(null), []);
  async function result<T>(response: Response): Promise<T> {
    const body = await response.json();
    if (!response.ok)
      throw Error(
        publicErrors[body.error] ??
          "L’opération a été refusée. Les sources précédentes sont conservées.",
      );
    return body;
  }
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const isDemo = params.get("demo") === "1";
    if (initialTab !== "leave" && params.get("etape") === "reglements")
      setTab("settlements");
    setDemo(isDemo);
    if (!isDemo) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        let response = await fetch(endpoint, { cache: "no-store" });
        if (response.status === 401)
          response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "init", scenario: "standard" }),
          });
        const data = await result<PayrollView>(response);
        if (active) setView(data);
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Lecture indisponible.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [initialTab]);
  async function command(payload: PayrollCommand) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await result<PayrollView>(
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setView(data);
      setNotice("Version enregistrée dans la session synthétique.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modification refusée.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    setError("");
    try {
      setView(
        await result<PayrollView>(await fetch(endpoint, { cache: "no-store" })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lecture indisponible.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const mapping = {
        version: "payroll-review-1",
        kind,
        synthetic: true,
        qualified: false,
        coverage,
        packId: "SYN-LOCAL-IMPORT",
        sourceVersion: "V1",
        generatedAt: "2027-02-01",
      };
      const form = new FormData();
      form.append("file", file);
      form.append("mapping", JSON.stringify(mapping));
      setPreview(
        await result<Preview>(
          await fetch(endpoint + "/imports", { method: "POST", body: form }),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import refusé.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  const months = [
    ...new Set(
      [
        ...(view?.framing.groups ?? []),
        ...(view?.settlements.groups ?? []),
      ].map((g) => g.month),
    ),
  ].sort();
  const groups =
    tab === "framing"
      ? view?.framing.groups.filter((g) => g.month === month)
      : view?.settlements.groups.filter((g) => g.month === month);
  const selectedFraming =
    selected?.module === "framing"
      ? view?.framing.groups.find((g) => g.id === selected.id)
      : undefined;
  const selectedSettlement =
    selected?.module === "settlements"
      ? view?.settlements.groups.find((g) => g.id === selected.id)
      : undefined;
  const selectedLeave =
    selected?.module === "leave"
      ? view?.leave.rows.find((g) => g.id === selected.id)
      : undefined;
  const group = selectedFraming ?? selectedSettlement;
  const linkedReview = view?.reviews.find(
    (r) => r.module === selected?.module && r.targetId === selected.id,
  );
  const query = demo ? "?demo=1" : "";
  return (
    <div className={styles.shell}>
      <div inert={selected !== null}>
        <header className={styles.header}>
          <Link href="/dashboard/synthese" className={styles.brand}>
            PROBANT<span>Revue des cycles</span>
          </Link>
          <Link href="/dashboard/synthese" className={styles.back}>
            <ArrowLeft size={16} /> Synthèse
          </Link>
        </header>
        <main className={styles.main}>
          <div className={styles.intro}>
            <div>
              <p className={styles.eyebrow}>Paie & personnel · Mission 18</p>
              <h1>
                {tab === "leave"
                  ? "Les congés, à part entière."
                  : "Une paie rapprochée, mois par mois."}
              </h1>
              <p className={styles.lead}>
                {tab === "leave"
                  ? "Droits, unités, périodes et méthodes documentées. Une revue indépendante de la paie."
                  : "Du journal au paiement : lire les écarts, retrouver leur origine et documenter la revue."}
              </p>
            </div>
            <Fingerprint
              className={styles.introIcon}
              size={70}
              strokeWidth={0.8}
              aria-hidden="true"
            />
          </div>
          <div className={styles.boundary}>
            <LockKeyhole size={17} />
            <span>
              {view
                ? "Exemple exclusivement synthétique · session locale · revue au 1 février 2027"
                : "Extension réelle bloquée : habilitations RH et mappings à valider."}
            </span>
            <span className={styles.version}>
              {view ? `Version ${view.version}` : "Accès RH réservé"}
            </span>
          </div>
          <nav className={styles.tabs} aria-label="Modules de paie">
            <Link
              href={"/paie-personnel" + query}
              className={tab === "framing" ? styles.activeTab : ""}
              onClick={(e) => {
                if (initialTab !== "leave") {
                  e.preventDefault();
                  setTab("framing");
                }
              }}
            >
              01 <span>Journal ↔ GL</span>
            </Link>
            <Link
              href={
                "/paie-personnel" +
                query +
                (query ? "&" : "?") +
                "etape=reglements"
              }
              className={tab === "settlements" ? styles.activeTab : ""}
              onClick={(e) => {
                if (initialTab !== "leave") {
                  e.preventDefault();
                  setTab("settlements");
                }
              }}
            >
              02 <span>Déclarations ↔ paiements</span>
            </Link>
            <Link
              href={"/paie-personnel/conges" + query}
              className={tab === "leave" ? styles.activeTab : ""}
            >
              03 <span>Congés documentés</span>
              <ArrowRight size={15} />
            </Link>
          </nav>
          {error && (
            <p role="alert" className={styles.error}>
              {error}{" "}
              {view && (
                <button onClick={reload} disabled={busy}>
                  Actualiser
                </button>
              )}
            </p>
          )}
          {notice && (
            <p role="status" className={styles.notice}>
              <Check size={16} />
              {notice}
            </p>
          )}
          {loading ? (
            <div className={styles.empty}>
              <Loader2 className={styles.spin} />
              Lecture des sources synthétiques…
            </div>
          ) : (
            <>
              <div className={styles.toolbar}>
                <div>
                  <h2>
                    {tab === "leave"
                      ? "Droits et bases de calcul"
                      : tab === "framing"
                        ? "Cadrage du journal"
                        : "Chaîne déclarative et règlements"}
                  </h2>
                  <p>
                    {tab === "leave"
                      ? "Sans taux social ni provision automatique."
                      : "Établissement × mois × organisme × rubrique × base comparable"}
                  </p>
                </div>
                <div className={styles.actions}>
                  <button
                    className={styles.plainButton}
                    onClick={() => setRevealed((x) => !x)}
                    disabled={!view}
                  >
                    {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
                    {revealed ? "Masquer" : "Révéler l’exemple"}
                  </button>
                  <button
                    className={styles.primaryButton}
                    onClick={() => setImportOpen((x) => !x)}
                    disabled={!view || busy}
                  >
                    <FileUp size={17} />
                    {importOpen ? "Fermer les sources" : "Qualifier une source"}
                  </button>
                </div>
              </div>
              {importOpen && view && (
                <section
                  className={styles.importArea}
                  aria-label="Qualification d’un export structuré"
                >
                  <h3>Un export, un périmètre, une version.</h3>
                  <p>
                    CSV ; UTF-8 ; séparateur « ; » ; décimales « . » ; dates
                    ISO. Identifiants SYN uniquement. Aucun nom de salarié. Un
                    fichier nommé DSN n’est pas une DSN native.
                  </p>
                  <div className={styles.sourceTabs}>
                    {(tab === "leave"
                      ? (["leave"] as PayrollKind[])
                      : ([
                          "journal",
                          "ledger",
                          "declaration",
                          "payments",
                          "events",
                        ] as PayrollKind[])
                    ).map((k) => (
                      <button
                        key={k}
                        aria-pressed={kind === k}
                        onClick={() => {
                          setKind(k);
                          setPreview(null);
                        }}
                      >
                        {labels[k]}
                      </button>
                    ))}
                  </div>
                  <p className={styles.fieldLabel}>
                    Couverture déclarée du pack
                  </p>
                  <div className={styles.sourceTabs}>
                    {(["complete", "partial", "unknown"] as const).map((c) => (
                      <button
                        key={c}
                        aria-pressed={coverage === c}
                        onClick={() => {
                          setCoverage(c);
                          setPreview(null);
                        }}
                      >
                        {c === "complete"
                          ? "Complète"
                          : c === "partial"
                            ? "Partielle"
                            : "Non établie"}
                      </button>
                    ))}
                  </div>
                  <div className={styles.importActions}>
                    <a
                      className={styles.plainButton}
                      href={endpoint + "?operation=template&kind=" + kind}
                    >
                      <Download size={16} />
                      Colonnes attendues
                    </a>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".csv"
                      hidden
                      aria-label="Export CSV synthétique"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void upload(f);
                      }}
                    />
                    <button
                      className={styles.primaryButton}
                      onClick={() => fileRef.current?.click()}
                      disabled={busy}
                    >
                      Choisir un CSV synthétique
                    </button>
                  </div>
                  {preview && (
                    <div className={styles.preview}>
                      <p>
                        <strong>{preview.rows} lignes recevables</strong> ·{" "}
                        {labels[preview.kind]} · couverture{" "}
                        {preview.coverage === "complete"
                          ? "complète déclarée"
                          : "incomplète ou inconnue : calcul bloqué"}
                      </p>
                      <p className={styles.fields}>
                        {preview.fields.join(" · ")}
                      </p>
                      <button
                        className={styles.primaryButton}
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await command({
                              action: "approve_import",
                              version: preview.version,
                              previewId: preview.previewId,
                              previewHash: preview.previewHash,
                            })
                          ) {
                            setPreview(null);
                            setNotice(
                              "Mapping synthétique qualifié. Les revues dépendantes doivent être relues si leur source a changé.",
                            );
                          }
                        }}
                      >
                        Qualifier ce mapping synthétique{" "}
                        <ArrowRight size={16} />
                      </button>
                      <p>
                        Validation technique de la structure et du périmètre
                        déclaré. L’exhaustivité externe n’est pas prouvée.
                      </p>
                    </div>
                  )}
                </section>
              )}
              {tab !== "leave" && (
                <div
                  className={styles.months}
                  aria-label="Mois de rattachement"
                >
                  {(months.length
                    ? months
                    : ["2026-08", "2026-09", "2026-10"]
                  ).map((m) => (
                    <button
                      key={m}
                      className={m === month ? styles.selectedMonth : ""}
                      aria-pressed={m === month}
                      onClick={() => setMonth(m)}
                    >
                      {monthLabel(m)}
                      <span>
                        {view?.framing.groups.filter((g) => g.month === m)
                          .length ?? 0}{" "}
                        rubriques
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!view ? (
                <section className={styles.empty}>
                  <LockKeyhole size={25} />
                  <h3>
                    Le parcours est prêt. Les données RH restent protégées.
                  </h3>
                  <p>
                    Imports, calculs et exports réels sont fermés. La
                    démonstration locale utilise des pseudonymes et des valeurs
                    entièrement inventés.
                  </p>
                  <Link
                    href={
                      "/paie-personnel" +
                      (tab === "leave" ? "/conges" : "") +
                      "?demo=1"
                    }
                  >
                    Ouvrir la démonstration locale <ArrowRight size={16} />
                  </Link>
                </section>
              ) : tab === "leave" ? (
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <caption>
                      Droits fournis · période du 1 janvier au 31 décembre 2026
                    </caption>
                    <thead>
                      <tr>
                        <th>Pseudonyme</th>
                        <th>Unité</th>
                        <th>Acquis</th>
                        <th>Pris</th>
                        <th>Restants</th>
                        <th>Comparaison</th>
                        <th>Revue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.leave.rows.map((row) => (
                        <tr key={row.id}>
                          <th>{row.pseudonym}</th>
                          <td>
                            {row.rights.unit === "working_days"
                              ? "Jours ouvrés"
                              : row.rights.unit === "business_days"
                                ? "Jours ouvrables"
                                : "Heures"}
                          </td>
                          <td>
                            {revealed ? display(row.rights.acquired) : "••"}
                          </td>
                          <td>{revealed ? display(row.rights.taken) : "••"}</td>
                          <td>
                            {revealed ? display(row.rights.remaining) : "••"}
                          </td>
                          <td>
                            <Status
                              value={
                                row.result?.comparable ? "matched" : "blocked"
                              }
                            />
                          </td>
                          <td>
                            <button
                              className={styles.rowAction}
                              onClick={() =>
                                setSelected({ module: "leave", id: row.id })
                              }
                            >
                              Bases & règle <ChevronRight size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!view.leave.rows.length && (
                    <p className={styles.empty}>
                      Source complète et mapping qualifié requis. La
                      documentation des règles reste consultable ci-dessous.
                    </p>
                  )}
                </div>
              ) : (
                <div className={styles.tableScroll} key={tab + month}>
                  <table className={styles.table}>
                    <caption>
                      {monthLabel(month)} ·{" "}
                      {tab === "framing"
                        ? "GL − journal ; variation journal M − M−1"
                        : "GL − déclaration ; paiement − déclaration"}
                    </caption>
                    <thead>
                      <tr>
                        <th>Organisme / rubrique</th>
                        {tab === "framing" ? (
                          <>
                            <th>Journal</th>
                            <th>GL</th>
                            <th>Écart</th>
                            <th>Variation</th>
                          </>
                        ) : (
                          <>
                            <th>Déclaration</th>
                            <th>GL</th>
                            <th>Payé</th>
                            <th>Écart GL</th>
                          </>
                        )}
                        <th>Revue</th>
                        <th>
                          <span className={styles.srOnly}>Détail</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tab === "framing"
                        ? view.framing.groups
                            .filter((g) => g.month === month)
                            .map((g) => (
                              <tr key={g.id}>
                                <th>
                                  {g.organism.replace("SYN-", "")}
                                  <small>
                                    {g.rubric} · {g.establishment} ·{" "}
                                    {g.basisCode}
                                  </small>
                                </th>
                                <td>
                                  <Amount
                                    value={g.journal}
                                    revealed={revealed}
                                  />
                                </td>
                                <td>
                                  <Amount
                                    value={g.ledger}
                                    revealed={revealed}
                                  />
                                </td>
                                <td>
                                  <Amount value={g.delta} revealed={revealed} />
                                </td>
                                <td>
                                  <Amount
                                    value={g.variation}
                                    revealed={revealed}
                                  />
                                </td>
                                <td>
                                  <Status value={g.status} />
                                </td>
                                <td>
                                  <button
                                    className={styles.rowAction}
                                    aria-label={`Revoir ${g.organism} ${g.rubric}`}
                                    onClick={() =>
                                      setSelected({
                                        module: "framing",
                                        id: g.id,
                                      })
                                    }
                                  >
                                    Revoir <ChevronRight size={17} />
                                  </button>
                                </td>
                              </tr>
                            ))
                        : view.settlements.groups
                            .filter((g) => g.month === month)
                            .map((g) => (
                              <tr key={g.id}>
                                <th>
                                  {g.organism.replace("SYN-", "")}
                                  <small>
                                    {g.rubric} · {g.establishment} ·{" "}
                                    {g.basisCode}
                                  </small>
                                </th>
                                <td>
                                  <Amount
                                    value={g.declaration}
                                    revealed={revealed}
                                  />
                                </td>
                                <td>
                                  <Amount
                                    value={g.ledger}
                                    revealed={revealed}
                                  />
                                </td>
                                <td>
                                  <Amount value={g.paid} revealed={revealed} />
                                </td>
                                <td>
                                  <Amount
                                    value={g.glDelta}
                                    revealed={revealed}
                                  />
                                </td>
                                <td>
                                  <Status value={g.status} />
                                </td>
                                <td>
                                  <button
                                    className={styles.rowAction}
                                    aria-label={`Revoir ${g.organism} ${g.rubric}`}
                                    onClick={() =>
                                      setSelected({
                                        module: "settlements",
                                        id: g.id,
                                      })
                                    }
                                  >
                                    Revoir <ChevronRight size={17} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                    </tbody>
                  </table>
                  {!groups?.length && (
                    <p className={styles.empty}>
                      Aucun rapprochement calculable pour ce mois. Qualifiez les
                      sources et leur couverture ; une absence ne vaut pas zéro.
                    </p>
                  )}
                </div>
              )}
              <div className={styles.footnote}>
                <span>
                  {tab === "leave"
                    ? "Aucune conversion jours/heures implicite. Aucune estimation des droits restants."
                    : "Un écart arithmétique reste soumis à revue. Aucune écriture n’est créée dans le grand livre."}
                </span>
                {view && (
                  <a href={endpoint + "?operation=diagnostic"}>
                    <Download size={15} />
                    Diagnostic sans données RH
                  </a>
                )}
              </div>
              <section className={styles.documentation}>
                <div>
                  <p className={styles.eyebrow}>Sources et couverture</p>
                  <h2>Garder la preuve lisible.</h2>
                  <p>
                    {tab === "leave"
                      ? "La règle importée porte sa version, sa période et sa pièce. Aucun droit légal n’est calculé par défaut."
                      : "La population conserve les rappels et les salariés sortis. Elle utilise le mois de rattachement fourni ; les exclusions documentées bloquent la comparaison avec des totaux non alignés."}
                  </p>
                  <p>
                    Une analyse agrégée de paie ne porte aucun jugement sur un
                    salarié.
                  </p>
                </div>
                <div className={styles.sourceList}>
                  {(view?.sources ?? [])
                    .filter((s) =>
                      tab === "leave" ? s.kind === "leave" : s.kind !== "leave",
                    )
                    .map((s) => (
                      <div key={s.kind}>
                        <span>{labels[s.kind]}</span>
                        <span>
                          {!s.available
                            ? "Non fournie"
                            : !s.mapping?.qualified
                              ? "Mapping non établi"
                              : s.mapping.coverage !== "complete"
                                ? "Couverture à établir"
                                : `${s.mapping.sourceVersion} · qualifiée synthétique`}
                        </span>
                      </div>
                    ))}
                  <div>
                    <span>Format DSN natif</span>
                    <span>Non implémenté · sous-lot distinct</span>
                  </div>
                  <div>
                    <span>Usage réel</span>
                    <span>Bloqué · sécurité RH à valider</span>
                  </div>
                </div>
              </section>
              <section className={styles.official}>
                <h3>Références officielles — distinctes des pièces client</h3>
                <p>
                  <a
                    href="https://www.cnil.fr/fr/les-regles-pour-la-gestion-du-personnel"
                    target="_blank"
                    rel="noreferrer"
                  >
                    CNIL · Gestion du personnel
                  </a>{" "}
                  · 17 août 2023 · accès limité aux fonctions habilitées.{" "}
                  <a
                    href="https://www.cnil.fr/sites/cnil/files/2023-09/referentiel_gestion_des_ressources_humaines.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Référentiel RH
                  </a>{" "}
                  · adopté le 21 novembre 2019, modifié le 23 mai 2022 · p. 1–2,
                  champ d’application.
                </p>
                <p>
                  Pack officiel RH-CNIL-2026-10 · consulté le 9 octobre 2026.
                  Références de protection des données ; elles ne valident pas
                  les bases ou méthodes de paie.
                </p>
              </section>
            </>
          )}
        </main>
      </div>
      {selected && view && (
        <Drawer
          onClose={close}
          title={
            selected.module === "leave"
              ? "Bases de calcul des congés"
              : "Détail du rapprochement"
          }
        >
          {group && (
            <>
              <p className={styles.eyebrow}>
                {monthLabel(group.month)} · {group.establishment}
              </p>
              <h2>{group.organism.replace("SYN-", "")}</h2>
              <p>
                {group.rubric} · {group.basisCode}
              </p>
              <Status value={group.status} />
              <div className={styles.drawerAmounts}>
                {selectedFraming ? (
                  <>
                    <p>
                      GL − journal{" "}
                      <Amount
                        value={selectedFraming.delta}
                        revealed={revealed}
                      />
                    </p>
                    <p>
                      Variation du journal{" "}
                      <Amount
                        value={selectedFraming.variation}
                        revealed={revealed}
                      />
                    </p>
                    <p>
                      Base du journal{" "}
                      <Amount
                        value={selectedFraming.base}
                        revealed={revealed}
                      />
                    </p>
                  </>
                ) : (
                  selectedSettlement && (
                    <>
                      <p>
                        GL − déclaration{" "}
                        <Amount
                          value={selectedSettlement.glDelta}
                          revealed={revealed}
                        />
                      </p>
                      <p>
                        Journal − déclaration{" "}
                        <Amount
                          value={selectedSettlement.journalDelta}
                          revealed={revealed}
                        />
                      </p>
                      <p>
                        Payé − déclaration{" "}
                        <Amount
                          value={selectedSettlement.paymentDelta}
                          revealed={revealed}
                        />
                      </p>
                    </>
                  )
                )}
              </div>
              {selectedFraming && (
                <>
                  <h3>Population pseudonymisée</h3>
                  <p>
                    {selectedFraming.coverage.included} unités incluses ·{" "}
                    {selectedFraming.coverage.excluded} exclues. Salarié × mois
                    × rubrique ; partitions organisme, établissement et base
                    conservées.
                  </p>
                  {selectedFraming.details.map((row) => {
                    const u = view.framing.population.find((u) =>
                      u.rowIds.includes(row.id),
                    );
                    const proof = group.evidence.find(
                      (p) => p.pseudonym === row.pseudonym,
                    );
                    return (
                      <div className={styles.detailLine} key={row.id}>
                        <div>
                          <strong>{row.pseudonym}</strong>
                          <small>
                            {row.regularization
                              ? `Rappel de ${monthLabel(row.regularization)}`
                              : row.entryDate
                                ? `Entrée ${row.entryDate}`
                                : "Mois courant"}
                            {row.exitDate
                              ? ` · Sortie ${row.exitDate} : conservé`
                              : ""}
                          </small>
                          <small>
                            Source structurée · ligne{" "}
                            {String(row.proof.locator?.row ?? "référencée")}
                          </small>
                        </div>
                        <Amount
                          value={{ kind: "known", value: row.amount }}
                          revealed={revealed}
                        />
                        {u &&
                          (u.excluded ? (
                            <button
                              disabled={busy}
                              className={styles.linkButton}
                              onClick={() =>
                                command({
                                  action: "restore",
                                  version: view.version,
                                  unitId: u.id,
                                })
                              }
                            >
                              Restaurer
                            </button>
                          ) : proof ? (
                            <button
                              disabled={busy}
                              className={styles.linkButton}
                              onClick={() =>
                                command({
                                  action: "exclude",
                                  version: view.version,
                                  unitId: u.id,
                                  reason: "outside_scope",
                                  evidenceId: proof.id,
                                })
                              }
                            >
                              Exclure avec pièce
                            </button>
                          ) : null)}
                      </div>
                    );
                  })}
                </>
              )}
              {selectedSettlement && (
                <>
                  <h3>Traçabilité du paiement</h3>
                  {selectedSettlement.duplicates.length > 0 && (
                    <p className={styles.error}>
                      Référence répétée : total payé bloqué. Vérifier doublon ou
                      allocation ; aucune ligne supprimée.
                    </p>
                  )}
                  {selectedSettlement.payments.map((p) => (
                    <div key={p.id} className={styles.detailLine}>
                      <div>
                        <strong>{p.paymentRef}</strong>
                        <small>
                          Date bancaire {p.date} · rattachement{" "}
                          {monthLabel(p.month)}
                        </small>
                      </div>
                      <Amount
                        value={{ kind: "known", value: p.amount }}
                        revealed={revealed}
                      />
                    </div>
                  ))}
                  {!selectedSettlement.payments.length && (
                    <p>Pas de paiement comparable fourni : montant inconnu.</p>
                  )}
                  {selectedSettlement.cancelled.length > 0 && (
                    <p>
                      {selectedSettlement.cancelled.length} paiement(s)
                      annulé(s), conservé(s) hors total payé.
                    </p>
                  )}
                </>
              )}
              <h3>Pièces client — pack synthétique</h3>
              <p>
                Ces événements étayent un motif. Ils ne prouvent pas à eux seuls
                la correction de l’écart.
              </p>
              {group.evidence.map((p) => (
                <div className={styles.proofLine} key={p.id}>
                  <div>
                    <strong>{reasonLabels[p.reason]}</strong>
                    <small>
                      {p.pieceRef} · page {p.page}
                      {p.originMonth
                        ? ` · origine ${monthLabel(p.originMonth)}`
                        : ""}
                    </small>
                  </div>
                  <button
                    className={styles.linkButton}
                    disabled={busy || group.status === "blocked"}
                    onClick={() =>
                      command({
                        action: "document",
                        version: view.version,
                        module: selected.module as "framing" | "settlements",
                        targetId: group.id,
                        inputHash:
                          selected.module === "framing"
                            ? view.framing.inputHash
                            : view.settlements.inputHash,
                        reason: p.reason,
                        evidenceId: p.id,
                      })
                    }
                  >
                    Documenter <ArrowRight size={15} />
                  </button>
                </div>
              ))}
              {!group.evidence.length && (
                <p>
                  Pièce et motif non fournis. Importez une source événements
                  qualifiée.
                </p>
              )}
              {group.status === "blocked" && (
                <p>
                  La documentation des sources reste possible par import.
                  L’enregistrement d’une revue de résultat exige des périmètres
                  comparables.
                </p>
              )}
              {linkedReview && (
                <p className={styles.reviewNote}>
                  Motif enregistré : {reasonLabels[linkedReview.reason]} ·{" "}
                  {linkedReview.at}.{" "}
                  {group.status === "stale"
                    ? "Sources modifiées : relire cette revue."
                    : "L’écart reste visible ; aucune anomalie ou correction n’est validée automatiquement."}
                </p>
              )}
              <h3>Référence officielle</h3>
              <p>
                CNIL · pack RH-CNIL-2026-10. La référence encadre les accès ;
                elle ne remplace pas les pièces de rapprochement.
              </p>
            </>
          )}
          {selectedLeave && (
            <>
              <p className={styles.eyebrow}>Congés · module indépendant</p>
              <h2>{selectedLeave.pseudonym}</h2>
              <p>
                {selectedLeave.rights.from} → {selectedLeave.rights.to}
              </p>
              <Status
                value={selectedLeave.result?.comparable ? "matched" : "blocked"}
              />
              <div className={styles.drawerAmounts}>
                <p>
                  Acquis{" "}
                  <span>
                    {revealed ? display(selectedLeave.rights.acquired) : "••"}
                  </span>
                </p>
                <p>
                  Pris{" "}
                  <span>
                    {revealed ? display(selectedLeave.rights.taken) : "••"}
                  </span>
                </p>
                <p>
                  Restants{" "}
                  <span>
                    {revealed ? display(selectedLeave.rights.remaining) : "••"}
                  </span>
                </p>
              </div>
              <h3>Bases explicitement fournies</h3>
              {[selectedLeave.firstBasis, selectedLeave.secondBasis].map(
                (b, i) => (
                  <div className={styles.basis} key={i}>
                    <h4>Méthode {i + 1}</h4>
                    <p>
                      Unité : {units[b.rights.unit]} · période {b.rights.from} →{" "}
                      {b.rights.to}
                    </p>
                    <p>
                      Base{" "}
                      <Amount
                        value={{ kind: "known", value: b.base.amount }}
                        revealed={revealed}
                      />{" "}
                      · fraction{" "}
                      {revealed ? `${b.numerator}/${b.denominator}` : "•• / ••"}
                    </p>
                    <p>
                      Inclus : base décrite dans la méthode. Exclus : charges
                      associées et extrapolation.
                    </p>
                  </div>
                ),
              )}
              <h3>Règle et pièce client synthétiques</h3>
              <p>
                {selectedLeave.rule.id} · {selectedLeave.rule.version}
                <br />
                Applicabilité {selectedLeave.rule.from} →{" "}
                {selectedLeave.rule.to}
                <br />
                {selectedLeave.rule.pieceRef} · page {selectedLeave.rule.page}
              </p>
              <p className={styles.reviewNote}>
                {selectedLeave.error
                  ? "Droits incohérents : calcul bloqué."
                  : !selectedLeave.result?.comparable
                    ? "Droits, unités, périodes ou règle non comparables : résultat bloqué."
                    : "Méthodes comparables selon la règle synthétique documentée."}
              </p>
              {selectedLeave.result && (
                <div className={styles.drawerAmounts}>
                  <p>
                    Droits spécifiés{" "}
                    <Amount
                      value={selectedLeave.result.indemnityForSpecifiedRights}
                      revealed={revealed}
                    />
                  </p>
                  <p>
                    Droits restants{" "}
                    <Amount
                      value={selectedLeave.result.remainingRightsEstimate}
                      revealed={revealed}
                    />
                  </p>
                </div>
              )}
              <p>
                Référence officielle distincte : les règles légales applicables
                doivent être documentées et validées avant tout usage réel.
                Aucun ratio légal n’est déduit de cet exemple.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className={styles.notice}>
              {notice}
            </p>
          )}
        </Drawer>
      )}
    </div>
  );
}
