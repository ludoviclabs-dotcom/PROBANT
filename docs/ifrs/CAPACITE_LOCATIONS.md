# Capacité de l'atelier Locations — comparaison des options

Relevé du 31/10/2026, sur la branche locale `claude/probant-ifrs-tools-proposal-925b7b`. Il fait suite à `handoffs/L16-06.md` § 5.4. Aucune option n'est implémentée : chacune est **construite concrètement** sur la feuille exécutée d'un portefeuille synthétique (graine 16006). Ses octets sont ensuite comptés porte par porte, comme le runtime réel les compte (`scripts/ifrs/capacite-l16.ts`). Résultats bruts : [`recette/charge/capacite-options-120m.json`](./recette/charge/capacite-options-120m.json) et [`-36m.json`](./recette/charge/capacite-options-36m.json).

**Fiabilité des chiffres** :

- Le compteur d'octets est étalonné contre PostgreSQL (`octet_length(run::text)`) : écart nul.
- Le modèle d'historique est confirmé par les versions réellement écrites par la recette PostgreSQL : 5 versions sans résultat, puis chaque version recopie la feuille entière, preuves comprises.
- Toute capacité inférieure à 600 contrats est **mesurée** : elle passe, et un contrat de plus est refusé. Au-delà, le chiffre est une estimation linéaire, signalée comme telle (écart au point de contrôle ≤ 0,05 %).

## 1. Correction de la capacité publiée en L16-06

L16-06 annonçait 12 contrats de 120 mois (39 de 36 mois, 122 de 12 mois). Le script de mesure ignorait deux faits :

- **Preuves en double.** Le service de feuille recopie toutes les preuves du résultat sur la feuille (`WorkpaperService.execute`, branche `ifrs16.leases`), si bien que chaque version les stocke deux fois.
- **Limite par version.** L'écriture d'une version est refusée au-delà de 3,5 Mio de JSON (`clients-persistence.ts`, `append`).

**Capacité réelle actuelle : 9 contrats de 120 mois, 29 de 36 mois, 88 de 12 mois.** La porte qui refuse est l'écriture d'une version. Ces capacités supposent que Locations soit seul dans le dossier-exercice : le budget d'historique (24 Mio) et celui des sources (24 Mio) sont partagés avec Clients, ventes et Emprunts.

## 2. Ce qui prend la place

Composition d'une feuille exécutée, pour un contrat de 120 mois : 394 Kio par version.

| Part | Kio | Part du total |
|---|---|---|
| Copie des lignes sources par le registre de calcul (`result.input`) | 110 | 28 % |
| Preuves recopiées sur la feuille (`run.evidence`) | 78 | 20 % |
| Preuves dans le résultat (`result.evidence`), une par ligne source | 78 | 20 % |
| Échéances qualifiées avec leur preuve (`contracts[].dues`) | 68 | 17 % |
| Échéancier du moteur, en objets (`contracts[].schedule`) | 51 | 13 % |
| Chiffres, cadrage, retraitement, points | 8 | 2 % |

Côté import, l'aperçu de l'échéancier pèse 101 Kio par contrat de 120 mois, alors que le fichier n'en pèse que 39 Kio. L'aperçu stocke, pour chaque ligne, la ligne d'origine, sa forme normalisée et ses identifiants.

## 3. Les options

| Option | Ce qu'elle fait | Ce qu'elle touche | Effort | Risque |
|---|---|---|---|---|
| **O1** Entrées par référence | Dans la feuille, la copie des lignes sources de `result.input` devient leur nombre et leur empreinte. Les lignes restent dans le store d'imports, qui est en ajout seul. `inputHash` est calculé avant, sur les entrées complètes | L'adaptateur Locations seulement (`LeaseRegistry.execute`). Aucun autre module ne lit `result.input` pour Locations ; le seul lecteur existant concerne Provisions (`provision-redaction.ts`) | Petit | Faible. La preuve d'entrée d'un calcul reste vérifiable par l'empreinte et les sources figées, sans être embarquée |
| **O2** Résultat compacté (`ifrs16-result-2`) | Échéances qualifiées par référence : elles se relisent sur les sources figées, comme le fait déjà la lecture. Échéanciers en colonnes. Preuves regroupées par pièce. Plus de copie des preuves sur la feuille | `lease-review.ts` (producteur), `portfolio.ts` et `lease-export.ts` (lecteurs), la branche Locations de `WorkpaperService.execute`, `CONTRAT_COMMUN.md` § 4.6, l'exemple publié `exemples/l16-05`. Le moteur et l'oracle restent intacts | Moyen | Faible à moyen ; propriétés, oracle et mutations gardent les chiffres. **Moment favorable** : aucune feuille réelle `ifrs16-result-1` n'existe, l'exécution réelle étant bloquée, donc rien à migrer |
| **R** Lecture compacte | La lecture renvoie les vues serveur sans le corps du résultat ; le détail d'un contrat (échéances, preuves) se lit à la demande | `lease-runtime.ts` (nouvelle opération de détail), inspecteur, frise et choix des pièces citées à l'écran, e2e | Moyen | Faible |
| **O3** Résultat stocké une fois par exécution | Les versions qui suivent le calcul portent l'empreinte du résultat au lieu du résultat | La persistance partagée du store « Clients » : nouvelle table en ajout seul, migration, relecture de `v.run` par le dossier de clôture, empreinte de contenu, sauvegarde et restauration du profil local. Tous les cycles de ce store sont concernés | Grand | Élevé, car elle touche les mécanismes d'intégrité et de version communs |
| **O4** Limites relevées sur le profil local (×8 dans ce relevé) | Fichier, aperçu, écriture d'une version, historique, sources et lecture | `ClientsRuntime` et le lecteur tabulaire (`imports.ts`), à paramétrer pour Locations sur le profil personnel, sans changer les autres cycles | Petit à moyen | Moyen : temps et mémoire (§ 5) ; une lecture de plusieurs dizaines de Mio dans le navigateur |
| **O5** Échéancier compact | Seules les échéances exigibles à la date de revue sont importées ; les échéances futures découlent des termes du contrat (loyer constant, déjà exigé en V1) | Le contrat de données de L16-01 : dictionnaire, mapping `ifrs16-leases-3`, contrôle de complétude Q10, modèles, documentation | Moyen | Décision métier : une preuve ligne à ligne disparaît pour les échéances futures |

