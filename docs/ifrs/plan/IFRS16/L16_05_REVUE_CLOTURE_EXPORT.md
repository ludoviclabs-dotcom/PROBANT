# Prompt L16-05 — Revue personnelle, clôture et exports traçables

Prérequis : L16-04 terminé, contrats C00–C02 et C14 existants lus. Applique `AGENTS.md`. Local uniquement ; ne migre pas les données personnelles réelles, ne pousse ni ne déploie rien.

## Objectif

Terminer la chaîne : sources approuvées → population figée → calcul versionné → cadrage → décision → relecture personnelle nommée → verrouillage → export. Aucune nouvelle norme ni nouveau cas de calcul dans ce lot.

## Travaux demandés

1. Réutilise les états et contrôles de `WorkpaperService` et le profil personnel. La relecture personnelle porte le nom et la version examinée ; ne crée pas une seconde identité fictive pour afficher une revue indépendante. Les capacités d’une éventuelle autre identité existante restent intactes.
2. Prépare une synthèse de revue par contrat et pour le portefeuille : données et périmètre, exceptions de qualification, jugement durée/taux, cadrage, résultats déterminés/indéterminés, écritures proposées/sélectionnées, limites de l’annexe et fiscal non calculé. Les points bloquants ne disparaissent pas parce qu’une note a été saisie.
3. Relie calcul, preuve, conclusion et décision à leurs versions exactes. Une pièce remplacée, politique changée, population nouvelle ou contrat modifié périme les décisions dépendantes. Lecture sur état ancien = refus de mutation avec conflit ; ne pas cacher le résultat ancien, le montrer daté et périmé.
4. Rattache la lignée L16 au programme de clôture selon C14. Une feuille par procédure/périmètre sélectionné et autres lignées explicitement listées. Section « Travaux IFRS » séparée des anomalies ; un retraitement accepté ne vaut pas correction d’erreur et n’entre pas dans un total C05.
5. Le journal sélectionné garde son rôle de proposition de reporting. Une mention de comptabilisation exige une preuve distincte ; ne pas déduire « comptabilisé » du verrouillage.

## Export V1 obligatoire

JSON canonique, CSV des contrats/échéanciers/ponts/journal et rapport HTML imprimable. Manifeste : contexte et période, versions et empreintes des sources, population, hypothèses, politiques/règles, calcul, journal, décisions, date d’export et limites. Un même snapshot donne les mêmes données et empreintes métier ; séparer les métadonnées variables d’émission.

Les flux de cash non actualisés, la dette actualisée et les montants de principal par échéance ont des titres distincts. Le rapport peut fournir des tableaux utiles à la préparation de l’annexe, mais annonce explicitement les informations non couvertes. Pas de génération d’annexe IFRS 16 exhaustive ni de classement bilan automatique affirmé.

L’export diagnostic accepte des blocages mais affiche les montants partiels et inconnus sans les agréger comme total complet. L’export revu exige une version figée à jour et une relecture adéquate au mode personnel ; le statut « revu sur ce périmètre » n’est pas « conforme IFRS ». Pièces binaires non embarquées par défaut ; références exactes conservées. Un export de vue filtrée est nommé tel quel et ne se substitue pas au dossier complet.

Le PDF natif est hors V1 : ne construis ni nouvelle chaîne ni bouton promettant ce livrable. Le HTML est imprimable par l’utilisateur ; vérifie ses tableaux, coupures et en-têtes de contexte à l’impression. Ne modifie pas les exports PDF des autres cycles.

## Recette

Relecture sur version courante ; tentative sur version périmée ; changement après verrouillage ; contrat exclu motivé ; portefeuille partiel ; fiscal inconnu ; absence de preuve de comptabilisation ; double export/idempotence ; ancienne version consultable ; conflit entre lecture et écriture ; restauration sur base jetable. Vérifie identité des totaux écran/CSV/JSON/HTML et absence d’ajout aux expositions C05.

Livre l’adaptateur de clôture, exports et manifeste, tests, captures des états de revue, exemple synthétique complet et `docs/ifrs/handoffs/L16-05.md`. Prépare L16-06 avec un inventaire précis des contrôles exécutés et non exécutés.
