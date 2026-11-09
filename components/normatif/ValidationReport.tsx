import type { ValidationResult } from "@/lib/audit-cycles/validation";
import p from "@/components/charte/page.module.css";
import { VeilleGlyph } from "./VeilleMarks";
import n from "./normatif.module.css";

/** Rapport de validation du référentiel : verdict, relevés, puis erreurs et avertissements en lignes. */
export function ValidationReport({ result }: { result: ValidationResult }) {
  const { valid, errors, warnings, stats } = result;
  return (
    <>
      <p className={n.validation} role="status">
        <VeilleGlyph glyph={valid ? "dot" : "cross"} size={12} />
        {valid ? "Référentiel cohérent — aucune erreur bloquante." : `${errors.length} erreur${errors.length > 1 ? "s" : ""} à corriger.`}
      </p>
      <dl className={p.readouts} style={{ marginTop: 20 }}>
        <div>
          <dt>Cycles</dt>
          <dd>{stats.cycles}</dd>
        </div>
        <div>
          <dt>Sources</dt>
          <dd>{stats.sources}</dd>
        </div>
        <div>
          <dt>Fiches validées</dt>
          <dd>{stats.validated}</dd>
        </div>
        <div>
          <dt>Revue requise</dt>
          <dd>{stats.reviewRequired}</dd>
        </div>
        <div>
          <dt>Avertissements</dt>
          <dd>{warnings.length}</dd>
        </div>
      </dl>
      {errors.length > 0 ? <Issues title="Erreurs" issues={errors} /> : null}
      {warnings.length > 0 ? <Issues title="Avertissements" issues={warnings} /> : null}
    </>
  );
}

function Issues({ title, issues }: { title: string; issues: { cycle?: string; field: string; message: string }[] }) {
  return (
    <>
      <h3 className={p.groupHead}>
        {title} ({issues.length})
      </h3>
      <ul className={n.issues}>
        {issues.map((issue, i) => (
          <li key={i}>
            <code>
              {issue.cycle ? `${issue.cycle} · ` : ""}
              {issue.field}
            </code>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