## 4. Capacité par combinaison

Les cellules donnent le nombre de contrats admis ; « ~ » signale une estimation au-delà du lecteur réel.

| | Combinaison | 120 mois | 36 mois | Porte qui refuse |
|---|---|---|---|---|
| A | Actuel | **9** | 29 | écriture d'une version |
| B | O1 | 13 | 40 | écriture d'une version |
| C | O2 | 27 | 75 | écriture d'une version |
| D | **O1 + O2** | **30** | **101** | aperçu de l'échéancier (version et historique admettraient 138 et 147 à 120 mois) |
| E | O1 + O2 + R | 30 | 101 | aperçu de l'échéancier |
| F | O1 + O2 + O3 + R | 30 | 101 | aperçu de l'échéancier |
| G | O4 seule | 76 | 233 | écriture d'une version |
| J | **O1 + O2 + O4** | **243** | ~816 | aperçu de l'échéancier |
| H | O1 + O2 + O3 + R + O4 | 243 | ~816 | aperçu de l'échéancier |
| K | O1 + O2 + R + O5 | 138 | 274 | écriture d'une version |
| I | O1 + O2 + O3 + R + O4 + O5 | ~1 116 | ~2 227 | écriture d'une version |

Lecture du tableau :

1. **O1 et O2 se renforcent.** Seule, chacune laisse une feuille trop lourde. Ensemble, elles divisent la version par 14 : 374 → 26 Kio de JSON par contrat de 120 mois. La porte suivante devient alors l'aperçu de l'échéancier à l'import.
2. **O3 et R n'augmentent rien tant que l'import borne la capacité** (lignes D à F, H à J). R reste conseillée au-delà d'une cinquantaine de contrats, pour la taille de la lecture plutôt que pour la limite.
3. **La cible du plan (1 000 × 120) n'est atteinte qu'avec toutes les options**, dont un changement du contrat de données (O5) et du stockage partagé (O3).

## 5. Temps

Le registre de calcul partagé coûte environ 50 ms par contrat de 120 mois : 0,6 s à 12 contrats, 5,4 s à 100 (`charge-*.json`). O1, faite dans l'adaptateur, ne change pas ce coût, car l'empreinte des entrées est calculée avant. **Au-delà d'environ 40 contrats de 120 mois, une exécution dépasse 2 s**, seuil au-delà duquel le plan exige une progression affichée. Avec les combinaisons J et H, un calcul de 243 contrats prendrait de l'ordre de 12 s : progression, voire tâche locale avec reprise. Ces temps ne sont pas mesurés sous les options. Les lectures et les exports, dominés par l'empreinte de la feuille, diminueraient avec sa taille ; ce n'est pas mesuré non plus.

## 6. Recommandation

1. **Maintenant, avant d'ouvrir l'exécution réelle : O1 + O2.**
   - Le changement reste dans le code Locations : seule la branche Locations du service est touchée, sans migration ni autre cycle concerné.
   - La capacité passe de 9 à 30 contrats de 120 mois, et de 29 à 101 contrats de 36 mois.
   - C'est le moment le moins coûteux : aucun résultat réel n'est encore stocké au format actuel.
2. **Ensuite, seulement si votre portefeuille dépasse ces seuils : O4, limité à Locations sur le profil personnel**, avec une progression affichée (et R au-delà d'une cinquantaine de contrats). On atteint alors 243 contrats de 120 mois, sans toucher au stockage commun.
3. **Pas maintenant** :
   - O3, qui porte un risque sur l'intégrité commune pour un gain absent tant que l'import borne la capacité ;
   - O5, qui est une décision sur la preuve exigée ;
   - la cible de 1 000 × 120, hypothèse de charge du plan plutôt que besoin constaté.

   La cible de capacité de l'atelier serait plutôt à fixer d'après le portefeuille réel attendu.

La décision qui conditionne l'étape 2 est le **nombre et la durée des contrats réellement attendus** dans un dossier.
