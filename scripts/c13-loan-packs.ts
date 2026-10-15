import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loanSyntheticFiles, type LoanScenario } from "../lib/workpapers/loan-fixture";

/** Writes the synthetic C13 loans packs (no real pieces) to docs/recette/c13/pieces/<scenario>/. Usage: npx tsx scripts/c13-loan-packs.ts */
async function main() {
  for (const scenario of ["complete", "simple"] as LoanScenario[]) {
    const dir = path.join("docs", "recette", "c13", "pieces", scenario);
    await mkdir(dir, { recursive: true });
    for (const [type, file] of Object.entries(loanSyntheticFiles(scenario))) await writeFile(path.join(dir, type + ".csv"), new Uint8Array(await file.arrayBuffer()));
  }
  console.log("Packs synthétiques C13 écrits dans docs/recette/c13/pieces ; aucune pièce réelle.");
}
void main();
