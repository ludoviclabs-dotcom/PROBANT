export const FEC_HEADER = [
  "JournalCode",
  "JournalLib",
  "EcritureNum",
  "EcritureDate",
  "CompteNum",
  "CompteLib",
  "CompAuxNum",
  "CompAuxLib",
  "PieceRef",
  "PieceDate",
  "EcritureLib",
  "Debit",
  "Credit",
  "EcritureLet",
  "DateLet",
  "ValidDate",
  "Montantdevise",
  "Idevise",
].join("\t");

export function fecLine(index: number): string {
  return [
    "AC",
    "Achats",
    `E${index}`,
    "20241231",
    index % 2 === 0 ? "607000" : "401000",
    "Compte de test",
    "",
    "",
    `P${index}`,
    "20241231",
    `Écriture synthétique ${index}`,
    index % 2 === 0 ? "120,00" : "0,00",
    index % 2 === 0 ? "0,00" : "120,00",
    "",
    "",
    "20241231",
    "",
    "",
  ].join("\t");
}

export function validFec(lineCount = 2): string {
  return `${FEC_HEADER}\n${Array.from({ length: lineCount }, (_, index) => fecLine(index + 1)).join("\n")}\n`;
}

export const badHeaderFec = `${FEC_HEADER.replace("JournalCode", "BadColumn")}\n${fecLine(1)}\n`;
export const invalidDateFec = `${FEC_HEADER}\n${fecLine(1).replace("20241231", "20241340")}\n`;
export const invalidSeparatorFec = `${FEC_HEADER.replaceAll("\t", ",")}\n${fecLine(1).replaceAll("\t", ",")}\n`;

export function textStream(text: string, chunkBytes = 97): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(bytes.length, offset + chunkBytes);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
}

export function syntheticFecStream(
  lineCount: number,
  linesPerChunk = 1_000,
): ReadableStream<Uint8Array> {
  let emitted = 0;
  let headerEmitted = false;
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!headerEmitted) {
        headerEmitted = true;
        controller.enqueue(encoder.encode(`${FEC_HEADER}\n`));
        return;
      }
      if (emitted >= lineCount) {
        controller.close();
        return;
      }
      const count = Math.min(linesPerChunk, lineCount - emitted);
      const text = Array.from({ length: count }, (_, index) => fecLine(emitted + index + 1)).join("\n");
      emitted += count;
      controller.enqueue(encoder.encode(`${text}\n`));
    },
  });
}
