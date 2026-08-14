import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

interface PdfLine {
  text: string;
  level: 0 | 1 | 2;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCharCode(Number(code)));
}

function pdfSafe(value: string): string {
  return value
    .replace(/[\u00a0\u202f]/gu, " ")
    .replace(/[–—]/gu, "-")
    .replace(/→/gu, "->")
    .replace(/…/gu, "...")
    .replace(/[“”]/gu, '"')
    .replace(/[‘’]/gu, "'")
    .replace(/[^\x09\x20-\xff]/gu, "?");
}

/** Le PDF consomme le HTML final, qui reste la source unique de présentation. */
export function evidenceHtmlToPdfLines(html: string): PdfLine[] {
  const prepared = html
    .replace(/<style[\s\S]*?<\/style>/giu, "")
    .replace(/<script[\s\S]*?<\/script>/giu, "")
    .replace(/<h1[^>]*>/giu, "\n# ")
    .replace(/<h2[^>]*>/giu, "\n## ")
    .replace(/<h3[^>]*>/giu, "\n## ")
    .replace(/<caption[^>]*>/giu, "\n## ")
    .replace(/<li[^>]*>/giu, "\n- ")
    .replace(/<t[dh][^>]*>/giu, " | ")
    .replace(/<\/(?:h1|h2|h3|caption|p|li|tr|section|header|footer)>/giu, "\n")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ");
  return decodeEntities(prepared)
    .split(/\r?\n/gu)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("## ")) return { text: pdfSafe(line.slice(3)), level: 2 as const };
      if (line.startsWith("# ")) return { text: pdfSafe(line.slice(2)), level: 1 as const };
      return { text: pdfSafe(line), level: 0 as const };
    });
}

function wrapLine(text: string, font: PDFFont, size: number, width: number): string[] {
  if (!text) return [""];
  const result: string[] = [];
  let current = "";
  const tokens = text.split(" ");
  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      current = candidate;
      continue;
    }
    if (current) result.push(current);
    if (font.widthOfTextAtSize(token, size) <= width) {
      current = token;
      continue;
    }
    let fragment = "";
    for (const char of token) {
      if (font.widthOfTextAtSize(fragment + char, size) > width && fragment) {
        result.push(fragment);
        fragment = char;
      } else {
        fragment += char;
      }
    }
    current = fragment;
  }
  if (current) result.push(current);
  return result;
}

function addPage(document: PDFDocument): PDFPage {
  return document.addPage([595.28, 841.89]);
}

export async function buildPdfFromAccessibleHtml(
  html: string,
  options: { title: string; createdAt: string },
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const createdAt = new Date(options.createdAt);
  if (Number.isNaN(createdAt.getTime())) throw new Error("PDF_CREATED_AT_INVALID");
  document.setTitle(options.title);
  document.setAuthor("PROBANT");
  document.setSubject("Dossier de preuve dérivé de l'export HTML accessible");
  document.setCreator("PROBANT evidence pipeline");
  document.setProducer("pdf-lib via PROBANT");
  document.setCreationDate(createdAt);
  document.setModificationDate(createdAt);

  const margin = 48;
  const bottom = 54;
  const maxWidth = 595.28 - margin * 2;
  let page = addPage(document);
  let y = 841.89 - margin;

  for (const line of evidenceHtmlToPdfLines(html)) {
    const font = line.level > 0 ? bold : regular;
    const size = line.level === 1 ? 18 : line.level === 2 ? 13 : 9.5;
    const leading = line.level === 1 ? 23 : line.level === 2 ? 18 : 13;
    const before = line.level === 1 ? 8 : line.level === 2 ? 12 : 2;
    const wrapped = wrapLine(line.text, font, size, maxWidth);
    if (y - before - wrapped.length * leading < bottom) {
      page = addPage(document);
      y = 841.89 - margin;
    }
    y -= before;
    for (const part of wrapped) {
      page.drawText(part, {
        x: margin,
        y,
        size,
        font,
        color: line.level > 0 ? rgb(0.06, 0.16, 0.34) : rgb(0.09, 0.13, 0.2),
      });
      y -= leading;
    }
  }

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    if (index > 0) {
      currentPage.drawText(pdfSafe(options.title).slice(0, 92), {
        x: margin,
        y: 817,
        size: 8,
        font: bold,
        color: rgb(0.06, 0.16, 0.34),
      });
      currentPage.drawLine({
        start: { x: margin, y: 805 },
        end: { x: 595.28 - margin, y: 805 },
        thickness: 0.5,
        color: rgb(0.75, 0.79, 0.84),
      });
    }
    currentPage.drawLine({
      start: { x: margin, y: 34 },
      end: { x: 595.28 - margin, y: 34 },
      thickness: 0.5,
      color: rgb(0.75, 0.79, 0.84),
    });
    currentPage.drawText(`PROBANT - PDF standard - page ${index + 1}/${pages.length}`, {
      x: margin,
      y: 20,
      size: 8,
      font: regular,
      color: rgb(0.35, 0.4, 0.48),
    });
  });

  return document.save({ useObjectStreams: false, addDefaultPage: false });
}
