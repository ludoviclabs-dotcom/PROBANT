import type { Severity } from "@/lib/canonical-model/finding";

/**
 * Flux FEC de la landing : un extrait défilant des écritures de DEMO SA, avec trois repères (l'écriture est
 * détachée, cerclée, puis reliée à son constat par un filet annoté). Données illustratives et DÉTERMINISTES
 * (générateur à graine fixe) : mêmes lignes à chaque rendu, serveur comme navigateur. Les trois lignes
 * repérées sont celles des constats du dossier de démonstration (DEMO-ADM-1, DEMO-IMMO-1, DEMO-CA-1).
 *
 * Deux dispositions : large (notes dans la gouttière gauche) et étroite (notes sous la ligne repérée).
 */

export const ROW_HEIGHT = 24;
export const NOTE_HEIGHT = 118;
/** Largeur de la gouttière des notes en disposition large. */
export const GUTTER_WIDE = 268;
export const WINDOW_WIDE = 620;
export const WINDOW_NARROW = 520;
/** Durée du défilement unique, en ms : trois arrêts. */
export const FLOW_DURATION_MS = 10500;

export type AnomalyKey = "a1" | "a2" | "a3";
type Column = "date" | "amt" | "cre";

export interface FlowEntry {
  kind: "row";
  index: number;
  y: number;
  line: string;
  journal: string;
  date: string;
  account: string;
  label: string;
  debit: string;
  credit: string;
  piece: string;
  anomaly: AnomalyKey | null;
}
export interface FlowGap {
  kind: "gap";
  index: number;
  y: number;
  text: string;
}
export interface FlowNoteSpace {
  kind: "note";
  index: number;
  y: number;
}
export type FlowRow = FlowEntry | FlowGap | FlowNoteSpace;

export interface FlowMark {
  key: AnomalyKey;
  ref: string;
  severity: Severity;
  family: "dd" | "pa";
  title: string;
  source: string;
  ring: { x: number; y: number; width: number; height: number };
  /** Connecteur entre la ligne cerclée et la note. */
  connector: string;
  dash: string;
  tick: { x: number; y1: number; y2: number };
  note: { left: number; top: number; width?: number; right?: number; bordered: boolean };
}

export interface FlowStop {
  key: AnomalyKey;
  translateY: number;
  arriveMs: number;
  leaveMs: number;
}

export interface FecFlow {
  narrow: boolean;
  rows: FlowRow[];
  marks: FlowMark[];
  listHeight: number;
  windowHeight: number;
  gutter: number;
  startY: number;
  restY: number;
  stops: FlowStop[];
}

const FR_INT = new Intl.NumberFormat("fr-FR");
const FR_AMOUNT = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LABELS: Record<string, [string, string][]> = {
  VT: [["411000", "Facture client F-2024-"], ["706000", "Prestations de services"], ["445710", "TVA collectée"]],
  AC: [["401000", "Fournisseur — facture "], ["607000", "Achats de marchandises"], ["445660", "TVA déductible"]],
  BQ: [["512000", "Virement reçu client"], ["411000", "Règlement client"], ["627000", "Frais bancaires"]],
  OD: [["641000", "Salaires bruts"], ["431000", "Urssaf"], ["421000", "Rémunérations dues"]],
};

interface Segment {
  from: number;
  to: number;
  date: string;
  special: Record<number, Partial<Pick<FlowEntry, "journal" | "date" | "account" | "label" | "debit" | "credit" | "piece">>>;
}

const SEGMENTS: Segment[] = [
  {
    from: 509,
    to: 525,
    date: "20240215",
    special: { 517: { journal: "VT", date: "31/12/2024", account: "411000", label: "Facture client F-2024-1187", debit: "18 240,00", credit: "", piece: "VT-01187" } },
  },
  {
    from: 1199,
    to: 1210,
    date: "20241231",
    special: {
      1204: { journal: "OD", account: "681120", label: "Dot. amort. installations techniques", debit: "192 000,00", credit: "", piece: "OD-1231-07" },
      1205: { journal: "OD", account: "281540", label: "Amort. installations techniques", debit: "", credit: "192 000,00", piece: "OD-1231-07" },
    },
  },
  {
    from: 2302,
    to: 2320,
    date: "20241231",
    special: {
      2310: { journal: "OD", account: "701000", label: "Ventes produits finis — saisie manuelle", debit: "", credit: "104 000,00", piece: "OD-1231-21" },
      2311: { journal: "OD", account: "701000", label: "Ventes produits finis — saisie manuelle", debit: "", credit: "98 000,00", piece: "OD-1231-21" },
      2312: { journal: "OD", account: "701000", label: "Ventes produits finis — saisie manuelle", debit: "", credit: "110 000,00", piece: "OD-1231-21" },
    },
  },
];

interface Anomaly {
  key: AnomalyKey;
  lines: number[];
  column: Column;
  family: "dd" | "pa";
  severity: Severity;
  ref: string;
  title: string;
  source: string;
}

const ANOMALIES: Anomaly[] = [
  { key: "a1", lines: [517], column: "date", family: "dd", severity: "bloquant", ref: "DEMO-ADM-1", title: "EcritureDate « 31/12/2024 » au lieu de AAAAMMJJ : 3 lignes, admissibilité suspendue", source: "LPF art. A.47 A-1 · droit dur" },
  { key: "a2", lines: [1204, 1205], column: "amt", family: "dd", severity: "majeur", ref: "DEMO-IMMO-1", title: "Dotation doublée : taux 40 % contre 20 % en 2023, sans mention en annexe", source: "PCG art. 214-13 · droit dur" },
  { key: "a3", lines: [2310, 2311, 2312], column: "cre", family: "pa", severity: "majeur", ref: "DEMO-CA-1", title: "312 000 € de ventes saisies le 31/12, livrées en janvier 2025", source: "ISA 240 · présomption d’audit · seuil 0 €" },
];

