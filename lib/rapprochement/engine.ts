import type {
  CleRapprochement,
  DocumentLigne,
  DocumentSource,
  EcartRapprochement,
  RapprochementConfig,
  ResultatRapprochement,
  GroupeRapprochement,
  LigneRapprochement,
} from "./types";
import { refineEcart, sourceFor } from "./qualify";
import { legacyCents } from "@/lib/canonical-model/money";
import { isCivilDate } from "@/lib/canonical-model/period";

/**
 * Moteur de rapprochement à 3 niveaux (total → groupe → granulaire).
 * Pur et déterministe : aucune dépendance à l'heure courante (les dates sont
 * fournies explicitement). Étendre à un cycle = changer la `RapprochementConfig`.
 */

export interface EngineOptions {
  /** Date de référence (AAAAMMJJ) pour le calcul d'antériorité. */
  dateReference?: string;
}

/** Première clé de regroupement exploitable parmi les clés configurées. */
export function cleGroupante(cles: CleRapprochement[]): CleRapprochement {
  return cles.find((c) => c === "tiers" || c === "compte" || c === "piece") ?? "compte";
}

function valeurCle(l: DocumentLigne, cle: CleRapprochement): string {
  if (cle === "tiers") return l.tiers ?? "";
  if (cle === "compte") return l.compte ?? "";
  if (cle === "piece") return l.piece ?? "";
  return "";
}

interface Agrega {
  montant: number;
  positif: number;
  negatif: number;
  lignes: LigneRapprochement[];
  /** Ligne représentative (plus gros montant absolu) pour le contexte. */
  rep: DocumentLigne;
}

function agreger(document: DocumentSource, cle: CleRapprochement, role: "A" | "B"): Map<string, Agrega> {
  const map = new Map<string, Agrega>();
  for (const [index, l] of document.lignes.entries()) {
    const k = valeurCle(l, cle).trim() ? `key:${valeurCle(l, cle).trim()}` : `__sans_cle__:${role}:${index}`;
    const cents = Math.round(l.montant * 100);
    const trace = { documentId: document.id, line: l.sourceLine ?? index + 1, montant: l.montant, piece: l.piece, date: l.date };
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { montant: cents, positif: Math.max(0, cents), negatif: Math.min(0, cents), lignes: [trace], rep: l });
    } else {
      prev.montant += cents;
      prev.positif += Math.max(0, cents);
      prev.negatif += Math.min(0, cents);
      prev.lignes.push(trace);
      if (Math.abs(l.montant) > Math.abs(prev.rep.montant)) prev.rep = l;
    }
  }
  return map;
}

/** Différence en jours entre deux dates AAAAMMJJ (a − b). Null si invalide. */
export function joursEntre(a?: string, b?: string): number | null {
  if (!a || !b || a.length !== 8 || b.length !== 8) return null;
  const civil = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (!isCivilDate(civil(a)) || !isCivilDate(civil(b))) return null;
  const parse = (s: string) =>
    Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  const da = parse(a);
  const db = parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round((da - db) / 86_400_000);
}

