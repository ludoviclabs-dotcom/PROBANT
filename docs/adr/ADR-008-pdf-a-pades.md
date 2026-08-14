# ADR-008 — PDF d'archivage et signatures PAdES

- Statut : accepté pour la stratégie; génération d'archivage et signature non implémentées
- Date : 2026-08-14
- Décideurs : équipe PROBANT

## Contexte

PROBANT produit aujourd'hui un HTML accessible et imprimable, puis un PDF standard dérivé de ce HTML. Une déclaration d'archivage ou de signature a une portée probatoire supérieure à une simple réussite de génération : elle doit être établie par une validation enregistrée. Le générateur actuel n'ajoute donc aucun label de conformité d'archivage.

Les parties ISO 19005 actuellement pertinentes sont répertoriées par [ISO/TC 171/SC 2](https://www.iso.org/committee/53674/x/catalogue/) et veraPDF fournit des profils formels de validation pour PDF/A-1, PDF/A-2, PDF/A-3 et PDF/A-4 ([documentation de validation veraPDF](https://docs.verapdf.org/validation/)).

## Profils PDF/A comparés

| Profil | Base | Atouts | Limites pour PROBANT | Décision |
|---|---|---|---|---|
| PDF/A-1a / 1b | PDF 1.4, ISO 19005-1:2005 | Très diffusé; `1b` préserve l'apparence, `1a` ajoute des exigences de structure | Contraintes anciennes; pas de transparence moderne; `1b` ne garantit pas l'accessibilité sémantique | Non retenu pour les nouveaux exports |
| PDF/A-2a / 2u / 2b | PDF 1.7, ISO 19005-2:2011 | Transparence, couches, signatures; `2u` impose une correspondance Unicode fiable; maturité outillage | `2u` ne remplace pas une validation d'accessibilité; les pièces jointes arbitraires ne font pas partie du profil | **Cible initiale : PDF/A-2u** |
| PDF/A-3a / 3u / 3b | PDF 1.7, [ISO 19005-3:2012](https://www.iso.org/standard/57229.html) | Autorise toute pièce jointe embarquée | Accroît la surface de sécurité et les ambiguïtés de conservation; PROBANT remet déjà les artefacts séparément avec manifeste | Écarté sauf besoin réglementaire explicite |
| PDF/A-4 / 4e / 4f | PDF 2.0, ISO 19005-4:2020 | Base PDF moderne; `4f` permet les fichiers embarqués, `4e` vise l'ingénierie | Écosystème de lecture plus récent; ISO/DIS 19005-4.2 est en cours d'évolution | À réévaluer après retour d'exploitation |

Le choix PDF/A-2u privilégie l'extraction textuelle Unicode et une compatibilité opérationnelle large. L'HTML reste la référence accessible. Un futur besoin de PDF accessible devra ajouter une cible PDF/UA et ses validations propres; il ne sera pas déduit du seul succès PDF/A.

## Pipeline décidé

1. Construire le report model et le JSON canonique.
2. Générer l'HTML accessible/imprimable.
3. Dériver un PDF standard depuis cet HTML.
4. Dans une phase de conversion dédiée, produire un candidat PDF/A-2u avec polices incorporées, profil colorimétrique et métadonnées XMP conformes.
5. Exécuter veraPDF avec un profil épinglé (`verapdf --flavour 2u fichier.pdf`). La CLI expose les profils disponibles et la sélection explicite ([guide CLI veraPDF](https://docs.verapdf.org/cli/validation/)).
6. Conserver le rapport XML/JSON du validateur, sa version, son profil, sa date et son hash.
7. Marquer `validation.pdfA.status = valid` et présenter le label PDF/A-2u uniquement si le résultat machine est conforme. Un échec produit `invalid`; l'absence de run reste `not_validated`.
8. Après une signature, relancer la validation PDF/A et la validation PAdES sur l'artefact signé; conserver séparément les artefacts non signé et signé.

La validation veraPDF couvre les exigences vérifiables par machine; elle ne remplace ni la revue visuelle, ni le contrôle d'accessibilité, ni la politique de conservation.

## PAdES

La signature PDF s'appuiera sur [ETSI EN 319 142-1 V1.2.1](https://www.etsi.org/deliver/etsi_en/319100_319199/31914201/01.02.01_60/en_31914201v010201p.pdf) pour les briques et signatures baseline, et sur [ETSI EN 319 142-2 V1.2.1](https://www.etsi.org/deliver/etsi_en/319100_319199/31914202/01.02.01_60/en_31914202v010201p.pdf) si un profil additionnel est requis.

Profils envisagés :

- PAdES-B-B : signature de base avec certificat; insuffisante seule pour une preuve durable;
- PAdES-B-T : ajoute un horodatage de signature;
- PAdES-B-LT : incorpore les données nécessaires à la validation à long terme, notamment chaîne de certificats et informations de révocation;
- PAdES-B-LTA : ajoute des horodatages d'archive renouvelables pour prolonger la validation au-delà de l'obsolescence des primitives.

La cible de remise est B-LT; B-LTA est la cible d'archivage lorsque la politique de conservation impose le renouvellement des preuves. Le niveau exact dépendra du cas d'usage juridique, de l'identité du signataire et de la durée de conservation.

## Service de signature, certificats et horodatage

PROBANT n'implémentera aucune primitive cryptographique, construction CMS, gestion de clé privée ou validation de certificat maison. Un service de signature qualifié sera sélectionné derrière une interface fournisseur :

- clés privées protégées par HSM/QSCD ou service distant approprié;
- certificat X.509 adapté à la personne ou au sceau de l'organisation;
- consentement et authentification du signataire selon le niveau retenu;
- horodatage par une TSA conforme à la politique applicable. Le protocole de référence est [RFC 3161](https://www.rfc-editor.org/info/rfc3161/) et les exigences de politique/sécurité du prestataire sont décrites par [ETSI EN 319 421](https://www.etsi.org/deliver/etsi_en/319400_319499/319421/01.03.01_30/en_319421v010301v.pdf);
- récupération OCSP/CRL et chaîne de certificats pour B-LT;
- journal d'audit fournisseur, identifiant de transaction et rapport de validation conservés comme artefacts hashés.

Le choix entre signature d'une personne et sceau d'une personne morale sera explicite. Si un niveau qualifié eIDAS est requis, le fournisseur, le certificat et le dispositif devront satisfaire le [règlement (UE) n° 910/2014](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32014R0910) dans sa version applicable; l'application ne le déduira pas du seul format PAdES.

## Validation PAdES

Le validateur devra contrôler au minimum l'intégrité du ByteRange PDF, le profil ETSI annoncé, la chaîne de certificats au temps de signature, la révocation, les jetons d'horodatage, les données DSS/VRI et les algorithmes autorisés par la politique. Le résultat, les données de diagnostic, la version du validateur et la date de validation sont conservés et hashés.

## Conséquences

- Les boutons et manifestes parlent de « PDF » tant que veraPDF n'a pas réussi.
- La CI actuelle vérifie que le PDF est généré depuis l'HTML, lisible et hashé; elle ne prétend pas valider PDF/A.
- Une future CI d'archivage installera une version épinglée de veraPDF et publiera son rapport comme artefact.
- Les signatures restent un service externe versionné et auditable; aucune clé privée ne transite dans le code applicatif.

