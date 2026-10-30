import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LEASE_DICTIONARY, type LeaseDocumentType } from "../../lib/ifrs/leases/dictionary";
import { renderDictionaryMarkdown, templateCsv } from "../../lib/ifrs/leases/dictionary-doc";
import { journalModelCsv } from "../../lib/ifrs/leases/journal-export";

/** Writes docs/ifrs/DICTIONNAIRE_L16.md, the CSV templates docs/ifrs/modeles/<type>.csv and the journal export model from the code. Usage: npm run ifrs:l16-docs */
const root = path.resolve(__dirname, "../..");
writeFileSync(path.join(root, "docs/ifrs/DICTIONNAIRE_L16.md"), renderDictionaryMarkdown(), "utf8");
mkdirSync(path.join(root, "docs/ifrs/modeles"), { recursive: true });
for (const type of Object.keys(LEASE_DICTIONARY) as LeaseDocumentType[]) writeFileSync(path.join(root, "docs/ifrs/modeles", type + ".csv"), templateCsv(type), "utf8");
writeFileSync(path.join(root, "docs/ifrs/modeles/journal_retraitement.csv"), journalModelCsv(), "utf8");
process.stdout.write("ifrs:l16-docs: dictionnaire, " + Object.keys(LEASE_DICTIONARY).length + " modèles de source et modèle de journal écrits\n");
