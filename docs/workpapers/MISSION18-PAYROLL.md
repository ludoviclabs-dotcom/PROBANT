# Mission 18 — Paie par étapes, congés séparés

## Parcours livré

`/paie-personnel` est relié à la synthèse principale et à la synthèse synthétique. Deux étapes de paie : cadrage journal/GL, puis journal/GL/déclarations/paiements. `/paie-personnel/conges` porte une population, un import et un calcul distincts. Les données, calculs, décisions et sources sont produits par les modules serveur de `lib/workpapers`, sans moteur de calcul dans React.

Design : surface claire, lignes continues, navigation par mois, organisme/rubrique, détail latéral avec focus retenu et fermeture Échap. Inter, bleu ardoise, accent bleu pour les actions, ambre pour les écarts ; aucun mur de cartes. Les mouvements accompagnent l’ouverture et le changement de vue ; `prefers-reduced-motion` les désactive. Montants et droits masqués au chargement, détail pseudonymisé. Les références officielles et pièces client ont des sections distinctes.

## Frontière de sécurité et statut

Livraison **locale et exclusivement synthétique**, pas une sécurité RH de production. L’API réelle `/api/workpapers/paie` refuse GET et POST par 503 sans consommer de corps. Aucun flag ne permet son activation. Aucune migration, aucun branchement au stockage ou aux exports généraux du dossier. Les moteurs de congés conservent leur garde synthétique existante.

La démo exige `PROBANT_DEMONSTRATION_ENABLED=true`, une `PROBANT_DEMONSTRATION_ORIGIN` loopback explicite, Host/protocole/origine concordants et aucune valeur `VERCEL_ENV`. Une requête POST doit porter la même origine ; les requêtes cross-site sont refusées. Cookie serveur aléatoire HttpOnly/SameSite Strict, durée technique interne de 30 minutes, 16 sessions maximum. Ce n’est pas une durée légale de conservation. La mémoire est perdue au redémarrage ; les versions conservées sont bornées à 40. Import et aperçu expirent après 10 minutes, 8 aperçus maximum.

Chaque lecture, préparation et export appelle la politique organisation/dossier/période existante **et** une capacité RH distincte. Les rôles généraux ne reçoivent aucun nouveau droit RH. L’acteur synthétique est fixé côté serveur, jamais reçu du navigateur. Une modification exige aussi le droit de lire son résultat. Le diagnostic requiert téléchargement + capacité RH export. Il ne contient ni pseudonyme, montant, pièce, nom de fichier client ni lignes RH. Le seul autre téléchargement est un en-tête CSV vide. Les journaux applicatifs ne contiennent que action/version/date ; pas de payload ni d’erreur brute du parseur. Aucun export de données RH n’est livré.

**Extension réelle arrêtée** tant que ne sont pas validés : authentification et habilitations RH fines par dossier/établissement, cloisonnement durable et chiffrement, politiques de rétention/effacement, audit d’accès sans données RH, autorisations et protection des exports/captures, désactivation de télémétrie RH, revue de sécurité et mappings métiers validés. Les paramètres locaux ne valent pas cette validation.

## Formats, champs et qualification

Le premier lot accepte uniquement des **CSV structurés**, UTF-8, séparateur `;`, dates civiles ISO, décimales avec deux chiffres et point, devise EUR sans conversion. Limites : 1 Mo/fichier, 5 000 lignes. Le parseur partagé `previewImport` et le dépôt `MemoryImportRepository` contrôlent les bytes/hash/approbation. La qualification stricte ajoute les axes de paie et refuse les colonnes inconnues (notamment nom/NIR), identifiants dupliqués, dates invalides, montants de paiement négatifs et structures non comparables. Les pseudonymes acceptés sont exclusivement `SYN-…`. Les noms de fichiers arbitraires sont neutralisés.

| Export | Colonnes exactes |
| --- | --- |
| Journal, GL, déclaration, paiements | `id;pseudonym;establishment;month;rubric;organism;basisCode;base;amount;date;regularization;paymentRef;paymentStatus;entryDate;exitDate` |
| Événements | `id;pseudonym;establishment;month;rubric;organism;reason;originMonth;pieceRef;page;amount;date` |
| Congés | `id;pseudonym;from;to;unit;acquired;taken;remaining;firstBase;secondBase;firstNumerator;firstDenominator;secondNumerator;secondDenominator;secondUnit;secondFrom;secondTo;ruleRef;ruleVersion;validFrom;validTo;ruleApproved;pieceRef;page;date` |

