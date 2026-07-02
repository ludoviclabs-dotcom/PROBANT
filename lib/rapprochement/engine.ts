import type {
  CleRapprochement,
  DocumentLigne,
  DocumentSource,
  EcartRapprochement,
  RapprochementConfig,
  ResultatRapprochement,
} from "./types";
import { refineEcart, sourceFor } from "./qualify";

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
function cleGroupante(cles: CleRapprochement[]): CleRapprochement {
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
  /** Ligne représentative (plus gros montant absolu) pour le contexte. */
  rep: DocumentLigne;
}

function agreger(lignes: DocumentLigne[], cle: CleRapprochement): Map<string, Agrega> {
  const map = new Map<string, Agrega>();
  for (const l of lignes) {
    const k = valeurCle(l, cle);
    if (!k) continue;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { montant: l.montant, rep: l });
    } else {
      prev.montant += l.montant;
      if (Math.abs(l.montant) > Math.abs(prev.rep.montant)) prev.rep = l;
    }
  }
  return map;
}

/** Différence en jours entre deux dates AAAAMMJJ (a − b). Null si invalide. */
export function joursEntre(a?: string, b?: string): number | null {
  if (!a || !b || a.length !== 8 || b.length !== 8) return null;
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
  const cle = cleGroupante(config.cles);
  const tol = Math.max(0, config.toleranceEur);

  const totalSource = source.lignes.reduce((s, l) => s + l.montant, 0);
  const totalCible = cible.lignes.reduce((s, l) => s + l.montant, 0);
  const ecartGlobal = totalSource - totalCible;
  const denom = Math.max(Math.abs(totalSource), Math.abs(totalCible), 1);
  const tauxRapprochement = Math.max(0, Math.min(1, 1 - Math.abs(ecartGlobal) / denom));

  const aggA = agreger(source.lignes, cle);
  const aggB = agreger(cible.lignes, cle);
  const cles = new Set<string>([...aggA.keys(), ...aggB.keys()]);

  const ecarts: EcartRapprochement[] = [];
  /** Somme des écarts STRUCTURELS A/B (avant override provision/antériorité). */
  let sommeStruct = 0;

  const seuilAnc = config.seuilAncienneteJours ?? 360;

  for (const k of cles) {
    const a = aggA.get(k);
    const b = aggB.get(k);
    const montantSource = a?.montant ?? 0;
    const montantCible = b?.montant ?? 0;
    const ecart = montantSource - montantCible;

    const rep = a?.rep ?? b?.rep;
    const ancienneteJours =
      options.dateReference != null
        ? joursEntre(options.dateReference, rep?.echeance) ?? undefined
        : undefined;
    const aged = ancienneteJours != null && ancienneteJours > seuilAnc;
    const nonDeprecie = rep?.lettre !== true;

    // Rapproché ET pas de créance ancienne non dépréciée → rien à signaler.
    if (Math.abs(ecart) <= tol && a && b && !(aged && nonDeprecie)) continue;

    const base: EcartRapprochement = {
      cle: k,
      niveau: cle === "compte" ? "compte" : "granulaire",
      qualification: a && b ? "rapprochement_solde" : "perimetre",
      severite: "mineur",
      libelle: rep?.libelle ?? k,
      compte: rep?.compte,
      tiers: rep?.tiers,
      piece: rep?.piece,
      montantSource,
      montantCible,
      ecart,
      ancienneteJours,
      sourceKey: sourceFor(config, "rapprochement_solde", "ISA_500"),
      constat: "",
    };

    sommeStruct += ecart; // écart structurel A/B (avant override éventuel)
    ecarts.push(refineEcart(base, rep, config, tol));
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
        constat: `Le solde global de « ${source.label} » (${Math.round(totalSource).toLocaleString("fr-FR")} €) ne se rapproche pas de « ${cible.label} » (${Math.round(totalCible).toLocaleString("fr-FR")} €) : écart résiduel de ${Math.round(residuel).toLocaleString("fr-FR")} €.`,
      });
    }
  }

  // Tri par gravité puis par montant d'écart décroissant.
  const ordreSev = { bloquant: 0, majeur: 1, mineur: 2, informatif: 3 };
  ecarts.sort(
    (x, y) =>
      ordreSev[x.severite] - ordreSev[y.severite] || Math.abs(y.ecart) - Math.abs(x.ecart),
  );

  return { config, totalSource, totalCible, ecartGlobal, tauxRapprochement, ecarts };
}
