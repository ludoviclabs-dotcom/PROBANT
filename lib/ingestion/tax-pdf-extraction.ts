import type { RawTaxFieldInput } from "./tax-document-input";

export interface PdfTaxExtraction {
  fields: RawTaxFieldInput[];
  warnings: string[];
  pageCount: number;
  textCharacterCount: number;
  siren: string | null;
}

const MAX_PAGES = 50;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Extraction volontairement prudente de la couche texte. Cette fonction ne
 * lance aucun OCR et tous ses champs restent bloques pour revue humaine.
 */
export async function extractPdfTaxFields(
  file: File,
  knownBoxCodes: readonly string[],
): Promise<PdfTaxExtraction> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  let document;
  try {
    document = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise;
  } catch {
    return {
      fields: [],
      warnings: [
        "PDF_TEXT_EXTRACTION_FAILED",
        "PDF_TEXT_LAYER_MISSING",
        "NEEDS_MANUAL_REVIEW",
      ],
      pageCount: 0,
      textCharacterCount: 0,
      siren: null,
    };
  }

  const fields: RawTaxFieldInput[] = [];
  const pageTexts: string[] = [];
  const pagesToRead = Math.min(document.numPages, MAX_PAGES);
  for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => "str" in item ? item.str : "")
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim();
    pageTexts.push(text);
    for (const code of knownBoxCodes) {
      const match = text.match(new RegExp(
        `(?:^|\\s)${escapeRegExp(code)}(?:\\s|$)[^\\d-]{0,40}(-?[\\d\\s\\u00a0\\u202f.]+(?:,\\d{1,2})?)`,
        "iu",
      ));
      if (!match?.[1]) continue;
      fields.push({
        code,
        rawValue: match[1].trim(),
        page: pageNumber,
        sheet: null,
        cell: null,
        box: code,
        structuredPath: null,
        formula: false,
        confidence: 0.55,
        extractionMethod: "text_layer",
      });
    }
  }
  const fullText = pageTexts.join("\n");
  const textCharacterCount = fullText.replace(/\s/gu, "").length;
  const siren = fullText.match(/\b(\d{3}\s?\d{3}\s?\d{3})\b/u)?.[1]
    ?.replace(/\s/gu, "") ?? null;
  const warnings = ["PDF_BEST_EFFORT_ONLY", "NEEDS_MANUAL_REVIEW"];
  if (textCharacterCount === 0) warnings.push("PDF_TEXT_LAYER_MISSING");
  if (document.numPages > MAX_PAGES) warnings.push("PDF_PAGE_LIMIT_REACHED");
  if (fields.length === 0) warnings.push("NO_RELIABLE_FIELD_EXTRACTED");
  return {
    fields,
    warnings,
    pageCount: document.numPages,
    textCharacterCount,
    siren,
  };
}