Les colonnes optionnelles restent présentes avec cellule vide. Pseudonyme obligatoire pour journal/congés ; facultatif dans les sources agrégées. Codes d’établissement, rubrique, organisme et base sont des identifiants explicites, pas des libellés interprétés. `month` est le mois de rattachement fourni par le mapping ; `date` reste la date de source ou bancaire. `regularization` indique un mois antérieur ou égal, sans déplacement automatique de ligne. `paymentRef` et `paymentStatus=posted|cancelled` sont obligatoires pour les paiements. `base` est une base monétaire explicitement qualifiée ; aucune assimilation entre base, net, brut et cotisation.

Motifs d’événements : `recall`, `entry`, `exit`, `bonus`, `timing`, `other`. Un événement porte une pièce/page et les mêmes axes de rapprochement. Son montant n’est pas automatiquement soustrait d’un écart : il ne prouve pas la correction ou une causalité complète.

Mapping `payroll-review-1`, kind, pack synthétique/version source/date de génération, couverture `complete|partial|unknown`. Les bytes, parseur, mapping, nature de source, approbation et périmètre sont figés dans les versions. La nature de source figure dans la version technique de mapping pour différencier des bytes identiques importés comme GL ou déclaration. Le sélecteur de couverture n’établit pas l’exhaustivité externe du pack. La qualification manuelle dans l’exemple reste une validation technique synthétique.

**Aucun parseur DSN natif.** `DSN.csv` peut seulement être un nom de fichier pour un export conforme à ce contrat. Ni extraction S21, ni validation NEODeS, ni envoi DSN. Un parseur natif n’est pas nécessaire à ce lot. Si requis, il fera l’objet d’un sous-lot préalable qui fixe la norme NEODeS/millésime et version exacts, les blocs/rubriques autorisés, les contrôles de syntaxe, cardinalités, types, identifiants, périodes, régularisations, annule/remplace, complétude et correspondance avec le mapping. La version ne sera pas supposée depuis un nom de fichier.

## Questions professionnelles et calculs

| Module | Question / assertion / risque | Population, calcul et états |
| --- | --- | --- |
| Journal ↔ GL | Les agrégats comparables sont-ils cadrés ? Exhaustivité et classement ; rappel ou salarié sorti perdu dans un filtre | Salarié × mois × rubrique, partitions établissement/organisme/base. `GL − journal`, sommes exactes en centimes. Variation journal M − M−1 seulement si le mois précédent et sa population sont comparables. |
| Déclarations ↔ paiements | Les déclarations correspondent-elles aux écritures et règlements ? Rattachement, absence ou paiement répété | Union des groupes des quatre sources. `GL − déclaration`, `journal − déclaration`, `payé − déclaration`. Paiements annulés hors somme, toujours conservés. Paiement postérieur à la date de revue ou référence répétée : payé inconnu/bloqué. |
| Congés | Les droits et bases portent-ils les mêmes unités et périodes, avec règle applicable documentée ? Faux rapprochement jours/heures ou provision extrapolée | Population propre : pseudonyme × période de droits et méthodes. `comparePaidLeave` existant : acquis − pris = restants ; égalité droits/unités/périodes ; validité à clôture, preuve et approbation synthétique de méthode ; fractions importées explicites. Montant comparé sur droits spécifiés seulement. Droits restants et charges : non établis. |

Les salariés sortis restent inclus, notamment pour les rappels après sortie. Les lignes hors période de rattachement sont marquées hors population, sans réécriture de date ou du GL. Une exclusion volontaire exige une pièce liée, un motif explicite et une version ; elle bloque les écarts comparés à des totaux agrégés non ajustés. La restitution montre inclus/exclus ; restaurer rétablit la population. Aucun dédoublonnage de paiement automatique ; une ventilation d’un paiement partagé nécessite un mapping ultérieur validé.

Source absente, mapping non qualifié, couverture partielle/inconnue ou ligne sans base : **non établi**, jamais zéro. Une période comptable démarrant ou finissant en milieu de mois bloque les agrégats mensuels, faute de détail permettant d’établir la fraction d’exercice. Une source ne couvre pas automatiquement un cycle. Les états sont concordant arithmétiquement, à expliquer, documenté, revue périmée, bloqué. Aucun seuil métier ou taux social n’est inventé. La documentation est possible par import de pièces/règles même lorsque le résultat est bloqué.

