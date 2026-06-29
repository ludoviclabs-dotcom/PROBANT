import type { LiassePoste, ParsedLiasse } from "@/lib/balance/types";
import { parseMontant } from "@/lib/balance/types";

/**
 * Extraction best-effort d'une liasse fiscale / d'états financiers PDF, côté
 * NAVIGATEUR via pdfjs-dist. Les liasses sont souvent scannées ou non
 * tabulaires : on extrait le texte, on tente de repérer SIREN, exercice et
 * quelques postes-clés, et l'on bascule sur `needsManualReview` dès que
 * l'extraction est trop pauvre. Aucune promesse d'extraction exhaustive.
 *
 * pdfjs est chargé dynamiquement (jamais côté serveur, bundle initial allégé).
 */

const POSTES_CLES = [
  "total actif",
  "total passif",
  "total général",
  "total du bilan",
  "capitaux propres",
  "chiffre d'affaires",
  "résultat de l'exercice",
  "résultat net",
];

export async function parseLiasseFile(file: File): Promise<ParsedLiasse> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

  let text = "";
  const maxPages = Math.min(doc.numPages, 20);
  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text +=
      content.items
        .map((it) => ("str" in it ? it.str : ""))
        .join(" ") + "\n";
  }

  const lower = text.toLowerCase();
  const siren =
    `${file.name} ${text}`
      .match(/\b(\d{3}\s?\d{3}\s?\d{3})\b/)?.[1]
      ?.replace(/\s/g, "") ?? null;
  const exercice =
    text.match(/(?:exercice|clos|au\s+\d{2}\/\d{2}\/)\D{0,12}(20\d{2})/i)?.[1] ??
    text.match(/\b(20\d{2})\b/)?.[1] ??
    null;

  const postes: LiassePoste[] = [];
  for (const kw of POSTES_CLES) {
    const idx = lower.indexOf(kw);
    if (idx < 0) continue;
    const after = text.slice(idx + kw.length, idx + kw.length + 60);
    const m = after.match(/-?[\d   .]{3,}(?:,\d+)?/);
    if (!m) continue;
    const montant = parseMontant(m[0]);
    if (montant) postes.push({ label: text.slice(idx, idx + kw.length).trim(), montant });
  }

  const charCount = text.replace(/\s/g, "").length;
  const needsManualReview = charCount < 200 || postes.length === 0;

  return {
    source: "pdf",
    fileName: file.name,
    nbPages: doc.numPages,
    siren,
    exercice,
    postes,
    needsManualReview,
    textPreview: text.slice(0, 280).replace(/\s+/g, " ").trim(),
    charCount,
  };
}
