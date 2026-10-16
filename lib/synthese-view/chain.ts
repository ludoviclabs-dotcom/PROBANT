import type { Finding, Severity } from "@/lib/canonical-model/finding";
import { SEVERITY_LABEL } from "@/lib/canonical-model/finding";
import { formatEuroCents } from "@/lib/format/fr";
import { FAMILY_TEXT, SEVERITIES } from "./common";
import { REVIEW_WORD, type ReviewStage } from "./review";

/**
 * Chaîne de preuve d'un constat : source → transformation → règle → résultat → décision. Les quatre premiers
 * maillons sont les étapes `preuve` du constat, telles que la règle les a écrites ; un maillon absent est dit
 * absent (« non renseigné »), il n'est jamais reconstitué. Le dernier maillon est la décision de revue.
 */

export const CHAIN_STEPS = ["Source", "Transformation", "Règle", "Résultat", "Décision"] as const;

export interface ChainNode {
  step: (typeof CHAIN_STEPS)[number];
  detail: string;
  /** Vrai quand le constat ne porte pas ce maillon. */
  missing: boolean;
}

export interface ChainView {
  id: string;
  title: string;
  severity: Severity;
  nodes: ChainNode[];
  /** Phrase lue pour chacun des cinq maillons quand on le sélectionne. */
  focus: string[];
}

/** « 2310, 2311, 2312 » → « L2310–2312 » ; lignes isolées séparées par des virgules. */
export function formatLines(lines: readonly number[]): string {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `L${sorted[i]}–${sorted[j]}` : `L${sorted[i]}`);
    i = j + 1;
  }
  return parts.join(", ");
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function buildChain(finding: Finding, stage: ReviewStage): ChainView {
  const find = (...names: string[]) => finding.preuve.find((p) => names.map(norm).includes(norm(p.etape)));
  const source = find("Source", "Échantillon");
  const transformation = find("Transformation");
  const rule = find("Règle");
  const result = find("Résultat");
  const MISSING = "non renseigné";

  const decision = stage === "proposed" ? "Validé par l’auditeur" : stage === "corrected" ? "Corrigé : correction comptabilisée" : stage === "dismissed" ? "Écarté par l’auditeur" : "En attente de revue";
  const nodes: ChainNode[] = [
    { step: "Source", detail: source?.detail ?? MISSING, missing: !source },
    { step: "Transformation", detail: transformation?.detail ?? MISSING, missing: !transformation },
    { step: "Règle", detail: rule?.detail ?? finding.source.ref, missing: !rule },
    { step: "Résultat", detail: result?.detail ?? finding.titre, missing: !result },
    { step: "Décision", detail: decision, missing: false },
  ];

  const effect = finding.financialEffect
    ? ` · effet chiffré ${formatEuroCents(finding.financialEffect.direction === "decrease" ? -finding.financialEffect.amountCents : finding.financialEffect.amountCents, { sign: true })}`
    : " · sans effet chiffré";
  const lines = finding.lignesSource.length ? ` · lignes FEC ${formatLines(finding.lignesSource)}` : "";
  const accounts = finding.comptesConcernes.length ? ` · comptes ${finding.comptesConcernes.join(", ")}` : "";
  const focus = [
    `Source : ${nodes[0].detail}${lines}${accounts}.`,
    `Transformation : ${transformation ? transformation.detail : "aucune déclarée, lecture directe"}.`,
    `Règle : ${finding.source.ref} · famille ${FAMILY_TEXT[finding.family].label.toLowerCase()}. Source citée, à valider par un expert.`,
    `Résultat : ${finding.titre} · gravité ${SEVERITY_LABEL[finding.severity].toLowerCase()}${effect}.`,
    `Décision : ${REVIEW_WORD[stage]}. La validation consigne un jugement de l’auditeur ; elle ne vaut pas certification.`,
  ];
  return { id: finding.id, title: finding.titre, severity: finding.severity, nodes, focus };
}

/** Constats dans l'ordre de lecture du sélecteur : gravité décroissante, puis ordre du snapshot. */
export function orderForSelector(findings: readonly Finding[]): Finding[] {
  return [...findings]
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITIES.indexOf(a.f.severity) - SEVERITIES.indexOf(b.f.severity) || a.i - b.i)
    .map(({ f }) => f);
}
