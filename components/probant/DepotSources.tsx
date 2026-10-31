"use client";

import { useMemo } from "react";
import { FamilyRule } from "@/components/charte/FamilyRule";
import { SectionHead } from "@/components/charte/InstrumentPage";
import p from "@/components/charte/page.module.css";
import { FAMILY } from "@/components/charte/severity";
import { SeverityMark } from "@/components/charte/SeverityMark";
import type { SourceDocumentSummary } from "@/lib/canonical-model/dossier";
import { SEVERITY_LABEL } from "@/lib/canonical-model/finding";
import { buildSourceRegister, type SourceRegister } from "@/lib/depot-view/sources";
import { useActiveDossierSnapshot } from "@/lib/dossier/client";
import { plural } from "@/lib/synthese-view/common";
import { DossierContextLink as Link } from "./DossierContextLink";
import { Unknown } from "./DepotValues";
import x from "./depot.module.css";

const DOCUMENT_TYPE_LABEL: Record<SourceDocumentSummary["documentType"], string> = {
  fec: "FEC",
  balance: "Balance",
  pdf: "Liasse PDF",
  cycle_document: "Document de cycle",
  demo: "Démonstration",
};

const LOCATION_LABEL: Record<NonNullable<SourceDocumentSummary["location"]>["provider"], string> = {
  s3: "stockage durable",
  local: "stockage local",
  session: "session de ce navigateur",
  demo: "jeu intégré",
};

/**
 * Sources du dossier actif, en tête de l'écran Dépôt : c'est la destination du badge bloquant du rail. Les alertes
 * d'admissibilité viennent telles quelles du snapshot (titre, constat, explication, règle, source, lignes), les
 * bloquantes d'abord ; le registre liste ensuite chaque document avec l'état d'admissibilité qui lui est rattaché.
 * Aucune grandeur n'est recalculée : la vue lit `buildSourceRegister`, qui s'appuie sur `projectSourceState`.
 */
export function DepotSources() {
  const snapshot = useActiveDossierSnapshot();
  const register = useMemo(() => buildSourceRegister(snapshot), [snapshot]);
  const { state, alerts, rows, unattached } = register;
  const fingerprint = state.fecFingerprint ? state.fecFingerprint.slice(0, 12) : null;

  return (
    <section aria-labelledby="depot-sources-title" className={x.sources}>
      <SectionHead
        id="depot-sources-title"
        title="Sources du dossier"
        note={`${state.kindLabel} · ${state.documents} ${plural(state.documents, "document")}`}
      />

      {alerts.length > 0 && (
        <>
          <p className={x.text}>
            {state.blockingAdmissibility > 0 ? (
              <>
                <strong>
                  {state.blockingAdmissibility} {plural(state.blockingAdmissibility, "alerte bloquante", "alertes bloquantes")}
                </strong>{" "}
                d’admissibilité à l’ingestion du FEC. Motif, règle et lignes viennent du constat tel que la règle l’a écrit.
              </>
            ) : (
              <>
                {alerts.length} {plural(alerts.length, "alerte", "alertes")} d’admissibilité à l’ingestion du FEC, aucune bloquante.
              </>
            )}
          </p>
          <ol className={x.alerts} aria-label="Alertes d’admissibilité du FEC">
            {alerts.map((finding) => (
              <li key={finding.id} className={x.alert}>
                <span className={x.alertMark}>
                  <SeverityMark severity={finding.severity} label />
                </span>
                <div className={x.alertBody}>
                  <p className={x.alertTitle}>{finding.titre}</p>
                  <p className={x.alertText}>
                    <span className={p.key}>Motif</span> {finding.constat}
                  </p>
                  <p className={x.alertText}>{finding.explication}</p>
                  <p className={x.alertMeta}>
                    <span className={p.mark}>
                      <FamilyRule family={finding.family} />
                      {FAMILY[finding.family].label}
                    </span>
                    <span>
                      Règle <span className={p.mono}>{finding.ruleId}</span> v{finding.ruleVersion}
                    </span>
                    {finding.source.ref && <span>{finding.source.ref}</span>}
                    {finding.lignesSource.length > 0 && (
                      <span>
                        {plural(finding.lignesSource.length, "ligne", "lignes")} du FEC{" "}
                        <span className={p.mono}>{finding.lignesSource.join(", ")}</span>
                      </span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {unattached && (
            <p className={x.note}>
              Ces alertes portent sur le FEC du dossier{fingerprint ? <> (empreinte <span className={p.mono}>{fingerprint}</span>)</> : null} ; aucun
              document listé ci-dessous ne porte cette empreinte.
            </p>
          )}
        </>
      )}

      {rows.length === 0 ? (
        <p className={x.note}>Aucun document source dans ce dossier : déposez un fichier ci-dessous ou chargez un scénario.</p>
      ) : (
        <div role="region" aria-label="Documents sources du dossier, défilement horizontal" tabIndex={0} className={`${p.scrollX} ${x.register}`}>
          <table className={p.register}>
            <caption className={x.srOnly}>Documents sources du dossier et état d’admissibilité rattaché</caption>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Nature</th>
                <th scope="col">Admissibilité</th>
                <th scope="col">Empreinte</th>
                <th scope="col" className={p.num}>
                  Lignes
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ document, carriesAdmissibility }) => (
                <tr key={document.id}>
                  <th scope="row" className={x.wrap}>
                    {document.fileName}
                    {document.location && <> <span className={x.cellSub}>{LOCATION_LABEL[document.location.provider]}</span></>}
                  </th>
                  <td>
                    {DOCUMENT_TYPE_LABEL[document.documentType]}
                    {document.parserVersion && <> <span className={x.cellSub}>lecture {document.parserVersion}</span></>}
                  </td>
                  <td>
                    <AdmissibilityCell carries={carriesAdmissibility} register={register} />
                  </td>
                  <td>
                    {document.fingerprint ? (
                      <span className={x.fingerprint} title={document.fingerprint}>
                        {document.fingerprint.slice(0, 12)}
                      </span>
                    ) : (
                      <Unknown label="absente" />
                    )}
                  </td>
                  <td className={p.num}>
                    {typeof document.lineCount === "number" ? (
                      <>
                        {document.lineCount.toLocaleString("fr-FR")}
                        {document.truncated && <> <span className={x.cellSub}>détail paginé</span></>}
                      </>
                    ) : (
                      <Unknown label="non renseigné" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {alerts.length > 0 && (
        <p className={x.note}>
          La mesure d’admissibilité du FEC et ses zones réglementaires sont détaillées dans la{" "}
          <Link href="/dashboard/synthese" className={x.link}>
            Synthèse
          </Link>
          .
        </p>
      )}
    </section>
  );
}

/** État d'admissibilité rattaché à un document : décompte des alertes du modèle par gravité, ou absence de rattachement. */
function AdmissibilityCell({ carries, register }: { carries: boolean; register: SourceRegister }) {
  if (!carries) return <span className={p.faint}>aucun contrôle d’admissibilité rattaché</span>;
  if (register.counts.length === 0) return <span className={p.soft}>aucune alerte</span>;
  return (
    <span className={x.counts}>
      {register.counts.map(({ severity, count }) => (
        <span key={severity} className={p.mark}>
          <SeverityMark severity={severity} />
          <span>
            {count} {SEVERITY_LABEL[severity].toLowerCase()}
            {count > 1 ? "s" : ""}
          </span>
        </span>
      ))}
    </span>
  );
}
