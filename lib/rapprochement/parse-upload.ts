import type { ChampMappage, DocumentType } from "./catalog";
import type { DocumentSource } from "./types";
import { documentDepuisTableur, type MappageColonnes } from "./adapters/tabular";

const RE: Record<ChampMappage, RegExp> = {
  compte: /(n[°o]?\s*)?(de\s+)?compte|^cpt\b|num.*compte/i,
  tiers: /tiers|client|fournisseur|raison\s*sociale|^nom\b/i,
  piece: /pi[eè]ce|facture|r[ée]f[ée]rence/i,
  date: /^date$|date.*[ée]criture/i,
  echeance: /[ée]ch[ée]ance/i,
  montant: /montant|solde|valeur|vnc/i,
  libelle: /libell|intitul|d[ée]sign/i,
  lettre: /lettr/i,
};

export interface ParseTabularResult {
  documentSource: DocumentSource;
  colonnesDetectees: Partial<Record<ChampMappage, string>>;
  avertissements: string[];
}

function extensionAcceptee(fileName: string, formats: DocumentType["formats"]): boolean {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "xls") return formats.includes("xlsx");
  return formats.includes(ext as DocumentType["formats"][number]);
}

function detecterDelimiteur(texte: string): "," | ";" {
  const premieresLignes = texte.split(/\r?\n/).slice(0, 5).join("\n");
  const nbPointVirgule = (premieresLignes.match(/;/g) ?? []).length;
  const nbVirgule = (premieresLignes.match(/,/g) ?? []).length;
  return nbPointVirgule > nbVirgule ? ";" : ",";
}

/** Découpe une ligne CSV en respectant les guillemets (RFC 4180) : un délimiteur ou un
 * saut de ligne entre guillemets ne coupe pas la cellule ; "" à l'intérieur = guillemet littéral. */
function decouperLigneCsv(ligne: string, delimiteur: string): string[] {
  const cellules: string[] = [];
  let cellule = "";
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (ligne[i + 1] === '"') {
          cellule += '"';
          i++;
        } else {
          dansGuillemets = false;
        }
      } else {
        cellule += c;
      }
    } else if (c === '"') {
      dansGuillemets = true;
    } else if (c === delimiteur) {
      cellules.push(cellule.trim());
      cellule = "";
    } else {
      cellule += c;
    }
  }
  cellules.push(cellule.trim());
  return cellules;
}

async function lireLignesCsv(file: File): Promise<unknown[][]> {
  const texte = await file.text();
  const delimiteur = detecterDelimiteur(texte);
  return texte
    .split(/\r?\n/)
    .filter((ligne) => ligne.length > 0)
    .map((ligne) => decouperLigneCsv(ligne, delimiteur));
}

async function lireLignesXlsx(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
}

/** Associe chaque champ à AU PLUS une colonne : une colonne déjà retenue pour un champ
 * ne peut pas être réutilisée pour un autre, et un champ avec plusieurs colonnes
 * candidates est reporté comme ambigu plutôt que résolu au hasard (première trouvée). */
function detecterColonnes(
  header: string[],
  champs: ChampMappage[],
): { colonnes: Partial<Record<ChampMappage, number>>; ambigus: Partial<Record<ChampMappage, string[]>> } {
  const colonnes: Partial<Record<ChampMappage, number>> = {};
  const ambigus: Partial<Record<ChampMappage, string[]>> = {};
  const utilisees = new Set<number>();

  for (const champ of champs) {
    const candidats = header
      .map((libelle, idx) => ({ libelle, idx }))
      .filter(({ libelle, idx }) => !utilisees.has(idx) && RE[champ].test(libelle));
    if (candidats.length === 1) {
      colonnes[champ] = candidats[0].idx;
      utilisees.add(candidats[0].idx);
    } else if (candidats.length > 1) {
      ambigus[champ] = candidats.map((c) => c.libelle);
    }
  }
  return { colonnes, ambigus };
}

