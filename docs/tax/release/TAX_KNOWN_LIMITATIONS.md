# TAX-10 — Limitations connues

État au 2026-08-17.

## Couverture fiscale

- Le registre officiel embarqué couvre les règles et formulaires publiés pour 2026. Les fixtures 2025 et 2027 vérifient le blocage/versionnement ; elles ne rendent pas ces millésimes calculables.
- Les versions de formulaires 2026 sont encore marquées `review_required`. Cette réserve est visible au point de lecture du cockpit, dans les constats, les sources, la note et la limitation `review_required_source` du manifeste.
- La couverture normative TVA 2026 devient partielle à compter du 1er septembre 2026 lorsqu'aucune version successeur n'est publiée. Le moteur bloque les contrôles concernés au lieu d'utiliser une version voisine.
- La CA12 publiée ne donne pas toutes les bases HT nécessaires à une ventilation complète par taux.
- Les taux TVA sont observés dans le dossier, jamais qualifiés automatiquement de taux légaux.
- L'intégration fiscale, les groupes TVA, Pilier 2, crédits d'impôt complexes, intérêts et pénalités restent hors périmètre ou bloqués.
- Aucune pénalité n'est calculée faute de données et règles suffisantes.

## Preuve et documents

- L'inventaire de factures permet de constater une pièce absente, mais ne confère plus le niveau de preuve « FEC + déclaration + facture » à la déduction concernée.
- Les 15 snapshots documentaires du corpus portent le hash exact de leur fichier synthétique, mais les golden cases alimentent directement les objets canoniques : la chaîne parseur→normalisation→snapshot n'est pas une oracle de cette gate.
- Le justificatif rattaché dans le cockpit de démonstration est haché et manifesté en mémoire ; ses octets ne sont pas persistés ni récupérables après rechargement.
- Une pièce absente de PROBANT ne signifie pas qu'elle n'existe pas ou qu'elle n'a pas été produite à l'administration.
- Le PDF fiscal est un PDF standard. Aucun profil PDF/A n'est annoncé tant qu'un validateur machine n'a pas produit une preuve enregistrée.
- Les exports n'émettent aucun avis juridique et n'emploient aucun label « conforme » sans périmètre.

## E2E et infrastructure

- Le parcours TAX-10 entièrement exécuté utilise le dossier fiscal synthétique en mémoire et un dépôt local de balance. Il valide la chaîne UI→moteurs→revue→preuve→exports, mais pas les services externes.
- Le parcours durable FEC avec PostgreSQL, stockage objet, file SQS et identité OIDC reste conditionné par `PROBANT_E2E_PERSISTENT=1` et n'a pas été exécuté dans cette gate locale.
- Les migrations et triggers sont validés statiquement par `db:check` et les tests, mais n'ont pas été appliqués puis attaqués sur une instance PostgreSQL éphémère pendant cette gate.
- Le bouton « Nouveau dossier » conduit à l'espace de dépôt ; la création persistante complète n'est pas revendiquée sans infrastructure.
- Le formulaire d'onboarding actuel est un paramétrage de démonstration en `sessionStorage`. Le profil fiscal utilisé par les moteurs est, lui, la fixture canonique confirmée. La continuité persistante entre ces deux écrans reste à implémenter.

## QA et dépendances

- Une dette de contraste `serious` préexistante subsiste dans le chrome sombre partagé ; elle est gelée par la baseline Axe et aucune violation critique n'est admise.
- Les 21 sorties golden sont figées par hash complet. Les propriétés génératives restent toutefois bornées : la permutation FEC principale est une inversion du cas nominal, sans campagne multi-tailles aléatoire.
- Huit avertissements lint préexistants sont émis par le build de production ; aucun ne provient des fichiers TAX-09/TAX-10 ajoutés.
- `npm ci` signale deux vulnérabilités `moderate` dans le lockfile existant ; elles doivent être traitées dans la politique de dépendances, sans contournement dans le moteur fiscal.
