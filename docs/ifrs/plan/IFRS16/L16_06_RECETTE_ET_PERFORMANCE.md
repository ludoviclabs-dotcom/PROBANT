# Prompt L16-06 — Recette indépendante et performance du module Locations

Prérequis : L16-01 à L16-05 terminés, handoffs et conventions lus. Applique `AGENTS.md`. Ce lot autorise les corrections ciblées nécessaires à la recette locale, pas l’ajout de nouveaux cas IFRS, ni push, fusion ou déploiement.

## Mission

Établir ce qui fonctionne réellement, identifier les incohérences restantes et corriger celles du scope V1. Aucune hausse de tolérance, suppression de test ou réduction cachée de population pour obtenir des contrôles verts.

## Matrice minimale de recette

| Famille | Cas à exécuter | Attendu |
|---|---|---|
| Référence | Fixture trois mensualités et oracle L16-02 | Dette initiale, intérêts, ROU, journal et effet résultat conformes aux attendus indépendants |
| Taux | Zéro documenté ; effectif annuel 5 % ; nominal non converti ; absent ; négatif | Calcul seulement pour les cas V1 qualifiés, refus motivés pour les autres |
| Durées/dates | 1, 12 et 120 mois ; année bissextile ; commencement hors convention | Échéances civiles correctes, aucun mois ou flux doublé, cas non supporté bloqué |
| Exemptions | Court terme qualifié ; achat présent ; faible valeur non justifiée | Politique et jugement requis ; pas de seuil universel ou exemption silencieuse |
| Composantes | Service non séparé, coût initial, dépôt non qualifié, incitation, indexation | Détection et refus côté serveur, même sans passer par l’UI |
| TVA et échéances | Paiement TTC cadré au loyer/TVA qualifiés ; récupération inconnue ; loyers futurs | Bases monétaires distinctes ; récupération inconnue bloquante ; futur non échu non traité comme paiement manquant |
| Historique | Calcul depuis origine, ouverture cadrée ; ouverture absente | Effet d’ouverture distinct de N ; diagnostic seul si reprise non qualifiée |
| Cadrage | Loyer GL absent ; CCA/FNP non couvert ; paiement discordant | Pas de bundle déterminé fondé sur une annulation supposée |
| Versions | Pièce/contrat/taux changé ; mapping P18 seul changé | Invalidation de la chaîne dépendante uniquement ; L16 intact après mapping P18 |
| Journal | Double sélection, base déjà retraitée, deuxième version, N+1 | Aucun double comptage ; sélection de lignée ; séparation bilan/résultat/ouverture |
| Revue | Personnelle nommée, verrouillage, conflit et export ancien | Versions conservées et mentions justes ; aucun statut de revue indépendante fictif |
| Fiscal | Effet non calculé | Jamais un net après impôt ou un zéro fiscal inféré |

## Propriétés et tests de mutation

Vérifie la conservation des paiements et du principal, les ponts de soldes, la non-négativité du ROU dans le scope couvert, la fin de plan, l’indépendance à l’ordre des contrats et le déterminisme des empreintes. Les comparaisons de montants publiés se font au centime avec convention explicite ; la précision interne a son propre critère, établi avant calcul.

Introduis des mutations de test : utiliser `r/12`, inverser le signe d’un paiement, compter deux fois un contrat, ignorer une source remplacée et accepter un coût initial absent comme zéro. Les tests doivent détecter chacune ; conserver ces vérifications sans laisser la mutation dans le code livré.

## Charge et résilience

Génère par seed un portefeuille de 1 000 contrats × 120 mensualités sans données réelles. Mesure calcul froid/chaud, agrégation, recalcul d’un contrat, mémoire, export et navigation après chargement. Documente CPU/RAM/OS/runtime, paramètres et nombre de répétitions. C’est une qualification sur cette machine, pas une garantie de performance générale.

Si un job est nécessaire, tester interruption, reprise, progression réelle et publication atomique. Ne pas charger tous les échéanciers en React ; graphiques agrégés et détails paginés. Un manque de budget est un résultat à expliquer et optimiser, pas une raison pour annoncer un faux benchmark.

## Recette du parcours

Depuis l’UI : importer → approuver → qualifier → figer → exécuter → rapprocher → sélectionner → relire personnellement → verrouiller → exporter → remplacer une source → constater la péremption. Après redémarrage, retrouver décisions et preuves. Tester les états aux largeurs 390/1024/1440, clavier, zoom, mouvement réduit et alternative tabulaire.

## Contrôles et handoff

Relis `package.json`, exécute typage/lint/tests ciblés/build et intégrations PostgreSQL sur base jetable identifiée ; ajoute la non-régression des chemins partagés Emprunts, Immobilisations et clôture. Les tests ignorés restent non vérifiés. Ne touche ni au déploiement ni à la base personnelle réelle.

Livre `docs/ifrs/handoffs/L16-06.md`, matrice exigences → tests → résultats, mesures, captures, oracle, bugs corrigés et limites conservées. Formule le verdict « opérationnel sur le périmètre V1 vérifié » seulement si les portes de sortie sont satisfaites ; sinon liste les blocages précis avant C03.
