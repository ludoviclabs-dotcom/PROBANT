# Cadrage Clients — contrat interne 1.0.0

Date : 2026-10-07. Source : code et tests de ce lot. Validation **technique** de la règle `clients.frame@1.0.0`, sans validation d'une méthode d'audit ou d'une règle normative.

## Entrées et calcul

Trois imports distincts : GL Clients préparé en soldes de clôture, auxiliaire Clients et balance âgée de clôture. CSV ou XLSX, mapping explicite, montants signés en EUR, comptes 41, date de chaque solde égale à la clôture. Une colonne client est obligatoire dans l'auxiliaire et la balance âgée. Les signes sont convertis par le mapping, sans seuil implicite. Le GL en mouvements doit être préparé en soldes avant import ; ce lot n'effectue pas cette agrégation.

Le préparateur approuve le hash de l'aperçu calculé et stocké par le serveur. Le serveur reconstruit ensuite la population et la sélection complète avec les fonctions existantes. Aucune taille d'échantillon, population, preuve vérifiée, identité ou approbation complète provenant du navigateur n'est acceptée.

`frameClients` rapproche GL / auxiliaire par compte puis auxiliaire / balance âgée par client. Convention : gauche moins droite ; crédits négatifs. Les résidus bruts restent visibles même si le net est nul. Une clé manquante rend le rapprochement partiel, sans transformer une absence en zéro documenté. Les soldes créditeurs sont à justifier, sans qualification automatique d'erreur.

Seul cet adaptateur dispose d'un contexte réel. Les autres calculs synthétiques, la dépréciation, les confirmations, le cut-off, FAE / PCA, le cycle Clients complet et la projection globale restent fermés.

## Décisions et versions

Chaque commande requiert une session serveur vivante et une permission d'organisation / dossier. Les permissions existantes sont utilisées : read, upload, review, export. Les rôles du JSON et les approbations fabriquées sont refusés par les schémas stricts. La vérification d'origine et du jeton CSRF reste celle du socle OIDC.

Un verrou PostgreSQL sur le dossier sérialise remplacement de source et commande. La comparaison de version, l'ajout de la nouvelle version et l'accusé d'idempotence sont dans la même transaction. Une panne avant validation annule l'ensemble. Un rejeu conserve le premier résultat ; la même clé avec un contenu différent est refusée. L'autorisation et l'expiration sont revérifiées avant le rejeu et en fin de transaction.

Les versions, octets sources, approbations d'import et accusés sont protégés contre UPDATE / DELETE. Une révision remet à zéro résultat, population, sélection, conclusion, preuves et décision ; l'ancienne version et son historique restent consultables. Les versions antérieures ne sont pas réécrites lorsque la révision est verrouillée.

Une source approuvée remplacée invalide les commandes suivantes de la feuille concernée. La lecture et le téléchargement historiques restent autorisés dans le même périmètre. La nouvelle source ne peut pas réactiver silencieusement une ancienne approbation. Une reprise passe par une nouvelle révision.

Une exception ou un cadrage incomplet produit une note bloquante. La soumission porte le hash du contenu ; l'approbation nécessite une autre identité autorisée, un hash inchangé et le traitement documenté des notes bloquantes. Le verrouillage conserve le hash approuvé.

## Stockage et activation

Connexion PostgreSQL existante : `lib/db/client.ts`, avec les sessions et les dossiers existants. Les petits originaux tabulaires de ce parcours sont conservés dans PostgreSQL, avec leur empreinte et les métadonnées du parseur. Ils ne sont pas stockés dans une Map ni dans un journal navigateur. Ce choix permet l'atomicité du stockage de l'aperçu et de ses octets. Le stockage objet et la file d'ingestion existants restent utilisés par leurs parcours historiques ; aucun nouveau fournisseur n'est requis par ce cadrage borné.

Les routes spécialisées sont sous `/api/workpapers/clients` ; le point d'entrée générique des moteurs reste fermé. La page `/clients-framing` réutilise `WorkpaperPanel`. Elle affiche l'identité serveur, l'état de sauvegarde, révision / version, et une comparaison de conflit avec conservation explicite du brouillon. Une sauvegarde n'est annoncée qu'après une réponse serveur positive. Une panne réseau conserve la clé et le contenu pour un rejeu.

Flag serveur de recette : `PROBANT_CLIENTS_DURABLE=disposable`. Absence du flag : 503. `VERCEL_ENV=production` : 503 même si le flag est présent. Aucun changement de variables, migration ou déploiement production n'est inclus.


Les fichiers de cette recette sont limités à 3 Mio, et les aperçus / états sont bornés avant validation transactionnelle. L'interface reçoit les cinq premières lignes des imports avec le total réel de lignes. Cette limite est choisie sous la [limite Vercel de 4,5 MB](https://vercel.com/docs/functions/limitations#request-body-size), vérifiée le 2026-10-07. Les historiques très volumineux et leur pagination ne font pas partie de la recette de ce lot.
