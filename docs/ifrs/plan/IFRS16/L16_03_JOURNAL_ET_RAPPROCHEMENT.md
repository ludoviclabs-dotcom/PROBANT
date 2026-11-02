# Prompt L16-03 — Produire un pont PCG–IFRS et un journal de retraitement contrôlé

Prérequis : L16-02 validé avec oracle et politique d’arrondi ; lire C00–C02 et le scope racine. Applique `AGENTS.md`. Pas d’écriture dans un FEC, un ERP ou la base personnelle réelle ; pas de déploiement.

## Objectif

Transformer des résultats L16 déterminés en **propositions de retraitement de clôture**, rapprochées de la base comptable exacte. Le calcul de la dette n’autorise pas, seul, l’annulation automatique de charges PCG.

## Deux objets à ne pas confondre

Le détail économique des mouvements du contrat peut montrer reconnaissance initiale, intérêts, paiement et amortissement. Le **bundle sélectionnable** V1 est cependant un `closing_adjustment` : ajustement de clôture visant une base PCG identifiée et un exercice/période précis. Ne pas additionner un journal de mouvements et un ajustement de soldes portant sur le même événement.

Pour un exercice ultérieur, distingue soldes à la clôture, effet résultat de l’exercice et effet d’ouverture sur capitaux propres. Ne reporte pas tous les amortissements historiques en charge de N. Une nouvelle version d’un bundle remplace sa lignée dans la sélection ; elle ne s’ajoute pas comme nouveau montant. Conserver les anciennes versions pour preuve.

## Travaux demandés

1. Rapproche contrat/échéances/paiements/charges PCG, même entité, période et base. Pour les échéances exigibles, distingue règlements TTC et loyers hors TVA entièrement récupérable ; vérifie le pont de TVA fourni et qualifié, sans décider sa récupération. Ne demande pas de règlement des échéances futures non échues. Liste les absences, écarts de paiement, charges mixtes, CCA/FNP ou autres décalages non couverts. Si le loyer à annuler n’est pas identifié et cadré, pas de bundle final sélectionnable pour ce contrat ; un diagnostic peut montrer le calcul sans le présenter comme une écriture déterminée.
2. Définis des comptes logiques IFRS versionnés : ROU brut, cumul d’amortissement, dette locative, charge d’intérêt, dotation ROU, loyer PCG à neutraliser, effet d’ouverture si nécessaire. Le mapping vers un plan de comptes de reporting est approuvé et sourcé ; ne présente pas ces codes internes comme des comptes PCG obligatoires.
3. Génère des lignes débit/crédit avec montant en centimes, nature économique, contrat/version, période, preuves du calcul et preuve comptable rapprochée. Aucun mouvement de cash de retraitement si le décaissement est déjà dans la base ; neutraliser la charge et reconstituer la ventilation sans payer deux fois.
4. Produis un pont séparé par poste : ROU, dette, résultat avant impôts et ouverture. Le pont documente base PCG + ajustements retenus = cible retraitée sur ce périmètre, avec autres différences non couvertes visibles. Ne somme pas des postes d’actif et de passif comme une exposition unique.
5. Conserve `taxStatus=not_computed` tant qu’aucun effet fiscal qualifié externe n’existe. Ni multiplication par 25 %, ni effet net fiscal zéro par défaut. Ce lot ne développe pas IAS 12 et n’atteste pas que le résultat net IFRS est complet.
6. Implémente sélection/retrait de sélection par version attendue, avec état proposé distinct de revu et distinct de comptabilisé. Une pièce peut documenter une comptabilisation, mais sélectionner un bundle ne la prouve pas.
7. Expose à P18 le contrat stable : seules contributions de résultat de N pour les lignes de résultat, et manifeste des identités économiques déjà incluses. Les composantes bilan ne deviennent pas des lignes de compte de résultat. Une base qui inclut déjà ces ajustements interdit leur ajout ; base inconnue = blocage.

## Cas de contrôle chiffré

Sur la fixture L16-02 et une charge PCG janvier de 1 000,00 € effectivement rapprochée : reconnaissance de ROU/dette à 2 940,99 € ; mouvement économique de janvier ventilant 970,59 € de principal et 29,41 € d’intérêt ; dotation publiée selon la convention d’arrondi, 980,33 € dans cette fixture. La dette de fin janvier est 1 970,40 €, le ROU net 1 960,66 €, l’effet résultat avant impôts −9,74 €.

L’oracle doit produire indépendamment un bundle de clôture équilibré et montrer ces mêmes cibles, sans double mouvement de trésorerie. Ajoute une clôture en N+1 avec effet d’ouverture et effet de période séparés ; ne fabrique pas un compte d’écart pour faire équilibrer le test.

## Interface et recette

Livre une table d’écritures avec preuves, un pont simple par poste et une liste des écarts de cadrage ; les visualisations complètes viennent en L16-04. Teste doublon d’import, double sélection, base contenant déjà le bundle, mauvaise période, charges absentes, historique, compensation interdite, fiscal inconnu, remplacement de source après revue et lecture concurrente discordante.

Le résultat attendu est un bundle déterminé sur un scope précis, ou un refus motivé. Ni un retraitement normal ni son montant ne deviennent automatiquement une anomalie C05. Livre `docs/ifrs/handoffs/L16-03.md`, modèle d’export du journal et recette avant/après.
