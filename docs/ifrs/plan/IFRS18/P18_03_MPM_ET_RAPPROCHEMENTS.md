# Prompt P18-03 — Qualifier et rapprocher les mesures de performance de direction

Prérequis : P18-02 terminé ; C00–C02 et scope racine lus. Applique `AGENTS.md`. Travail local, pas de calcul fiscal, de recherche automatique dans des documents externes ni de déploiement.

## Objectif et lecture obligatoire

Créer un registre de candidats MPM, leurs décisions de qualification et leurs rapprochements. Relis S18 §117–125 et B113–B142 dans le texte applicable. Ne transforme pas tous les indicateurs d’un dashboard en MPM. Le nom « EBITDA » ou « résultat ajusté » n’est pas un critère suffisant.

## Qualification demandée

Pour chaque candidat : formule et périmètre de l’entité, communication publique fournie localement, date/version/page, usage par la direction, nature de sous-total de produits et charges, analyse des critères et des exclusions normatives, conclusion et auteur. Les critères issus du texte et les questions d’aide internes sont séparés.

Traite au minimum : sous-total utilisé publiquement ; indicateur seulement interne ; ratio ; flux de trésorerie ; mesure de segment ; sous-total spécifiquement requis ou exclu par le texte ; candidat ambigu. La marge brute et le sous-total visé par §118(b) ne sont pas des MPM simplement parce qu’ils sont nommés autrement. Un rejet exige un motif, pas une suppression du registre.

Le registre des communications a un périmètre explicite. Aucune MPM reconnue peut être une conclusion documentée ; aucune communication fournie = population non qualifiée, pas preuve de l’absence de MPM. Le caractère self-host du logiciel ne détermine pas à lui seul la qualification des indicateurs de l’entité analysée. Les exemples synthétiques de communications ne doivent pas être présentés comme des publications réelles.

## Rapprochement

Lie chaque MPM reconnue au total ou sous-total IFRS le plus directement comparable, choisi et justifié à partir de ceux disponibles dans le périmètre V1. Définis les éléments de rapprochement avec ID stable, signe, montant N/N-1, composition, motif, sources et vérification de non-chevauchement. La même ligne économique ne peut pas entrer deux fois dans un ajustement sans justification d’allocation exacte.

Conserve la formule `MPM = sous_total_IFRS + somme(éléments_signés)` et affiche l’identité au centime. Ne modifie pas le compte de résultat réglementaire pour le remplacer par la MPM. L’outil ne décide pas que l’exclusion d’un coût « améliore » la pertinence de la mesure : le jugement et l’explication de la direction sont documentés.

Par élément : effet fiscal fourni et justifié, méthode déclarée conforme à la source applicable, preuve et statut ; effet NCI fourni ou zéro explicitement justifié par le périmètre individuel sans NCI. Une case vide ne signifie pas zéro. NCI présent ou profil non qualifié = hors V1 ; aucun moteur de consolidation. Aucun taux uniforme d’impôt, aucun moteur IAS 12 et aucun faux « MPM net d’impôt » créé en appliquant un taux au sous-total entier.

## Note et changements

Prépare une note de travail unique rassemblant les MPM reconnues : description, utilité selon la direction, mode de calcul, sous-total comparable, éléments, effets fiscaux/NCI, méthodes, changements et comparatifs. Les explications restent éditables et versionnées ; pas de texte généré affirmant automatiquement que toutes les exigences de la norme sont satisfaites.

Si formule, périmètre, méthode fiscale ou usage change : nouvelle version, raison, effets et comparatifs reconstitués. Impraticabilité alléguée : justification explicite et traitement bloqué pour la validation automatisée V1, pas une option qui dispense de fournir les données sans analyse.

## Fixture et recette

À partir du résultat d’exploitation de fixture 250 000 : ajustement restructuration +15 000 et retrait d’un gain −5 000 donnent MPM 260 000. Pour tester les colonnes fiscales uniquement, importer des effets qualifiés −3 750 et +1 250, NCI zéro explicitement documenté ; ajustement avant impôts +10 000, effet fiscal −2 500 et ajustement après effet fiscal +7 500. Ces nombres sont des données synthétiques fournies, pas le calcul d’un taux légal. Ne pas baptiser 260 000 « MPM net ».

Teste qualification positive/négative/ambiguë, candidat interne seul, deux ajustements chevauchants, mauvais sous-total, fiscal absent, NCI non qualifié, changement de formule, comparatif absent et source remplacée. Un rapprochement chiffré avant impôts peut rester diagnostique si une information obligatoire de la note manque.

Livre contrats, registre persistant, calcul et contrôles de rapprochement, brouillon de note structuré, tests et `docs/ifrs/handoffs/P18-03.md`. Le rendu en cascade sera branché en P18-05.