function trouverLigneEnTete(
  rows: unknown[][],
  documentType: DocumentType,
): { headerIdx: number; colonnes: Partial<Record<ChampMappage, number>> } {
  const champs = [...documentType.champsRequis, ...(documentType.champsOptionnels ?? [])];
  let meilleurEssai: { ambigus: Partial<Record<ChampMappage, string[]>> } | null = null;

  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const r = (rows[i] ?? []).map((c) => String(c ?? "").trim());
    const { colonnes, ambigus } = detecterColonnes(r, champs);
    const requisAmbigus = documentType.champsRequis.filter((champ) => ambigus[champ]);
    const tousRequisDetectes = documentType.champsRequis.every((champ) => colonnes[champ] !== undefined);

    if (tousRequisDetectes && requisAmbigus.length === 0) {
      return { headerIdx: i, colonnes };
    }
    if (
      requisAmbigus.length > 0 &&
      (!meilleurEssai || requisAmbigus.length < Object.keys(meilleurEssai.ambigus).length)
    ) {
      meilleurEssai = { ambigus };
    }
  }

  if (meilleurEssai) {
    const detail = Object.entries(meilleurEssai.ambigus)
      .map(([champ, candidats]) => `${champ} → ${(candidats ?? []).join(" / ")}`)
      .join(" ; ");
    throw new Error(
      `Plusieurs colonnes correspondent au même champ pour « ${documentType.libelle} » (${detail}). Renommez les colonnes pour lever l'ambiguïté (ex. une seule colonne « Montant »).`,
    );
  }

  const manquants = documentType.champsRequis.join(", ");
  throw new Error(
    `Impossible de détecter l'en-tête du fichier pour « ${documentType.libelle} » (champs requis : ${manquants}).`,
  );
}

export async function parseTabularDocument(
  file: File,
  documentType: DocumentType,
): Promise<ParseTabularResult> {
  if (!extensionAcceptee(file.name, documentType.formats)) {
    throw new Error(
      `Format de fichier non accepté pour « ${documentType.libelle} » (formats attendus : ${documentType.formats.join(", ")}).`,
    );
  }

  const estCsv = file.name.toLowerCase().endsWith(".csv");
  const rows = estCsv ? await lireLignesCsv(file) : await lireLignesXlsx(file);

  const { headerIdx, colonnes } = trouverLigneEnTete(rows, documentType);
  const header = (rows[headerIdx] ?? []).map((c) => String(c ?? "").trim());

  const colonnesDetectees: Partial<Record<ChampMappage, string>> = {};
  for (const champ of Object.keys(colonnes) as ChampMappage[]) {
    const idx = colonnes[champ];
    if (idx !== undefined) colonnesDetectees[champ] = header[idx];
  }

  const enregistrements: Record<string, string | number | boolean | null | undefined>[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const estVide = r.every((c) => String(c ?? "").trim() === "");
    if (estVide) continue;
    const enregistrement: Record<string, string | number | boolean | null | undefined> = {};
    header.forEach((nomColonne, idx) => {
      if (nomColonne) enregistrement[nomColonne] = r[idx] as string | number | boolean | null | undefined;
    });
    enregistrements.push(enregistrement);
  }

  const nomColonneMontant = colonnesDetectees.montant;
  if (!nomColonneMontant) {
    throw new Error(
      `Impossible de détecter la colonne « montant » pour « ${documentType.libelle} ».`,
    );
  }

  const mappage: MappageColonnes = { montant: nomColonneMontant };
  if (colonnesDetectees.compte) mappage.compte = colonnesDetectees.compte;
  if (colonnesDetectees.tiers) mappage.tiers = colonnesDetectees.tiers;
  if (colonnesDetectees.piece) mappage.piece = colonnesDetectees.piece;
  if (colonnesDetectees.date) mappage.date = colonnesDetectees.date;
  if (colonnesDetectees.echeance) mappage.echeance = colonnesDetectees.echeance;
  if (colonnesDetectees.libelle) mappage.libelle = colonnesDetectees.libelle;
  if (colonnesDetectees.lettre) mappage.lettre = colonnesDetectees.lettre;

  const documentSource = documentDepuisTableur(
    {
      id: `upload-${documentType.id}`,
      label: documentType.libelle,
      type: documentType.typeDocument,
      format: estCsv ? "csv" : "xlsx",
    },
    enregistrements,
    mappage,
  );

  const avertissements: string[] = [];
  if (documentSource.lignes.length === 0) {
    avertissements.push("Aucune ligne exploitable détectée dans le fichier.");
  }

  return { documentSource, colonnesDetectees, avertissements };
}