const ARRIVE = [1300, 4900, 8300];
const LEAVE = [3500, 7100, 10500];

/** Abscisse et largeur de la colonne cerclée, depuis la marge gauche de la liste (gouttière comprise). */
const COLUMN_X: Record<Column, number> = { date: 92, amt: 256, cre: 356 };
const COLUMN_W: Record<Column, number> = { date: 92, amt: 208, cre: 108 };

/** Générateur congruentiel à graine fixe : le flux est identique à chaque rendu. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

export function buildFecFlow(narrow: boolean): FecFlow {
  const random = makeRandom(7);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const base = (line: number, date: string) => {
    const journal = pick(["VT", "AC", "BQ", "OD"]);
    const [account, label] = pick(LABELS[journal]);
    const amount = FR_AMOUNT.format(Math.round(800 + random() * 42000));
    const isDebit = random() > 0.5;
    return {
      line: `L${String(line).padStart(4, "0")}`,
      journal,
      date,
      account,
      label: label + (label.endsWith("-") || label.endsWith(" ") ? String(1000 + (line % 900)) : ""),
      debit: isDebit ? amount : "",
      credit: isDebit ? "" : amount,
      piece: `${journal}-${String(line).padStart(5, "0")}`,
    };
  };

  const gutter = narrow ? 0 : GUTTER_WIDE;
  const rows: FlowRow[] = [];
  const lineToAnomaly = new Map<number, Anomaly>();
  for (const anomaly of ANOMALIES) for (const line of anomaly.lines) lineToAnomaly.set(line, anomaly);
  const noteY: Partial<Record<AnomalyKey, number>> = {};
  const rowY = new Map<number, number>();
  let y = 0;

  SEGMENTS.forEach((segment, si) => {
    if (si > 0) {
      const gap = segment.from - SEGMENTS[si - 1].to - 1;
      rows.push({ kind: "gap", index: rows.length, y, text: `··· ${FR_INT.format(gap)} lignes ···` });
      y += ROW_HEIGHT;
    }
    for (let line = segment.from; line <= segment.to; line++) {
      const generated = base(line, segment.date);
      const override = segment.special[line];
      const anomaly = lineToAnomaly.get(line) ?? null;
      rows.push({ kind: "row", index: rows.length, y, ...generated, ...(override ?? {}), anomaly: anomaly ? anomaly.key : null });
      rowY.set(line, y);
      y += ROW_HEIGHT;
      if (narrow && anomaly && anomaly.lines[anomaly.lines.length - 1] === line) {
        rows.push({ kind: "note", index: rows.length, y });
        noteY[anomaly.key] = y;
        y += NOTE_HEIGHT;
      }
    }
  });

  const listHeight = y;
  const windowHeight = narrow ? WINDOW_NARROW : WINDOW_WIDE;

  const geometry = ANOMALIES.map((anomaly) => {
    const y0 = rowY.get(anomaly.lines[0]) as number;
    const y1 = (rowY.get(anomaly.lines[anomaly.lines.length - 1]) as number) + ROW_HEIGHT;
    return { anomaly, y0, y1 };
  });

  const marks: FlowMark[] = geometry.map(({ anomaly, y0, y1 }) => {
    const x = gutter + COLUMN_X[anomaly.column] - 6;
    const width = COLUMN_W[anomaly.column] + 12;
    const dash = anomaly.family === "dd" ? "none" : "5 4";
    const common = { key: anomaly.key, ref: anomaly.ref, severity: anomaly.severity, family: anomaly.family, title: anomaly.title, source: anomaly.source, dash };
    const ring = { x, y: y0 + 1, width, height: y1 - y0 - 2 };
    if (narrow) {
      const ny = noteY[anomaly.key] as number;
      return {
        ...common,
        ring,
        connector: `M${x + 16} ${y1 - 1}V${ny + 10}`,
        tick: { x: x + 16, y1: ny + 4, y2: ny + 16 },
        note: { left: 0, right: 12, top: ny + 18, bordered: true },
      };
    }
    const mid = (y0 + y1) / 2;
    return {
      ...common,
      ring,
      connector: `M${x} ${mid}H${gutter - 16}`,
      tick: { x: gutter - 16, y1: mid - 6, y2: mid + 6 },
      note: { left: 0, width: gutter - 32, top: mid - 34, bordered: false },
    };
  });

  const center = ({ anomaly, y0, y1 }: (typeof geometry)[number]) =>
    narrow ? (y0 + (noteY[anomaly.key] as number) + NOTE_HEIGHT) / 2 : (y0 + y1) / 2;

  const stops: FlowStop[] = geometry.map((g, i) => ({
    key: g.anomaly.key,
    translateY: Math.round(windowHeight * 0.46 - center(g)),
    arriveMs: ARRIVE[i],
    leaveMs: LEAVE[i],
  }));
  const restY = narrow ? stops[2].translateY : Math.round(windowHeight * 0.5 - (center(geometry[1]) + center(geometry[2])) / 2);
  if (!narrow) stops[2].translateY = restY;

  return { narrow, rows, marks, listHeight, windowHeight, gutter, startY: Math.round(windowHeight * 0.62), restY, stops };
}

/** Texte alternatif du flux : les repères sont énoncés, le défilement est décoratif. */
export function flowDescription(flow: FecFlow): string {
  return `Extrait du FEC de DEMO SA. Trois repères : ${flow.marks.map((m) => `${m.ref}, ${m.title}`).join(" ; ")}.`;
}