## Explications, preuves, décision et versions

Un motif est enregistré uniquement avec un événement du groupe et une empreinte des entrées actuelles. Un rappel, entrée/sortie, prime ou décalage est visible avec période d’origine, pièce et page. « Documenté » n’efface pas l’écart et ne signifie pas « anomalie résolue ». Le jugement humain sur le résultat reste nécessaire ; aucun jugement sur un salarié, classement automatique ou logiciel de paie.

Versions optimistes et commandes sérialisées empêchent l’écrasement d’une revue concurrente. Une importation nécessite le même acteur, aperçu/hash et version encore valides. Modifier source, période, population ou mapping rend périmée la revue dépendante. Dépendances : cadrage = journal/GL/événements ; règlements = ces trois + déclaration/paiements ; congés = source congés seule. Une modification d’un paiement ne rend pas le cadrage/congés périmé. Les anciennes empreintes et métadonnées de décisions restent dans l’historique borné. Les hash sont des contrôles locaux de contenu, sans signature ni preuve inviolable.

## Références officielles

Pack **RH-CNIL-2026-10**, consultation **9 octobre 2026**. Références de protection des données, distinctes des fixtures/pièces client et des méthodes internes. Elles ne valident aucun calcul social.

- CNIL, [Les règles pour la gestion du personnel](https://www.cnil.fr/fr/les-regles-pour-la-gestion-du-personnel), 17 août 2023, section « Qui peut accéder aux données ? » : accès limité aux fonctions habilitées et actions suivies. Guide pratique, pas certification de conformité de PROBANT.
- CNIL, [Référentiel relatif aux traitements des données personnelles mis en œuvre aux fins de gestion du personnel](https://www.cnil.fr/sites/cnil/files/2023-09/referentiel_gestion_des_ressources_humaines.pdf), adopté le 21 novembre 2019, modifié le 23 mai 2022 ; pages 1–2 : champ et exclusions. Référentiel d’accompagnement à distinguer des obligations du RGPD. La gestion de paie et la revue ne donnent aucune permission de profiler un salarié.

Aucune règle légale de congés, taux social, durée légale de rétention ou seuil n’est introduit. La fixture `SYN-LEAVE-METHOD/V1`, période 2026, pack SYN-PACK18, pièce SYN-LEAVE-PROOF p. 1, est **une méthode fictive**. Ses fractions, acquis et montants ne sont pas une règle de droit. Avant usage réel : référentiel applicable à l’exercice, conventions/accords, droits assimilés et bases à documenter par sources officielles et pièces validées.

## Exemple et recette

Pack SYN-PACK18/V1, généré au 1 février 2027, exercice 2026 : déclaration de septembre 50, GL 48 → écart −2. Le journal conserve le rappel d’août d’un pseudonyme sorti le 31 août ; le paiement de septembre a une date bancaire d’octobre. Deux références identiques bloquent le payé ; les deux lignes restent visibles. Une prime et une entrée sont étayées par des événements distincts. Un congé en jours/heures reste incomparable, sans conversion.

Recette automatisée : 50/48 ; rappel après sortie ; duplication paiement ; dates bancaire/rattachement ; méthodes jours/heures et règles inconnues ; droits incohérents ; sources absentes/partielles et mapping inconnu ; droits RH absents/cross-dossier/export ; source remplacée et revue périmée ; indépendance congés ; exclusion/restauration ; refus d’identité et faux format natif ; origine/session forgée ; erreurs expurgées et limites de corps. Recette navigateur : tables, détail, clavier/Échap, mois, import/qualification, version et séparation congés, rendu mobile, montants masqués dans les captures.

## Sous-lots restant fermés

1. Sécurité RH et mappings réels validés, stockage/versionnement durable et récupération par dossier autorisé.
2. Couverture déclarative et paiements réels, ventilations et pièces, éventuel parseur natif explicitement spécifié.
3. Règles de congés réelles applicables/versionnées et bases validées ; estimation de provision seulement dans une procédure dédiée.

La livraison ne prouve ni conformité sociale, ni exhaustivité déclarative, ni conformité RGPD, ni absence d’erreur de paie.
