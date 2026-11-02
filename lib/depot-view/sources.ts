import type { SourceDocumentSummary } from "@/lib/canonical-model/dossier";
import { SEVERITY_ORDER, type Finding, type Severity } from "@/lib/canonical-model/finding";
import { projectSourceState, type SourceState } from "@/lib/dossier/cycle-registry";
import type { DossierSnapshot } from "@/lib/dossier/types";

/**
 * Registre des sources de l'écran Dépôt. Il ne calcule rien : il lit la projection `projectSourceState` (celle du
 * badge du rail et du ruban), les constats d'admissibilité du snapshot et la liste de ses documents.
 *
 * Rattachement : le modèle ne lie pas un constat d'admissibilité à un document, mais au FEC dont le dossier est issu
 * (`Dossier.admissibilite`, conformité d'ingestion du FEC ; `Dossier.fecFingerprint`). Un document dont l'empreinte
 * est celle du FEC du dossier porte donc ces constats ; les autres documents n'en portent aucun. Rien n'est déduit
 * au-delà de cette égalité d'empreintes.
 */

export interface SourceRegisterRow {
  document: SourceDocumentSummary;
  /** Vrai si le document porte l'empreinte du FEC du dossier : les constats d'admissibilité s'y rattachent. */
  carriesAdmissibility: boolean;
}

export interface SourceRegister {
  /** Projection partagée avec le rail et le ruban (nature de la source, alertes bloquantes, documents). */
  state: SourceState;
  /** Constats d'admissibilité du modèle, bloquants d'abord, puis par gravité ; l'ordre du modèle à gravité égale. */
  alerts: Finding[];
  /** Nombre de constats par gravité, dans l'ordre de gravité ; seules les gravités présentes. */
  counts: { severity: Severity; count: number }[];
  /** Documents du dossier ; celui qui porte une alerte bloquante passe en tête, les autres gardent leur ordre. */
  rows: SourceRegisterRow[];
  /** Des constats existent mais aucun document listé ne porte l'empreinte du FEC du dossier. */
  unattached: boolean;
}

export function buildSourceRegister(snapshot: DossierSnapshot): SourceRegister {
  const state = projectSourceState(snapshot);
  // Tri stable (ES2019) : à gravité égale, l'ordre du modèle est conservé.
  const alerts = [...snapshot.admissibilityFindings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const counts = (Object.keys(SEVERITY_ORDER) as Severity[])
    .sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b])
    .map((severity) => ({ severity, count: alerts.filter((f) => f.severity === severity).length }))
    .filter((entry) => entry.count > 0);

  const fec = state.fecFingerprint;
  const all = snapshot.sourceDocuments.map((document) => ({ document, carriesAdmissibility: fec !== null && document.fingerprint === fec }));
  const rows = state.blockingAdmissibility > 0 ? [...all.filter((r) => r.carriesAdmissibility), ...all.filter((r) => !r.carriesAdmissibility)] : all;

  return { state, alerts, counts, rows, unattached: alerts.length > 0 && !rows.some((r) => r.carriesAdmissibility) };
}
