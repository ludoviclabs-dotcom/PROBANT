import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { LEASE_DICTIONARY, type LeaseDocumentType } from "../../lib/ifrs/leases/dictionary";
import { renderDictionaryMarkdown, templateCsv } from "../../lib/ifrs/leases/dictionary-doc";

/** Writes docs/ifrs/DICTIONNAIRE_L16.md and the CSV templates docs/ifrs/modeles/<type>.csv from the code. Usage: npm run ifrs:l16-docs */
const root = path.resolve(__dirname, "../..");
writeFileSync(path.join(root, "docs/ifrs/DICTIONNAIRE_L16.md"), renderDictionaryMarkdown(), "utf8");
mkdirSync(path.join(root, "docs/ifrs/modeles"), { recursive: true });
for (const type of Object.keys(LEASE_DICTIONARY) as LeaseDocumentType[]) writeFileSync(path.join(root, "docs/ifrs/modeles", type + ".csv"), templateCsv(type), "utf8");
process.stdout.write("ifrs:l16-docs: dictionnaire et " + Object.keys(LEASE_DICTIONARY).length + " modèles écrits\n");