/** Rapproche deux documents et retourne les écarts qualifiés. */
export function rapprocher(
  source: DocumentSource,
  cible: DocumentSource,
  config: RapprochementConfig,
  options: EngineOptions = {},
): ResultatRapprochement {
  if (source.lignes.length === 0 || cible.lignes.length === 0) {
    throw new Error("Rapprochement impossible : un document ne contient aucune ligne exploitable.");
  }
  let budget = 0n;
  try {
    for (const row of [...source.lignes, ...cible.lignes]) {
      const amount = legacyCents(row.montant);
      budget += amount < 0n ? -amount : amount;
    }
    if (budget > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("EUR_AMOUNT_OUT_OF_LEGACY_RANGE");
  } catch {
    throw new Error("Rapprochement impossible : montant invalide, non fini, inférieur au centime ou hors plage dans les données source.");
  }
  const cle = cleGroupante(config.cles);
  if (!Number.isFinite(config.toleranceEur) || config.toleranceEur < 0) throw new Error("Tolérance technique invalide.");
  const tol = config.toleranceEur;

  const sourceCents = source.lignes.reduce((s, l) => s + Math.round(l.montant * 100), 0);
  const targetCents = cible.lignes.reduce((s, l) => s + Math.round(l.montant * 100), 0);
  const totalSource = sourceCents / 100, totalCible = targetCents / 100;
  const ecartGlobal = (sourceCents - targetCents) / 100;

  const aggA = agreger(source, cle, "A");
  const aggB = agreger(cible, cle, "B");
  const cles = new Set<string>([...aggA.keys(), ...aggB.keys()]);

  const ecarts: EcartRapprochement[] = [];
  const groupes: GroupeRapprochement[] = [];
  const lignes: ResultatRapprochement["lignes"] = { rapproche: { source: 0, cible: 0 }, ecart: { source: 0, cible: 0 }, ambigu: { source: 0, cible: 0 }, non_testable: { source: 0, cible: 0 } };
  /** Somme des écarts STRUCTURELS A/B (avant override provision/antériorité). */
  let sommeStruct = 0;

  const seuilAnc = config.seuilAncienneteJours ?? 360;

  for (const k of cles) {
    const a = aggA.get(k);
    const b = aggB.get(k);
    const montantSource = (a?.montant ?? 0) / 100;
    const montantCible = (b?.montant ?? 0) / 100;
    const ecart = ((a?.montant ?? 0) - (b?.montant ?? 0)) / 100;
    const brut = (Math.abs((a?.positif ?? 0) - (b?.positif ?? 0)) + Math.abs((a?.negatif ?? 0) - (b?.negatif ?? 0))) / 100;
    const missing = k.startsWith("__sans_cle__:");
    const displayKey = missing ? k : k.slice(4);
    const multiple = (a?.lignes.length ?? 0) > 1 || (b?.lignes.length ?? 0) > 1;
    const statut = missing ? "non_testable" : !a || !b || Math.abs(ecart) > tol ? "ecart" : multiple || brut > tol ? "ambigu" : "rapproche";
    const cause = missing ? `Clé ${cle} absente : ligne conservée, comparaison bloquée.` : statut === "ambigu" ? "Agrégation multiple ou compensation : correspondance des lignes non démontrée." : statut === "ecart" ? "Écart ou élément présent dans un seul document." : "Groupe univoque concordant dans la tolérance technique.";
    groupes.push({ cle: missing ? `Clé absente (${a ? "A" : "B"}, ligne ${(a ?? b)!.lignes[0].line})` : displayKey, statut, cause, montantSource, montantCible, ecart, ecartBrut: brut, source: a?.lignes ?? [], cible: b?.lignes ?? [] });
    lignes[statut].source += a?.lignes.length ?? 0;
    lignes[statut].cible += b?.lignes.length ?? 0;

    const rep = a?.rep ?? b?.rep;
    const ancienneteJours =
      options.dateReference != null
        ? joursEntre(options.dateReference, rep?.echeance) ?? undefined
        : undefined;
    const aged = ancienneteJours != null && ancienneteJours > seuilAnc;

    // L'antériorité est un signal de revue, indépendant du lettrage.
    if (statut === "rapproche" && !(aged && config.detecterProvision)) continue;

    const base: EcartRapprochement = {
      cle: displayKey,
      niveau: cle === "compte" ? "compte" : "granulaire",
      qualification: missing || statut === "ambigu" ? "a_justifier" : a && b ? "rapprochement_solde" : "perimetre",
      severite: "mineur",
      libelle: rep?.libelle ?? displayKey,
      compte: rep?.compte,
      tiers: rep?.tiers,
      piece: rep?.piece,
      presentSource: !!a,
      montantSource,
      montantCible,
      ecart,
      ancienneteJours,
      sourceKey: sourceFor(config, "rapprochement_solde", "ISA_500"),
      constat: "",
    };

    sommeStruct += ecart; // écart structurel A/B (avant override éventuel)
    ecarts.push(missing || statut === "ambigu" ? { ...base, sourceKey: "ISA_500", constat: cause, severite: "informatif" } : refineEcart(base, rep, config));
  }

  // Écart de solde global (niveau total) si non expliqué par les écarts détaillés.
  if (Math.abs(ecartGlobal) > tol) {
    const residuel = ecartGlobal - sommeStruct;
    if (Math.abs(residuel) > tol) {
      ecarts.unshift({
        cle: "__total__",
        niveau: "total",
        qualification: "rapprochement_solde",
        severite: "majeur",
        libelle: "Écart de solde global non ventilé",
        montantSource: totalSource,
        montantCible: totalCible,
        ecart: residuel,
        sourceKey: sourceFor(config, "rapprochement_solde", "ISA_500"),
        constat: `Le solde global de « ${source.label} » (${totalSource.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €) ne se rapproche pas de « ${cible.label} » (${totalCible.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €) : écart résiduel de ${residuel.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €.`,
      });
    }
  }

  // Tri par gravité puis par montant d'écart décroissant.
  const ordreSev = { bloquant: 0, majeur: 1, mineur: 2, informatif: 3 };
  ecarts.sort(
    (x, y) =>
      ordreSev[x.severite] - ordreSev[y.severite] || Math.abs(y.ecart) - Math.abs(x.ecart),
  );

  const tauxRapprochement = (lignes.rapproche.source + lignes.rapproche.cible) / (source.lignes.length + cible.lignes.length);
  const ecartBrut = Math.round(groupes.reduce((sum, group) => sum + group.ecartBrut * 100, 0)) / 100;
  return { config, totalSource, totalCible, ecartGlobal, tauxRapprochement, ecarts, groupes, lignes, ecartBrut };
}
