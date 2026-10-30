import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LEASE_DICTIONARY, type LeaseDocumentType } from "../../lib/ifrs/leases/dictionary";
import { renderDictionaryMarkdown, templateCsv } from "../../lib/ifrs/leases/dictionary-doc";
import { journalModelCsv } from "../../lib/ifrs/leases/journal-export";
import { leaseDemoExport, LEASE_EXAMPLE_EMISSION } from "../../lib/workpapers/lease-demo";
import { LEASE_EXPORT_FORMATS } from "../../lib/workpapers/lease-export";

/**
 * Writes docs/ifrs/DICTIONNAIRE_L16.md, the CSV templates docs/ifrs/modeles/<type>.csv, the journal export model and, for L16-05, the complete
 * synthetic example of the sheet exports (docs/ifrs/exemples/l16-05, « simulation non revue », fixed emission metadata). Usage: npm run ifrs:l16-docs
 */
const root = path.resolve(__dirname, "../..");
void (async () => {
  writeFileSync(path.join(root, "docs/ifrs/DICTIONNAIRE_L16.md"), renderDictionaryMarkdown(), "utf8");
  mkdirSync(path.join(root, "docs/ifrs/modeles"), { recursive: true });
  for (const type of Object.keys(LEASE_DICTIONARY) as LeaseDocumentType[]) writeFileSync(path.join(root, "docs/ifrs/modeles", type + ".csv"), templateCsv(type), "utf8");
  writeFileSync(path.join(root, "docs/ifrs/modeles/journal_retraitement.csv"), journalModelCsv(), "utf8");
  mkdirSync(path.join(root, "docs/ifrs/exemples/l16-05"), { recursive: true });
  for (const format of LEASE_EXPORT_FORMATS) { const file = await leaseDemoExport(format, LEASE_EXAMPLE_EMISSION); writeFileSync(path.join(root, "docs/ifrs/exemples/l16-05", file.fileName), file.content, "utf8"); }
  process.stdout.write("ifrs:l16-docs: dictionnaire, " + Object.keys(LEASE_DICTIONARY).length + " modèles de source, modèle de journal et exemple d'exports écrits\n");
})();
