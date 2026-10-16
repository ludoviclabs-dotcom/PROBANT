import type { Finding, FindingFamily, Severity } from "@/lib/canonical-model/finding";
import { formatInt } from "@/lib/format/fr";
import { plural } from "./common";

/**
 * Code-barres de positions : où, dans le fichier, les constats renvoient-ils ? Une bande par famille de règles
 * (jamais mélangées), une graduation par ligne du FEC citée en source d'un constat. Les positions sont celles des
 * constats (`lignesSource`) ; rien n'est déduit des écritures. Si la longueur du fichier n'est pas dénombrée,
 * l'axe est borné à la ligne citée la plus éloignée, arrondie : il ne prétend pas donner la taille du fichier.
 */

export interface BarcodeTick {
  line: number;
  findingId: string;
  severity: Severity;
  title: string;
}

export interface BarcodeRow {
  family: FindingFamily;
  ticks: BarcodeTick[];
}

export interface Barcode {
  rows: BarcodeRow[];
  axisMax: number;
  axisLabels: number[];
  /** Longueur du fichier si elle est dénombrée (parseur), sinon null. */
  fileLines: number | null;
  located: number;
  blockingLines: number;
  title: string;
  method: string;
}

const FAMILIES: readonly FindingFamily[] = ["hardLaw", "methodology", "internal"];
const STEPS = [100, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

export function buildBarcode(input: { findings: readonly Finding[]; admissibilityFindings: readonly Finding[]; fileLines: number | null }): Barcode {
  const { findings, admissibilityFindings, fileLines } = input;
  const rows: BarcodeRow[] = [];
  const lines = new Set<number>();
  for (const family of FAMILIES) {
    const ticks: BarcodeTick[] = [];
    for (const f of findings.filter((x) => x.family === family)) {
      for (const line of new Set(f.lignesSource)) {
        ticks.push({ line, findingId: f.id, severity: f.severity, title: f.titre });
        lines.add(line);
      }
    }
    if (ticks.length) rows.push({ family, ticks: ticks.sort((a, b) => a.line - b.line || a.findingId.localeCompare(b.findingId)) });
  }

  const farthest = Math.max(0, ...lines);
  const axisMax = fileLines ?? Math.max(500, Math.ceil(farthest / 500) * 500);
  const step = STEPS.find((s) => axisMax / s <= 6) ?? STEPS[STEPS.length - 1];
  const axisLabels: number[] = [];
  for (let v = 0; v <= axisMax; v += step) axisLabels.push(v);
  if (axisLabels[axisLabels.length - 1] !== axisMax) axisLabels.push(axisMax);

  const blocking = new Set(admissibilityFindings.filter((f) => f.severity === "bloquant").flatMap((f) => f.lignesSource));
  const located = lines.size;
  const others = [...lines].filter((l) => !blocking.has(l)).length;
  const title = located
    ? `${formatInt(located)} ${plural(located, "ligne")} du fichier ${plural(located, "est repérée", "sont repérées")} par des constats${blocking.size ? ` : ${formatInt(blocking.size)} ${plural(blocking.size, "bloque", "bloquent")} l’admissibilité, ${formatInt(others)} ${plural(others, "autre appelle", "autres appellent")} une corroboration` : ""}.`
    : "Aucun constat ne renvoie à une ligne du fichier.";
  const method = `Une bande par famille de règles · position de chaque ligne citée en source d’un constat · trait plein : droit dur, tirets : présomption d’audit, pointillé : paramètre interne · ${
    fileLines ? `fichier de ${formatInt(fileLines)} lignes` : "longueur du fichier non dénombrée : axe borné à la ligne citée la plus éloignée"
  }`;
  return { rows, axisMax, axisLabels, fileLines, located, blockingLines: blocking.size, title, method };
}
