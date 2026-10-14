import { stableHash } from "@/lib/synthesis/canonical";
import { SEUILS_INTERNES, SOURCES } from "./sources";

/**
 * Éditions du registre normatif (`SOURCES` et `SEUILS_INTERNES`).
 *
 * Une édition identifie un CONTENU du registre, pas un état du droit : chaque
 * source garde sa propre date d'effet, et une édition n'atteste aucune relecture
 * des entrées. L'identifiant inscrit dans les snapshots (`referentielVersion`)
 * vaut `ed<N>-<12 premiers caractères de l'empreinte>` ; l'empreinte est le
 * SHA-256 du JSON canonique du registre (clés triées, implémentation pure
 * utilisable côté navigateur).
 *
 * Journal append-only : toute modification de `SOURCES` ou de `SEUILS_INTERNES`
 * ajoute une édition en fin de journal ; une édition publiée n'est jamais
 * réécrite. Un snapshot existant garde l'identifiant sous lequel il a été
 * produit. Procédure et contenus antérieurs : docs/knowledge/REFERENTIEL_EDITIONS.md.
 */

export interface ReferentielEdition {
  readonly numero: number;
  /** SHA-256 hexadécimal du JSON canonique `{ sources, seuilsInternes }`. */
  readonly empreinte: string;
  /**
   * Date à laquelle ce contenu est entré dans le registre (fait sur le
   * registre) — ni date d'état du droit, ni date de relecture.
   */
  readonly registreModifieLe: string;
  readonly motif: string;
  /** Clés ajoutées, modifiées ou retirées depuis l'édition précédente. */
  readonly entrees: readonly string[];
}

/**
 * Identifiant unique employé avant le journal. Six contenus distincts du
 * registre l'ont porté sur main (29/06/2026 → 16/08/2026) : il ne permet pas de
 * déterminer le contenu appliqué. Le numéro d'édition 1 lui est réservé.
 */
export const IDENTIFIANT_ANTERIEUR = "2024-01-01";

export const REFERENTIEL_EDITIONS: readonly ReferentielEdition[] = [
  {
    numero: 2,
    empreinte: "cf23de34ea7f5e42e2242180bf2d2ee6b1fd5b1bb544fbe3eeab0473b191075f",
    registreModifieLe: "2026-08-16",
    motif:
      "Première édition identifiée : contenu présent sur main depuis f0bc8f2, jusque-là porté sous l'identifiant antérieur 2024-01-01.",
    entrees: [],
  },
  {
    numero: 3,
    empreinte: "9f821c3212856b03a65e00d846300ac0ade4f6855ec1a82ea918f142c9f0d170",
    registreModifieLe: "2026-10-14",
    motif:
      "C. com. art. L225-248 : version en vigueur depuis le 11/03/2023 (loi n° 2023-171, art. 14), citation et URL Légifrance de cette version (PR #89, fusionnée avant le journal sans édition déclarée).",
    entrees: ["CCOM_CAPITAL"],
  },
];

/** Contenu couvert par l'empreinte. */
export function contenuRegistre(): { sources: typeof SOURCES; seuilsInternes: typeof SEUILS_INTERNES } {
  return { sources: SOURCES, seuilsInternes: SEUILS_INTERNES };
}

export function empreinteRegistre(contenu: unknown = contenuRegistre()): string {
  return stableHash(contenu);
}

export function identifiantEdition(edition: Pick<ReferentielEdition, "numero" | "empreinte">): string {
  return `ed${edition.numero}-${edition.empreinte.slice(0, 12)}`;
}

/**
 * Identifiant du contenu donné : l'édition qui porte cette empreinte, sinon
 * `brouillon-<empreinte>` — un contenu non déclaré ne revendique pas d'édition.
 */
export function identifiantPourEmpreinte(
  empreinte: string,
  editions: readonly ReferentielEdition[] = REFERENTIEL_EDITIONS,
): string {
  const edition = editions.findLast((e) => e.empreinte === empreinte);
  return edition ? identifiantEdition(edition) : `brouillon-${empreinte.slice(0, 12)}`;
}

export const REFERENTIEL_EMPREINTE = empreinteRegistre();

/** Identifiant du registre chargé, inscrit dans les snapshots — pas une date. */
export const REFERENTIEL_VERSION = identifiantPourEmpreinte(REFERENTIEL_EMPREINTE);

export type ReferentielDescription =
  | { kind: "edition"; identifiant: string; numero: number; empreinte: string; courante: boolean; libelle: string; detail: string }
  | { kind: "brouillon"; identifiant: string; libelle: string; detail: string }
  | { kind: "anterieur"; identifiant: string; libelle: string; detail: string }
  | { kind: "inconnu"; identifiant: string; libelle: string; detail: string };

/** Libellé et explication d'un identifiant de référentiel lu dans un snapshot. */
export function decrireReferentiel(
  identifiant: string,
  editions: readonly ReferentielEdition[] = REFERENTIEL_EDITIONS,
  courant: string = REFERENTIEL_VERSION,
): ReferentielDescription {
  const edition = editions.find((e) => identifiantEdition(e) === identifiant);
  if (edition) {
    const courante = identifiant === courant;
    return {
      kind: "edition",
      identifiant,
      numero: edition.numero,
      empreinte: edition.empreinte,
      courante,
      libelle: `éd. ${edition.numero}`,
      detail: `Édition ${edition.numero} du registre normatif (empreinte ${edition.empreinte.slice(0, 12)}, contenu entré le ${edition.registreModifieLe})${courante ? ", édition chargée" : `, l'édition chargée est ${decrireReferentiel(courant, editions, courant).libelle}`}. Une édition n'atteste pas la relecture des entrées.`,
    };
  }
  if (/^brouillon-[0-9a-f]{12}$/.test(identifiant)) {
    return {
      kind: "brouillon",
      identifiant,
      libelle: "brouillon",
      detail: `Contenu du registre sans édition déclarée (empreinte ${identifiant.slice(10)}).`,
    };
  }
  if (identifiant === IDENTIFIANT_ANTERIEUR) {
    return {
      kind: "anterieur",
      identifiant,
      libelle: `${identifiant} (antérieur)`,
      detail:
        "Identifiant antérieur aux éditions : six contenus distincts du registre l'ont porté ; le contenu appliqué n'est pas déterminable par l'identifiant seul.",
    };
  }
  return {
    kind: "inconnu",
    identifiant,
    libelle: identifiant,
    detail: "Identifiant absent du journal des éditions de ce poste.",
  };
}
