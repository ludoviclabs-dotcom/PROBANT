import type { Finding, FindingFamily, Severity } from "@/lib/canonical-model/finding";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";
import { CLOISONS } from "@/lib/canonical-model/taxonomy";
import { SEVERITIES } from "./common";
import type { ReviewStage } from "./review";

/**
 * Journal des constats : une ligne dense par constat, filtrable (gravité, famille, cloison), triable (gravité ou
 * effet chiffré) et consultable. Les valeurs sont celles du constat et de l'étape de revue du snapshot ; l'effet
 * chiffré n'existe que si le constat porte un effet financier explicite (sinon « — », jamais une estimation).
 */

export interface JournalRow {
  id: string;
  index: number;
  severity: Severity;
  cloison: CloisonId;
  cloisonShort: string;
  cycle: string | null;
  accounts: string;
  title: string;
  /** Effet explicite signé en centimes (diminution négative) ; null sans effet explicite. */
  effectCents: number | null;
  family: FindingFamily;
  stage: ReviewStage;
  source: string;
  haystack: string;
}

export interface JournalFilter {
  cloison: CloisonId | null;
  severity: Severity | null;
  family: FindingFamily | null;
  query: string;
  sort: "gravite" | "effet";
}

const cloisonShort = new Map(CLOISONS.map((c) => [c.id, c.short]));

export function buildJournalRows(findings: readonly Finding[], cycleBySilo: ReadonlyMap<string, string>, stages: ReadonlyMap<string, ReviewStage>): JournalRow[] {
  return findings.map((f, index) => {
    const effect = f.financialEffect ? (f.financialEffect.direction === "decrease" ? -f.financialEffect.amountCents : f.financialEffect.amountCents) : null;
    const cycle = cycleBySilo.get(f.siloId) ?? null;
    const accounts = f.comptesConcernes.join(" · ");
    return {
      id: f.id,
      index,
      severity: f.severity,
      cloison: f.cloison,
      cloisonShort: cloisonShort.get(f.cloison) ?? f.cloison,
      cycle,
      accounts,
      title: f.titre,
      effectCents: effect,
      family: f.family,
      stage: stages.get(f.id) ?? "pending",
      source: f.source.ref,
      haystack: `${f.id} ${f.titre} ${accounts} ${f.source.ref} ${cycle ?? ""}`.toLowerCase(),
    };
  });
}

export function applyJournal(rows: readonly JournalRow[], filter: JournalFilter): JournalRow[] {
  const q = filter.query.trim().toLowerCase();
  const rank = (r: JournalRow) => SEVERITIES.indexOf(r.severity);
  return rows
    .filter((r) => (!filter.cloison || r.cloison === filter.cloison) && (!filter.severity || r.severity === filter.severity) && (!filter.family || r.family === filter.family) && (!q || r.haystack.includes(q)))
    .sort((a, b) =>
      filter.sort === "effet" ? Math.abs(b.effectCents ?? 0) - Math.abs(a.effectCents ?? 0) || rank(a) - rank(b) || a.index - b.index : rank(a) - rank(b) || a.index - b.index,
    );
}
