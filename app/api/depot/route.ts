import { NextResponse } from "next/server";
import { parseFec } from "@/lib/fec/parser";
import { runRules, splitAdmissibilite } from "@/lib/rules-engine";
import { sha256, shortHash } from "@/lib/evidence/hash";
import { REFERENTIEL_VERSION } from "@/lib/referentiel/sources";

export const runtime = "nodejs";

/**
 * Plafond d'écritures renvoyées au client pour le rendu du grand-livre annoté.
 * Borne la taille de la réponse (les FEC de démonstration sont petits).
 */
const MAX_ENTRIES_RETURNED = 20000;

/**
 * Pipeline d'ingestion : upload → fingerprint → parsing → validation
 * réglementaire (hardLaw) → exécution des règles → restitution.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Aucun fichier reçu." },
      { status: 400 },
    );
  }

  const text = await file.text();
  const fingerprint = sha256(text);
  const parsed = parseFec(text);

  const sirenMatch = file.name.match(/^(\d{9})FEC/iu);
  const siren = sirenMatch ? sirenMatch[1] : null;

  const findings = runRules({
    parsed,
    entries: parsed.entries,
    nomFichier: file.name,
    siren,
    referentielVersion: REFERENTIEL_VERSION,
  });

  const { admissibilite, analyse } = splitAdmissibilite(findings);

  const entriesTruncated = parsed.entries.length > MAX_ENTRIES_RETURNED;
  const entries = entriesTruncated
    ? parsed.entries.slice(0, MAX_ENTRIES_RETURNED)
    : parsed.entries;

  return NextResponse.json({
    nomFichier: file.name,
    fingerprint: shortHash(fingerprint),
    siren,
    referentielVersion: REFERENTIEL_VERSION,
    mapping: {
      separateur: parsed.separateurNom,
      variante: parsed.variante,
      nbColonnes: parsed.headerColumns.length,
      colonnes: parsed.headerColumns,
      nbEntries: parsed.entries.length,
    },
    admissibilite,
    analyse,
    parseErrors: parsed.parseErrors.slice(0, 20),
    // Écritures pour le rendu du grand-livre annoté (référencées par les
    // constats via leur n° de ligne). Plafonnées pour borner la réponse.
    entries,
    entriesTruncated,
  });
}
