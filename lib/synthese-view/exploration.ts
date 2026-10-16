import type { Finding, FindingFamily, Severity } from "@/lib/canonical-model/finding";
import type { CloisonId } from "@/lib/canonical-model/taxonomy";
import { CLOISON_SUBJECT, FAMILY_ORDER, FAMILY_TEXT, SEVERITIES, corpusLabel, plural, type CloisonDef, type SeverityCounts } from "./common";

/**
 * Niveau « exploration » : petits multiples, strates normatives, frise des référentiels. Tout vient des comptes
 * du snapshot et des sources citées par les constats (registre `lib/referentiel`) ; aucune date, aucun seuil ni
 * aucune norme n'est écrit ici.
 */

/* ── Petits multiples : une même échelle pour toutes les cloisons ────────── */

export interface MultiplesPanel {
  id: CloisonId;
  label: string;
  n: number;
  rows: { severity: Severity; n: number; ratio: number }[];
}

export interface Multiples {
  title: string;
  panels: MultiplesPanel[];
}

export function buildMultiples(matrix: Partial<Record<CloisonId, SeverityCounts>>, clos: readonly CloisonDef[]): Multiples {
  const count = (clo: CloisonId, sev: Severity) => matrix[clo]?.[sev] ?? 0;
  const max = Math.max(0, ...clos.flatMap((c) => SEVERITIES.map((s) => count(c.id, s))));
  const panels = clos.map((c): MultiplesPanel => ({
    id: c.id,
    label: c.label,
    n: SEVERITIES.reduce((sum, s) => sum + count(c.id, s), 0),
    rows: SEVERITIES.map((severity) => ({ severity, n: count(c.id, severity), ratio: max ? count(c.id, severity) / max : 0 })),
  }));
  const top = [...clos].sort((a, b) => count(b.id, "majeur") - count(a.id, "majeur"))[0];
  const topMajor = top ? count(top.id, "majeur") : 0;
  const title = topMajor
    ? `Les gravités se répartissent différemment selon les cloisons : ${CLOISON_SUBJECT[top.id].text.charAt(0).toLowerCase()}${CLOISON_SUBJECT[top.id].text.slice(1)} ${CLOISON_SUBJECT[top.id].plural ? "cumulent" : "cumule"} le plus de majeurs (${topMajor}). Les petits multiples partagent la même échelle.`
    : "Aucune cloison ne porte de constat majeur. Les petits multiples partagent la même échelle.";
  return { title, panels };
}

/* ── Strates normatives ──────────────────────────────────────────────────── */

export interface StrataRow {
  family: FindingFamily;
  label: string;
  /** Corpus réellement cités par les constats de la famille, puis la portée (« opposable »). */
  sub: string;
  n: number;
  /** Longueur du trait, en % de la largeur (au moins 2 % pour rester visible). */
  length: number;
}

export interface Strata {
  title: string;
  rows: StrataRow[];
}

export function buildStrata(findings: readonly Finding[], byFamily: Record<FindingFamily, number>): Strata {
  const max = Math.max(1, ...FAMILY_ORDER.map((f) => byFamily[f]));
  const rows = FAMILY_ORDER.map((family): StrataRow => {
    const corpora = [...new Set(findings.filter((f) => f.family === family).map((f) => corpusLabel(f.source.ref)))];
    const cited = corpora.length ? `${corpora.slice(0, 6).join(", ")}${corpora.length > 6 ? ` +${corpora.length - 6}` : ""} — ` : "";
    return { family, label: FAMILY_TEXT[family].long, sub: `${cited}${FAMILY_TEXT[family].sub}`, n: byFamily[family], length: Math.max(2, (byFamily[family] / max) * 100) };
  });
  const title = `${byFamily.methodology} ${plural(byFamily.methodology, "constat relève", "constats relèvent")} de la méthode d’audit, ${byFamily.hardLaw} du droit dur, ${byFamily.internal} de paramètres internes. Les trois couches ne se mélangent pas : chacune garde son trait.`;
  return { title, rows };
}

/* ── Frise des référentiels ──────────────────────────────────────────────── */

export interface FriezeItem {
  key: string;
  year: number;
  title: string;
  sub: string;
  /** Position horizontale en % de la frise (après écartement minimal entre repères voisins). */
  left: number;
  side: "up" | "down";
}

const MIN_GAP = 12;

/** Écarte les repères voisins d'au moins `gap` points sans changer leur ordre ; borne à [0, max]. */
export function spreadPositions(positions: readonly number[], gap = MIN_GAP, max = 88): number[] {
  const out = [...positions];
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap);
  const overflow = (out[out.length - 1] ?? 0) - max;
  if (overflow > 0) {
    // Trop serré pour tenir : on répartit uniformément plutôt que de tronquer.
    const step = out.length > 1 ? max / (out.length - 1) : 0;
    return out.map((_, i) => i * step);
  }
  return out;
}

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export function buildFrieze(findings: readonly Finding[], edition: { label: string; enteredOn: string | null }): FriezeItem[] {
  const byDate = new Map<string, Set<string>>();
  for (const f of findings) {
    const date = f.source.effectiveDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!byDate.has(date)) byDate.set(date, new Set());
    byDate.get(date)!.add(f.source.ref);
  }
  const entries = [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, refs]) => {
      const corpora = [...new Set([...refs].map(corpusLabel))];
      return { date, title: corpora.join(", "), sub: `en vigueur le ${dayLabel(date)} · ${refs.size} ${plural(refs.size, "référence")}` };
    });
  if (edition.enteredOn && /^\d{4}-\d{2}-\d{2}$/.test(edition.enteredOn)) {
    entries.push({ date: edition.enteredOn, title: `Référentiel PROBANT ${edition.label}`, sub: "Versionné · revue requise" });
  }
  if (!entries.length) return [];
  const time = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const t0 = time(entries[0].date);
  const t1 = time(entries[entries.length - 1].date);
  const span = Math.max(1, t1 - t0);
  const left = spreadPositions(entries.map((e) => ((time(e.date) - t0) / span) * 88));
  return entries.map((e, i) => ({ key: `${e.date}-${i}`, year: Number(e.date.slice(0, 4)), title: e.title, sub: e.sub, left: left[i], side: i % 2 === 0 ? "up" : "down" }));
}
